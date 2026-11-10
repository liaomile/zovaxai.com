/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zovax AI. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { createInterface } from 'readline';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';

/**
 * 主进程侧的 ACP 宿主（M2）：负责拉起 DSH 的 ACP 服务端进程并按行转发其 stdio。
 * 以 IChannel 形式注册为 'deepseekAcp' 通道，workbench 侧经主进程服务取用：
 *   call  'spawn'   { command, args, cwd }  拉起（或重启）ACP 服务端进程
 *   call  'sendLine' string                 写入一行 JSON-RPC
 *   call  'kill'                            终止进程
 *   listen 'onLine'  string                 服务端输出的每一行
 *   listen 'onExit'  { code: number|null }  进程退出
 *
 * 注册方式（官方文件改动，见 PATCHES #2）：在 electron-main 的服务装配处实例化本类，
 * 并把其 channel 注册到主进程 IPC 服务器。API Key 等凭据由 DSH 自身的配置/环境读取，
 * 本宿主只透传进程环境，不接触明文密钥。
 */
export interface IDeepSeekAcpSpawnOptions {
	command: string;
	args: string[];
	cwd: string;
	env?: Record<string, string>;
}

export class DeepSeekAcpHostMainService extends Disposable implements IChannel {
	readonly _serviceBrand: undefined;

	private process: ChildProcessWithoutNullStreams | undefined;
	private readonly _onLine = this._register(new Emitter<string>());
	private readonly _onExit = this._register(new Emitter<{ code: number | null }>());

	call<T>(command: string, arg?: unknown): Promise<T> {
		switch (command) {
			case 'spawn':
				this.spawnProcess(arg as IDeepSeekAcpSpawnOptions);
				return Promise.resolve(undefined as T);
			case 'sendLine':
				this.process?.stdin.write(`${String(arg)}\n`);
				return Promise.resolve(undefined as T);
			case 'kill':
				this.killProcess();
				return Promise.resolve(undefined as T);
			default:
				return Promise.reject(new Error(`未知命令: ${command}`));
		}
	}

	listen<T>(event: string): Event<T> {
		switch (event) {
			case 'onLine':
				return this._onLine.event as Event<T>;
			case 'onExit':
				return this._onExit.event as Event<T>;
			default:
				throw new Error(`未知事件: ${event}`);
		}
	}

	private spawnProcess(options: IDeepSeekAcpSpawnOptions): void {
		this.killProcess();
		const child = spawn(options.command, options.args, {
			cwd: options.cwd,
			env: { ...process.env, ...options.env },
		});
		this.process = child;
		const rl = createInterface({ input: child.stdout });
		rl.on('line', (line) => this._onLine.fire(line));
		child.on('exit', (code) => {
			if (this.process === child) {
				this.process = undefined;
			}
			this._onExit.fire({ code });
		});
		// stderr 不进协议通道（DSH 约定 stdout 只走协议）；此处丢弃避免管道堵塞
		child.stderr.resume();
	}

	private killProcess(): void {
		if (this.process) {
			this.process.kill();
			this.process = undefined;
		}
	}

	override dispose(): void {
		this.killProcess();
		super.dispose();
	}
}
