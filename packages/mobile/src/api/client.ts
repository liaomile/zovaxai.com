import AsyncStorage from '@react-native-async-storage/async-storage';
import { PlatformApiClient } from '@zovax/platform-api';
import { API_BASE_URL } from '../config';

/**
 * App 的 API 装配：令牌存取走 AsyncStorage（骨架）——生产应迁 Keychain/Keystore
 * （如 react-native-keychain），见 docs/MOBILE.md 安全要点；接口面全部来自 platform-api。
 */

const TOKEN_KEY = 'zovax.sessionToken';

export async function saveToken(token: string): Promise<void> {
	await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function loadToken(): Promise<string | undefined> {
	return (await AsyncStorage.getItem(TOKEN_KEY)) ?? undefined;
}

export async function clearToken(): Promise<void> {
	await AsyncStorage.removeItem(TOKEN_KEY);
}

export const api = new PlatformApiClient(API_BASE_URL, loadToken);

/** 邮箱验证码：请求下发（接口口径见 docs/ACCOUNT.md 的 /v1/auth/exchange 系列） */
export async function requestEmailCode(email: string): Promise<void> {
	const res = await fetch(`${API_BASE_URL}/v1/auth/email/request-code`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email }),
	});
	if (!res.ok) {
		throw new Error(`request-code failed: ${res.status}`);
	}
}

/** 邮箱验证码：换取会话令牌并保存，返回账号信息由调用方随后 api.me() 拉取 */
export async function exchangeEmailCode(email: string, code: string): Promise<void> {
	const res = await fetch(`${API_BASE_URL}/v1/auth/exchange`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ method: 'email-code', email, code }),
	});
	if (!res.ok) {
		throw new Error(`exchange failed: ${res.status}`);
	}
	const data = (await res.json()) as { token: string };
	await saveToken(data.token);
}
