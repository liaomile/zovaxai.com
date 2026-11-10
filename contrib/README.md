# contrib/deepseek — VS Code fork 补丁源码（本仓为源头）

自 2026-11-10 起约定：**fork 侧改动先在本仓维护，本地同步进 fork**，不再直接改 fork 仓。

本目录文件与 fork 落点：

| 本仓文件 | fork 落点 | 说明 |
|---|---|---|
| `contrib/deepseek/agentsWindow.ts` | `src/vs/workbench/contrib/deepseek/browser/agentsWindow.ts` | “Open Agents Window”命令：编辑器内整页打开 DSH 前端（经内置 Simple Browser），默认 http://127.0.0.1:3080，配置项 `deepseek.agentsWindowUrl`（轻量兜底方案） |
| `contrib/deepseek/agentLayout.ts` | `src/vs/workbench/contrib/deepseek/browser/agentLayout.ts` | **Agent 形态外壳（深度 fork，docs/DEEP-FORK-UI.md 的 S1）**：agent 布局为默认且持久的显式模式 — 启动隐藏活动栏/主侧边栏/面板/辅助侧栏、全屏打开 Agents Window、Welcome 不再出现（startupEditor 默认覆盖为 none）；命令 “Use Agent Layout”/“Restore Classic Layout” 切换并持久化，配置 `deepseek.agentFirstLayout` 可整体停用。与 agentsWindow.ts 同目录、同一 import 引入 |
| `packages/ide-embed`（构建产物 dist + package.json） | `extensions/zovax-ide-embed/` | 融合主路线：VS Code 构建自动扫描 extensions/ 目录成为内置扩展，无官方文件改动；含进程托管、主题/上下文同步与页面桥（docs/FUSION.md） |

同步与生效步骤：

1. 把上表文件拷入 fork 对应路径；
2. 在 fork 的 deepseek 模块注册入口（`deepseek.contribution`）中 import `agentsWindow`——
   该入口本身经 `workbench.common.main.ts` 的一行 import 加载（PATCHES #1）；
3. 重新构建 fork，命令面板应出现 “Open Agents Window”（分类 DeepSeek）；
4. 先 `pnpm dsh:web` 起 DSH 前端，再在 IDE 里执行该命令验收整页内嵌。

与 `packages/ide-embed/` 的关系：ide-embed 是同一行为的扩展实现（原版 VS Code 调试/演示用），
两边保持同一命令语义与默认地址；改行为时两边一起改。

官方文件改动登记在 `docs/PATCHES.md`；本目录新增文件不算官方改动，不必登记，
但其依赖的注册行（如 PATCHES #1）必须保持有效。
