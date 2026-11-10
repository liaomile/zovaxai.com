import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import type { IDevice } from '@zovax/platform-api';
import { api } from '../api/client';
import { Card, EmptyState, Field, PrimaryButton, SectionTitle, StatusDot } from '../components/ui';
import { spacing, typography } from '../theme';

/**
 * 设备与配对：上方配对卡（输入 IDE 给的配对码完成绑定；相机扫码随后接入），
 * 下方设备卡列表（类型图标、在线圆点、最近活跃）。
 */
export function DevicesScreen(): React.JSX.Element {
	const [items, setItems] = useState<IDevice[]>([]);
	const [code, setCode] = useState('');

	const load = useCallback(async () => {
		try {
			setItems(await api.listDevices());
		} catch {
			// 骨架阶段静默
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const onPair = async () => {
		if (!code.trim()) {
			return;
		}
		try {
			await api.completePairing(code.trim(), { kind: 'mobile', name: 'Zovax App' });
			setCode('');
			Alert.alert('配对成功', '这台手机已与 IDE 绑定到同一账号。');
			void load();
		} catch (err) {
			Alert.alert('配对失败', String(err));
		}
	};

	return (
		<View style={styles.container}>
			<Card>
				<Text style={[typography.sectionTitle, styles.pairTitle]}>与 IDE 配对</Text>
				<Text style={[typography.sub, styles.pairHint]}>
					在 IDE 里打开“生成配对码”，把配对码输入下面（二维码扫描随后接入）：
				</Text>
				<Field placeholder="配对码" autoCapitalize="none" value={code} onChangeText={setCode} />
				<View style={styles.pairButton}>
					<PrimaryButton title="完成配对" onPress={onPair} />
				</View>
			</Card>
			<SectionTitle text="我的设备" />
			<FlatList
				data={items}
				keyExtractor={(d) => d.id}
				ListEmptyComponent={<EmptyState text="暂无设备。" />}
				renderItem={({ item }) => (
					<Card>
						<View style={styles.deviceHead}>
							<Text style={typography.sectionTitle}>
								{item.kind === 'ide' ? '🖥 ' : item.kind === 'mobile' ? '📱 ' : '🤖 '}
								{item.name}
							</Text>
							<StatusDot online={item.online} />
						</View>
						<Text style={typography.caption}>
							{item.online ? '在线' : '离线'} · 最近活跃 {new Date(item.lastSeenAt).toLocaleString()}
						</Text>
					</Card>
				)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	pairTitle: { marginBottom: spacing.sm },
	pairHint: { marginBottom: spacing.md, lineHeight: 19 },
	pairButton: { marginTop: spacing.md },
	deviceHead: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: spacing.xs,
	},
});
