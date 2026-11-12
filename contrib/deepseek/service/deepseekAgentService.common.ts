/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zovax AI. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDeepSeekApprovalAnswer, IDeepSeekSession, DeepSeekSessionUpdate } from 'vs/workbench/contrib/deepseek/common/deepseekTypes';

export const IDeepSeekAgentService = createDecorator<IDeepSeekAgentService>('deepseekAgentService');

/**
 * 编辑器级的公共 Agent 服务：任何 workbench 模块（聊天视图、编辑器操作、终端、SCM）
 * 都经此入口调用 DeepSeek Harness 的 agent，而不是各自直连——这是深改与「做个界面」的分界。
 *
 * 实现层（browser/deepseekAgentService.ts）经 IPC 通道连接 Agent Host 进程，
 * Agent Host 再以 ACP（JSON-RPC over stdio）驱动 DSH 的 agent。
 */
export interface IDeepSeekAgentService {
	readonly _serviceBrand: undefined;

	/** 会话更新事件流（消息增量、工具状态、计划、审批请求） */
	readonly onSessionUpdate: Event<DeepSeekSessionUpdate>;

	/**
	 * ACP 是否已接入（DSH 大脑真连通）。界面据此显示真实状态；
	 * 未接入时服务不做任何本地假回复 —— createSession/sendPrompt 会以可见错误收尾。
	 */
	readonly acpAttached: boolean;
	/** ACP 接入完成时触发（bootstrap 握手并注入客户端之后） */
	readonly onAcpAttached: Event<void>;
	/**
	 * ACP 断开时触发（DSH 进程退出/传输关闭），参数为断开原因（P0 修复，2026-11-12）。
	 * 界面据此回到“未连接”呈现；此前进程死了界面无感知、一直显示连着。
	 */
	readonly onAcpDetached: Event<string>;

	/** 当前会话列表 */
	listSessions(): Promise<IDeepSeekSession[]>;

	/** 新建会话（在 Agent Host 内经 ACP 创建 DSH 会话） */
	createSession(modelId?: string): Promise<IDeepSeekSession>;

	/** 向会话发送提示；流式更新经 onSessionUpdate 回流，令牌可中断 */
	sendPrompt(sessionId: string, text: string, token?: CancellationToken): Promise<void>;

	/** 回答一次审批请求（写文件/执行命令等有副作用动作的闸口在宿主侧） */
	answerApproval(answer: IDeepSeekApprovalAnswer): Promise<void>;

	/** 中断会话当前工作 */
	cancel(sessionId: string): Promise<void>;
}
