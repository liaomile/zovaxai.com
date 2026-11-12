/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zovax AI. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';
import { IDeepSeekAgentService } from 'vs/workbench/services/deepseek/common/deepseekAgentService';
import { IDeepSeekApprovalAnswer, IDeepSeekSession, DeepSeekSessionUpdate } from 'vs/workbench/contrib/deepseek/common/deepseekTypes';
import { AcpClient } from 'vs/workbench/contrib/deepseek/common/deepseekAcp';

/**
 * IDeepSeekAgentService 的 workbench 侧实现：经 ACP 驱动真实 DSH（M2 接通版）。
 *   createSession  -> ACP session/new
 *   sendPrompt     -> ACP session/prompt（更新经 session/update 通知回流为 DeepSeekSessionUpdate）
 *   answerApproval -> ACP session request_permission 的应答
 *   cancel         -> ACP session/cancel
 * ACP 客户端由 bootstrap 在宿主通道就绪、握手完成后经 attachAcpClient 注入。
 *
 * 【纪律】未注入（ACP 未接入）时绝不伪造本地回复：createSession 直接抛错、
 * sendPrompt 以 sessionIdle(error) 可见地失败 —— 假桩曾让界面“看起来能用、其实没接大脑”，禁止重演。
 */
export class DeepSeekAgentService extends Disposable implements IDeepSeekAgentService {
	declare readonly _serviceBrand: undefined;

	/** 审批无人应答的失效时限：到时按拒绝结算（见 requestPermissionFromUi） */
	private static readonly APPROVAL_TIMEOUT_MS = 120_000;

	private readonly _onSessionUpdate = this._register(new Emitter<DeepSeekSessionUpdate>());
	readonly onSessionUpdate = this._onSessionUpdate.event;

	private readonly _onAcpAttached = this._register(new Emitter<void>());
	readonly onAcpAttached = this._onAcpAttached.event;

	private readonly _onAcpDetached = this._register(new Emitter<string>());
	readonly onAcpDetached = this._onAcpDetached.event;

	get acpAttached(): boolean {
		return this.acpClient !== undefined;
	}

	private readonly sessions = new Map<string, IDeepSeekSession>();
	private sequence = 0;

	/** ACP 接入点：由宿主层（Agent Host 通道就绪后）注入；未注入时走本地骨架行为 */
	private acpClient: AcpClient | undefined;
	private acpCwd = '';
	private readonly pendingApprovals = new Map<string, { resolve(approved: boolean): void; timer?: ReturnType<typeof setTimeout> }>();

	/**
	 * 注入 ACP 客户端（其 onUpdate 应转发到本服务的事件流，onPermissionRequest 应走
	 * requestPermissionFromUi）。通道的进程拉起（stdio 子进程）在宿主层完成，不属于本类。
	 */
	attachAcpClient(client: AcpClient, cwd: string): void {
		this.acpClient = client;
		this.acpCwd = cwd;
		this._onAcpAttached.fire();
	}

	/**
	 * 收回 ACP 接入（DSH 进程退出/传输关闭时由客户端的 onTransportClosed 经
	 * bootstrap 调用）：清客户端、把所有挂起审批以“拒绝”结算（不留永挂 Promise，
	 * 否则 agent 的这一回合会被审批永久堵死——审计实锤），并广播断开事件。
	 */
	detachAcpClient(reason: string): void {
		const wasAttached = this.acpClient !== undefined;
		this.acpClient = undefined;
		for (const entry of this.pendingApprovals.values()) {
			if (entry.timer) {
				clearTimeout(entry.timer);
			}
			entry.resolve(false);
		}
		this.pendingApprovals.clear();
		if (wasAttached) {
			this._onAcpDetached.fire(reason);
		}
	}

	/** 供 ACP 客户端的 onUpdate 回调使用：把通道回流的更新转发到本服务的事件流 */
	handleAcpUpdate(update: DeepSeekSessionUpdate): void {
		this._onSessionUpdate.fire(update);
	}

	/**
	 * 供 ACP 客户端的权限回调使用：把审批请求推给界面，等 answerApproval 应答。
	 * 【P0 修复】审批必须有失效路径：超过 APPROVAL_TIMEOUT_MS 无人应答则按“拒绝”
	 * 结算并回告 DSH——此前 Promise 永不结算，一次被忽略的审批能把整个会话回合
	 * 永久堵死（审计实锤“审批 Promise 无失效路径”）。超时后迟到的应答自动作废
	 * （answerApproval 找不到条目即忽略）。界面侧审批卡的自动消解是后续小改，
	 * 不影响此处正确性：DSH 已按拒绝继续，用户再点旧卡也不会重复生效。
	 */
	requestPermissionFromUi(sessionId: string, requestId: string, title: string): Promise<boolean> {
		this._onSessionUpdate.fire({ kind: 'approvalRequest', sessionId, requestId, title });
		return new Promise<boolean>((resolve) => {
			const timer = setTimeout(() => {
				if (this.pendingApprovals.delete(requestId)) {
					resolve(false);
				}
			}, DeepSeekAgentService.APPROVAL_TIMEOUT_MS);
			this.pendingApprovals.set(requestId, { resolve, timer });
		});
	}

	async listSessions(): Promise<IDeepSeekSession[]> {
		return [...this.sessions.values()];
	}

	async createSession(modelId?: string): Promise<IDeepSeekSession> {
		if (!this.acpClient) {
			throw new Error('ACP 未接入：DSH 大脑未连接（检查 deepseek.acpCommand 配置与宿主通道）');
		}
		const { sessionId } = await this.acpClient.newSession(this.acpCwd);
		const session: IDeepSeekSession = {
			id: sessionId,
			title: `会话 ${++this.sequence}`,
			modelId: modelId ?? 'deepseek-chat',
			createdAt: Date.now(),
		};
		this.sessions.set(session.id, session);
		return session;
	}

	async sendPrompt(sessionId: string, text: string, token?: CancellationToken): Promise<void> {
		if (!this.acpClient) {
			this._onSessionUpdate.fire({
				kind: 'sessionIdle',
				sessionId,
				reason: 'error',
				message: 'ACP 未接入：DSH 大脑未连接，消息未发送（检查 deepseek.acpCommand 配置与宿主通道）',
			});
			return;
		}
		const client = this.acpClient;
		const disposable = token?.onCancellationRequested(() => client.cancel(sessionId));
		try {
			const { stopReason } = await client.prompt(sessionId, text);
			this._onSessionUpdate.fire({
				kind: 'sessionIdle',
				sessionId,
				reason: stopReason === 'cancelled' ? 'cancelled' : 'completed',
			});
		} catch (error) {
			this._onSessionUpdate.fire({
				kind: 'sessionIdle',
				sessionId,
				reason: 'error',
				message: error instanceof Error ? error.message : String(error),
			});
		} finally {
			disposable?.dispose();
		}
	}

	async answerApproval(answer: IDeepSeekApprovalAnswer): Promise<void> {
		const pending = this.pendingApprovals.get(answer.requestId);
		if (pending) {
			this.pendingApprovals.delete(answer.requestId);
			if (pending.timer) {
				clearTimeout(pending.timer);
			}
			pending.resolve(answer.approved);
		}
	}

	async cancel(sessionId: string): Promise<void> {
		if (this.acpClient) {
			this.acpClient.cancel(sessionId);
		}
		this._onSessionUpdate.fire({ kind: 'sessionIdle', sessionId, reason: 'cancelled' });
	}
}
