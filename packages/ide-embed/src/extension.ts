import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * IDE 融合胶水（v2）：目标不是“在编辑器里开个网页”，而是让 DSH 与 IDE 像一体：
 * 1) 进程托管：打开 Agents Window 时自动拉起 DSH web 服务（已在跑则复用），
 *    从其启动输出中解析带会话 token 的就绪地址（与 DSH 桌面端宿主同一模式）；
 * 2) 整页嵌入：WebviewPanel + iframe 承载整页，retainContextWhenHidden 保状态；
 * 3) 双向桥：宿主页中继脚本把页面（iframe）的 postMessage 转给扩展、再把扩展
 *    的消息转回页面。协议见 docs/FUSION.md / docs/BRIDGE 契约（page-bridge.ts）。
 *    页面 -> IDE：openFile（编辑器打开文件并定位行）、notify（原生通知）；
 *    IDE -> 页面：theme（跟随编辑器明暗主题）、context（当前文件/工作区根）。
 * 4) 主题与上下文：打开时把编辑器主题与活动文件作为参数/消息给页面，减少违和感。
 *
 * fork 版以内置扩展形态打包同一份代码（见 contrib/README 的打包说明），
 * 与 contrib/deepseek 的原生模块共用命令语义。
 */

const DEFAULT_URL = 'http://127.0.0.1:3080';
const READY_URL_PATTERN = /https?:\/\/127\.0\.0\.1:3080[^\s"'<>]*/;

let panel: vscode.WebviewPanel | undefined;
let serverProcess: ChildProcess | undefined;
let sessionUrl: string | undefined;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('zovax.openAgentsWindow', () => openAgentsWindow()),
    vscode.window.onDidChangeActiveColorTheme(() => pushTheme()),
    vscode.window.onDidChangeActiveTextEditor(() => pushContext()),
  );
  if (config().get<boolean>('openOnStartup')) {
    void openAgentsWindow();
  }
}

export function deactivate(): void {
  panel?.dispose();
  panel = undefined;
  stopServer();
}

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('zovax.agentsWindow');
}

function baseUrl(): string {
  const url = config().get<string>('url');
  return url && url.trim() ? url.trim() : DEFAULT_URL;
}

/* ---------------- Agents Window ---------------- */

async function openAgentsWindow(): Promise<void> {
  const url = await ensureServer();
  if (panel) {
    panel.webview.html = renderHtml(url);
    panel.reveal(vscode.ViewColumn.One);
    pushTheme();
    pushContext();
    return;
  }
  panel = vscode.window.createWebviewPanel('zovaxAgentsWindow', 'Agents Window', vscode.ViewColumn.One, {
    enableScripts: true, // 宿主页需要中继脚本（页面本体脚本在 iframe 内，与宿主隔离）
    retainContextWhenHidden: true,
    localResourceRoots: [],
  });
  panel.webview.html = renderHtml(url);
  panel.webview.onDidReceiveMessage((raw: unknown) => {
    void handlePageMessage(raw);
  });
  panel.onDidDispose(() => {
    panel = undefined;
  });
  pushTheme();
  pushContext();
}

