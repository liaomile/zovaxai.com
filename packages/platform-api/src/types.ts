/**
 * 平台共享契约类型：IDE、手机 App、后台运行时（agent-runtime）三方共用同一份定义，
 * 对应现有后端的接口（docs/ACCOUNT.md、docs/AUTONOMY.md、docs/MOBILE.md）。
 * 后端接口定稿后以其字段为准回填本文件，三方随之同步。
 */

export interface IAccount {
	id: string;
	name: string;
	avatarUrl?: string;
	credits: number;
}

export type DeviceKind = 'ide' | 'mobile' | 'runtime';

export interface IDevice {
	id: string;
	kind: DeviceKind;
	name: string;
	online: boolean;
	lastSeenAt: string; // ISO 时间
}

/** 设备配对：IDE 展示二维码（含一次性配对码），App 扫码后由后端撮合绑定到同一账号 */
export interface IPairingRequest {
	code: string;
	expiresAt: string;
}

export type AutonomyLevel = 'L0' | 'L1' | 'L2' | 'L3';

export interface IJob {
	id: string;
	name: string;
	/** cron 五段表达式（服务端时区，默认 Asia/Shanghai） */
	schedule?: string;
	/** 事件触发（如 webhook:ci），与 schedule 二选一或并存 */
	trigger?: string;
	prompt: string;
	tools: string[];
	autonomy: AutonomyLevel;
	notifyMode: 'on-change' | 'always' | 'silent';
	enabled: boolean;
}

export interface IJobRun {
	id: string;
	jobId: string;
	startedAt: string;
	finishedAt?: string;
	status: 'running' | 'succeeded' | 'failed';
	/** 本次运行的结论摘要（无变化时为空字符串，与 notifyMode 配合决定是否触达） */
	summary: string;
	logRef?: string;
}

export interface IInboxMessage {
	id: string;
	createdAt: string;
	title: string;
	body: string;
	level: 'info' | 'warning' | 'error';
	runId?: string;
	read: boolean;
}

export interface IApproval {
	id: string;
	createdAt: string;
	title: string;
	detail: string;
	status: 'pending' | 'approved' | 'rejected';
	/** 发起方设备（哪台 IDE/哪个任务提出的待批事项） */
	fromDeviceId?: string;
}
