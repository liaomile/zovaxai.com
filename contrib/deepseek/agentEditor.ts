/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zovax AI. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

/**
 * 原生 Agent 主界面 v3（深度 fork 的脸；全面接线版）：
 *
 * workbench 原生 EditorPane（非嵌入、非网页），与编辑器同进程、同主题。
 * 本版起直接消费**真实的** IDeepSeekAgentService 事件契约（services/deepseek/common，
 * 与 deepseekTypes 的 DeepSeekSessionUpdate 对齐），不再有任何本地桩/演示数据：
 *   - 会话：listSessions / createSession（ACP session/new），左栏列表/新建/切换；
 *   - 对话：sendPrompt 发起，messageDelta/reasoningDelta 流式拼装气泡与思考区；
 *   - 工具：toolCall 事件成卡，detail 中的 diff 按 +/- 红绿着色，状态实时更新；
 *   - 计划：planUpdate 驱动输入区上方的计划条（ACP 的 plan 语义更新）；
 *   - 审批：approvalRequest 成卡，允许/拒绝经 answerApproval 回到 ACP 权限应答；
 *   - 功能键：权限模式（询问/全权——全权时审批自动放行并在流内留痕）、停止（cancel）、
 *     引用当前文件（把 @路径 插入输入框）、模型与连接状态（状态行，取自真实会话/服务）；
 *   - 连接状态：service.acpAttached / onAcpAttached —— 未接入时状态行明示“未连接”，
 *     发送会得到服务侧的可见错误，绝不假装回复。
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
import { DeepSeekSessionUpdate, IDeepSeekSession } from 'vs/workbench/contrib/deepseek/common/deepseekTypes';

export const AGENT_EDITOR_ID = 'zovax.agentEditor';
export const AGENT_HOME_URI = URI.parse('zovax-agent:/home');

interface IUiMessage {
	id: string;
	role: 'user' | 'assistant' | 'thought' | 'tool';
	text: string;
	title?: string;
	state?: 'running' | 'done' | 'error';
}

interface ISessionUiState {
	messages: IUiMessage[];
	plan: { title: string; status: 'pending' | 'inProgress' | 'completed' }[];
	running: boolean;
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
.zovax-rail-note { padding:8px 10px; font-size:12px; color:var(--vscode-descriptionForeground); line-height:1.5; }
.zovax-main { flex:1; display:flex; flex-direction:column; min-width:0; }
.zovax-agent-stream { flex:1; overflow-y:auto; padding:24px 0 12px; }
.zovax-agent-col { max-width:860px; margin:0 auto; padding:0 24px; display:flex; flex-direction:column; gap:14px; }
.zovax-empty { margin:auto; text-align:center; color:var(--vscode-descriptionForeground); }
.zovax-empty .brand { font-size:22px; font-weight:600; color:var(--vscode-foreground); margin-bottom:6px; }
.zovax-msg { max-width:82%; padding:10px 14px; border-radius:12px; line-height:1.55; white-space:pre-wrap; word-break:break-word; font-size:13.5px; }
.zovax-msg.user { align-self:flex-end; background:var(--vscode-input-background); border:1px solid var(--vscode-input-border, transparent); }
.zovax-msg.assistant { align-self:flex-start; background:transparent; padding-left:2px; }
.zovax-msg.thought { align-self:flex-start; color:var(--vscode-descriptionForeground); font-size:12.5px; border-left:2px solid var(--vscode-panel-border); border-radius:0; padding:4px 10px; }
.zovax-tool { align-self:flex-start; width:82%; border:1px solid var(--vscode-panel-border); border-radius:10px; padding:8px 12px; font-size:12.5px; }
.zovax-tool .t { font-weight:600; margin-bottom:2px; }
.zovax-tool.error { border-color:var(--vscode-inputValidation-errorBorder); }
.zovax-tool pre { margin:4px 0 0; font-family:var(--vscode-editor-font-family); font-size:12px; overflow-x:auto; white-space:pre-wrap; }
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
.zovax-actions { max-width:860px; margin:8px auto 0; display:flex; gap:8px; align-items:center; }
.zovax-chipbtn { border:1px solid var(--vscode-panel-border); background:transparent; color:var(--vscode-foreground); border-radius:999px; padding:3px 12px; font-size:12px; cursor:pointer; }
.zovax-chipbtn.warn { color:var(--vscode-errorForeground); }
.zovax-status { margin-left:auto; color:var(--vscode-descriptionForeground); font-size:12px; }
`;

let messageSeq = 0;

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
	private permBtn!: HTMLButtonElement;

	private sessions: IDeepSeekSession[] = [];
	private activeSessionId: string | undefined;
	private readonly sessionUi = new Map<string, ISessionUiState>();
	private pendingApproval: { requestId: string; title: string; detail?: string } | undefined;
	private permissionMode: 'ask' | 'auto' = 'ask';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IDeepSeekAgentService private readonly agentService: IDeepSeekAgentService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super(AgentEditorPane.ID, instantiationService);
	}

	private ui(sessionId: string): ISessionUiState {
		let state = this.sessionUi.get(sessionId);
		if (!state) {
			state = { messages: [], plan: [], running: false };
			this.sessionUi.set(sessionId, state);
		}
		return state;
	}

	private get activeUi(): ISessionUiState | undefined {
		return this.activeSessionId ? this.ui(this.activeSessionId) : undefined;
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
		newBtn.addEventListener('click', () => void this.newSession());
		this.railList = append(rail, $('div.zovax-rail-list'));

		// 右：主列
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
		// 功能键行：权限模式 / 引用当前文件 / 停止 / 状态
		const actions = append(composer, $('div.zovax-actions'));
		this.permBtn = append(actions, $('button.zovax-chipbtn')) as HTMLButtonElement;
		this.permBtn.addEventListener('click', () => {
			this.permissionMode = this.permissionMode === 'ask' ? 'auto' : 'ask';
			this.renderActions();
		});
		const attachBtn = append(actions, $('button.zovax-chipbtn')) as HTMLButtonElement;
		attachBtn.textContent = '引用当前文件';
		attachBtn.addEventListener('click', () => {
			const resource = this.editorService.activeEditor?.resource;
			if (resource) {
				this.input.value += `${this.input.value && !this.input.value.endsWith(' ') ? ' ' : ''}@${resource.fsPath} `;
				this.input.focus();
			}
		});
		this.stopBtn = append(actions, $('button.zovax-chipbtn.warn')) as HTMLButtonElement;
		this.stopBtn.textContent = '■ 停止';
		this.stopBtn.addEventListener('click', () => {
			if (this.activeSessionId) {
				void this.agentService.cancel(this.activeSessionId);
			}
		});
		this.statusLine = append(actions, $('span.zovax-status'));

		this._register(this.agentService.onSessionUpdate((update) => this.handleUpdate(update)));
		this._register(this.agentService.onAcpAttached(() => void this.refreshSessions()));
		this._register(this.editorService.onDidActiveEditorChange(() => this.renderActions()));
		if (this.agentService.acpAttached) {
			void this.refreshSessions();
		}
		this.render();
	}

	override async setInput(input: EditorInput, options: unknown, context: IEditorOpenContext, token: unknown): Promise<void> {
		await super.setInput(input, options as never, context, token as never);
		this.render();
	}

	private async refreshSessions(): Promise<void> {
		try {
			this.sessions = await this.agentService.listSessions();
			if (this.sessions.length === 0) {
				const created = await this.agentService.createSession();
				this.sessions = [created];
			}
			if (!this.activeSessionId || !this.sessions.some((s) => s.id === this.activeSessionId)) {
				this.activeSessionId = this.sessions[0]?.id;
			}
		} catch (error) {
			this.pushSystemError(error instanceof Error ? error.message : String(error));
		}
		this.render();
	}

	private async newSession(): Promise<void> {
		try {
			const created = await this.agentService.createSession();
			this.sessions = [...this.sessions, created];
			this.activeSessionId = created.id;
		} catch (error) {
			this.pushSystemError(error instanceof Error ? error.message : String(error));
		}
		this.render();
	}

	private pushSystemError(message: string): void {
		const target = this.activeUi ?? this.ui('(none)');
		if (!this.activeSessionId) {
			// 尚无会话时错误也要有落点：借一个临时桶渲染
			this.sessionUi.set('(none)', target);
		}
		target.messages.push({ id: `m${++messageSeq}`, role: 'tool', title: '连接错误', text: message, state: 'error' });
	}

	private handleUpdate(update: DeepSeekSessionUpdate): void {
		const state = this.ui(update.sessionId);
		switch (update.kind) {
			case 'messageDelta': {
				if (update.role === 'user') {
					return; // 用户气泡在发送时已本地上屏，忽略服务端回显以免重复
				}
				const last = state.messages[state.messages.length - 1];
				if (last && last.role === 'assistant' && last.state === 'running') {
					last.text += update.text;
				} else {
					state.messages.push({ id: `m${++messageSeq}`, role: 'assistant', text: update.text, state: 'running' });
				}
				break;
			}
			case 'reasoningDelta': {
				const last = state.messages[state.messages.length - 1];
				if (last && last.role === 'thought' && last.state === 'running') {
					last.text += update.text;
				} else {
					state.messages.push({ id: `m${++messageSeq}`, role: 'thought', text: update.text, state: 'running' });
				}
				break;
			}
			case 'toolCall': {
				const existing = state.messages.find((m) => m.id === `tool-${update.toolCallId}`);
				const mapped = update.status === 'completed' ? 'done' as const : update.status === 'failed' ? 'error' as const : 'running' as const;
				if (existing) {
					existing.title = update.title || existing.title;
					existing.state = mapped;
					if (update.detail) {
						existing.text = update.detail;
					}
				} else {
					state.messages.push({
						id: `tool-${update.toolCallId}`,
						role: 'tool',
						title: update.title || '工具调用',
						text: update.detail ?? '',
						state: mapped,
					});
				}
				break;
			}
			case 'planUpdate':
				state.plan = update.entries;
				break;
			case 'approvalRequest': {
				if (this.permissionMode === 'auto') {
					state.messages.push({ id: `m${++messageSeq}`, role: 'thought', text: `（全权模式自动允许）${update.title}` });
					void this.agentService.answerApproval({ requestId: update.requestId, approved: true });
				} else {
					this.pendingApproval = { requestId: update.requestId, title: update.title, detail: update.detail };
				}
				break;
			}
			case 'sessionIdle': {
				state.running = false;
				for (const m of state.messages) {
					if (m.state === 'running') {
						m.state = 'done';
					}
				}
				if (update.reason === 'error') {
					state.messages.push({ id: `m${++messageSeq}`, role: 'tool', title: '错误', text: update.message ?? '未知错误', state: 'error' });
				}
				break;
			}
		}
		if (update.sessionId === this.activeSessionId) {
			this.render();
		} else {
			this.renderRail();
		}
	}

	private async send(): Promise<void> {
		const text = this.input.value.trim();
		if (!text) {
			return;
		}
		if (!this.activeSessionId) {
			await this.refreshSessions();
			if (!this.activeSessionId) {
				return; // refreshSessions 已把错误写进流里
			}
		}
		const sessionId = this.activeSessionId;
		const state = this.ui(sessionId);
		this.input.value = '';
		state.messages.push({ id: `m${++messageSeq}`, role: 'user', text });
		state.running = true;
		this.render();
		await this.agentService.sendPrompt(sessionId, text);
	}

	private render(): void {
		if (!this.streamCol) {
			return;
		}
		this.renderRail();
		const nearBottom = this.streamEl.scrollHeight - this.streamEl.scrollTop - this.streamEl.clientHeight < 120;
		const approval = this.approvalHost;
		clearNode(this.streamCol);
		const state = this.activeUi;
		const messages = state?.messages ?? [];
		if (messages.length === 0) {
			const empty = append(this.streamCol, $('div.zovax-empty'));
			append(empty, $('div.brand')).textContent = 'ZovaX Agent';
			append(empty, $('div')).textContent = this.agentService.acpAttached
				? 'DSH 大脑已连接 —— 直接说你要做什么。'
				: '正在等待 DSH 大脑接入（ACP）…未连接时发送会明确报错，不会假装回复。';
		}
		for (const msg of messages) {
			if (msg.role === 'tool') {
				const card = append(this.streamCol, $(`div.zovax-tool${msg.state === 'error' ? '.error' : ''}`));
				append(card, $('div.t')).textContent = msg.title ?? '工具调用';
				if (msg.text) {
					if (msg.text.includes('\n+') || msg.text.includes('\n-') || msg.text.startsWith('+') || msg.text.startsWith('-')) {
						const pre = append(card, $('pre'));
						for (const line of msg.text.split('\n')) {
							const span = append(pre, $('span' + (line.startsWith('+') ? '.add' : line.startsWith('-') ? '.del' : '')));
							span.textContent = line + '\n';
						}
					} else {
						append(card, $('div')).textContent = msg.text;
					}
				}
			} else {
				const bubble = append(this.streamCol, $(`div.zovax-msg.${msg.role}`));
				bubble.textContent = msg.text;
			}
		}
		this.streamCol.appendChild(approval);
		clearNode(approval);
		if (this.pendingApproval) {
			const pending = this.pendingApproval;
			const card = append(approval, $('div.zovax-approval'));
			append(card, $('div')).textContent = `待审批：${pending.title}`;
			if (pending.detail) {
				append(card, $('div')).textContent = pending.detail;
			}
			const row = append(card, $('div.row'));
			const allow = append(row, $('button.zovax-btn')) as HTMLButtonElement;
			allow.textContent = '允许';
			allow.addEventListener('click', () => {
				this.pendingApproval = undefined;
				void this.agentService.answerApproval({ requestId: pending.requestId, approved: true });
				this.render();
			});
			const deny = append(row, $('button.zovax-btn.secondary')) as HTMLButtonElement;
			deny.textContent = '拒绝';
			deny.addEventListener('click', () => {
				this.pendingApproval = undefined;
				void this.agentService.answerApproval({ requestId: pending.requestId, approved: false });
				this.render();
			});
		}
		if (nearBottom) {
			this.streamEl.scrollTop = this.streamEl.scrollHeight;
		}
		this.renderPlan();
		this.renderActions();
	}

	private renderRail(): void {
		clearNode(this.railList);
		if (!this.agentService.acpAttached) {
			append(this.railList, $('div.zovax-rail-note')).textContent = 'DSH 未连接：配置 deepseek.acpCommand 并重启后，会话将在这里出现。';
			return;
		}
		for (const s of this.sessions) {
			const item = append(this.railList, $(`div.zovax-session${s.id === this.activeSessionId ? '.active' : ''}`));
			item.textContent = s.title || '未命名会话';
			item.addEventListener('click', () => {
				this.activeSessionId = s.id;
				this.render();
			});
		}
	}

	private renderPlan(): void {
		clearNode(this.planHost);
		const plan = this.activeUi?.plan;
		if (!plan || plan.length === 0) {
			return;
		}
		const card = append(this.planHost, $('div.zovax-plan'));
		append(card, $('div.ph')).textContent = '计划';
		for (const item of plan) {
			const row = append(card, $(`div.pi${item.status === 'completed' ? '.done' : item.status === 'inProgress' ? '.active' : ''}`));
			append(row, $('span')).textContent = item.status === 'completed' ? '☑' : item.status === 'inProgress' ? '◉' : '☐';
			append(row, $('span')).textContent = item.title;
		}
	}

	private renderActions(): void {
		if (!this.statusLine) {
			return;
		}
		this.permBtn.textContent = this.permissionMode === 'ask' ? '权限：询问' : '权限：全权';
		const running = this.activeUi?.running ?? false;
		this.stopBtn.style.display = running ? '' : 'none';
		const session = this.sessions.find((s) => s.id === this.activeSessionId);
		const model = session?.modelId ?? '—';
		const conn = !this.agentService.acpAttached ? '未连接' : running ? '运行中…' : '已就绪';
		const activeFile = this.editorService.activeEditor?.resource?.path.split('/').pop();
		this.statusLine.textContent = `Agent · ${model} · ${conn}${activeFile ? ` · 当前文件 ${activeFile}` : ''}`;
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
