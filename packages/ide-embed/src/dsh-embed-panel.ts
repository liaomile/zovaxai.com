/**
 * Embed the full DSH web shell inside the IDE editor area (not a separate OS window).
 * Prefer VS Code Simple Browser; fall back to a WebviewPanel iframe shell.
 */
import * as vscode from 'vscode';
import { DSH_URL } from './dsh-sidecar';

export type AgentsWindowMode = 'embed' | 'standalone';

/** Pure HTML for the iframe host (unit-testable). */
export function buildDshEmbedHtml(dshUrl: string, webviewCspSource: string): string {
    const src = String(dshUrl || DSH_URL).trim() || DSH_URL;
    const csp = [
        "default-src 'none'",
        `frame-src ${src} http://127.0.0.1:* http://localhost:*`,
        "img-src data:",
        `style-src ${webviewCspSource} 'unsafe-inline'`,
        "script-src 'none'",
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ZovaX Agents Window</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: var(--vscode-editor-background, #1e1e1e); }
  iframe { border: 0; width: 100%; height: 100%; display: block; background: #fff; }
  .bar {
    position: absolute; top: 0; left: 0; right: 0; z-index: 2;
    display: flex; gap: 8px; align-items: center;
    padding: 4px 10px; font: 12px/1.4 system-ui, sans-serif;
    color: var(--vscode-descriptionForeground, #999);
    background: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 88%, transparent);
    pointer-events: none;
  }
  .bar code { color: var(--vscode-textLink-foreground, #4ea1ff); }
</style>
</head>
<body>
  <div class="bar">DSH · <code>${src}</code></div>
  <iframe src="${src}" title="ZovaX DSH" allow="clipboard-read; clipboard-write"></iframe>
</body>
</html>`;
}

let embedPanel: vscode.WebviewPanel | undefined;

export function readAgentsWindowMode(
    getConfig: (section: string) => { get: <T>(key: string, def: T) => T } = (s) => vscode.workspace.getConfiguration(s),
): AgentsWindowMode {
    const mode = String(getConfig('nova.ui').get<string>('agentsWindowMode', 'embed') || 'embed').toLowerCase();
    return mode === 'standalone' ? 'standalone' : 'embed';
}

async function trySimpleBrowser(url: string): Promise<boolean> {
    const commands = ['simpleBrowser.show', 'simpleBrowser.api.open', 'simpleBrowser.open'];
    for (const cmd of commands) {
        try {
            await vscode.commands.executeCommand(cmd, url);
            return true;
        } catch {
            /* try next */
        }
    }
    return false;
}

function revealOrCreateIframePanel(url: string): vscode.WebviewPanel {
    if (embedPanel) {
        embedPanel.reveal(vscode.ViewColumn.Beside, true);
        embedPanel.webview.html = buildDshEmbedHtml(url, embedPanel.webview.cspSource);
        return embedPanel;
    }
    const panel = vscode.window.createWebviewPanel(
        'nova.dshAgentsEmbed',
        'Agents Window',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            // Localhost iframe is intentional: DSH sidecar owns the full React shell.
        },
    );
    panel.webview.html = buildDshEmbedHtml(url, panel.webview.cspSource);
    panel.onDidDispose(() => {
        if (embedPanel === panel) {
            embedPanel = undefined;
        }
    });
    embedPanel = panel;
    return panel;
}

/**
 * Show the live DSH page inside the IDE. Returns true when an in-IDE surface opened.
 */
export async function openDshEmbeddedInIde(url: string = DSH_URL): Promise<boolean> {
    const target = String(url || DSH_URL).trim() || DSH_URL;
    if (await trySimpleBrowser(target)) {
        void vscode.window.setStatusBarMessage('Agents Window（DSH）已嵌入 IDE 编辑器页', 4000);
        return true;
    }
    revealOrCreateIframePanel(target);
    void vscode.window.setStatusBarMessage('Agents Window（DSH）已嵌入 IDE 面板', 4000);
    return true;
}

export function disposeDshEmbedPanel(): void {
    embedPanel?.dispose();
    embedPanel = undefined;
}
