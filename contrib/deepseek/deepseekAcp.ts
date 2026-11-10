/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zovax AI. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

/**
 * ACP（Agent Client Protocol）客户端：以 JSON-RPC 2.0 / ndjson 驱动 DSH 的 ACP 服务端
 *（启动方式：`pnpm dsh --profile acp`，stdio 通道；契约见 DSH packages/acp 的 README）。
 *
 * 本文件不依赖 VS Code 内部 API：传输层抽象为 IJsonLineChannel，
 * 在编辑器内由 Agent Host 进程以子进程 stdio 实现，在测试中可由任意行通道替身。
 *
 * DSH 的 ACP 只承载标准语义更新（已提交的消息/思考、工具生命周期、配置与用量），
 * 不含 DSH 专有呈现数据（计划、待办、终端视图等明确不在 ACP 表面内）；
 * 工作流时间线的计划数据后续走 DSH 的 client 通道补齐，不在本文件范围。
 */

import { DeepSeekSessionUpdate } from 'vs/workbench/contrib/deepseek/common/deepseekTypes';

/** 一行一帧的 JSON 通道（ndjson）。stdio 实现负责按 \n 切分与写出。 */
export interface IJsonLineChannel {
	send(line: string): void;
	onLine(handler: (line: string) => void): { dispose(): void };
	onClose(handler: () => void): { dispose(): void };
}

export interface IAcpPermissionOption {
	optionId: string;
	kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
	name: string;
}

export interface IAcpPermissionRequest {
	sessionId: string;
	toolCallId: string;
	title: string;
	options: IAcpPermissionOption[];
}

export interface IAcpClientOptions {
	/** 收到 session/request_permission 时调用：返回选中的 optionId；返回 null 表示取消（拒绝） */
	onPermissionRequest?: (request: IAcpPermissionRequest) => Promise<string | null>;
	/** 每条 session/update 映射后的事件回调 */
	onUpdate?: (update: DeepSeekSessionUpdate) => void;
	clientName?: string;
	clientVersion?: string;
}

interface JsonRpcRequest { jsonrpc: '2.0'; id: number; method: string; params?: unknown }
interface JsonRpcNotification { jsonrpc: '2.0'; method: string; params?: unknown }
interface JsonRpcResponse { jsonrpc: '2.0'; id: number; result?: unknown; error?: { code: number; message: string; data?: unknown } }

export class AcpClient {
	private nextId = 1;
	private readonly pending = new Map<number, { resolve(value: never): void; reject(error: Error): void }>();
	private readonly disposers: { dispose(): void }[] = [];
	private disposed = false;

	constructor(
		private readonly channel: IJsonLineChannel,
		private readonly options: IAcpClientOptions = {},
	) {
		this.disposers.push(channel.onLine((line) => this.handleLine(line)));
		this.disposers.push(channel.onClose(() => {
			for (const { reject } of this.pending.values()) {
				reject(new Error('ACP 通道已关闭'));
			}
			this.pending.clear();
		}));
	}

	/** 握手：initialize（+ DSH 接受的 authenticate，失败不阻断） */
	async connect(): Promise<{ protocolVersion: number; agentCapabilities?: unknown }> {
		const result = await this.request<{ protocolVersion: number; agentCapabilities?: unknown }>('initialize', {
			protocolVersion: 1,
			clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
			clientInfo: { name: this.options.clientName ?? 'zovax-vscode', version: this.options.clientVersion ?? '0.1.0' },
		});
		try {
			await this.request('authenticate', {});
		} catch {
			/* DSH 的 authenticate 立即成功；其他实现可能不需要，容忍失败 */
		}
		return result;
	}

	/** session/new：cwd 必须是绝对路径；可挂 MCP 服务（stdio/HTTP） */
	async newSession(cwd: string, mcpServers: unknown[] = []): Promise<{ sessionId: string; configOptions?: unknown }> {
		return this.request('session/new', { cwd, mcpServers });
	}

