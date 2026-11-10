# Zovax AI

把完整的 DeepSeek Harness（DSH）前端整页嵌入 IDE 的 AI 代码编辑器：
编辑器内直接打开整页 Agents Window，而不是另开 Chrome 窗口。

## 仓库结构

```
zovaxai.com/
  packages/deepseek-harness/   完整 DSH（vendored，初始树由项目组提供，跟随上游同步）
  packages/ide-embed/          IDE 内嵌胶水扩展（Webview 整页嵌入，可独立在 VS Code 中调试）
  packages/platform-api/       平台共享契约：IDE / 手机 App / 后台运行时共用的类型与 API 客户端
  packages/agent-runtime/      后台自治运行时骨架：定时巡检、ACP 无头执行、收件箱触达（docs/AUTONOMY.md）
  packages/mobile/             手机 App（React Native + TS）：收件箱、任务、审批、扫码配对（docs/MOBILE.md）
  contrib/deepseek/            VS Code fork 侧补丁源码（同步进 fork 的 contrib/deepseek）
  docs/                        设计文档：EMBEDDING / FUSION / AUTONOMY / MOBILE / ACCOUNT / DEEP-INTEGRATION / PORTING-MAP / PATCHES
  scripts/                     开发脚本：dev（起全套）、dsh-web（只起 DSH 前端）
```

技术路线：**先整页嵌入可用**（docs/EMBEDDING.md），进而**融为一体**（docs/FUSION.md：
进程托管、主题/上下文同步、页面↔IDE 双向桥）；原生重写（docs/DEEP-INTEGRATION.md）并行推进，不挡嵌入交付。

## 验收标准

1. `pnpm install` 能完成依赖安装；
2. `pnpm dsh:web` 后，http://127.0.0.1:3080 能打开完整 Agents Window；
3. IDE 里执行命令 **“Open Agents Window”** 默认以 embed 方式在编辑器内打开整页，不是外跳浏览器。

## 快速开始

```bash
pnpm install     # 安装依赖
pnpm dev         # 一键：安装依赖 -> 起 DSH 前端(3080) -> 打印 IDE 打开方式
# 或只起前端：
pnpm dsh:web     # http://127.0.0.1:3080
```

IDE 侧两种打开方式（任选其一，行为一致）：

- **fork 版**：把 `contrib/deepseek/` 同步进 VS Code fork 后，命令面板执行 “Open Agents Window”；
- **原版 VS Code 调试**：以 `packages/ide-embed/` 为扩展目录启动扩展宿主（F5），同样执行该命令。

页面地址可配置（默认 `http://127.0.0.1:3080`）：fork 侧配置项 `deepseek.agentsWindowUrl`，
扩展侧配置项 `zovax.agentsWindow.url`。

## 提交红线（禁止入库）

密钥与令牌、`.env`、`.venv`、`node_modules`、用户数据、商业后台私有配置，一律不得提交。
已在 `.gitignore` 中拦截；新文件入库前自查一遍。

## 许可与商标

- 本项目自有代码以 Apache-2.0 发布（见 LICENSE）。
- `packages/deepseek-harness/` 为 DeepSeek Harness 的 vendored 副本，遵循其上游许可。
- VS Code 上游代码为 MIT 许可；本产品为独立发行版，不使用 “Visual Studio Code” 名称与图标。
