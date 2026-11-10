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
	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IDeepSeekAgentService agentService: IDeepSeekAgentService,
		@IWorkspaceContextService workspaceService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@INotificationService notificationService: INotificationService,
	) {
		super();
		void this.init(mainProcessService, agentService, workspaceService, configurationService, notificationService);
	}

	private async init(
		mainProcessService: IMainProcessService,
		agentService: IDeepSeekAgentService,
		workspaceService: IWorkspaceContextService,
		configurationService: IConfigurationService,
		notificationService: INotificationService,
	): Promise<void> {
		const impl = agentService as DeepSeekAgentService;
		if (typeof impl.attachAcpClient !== 'function') {
			notificationService.error('DeepSeek Agent 服务实现异常：缺少 ACP 注入点，Agent 未连接。');
			return;
		}
		const folders = workspaceService.getWorkspace().folders;
		const cwd = folders.length ? folders[0].uri.fsPath : '';

		const commandLine = (configurationService.getValue<string>('deepseek.acpCommand') ?? '').trim();
		if (!commandLine) {
			notificationService.warn('DeepSeek Agent 未连接：尚未配置 deepseek.acpCommand（如 "pnpm dsh --profile acp"）。配置后重启生效，界面不会假装已连接。');
			return;
		}

		try {
			const channel = new DeepSeekAcpChannel(mainProcessService.getChannel('deepseekAcp'));
			const spawnCwd = (configurationService.getValue<string>('deepseek.acpCwd') ?? '').trim() || cwd;
			const [command, ...args] = commandLine.split(/\s+/);
			await channel.spawn({ command, args, cwd: spawnCwd });

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
			});
			this._register({ dispose: () => client.dispose() });

			await client.connect();
			impl.attachAcpClient(client, cwd);
		} catch (error) {
			notificationService.error(`DeepSeek Agent 连接 DSH 失败：${error instanceof Error ? error.message : String(error)}（命令：${commandLine}）`);
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.WorkbenchContributions)
	.registerWorkbenchContribution(DeepSeekAcpBootstrap, LifecyclePhase.Eventually);
