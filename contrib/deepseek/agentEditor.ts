/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zovax AI. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

/**
 * 原生 Agent 主界面（深度 fork 的脸；docs/DEEP-FORK-UI.md 定版形态，S2 做精版）：
 *
 * workbench 原生 EditorPane（非嵌入、非网页），与编辑器同进程、同主题。
 * 布局照 DSH 界面结构：左侧会话栏（会话列表/新建/切换）＋ 主列（消息流含思考区、
 * 工具卡（diff 按 +/- 着色）、审批卡；计划/待办条；输入区含停止键与状态行）。
 *
 * 数据面（services/deepseek 的 IDeepSeekAgentService，ACP 驱动）：
 *   核心成员（必需）：status / messages / pendingApproval / onDidChangeStatus /
 *     onDidChangeMessages / onDidChangeApproval / connect() / sendPrompt(text) /
 *     respondToApproval(id, approved)
 *   做精成员（增补，service 侧补齐后自动点亮；缺失时对应区域不渲染，不报错）：
 *     sessions / activeSessionId / onDidChangeSessions / newSession() / switchSession(id)
 *     plan（{ id, text, state: 'pending'|'active'|'done' }[]）/ onDidChangePlan
 *     cancel()（运行中停止）/ modelName（状态行展示）
 * DSH 以 ACP 子进程由 IDE 托管（deepseekAcpHost），本界面不需要 3080 网页服务。
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
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IDeepSeekAgentService } from 'vs/workbench/services/deepseek/common/deepseekAgentService';

export const AGENT_EDITOR_ID = 'zovax.agentEditor';
export const AGENT_HOME_URI = URI.parse('zovax-agent:/home');

/** 与 Agent service 消息模型对齐的最小结构（service 侧同名同形即可） */
export interface IAgentUiMessage {
	readonly id: string;
	readonly role: 'user' | 'assistant' | 'thought' | 'tool';
	readonly text: string;
	/** tool 消息可带标题（如 “Write IP_ASSET_INVENTORY.md”）与状态；text 可为 diff 文本（+/- 前缀行着色） */
	readonly title?: string;
	readonly state?: 'running' | 'done' | 'error';
}

export interface IAgentUiSession {
	readonly id: string;
	readonly title: string;
}

export interface IAgentUiPlanItem {
	readonly id: string;
	readonly text: string;
	readonly state: 'pending' | 'active' | 'done';
}

