/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zovax AI. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

/**
 * DeepSeek 融合层共用类型：与 DSH（DeepSeek Harness）的 ACP 语义对齐。
 * ACP（Agent Client Protocol）是 DSH 对外提供的标准通道：会话、提示、语义更新、权限询问。
 * 本文件不依赖 workbench 内部实现，供 contrib 与 services 两层共用。
 */

export interface IDeepSeekSession {
	readonly id: string;
	readonly title: string;
	readonly modelId: string;
	readonly createdAt: number;
}

/** ACP 语义更新：驱动原生聊天控件与工作流时间线的事件全集（首批）。 */
export type DeepSeekSessionUpdate =
	| { kind: 'messageDelta'; sessionId: string; role: 'assistant' | 'user'; text: string }
	| { kind: 'reasoningDelta'; sessionId: string; text: string }
	| { kind: 'toolCall'; sessionId: string; toolCallId: string; title: string; status: 'pending' | 'inProgress' | 'completed' | 'failed'; detail?: string }
	| { kind: 'planUpdate'; sessionId: string; entries: { title: string; status: 'pending' | 'inProgress' | 'completed' }[] }
	| { kind: 'approvalRequest'; sessionId: string; requestId: string; title: string; detail?: string }
	| { kind: 'sessionIdle'; sessionId: string; reason: 'completed' | 'cancelled' | 'error'; message?: string };

export interface IDeepSeekApprovalAnswer {
	readonly requestId: string;
	readonly approved: boolean;
}