	async listSessions(cwd?: string): Promise<unknown> {
		return this.request('session/list', cwd ? { cwd } : {});
	}

	async resumeSession(sessionId: string, cwd: string, mcpServers: unknown[] = []): Promise<unknown> {
		return this.request('session/resume', { sessionId, cwd, mcpServers });
	}

	async closeSession(sessionId: string): Promise<void> {
		await this.request('session/close', { sessionId });
	}

	/** session/set_config_option：切换 model 或 reasoning_effort */
	async setConfigOption(sessionId: string, configId: string, valueId: string): Promise<unknown> {
		return this.request('session/set_config_option', { sessionId, configId, valueId });
	}

	/**
	 * session/prompt：一会话同时只允许一个在途 prompt；
	 * 更新经 session/update 通知回流，本调用在回合结算时返回 stopReason。
	 */
	async prompt(sessionId: string, text: string): Promise<{ stopReason: string }> {
		return this.request('session/prompt', {
			sessionId,
			prompt: [{ type: 'text', text }],
		});
	}

	/** session/cancel 是通知（无响应） */
	cancel(sessionId: string): void {
		this.notify('session/cancel', { sessionId });
	}

	dispose(): void {
		this.disposed = true;
		for (const d of this.disposers) {
			d.dispose();
		}
		for (const { reject } of this.pending.values()) {
			reject(new Error('ACP 客户端已销毁'));
		}
		this.pending.clear();
	}

	// ---- JSON-RPC plumbing ----

	private request<T = unknown>(method: string, params?: unknown): Promise<T> {
		if (this.disposed) {
			return Promise.reject(new Error('ACP 客户端已销毁'));
		}
		const id = this.nextId++;
		const message: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
		return new Promise<T>((resolve, reject) => {
			this.pending.set(id, { resolve: resolve as (value: never) => void, reject });
			this.channel.send(JSON.stringify(message));
		});
	}

	private notify(method: string, params?: unknown): void {
		const message: JsonRpcNotification = { jsonrpc: '2.0', method, params };
		this.channel.send(JSON.stringify(message));
	}

	private respond(id: number, result: unknown): void {
		const message: JsonRpcResponse = { jsonrpc: '2.0', id, result };
		this.channel.send(JSON.stringify(message));
	}

	private respondError(id: number, code: number, message: string): void {
		this.channel.send(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }));
	}

	private handleLine(line: string): void {
		let message: Record<string, unknown>;
		try {
			message = JSON.parse(line) as Record<string, unknown>;
		} catch {
			return; // 非 JSON 行（例如对端日志误入）直接忽略；DSH 约定 stdout 只走协议
		}
		const id = typeof message.id === 'number' ? message.id : undefined;
		const method = typeof message.method === 'string' ? message.method : undefined;

		if (id !== undefined && (message.result !== undefined || message.error !== undefined)) {
			const entry = this.pending.get(id);
			if (!entry) {
				return;
			}
			this.pending.delete(id);
			const error = message.error as JsonRpcResponse['error'];
			if (error) {
				entry.reject(new Error(`ACP 错误 ${error.code}: ${error.message}`));
			} else {
				entry.resolve(message.result as never);
			}
			return;
		}

		if (method === 'session/update') {
			const update = mapSessionUpdate(message.params);
			if (update) {
				this.options.onUpdate?.(update);
			}
			return;
		}

		if (method === 'session/request_permission' && id !== undefined) {
			void this.handlePermissionRequest(id, message.params);
			return;
		}
		// 其余通知/请求（$/cancel_request 等）首批不处理
	}

	private async handlePermissionRequest(id: number, params: unknown): Promise<void> {
		const p = (params ?? {}) as {
			sessionId?: string;
			toolCall?: { toolCallId?: string; title?: string };
			options?: IAcpPermissionOption[];
		};
		const handler = this.options.onPermissionRequest;
		if (!handler) {
			this.respond(id, { outcome: { outcome: 'cancelled' } });
			return;
		}
		try {
			const optionId = await handler({
				sessionId: p.sessionId ?? '',
				toolCallId: p.toolCall?.toolCallId ?? '',
				title: p.toolCall?.title ?? '权限请求',
				options: p.options ?? [],
			});
			if (optionId) {
				this.respond(id, { outcome: { outcome: 'selected', optionId } });
			} else {
				this.respond(id, { outcome: { outcome: 'cancelled' } });
			}
		} catch (error) {
			this.respondError(id, -32603, error instanceof Error ? error.message : String(error));
		}
	}
}