/** 做精成员的结构视图（service 增补后经此读取；全部可选，缺失即不渲染对应区域） */
interface IAgentServiceExtras {
	readonly sessions?: readonly IAgentUiSession[];
	readonly activeSessionId?: string;
	readonly plan?: readonly IAgentUiPlanItem[];
	readonly modelName?: string;
	readonly onDidChangeSessions?: (listener: () => void) => { dispose(): void };
	readonly onDidChangePlan?: (listener: () => void) => { dispose(): void };
	newSession?: () => Promise<void> | void;
	switchSession?: (id: string) => Promise<void> | void;
	cancel?: () => Promise<void> | void;
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
.zovax-agent-root { display:flex; height:100%; color:var(--vscode-foreground); background:var(--vscode-editor-background); }
.zovax-rail { width:248px; flex:none; border-right:1px solid var(--vscode-panel-border); display:flex; flex-direction:column; background:var(--vscode-sideBar-background); }
.zovax-rail-head { display:flex; justify-content:space-between; align-items:center; padding:14px 14px 8px; font-size:12px; color:var(--vscode-descriptionForeground); text-transform:uppercase; letter-spacing:.04em; }
.zovax-rail-new { border:1px solid var(--vscode-panel-border); background:var(--vscode-button-secondaryBackground); color:var(--vscode-button-secondaryForeground); border-radius:6px; padding:2px 10px; cursor:pointer; text-transform:none; letter-spacing:0; }
.zovax-rail-list { flex:1; overflow-y:auto; padding:0 8px 12px; display:flex; flex-direction:column; gap:2px; }
.zovax-session { padding:8px 10px; border-radius:8px; cursor:pointer; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.zovax-session:hover { background:var(--vscode-list-hoverBackground); }
.zovax-session.active { background:var(--vscode-list-activeSelectionBackground); color:var(--vscode-list-activeSelectionForeground); }
.zovax-main { flex:1; display:flex; flex-direction:column; min-width:0; }
.zovax-agent-stream { flex:1; overflow-y:auto; padding:24px 0 12px; }
.zovax-agent-col { max-width:860px; margin:0 auto; padding:0 24px; display:flex; flex-direction:column; gap:14px; }
.zovax-empty { margin:auto; text-align:center; color:var(--vscode-descriptionForeground); }
.zovax-empty .brand { font-size:22px; font-weight:600; color:var(--vscode-foreground); margin-bottom:6px; }
.zovax-empty .hints { display:flex; gap:8px; justify-content:center; margin-top:16px; flex-wrap:wrap; }
.zovax-hint { border:1px solid var(--vscode-panel-border); border-radius:999px; padding:5px 12px; font-size:12.5px; cursor:pointer; background:transparent; color:var(--vscode-foreground); }
.zovax-msg { max-width:82%; padding:10px 14px; border-radius:12px; line-height:1.55; white-space:pre-wrap; word-break:break-word; font-size:13.5px; }
.zovax-msg.user { align-self:flex-end; background:var(--vscode-input-background); border:1px solid var(--vscode-input-border, transparent); }
.zovax-msg.assistant { align-self:flex-start; background:transparent; padding-left:2px; }
.zovax-msg.thought { align-self:flex-start; color:var(--vscode-descriptionForeground); font-size:12.5px; border-left:2px solid var(--vscode-panel-border); border-radius:0; padding:4px 10px; }
.zovax-tool { align-self:flex-start; width:82%; border:1px solid var(--vscode-panel-border); border-radius:10px; padding:8px 12px; font-size:12.5px; }
.zovax-tool .t { font-weight:600; margin-bottom:2px; }
.zovax-tool.error { border-color:var(--vscode-inputValidation-errorBorder); }
.zovax-tool pre { margin:4px 0 0; font-family:var(--vscode-editor-font-family); font-size:12px; overflow-x:auto; }
.zovax-tool .add { color:var(--vscode-gitDecoration-addedResourceForeground, #3fb950); }
.zovax-tool .del { color:var(--vscode-gitDecoration-deletedResourceForeground, #f85149); }
.zovax-approval { align-self:stretch; border:1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-panel-border)); border-radius:10px; padding:12px 14px; }
.zovax-approval .row { display:flex; gap:8px; margin-top:8px; }
.zovax-btn { padding:5px 14px; border-radius:6px; border:1px solid var(--vscode-button-border, transparent); background:var(--vscode-button-background); color:var(--vscode-button-foreground); cursor:pointer; }
.zovax-btn.secondary { background:var(--vscode-button-secondaryBackground); color:var(--vscode-button-secondaryForeground); }
.zovax-plan { max-width:860px; margin:0 auto 10px; width:calc(100% - 48px); border:1px solid var(--vscode-panel-border); border-radius:10px; padding:10px 14px; }
.zovax-plan .ph { font-size:12px; color:var(--vscode-descriptionForeground); margin-bottom:6px; }
.zovax-plan .pi { display:flex; gap:8px; font-size:13px; padding:2px 0; }
.zovax-plan .pi.done { color:var(--vscode-descriptionForeground); text-decoration:line-through; }
.zovax-plan .pi.active { font-weight:600; }
.zovax-composer { border-top:1px solid var(--vscode-panel-border); padding:12px 24px 16px; }
.zovax-composer .box { max-width:860px; margin:0 auto; border:1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius:12px; background:var(--vscode-input-background); padding:10px 12px; }
.zovax-composer textarea { width:100%; resize:none; border:none; outline:none; background:transparent; color:var(--vscode-input-foreground); font:inherit; min-height:44px; }
.zovax-status { max-width:860px; margin:8px auto 0; display:flex; justify-content:space-between; align-items:center; color:var(--vscode-descriptionForeground); font-size:12px; }
.zovax-stop { border:1px solid var(--vscode-panel-border); background:transparent; color:var(--vscode-errorForeground); border-radius:6px; padding:2px 10px; cursor:pointer; }
`;

export class AgentEditorPane extends EditorPane {
	static readonly ID = AGENT_EDITOR_ID;

	private railList!: HTMLElement;
	private streamEl!: HTMLElement;
	private streamCol!: HTMLElement;
	private approvalHost!: HTMLElement;
	private planHost!: HTMLElement;
	private input!: HTMLTextAreaElement;
	private statusLine!: HTMLElement;
	private stopBtn!: HTMLButtonElement;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IDeepSeekAgentService private readonly agentService: IDeepSeekAgentService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super(AgentEditorPane.ID, instantiationService);
	}

	private get extras(): IAgentServiceExtras {
		return this.agentService as unknown as IAgentServiceExtras;
	}

	protected override createEditor(parent: HTMLElement): void {
		const root = append(parent, $('div.zovax-agent-root'));
		append(root, $('style')).textContent = STYLES;

		// 左：会话栏
		const rail = append(root, $('div.zovax-rail'));
		const railHead = append(rail, $('div.zovax-rail-head'));
		append(railHead, $('span')).textContent = '会话';
		const newBtn = append(railHead, $('button.zovax-rail-new')) as HTMLButtonElement;
		newBtn.textContent = '＋ 新建';
		newBtn.addEventListener('click', () => void this.extras.newSession?.());
		this.railList = append(rail, $('div.zovax-rail-list'));

		// 右：主列（流 + 计划 + 输入）
		const main = append(root, $('div.zovax-main'));
		this.streamEl = append(main, $('div.zovax-agent-stream'));
		this.streamCol = append(this.streamEl, $('div.zovax-agent-col'));
		this.approvalHost = append(this.streamCol, $('div'));

		const composer = append(main, $('div.zovax-composer'));
		this.planHost = append(composer, $('div'));
		const box = append(composer, $('div.box'));
		this.input = append(box, $('textarea')) as HTMLTextAreaElement;
		this.input.placeholder = '问点什么…';
		this.input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				void this.send();
			}
		});
		const statusRow = append(composer, $('div.zovax-status'));
		this.statusLine = append(statusRow, $('span'));
		this.stopBtn = append(statusRow, $('button.zovax-stop')) as HTMLButtonElement;
		this.stopBtn.textContent = '■ 停止';
		this.stopBtn.addEventListener('click', () => void this.extras.cancel?.());

		this._register(this.agentService.onDidChangeMessages(() => this.render()));
		this._register(this.agentService.onDidChangeStatus(() => this.render()));
		this._register(this.agentService.onDidChangeApproval(() => this.render()));
		if (this.extras.onDidChangeSessions) {
			this._register(this.extras.onDidChangeSessions(() => this.render()));
		}
		if (this.extras.onDidChangePlan) {
			this._register(this.extras.onDidChangePlan(() => this.render()));
		}
		this._register(this.editorService.onDidActiveEditorChange(() => this.renderStatus()));
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
		this.renderRail();
		// 滚动纪律：仅当用户本就贴近底部时才自动跟滚，不抢用户回看的位置
		const nearBottom = this.streamEl.scrollHeight - this.streamEl.scrollTop - this.streamEl.clientHeight < 120;

		const approval = this.approvalHost;
		clearNode(this.streamCol);
		const messages = this.agentService.messages as readonly IAgentUiMessage[];
		if (messages.length === 0) {
			const empty = append(this.streamCol, $('div.zovax-empty'));
			append(empty, $('div.brand')).textContent = 'ZovaX Agent';
			append(empty, $('div')).textContent = '深度集成于 IDE 的 DeepSeek 智能体 —— 直接说你要做什么。';
			const hints = append(empty, $('div.hints'));
			for (const hint of ['审查当前文件的改动', '解释这个报错并给出修复', '给这个模块补单元测试']) {
				const chip = append(hints, $('button.zovax-hint')) as HTMLButtonElement;
				chip.textContent = hint;
				chip.addEventListener('click', () => {
					this.input.value = hint;
					this.input.focus();
				});
			}
		}
		for (const msg of messages) {
			if (msg.role === 'tool') {
				const card = append(this.streamCol, $(`div.zovax-tool${msg.state === 'error' ? '.error' : ''}`));
				append(card, $('div.t')).textContent = msg.title ?? '工具调用';
				if (msg.text.includes('\n+') || msg.text.includes('\n-') || msg.text.startsWith('+') || msg.text.startsWith('-')) {
					const pre = append(card, $('pre'));
					for (const line of msg.text.split('\n')) {
						const span = append(pre, $('span' + (line.startsWith('+') ? '.add' : line.startsWith('-') ? '.del' : '')));
						span.textContent = line + '\n';
					}
				} else {
					append(card, $('div')).textContent = msg.text;
				}
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
		if (nearBottom) {
			this.streamEl.scrollTop = this.streamEl.scrollHeight;
		}
		this.renderPlan();
		this.renderStatus();
	}

	private renderRail(): void {
		clearNode(this.railList);
		const sessions = this.extras.sessions ?? [];
		for (const s of sessions) {
			const item = append(this.railList, $(`div.zovax-session${s.id === this.extras.activeSessionId ? '.active' : ''}`));
			item.textContent = s.title || '未命名会话';
			item.addEventListener('click', () => void this.extras.switchSession?.(s.id));
		}
	}

	private renderPlan(): void {
		clearNode(this.planHost);
		const plan = this.extras.plan;
		if (!plan || plan.length === 0) {
			return;
		}
		const card = append(this.planHost, $('div.zovax-plan'));
		append(card, $('div.ph')).textContent = '计划';
		for (const item of plan) {
			const row = append(card, $(`div.pi${item.state === 'done' ? '.done' : item.state === 'active' ? '.active' : ''}`));
			append(row, $('span')).textContent = item.state === 'done' ? '☑' : item.state === 'active' ? '◉' : '☐';
			append(row, $('span')).textContent = item.text;
		}
	}

	private renderStatus(): void {
		if (!this.statusLine) {
			return;
		}
		const statusText = {
			disconnected: '未连接',
			connecting: '连接中…',
			ready: '已就绪',
			running: '运行中…',
		}[this.agentService.status] ?? this.agentService.status;
		const model = this.extras.modelName ?? 'DeepSeek';
		const activeFile = this.editorService.activeEditor?.resource?.path.split('/').pop();
		this.statusLine.textContent = `Agent · ${model} · ${statusText}${activeFile ? ` · 当前文件 ${activeFile}` : ''}`;
		this.stopBtn.style.display = this.agentService.status === 'running' && this.extras.cancel ? '' : 'none';
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
