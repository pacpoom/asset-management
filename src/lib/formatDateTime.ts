/**
 * DAR approval fields: plain dates stay YYYY-MM-DD.
 * Values with time render as YYYY-MM-DD HH:mm:ss in Asia/Bangkok (matches business locale; avoids UTC SSR showing 00:00:00).
 * MySQL DATETIME strings without offset are shown as stored (wall clock); ISO strings with Z/offset convert to Bangkok.
 */
export function formatOptionalDateTime(value: string | Date | null | undefined): string {
	if (value == null || value === '') return '-';
	let raw: string;
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return '-';
		raw = value.toISOString();
	} else {
		raw = String(value).trim();
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	// MySQL DATETIME (no timezone) should be displayed as-is in business local time.
	if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw)) {
		return raw.replace('T', ' ');
	}
	const d = new Date(raw);
	if (Number.isNaN(d.getTime())) return '-';
	return d
		.toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok', hour12: false })
		.replace('T', ' ');
}
