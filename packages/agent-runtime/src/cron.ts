/**
 * 极简五段 cron 匹配（分 时 日 月 周）：支持 *、* /n、单值、逗号列表、a-b 区间。
 * 够巡检/晨报类任务使用；复杂语义（L、W、# 等）不在骨架范围内，生产可换成熟库。
 */

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
	return field.split(',').some((part) => {
		const stepSplit = part.split('/');
		const range = stepSplit[0];
		const step = stepSplit[1] ? parseInt(stepSplit[1], 10) : 1;
		let lo = min;
		let hi = max;
		if (range === '*') {
			// 全范围
		} else if (range.includes('-')) {
			const [a, b] = range.split('-').map((n) => parseInt(n, 10));
			lo = a;
			hi = b;
		} else {
			lo = hi = parseInt(range, 10);
		}
		if (Number.isNaN(lo) || Number.isNaN(hi)) {
			return false;
		}
		return value >= lo && value <= hi && (value - lo) % step === 0;
	});
}

export function cronMatches(expression: string, date: Date): boolean {
	const fields = expression.trim().split(/\s+/);
	if (fields.length !== 5) {
		return false;
	}
	const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
	return (
		fieldMatches(minute, date.getMinutes(), 0, 59) &&
		fieldMatches(hour, date.getHours(), 0, 23) &&
		fieldMatches(dayOfMonth, date.getDate(), 1, 31) &&
		fieldMatches(month, date.getMonth() + 1, 1, 12) &&
		fieldMatches(dayOfWeek, date.getDay(), 0, 6)
	);
}
