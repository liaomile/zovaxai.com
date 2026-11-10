import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import type { IDevice } from '@zovax/platform-api';
import { api } from '../api/client';

/**
 * 设备与配对：列出账号下设备（IDE/手机/运行时）与在线状态；
 * 配对用配对码完成（IDE 侧生成二维码/配对码，App 在此输入——相机扫码在 M1 后半段接扫码库）。
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
			<View style={styles.pairBox}>
				<Text style={styles.pairTitle}>与 IDE 配对</Text>
				<Text style={styles.pairHint}>在 IDE 里打开“生成配对码”，把配对码输入下面（二维码扫描随后接入）：</Text>
				<TextInput
					style={styles.input}
					placeholder="配对码"
					autoCapitalize="none"
					value={code}
					onChangeText={setCode}
				/>
				<Button title="完成配对" onPress={onPair} />
			</View>
			<FlatList
				data={items}
				keyExtractor={(d) => d.id}
				ListEmptyComponent={<Text style={styles.empty}>暂无设备。</Text>}
				renderItem={({ item }) => (
					<View style={styles.row}>
						<Text style={styles.title}>
							{item.kind === 'ide' ? '🖥 ' : item.kind === 'mobile' ? '📱 ' : '🤖 '}
							{item.name}
						</Text>
						<Text style={styles.meta}>
							{item.online ? '在线' : '离线'} · 最近活跃 {new Date(item.lastSeenAt).toLocaleString()}
						</Text>
					</View>
				)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	pairBox: { padding: 16, gap: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
	pairTitle: { fontSize: 16, fontWeight: '600' },
	pairHint: { fontSize: 13, color: '#666' },
	input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 15 },
	empty: { textAlign: 'center', color: '#888', marginTop: 32 },
	row: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
	title: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
	meta: { fontSize: 12, color: '#999' },
});
