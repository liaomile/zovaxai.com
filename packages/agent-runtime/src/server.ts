import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { cronMatches, isValidCron } from './cron';
import { log } from './log';
import { runAcpPrompt, type IRunnerConfig } from './runner';
import { AuditLog, JsonStore, newId, type IJob } from './store';

/**
 * 运行时装配：HTTP API（与 platform-api 契约的服务端子集）＋ 调度循环。
 * 生产基线：结构化日志与审计、连续失败熔断（自动停用并告警）、优雅停机、
 * 令牌常数时间比对、请求体上限、安全响应头、存活/就绪探针。
 * 鉴权骨架：设置 RUNTIME_TOKEN 时校验 Bearer；生产替换为账号会话令牌校验（现有后端）。
 */

export interface IRuntimeOptions {
	store: JsonStore;
	audit: AuditLog;
	runner: IRunnerConfig;
	workspaceCwd: string;
	port: number;
	host?: string;
	token?: string;
	/** 连续失败达到此数自动停用任务并告警（默认 3） */
	failureThreshold?: number;
}

export interface IRuntimeHandle {
	close(): Promise<void>;
}

const MAX_BODY_BYTES = 1024 * 1024;

export function startRuntime(options: IRuntimeOptions): IRuntimeHandle {
	const { store, audit } = options;
	const failureThreshold = options.failureThreshold ?? 3;
	const running = new Set<string>();
	const consecutiveFailures = new Map<string, number>();
	let lastTickMinute = '';

	const executeJob = async (job: IJob): Promise<void> => {
		if (running.has(job.id)) {
			return; // 上一轮未结束，跳过本轮（熔断雏形）
		}
		running.add(job.id);
		const runId = newId('run');
		const previousSummary = store.lastRunSummary(job.id);
		store.pushRun({
			id: runId,
			jobId: job.id,
			startedAt: new Date().toISOString(),
			status: 'running',
			summary: '',
		});
		audit.record('job_started', { jobId: job.id, runId });
		try {
			const result = await runAcpPrompt(options.runner, job.prompt, options.workspaceCwd);
			const summary = result.transcript.slice(0, 500);
			consecutiveFailures.delete(job.id);
			store.updateRun(runId, {
				status: 'succeeded',
				finishedAt: new Date().toISOString(),
				summary,
			});
			audit.record('job_succeeded', { jobId: job.id, runId, stopReason: result.stopReason });
			// 触达纪律：silent 永不发；always 每轮发；on-change 只在结论变化时发
			const shouldNotify =
				job.notifyMode === 'always' ||
				(job.notifyMode === 'on-change' && summary !== '' && summary !== previousSummary);
			if (shouldNotify) {
				store.pushInbox({
					id: newId('msg'),
					createdAt: new Date().toISOString(),
					title: job.name,
					body: summary,
					level: 'info',
					runId,
					read: false,
				});
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			store.updateRun(runId, {
				status: 'failed',
				finishedAt: new Date().toISOString(),
				summary: message,
			});
			audit.record('job_failed', { jobId: job.id, runId, error: message });
			log('error', 'job failed', { jobId: job.id, runId, error: message });
			if (job.notifyMode !== 'silent') {
				store.pushInbox({
					id: newId('msg'),
					createdAt: new Date().toISOString(),
					title: `${job.name}（执行失败）`,
					body: message,
					level: 'error',
					runId,
					read: false,
				});
			}
			// 熔断：连续失败达阈值自动停用并告警，防止坏任务无限重试烧额度
			const failures = (consecutiveFailures.get(job.id) ?? 0) + 1;
			consecutiveFailures.set(job.id, failures);
			if (failures >= failureThreshold && job.enabled) {
				store.upsertJob({ ...job, enabled: false });
				consecutiveFailures.delete(job.id);
				audit.record('job_auto_disabled', { jobId: job.id, failures });
				log('warn', 'job auto-disabled after consecutive failures', { jobId: job.id, failures });
				store.pushInbox({
					id: newId('msg'),
					createdAt: new Date().toISOString(),
					title: `${job.name}（已自动停用）`,
					body: `连续失败 ${failures} 次，已自动停用以防无限重试。请检查后在任务管理里重新启用。`,
					level: 'warning',
					runId,
					read: false,
				});
			}
		} finally {
			running.delete(job.id);
		}
	};

	// 调度循环：每 20 秒检查一次，每分钟最多触发同一任务一次
	const scheduler = setInterval(() => {
		const now = new Date();
		const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
		if (minuteKey === lastTickMinute) {
			return;
		}
		lastTickMinute = minuteKey;
		for (const job of store.listJobs()) {
			if (job.enabled && job.schedule && cronMatches(job.schedule, now)) {
				void executeJob(job);
			}
		}
	}, 20_000);

	const server: Server = createServer((req, res) => {
		void handleRequest(req, res, options, executeJob).catch((err: unknown) => {
			sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
		});
	});
	const host = options.host ?? '127.0.0.1';
	server.listen(options.port, host, () => {
		log('info', 'agent-runtime listening', { host, port: options.port });
		audit.record('runtime_started', { host, port: options.port });
	});

	return {
		async close(): Promise<void> {
			clearInterval(scheduler);
			// 等在跑的任务收尾（最多 10 秒），然后关 HTTP
			const deadline = Date.now() + 10_000;
			while (running.size > 0 && Date.now() < deadline) {
				await new Promise((r) => setTimeout(r, 200));
			}
			await new Promise<void>((resolve) => server.close(() => resolve()));
			audit.record('runtime_stopped', {});
			log('info', 'agent-runtime stopped', {});
		},
	};
}

async function handleRequest(
	req: IncomingMessage,
	res: ServerResponse,
	options: IRuntimeOptions,
	executeJob: (job: IJob) => Promise<void>,
): Promise<void> {
	const { store } = options;
	const url = new URL(req.url ?? '/', 'http://127.0.0.1');
	const path = url.pathname;

	if (path === '/healthz') {
		sendJson(res, 200, { ok: true });
		return;
	}
	if (path === '/readyz') {
		sendJson(res, 200, { ok: true, jobs: store.listJobs().length });
		return;
	}
	if (options.token && !tokenMatches(req.headers.authorization, options.token)) {
		sendJson(res, 401, { error: 'unauthorized' });
		return;
	}

	if (req.method === 'GET' && path === '/v1/jobs') {
		sendJson(res, 200, store.listJobs());
		return;
	}
	if (req.method === 'POST' && path === '/v1/jobs') {
		const job = (await readBody(req)) as IJob;
		if (!job.id || !job.name || !job.prompt) {
			sendJson(res, 400, { error: 'job requires id, name and prompt' });
			return;
		}
		if (job.schedule && !isValidCron(job.schedule)) {
			sendJson(res, 400, { error: `invalid cron expression: ${job.schedule}` });
			return;
		}
		sendJson(res, 200, store.upsertJob(job));
		return;
	}
	const runMatch = /^\/v1\/jobs\/([^/]+)\/run$/.exec(path);
	if (req.method === 'POST' && runMatch) {
		const job = store.listJobs().find((j) => j.id === decodeURIComponent(runMatch[1]));
		if (!job) {
			sendJson(res, 404, { error: 'job not found' });
			return;
		}
		void executeJob(job);
		sendJson(res, 202, { accepted: true, jobId: job.id });
		return;
	}
	if (req.method === 'GET' && path === '/v1/runs') {
		sendJson(res, 200, store.listRuns(url.searchParams.get('jobId') ?? undefined));
		return;
	}
	if (req.method === 'GET' && path === '/v1/inbox') {
		sendJson(res, 200, store.listInbox());
		return;
	}
	const readMatch = /^\/v1\/inbox\/([^/]+)\/read$/.exec(path);
	if (req.method === 'POST' && readMatch) {
		store.markInboxRead(decodeURIComponent(readMatch[1]));
		sendJson(res, 200, { ok: true });
		return;
	}
	if (req.method === 'GET' && path === '/v1/approvals') {
		sendJson(res, 200, []); // L1 审批队列：A5 里程碑接入
		return;
	}
	sendJson(res, 404, { error: 'not found' });
}

function tokenMatches(header: string | undefined, expected: string): boolean {
	if (!header) {
		return false;
	}
	const provided = Buffer.from(header);
	const wanted = Buffer.from(`Bearer ${expected}`);
	return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
	res.writeHead(status, {
		'content-type': 'application/json',
		'x-content-type-options': 'nosniff',
		'cache-control': 'no-store',
	});
	res.end(JSON.stringify(value));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	let total = 0;
	for await (const chunk of req) {
		total += (chunk as Buffer).length;
		if (total > MAX_BODY_BYTES) {
			throw new Error('request body too large');
		}
		chunks.push(chunk as Buffer);
	}
	const text = Buffer.concat(chunks).toString('utf-8');
	return text ? (JSON.parse(text) as unknown) : {};
}
