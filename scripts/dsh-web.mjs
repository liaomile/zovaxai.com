#!/usr/bin/env node
/**
 * 只起 DSH 前端：从 packages/deepseek-harness 拉起 web，监听 127.0.0.1:3080。
 *
 * 已与项目组推入的 DSH 树对齐（@deepseek-ai/dsh-root 0.1.0-rc.7）：
 * DSH 根 package.json 自带脚本 start:web（= node --import tsx/esm apps/cli/src/bin.ts web），
 * web 配置默认监听 127.0.0.1:3080（与其桌面端宿主使用的地址一致）。
 * 若上游改名/改口，只改下面 COMMAND 一处即可，其余脚本不受影响。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const harnessDir = join(root, 'packages', 'deepseek-harness');
const PORT = process.env.DSH_WEB_PORT ?? '3080';

if (!existsSync(harnessDir)) {
  console.error('[dsh:web] 缺少 packages/deepseek-harness —— 请先放入完整 DSH 树。');
  process.exit(1);
}

const COMMAND = { cmd: 'pnpm', args: ['start:web'] };

console.log(`[dsh:web] 在 ${harnessDir} 执行: ${COMMAND.cmd} ${COMMAND.args.join(' ')}（PORT=${PORT}）`);
const child = spawn(COMMAND.cmd, COMMAND.args, {
  cwd: harnessDir,
  stdio: 'inherit',
  env: { ...process.env, PORT, HOST: '127.0.0.1' },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
