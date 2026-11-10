# packages/agent-runtime — 后台自治运行时（骨架，AUTONOMY A1）

实现 docs/AUTONOMY.md 的第一层：让 agent 在无人值守时也能干活、巡检、发消息。

- `src/cron.ts`：五段 cron 匹配（巡检/晨报够用）；
- `src/runner.ts`：无头执行器——拉起 DSH 的 ACP 服务开隔离会话执行任务，
  权限请求一律回绝（后台不自动批准，要动手的转 L1 审批）；
- `src/store.ts`：JSON 文件存储（jobs/runs/inbox），生产换现有后端数据库；
- `src/server.ts`：调度循环（每分钟按 cron 触发、同一任务不并发）＋ HTTP API
  （与 packages/platform-api 契约对齐的服务端子集：jobs/runs/inbox/approvals 占位）；
  触达纪律在此执行：on-change 只在结论变化时才进收件箱，失败必报（silent 除外）。

本地跑：

```bash
pnpm --filter @zovax/agent-runtime build
RUNTIME_TOKEN=dev-token node packages/agent-runtime/dist/index.js
# 另开终端：建一个巡检任务并立即触发
curl -H "Authorization: Bearer dev-token" -X POST localhost:4390/v1/jobs \
  -d '{"id":"ci-watch","name":"CI 巡检","prompt":"检查仓库 CI 状态并给结论","tools":["github.read"],"autonomy":"L0","notifyMode":"on-change","enabled":true}'
curl -H "Authorization: Bearer dev-token" -X POST localhost:4390/v1/jobs/ci-watch/run
curl -H "Authorization: Bearer dev-token" localhost:4390/v1/inbox
```

注意：真正执行任务需要本机能跑起 DSH（`pnpm dsh --profile acp`，在其 harness 目录内），
模型凭据走 DSH 自身配置，运行时不接触明文。
