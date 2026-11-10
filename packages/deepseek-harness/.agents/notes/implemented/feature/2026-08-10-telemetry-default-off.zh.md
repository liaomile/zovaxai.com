# Agent Note: 遥测必须显式启用

Status: implemented

[English](2026-08-10-telemetry-default-off.md) | 中文

## 问题

DeepSeek Harness 有两路出站遥测数据流。在内测阶段，共享基础配置挂载了带内建生产 endpoint 的遥测，两路数据流默认上报以帮助诊断上报的问题：会话 OTel 后端在省略 `mode` 时可能导出完整会话内容、工具数据、提示词和工作区路径，而 dsh-sdk 启动器数据流则无条件外发。因此，全新安装无需部署方明确选择便允许向外上报。

## 决策

两路数据流在组合挂载 OTel 后端时，都使用 `DSH_TELEMETRY_MODE` 作为正向授权配置。未设置和空值都解析为 `DISABLED`。`@deepseek-ai/dsh-session-telemetry-otel` 也将省略的 `mode` 解析为 `DISABLED`；该模式不构造 OTel 提供方、处理器或导出器，并将反馈留在本地会话日志中。dsh 共享 base 不再挂载该行；产品组合由[默认产品卸挂 Note](../simplification/2026-09-24-remove-default-telemetry-mount.md)拥有。插入后端的部署通过 `FULL` 或 `FEEDBACK_ONLY` 显式启用 Session Log 共享。当该行存在时，任何非空 `DSH_TELEMETRY_DISABLED` 仍是具有最高优先级的加载前硬性退出开关。插入上传行时的节奏与退出排空设置仍见[挂载口径 Note](2026-07-31-web-telemetry-default-mount.md)。

dsh-sdk 启动器及其数据流已由[SDK 项目工具链移除决策](../simplification/2026-08-11-remove-sdk-project-toolchain.md)删除。[CLI reference README](../../../../apps/cli/reference/README.md) 记录了当前口径：共享 base 不导出任何内容；显式插入的上传模式需要部署方自有的 collector URL。恢复后的[测试阶段引导声明](2026-08-13-shared-modal-product-onboarding.md)不包含遥测文案。

## 考虑过的替代方案

**保留默认退出机制并改进披露。** 不采用：披露不能让缺少配置构成发送数据的明确授权，尤其是会话遥测可能包含完整的本地内容。

**将会话遥测默认设为 `FEEDBACK_ONLY`。** 不采用：即使部署方没有显式启用向外上报，记录反馈仍会触发上传。默认值必须让会话及其反馈都留在本地。

**添加项目级授权标记。** 不采用：`DSH_TELEMETRY_MODE` 已能表达两路数据流的授权；另一个配置项会产生冲突设置，并需要启动器专用的解析逻辑。

**删除两种遥测实现。** 不采用：内部部署仍需要显式启用 `FULL` 与反馈触发的上报；在 `FULL` 下，启动器数据流也仍有用。

## 后果

全新 profile 因共享 base 不挂载后端而不发出任何遥测网络请求。插入该行的部署选择 `FEEDBACK_ONLY` 或 `FULL` 并自备 collector。该行存在时硬性退出继续生效，上传模式也保留 endpoint 校验、脱敏责任、批处理和关闭行为。
