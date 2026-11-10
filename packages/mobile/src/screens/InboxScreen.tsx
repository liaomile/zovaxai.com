import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { IInboxMessage } from '@zovax/platform-api';
import { api } from '../api/client';
import { Card, Chip, EmptyState } from '../components/ui';
import { colors, spacing, typography } from '../theme';

/** 收件箱（首页）：巡检结论/晨报/告警以卡片呈现，未读带圆点与浅色底，点击标已读；下拉刷新。 */
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
			ListEmptyComponent={<EmptyState text="暂无消息。巡检有新结论时会出现在这里。" />}
			contentContainerStyle={styles.list}
			renderItem={({ item }) => (
				<Card onPress={() => void onPressItem(item)}>
					<View style={styles.head}>
						{!item.read ? <View style={styles.unreadDot} /> : null}
						<Text style={[typography.sectionTitle, styles.title]} numberOfLines={1}>
							{item.title}
						</Text>
						{item.level !== 'info' ? (
							<Chip
								text={item.level === 'error' ? '错误' : '警告'}
								tone={item.level === 'error' ? 'danger' : 'warning'}
							/>
						) : null}
					</View>
					<Text style={[typography.body, styles.body]} numberOfLines={3}>
						{item.body}
					</Text>
					<Text style={typography.caption}>{new Date(item.createdAt).toLocaleString()}</Text>
				</Card>
			)}
		/>
	);
}

const styles = StyleSheet.create({
	list: { paddingBottom: spacing.lg },
	head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
	unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.unreadDot },
	title: { flex: 1 },
	body: { marginBottom: spacing.sm, lineHeight: 20 },
});
