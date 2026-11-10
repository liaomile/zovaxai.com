import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { IJob } from '@zovax/platform-api';
import { api } from '../api/client';
import { Card, Chip, EmptyState, ListError, PrimaryButton } from '../components/ui';
import { spacing, typography } from '../theme';

/** 任务：巡检任务以卡片呈现（计划/自治等级/通知策略为标签），每卡带“立即运行”。 */
export function JobsScreen(): React.JSX.Element {
	const [items, setItems] = useState<IJob[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);

	const load = useCallback(async () => {
		setRefreshing(true);
		try {
			setItems(await api.listJobs());
			setError(undefined);
		} catch {
			setError('加载失败，请检查网络或后端服务是否可用。');
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
			ListEmptyComponent={
				error ? (
					<ListError message={error} onRetry={() => void load()} />
				) : (
					<EmptyState text="暂无任务。在 IDE 或后端创建巡检任务后会出现在这里。" />
				)
			}
			contentContainerStyle={styles.list}
			renderItem={({ item }) => (
				<Card>
					<Text style={[typography.sectionTitle, styles.title]}>
						{item.name}
						{item.enabled ? '' : '（已停用）'}
					</Text>
					<View style={styles.chips}>
						<Chip text={item.schedule ?? item.trigger ?? '手动触发'} tone="accent" />
						<Chip text={`自治 ${item.autonomy}`} />
						<Chip text={`通知 ${item.notifyMode}`} />
					</View>
					<PrimaryButton title="立即运行一次" onPress={() => void onRunNow(item)} disabled={!item.enabled} />
				</Card>
			)}
		/>
	);
}

const styles = StyleSheet.create({
	list: { paddingBottom: spacing.lg },
	title: { marginBottom: spacing.sm },
	chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
});
