/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zovax AI. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent 形态外壳（深度 fork 的展示层落点；fork 已冻结基线、自维护更新，不再顾虑上游合并）。
 *
 * 产品形态（用户 2026-11-10 定版）：打开 IDE 就是 DSH 式 agent 界面（类 Codex），
 * 不是传统 VS Code 布局。因此 agent 布局是本产品的**默认且持久**的形态：
 *   - 每次启动（除非用户显式切到经典模式）：隐藏活动栏、主侧边栏、底部面板、辅助侧栏，
 *     并打开 Agents Window 占满整个窗口；
 *   - Welcome 页不再出现（workbench.startupEditor 默认改为 none，由本模块注册默认值覆盖）；
 *   - 模式是显式开关并持久化：命令 “Use Agent Layout” / “Restore Classic Layout” 切换并记住，
 *     不存在“布局被偷偷改回去”的含糊状态；
 *   - 配置 deepseek.agentFirstLayout=false 可整体停用本模块（例如内部调试经典界面时）；
 *   - 状态栏与菜单栏保留：agent 的连接状态、账号、命令入口都在这里，是产品的一部分。
 *
 * 后续的构建级移除（从注册表摘掉活动栏视图集等硬改动）见 docs/DEEP-FORK-UI.md 的 S3，
 * 在 fork 本地源码上进行；本模块是同步进 fork contrib 的部分，不新增官方文件改动。
 */

import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ILayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { OPEN_AGENTS_WINDOW_COMMAND } from './agentsWindow';

export const AGENT_FIRST_LAYOUT_CONFIG = 'deepseek.agentFirstLayout';
export const USE_AGENT_LAYOUT_COMMAND = 'deepseek.useAgentLayout';
export const RESTORE_CLASSIC_LAYOUT_COMMAND = 'deepseek.restoreClassicLayout';
const LAYOUT_MODE_KEY = 'zovax.layoutMode'; // 'agent' | 'classic'；缺省 = agent
type LayoutMode = 'agent' | 'classic';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'deepseek',
	type: 'object',
	title: 'DeepSeek',
	properties: {
		[AGENT_FIRST_LAYOUT_CONFIG]: {
			type: 'boolean',
			default: true,
			description: '启用 agent 形态外壳：启动即 agent 界面（隐藏活动栏与侧边栏、全屏 Agents Window）。关闭后回到标准 VS Code 行为。',
		},
	},
});
// 默认值覆盖：启动不再打开 Welcome 页（agent 界面就是首页）。
// 冻结基线下这是安全的 fork 手法；若与核心注册冲突未生效，在 fork 的 product/defaults 里兜底同一键。
configurationRegistry.registerConfiguration({
	id: 'workbench',
	type: 'object',
	title: 'Workbench',
	properties: {
		'workbench.startupEditor': {
			type: 'string',
			default: 'none',
			description: 'Zovax 默认覆盖：启动时不打开任何默认编辑器，由 agent 外壳接管首页。',
		},
	},
});

/**
 * 打开 Agents Window，带降级与可见的失败提示（v2.1 教训：静默吞错曾导致
 * “外壳隐藏成功、页面没打开、满屏空白还没人知道为什么”）：
 *   1) 首选 deepseek.openAgentsWindow（agentsWindow 模块注册）；
 *   2) 该命令未注册/失败时，降级为内置 Simple Browser 直接打开配置地址；
 *   3) 再失败则弹错误通知，把原因摆到台面上（多半是 DSH 未启动），不阻断启动。
 */
async function openAgentsWindow(
	commandService: ICommandService,
	configurationService: IConfigurationService,
	notificationService: INotificationService,
): Promise<void> {
	try {
		await commandService.executeCommand(OPEN_AGENTS_WINDOW_COMMAND);
		return;
	} catch {
		/* 落到降级路径 */
	}
	const url = configurationService.getValue<string>('deepseek.agentsWindowUrl')?.trim() || 'http://127.0.0.1:3080';
	try {
		await commandService.executeCommand('simpleBrowser.show', url);
	} catch (err) {
		notificationService.error(`Agents Window 打开失败（${err instanceof Error ? err.message : String(err)}）。请确认 DSH 已在 ${url} 启动（pnpm dsh:web），再用命令 “Open Agents Window” 重试。`);
	}
}

class AgentShellContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		void this.applyOnStartup();
	}

	private mode(): LayoutMode {
		return this.storageService.get(LAYOUT_MODE_KEY, StorageScope.APPLICATION) === 'classic' ? 'classic' : 'agent';
	}

	private async applyOnStartup(): Promise<void> {
		if (!this.configurationService.getValue<boolean>(AGENT_FIRST_LAYOUT_CONFIG)) {
			return;
		}
		if (this.mode() === 'classic') {
			return; // 用户显式选了经典模式，尊重之
		}
		applyAgentChrome(this.layoutService);
		await openAgentsWindow(this.commandService, this.configurationService, this.notificationService);
	}
}

function applyAgentChrome(layoutService: ILayoutService): void {
	layoutService.setPartHidden(true, Parts.ACTIVITYBAR_PART);
	layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
	layoutService.setPartHidden(true, Parts.PANEL_PART);
	layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
}

function applyClassicChrome(layoutService: ILayoutService): void {
	layoutService.setPartHidden(false, Parts.ACTIVITYBAR_PART);
	layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
	layoutService.setPartHidden(false, Parts.PANEL_PART);
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.WorkbenchContributions)
	.registerWorkbenchContribution(AgentShellContribution, LifecyclePhase.Restored);

CommandsRegistry.registerCommand(USE_AGENT_LAYOUT_COMMAND, async (accessor) => {
	const layoutService = accessor.get(ILayoutService);
	const storageService = accessor.get(IStorageService);
	storageService.store(LAYOUT_MODE_KEY, 'agent', StorageScope.APPLICATION, StorageTarget.USER);
	applyAgentChrome(layoutService);
	await openAgentsWindow(accessor.get(ICommandService), accessor.get(IConfigurationService), accessor.get(INotificationService));
});

CommandsRegistry.registerCommand(RESTORE_CLASSIC_LAYOUT_COMMAND, (accessor) => {
	const layoutService = accessor.get(ILayoutService);
	const storageService = accessor.get(IStorageService);
	storageService.store(LAYOUT_MODE_KEY, 'classic', StorageScope.APPLICATION, StorageTarget.USER);
	applyClassicChrome(layoutService);
});

for (const [id, title] of [
	[USE_AGENT_LAYOUT_COMMAND, 'Use Agent Layout'],
	[RESTORE_CLASSIC_LAYOUT_COMMAND, 'Restore Classic Layout'],
] as const) {
	MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
		command: {
			id,
			title: { value: title, original: title },
			category: { value: 'DeepSeek', original: 'DeepSeek' },
		},
	});
}
