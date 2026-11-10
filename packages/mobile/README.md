# packages/mobile — 手机 App（脚手架占位）

设计见 `docs/MOBILE.md`。选型定为 React Native + TypeScript（复用 `packages/platform-api`
的类型与客户端）。本目录先占位，App 工程脚手架在 M1 里程碑按以下结构初始化：

```
packages/mobile/
  src/
    api/          platform-api 客户端装配（基地址、令牌存取 Keychain/Keystore）
    screens/      Inbox / Jobs / Approvals / Devices / Profile（签到与偏好）
    pairing/      扫码配对流程（扫 IDE 二维码 -> completePairing）
    push/         APNs / 安卓聚合推送的注册与点击跳转
  app.json / babel.config.js / index.js（RN 模板生成，不手写维护）
```

初始化命令（M1 执行时）：在 packages/ 下用 React Native 模板生成 mobile 工程后，
把模板文件合入本目录，业务代码按上表结构落位；注意根 .gitignore 的红线同样适用于本目录
（密钥、.env、用户数据、推送证书私钥一律不入库）。
