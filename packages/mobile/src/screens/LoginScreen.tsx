import React, { useState } from 'react';
import { Alert, Button, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { exchangeEmailCode, requestEmailCode } from '../api/client';
import { GITHUB_OAUTH_URL } from '../config';

/**
 * 登录页：邮箱验证码（请求验证码 -> 输入 -> 换令牌）＋ GitHub OAuth（系统浏览器跳转）。
 * 与 IDE 同一账号体系（docs/ACCOUNT.md）；OAuth 回调深链的接续在 M1 后半段补（见 docs/MOBILE.md）。
 */
export function LoginScreen(props: { onSignedIn: () => void }): React.JSX.Element {
	const [email, setEmail] = useState('');
	const [code, setCode] = useState('');
	const [codeSent, setCodeSent] = useState(false);
	const [busy, setBusy] = useState(false);

	const onRequestCode = async () => {
		if (!email.includes('@')) {
			Alert.alert('请输入有效邮箱');
			return;
		}
		setBusy(true);
		try {
			await requestEmailCode(email.trim());
			setCodeSent(true);
			Alert.alert('验证码已发送，请查收邮箱');
		} catch (err) {
			Alert.alert('发送失败', String(err));
		} finally {
			setBusy(false);
		}
	};

	const onExchange = async () => {
		setBusy(true);
		try {
			await exchangeEmailCode(email.trim(), code.trim());
			props.onSignedIn();
		} catch (err) {
			Alert.alert('登录失败', String(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Zovax</Text>
			<Text style={styles.subtitle}>登录后与你的 IDE 同步任务、巡检与审批</Text>
			<TextInput
				style={styles.input}
				placeholder="邮箱"
				autoCapitalize="none"
				keyboardType="email-address"
				value={email}
				onChangeText={setEmail}
			/>
			{codeSent ? (
				<>
					<TextInput
						style={styles.input}
						placeholder="邮箱验证码"
						autoCapitalize="none"
						keyboardType="number-pad"
						value={code}
						onChangeText={setCode}
					/>
					<Button title={busy ? '登录中…' : '登录'} onPress={onExchange} disabled={busy} />
				</>
			) : (
				<Button title={busy ? '发送中…' : '发送验证码'} onPress={onRequestCode} disabled={busy} />
			)}
			<View style={styles.gap} />
			<Button title="用 GitHub 登录" onPress={() => void Linking.openURL(GITHUB_OAUTH_URL)} />
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
	title: { fontSize: 32, fontWeight: '700', textAlign: 'center' },
	subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 12 },
	input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
	gap: { height: 8 },
});