function renderHtml(url: string): string {
  const origin = safeOrigin(url) ?? DEFAULT_URL;
  const csp = [
    `default-src 'none'`,
    `style-src 'unsafe-inline'`,
    `script-src 'unsafe-inline'`,
    `frame-src ${origin}`,
  ].join('; ');
  const src = withEmbedParams(url);
  // 中继脚本：只转发带 zovaxBridge 标记、且来源等于 DSH 来源的消息，其余一律丢弃
  const relay = `
    const vscode = acquireVsCodeApi();
    const expectedOrigin = ${JSON.stringify(origin)};
    window.addEventListener('message', (event) => {
      if (event.origin === expectedOrigin && event.data && event.data.zovaxBridge === 'page') {
        vscode.postMessage(event.data);
      }
      if (event.data && event.data.zovaxBridge === 'ide') {
        const frame = document.getElementById('agents-frame');
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage(event.data, expectedOrigin);
        }
      }
    });`;
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
<iframe id="agents-frame" src="${escapeAttr(src)}" title="Agents Window"></iframe>
<script>${relay}</script>
</body>
</html>`;
}

function withEmbedParams(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('embed', 'zovax-ide');
    parsed.searchParams.set('theme', themeKind());
    return parsed.toString();
  } catch {
    return url;
  }
}

/* ---------------- 桥：页面 -> IDE ---------------- */

interface IPageMessage {
  zovaxBridge?: string;
  type?: string;
  path?: string;
  line?: number;
  column?: number;
  level?: string;
  message?: string;
}

async function handlePageMessage(raw: unknown): Promise<void> {
  const msg = raw as IPageMessage;
  if (!msg || msg.zovaxBridge !== 'page' || !msg.type) {
    return;
  }
  switch (msg.type) {
    case 'zovax/openFile': {
      if (msg.path) {
        await openFileInEditor(msg.path, msg.line, msg.column);
      }
      break;
    }
    case 'zovax/notify': {
      if (msg.message) {
        if (msg.level === 'error') {
          void vscode.window.showErrorMessage(msg.message);
        } else if (msg.level === 'warning') {
          void vscode.window.showWarningMessage(msg.message);
        } else {
          void vscode.window.showInformationMessage(msg.message);
        }
      }
      break;
    }
    default:
      break; // 未知消息忽略（协议向前兼容）
  }
}

async function openFileInEditor(path: string, line?: number, column?: number): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const fsPath = path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path) ? path : root ? join(root, path) : path;
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fsPath));
    const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    if (line && line > 0) {
      const position = new vscode.Position(line - 1, Math.max(0, (column ?? 1) - 1));
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }
  } catch {
    void vscode.window.showWarningMessage(`无法打开文件：${path}`);
  }
}

/* ---------------- 桥：IDE -> 页面 ---------------- */

function postToPage(payload: Record<string, unknown>): void {
  void panel?.webview.postMessage({ zovaxBridge: 'ide', ...payload });
}

function pushTheme(): void {
  postToPage({ type: 'zovax/theme', theme: themeKind() });
}

function pushContext(): void {
  const editor = vscode.window.activeTextEditor;
  postToPage({
    type: 'zovax/context',
    activeFile: editor?.document.uri.fsPath,
    workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  });
}

function themeKind(): string {
  switch (vscode.window.activeColorTheme.kind) {
    case vscode.ColorThemeKind.Light:
    case vscode.ColorThemeKind.HighContrastLight:
      return 'light';
    default:
      return 'dark';
  }
}

/* ---------------- DSH 进程托管 ---------------- */

async function ensureServer(): Promise<string> {
  const base = baseUrl();
  if (await isReachable(base)) {
    return sessionUrl ?? base;
  }
  if (!config().get<boolean>('autostart', true)) {
    return base;
  }
  const started = await startServer();
  return started ?? base;
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET' });
    return res.status < 500;
  } catch {
    return false;
  }
}

function startServer(): Promise<string | undefined> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    return Promise.resolve(undefined);
  }
  const harnessDir = join(root, 'packages', 'deepseek-harness');
  if (!existsSync(harnessDir)) {
    void vscode.window.showWarningMessage(
      '未找到 packages/deepseek-harness，无法自动启动 DSH；可先手动 pnpm dsh:web，或关闭 zovax.agentsWindow.autostart。',
    );
    return Promise.resolve(undefined);
  }
  // 与仓库根脚本一致：DSH 自带 start:web（= dsh web，web 配置默认监听 127.0.0.1:3080）
  serverProcess = spawn('pnpm', ['start:web'], {
    cwd: harnessDir,
    shell: process.platform === 'win32',
    env: { ...process.env },
  });
  const child = serverProcess;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | undefined) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const onData = (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      const match = READY_URL_PATTERN.exec(text);
      if (match) {
        sessionUrl = match[0];
        finish(sessionUrl);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('exit', () => {
      if (serverProcess === child) {
        serverProcess = undefined;
        sessionUrl = undefined;
      }
      finish(undefined);
    });
    // 兜底：15 秒内没解析到带 token 的就绪地址，就用默认地址打开（页面能开，接口可能需登录态）
    setTimeout(() => finish(undefined), 15_000);
  });
}

function stopServer(): void {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = undefined;
    sessionUrl = undefined;
  }
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
