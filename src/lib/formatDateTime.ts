/**
 * DAR approval fields: plain dates stay YYYY-MM-DD.
 * Values with time render as YYYY-MM-DD HH:mm:ss in Asia/Bangkok (matches business locale; avoids UTC SSR showing 00:00:00).
 */
export function formatOptionalDateTime(value: string | null | undefined): string {
	if (value == null || value === '') return '-';
	const raw = String(value).trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const d = new Date(raw);
	if (Number.isNaN(d.getTime())) return '-';
	return d
		.toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok', hour12: false })
		.replace('T', ' ');
}
