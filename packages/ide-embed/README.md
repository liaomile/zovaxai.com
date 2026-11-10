# packages/ide-embed — IDE 融合胶水（v2）

把 DSH 与 IDE 融为一体的扩展实现（融合分层与桥协议见 `docs/FUSION.md`）：

- **进程托管（L1）**：执行 “Open Agents Window” 时先探活 DSH（默认 http://127.0.0.1:3080）；
  没在跑就自动在 `packages/deepseek-harness` 里 `pnpm start:web` 拉起，解析其就绪地址
  （含会话 token，与 DSH 桌面端宿主同模式）后打开面板；扩展停用时回收自己拉起的进程。
  配置：`zovax.agentsWindow.autostart`（默认开）。
- **整页嵌入（L2）**：WebviewPanel + iframe，`retainContextWhenHidden` 保状态；
  打开时带 `embed=zovax-ide` 与当前主题参数。
- **双向桥（L3）**：宿主页中继脚本（校验来源）转发消息——页面可调
  `zovax/openFile`（编辑器打开文件并定位行）、`zovax/notify`（原生通知）；
  IDE 向页面推 `zovax/theme`（主题切换实时跟随）与 `zovax/context`（当前文件/工作区）。
  页面侧接入文件：`bridge/page-bridge.ts`（引入 DSH 的 apps/web 入口即可）。

打包进 fork：构建产物拷入 fork 的 `extensions/zovax-ide-embed/` 即成内置扩展（见 contrib/README）。
原版 VS Code 里 F5 启动扩展宿主同样可用。

构建：`pnpm --filter ide-embed build`，产物在 `dist/`。
