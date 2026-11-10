import React, { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { clearToken, loadToken } from './api/client';
import { TabBar } from './components/ui';
import { DevicesScreen } from './screens/DevicesScreen';
import { InboxScreen } from './screens/InboxScreen';
import { JobsScreen } from './screens/JobsScreen';
import { LoginScreen } from './screens/LoginScreen';
import { colors, spacing, typography } from './theme';

type Tab = 'inbox' | 'jobs' | 'devices';

const TABS: { key: Tab; label: string }[] = [
	{ key: 'inbox', label: '收件箱' },
	{ key: 'jobs', label: '任务' },
	{ key: 'devices', label: '设备' },
];

/**
 * App 根（M1 骨架）：登录门 + 底部标签（收件箱/任务/设备）。
 * 审批与“我的”（签到/偏好）在 M2/M3 接入（docs/MOBILE.md）。
 */
export default function App(): React.JSX.Element {
	const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);
	const [tab, setTab] = useState<Tab>('inbox');

	useEffect(() => {
		void loadToken().then((token) => setSignedIn(!!token));
	}, []);

	if (signedIn === undefined) {
		return (
			<SafeAreaView style={styles.center}>
				<Text style={typography.sub}>加载中…</Text>
			</SafeAreaView>
		);
	}
	if (!signedIn) {
		return (
			<SafeAreaView style={styles.root}>
				<LoginScreen onSignedIn={() => setSignedIn(true)} />
			</SafeAreaView>
		);
	}

	const current = TABS.find((t) => t.key === tab);
	return (
		<SafeAreaView style={styles.root}>
			<View style={styles.header}>
				<Text style={typography.title}>{current?.label}</Text>
				<TouchableOpacity
					onPress={() => {
						void clearToken().then(() => setSignedIn(false));
					}}
				>
					<Text style={styles.signOut}>退出</Text>
				</TouchableOpacity>
			</View>
			<View style={styles.content}>
				{tab === 'inbox' ? <InboxScreen /> : tab === 'jobs' ? <JobsScreen /> : <DevicesScreen />}
			</View>
			<TabBar tabs={TABS} active={tab} onChange={(key) => setTab(key as Tab)} />
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1, backgroundColor: colors.bg },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.lg,
		paddingBottom: spacing.sm,
	},
	signOut: { fontSize: 14, color: colors.accent },
	content: { flex: 1 },
});
