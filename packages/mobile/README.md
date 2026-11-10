# packages/mobile — 手机 App（M1 骨架已落地）

设计见 `docs/MOBILE.md`。选型：React Native + TypeScript，接口面复用 `packages/platform-api`。

已落地（M1，均已通过 tsc 类型检查）：

```
packages/mobile/
  index.js / app.json / babel.config.js / metro.config.js / tsconfig.json   RN 模板标准文件
  src/
    config.ts          后端基地址（联调默认指向 agent-runtime 本地地址，生产切现有后端）
    api/client.ts      platform-api 装配＋令牌存取＋邮箱验证码两步登录
    App.tsx            极简标签骨架：收件箱 / 任务 / 设备（未登录先走登录页）
    screens/
      LoginScreen.tsx    邮箱验证码登录＋GitHub OAuth 入口（回调深链接续 M1 后半段）
      InboxScreen.tsx    收件箱：下拉刷新、点按标已读
      JobsScreen.tsx     巡检任务列表＋点按立即运行
      DevicesScreen.tsx  设备列表＋配对码配对（相机扫码随后接扫码库）
```

还差（在真机/模拟器上完成）：用 RN 模板生成 android/ios 原生工程目录合入本目录后即可 run；
令牌存取生产应从 AsyncStorage 迁 Keychain/Keystore；推送（APNs/安卓聚合）与审批页在 M2。

红线同根 .gitignore：推送证书私钥、签名密钥、.env 一律不入库。
