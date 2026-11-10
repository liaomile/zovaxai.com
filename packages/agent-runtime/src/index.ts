import { join } from 'node:path';
import { log } from './log';
import { defaultRunnerConfig } from './runner';
import { startRuntime } from './server';
import { AuditLog, JsonStore } from './store';

/**
 * 入口：环境变量配置——
 *   RUNTIME_PORT（默认 4390）、RUNTIME_HOST（默认 127.0.0.1；绑 0.0.0.0 前先确保令牌已设）、
 *   RUNTIME_TOKEN（可选 Bearer 令牌）、RUNTIME_DATA_DIR（默认 ./.runtime-data）、
 *   RUNTIME_FAILURE_THRESHOLD（连续失败熔断阈值，默认 3）、
 *   DSH_HARNESS_DIR（默认 ../../deepseek-harness，即仓库内 packages/deepseek-harness）、
 *   JOB_WORKSPACE_CWD（任务会话的工作目录，默认当前目录）。
 * 生产部署在现有后端时，本入口替换为后端进程内的装配，server/runner/store 接口不变。
 * 停机：SIGTERM/SIGINT 优雅停机（停调度、等在跑任务收尾、关 HTTP），适配 systemd/容器编排。
 */

const port = parseInt(process.env.RUNTIME_PORT ?? '4390', 10);
if (Number.isNaN(port) || port < 1 || port > 65535) {
	log('error', 'invalid RUNTIME_PORT', { value: process.env.RUNTIME_PORT });
	process.exit(1);
}
const host = process.env.RUNTIME_HOST ?? '127.0.0.1';
if (host !== '127.0.0.1' && host !== 'localhost' && !process.env.RUNTIME_TOKEN) {
	log('error', 'refusing to bind non-loopback host without RUNTIME_TOKEN', { host });
	process.exit(1);
}
const failureThreshold = parseInt(process.env.RUNTIME_FAILURE_THRESHOLD ?? '3', 10);

const dataDir = process.env.RUNTIME_DATA_DIR ?? join(process.cwd(), '.runtime-data');
const harnessDir = process.env.DSH_HARNESS_DIR ?? join(__dirname, '..', '..', 'deepseek-harness');

const store = new JsonStore(dataDir);
const audit = new AuditLog(dataDir);
const runner = defaultRunnerConfig(harnessDir);
// 可选覆盖（测试/特殊部署）：ACP_COMMAND + ACP_ARGS（空格分隔）
if (process.env.ACP_COMMAND) {
	runner.command = process.env.ACP_COMMAND;
	runner.args = (process.env.ACP_ARGS ?? '').split(' ').filter(Boolean);
	runner.cwd = process.env.ACP_CWD ?? process.cwd();
}

const handle = startRuntime({
	store,
	audit,
	runner,
	workspaceCwd: process.env.JOB_WORKSPACE_CWD ?? process.cwd(),
	port,
	host,
	token: process.env.RUNTIME_TOKEN,
	failureThreshold: Number.isNaN(failureThreshold) ? 3 : failureThreshold,
});

log('info', 'agent-runtime configured', { dataDir, harnessDir, failureThreshold });

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	log('info', 'shutdown requested', { signal });
	await handle.close();
	process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason: unknown) => {
	log('error', 'unhandled rejection', { reason: reason instanceof Error ? reason.message : String(reason) });
});
process.on('uncaughtException', (err: Error) => {
	log('error', 'uncaught exception, exiting for supervisor restart', { error: err.message });
	void handle.close().finally(() => process.exit(1));
});
