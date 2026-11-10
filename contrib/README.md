# contrib/deepseek — VS Code fork 补丁源码（本仓为源头）

自 2026-11-10 起约定：**fork 侧改动先在本仓维护，本地同步进 fork**，不再直接改 fork 仓。

本目录文件与 fork 落点：

| 本仓文件 | fork 落点 | 说明 |
|---|---|---|
| `contrib/deepseek/agentsWindow.ts` | `src/vs/workbench/contrib/deepseek/browser/agentsWindow.ts` | “Open Agents Window”命令：编辑器内整页打开 DSH 前端（经内置 Simple Browser），默认 http://127.0.0.1:3080，配置项 `deepseek.agentsWindowUrl`（**自 v3 起退为开发调试入口**，产品主界面见 agentEditor.ts） |
| `contrib/deepseek/agentEditor.ts` | `src/vs/workbench/contrib/deepseek/browser/agentEditor.ts` | **原生 Agent 主界面（产品形态本体，S2 做精版）**：workbench 原生 EditorPane（非嵌入、非网页）——左侧会话栏（列表/新建/切换）、消息流（思考区、diff 着色工具卡、审批卡）、计划/待办条、空状态建议、滚动纪律、输入区＋状态行（模型/连接/当前文件）＋运行中停止键；数据经 IDeepSeekAgentService（ACP）驱动，做精成员（sessions/plan/cancel/modelName）为增补契约，文件头有清单；资源 `zovax-agent:/home`，由 agentLayout 启动时整体打开 |
| `contrib/deepseek/agentLayout.ts` | `src/vs/workbench/contrib/deepseek/browser/agentLayout.ts` | **Agent 形态外壳 v3**：启动一个动作内完成 — 隐藏活动栏/主侧边栏/面板/辅助侧栏＋打开原生 Agent 主界面占满窗口，无嵌入、无降级（打开失败如实报错）；Welcome 不出现（startupEditor 默认覆盖为 none）；模式经 “Use Agent Layout”/“Restore Classic Layout” 命令切换并持久化，配置 `deepseek.agentFirstLayout` 可整体停用。与 agentEditor.ts 同目录、同一 import 引入 |
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
