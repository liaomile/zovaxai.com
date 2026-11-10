/** 结构化日志：一行一个 JSON，带时间与级别，便于后端的日志采集与检索。 */
export type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
	const entry = { ts: new Date().toISOString(), level, message, ...(fields ?? {}) };
	const line = JSON.stringify(entry);
	if (level === 'error') {
		console.error(line);
	} else if (level === 'warn') {
		console.warn(line);
	} else {
		console.log(line);
	}
}
