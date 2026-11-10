/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zovax AI. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * fork 侧原生注册：命令 “Open Agents Window”
 * —— 优先走 nova-agent 的 DSH 嵌入（nova.agents.openWindow），
 *    不可用时回退到内置 Simple Browser 整页打开 DSH。
 *
 * 编译修正（2026-11-10 本地）：注册 deepseek.agentsWindowUrl；优先 nova.agents.openWindow。
 */

import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { localize2 } from 'vs/nls';

export const OPEN_AGENTS_WINDOW_COMMAND = 'deepseek.openAgentsWindow';
export const AGENTS_WINDOW_URL_CONFIG = 'deepseek.agentsWindowUrl';
export const DEFAULT_AGENTS_WINDOW_URL = 'http://127.0.0.1:3080';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'deepseek',
	type: 'object',
	title: 'DeepSeek',
	properties: {
		[AGENTS_WINDOW_URL_CONFIG]: {
			type: 'string',
			default: DEFAULT_AGENTS_WINDOW_URL,
			description: 'Agents Window / DSH 前端地址（Simple Browser 回退路径使用）。',
		},
	},
});

CommandsRegistry.registerCommand(OPEN_AGENTS_WINDOW_COMMAND, async (accessor) => {
	const configurationService = accessor.get(IConfigurationService);
	const commandService = accessor.get(ICommandService);
	const configured = configurationService.getValue<string>(AGENTS_WINDOW_URL_CONFIG);
	const url = configured && configured.trim() ? configured.trim() : DEFAULT_AGENTS_WINDOW_URL;

	try {
		await commandService.executeCommand('nova.agents.openWindow');
		return;
	} catch {
		/* 扩展未激活或命令不可用时走 Simple Browser */
	}

	await commandService.executeCommand('simpleBrowser.show', url);
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: OPEN_AGENTS_WINDOW_COMMAND,
		title: localize2('deepseek.openAgentsWindow', 'Open Agents Window'),
		category: localize2('deepseek.category', 'DeepSeek'),
	},
});
