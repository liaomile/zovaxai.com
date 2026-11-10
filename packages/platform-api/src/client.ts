import type {
	IAccount,
	IApproval,
	IDevice,
	IInboxMessage,
	IJob,
	IJobRun,
	IPairingRequest,
} from './types';

/**
 * 平台 API 客户端（三方共用）：只依赖 fetch 与一个令牌提供函数，不绑定任何 UI 框架。
 * 令牌来自登录（GitHub OAuth / 邮箱验证码换取的会话令牌），由宿主存入安全存储后注入。
 */
export class PlatformApiClient {
	constructor(
		private readonly baseUrl: string,
		private readonly getToken: () => Promise<string | undefined>,
	) {}

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
		const token = await this.getToken();
		const res = await fetch(`${this.baseUrl}${path}`, {
			method,
			headers: {
				'content-type': 'application/json',
				...(token ? { authorization: `Bearer ${token}` } : {}),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		if (!res.ok) {
			throw new Error(`platform api ${method} ${path} failed: ${res.status}`);
		}
		return (await res.json()) as T;
	}
}
