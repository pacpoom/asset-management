/** Contract dates are business calendar days in Thailand (UTC+7). */
const BANGKOK = 'Asia/Bangkok';

/**
 * HTML `<input type="date">` value (YYYY-MM-DD). Plain DATE strings from MySQL are kept as-is;
 * ISO timestamps / Date objects are interpreted in Bangkok so midnight-in-Thailand does not shift back a day.
 */
export function toYmdDateInputBangkok(value: string | Date | null | undefined): string {
	if (value == null || value === '') return '';
	if (typeof value === 'string') {
		const s = value.trim();
		if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
		const d = new Date(s);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString('en-CA', { timeZone: BANGKOK });
	}
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toLocaleDateString('en-CA', { timeZone: BANGKOK });
	}
	return '';
}

export function toYmdDateInputBangkokOrNull(value: string | Date | null | undefined): string | null {
	const y = toYmdDateInputBangkok(value);
	return y === '' ? null : y;
}
