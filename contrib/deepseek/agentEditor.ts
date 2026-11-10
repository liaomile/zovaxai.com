/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zovax AI. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

/**
 * 原生 Agent 主界面（深度 fork 的脸；docs/DEEP-FORK-UI.md 定版形态）：
 *
 * 不是嵌入、不是网页、没有降级链 —— 这是 workbench 自己的 EditorPane，
 * 用原生 DOM 控件渲染 agent 界面，与编辑器同一进程、同一套主题（深/浅/高对比度自动成立）。
 * 启动时由 agentLayout 直接打开它占满窗口，它就是首页、就是主界面。
 *
 * 数据面：只依赖 services/deepseek 的 IDeepSeekAgentService（ACP 驱动，M2 已接通）：
 *   - status / onDidChangeStatus：'disconnected' | 'connecting' | 'ready' | 'running'
 *   - messages / onDidChangeMessages：IAgentUiMessage[]（见下方结构定义，与 service 的消息模型对齐）
 *   - pendingApproval / onDidChangeApproval：{ id, title, detail } | undefined
 *   - connect() / sendPrompt(text) / respondToApproval(id, approved)
 * DSH 以 ACP 子进程由 IDE 托管（deepseekAcpHost），本界面不需要 3080 网页服务。
 * ACP 未连通时，状态就写在本界面状态行里 —— 那是产品状态的一部分，不是错误页、更不是降级。
 *
 * 同步位置：fork 的 src/vs/workbench/contrib/deepseek/browser/agentEditor.ts，
 * 由 deepseek.contribution 与 agentLayout.ts 同批 import（复用 PATCHES #1）。
 */

import { $, append, clearNode } from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { EditorExtensions } from 'vs/workbench/common/editor';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { IDeepSeekAgentService } from 'vs/workbench/services/deepseek/common/deepseekAgentService';

export const AGENT_EDITOR_ID = 'zovax.agentEditor';
export const AGENT_HOME_URI = URI.parse('zovax-agent:/home');

/** 与 Agent service 消息模型对齐的最小结构（service 侧同名同形即可） */
export interface IAgentUiMessage {
	readonly id: string;
	readonly role: 'user' | 'assistant' | 'thought' | 'tool';
	readonly text: string;
	/** tool 消息可带标题（如 “Write IP_ASSET_INVENTORY.md”）与状态 */
	readonly title?: string;
	readonly state?: 'running' | 'done' | 'error';
}

export class AgentEditorInput extends EditorInput {
	static readonly ID = 'zovax.agentEditorInput';
	override readonly resource = AGENT_HOME_URI;

	override get typeId(): string {
		return AgentEditorInput.ID;
	}

	override getName(): string {
		return 'Agent';
	}

	override matches(other: EditorInput): boolean {
		return other instanceof AgentEditorInput;
	}
}

const STYLES = `
.zovax-agent-root { display:flex; flex-direction:column; height:100%; color:var(--vscode-foreground); background:var(--vscode-editor-background); }
.zovax-agent-stream { flex:1; overflow-y:auto; padding:24px 0 12px; }
.zovax-agent-col { max-width:860px; margin:0 auto; padding:0 24px; display:flex; flex-direction:column; gap:14px; }
.zovax-msg { max-width:82%; padding:10px 14px; border-radius:12px; line-height:1.55; white-space:pre-wrap; word-break:break-word; font-size:13.5px; }
.zovax-msg.user { align-self:flex-end; background:var(--vscode-input-background); border:1px solid var(--vscode-input-border, transparent); }
.zovax-msg.assistant { align-self:flex-start; background:transparent; padding-left:2px; }
.zovax-msg.thought { align-self:flex-start; color:var(--vscode-descriptionForeground); font-size:12.5px; border-left:2px solid var(--vscode-panel-border); border-radius:0; padding:4px 10px; }
.zovax-tool { align-self:flex-start; width:82%; border:1px solid var(--vscode-panel-border); border-radius:10px; padding:8px 12px; font-size:12.5px; }
.zovax-tool .t { font-weight:600; margin-bottom:2px; }
.zovax-tool.error { border-color:var(--vscode-inputValidation-errorBorder); }
.zovax-approval { align-self:stretch; border:1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-panel-border)); border-radius:10px; padding:12px 14px; }
.zovax-approval .row { display:flex; gap:8px; margin-top:8px; }
.zovax-btn { padding:5px 14px; border-radius:6px; border:1px solid var(--vscode-button-border, transparent); background:var(--vscode-button-background); color:var(--vscode-button-foreground); cursor:pointer; }
.zovax-btn.secondary { background:var(--vscode-button-secondaryBackground); color:var(--vscode-button-secondaryForeground); }
.zovax-composer { border-top:1px solid var(--vscode-panel-border); padding:12px 24px 16px; }
.zovax-composer .box { max-width:860px; margin:0 auto; border:1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius:12px; background:var(--vscode-input-background); padding:10px 12px; }
.zovax-composer textarea { width:100%; resize:none; border:none; outline:none; background:transparent; color:var(--vscode-input-foreground); font:inherit; min-height:44px; }
.zovax-status { max-width:860px; margin:8px auto 0; display:flex; justify-content:space-between; color:var(--vscode-descriptionForeground); font-size:12px; }
`;

