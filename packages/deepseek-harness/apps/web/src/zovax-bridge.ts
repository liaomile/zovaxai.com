/**
 * DSH 页面侧桥（放进 apps/web 的入口处引入即可，无框架依赖）：
 * - 检测自己是否被 IDE 内嵌（URL 参数 embed=zovax-ide，或父窗口存在）；
 * - 暴露 window.zovaxIde：openFile(path, line?, column?) / notify(level, message)，
 *   页面里需要“在编辑器里打开文件”时调用它，不再跳浏览器/下载；
 * - 接收 IDE 推送：zovax/theme（跟随编辑器主题）、zovax/context（当前文件/工作区），
 *   通过 window 事件 'zovax-theme' / 'zovax-context' 分发给应用层订阅。
 * 协议与 IDE 侧实现见 docs/FUSION.md；消息都带 zovaxBridge 标记，来源校验在宿主页完成。
 */

export interface ZovaxIdeBridge {
  readonly embedded: boolean;
  openFile(path: string, line?: number, column?: number): void;
  notify(level: 'info' | 'warning' | 'error', message: string): void;
}

declare global {
  interface Window {
    zovaxIde?: ZovaxIdeBridge;
  }
}

function post(payload: Record<string, unknown>): void {
  window.parent?.postMessage({ zovaxBridge: 'page', ...payload }, '*');
}

export function installZovaxIdeBridge(): ZovaxIdeBridge {
  const params = new URLSearchParams(window.location.search);
  const embedded = params.get('embed') === 'zovax-ide' || window.parent !== window;

  const bridge: ZovaxIdeBridge = {
    embedded,
    openFile(path: string, line?: number, column?: number) {
      post({ type: 'zovax/openFile', path, line, column });
    },
    notify(level: 'info' | 'warning' | 'error', message: string) {
      post({ type: 'zovax/notify', level, message });
    },
  };
  window.zovaxIde = bridge;

  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { zovaxBridge?: string; type?: string } | undefined;
    if (!data || data.zovaxBridge !== 'ide' || !data.type) {
      return;
    }
    if (data.type === 'zovax/theme') {
      window.dispatchEvent(new CustomEvent('zovax-theme', { detail: data }));
      document.documentElement.dataset.zovaxTheme = (data as { theme?: string }).theme ?? '';
    }
    if (data.type === 'zovax/context') {
      window.dispatchEvent(new CustomEvent('zovax-context', { detail: data }));
    }
  });

  return bridge;
}