/** 把 ACP 的 session/update 通知映射为融合层事件（见 deepseekTypes.ts） */
export function mapSessionUpdate(params: unknown): DeepSeekSessionUpdate | undefined {
	const p = (params ?? {}) as {
		sessionId?: string;
		update?: {
			sessionUpdate?: string;
			content?: { type?: string; text?: string } | readonly unknown[];
			toolCallId?: string;
			title?: string;
			status?: string;
			entries?: { content?: string; title?: string; status?: string }[];
		};
	};
	const sessionId = p.sessionId ?? '';
	const update = p.update ?? {};
	const text = !Array.isArray(update.content) && update.content?.type === 'text' ? (update.content.text ?? '') : '';
	switch (update.sessionUpdate) {
		case 'agent_message_chunk':
			return { kind: 'messageDelta', sessionId, role: 'assistant', text };
		case 'user_message_chunk':
			return { kind: 'messageDelta', sessionId, role: 'user', text };
		case 'agent_thought_chunk':
			return { kind: 'reasoningDelta', sessionId, text };
		case 'tool_call':
		case 'tool_call_update':
			return {
				kind: 'toolCall',
				sessionId,
				toolCallId: update.toolCallId ?? '',
				title: update.title ?? '',
				status: mapToolStatus(update.status),
				detail: extractToolDetail(update.content),
			};
		case 'plan':
			return {
				kind: 'planUpdate',
				sessionId,
				entries: (update.entries ?? []).map((e) => ({
					title: e.title ?? e.content ?? '',
					status: mapPlanStatus(e.status),
				})),
			};
		default:
			return undefined; // config_option_update / usage_update 等首批不进界面事件流
	}
}

/**
 * 提取工具调用的内容明细供界面呈现：文本块直出；diff 块（ACP 标准形态
 * { type:'diff', oldText, newText }）转成 +/- 前缀行，界面按红绿着色。
 */
function extractToolDetail(content: unknown): string | undefined {
	if (!Array.isArray(content)) {
		return undefined;
	}
	const parts: string[] = [];
	for (const block of content as readonly Record<string, unknown>[]) {
		if (block?.type === 'content') {
			const inner = block.content as { type?: string; text?: string } | undefined;
			if (inner?.type === 'text' && inner.text) {
				parts.push(inner.text);
			}
		} else if (block?.type === 'diff') {
			const oldText = typeof block.oldText === 'string' ? block.oldText : '';
			const newText = typeof block.newText === 'string' ? block.newText : '';
			for (const line of oldText.split('\n')) {
				if (line) {
					parts.push(`- ${line}`);
				}
			}
			for (const line of newText.split('\n')) {
				if (line) {
					parts.push(`+ ${line}`);
				}
			}
		}
	}
	return parts.length ? parts.join('\n') : undefined;
}

function mapToolStatus(status: string | undefined): 'pending' | 'inProgress' | 'completed' | 'failed' {
	switch (status) {
		case 'in_progress': return 'inProgress';
		case 'completed': return 'completed';
		case 'failed': return 'failed';
		default: return 'pending';
	}
}

function mapPlanStatus(status: string | undefined): 'pending' | 'inProgress' | 'completed' {
	switch (status) {
		case 'in_progress': return 'inProgress';
		case 'completed': return 'completed';
		default: return 'pending';
	}
}
