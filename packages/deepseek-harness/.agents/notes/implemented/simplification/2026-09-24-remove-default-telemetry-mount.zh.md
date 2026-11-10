# Agent Note: 移除默认会话遥测挂载与 DeepSeek collector

Status: implemented

[English](2026-09-24-remove-default-telemetry-mount.md) | 中文

## 问题

共享 dsh base 曾挂载 `@deepseek-ai/dsh-session-telemetry-otel`，并内置 `https://harness-telemetry.deepseeksvc.com/v1/logs` 端点。模式默认 `DISABLED`，因此全新安装不会发起网络请求，但默认产品路径仍携带外发上报能力与 DeepSeek collector URL。从不显式启用上报的隐私敏感部署，不应在共享 base 上附带这条通路。

## 决策

共享 base 组合包不挂载 `session-telemetry-otel`，也不将 `@deepseek-ai/dsh-session-telemetry-otel` 声明为依赖。没有内置 collector URL。需要 OTLP 上报的部署在 profile 或 overlay 上自行插入该包，并显式配置 `exporter.url` 与 `mode`（`FULL` 或 `FEEDBACK_ONLY`）。CLI 仍依赖该包，以便这些 patch 层可以解析它，模式与可选 patch 层插件 `dsh-mcp-client` 相同。

当组合仍挂载该行时，省略的 `mode` 仍解析为 `DISABLED`，任何非空的 `DSH_TELEMETRY_DISABLED` 仍在加载前禁用该行。插入上传模式配置行时的节奏与退出排空建议，仍以[原默认挂载 Note](../feature/2026-07-31-web-telemetry-default-mount.md)为准。[模式显式启用 Note](../feature/2026-08-10-telemetry-default-off.md) 仍拥有已挂载后端的授权语义。

## 验证

base 组合包测试断言组合中没有 `session-telemetry-otel` 行，且 base 包不依赖 `@deepseek-ai/dsh-session-telemetry-otel`。仓库检索在历史 Agent Note 之外找不到 `harness-telemetry.deepseeksvc.com`。Web e2e scaffold 仅在场景传入 `telemetryUrl` 时插入该行。

## 考虑过的替代方案

**保留已禁用的默认挂载，只删除 DeepSeek URL。** 不采用：DISABLED 行仍会构造插件面，并暗示产品拥有上报席位；卸挂才能从每个默认 profile 去掉这条通路。

**整包删除 session-telemetry 相关包。** 不采用：自托管部署与真实 Loader 组合测试仍需要 seam 与 OTel 后端；隐私目标通过移除默认产品路径即可满足。

**保留 base 挂载并仅依赖 `DISABLED`。** 不采用：内置 collector URL 与已挂载能力仍是常驻的启用风险，也违背「默认产品不携带外发上报」的隐私要求。

## 后果

`dsh web` 及其他基于 base 的 profile 在操作者插入遥测之前不会导出任何内容。自托管 OTLP 仍可通过显式插入获得。未挂载后端时，`/feedback` 披露共享未配置。CI 仍可保留 `DSH_TELEMETRY_DISABLED=1`，作为对仍插入该行的组合的纵深防御。
