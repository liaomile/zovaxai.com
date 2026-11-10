import { join } from 'node:path';
import { defaultRunnerConfig } from './runner';
import { startRuntime } from './server';
import { JsonStore } from './store';

/**
 * 入口：环境变量配置——
 *   RUNTIME_PORT（默认 4390）、RUNTIME_TOKEN（可选 Bearer 令牌）、
 *   RUNTIME_DATA_DIR（默认 ./.runtime-data）、
 *   DSH_HARNESS_DIR（默认 ../../deepseek-harness，即仓库内 packages/deepseek-harness）、
 *   JOB_WORKSPACE_CWD（任务会话的工作目录，默认当前目录）。
 * 生产部署在现有后端时，本入口替换为后端进程内的装配，server/runner/store 接口不变。
 */

const port = parseInt(process.env.RUNTIME_PORT ?? '4390', 10);
const dataDir = process.env.RUNTIME_DATA_DIR ?? join(process.cwd(), '.runtime-data');
const harnessDir = process.env.DSH_HARNESS_DIR ?? join(__dirname, '..', '..', 'deepseek-harness');

const store = new JsonStore(dataDir);
const runner = defaultRunnerConfig(harnessDir);
// 可选覆盖（测试/特殊部署）：ACP_COMMAND + ACP_ARGS（空格分隔）
if (process.env.ACP_COMMAND) {
	runner.command = process.env.ACP_COMMAND;
	runner.args = (process.env.ACP_ARGS ?? '').split(' ').filter(Boolean);
	runner.cwd = process.env.ACP_CWD ?? process.cwd();
}

startRuntime({
	store,
	runner,
	workspaceCwd: process.env.JOB_WORKSPACE_CWD ?? process.cwd(),
	port,
	token: process.env.RUNTIME_TOKEN,
});

console.log(`[agent-runtime] data dir: ${dataDir}`);
console.log(`[agent-runtime] harness dir: ${harnessDir}`);
