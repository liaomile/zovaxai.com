# packages/ide-embed — IDE 内嵌胶水

把完整 DSH 前端（Agents Window）整页嵌进编辑器的扩展实现，用于：

- 在原版 VS Code 中调试/演示嵌入效果（F5 启动扩展宿主，执行命令 “Open Agents Window”）；
- 作为 fork 版 `contrib/deepseek` 原生实现的**行为基准**（同一命令、同一配置语义、同一默认地址）。

行为约定：

- 命令：`zovax.openAgentsWindow`，标题 “Open Agents Window”；
- 默认地址：`http://127.0.0.1:3080`，配置项 `zovax.agentsWindow.url` 可改；
- 嵌入方式：WebviewPanel + iframe 整页承载，`retainContextWhenHidden` 保状态，不外跳浏览器；
- 可选：`zovax.agentsWindow.openOnStartup` 启动时自动打开。

构建：`pnpm --filter ide-embed build`（或在本目录 `npm run build`），产物在 `dist/`。

## Nova Agent 参考源（并存）

同目录下的 src/dsh-embed-panel.ts / dsh-sidecar.ts / gents-window.ts 来自产品侧 Nova Agent，
可作为 fork / 扩展实现对照；当前可运行扩展入口仍是 src/extension.ts。
