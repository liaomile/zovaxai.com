import React, { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { exchangeEmailCode, requestEmailCode } from '../api/client';
import { Field, GhostButton, PrimaryButton } from '../components/ui';
import { GITHUB_OAUTH_URL } from '../config';
import { colors, spacing } from '../theme';

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
			<View style={styles.brand}>
				<Text style={styles.logo}>✦</Text>
				<Text style={styles.name}>Zovax</Text>
				<Text style={styles.tagline}>登录后与你的 IDE 同步任务、巡检与审批</Text>
			</View>
			<View style={styles.form}>
				<Field
					placeholder="邮箱"
					autoCapitalize="none"
					keyboardType="email-address"
					value={email}
					onChangeText={setEmail}
				/>
				{codeSent ? (
					<>
						<Field
							placeholder="邮箱验证码"
							autoCapitalize="none"
							keyboardType="number-pad"
							value={code}
							onChangeText={setCode}
						/>
						<PrimaryButton title={busy ? '登录中…' : '登录'} onPress={onExchange} disabled={busy} />
					</>
				) : (
					<PrimaryButton title={busy ? '发送中…' : '发送验证码'} onPress={onRequestCode} disabled={busy} />
				)}
				<GhostButton title="用 GitHub 登录" onPress={() => void Linking.openURL(GITHUB_OAUTH_URL)} />
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'center', gap: spacing.xxl },
	brand: { alignItems: 'center', gap: spacing.sm },
	logo: { fontSize: 40, color: colors.accent },
	name: { fontSize: 30, fontWeight: '700', color: colors.text },
	tagline: { fontSize: 14, color: colors.subtext, textAlign: 'center' },
	form: { gap: spacing.md },
});
