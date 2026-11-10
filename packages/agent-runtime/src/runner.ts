import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * 无头任务执行器：拉起 DSH 的 ACP 服务（dsh --profile acp），在一个全新会话里
 * 执行任务 prompt，收集 agent 的文本输出作为本次运行的结论来源。
 * 与 IDE 里的 ACP 客户端（contrib/deepseek）是同一协议、两个宿主——一体两面。
 *
 * 骨架约定：后台任务默认无人值守，DSH 请求权限时一律回绝（cancelled），
 * 需要动手的事项应由任务在结论里声明、转 L1 审批，而不是在后台直接执行。
 */

export interface IRunnerConfig {
	command: string;
	args: string[];
	cwd: string;
	timeoutMs: number;
}

export interface IRunResult {
	transcript: string;
	stopReason: string;
}

interface JsonRpcMessage {
	jsonrpc: '2.0';
	id?: number;
	method?: string;
	params?: Record<string, unknown>;
	result?: unknown;
	error?: { message?: string };
}

export function defaultRunnerConfig(harnessDir: string): IRunnerConfig {
	return {
		command: 'pnpm',
		args: ['dsh', '--profile', 'acp'],
		cwd: harnessDir,
		timeoutMs: 10 * 60 * 1000,
	};
}

export async function runAcpPrompt(config: IRunnerConfig, promptText: string, cwd: string): Promise<IRunResult> {
	const child: ChildProcessWithoutNullStreams = spawn(config.command, config.args, {
		cwd: config.cwd,
		stdio: ['pipe', 'pipe', 'pipe'],
	});

	let nextId = 1;
	const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
	let transcript = '';

	// 子进程异常退出/启动失败时立刻让所有等待失败，避免任务挂到超时才结束（生产事故级细节）
	const failAll = (err: Error): void => {
		for (const waiter of pending.values()) {
			waiter.reject(err);
		}
		pending.clear();
	};
	child.on('error', (err) => failAll(new Error(`acp process failed to start: ${err.message}`)));
	child.on('exit', (code) => {
		if (pending.size > 0) {
			failAll(new Error(`acp process exited early (code ${code ?? 'unknown'})`));
		}
	});

	const send = (method: string, params: Record<string, unknown>): Promise<unknown> => {
		const id = nextId++;
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
			child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
		});
	};
	const notify = (method: string, params: Record<string, unknown>): void => {
		child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
	};
	const respond = (id: number, result: unknown): void => {
		child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
	};

	const rl = createInterface({ input: child.stdout });
	rl.on('line', (line) => {
		let msg: JsonRpcMessage;
		try {
			msg = JSON.parse(line) as JsonRpcMessage;
		} catch {
			return;
		}
		if (msg.id !== undefined && msg.method === undefined) {
			const waiter = pending.get(msg.id);
			if (waiter) {
				pending.delete(msg.id);
				if (msg.error) {
					waiter.reject(new Error(msg.error.message ?? 'acp error'));
				} else {
					waiter.resolve(msg.result);
				}
			}
			return;
		}
		if (msg.method === 'session/update') {
			const update = (msg.params as { update?: { sessionUpdate?: string; content?: { text?: string } } } | undefined)?.update;
			if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.text) {
				transcript += update.content.text;
			}
			return;
		}
		if (msg.method === 'session/request_permission' && msg.id !== undefined) {
			// 无人值守：不自动批准任何权限请求
			respond(msg.id, { outcome: { outcome: 'cancelled' } });
		}
	});

	const timeout = setTimeout(() => {
		child.kill();
	}, config.timeoutMs);

	try {
		await send('initialize', {
			protocolVersion: 1,
			clientCapabilities: {},
			clientInfo: { name: 'zovax-agent-runtime', version: '0.1.0' },
		});
		const session = (await send('session/new', { cwd, mcpServers: [] })) as { sessionId: string };
		const promptResult = (await send('session/prompt', {
			sessionId: session.sessionId,
			prompt: [{ type: 'text', text: promptText }],
		})) as { stopReason?: string };
		notify('session/close', { sessionId: session.sessionId });
		return { transcript: transcript.trim(), stopReason: promptResult.stopReason ?? 'end_turn' };
	} finally {
		clearTimeout(timeout);
		rl.close();
		child.kill();
	}
}
