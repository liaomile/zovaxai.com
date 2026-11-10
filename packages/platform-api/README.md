# packages/platform-api — 平台共享契约

IDE、手机 App、后台运行时三方共用的接口类型与类型化客户端，避免三方各写一份、各漂移一份。

- `src/types.ts`：账号、设备（IDE/手机/运行时）与配对、后台任务与运行记录、收件箱消息、审批；
- `src/client.ts`：`PlatformApiClient`（fetch 实现，令牌由宿主注入），覆盖
  `/v1/account`、`/v1/devices`（含扫码配对）、`/v1/jobs`、`/v1/runs`、`/v1/inbox`、`/v1/approvals`。

接口口径来源：docs/ACCOUNT.md（账户/签到）、docs/AUTONOMY.md（任务/巡检/触达）、docs/MOBILE.md（配对）。
现有后端定稿后以其字段为准回填本包，三方重新构建即同步。
