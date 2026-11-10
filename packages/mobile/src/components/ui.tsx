import React from 'react';
import {
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
	type TextInputProps,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

/** 通用组件：卡片、按钮、输入框、标签与底部标签栏——四页共用，保证观感一致。 */

export function Card(props: { children: React.ReactNode; onPress?: () => void }): React.JSX.Element {
	const inner = <View style={styles.card}>{props.children}</View>;
	if (!props.onPress) {
		return inner;
	}
	return (
		<TouchableOpacity activeOpacity={0.7} onPress={props.onPress}>
			{inner}
		</TouchableOpacity>
	);
}

export function PrimaryButton(props: { title: string; onPress: () => void; disabled?: boolean }): React.JSX.Element {
	return (
		<TouchableOpacity
			activeOpacity={0.8}
			disabled={props.disabled}
			onPress={props.onPress}
			style={[styles.primaryButton, props.disabled ? styles.buttonDisabled : undefined]}
		>
			<Text style={styles.primaryButtonText}>{props.title}</Text>
		</TouchableOpacity>
	);
}

export function GhostButton(props: { title: string; onPress: () => void }): React.JSX.Element {
	return (
		<TouchableOpacity activeOpacity={0.7} onPress={props.onPress} style={styles.ghostButton}>
			<Text style={styles.ghostButtonText}>{props.title}</Text>
		</TouchableOpacity>
	);
}

export function Field(props: TextInputProps): React.JSX.Element {
	return <TextInput {...props} style={[styles.field, props.style]} placeholderTextColor={colors.faint} />;
}

export function Chip(props: { text: string; tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger' }): React.JSX.Element {
	const tone = props.tone ?? 'default';
	return (
		<View style={[styles.chip, tone === 'accent' ? styles.chipAccent : undefined]}>
			<Text
				style={[
					styles.chipText,
					tone === 'success'
						? { color: colors.success }
						: tone === 'warning'
							? { color: colors.warning }
							: tone === 'danger'
								? { color: colors.danger }
								: tone === 'accent'
									? { color: colors.accent }
									: { color: colors.subtext },
				]}
			>
				{props.text}
			</Text>
		</View>
	);
}

export function StatusDot(props: { online: boolean }): React.JSX.Element {
	return (
		<View
			style={[
				styles.dot,
				{ backgroundColor: props.online ? colors.success : colors.faint },
			]}
		/>
	);
}

export function TabBar(props: {
	tabs: { key: string; label: string }[];
	active: string;
	onChange: (key: string) => void;
}): React.JSX.Element {
	return (
		<View style={styles.tabBar}>
			{props.tabs.map((tab) => {
				const isActive = tab.key === props.active;
				return (
					<TouchableOpacity
						key={tab.key}
						style={styles.tabItem}
						activeOpacity={0.7}
						onPress={() => props.onChange(tab.key)}
					>
						<View style={[styles.tabIndicator, isActive ? styles.tabIndicatorActive : undefined]} />
						<Text style={[styles.tabLabel, isActive ? styles.tabLabelActive : undefined]}>{tab.label}</Text>
					</TouchableOpacity>
				);
			})}
		</View>
	);
}

export function EmptyState(props: { text: string }): React.JSX.Element {
	return <Text style={styles.empty}>{props.text}</Text>;
}

/** 列表错误态：加载失败时给出原因与重试，不再静默空白（生产体验基线） */
export function ListError(props: { message: string; onRetry: () => void }): React.JSX.Element {
	return (
		<View style={styles.errorBox}>
			<Text style={styles.errorText}>{props.message}</Text>
			<TouchableOpacity onPress={props.onRetry} style={styles.errorRetry}>
				<Text style={styles.errorRetryText}>重试</Text>
			</TouchableOpacity>
		</View>
	);
}

export function SectionTitle(props: { text: string }): React.JSX.Element {
	return <Text style={[typography.sectionTitle, styles.sectionTitle]}>{props.text}</Text>;
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: colors.surface,
		borderRadius: radius.md,
		borderWidth: 1,
		borderColor: colors.border,
		padding: spacing.lg,
		marginHorizontal: spacing.lg,
		marginTop: spacing.md,
	},
	primaryButton: {
		backgroundColor: colors.accent,
		borderRadius: radius.sm,
		paddingVertical: spacing.md,
		alignItems: 'center',
	},
	buttonDisabled: { opacity: 0.5 },
	primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
	ghostButton: {
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: radius.sm,
		paddingVertical: spacing.md,
		alignItems: 'center',
		backgroundColor: colors.surface,
	},
	ghostButtonText: { color: colors.text, fontSize: 15, fontWeight: '500' },
	field: {
		backgroundColor: colors.surface,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: radius.sm,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
		fontSize: 15,
		color: colors.text,
	},
	chip: {
		backgroundColor: colors.bg,
		borderRadius: 999,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		alignSelf: 'flex-start',
	},
	chipAccent: { backgroundColor: colors.accentSoft },
	chipText: { fontSize: 12 },
	dot: { width: 8, height: 8, borderRadius: 4 },
	tabBar: {
		flexDirection: 'row',
		backgroundColor: colors.surface,
		borderTopWidth: 1,
		borderTopColor: colors.border,
		paddingBottom: spacing.sm,
	},
	tabItem: { flex: 1, alignItems: 'center', paddingTop: spacing.sm, gap: spacing.xs },
	tabIndicator: { width: 20, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
	tabIndicatorActive: { backgroundColor: colors.accent },
	tabLabel: { fontSize: 13, color: colors.subtext },
	tabLabelActive: { color: colors.accent, fontWeight: '600' },
	empty: {
		textAlign: 'center',
		color: colors.faint,
		fontSize: 14,
		marginTop: spacing.xxl,
		paddingHorizontal: spacing.xl,
		lineHeight: 21,
	},
	errorBox: {
		marginHorizontal: spacing.lg,
		marginTop: spacing.md,
		padding: spacing.lg,
		borderRadius: radius.md,
		borderWidth: 1,
		borderColor: colors.danger,
		backgroundColor: colors.surface,
		alignItems: 'center',
		gap: spacing.sm,
	},
	errorText: { fontSize: 14, color: colors.danger, textAlign: 'center' },
	errorRetry: {
		borderWidth: 1,
		borderColor: colors.danger,
		borderRadius: radius.sm,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
	},
	errorRetryText: { fontSize: 14, color: colors.danger, fontWeight: '600' },
	sectionTitle: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
});
