/**
 * 平台后端基地址：
 * - 联调骨架：指向 packages/agent-runtime 的本地地址（默认 http://127.0.0.1:4390，真机调试改局域网 IP）；
 * - 生产：指向项目组现有后端的基地址（接口定稿后在此与构建配置里切换，见 docs/ACCOUNT.md）。
 */
export const API_BASE_URL = 'http://127.0.0.1:4390';

/** GitHub OAuth 授权入口（后端提供的跳转地址，App 以系统浏览器打开，回调后换令牌） */
export const GITHUB_OAUTH_URL = `${API_BASE_URL}/v1/auth/github/authorize`;
