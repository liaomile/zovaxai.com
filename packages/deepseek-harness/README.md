# packages/deepseek-harness — 完整 DSH（vendored）

本目录存放完整的 DeepSeek Harness（DSH）树，**初始树由项目组推入**，本文件只是占位与约定说明，
推入时可被覆盖。

约定：

- 来源：上游 `deepseek-ai/deepseek-harness`；vendored 后跟随上游版本同步，单独记录同步点（commit/版本）。
- 本目录内的改动要克制：与上游的差异单独列清单，避免后续同步冲突；编辑器专属逻辑放
  `packages/ide-embed/` 与 `contrib/deepseek/`，不要往这里塞。
- 红线：不得把密钥、`.env`、用户数据、商业后台私有配置放进本目录（见仓库根 README 与 .gitignore）。
- 前端入口：`apps/web`（构建产物由 CLI 的 `dsh web` 伺服）；根脚本 `pnpm dsh:web` 指向这里，
  目标地址 http://127.0.0.1:3080 。
