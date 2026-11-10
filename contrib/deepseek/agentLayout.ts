/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zovax AI. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent 优先默认布局（fork 侧原生模块，同步进 fork 的 contrib/deepseek/browser/）：
 *
 * 产品形态要求（用户 2026-11-10）：打开 IDE 第一眼就应是全屏的 agent 界面（类 Codex），
 * 不是传统 VS Code 布局把 agent 挤在一个标签页里。因此首次启动时：
 *   - 隐藏活动栏（Parts.ACTIVITYBAR_PART）与主侧边栏（资源管理器等，Parts.SIDEBAR_PART）；
 *   - 隐藏底部面板（Parts.PANEL_PART）与辅助侧栏（Parts.AUXILIARYBAR_PART）；
 *   - 随即打开 Agents Window 占满编辑器区。
 *
 * 纪律：
 *   - 只在首次运行（无标记）时自动套用一次，之后完全尊重用户自己的布局调整，绝不每次启动抢回去；
 *   - 提供命令 “Restore Classic Layout” 一键还原经典布局并停用自动套用；
 *   - 配置项 deepseek.agentFirstLayout=false 可整体关闭本行为；
 *   - 状态栏与菜单栏保留（agent 也需要状态与命令入口），不在隐藏之列。
 * 本文件由 deepseek.contribution 一并 import（复用 PATCHES #1 的那一行），无新增官方文件改动。
 */

import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ILayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { OPEN_AGENTS_WINDOW_COMMAND } from './agentsWindow';

export const AGENT_FIRST_LAYOUT_CONFIG = 'deepseek.agentFirstLayout';
export const RESTORE_CLASSIC_LAYOUT_COMMAND = 'deepseek.restoreClassicLayout';
const APPLIED_STORAGE_KEY = 'zovax.agentFirstLayout.applied';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'deepseek',
	type: 'object',
	title: 'DeepSeek',
	properties: {
		[AGENT_FIRST_LAYOUT_CONFIG]: {
			type: 'boolean',
			default: true,
			description: '首次启动时套用 agent 优先布局：隐藏活动栏与侧边栏，全屏打开 Agents Window（类 Codex 形态）。仅首次生效，之后尊重用户布局。',
		},
	},
});

class AgentFirstLayoutContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		void this.applyOnFirstRun();
	}

	private async applyOnFirstRun(): Promise<void> {
		if (!this.configurationService.getValue<boolean>(AGENT_FIRST_LAYOUT_CONFIG)) {
			return;
		}
		if (this.storageService.get(APPLIED_STORAGE_KEY, StorageScope.APPLICATION)) {
			return; // 已套用过：不再干预用户之后的布局
		}
		this.hideChrome();
		this.storageService.store(APPLIED_STORAGE_KEY, '1', StorageScope.APPLICATION, StorageTarget.USER);
		try {
			await this.commandService.executeCommand(OPEN_AGENTS_WINDOW_COMMAND);
		} catch {
			/* Agents Window 命令不可用时不阻断启动，布局已套用 */
		}
	}

	private hideChrome(): void {
		this.layoutService.setPartHidden(true, Parts.ACTIVITYBAR_PART);
		this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
		this.layoutService.setPartHidden(true, Parts.PANEL_PART);
		this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.WorkbenchContributions)
	.registerWorkbenchContribution(AgentFirstLayoutContribution, LifecyclePhase.Restored);

CommandsRegistry.registerCommand(RESTORE_CLASSIC_LAYOUT_COMMAND, async (accessor) => {
	const layoutService = accessor.get(ILayoutService);
	const storageService = accessor.get(IStorageService);
	layoutService.setPartHidden(false, Parts.ACTIVITYBAR_PART);
	layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
	layoutService.setPartHidden(false, Parts.PANEL_PART);
	// 标记为已处理：还原后不再自动套用 agent 优先布局
	storageService.store(APPLIED_STORAGE_KEY, '1', StorageScope.APPLICATION, StorageTarget.USER);
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: RESTORE_CLASSIC_LAYOUT_COMMAND,
		title: { value: 'Restore Classic Layout', original: 'Restore Classic Layout' },
		category: { value: 'DeepSeek', original: 'DeepSeek' },
	},
});
