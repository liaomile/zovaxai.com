# contrib/deepseek — VS Code fork 补丁源码（本仓为源头）

自 2026-11-10 起约定：**fork 侧改动先在本仓维护，本地同步进 fork**，不再直接改 fork 仓。

本目录文件与 fork 落点：

| 本仓文件 | fork 落点 | 说明 |
|---|---|---|
| `contrib/deepseek/agentsWindow.ts` | `src/vs/workbench/contrib/deepseek/browser/agentsWindow.ts` | “Open Agents Window”命令：编辑器内整页打开 DSH 前端（经内置 Simple Browser），默认 http://127.0.0.1:3080，配置项 `deepseek.agentsWindowUrl`（**自 v3 起退为开发调试入口**，产品主界面见 agentEditor.ts） |
| `contrib/deepseek/agentEditor.ts` | `src/vs/workbench/contrib/deepseek/browser/agentEditor.ts` | **原生 Agent 主界面 v3（产品形态本体，全面接线版）**：workbench 原生 EditorPane（非嵌入、非网页），直接消费真实 IDeepSeekAgentService 事件契约——会话栏（真实 ACP 会话）、流式消息/思考、工具卡（diff 着色）、计划条、审批卡、功能键（权限询问/全权、引用当前文件、停止）与真实连接状态；无任何本地桩数据。资源 `zovax-agent:/home`，由 agentLayout 启动时整体打开 |
| `contrib/deepseek/deepseekTypes.ts` | `src/vs/workbench/contrib/deepseek/common/deepseekTypes.ts` | 融合层共用类型：会话、DeepSeekSessionUpdate 事件全集（消息/思考/工具/计划/审批/空闲）、审批应答 |
| `contrib/deepseek/deepseekAcp.ts` | `src/vs/workbench/contrib/deepseek/common/deepseekAcp.ts` | ACP 客户端（JSON-RPC/ndjson）：握手、会话、提示、取消、权限应答、更新映射（含工具 diff 明细提取）；已对模拟服务端全程验证 |
| `contrib/deepseek/service/deepseekAgentService.common.ts` | `src/vs/workbench/services/deepseek/common/deepseekAgentService.ts` | Agent 服务接口：onSessionUpdate 事件流、会话 CRUD、发送、审批、取消，及 acpAttached/onAcpAttached 连接状态 |
| `contrib/deepseek/service/deepseekAgentService.ts` | `src/vs/workbench/services/deepseek/browser/deepseekAgentService.ts` | Agent 服务实现（ACP 接通版）：客户端注入后全走真实 DSH；**未注入时绝不伪造回复**，以可见错误收尾 |
| `contrib/deepseek/host/deepseekAcpHostMainService.ts` | `src/vs/platform/deepseek/electron-main/deepseekAcpHostMainService.ts` | 主进程 ACP 宿主：拉起 DSH 进程、按行转发 stdio；以 IChannel 注册为 `deepseekAcp`（装配见 PATCHES #2） |
| `contrib/deepseek/host/deepseekAcpChannel.ts` | `src/vs/workbench/services/deepseek/electron-browser/deepseekAcpChannel.ts` | 把主进程 `deepseekAcp` 通道适配为 ACP 客户端的行通道，并提供 spawn/kill |
| `contrib/deepseek/deepseekAcpBootstrap.ts` | `src/vs/workbench/contrib/deepseek/electron-browser/deepseekAcpBootstrap.ts` | 桌面端接入引导：按 `deepseek.acpCommand` 拉起 DSH（进程目录 `deepseek.acpCwd` 可指定）、握手、注入服务；未配置/失败均弹通知明示，绝不静默空转（引入见 PATCHES #3） |

**全面接线验收（缺一不可）**：① 上表 8 个文件全部同步到位；② PATCHES #2 主进程装配、#3 bootstrap 引入完成；③ 设置 `deepseek.acpCommand`（如 `pnpm dsh --profile acp`），DSH 不在工作区根目录时再设 `deepseek.acpCwd` 指向 DSH 仓库根；④ 重启后状态行显示真实模型名（不是 local-stub），发一条消息得到 DSH 的真实流式回复、工具卡与计划条随任务推进变化。
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
