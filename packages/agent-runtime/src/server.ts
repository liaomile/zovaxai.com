import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { cronMatches } from './cron';
import { runAcpPrompt, type IRunnerConfig } from './runner';
import { JsonStore, newId, type IJob } from './store';

/**
 * 运行时装配：HTTP API（与 platform-api 契约的服务端子集）＋ 调度循环。
 * 鉴权骨架：设置 RUNTIME_TOKEN 时校验 Bearer；生产替换为账号会话令牌校验（现有后端）。
 */

export interface IRuntimeOptions {
	store: JsonStore;
	runner: IRunnerConfig;
	workspaceCwd: string;
	port: number;
	token?: string;
}

export function startRuntime(options: IRuntimeOptions): void {
	const { store } = options;
	const running = new Set<string>();
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
		try {
			const result = await runAcpPrompt(options.runner, job.prompt, options.workspaceCwd);
			const summary = result.transcript.slice(0, 500);
			store.updateRun(runId, {
				status: 'succeeded',
				finishedAt: new Date().toISOString(),
				summary,
			});
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
			store.updateRun(runId, {
				status: 'failed',
				finishedAt: new Date().toISOString(),
				summary: err instanceof Error ? err.message : String(err),
			});
			if (job.notifyMode !== 'silent') {
				store.pushInbox({
					id: newId('msg'),
					createdAt: new Date().toISOString(),
					title: `${job.name}（执行失败）`,
					body: err instanceof Error ? err.message : String(err),
					level: 'error',
					runId,
					read: false,
				});
			}
		} finally {
			running.delete(job.id);
		}
	};

	// 调度循环：每 20 秒检查一次，每分钟最多触发同一任务一次
	setInterval(() => {
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

	const server = createServer((req, res) => {
		void handleRequest(req, res, options, executeJob).catch((err: unknown) => {
			sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
		});
	});
	server.listen(options.port, '127.0.0.1', () => {
		console.log(`[agent-runtime] listening on http://127.0.0.1:${options.port}`);
	});
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
	if (options.token && req.headers.authorization !== `Bearer ${options.token}`) {
		sendJson(res, 401, { error: 'unauthorized' });
		return;
	}

	if (req.method === 'GET' && path === '/v1/jobs') {
		sendJson(res, 200, store.listJobs());
		return;
	}
	if (req.method === 'POST' && path === '/v1/jobs') {
		const job = (await readBody(req)) as IJob;
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

function sendJson(res: ServerResponse, status: number, value: unknown): void {
	res.writeHead(status, { 'content-type': 'application/json' });
	res.end(JSON.stringify(value));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(chunk as Buffer);
	}
	const text = Buffer.concat(chunks).toString('utf-8');
	return text ? (JSON.parse(text) as unknown) : {};
}
