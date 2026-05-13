/** รูปแบบวันที่ DD/MMM/YYYY (เช่น 13/May/2026) สำหรับหน้า Purchase Documents */

export const MONTH_ABBR_EN = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

export function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

export function isoDatePart(raw: string): string {
	const s = String(raw || '').trim();
	if (!s) return '';
	if (s.includes('T')) return s.split('T')[0]!;
	if (s.includes(' ')) return s.split(' ')[0]!;
	return s.slice(0, 10);
}

/** YYYY-MM-DD → 13/May/2026 */
export function isoToDisplay(iso: string): string {
	const part = isoDatePart(iso);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return '';
	const [y, m, d] = part.split('-').map((x) => parseInt(x, 10));
	if (!y || !m || !d) return '';
	const dt = new Date(y, m - 1, d);
	if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return '';
	return `${pad2(d)}/${MONTH_ABBR_EN[m - 1]}/${y}`;
}

/** 13/May/2026 หรือ YYYY-MM-DD → YYYY-MM-DD */
export function displayToIso(display: string): string | null {
	const t = display.trim();
	if (!t) return null;
	if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
	const m = t.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/);
	if (!m) return null;
	const day = parseInt(m[1]!, 10);
	const monIdx = MONTH_ABBR_EN.findIndex((x) => x.toLowerCase() === m[2]!.toLowerCase());
	if (monIdx < 0) return null;
	const y = parseInt(m[3]!, 10);
	const dt = new Date(y, monIdx, day);
	if (dt.getFullYear() !== y || dt.getMonth() !== monIdx || dt.getDate() !== day) return null;
	return `${y}-${pad2(monIdx + 1)}-${pad2(day)}`;
}

export function todayIsoLocal(): string {
	const d = new Date();
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** บวกวันจาก YYYY-MM-DD แบบ calendar-local */
export function addCalendarDaysToIso(isoYmd: string, deltaDays: number): string {
	const part = isoDatePart(isoYmd);
	const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(part);
	if (!md) {
		const base = new Date(isoYmd);
		if (Number.isNaN(base.getTime())) return todayIsoLocal();
		base.setDate(base.getDate() + deltaDays);
		return `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-${pad2(base.getDate())}`;
	}
	const y = parseInt(md[1], 10);
	const mo = parseInt(md[2], 10) - 1;
	const d = parseInt(md[3], 10);
	const dt = new Date(y, mo, d);
	dt.setDate(dt.getDate() + deltaDays);
	return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/** รับค่าจากฟอร์ม → YYYY-MM-DD หรือ null (ใช้ได้ทั้ง client/server) */
export function normalizePurchaseDocumentDateInput(raw: string | null | undefined): string | null {
	const s = String(raw ?? '').trim();
	if (!s) return null;
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
	return displayToIso(s);
}
