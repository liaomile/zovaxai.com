import type {
	IAccount,
	IApproval,
	IDevice,
	IInboxMessage,
	IJob,
	IJobRun,
	IPairingRequest,
} from './types';

/** 类型化错误：带 HTTP 状态码（网络失败时为 0），调用方据此区分“未登录/无权限/服务异常/断网” */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export interface IPlatformApiOptions {
	/** 单请求超时毫秒（默认 15000） */
	timeoutMs?: number;
	/** GET 请求网络失败时的重试次数（默认 1；写请求不重试，避免重复提交） */
	getRetries?: number;
}

/**
 * 平台 API 客户端（三方共用）：只依赖 fetch 与一个令牌提供函数，不绑定任何 UI 框架。
 * 令牌来自登录（GitHub OAuth / 邮箱验证码换取的会话令牌），由宿主存入安全存储后注入。
 * 生产基线：请求超时、GET 幂等重试、类型化错误（ApiError）。
 */
export class PlatformApiClient {
	private readonly timeoutMs: number;
	private readonly getRetries: number;

	constructor(
		private readonly baseUrl: string,
		private readonly getToken: () => Promise<string | undefined>,
		options?: IPlatformApiOptions,
	) {
		this.timeoutMs = options?.timeoutMs ?? 15_000;
		this.getRetries = options?.getRetries ?? 1;
	}

	/* 账户 */
	me(): Promise<IAccount> {
		return this.request('GET', '/v1/account/me');
	}

	/* 设备与配对 */
	listDevices(): Promise<IDevice[]> {
		return this.request('GET', '/v1/devices');
	}

	createPairing(): Promise<IPairingRequest> {
		return this.request('POST', '/v1/devices/pairing');
	}

	completePairing(code: string, device: { kind: IDevice['kind']; name: string }): Promise<IDevice> {
		return this.request('POST', '/v1/devices/pairing/complete', { code, ...device });
	}

	removeDevice(deviceId: string): Promise<void> {
		return this.request('DELETE', `/v1/devices/${encodeURIComponent(deviceId)}`);
	}

	/* 后台任务（巡检等） */
	listJobs(): Promise<IJob[]> {
		return this.request('GET', '/v1/jobs');
	}

	upsertJob(job: IJob): Promise<IJob> {
		return this.request('POST', '/v1/jobs', job);
	}

	runJobNow(jobId: string): Promise<IJobRun> {
		return this.request('POST', `/v1/jobs/${encodeURIComponent(jobId)}/run`);
	}

	listRuns(jobId?: string): Promise<IJobRun[]> {
		const q = jobId ? `?jobId=${encodeURIComponent(jobId)}` : '';
		return this.request('GET', `/v1/runs${q}`);
	}

	/* 收件箱（主动触达） */
	listInbox(): Promise<IInboxMessage[]> {
		return this.request('GET', '/v1/inbox');
	}

	markInboxRead(messageId: string): Promise<void> {
		return this.request('POST', `/v1/inbox/${encodeURIComponent(messageId)}/read`);
	}

	/* 审批（L1 待批事项，App/IDE 都可处理） */
	listApprovals(): Promise<IApproval[]> {
		return this.request('GET', '/v1/approvals');
	}

	decideApproval(approvalId: string, decision: 'approved' | 'rejected'): Promise<IApproval> {
		return this.request('POST', `/v1/approvals/${encodeURIComponent(approvalId)}/decide`, { decision });
	}

	private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		const attempts = method === 'GET' ? this.getRetries + 1 : 1;
		let lastError: unknown;
		for (let attempt = 0; attempt < attempts; attempt++) {
			try {
				return await this.requestOnce<T>(method, path, body);
			} catch (err) {
				lastError = err;
				// 只对网络层失败（status 0）重试；HTTP 错误直接抛，避免无意义重试
				if (!(err instanceof ApiError) || err.status !== 0 || attempt === attempts - 1) {
					throw err;
				}
				await new Promise<void>((resolve) => {
					setTimeout(() => resolve(), 300);
				});
			}
		}
		throw lastError;
	}

	private async requestOnce<T>(method: string, path: string, body?: unknown): Promise<T> {
		const token = await this.getToken();
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		let res: Response;
		try {
			res = await fetch(`${this.baseUrl}${path}`, {
				method,
				headers: {
					'content-type': 'application/json',
					...(token ? { authorization: `Bearer ${token}` } : {}),
				},
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: controller.signal,
			});
		} catch (err) {
			throw new ApiError(0, `network error: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			clearTimeout(timer);
		}
		if (!res.ok) {
			throw new ApiError(res.status, `platform api ${method} ${path} failed: ${res.status}`);
		}
		return (await res.json()) as T;
	}
}
