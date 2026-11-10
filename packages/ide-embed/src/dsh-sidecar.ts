/**
 * Start / locate the Nova DSH web shell (port 3080) from Code OSS.
 * Path resolution is vscode-free so unit tests can import it.
 */
import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

export const DSH_PORT = 3080;
export const DSH_URL = `http://127.0.0.1:${DSH_PORT}/`;

export type DshLayout = {
    harnessDir: string;
    novaRoot: string;
    patchMcp: string;
    patchBrand: string;
    pythonPath: string;
};

export type PathExists = (p: string) => boolean;

function existsDefault(p: string): boolean {
    try {
        return fs.existsSync(p);
    } catch {
        return false;
    }
}

function firstExisting(candidates: string[], exists: PathExists): string | undefined {
    for (const c of candidates) {
        if (c && exists(c)) {
            return c;
        }
    }
    return undefined;
}

export function resolveHarnessDir(opts: {
    appRoot?: string;
    extensionPath?: string;
    workspaceFolders?: readonly string[];
    env?: NodeJS.Dict<string>;
    exists?: PathExists;
}): string | undefined {
    const exists = opts.exists || existsDefault;
    const env = opts.env || process.env;
    const fromEnv = String(env.NOVA_DSH_HOME || '').trim();
    const folders = opts.workspaceFolders || [];
    const candidates = [
        fromEnv,
        opts.appRoot ? path.join(opts.appRoot, '..', 'nova-dsh', 'deepseek-harness') : '',
        opts.extensionPath ? path.join(opts.extensionPath, '..', '..', 'deepseek-harness') : '',
        ...folders.map((f) => path.join(f, 'nova_ide_src', 'deepseek-harness')),
        ...folders.map((f) => path.join(f, 'deepseek-harness')),
    ];
    return firstExisting(
        candidates.filter(Boolean).map((p) => path.normalize(p)),
        (p) => exists(path.join(p, 'package.json')),
    );
}

export function resolveNovaRoot(opts: {
    harnessDir?: string;
    workspaceFolders?: readonly string[];
    env?: NodeJS.Dict<string>;
    exists?: PathExists;
}): string | undefined {
    const exists = opts.exists || existsDefault;
    const env = opts.env || process.env;
    const fromEnv = String(env.NOVA_ROOT || '').trim();
    const folders = opts.workspaceFolders || [];
    const fromHarness = opts.harnessDir ? path.normalize(path.join(opts.harnessDir, '..', '..')) : '';
    const candidates = [
        fromEnv,
        ...folders,
        ...folders.map((f) => path.dirname(f)),
        fromHarness,
    ];
    return firstExisting(
        candidates.filter(Boolean),
        (p) => exists(path.join(p, 'nova_gateway', 'core', 'gateway.py'))
            || exists(path.join(p, 'config', 'dsh', 'nova-mcp.cordis.yml')),
    );
}

export function resolveDshLayout(opts: {
    appRoot?: string;
    extensionPath?: string;
    workspaceFolders?: readonly string[];
    env?: NodeJS.Dict<string>;
    exists?: PathExists;
}): DshLayout | undefined {
    const exists = opts.exists || existsDefault;
    const env = opts.env || process.env;
    const harnessDir = resolveHarnessDir(opts);
    if (!harnessDir) {
        return undefined;
    }
    const novaRoot = resolveNovaRoot({ ...opts, harnessDir }) || harnessDir;
    const packagedCfg = opts.appRoot
        ? path.join(opts.appRoot, '..', 'nova-dsh', 'config', 'dsh')
        : '';
    const cfgDirs = [
        packagedCfg,
        path.join(novaRoot, 'config', 'dsh'),
        path.join(harnessDir, '..', '..', 'config', 'dsh'),
    ].filter(Boolean);
    const cfgDir = firstExisting(cfgDirs, (p) => exists(path.join(p, 'nova-mcp.cordis.yml')));
    if (!cfgDir) {
        return undefined;
    }
    const pythonWin = path.join(novaRoot, '.venv', 'Scripts', 'python.exe');
    const pythonUnix = path.join(novaRoot, '.venv', 'bin', 'python');
    const pythonPath = firstExisting(
        [String(env.NOVA_PYTHON || '').trim(), pythonWin, pythonUnix, 'python'],
        (p) => p === 'python' || exists(p),
    ) || 'python';
    return {
        harnessDir,
        novaRoot,
        patchMcp: path.join(cfgDir, 'nova-mcp.cordis.yml'),
        patchBrand: path.join(cfgDir, 'nova-brand.cordis.yml'),
        pythonPath,
    };
}

export function probeDshHttp(url = DSH_URL, timeoutMs = 1500): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            res.resume();
            resolve((res.statusCode || 0) < 500);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            resolve(false);
        });
    });
}

let child: ChildProcess | null = null;

export function isDshSidecarRunning(): boolean {
    return !!(child && child.exitCode === null);
}

export function stopDshSidecar(): void {
    if (!child) {
        return;
    }
    try {
        child.kill('SIGTERM');
    } catch {
        try {
            child.kill('SIGKILL');
        } catch {
            /* ignore */
        }
    }
    child = null;
}

export function startDshSidecar(layout: DshLayout, electronExecPath = process.execPath): ChildProcess {
    if (child && child.exitCode === null) {
        return child;
    }
    const env = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONPATH: layout.novaRoot,
        NOVA_ROOT: layout.novaRoot,
        NOVA_PYTHON: layout.pythonPath,
        NOVA_MCP_PROFILE: process.env.NOVA_MCP_PROFILE || 'full',
        DSH_HOME: path.join(path.dirname(layout.patchMcp), 'home'),
    };
    child = spawn(electronExecPath, [
        '--import', 'tsx/esm',
        path.join('apps', 'cli', 'src', 'bin.ts'),
        'web',
        '--patch', layout.patchMcp,
        '--patch', layout.patchBrand,
    ], {
        cwd: layout.harnessDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    child.on('close', () => {
        child = null;
    });
    return child;
}

export async function ensureDshShell(layout: DshLayout, waitMs = 90000): Promise<boolean> {
    if (await probeDshHttp()) {
        return true;
    }
    startDshSidecar(layout);
    const start = Date.now();
    while (Date.now() - start < waitMs) {
        if (await probeDshHttp()) {
            return true;
        }
        await new Promise((r) => setTimeout(r, 800));
    }
    return probeDshHttp();
}
