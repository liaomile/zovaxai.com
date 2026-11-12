/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zovax AI. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/services';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { AcpClient } from 'vs/workbench/contrib/deepseek/common/deepseekAcp';
import { IDeepSeekAgentService } from 'vs/workbench/services/deepseek/common/deepseekAgentService';
import { DeepSeekAgentService } from 'vs/workbench/services/deepseek/browser/deepseekAgentService';
import { DeepSeekAcpChannel } from 'vs/workbench/services/deepseek/electron-browser/deepseekAcpChannel';

/**
 * 桌面端 ACP 接入引导（M2）：workbench 启动后——
 * 1. 经主进程服务取 'deepseekAcp' 通道（另一端是主进程的 ACP 宿主，负责拉起 DSH 进程）；
 * 2. 按配置 deepseek.acpCommand 拉起 DSH 的 ACP 服务端（如 "pnpm dsh --profile acp"；
 *    未配置则不自动拉起，可由外部先行启动后改走连接复用，二期处理）；
 * 3. 创建 ACP 客户端：更新转发给 Agent 服务的事件流，权限请求转为界面审批；
 * 4. 握手后把客户端注入 Agent 服务，聊天视图的发送即走真实 agent。
 *
 * 本文件只在桌面端加载：由 workbench.desktop.main.ts 引入（官方文件改动，见 PATCHES #3）。
 *
 * 【全面接线纪律】任何一环失败都必须可见，绝不静默退化为“没接大脑的空壳”：
 * 未配置命令 → 警告通知并停在此步（不建悬空客户端）；拉起/握手失败 → 错误通知带原因。
 * 进程工作目录可用 deepseek.acpCwd 指定（DSH 仓库根目录）；会话工作目录仍是工作区。
 *
 * 【P0 稳定性修复（2026-11-12）】进程活着时接上、死了无人管，是审计定位的挂死链：
 * 此前 DSH 进程退出后客户端不重连、服务不收回连接状态、界面一直显示“已连接”。
 * 现：客户端的 onTransportClosed 一旦触发 → 服务 detachAcpClient 收回状态并结算
 * 挂起审批 → 此处自动重启一次（带 1s 延迟，只一次，防抖动成环）→ 再失败则错误
 * 通知并附宿主 stderr 尾部供诊断，停手等人工处理。
 */
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'deepseek',
	type: 'object',
	title: 'DeepSeek',
	properties: {
		'deepseek.acpCwd': {
			type: 'string',
			default: '',
			description: 'DSH ACP 服务端进程的工作目录（DSH 仓库根目录，如 vendored 的 packages/deepseek-harness）。留空则用工作区第一个文件夹。',
		},
	},
});

class DeepSeekAcpBootstrap extends Disposable implements IWorkbenchContribution {
	private channel: DeepSeekAcpChannel | undefined;
	private currentClient: AcpClient | undefined;
	private commandLine = '';
	private spawnCwd = '';
	private sessionCwd = '';
	private restartAttempted = false;
	private stopped = false;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IDeepSeekAgentService private readonly agentService: IDeepSeekAgentService,
		@IWorkspaceContextService workspaceService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		void this.init(mainProcessService, workspaceService, configurationService);
	}

	private async init(
		mainProcessService: IMainProcessService,
		workspaceService: IWorkspaceContextService,
		configurationService: IConfigurationService,
	): Promise<void> {
		const impl = this.agentService as DeepSeekAgentService;
		if (typeof impl.attachAcpClient !== 'function') {
			this.notificationService.error('DeepSeek Agent 服务实现异常：缺少 ACP 注入点，Agent 未连接。');
			return;
		}
		const folders = workspaceService.getWorkspace().folders;
		this.sessionCwd = folders.length ? folders[0].uri.fsPath : '';

		this.commandLine = (configurationService.getValue<string>('deepseek.acpCommand') ?? '').trim();
		if (!this.commandLine) {
			this.notificationService.warn('DeepSeek Agent 未连接：尚未配置 deepseek.acpCommand（如 "pnpm dsh --profile acp"）。配置后重启生效，界面不会假装已连接。');
			return;
		}
		this.spawnCwd = (configurationService.getValue<string>('deepseek.acpCwd') ?? '').trim() || this.sessionCwd;
		this.channel = new DeepSeekAcpChannel(mainProcessService.getChannel('deepseekAcp'));
		await this.connect();
	}

	/** 拉起 DSH 进程 + 建客户端 + 握手 + 注入服务。失败以错误通知收尾（带 stderr 尾部）。 */
	private async connect(): Promise<void> {
		const impl = this.agentService as DeepSeekAgentService;
		const channel = this.channel;
		if (!channel || this.stopped) {
			return;
		}
		try {
			// 先摘掉旧客户端的通道监听再拉进程：spawn 会先杀旧进程并触发 onExit，
			// 若旧客户端还在监听，它的 onTransportClosed 会误触一次重启逻辑。
			this.currentClient?.dispose();
			this.currentClient = undefined;
			const [command, ...args] = this.commandLine.split(/\s+/);
			await channel.spawn({ command, args, cwd: this.spawnCwd });

			const client = new AcpClient(channel, {
				onUpdate: (update) => impl.handleAcpUpdate(update),
				onPermissionRequest: async (request) => {
					const approved = await impl.requestPermissionFromUi(request.sessionId, request.toolCallId, request.title);
					if (approved) {
						return request.options.find((o) => o.kind === 'allow_once')?.optionId
							?? request.options.find((o) => o.kind.startsWith('allow'))?.optionId
							?? null;
					}
					return request.options.find((o) => o.kind === 'reject_once')?.optionId ?? null;
				},
				onTransportClosed: () => this.handleTransportClosed(),
			});
			this.currentClient = client;

			await client.connect();
			impl.attachAcpClient(client, this.sessionCwd);
		} catch (error) {
			const tail = await channel.getStderrTail().catch(() => '');
			const tailNote = tail ? `\nDSH 输出（尾部）：${tail.slice(-500)}` : '';
			this.notificationService.error(`DeepSeek Agent 连接 DSH 失败：${error instanceof Error ? error.message : String(error)}（命令：${this.commandLine}）${tailNote}`);
		}
	}

	/**
	 * DSH 进程退出/传输关闭：先让服务收回连接状态（界面立刻回到“未连接”，挂起审批
	 * 按拒绝结算），然后只自动重启一次；第二次退出只报错停手，避免崩溃循环刷屏。
	 */
	private handleTransportClosed(): void {
		if (this.stopped) {
			return;
		}
		const impl = this.agentService as DeepSeekAgentService;
		impl.detachAcpClient('DSH 进程已退出');
		if (!this.restartAttempted) {
			this.restartAttempted = true;
			this.notificationService.warn('DeepSeek Agent：DSH 进程意外退出，正在自动重启一次…');
			setTimeout(() => {
				if (!this.stopped) {
					void this.connect();
				}
			}, 1000);
		} else {
			void (async () => {
				const tail = (await this.channel?.getStderrTail().catch(() => '')) ?? '';
				const tailNote = tail ? `\nDSH 输出（尾部）：${tail.slice(-500)}` : '';
				this.notificationService.error(`DeepSeek Agent：DSH 进程再次退出，已停止自动重启，请检查 deepseek.acpCommand 与 DSH 状态后重新加载窗口。${tailNote}`);
			})();
		}
	}

	override dispose(): void {
		this.stopped = true;
		this.currentClient?.dispose();
		super.dispose();
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.WorkbenchContributions)
	.registerWorkbenchContribution(DeepSeekAcpBootstrap, LifecyclePhase.Eventually);
