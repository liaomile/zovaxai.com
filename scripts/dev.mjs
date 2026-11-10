#!/usr/bin/env node
/**
 * 一键开发：pnpm install -> 起 DSH 前端(3080) -> 打印 IDE 打开方式。
 * Ctrl+C 结束（子进程随之终止）。
 */
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.DSH_WEB_PORT ?? '3080';

console.log('[dev] pnpm install …');
const install = spawnSync('pnpm', ['install'], { cwd: root, stdio: 'inherit' });
if (install.status !== 0) {
  console.error('[dev] pnpm install 失败，终止。');
  process.exit(install.status ?? 1);
}

console.log('[dev] 启动 DSH 前端 …');
const web = spawn('node', [join(root, 'scripts', 'dsh-web.mjs')], { stdio: 'inherit' });

waitFor(`http://127.0.0.1:${PORT}`, 60_000)
  .then(() => {
    console.log('');
    console.log(`[dev] DSH 前端已就绪: http://127.0.0.1:${PORT}`);
    console.log('[dev] 在 IDE 中打开：命令面板执行 “Open Agents Window”（编辑器内嵌整页）。');
    console.log('[dev]   - fork 版：先把 contrib/deepseek 同步进 fork 并构建；');
    console.log('[dev]   - 原版 VS Code：以 packages/ide-embed 为扩展目录按 F5 启动扩展宿主。');
  })
  .catch(() => {
    console.warn(`[dev] 等待 http://127.0.0.1:${PORT} 超时，请看上方 DSH 输出排查。`);
  });

process.on('SIGINT', () => {
  web.kill('SIGINT');
  process.exit(0);
});
web.on('exit', (code) => process.exit(code ?? 0));

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.status < 500) return;
    } catch {
      /* 还没起来，继续等 */
    }
    if (Date.now() > deadline) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 1000));
  }
}
