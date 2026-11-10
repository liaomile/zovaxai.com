import React, { useEffect, useState } from 'react';
import { Button, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { clearToken, loadToken } from './api/client';
import { DevicesScreen } from './screens/DevicesScreen';
import { InboxScreen } from './screens/InboxScreen';
import { JobsScreen } from './screens/JobsScreen';
import { LoginScreen } from './screens/LoginScreen';

type Tab = 'inbox' | 'jobs' | 'devices';

/**
 * App 根（M1 骨架）：无导航库的极简标签切换——收件箱 / 任务 / 设备。
 * 登录态以令牌存在为准；审批与“我的”（签到/偏好）在 M2/M3 接入（docs/MOBILE.md）。
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
				<Text>加载中…</Text>
			</SafeAreaView>
		);
	}
	if (!signedIn) {
		return (
			<SafeAreaView style={styles.flex}>
				<LoginScreen onSignedIn={() => setSignedIn(true)} />
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.flex}>
			<View style={styles.header}>
				<Text style={styles.headerTitle}>
					{tab === 'inbox' ? '收件箱' : tab === 'jobs' ? '任务' : '设备'}
				</Text>
				<Button
					title="退出"
					onPress={() => {
						void clearToken().then(() => setSignedIn(false));
					}}
				/>
			</View>
			<View style={styles.flex}>
				{tab === 'inbox' ? <InboxScreen /> : tab === 'jobs' ? <JobsScreen /> : <DevicesScreen />}
			</View>
			<View style={styles.tabBar}>
				<Button title="收件箱" onPress={() => setTab('inbox')} />
				<Button title="任务" onPress={() => setTab('jobs')} />
				<Button title="设备" onPress={() => setTab('devices')} />
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderBottomWidth: 1,
		borderBottomColor: '#eee',
	},
	headerTitle: { fontSize: 18, fontWeight: '700' },
	tabBar: {
		flexDirection: 'row',
		justifyContent: 'space-around',
		paddingVertical: 8,
		borderTopWidth: 1,
		borderTopColor: '#eee',
	},
});
