/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zovax AI. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent 形态外壳 v3（深度 fork 定版：整体原生，不要嵌入、不要降级）：
 *
 * 启动即一整套：隐藏传统外壳（活动栏/主侧边栏/面板/辅助侧栏）＋ 打开**原生 Agent 主界面**
 * （agentEditor.ts 的 EditorPane，workbench 原生控件渲染）占满窗口。两者是一个动作，
 * 不存在“先开壳再往里塞网页”，也不存在打开失败时的降级页面 ——
 * 打开失败只会把错误如实弹出（那是 bug，要修，不是设计内的路径）。
 *
 * - DSH 大脑经 ACP 由 IDE 进程托管（M2 的 deepseekAcpHost），本形态不需要 3080 网页服务；
 * - Welcome 页不出现（workbench.startupEditor 默认值覆盖为 none）；
 * - 模式显式且持久：Use Agent Layout / Restore Classic Layout 命令切换并记住；
 * - 配置 deepseek.agentFirstLayout=false 可整体停用（内部调试经典界面时）；
 * - agentsWindow / ide-embed 的整页嵌入路线自 v3 起退为开发调试入口，不再是产品形态。
 */

import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ILayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { AGENT_HOME_URI } from './agentEditor';

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
			description: '启用 agent 形态外壳：启动即原生 Agent 主界面。关闭后回到标准 VS Code 行为。',
		},
	},
});
// 默认值覆盖：启动不打开 Welcome（原生 Agent 界面就是首页）。冻结基线下的 fork 手法。
configurationRegistry.registerConfiguration({
	id: 'workbench',
	type: 'object',
	title: 'Workbench',
	properties: {
		'workbench.startupEditor': {
			type: 'string',
			default: 'none',
			description: 'Zovax 默认覆盖：启动时不打开任何默认编辑器，由 agent 外壳打开原生 Agent 主界面。',
		},
	},
});

/** 整体打开：外壳与原生 Agent 主界面在一个动作里完成，没有第二步、没有降级。 */
async function openAgentShell(
	layoutService: ILayoutService,
	editorService: IEditorService,
	notificationService: INotificationService,
): Promise<void> {
	applyAgentChrome(layoutService);
	try {
		await editorService.openEditor({ resource: AGENT_HOME_URI });
	} catch (err) {
		notificationService.error(`Agent 主界面打开失败：${err instanceof Error ? err.message : String(err)}`);
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

class AgentShellContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IStorageService private readonly storageService: IStorageService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		void this.applyOnStartup();
	}

	private async applyOnStartup(): Promise<void> {
		if (!this.configurationService.getValue<boolean>(AGENT_FIRST_LAYOUT_CONFIG)) {
			return;
		}
		if (this.storageService.get(LAYOUT_MODE_KEY, StorageScope.APPLICATION) === 'classic') {
			return; // 用户显式选了经典模式，尊重之
		}
		await openAgentShell(this.layoutService, this.editorService, this.notificationService);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.WorkbenchContributions)
	.registerWorkbenchContribution(AgentShellContribution, LifecyclePhase.Restored);

CommandsRegistry.registerCommand(USE_AGENT_LAYOUT_COMMAND, async (accessor) => {
	accessor.get(IStorageService).store(LAYOUT_MODE_KEY, 'agent', StorageScope.APPLICATION, StorageTarget.USER);
	await openAgentShell(accessor.get(ILayoutService), accessor.get(IEditorService), accessor.get(INotificationService));
});

CommandsRegistry.registerCommand(RESTORE_CLASSIC_LAYOUT_COMMAND, (accessor) => {
	accessor.get(IStorageService).store(LAYOUT_MODE_KEY, 'classic', StorageScope.APPLICATION, StorageTarget.USER);
	applyClassicChrome(accessor.get(ILayoutService));
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
