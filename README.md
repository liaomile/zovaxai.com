# Zovax AI（暂定名）

基于 VS Code 开源代码二次开发的 AI 智能代码编辑器，以 DeepSeek 大模型为核心，
通过自研 agent harness 把模型能力与编辑器的文件、终端、诊断、搜索、Git 等内嵌功能结合起来。

> 本仓库目前处于 M0 骨架阶段：先沉淀架构、harness 核心包与 AI 界面包，
> 再整体并入 VS Code fork 的 `src/vs/workbench/contrib/deepseek/` 目录。

## 架构

```
┌─────────────────────────────────────────────┐
│  AI 界面层 packages/ai-ui (React)            │
│  聊天气泡 · 思考折叠 · 工具卡片 · 工作流时间线 │
└───────────────▲─────────────────────────────┘
                │ 类型化消息（事件流）
┌───────────────┴─────────────────────────────┐
│  Harness 核心 packages/harness (TypeScript) │
│  agent 循环 · DeepSeek 接入 · 上下文组装     │
│  审批闸口 · 检查点                           │
└───────────────▲─────────────────────────────┘
                │ 工具适配接口（不依赖 VS Code API）
┌───────────────┴─────────────────────────────┐
│  VS Code 本体（fork）                        │
│  文件服务 · 集成终端 · LSP 诊断 · 搜索 · Git │
└─────────────────────────────────────────────┘
```

设计原则：

- **Harness 与编辑器解耦**：harness 不直接依赖 VS Code API，工具经适配层注入，可独立测试与复用。
- **AI 代码隔离**：在 fork 内只新增 `contrib/deepseek` 一个目录，必须改动的官方注册点登记在
  [docs/PATCHES.md](docs/PATCHES.md)，把合并官方新版本时的冲突降到最小。
- **模型分工**：`deepseek-reasoner` 负责规划与复杂推理（思考内容单独成可折叠气泡），
  `deepseek-chat` 负责执行与工具调用。
- **安全默认**：API Key 只存 VS Code SecretStorage；写文件、执行命令默认经过用户审批；
  每次任务自动建立检查点，可回滚。

## 目录

- `packages/harness/` — agent 核心（DeepSeek provider、主循环、工具定义）
- `packages/ai-ui/` — 聊天与工作流界面组件
- `contrib/` — 并入 VS Code fork 的落点说明与后续代码
- `docs/ARCHITECTURE.md` — 完整集成方案
- `docs/PATCHES.md` — 对 VS Code 官方代码的改动登记表

## 里程碑

- [x] M0 骨架：架构、包结构、核心接口
- [ ] M1 对话：流式聊天、思考折叠、可读当前文件答疑
- [ ] M2 工具：读文件 / 搜索 / 诊断 + 审批闸口
- [ ] M3 工作流：任务时间线、diff 审批、终端执行、检查点回滚
- [ ] M4 开源打磨：整仓构建 CI、贡献指南、发行打包

## 许可与商标

- 本项目自有代码以 Apache-2.0 发布（见 LICENSE）。
- VS Code 上游代码为 MIT 许可；本产品为独立发行版，不使用 “Visual Studio Code” 名称与图标，
  正式产品名确定后在此更新。
