import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 骨架版存储：单个 JSON 文件（jobs/runs/inbox 三个集合），写入走临时文件+重命名保证原子性。
 * 生产形态迁到现有后端的数据库，本类的接口（list/upsert/push）保持不变即可替换实现。
 */

export interface IJob {
	id: string;
	name: string;
	schedule?: string;
	trigger?: string;
	prompt: string;
	tools: string[];
	autonomy: 'L0' | 'L1' | 'L2' | 'L3';
	notifyMode: 'on-change' | 'always' | 'silent';
	enabled: boolean;
}

export interface IJobRun {
	id: string;
	jobId: string;
	startedAt: string;
	finishedAt?: string;
	status: 'running' | 'succeeded' | 'failed';
	summary: string;
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

interface IStoreData {
	jobs: IJob[];
	runs: IJobRun[];
	inbox: IInboxMessage[];
}

export class JsonStore {
	private data: IStoreData;
	private readonly file: string;

	constructor(dataDir: string) {
		mkdirSync(dataDir, { recursive: true });
		this.file = join(dataDir, 'runtime-store.json');
		if (existsSync(this.file)) {
			try {
				this.data = JSON.parse(readFileSync(this.file, 'utf-8')) as IStoreData;
			} catch {
				this.data = { jobs: [], runs: [], inbox: [] };
			}
		} else {
			this.data = { jobs: [], runs: [], inbox: [] };
		}
	}

	listJobs(): IJob[] {
		return [...this.data.jobs];
	}

	upsertJob(job: IJob): IJob {
		const idx = this.data.jobs.findIndex((j) => j.id === job.id);
		if (idx >= 0) {
			this.data.jobs[idx] = job;
		} else {
			this.data.jobs.push(job);
		}
		this.flush();
		return job;
	}

	pushRun(run: IJobRun): void {
		this.data.runs.push(run);
		this.flush();
	}

	updateRun(runId: string, patch: Partial<IJobRun>): void {
		const run = this.data.runs.find((r) => r.id === runId);
		if (run) {
			Object.assign(run, patch);
			this.flush();
		}
	}

	listRuns(jobId?: string): IJobRun[] {
		return this.data.runs.filter((r) => !jobId || r.jobId === jobId);
	}

	lastRunSummary(jobId: string): string | undefined {
		const runs = this.data.runs.filter((r) => r.jobId === jobId && r.status === 'succeeded');
		return runs.length ? runs[runs.length - 1].summary : undefined;
	}

	pushInbox(message: IInboxMessage): void {
		this.data.inbox.push(message);
		this.flush();
	}

	listInbox(): IInboxMessage[] {
		return [...this.data.inbox];
	}

	markInboxRead(id: string): void {
		const msg = this.data.inbox.find((m) => m.id === id);
		if (msg) {
			msg.read = true;
			this.flush();
		}
	}

	private flush(): void {
		const tmp = `${this.file}.tmp`;
		writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
		renameSync(tmp, this.file);
	}
}

export function newId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
