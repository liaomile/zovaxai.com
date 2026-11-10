/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zovax AI. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

/**
 * 【自深度 fork v3 起退为开发调试入口】产品主界面已改为原生 Agent 主界面
 * （agentEditor.ts），本命令仅供调试 DSH 网页版时手动打开，不再被启动流程调用。
 *
 * fork 侧原生注册（同步进 fork 的 src/vs/workbench/contrib/deepseek/browser/ 后生效）：
 * 命令 “Open Agents Window” —— 在编辑器内整页打开 DSH 前端（Agents Window）。
 *
 * 实现：调用 VS Code 内置 Simple Browser 的命令在编辑器标签内显示整页，
 * 不外跳系统浏览器，与 packages/ide-embed 的扩展实现行为一致（同一默认地址、同一配置语义）。
 * 地址配置项：deepseek.agentsWindowUrl（默认 http://127.0.0.1:3080）。
 *
 * 本文件由 deepseek.contribution 一并 import（复用 PATCHES #1 的那一行），无新增官方文件改动。
 * 待联调：Simple Browser 对个别页面能力（文件下载、个别弹窗）有限制；
 * 若联调发现 DSH 页面有不兼容点，二期把本命令切换为 fork 内自建的 Webview 编辑器页（行为不变）。
 */

import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';

export const OPEN_AGENTS_WINDOW_COMMAND = 'deepseek.openAgentsWindow';
export const AGENTS_WINDOW_URL_CONFIG = 'deepseek.agentsWindowUrl';
export const DEFAULT_AGENTS_WINDOW_URL = 'http://127.0.0.1:3080';

CommandsRegistry.registerCommand(OPEN_AGENTS_WINDOW_COMMAND, async (accessor) => {
	const configurationService = accessor.get(IConfigurationService);
	const commandService = accessor.get(ICommandService);
	const configured = configurationService.getValue<string>(AGENTS_WINDOW_URL_CONFIG);
	const url = configured && configured.trim() ? configured.trim() : DEFAULT_AGENTS_WINDOW_URL;
	// simpleBrowser.show 是 VS Code 内置 Simple Browser 扩展的命令：在编辑器内打开整页
	await commandService.executeCommand('simpleBrowser.show', url);
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: OPEN_AGENTS_WINDOW_COMMAND,
		title: { value: 'Open Agents Window', original: 'Open Agents Window' },
		category: { value: 'DeepSeek', original: 'DeepSeek' },
	},
});
