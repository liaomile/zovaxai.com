/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zovax AI. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IJsonLineChannel } from 'vs/workbench/contrib/deepseek/common/deepseekAcp';

/**
 * 把主进程的 'deepseekAcp' 通道适配为 ACP 客户端需要的 IJsonLineChannel（一行一帧）。
 * 通道另一端是 platform/deepseek/electron-main 的 DeepSeekAcpHostMainService。
 */
export class DeepSeekAcpChannel implements IJsonLineChannel {
	constructor(private readonly channel: IChannel) { }

	send(line: string): void {
		void this.channel.call('sendLine', line);
	}

	onLine(handler: (line: string) => void): { dispose(): void } {
		return this.channel.listen<string>('onLine')(handler);
	}

	onClose(handler: () => void): { dispose(): void } {
		const disposable = this.channel.listen<{ code: number | null }>('onExit')(() => handler());
		return { dispose: () => disposable.dispose() };
	}

	/** 拉起（或重启）ACP 服务端进程 */
	async spawn(options: { command: string; args: string[]; cwd: string }): Promise<void> {
		await this.channel.call('spawn', options);
	}

	async kill(): Promise<void> {
		await this.channel.call('kill');
	}
}
