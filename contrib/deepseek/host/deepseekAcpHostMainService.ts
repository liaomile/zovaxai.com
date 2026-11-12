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
 *   call  'getStderrTail'                   返回最近的 stderr 行（环形缓冲，供故障诊断）
 *   listen 'onLine'  string                 服务端输出的每一行
 *   listen 'onExit'  { code, error? }       进程退出或拉起失败（error 为拉起/运行期错误信息）
 *
 * 【P0 稳定性修复（2026-11-12）】审计实锤的两处：子进程 'error' 事件此前无人监听
 *（命令不存在/无权限时进程静默死亡，上层永远等不到 onExit）；stderr 此前被直接丢弃，
 * 故障时没有任何诊断信息。现：error 与 exit 以 settled 标志收敛为一次 onExit；
 * stderr 进环形缓冲（最近 200 行），可经 getStderrTail 取回拼进错误通知。
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
	private readonly stderrTail: string[] = [];
	private readonly _onLine = this._register(new Emitter<string>());
	private readonly _onExit = this._register(new Emitter<{ code: number | null; error?: string }>());

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
			case 'getStderrTail':
				return Promise.resolve(this.stderrTail.join('\n') as T);
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
		this.stderrTail.length = 0;
		const child = spawn(options.command, options.args, {
			cwd: options.cwd,
			env: { ...process.env, ...options.env },
		});
		this.process = child;
		// 'error' 与 'exit' 都可能触发（拉起失败时只有 error、先 error 后 exit 亦有）：
		// settled 保证 onExit 只发一次，且 error 信息不丢。
		let settled = false;
		const settle = (payload: { code: number | null; error?: string }) => {
			if (settled) {
				return;
			}
			settled = true;
			if (this.process === child) {
				this.process = undefined;
			}
			this._onExit.fire(payload);
		};
		const rl = createInterface({ input: child.stdout });
		rl.on('line', (line) => this._onLine.fire(line));
		child.on('error', (error) => settle({ code: null, error: error.message }));
		child.on('exit', (code) => settle({ code }));
		// stderr 不进协议通道（DSH 约定 stdout 只走协议），但要留痕供诊断：
		// 按行进环形缓冲（最近 200 行），避免管道堵塞的同时保住故障现场。
		const errRl = createInterface({ input: child.stderr });
		errRl.on('line', (line) => {
			this.stderrTail.push(line);
			if (this.stderrTail.length > 200) {
				this.stderrTail.shift();
			}
		});
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
