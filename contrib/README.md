# contrib/deepseek — 并入 VS Code fork 的落点

本目录是 AI 模块进入 VS Code fork 的对接说明。整仓 fork 建立后，模块代码落在：

```
src/vs/workbench/contrib/deepseek/
├── browser/    # 视图注册、侧边栏聊天视图、命令与配置
└── common/     # 协议类型（与 packages/harness/src/types.ts 保持一致）
```

对接步骤（M0→M1）：

1. 在 fork 中新建上述目录，把 `packages/ai-ui` 的构建产物挂到聊天视图中渲染。
2. 在 workbench 注册入口 import 本模块（改动登记到 docs/PATCHES.md 第 1 条）。
3. 实现工具适配层：把 VS Code 的文件服务、终端、诊断、搜索、Git 按
   `packages/harness/src/tools.ts` 的定义注入 harness 的 ToolExecutor。
4. API Key 读写走 VS Code SecretStorage，设置项走官方 Configuration 服务。
