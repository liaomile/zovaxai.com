# @zovax/ai-ui

AI 界面层：在 VS Code fork 的侧边栏视图中渲染，只消费 `@zovax/harness` 的事件流，不直接调编辑器 API。

- `src/ChatView.tsx` — 聊天气泡：正文流式渲染、思考过程折叠、工具调用卡片。
- `src/WorkflowTimeline.tsx` — 工作流时间线：计划步骤、执行状态、检查点。

后续（M1/M3）：接 Markdown 渲染与代码高亮、diff 审批组件、终端输出折叠组件；
样式走 VS Code 主题变量（`--vscode-*`），保证跟随编辑器明暗主题。
