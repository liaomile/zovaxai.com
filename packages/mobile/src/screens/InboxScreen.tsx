import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { IInboxMessage } from '@zovax/platform-api';
import { api } from '../api/client';

/** 收件箱（首页）：巡检结论/晨报/告警，点击标已读；下拉刷新。推送接入后未读数与角标同步（M2）。 */
export function InboxScreen(): React.JSX.Element {
	const [items, setItems] = useState<IInboxMessage[]>([]);
	const [refreshing, setRefreshing] = useState(false);

	const load = useCallback(async () => {
		setRefreshing(true);
		try {
			setItems(await api.listInbox());
		} catch {
			// 骨架阶段静默失败（未连上后端时不打扰），生产加错误态
		} finally {
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const onPressItem = async (item: IInboxMessage) => {
		if (!item.read) {
			await api.markInboxRead(item.id).catch(() => undefined);
			setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, read: true } : m)));
		}
	};

	return (
		<FlatList
			data={items}
			keyExtractor={(m) => m.id}
			refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
			ListEmptyComponent={<Text style={styles.empty}>暂无消息。巡检有新结论时会出现在这里。</Text>}
			renderItem={({ item }) => (
				<TouchableOpacity onPress={() => void onPressItem(item)}>
					<View style={[styles.row, item.read ? styles.read : styles.unread]}>
						<Text style={styles.title}>
							{item.level === 'error' ? '⛔ ' : item.level === 'warning' ? '⚠️ ' : ''}
							{item.title}
						</Text>
						<Text style={styles.body} numberOfLines={3}>
							{item.body}
						</Text>
						<Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
					</View>
				</TouchableOpacity>
			)}
		/>
	);
}

const styles = StyleSheet.create({
	empty: { textAlign: 'center', color: '#888', marginTop: 48, paddingHorizontal: 24 },
	row: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
	unread: { backgroundColor: '#f5f9ff' },
	read: { backgroundColor: '#fff' },
	title: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
	body: { fontSize: 14, color: '#333' },
	time: { fontSize: 12, color: '#999', marginTop: 6 },
});
