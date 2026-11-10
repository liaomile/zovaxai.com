import * as vscode from 'vscode';

/**
 * IDE 内嵌胶水：命令 “Open Agents Window” 在编辑器内打开整页 DSH 前端（Agents Window）。
 * 实现要点：
 * - 用 WebviewPanel 承载整页（编辑器标签页内），不外跳浏览器；
 * - 页面本体是 DSH 的 web 应用，经 iframe 加载（默认 http://127.0.0.1:3080）；
 * - retainContextWhenHidden 保持页面状态，切换标签不重载；
 * - 地址可配置（zovax.agentsWindow.url），改配置后重新执行命令即生效。
 * fork 版的等价实现在 contrib/deepseek（原生注册同一命令），两边行为保持一致。
 */

let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('zovax.openAgentsWindow', () => openAgentsWindow()),
  );
  const config = vscode.workspace.getConfiguration('zovax.agentsWindow');
  if (config.get<boolean>('openOnStartup')) {
    void openAgentsWindow();
  }
}

export function deactivate(): void {
  panel?.dispose();
  panel = undefined;
}

function openAgentsWindow(): void {
  const url = getAgentsWindowUrl();
  if (panel) {
    panel.webview.html = renderHtml(url);
    panel.reveal(vscode.ViewColumn.One);
    return;
  }
  panel = vscode.window.createWebviewPanel(
    'zovaxAgentsWindow',
    'Agents Window',
    vscode.ViewColumn.One,
    {
      enableScripts: false, // 宿主页不需要脚本，页面自身脚本在 iframe 内运行
      retainContextWhenHidden: true,
      localResourceRoots: [],
    },
  );
  panel.webview.html = renderHtml(url);
  panel.onDidDispose(() => {
    panel = undefined;
  });
}

function getAgentsWindowUrl(): string {
  const url = vscode.workspace.getConfiguration('zovax.agentsWindow').get<string>('url');
  return url && url.trim() ? url.trim() : 'http://127.0.0.1:3080';
}

function renderHtml(url: string): string {
  const origin = safeOrigin(url);
  // CSP：只允许把配置的 DSH 来源作为 iframe 嵌入，其余一概禁止
  const csp = [
    `default-src 'none'`,
    `style-src 'unsafe-inline'`,
    origin ? `frame-src ${origin}` : `frame-src http://127.0.0.1:3080`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #1e1e1e; }
  iframe { border: 0; width: 100%; height: 100vh; display: block; }
</style>
</head>
<body>
<iframe src="${escapeAttr(url)}" title="Agents Window"></iframe>
</body>
</html>`;
}

function safeOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