export class AgentEditorPane extends EditorPane {
	static readonly ID = AGENT_EDITOR_ID;

	private root!: HTMLElement;
	private streamCol!: HTMLElement;
	private approvalHost!: HTMLElement;
	private input!: HTMLTextAreaElement;
	private statusLine!: HTMLElement;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IDeepSeekAgentService private readonly agentService: IDeepSeekAgentService,
	) {
		super(AgentEditorPane.ID, instantiationService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.root = append(parent, $('div.zovax-agent-root'));
		append(this.root, $('style')).textContent = STYLES;

		const stream = append(this.root, $('div.zovax-agent-stream'));
		this.streamCol = append(stream, $('div.zovax-agent-col'));
		this.approvalHost = append(this.streamCol, $('div'));

		const composer = append(this.root, $('div.zovax-composer'));
		const box = append(composer, $('div.box'));
		this.input = append(box, $('textarea')) as HTMLTextAreaElement;
		this.input.placeholder = '问点什么…';
		this.input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				void this.send();
			}
		});
		this.statusLine = append(composer, $('div.zovax-status'));

		this._register(this.agentService.onDidChangeMessages(() => this.render()));
		this._register(this.agentService.onDidChangeStatus(() => this.render()));
		this._register(this.agentService.onDidChangeApproval(() => this.render()));
		void this.agentService.connect().catch(() => undefined);
		this.render();
	}

	override async setInput(input: EditorInput, options: unknown, context: IEditorOpenContext, token: unknown): Promise<void> {
		await super.setInput(input, options as never, context, token as never);
		this.render();
	}

	private async send(): Promise<void> {
		const text = this.input.value.trim();
		if (!text) {
			return;
		}
		this.input.value = '';
		await this.agentService.sendPrompt(text);
	}

	private render(): void {
		if (!this.streamCol) {
			return;
		}
		// 消息流（审批卡单独挂在流末尾的主机节点上，避免整流重绘时丢失）
		const approval = this.approvalHost;
		clearNode(this.streamCol);
		for (const msg of this.agentService.messages as readonly IAgentUiMessage[]) {
			if (msg.role === 'tool') {
				const card = append(this.streamCol, $(`div.zovax-tool${msg.state === 'error' ? '.error' : ''}`));
				append(card, $('div.t')).textContent = msg.title ?? '工具调用';
				append(card, $('div')).textContent = msg.text;
			} else {
				const bubble = append(this.streamCol, $(`div.zovax-msg.${msg.role}`));
				bubble.textContent = msg.text;
			}
		}
		this.streamCol.appendChild(approval);
		clearNode(approval);
		const pending = this.agentService.pendingApproval;
		if (pending) {
			const card = append(approval, $('div.zovax-approval'));
			append(card, $('div')).textContent = `待审批：${pending.title}`;
			if (pending.detail) {
				append(card, $('div')).textContent = pending.detail;
			}
			const row = append(card, $('div.row'));
			const allow = append(row, $('button.zovax-btn')) as HTMLButtonElement;
			allow.textContent = '允许';
			allow.addEventListener('click', () => void this.agentService.respondToApproval(pending.id, true));
			const deny = append(row, $('button.zovax-btn.secondary')) as HTMLButtonElement;
			deny.textContent = '拒绝';
			deny.addEventListener('click', () => void this.agentService.respondToApproval(pending.id, false));
		}
		const statusText = {
			disconnected: '未连接',
			connecting: '连接中…',
			ready: '已就绪',
			running: '运行中…',
		}[this.agentService.status] ?? this.agentService.status;
		this.statusLine.textContent = `Agent · DeepSeek · ${statusText}`;
		this.streamCol.parentElement?.scrollTo({ top: this.streamCol.parentElement.scrollHeight });
	}
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(AgentEditorPane, AgentEditorPane.ID, 'Agent'),
	[new SyncDescriptor(AgentEditorInput)],
);

class AgentEditorRegistration extends Disposable implements IWorkbenchContribution {
	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
	) {
		super();
		this._register(editorResolverService.registerEditor(
			'zovax-agent:*',
			{ id: AgentEditorPane.ID, label: 'Agent', priority: RegisteredEditorPriority.exclusive },
			{ singlePerResource: true },
			{
				createEditorInput: ({ resource }) => ({ editor: new AgentEditorInput() }),
			},
		));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.WorkbenchContributions)
	.registerWorkbenchContribution(AgentEditorRegistration, LifecyclePhase.Starting);
