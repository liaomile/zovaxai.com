/** Durable settings namespace for product-wide GUI onboarding facts. */
export const WELCOME_NOTICE_SETTINGS_NAMESPACE = 'ui-onboarding'

/** Field storing the last welcome notice version the user acknowledged. */
export const WELCOME_NOTICE_ACK_FIELD = 'welcomeNoticeVersion'

/**
 * Bump only when the notice changes materially and every user should see it
 * again. The acknowledgement is compared for exact equality.
 */
export const WELCOME_NOTICE_VERSION = '2026-11-09.nova.2'

/** Nova product welcome copy. */
export const WELCOME_NOTICE_COPY = {
  zh: {
    title: '欢迎使用 Nova',
    body: '这是 Nova 编码智能体产品壳。能力由 Nova Gateway / MCP 提供：对话、技能、审批与自动化都走你们自己的大脑与策略。\n\n继续即可开始使用。密钥与敏感信息请只通过本机安全配置写入，勿粘贴到聊天中。',
    continueLabel: '开始使用',
  },
  en: {
    title: 'Welcome to Nova',
    body: 'This is the Nova coding-agent product shell. Capabilities come from Nova Gateway / MCP — chat, skills, approvals, and automation use your own brain and policies.\n\nContinue to get started. Keep secrets in local secure config — never paste them into chat.',
    continueLabel: 'Get started',
  },
} as const
