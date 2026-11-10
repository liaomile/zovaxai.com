import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { IJob } from '@zovax/platform-api';
import { api } from '../api/client';

/** 任务：巡检任务列表（名称/计划/自治等级/开关状态），点按可立即运行一次（M1 就带，低成本高价值）。 */
export function JobsScreen(): React.JSX.Element {
	const [items, setItems] = useState<IJob[]>([]);
	const [refreshing, setRefreshing] = useState(false);

	const load = useCallback(async () => {
		setRefreshing(true);
		try {
			setItems(await api.listJobs());
		} catch {
			// 同 Inbox：骨架阶段静默
		} finally {
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const onRunNow = async (job: IJob) => {
		try {
			await api.runJobNow(job.id);
			Alert.alert('已触发', `任务「${job.name}」开始运行，结论会进收件箱。`);
		} catch (err) {
			Alert.alert('触发失败', String(err));
		}
	};

	return (
		<FlatList
			data={items}
			keyExtractor={(j) => j.id}
			refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
			ListEmptyComponent={<Text style={styles.empty}>暂无任务。在 IDE 或后端创建巡检任务后会出现在这里。</Text>}
			renderItem={({ item }) => (
				<TouchableOpacity onPress={() => void onRunNow(item)}>
					<View style={styles.row}>
						<Text style={styles.title}>
							{item.name}
							{item.enabled ? '' : '（已停用）'}
						</Text>
						<Text style={styles.meta}>
							{item.schedule ?? item.trigger ?? '手动'} · {item.autonomy} · 通知：{item.notifyMode}
						</Text>
						<Text style={styles.action}>点按立即运行一次</Text>
					</View>
				</TouchableOpacity>
			)}
		/>
	);
}

const styles = StyleSheet.create({
	empty: { textAlign: 'center', color: '#888', marginTop: 48, paddingHorizontal: 24 },
	row: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
	title: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
	meta: { fontSize: 13, color: '#666' },
	action: { fontSize: 12, color: '#0e639c', marginTop: 6 },
});
