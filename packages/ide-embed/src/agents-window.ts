/**
 * Agents Window：默认把完整 DSH 前端嵌进 IDE（Simple Browser / 面板 iframe）。
 * `nova.ui.agentsWindowMode=standalone` 时仍可开独立 OS 窗口。
 */
import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { getActiveComposer } from './agent-os/composer-access';
import { startAgentsShellServer, type AgentsShellHost, type AgentsShellServer } from './agents-shell-http';
import { launchStandaloneAgentsWindow } from './agents-shell-launch';
import { emptyAgentsSnapshot } from './agents-window-model';
import {
    disposeDshEmbedPanel,
    openDshEmbeddedInIde,
    readAgentsWindowMode,
} from './dsh-embed-panel';
import { DSH_URL, ensureDshShell, resolveDshLayout, stopDshSidecar } from './dsh-sidecar';
import type { ParallelAgentRunner } from './parallel-agent';

let server: AgentsShellServer | undefined;
let parallelRunner: ParallelAgentRunner | undefined;
let starting: Promise<AgentsShellServer> | undefined;

function publicRoot(context: vscode.ExtensionContext): string {
    return path.join(context.extensionPath, 'agents-shell', 'public');
}

function ideHost(): AgentsShellHost {
    return {
        mode: 'ide',
        snapshot() {
            const c = getActiveComposer();
            return c?.getAgentsWindowSnapshot() || emptyAgentsSnapshot(vscode.workspace.workspaceFolders?.[0]?.name || '');
        },
        async newChat() {
            const c = getActiveComposer();
            if (c && typeof c.startNewChat === 'function') {
                await c.startNewChat();
            }
        },
        async select(id: string) {
            getActiveComposer()?.loadSessionFromAgentsWindow(id);
        },
        async submit(text: string) {
            const c = getActiveComposer();
            if (c) {
                await c.submitPromptFromHost(text);
            }
        },
        async stop() {
            getActiveComposer()?.stopFromAgentsWindow();
        },
        async shadow(action) {
            await getActiveComposer()?.agentsWindowShadowAction(action);
        },
        async parallel(goal: string) {
            if (parallelRunner) {
                await parallelRunner.run(goal);
            }
        },
        async openIde() {
            await showIdeWindow();
        },
    };
}

export async function ensureAgentsShellServer(context: vscode.ExtensionContext): Promise<AgentsShellServer> {
    if (server) {
        return server;
    }
    if (starting) {
        return starting;
    }
    starting = (async () => {
        const token = crypto.randomBytes(16).toString('hex');
        const s = await startAgentsShellServer({
            publicRoot: publicRoot(context),
            token,
            host: ideHost(),
        });
        server = s;
        return s;
    })();
    try {
        return await starting;
    } finally {
        starting = undefined;
    }
}

function workspaceFolderPaths(): string[] {
    return (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath);
}

function dshLayoutForIde(ctx: vscode.ExtensionContext) {
    return resolveDshLayout({
        appRoot: vscode.env.appRoot,
        extensionPath: ctx.extensionPath,
        workspaceFolders: workspaceFolderPaths(),
    });
}

async function openDshAgentsWindow(ctx: vscode.ExtensionContext): Promise<string | undefined> {
    const layout = dshLayoutForIde(ctx);
    if (!layout) {
        return undefined;
    }
    const ready = await ensureDshShell(layout);
    if (!ready) {
        return undefined;
    }
    const mode = readAgentsWindowMode();
    if (mode === 'embed') {
        await openDshEmbeddedInIde(DSH_URL);
        return DSH_URL;
    }
    const opened = launchStandaloneAgentsWindow(DSH_URL, {
        openExternal: (url) => {
            void vscode.env.openExternal(vscode.Uri.parse(url));
        },
    });
    void vscode.window.setStatusBarMessage(
        opened.mode === 'app'
            ? 'Agents Window（DSH）已在独立窗口打开'
            : 'Agents Window（DSH）已在浏览器打开',
        4000,
    );
    return DSH_URL;
}

export async function openAgentsWindow(context?: vscode.ExtensionContext): Promise<string> {
    const ctx = context || getContext();
    if (!ctx) {
        throw new Error('agents shell: missing extension context');
    }
    const source = vscode.workspace.getConfiguration('nova.ui').get<string>('agentsWindowSource') || 'auto';
    if (source === 'dsh' || source === 'auto') {
        try {
            const dshUrl = await openDshAgentsWindow(ctx);
            if (dshUrl) {
                return dshUrl;
            }
            if (source === 'dsh') {
                void vscode.window.showWarningMessage('DSH Agents Window 未能启动，请确认已打包 nova-dsh 或本机有 deepseek-harness。');
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            void vscode.window.setStatusBarMessage(`DSH Agents Window: ${msg}`, 5000);
            if (source === 'dsh') {
                throw err;
            }
        }
    }
    const s = await ensureAgentsShellServer(ctx);
    const mode = readAgentsWindowMode();
    if (mode === 'embed') {
        await openDshEmbeddedInIde(s.url);
        return s.url;
    }
    const opened = launchStandaloneAgentsWindow(s.url, {
        openExternal: (url) => {
            void vscode.env.openExternal(vscode.Uri.parse(url));
        },
    });
    void vscode.window.setStatusBarMessage(
        opened.mode === 'app' ? `Agents 外壳已在独立窗口打开` : `Agents 外壳已在浏览器打开`,
        4000,
    );
    return s.url;
}

export async function showIdeWindow(): Promise<void> {
    try {
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    } catch {
        /* */
    }
    try {
        await vscode.commands.executeCommand('workbench.view.explorer');
    } catch {
        /* */
    }
}

let savedContext: vscode.ExtensionContext | undefined;
function getContext(): vscode.ExtensionContext | undefined {
    return savedContext;
}

export function registerAgentsWindow(
    context: vscode.ExtensionContext,
    opts?: { parallel?: ParallelAgentRunner },
): void {
    savedContext = context;
    parallelRunner = opts?.parallel;
    context.subscriptions.push(
        vscode.commands.registerCommand('nova.agents.openWindow', () => openAgentsWindow(context)),
        vscode.commands.registerCommand('nova.agents.openIde', () => showIdeWindow()),
        {
            dispose() {
                disposeDshEmbedPanel();
                stopDshSidecar();
                const s = server;
                server = undefined;
                void s?.close();
            },
        },
    );
    if (vscode.workspace.getConfiguration('nova.ui').get<boolean>('agentsWindowOnStartup') === true) {
        setTimeout(() => {
            void openAgentsWindow(context).catch(() => undefined);
        }, 1800);
    }
}
