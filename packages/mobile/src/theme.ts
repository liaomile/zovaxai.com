/**
 * 全 App 设计系统：干净、克制、大留白；主色与 IDE 侧保持同一品牌蓝。
 * 所有页面从这里取色与间距，不再各写各的样式数值。
 */
export const colors = {
	bg: '#f7f8fa',
	surface: '#ffffff',
	text: '#111827',
	subtext: '#6b7280',
	faint: '#9ca3af',
	border: '#e5e7eb',
	accent: '#0e639c',
	accentSoft: '#eef6fc',
	success: '#16a34a',
	warning: '#d97706',
	danger: '#dc2626',
	unreadDot: '#0e639c',
};

export const spacing = {
	xs: 4,
	sm: 8,
	md: 12,
	lg: 16,
	xl: 24,
	xxl: 32,
};

export const radius = {
	sm: 8,
	md: 12,
	lg: 16,
};

export const typography = {
	title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
	sectionTitle: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
	body: { fontSize: 14, color: colors.text },
	sub: { fontSize: 13, color: colors.subtext },
	caption: { fontSize: 12, color: colors.faint },
};
