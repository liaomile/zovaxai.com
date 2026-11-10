# Agent Note: dsh web 组合默认挂载会话遥测（OTel 上报）

Status: implemented

[English](2026-07-31-web-telemetry-default-mount.md) | 中文

## 问题

遥测 seam 与 OTel 后端（[revival Note](2026-07-23-session-telemetry-otel-revival.md)）自完成以来从未接入任何部署组合：没有 roster 行、没有开关、没有节奏口径，内部部署对用户会话的可观测性为零。需要一个部署决策：哪些 surface 上报、报到哪、什么节奏、怎么关、CI 怎么隔离。

## 决策

共享 dsh base 不再挂载 `session-telemetry-otel`，也不携带内置 collector；该产品组合由[默认产品卸挂 Note](../simplification/2026-09-24-remove-default-telemetry-mount.md)拥有。本 Note 保留部署方自行插入该行时仍适用的节奏、退出排空、压缩与 CI 隔离口径。

| 决策项 | 取值 | 理由 |
|---|---|---|
| 挂载面 | 部署 profile 或 overlay 插入（非共享 base） | 隐私优先默认；自托管上报保持显式 |
| 共享模式 | 插入行上显式 `mode: FULL` 或 `FEEDBACK_ONLY`；省略 mode 为 `DISABLED` | 未插入该行的新 profile 不导出任何内容 |
| endpoint | 上传模式必填 `exporter.url`；无产品默认 URL | collector 由部署方拥有 |
| 硬性退出 | `DSH_TELEMETRY_DISABLED` 非空（含 `0`/`false`）即在存在该行时禁用 | 启动器 patch 在加载期传输校验之前生效 |
| 上报节奏 | 上传模式中为 `processor.scheduledDelayMillis: 10000`（10s/批） | 在会话运行期间流式上报，而非仅在退出时上报；崩溃至多丢失最后一个尚未导出间隔内的数据 |
| 退出 drain 上界 | `exporter.timeoutMillis: 1000` + `maxExportBatchSize: 2048`（与 maxQueueSize 相等） + `exportTimeoutMillis: 1500` + `shutdownTimeoutMillis: 3000` | collector 不可达的常规故障会在约 1s 内放行；由 DSH 管理的 3s 外层上限覆盖 SDK 先执行的无界 `forceFlush()` 等待 |
| 压缩 | `compression: gzip` | 事件 body 含全文，跨机房带宽 |
| CI 隔离 | GitHub 工作流顶层 `env: DSH_TELEMETRY_DISABLED: '1'` | 当任务或 fixture 仍插入上传行时的纵深防御 |

[模式显式启用 Note](2026-08-10-telemetry-default-off.md) 拥有已挂载后端的授权语义。验证 OTLP 投递的真实 Loader 组合测试会自行插入该行并显式选择每种上传模式。

## 考虑过的替代方案

**默认不挂载，部署方自行添加配置行。** 最初为支持 DISABLED 的 base 挂载而被否决；后来由[默认产品卸挂 Note](../simplification/2026-09-24-remove-default-telemetry-mount.md)出于隐私原因采纳。

**开关做成 config 字段而非 env patch。** 不可行：cordis 行没有 config 层的 disable 语义，且 `exporter.url` 校验在插件构造期 fail-loud，开关必须在 Loader 之前生效——AppCLIEntry patch 层是唯一落点。

**退出时 `Promise.race` 兜底超时。** 最初暂缓，是因为 SDK 参数看似已经将后端排空耗时限制在约 1.5-3s（通常 <100ms），实测 SIGINT 到退出耗时 110ms-1.1s。后来在 Linux 沙箱中复现并证明，`BatchLogRecordProcessor.shutdown()` 可能在 `exporter.forceFlush()` 中永久等待，无法进入受 `exportTimeoutMillis` 限制的完成 Promise。因此，[CLI 关闭修复](../bug-fix/2026-08-03-cli-signal-shutdown-escalation.md) 既为这一特定缺口增加 3 秒后端上限，也为整棵插件树增加 5 秒进程级上限和重复信号退出途径。

## 后果

- 未插入遥测行时运行 `dsh web`，不会发出遥测网络请求。
- **插入的行默认不挂载任何脱敏规则**：显式启用的导出即原始捕获副本。跨信任边界前必须先挂载 `session-telemetry/record` 规则。匿名 user id 由[匿名 user id Note](2026-07-31-telemetry-anonymous-user-id.md)交付。
- 测试载具仅在需要共享披露或 OTLP 投递证明时插入遥测。
