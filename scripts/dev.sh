#!/bin/sh
# 薄包装：统一走 node scripts/dev.mjs（跨平台逻辑只维护一份）
exec node "$(dirname "$0")/dev.mjs"
