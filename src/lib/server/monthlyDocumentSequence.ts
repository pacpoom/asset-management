import type { PoolConnection } from 'mysql2/promise';

const DEFAULT_PADDING = 4;

/** Minimal connection surface for sequence allocation (mysql2 pool / transaction connections). */
export type MonthlySeqConnection = Pick<PoolConnection, 'execute'>;

/**
 * Parse document date as calendar year/month (YYYY-MM-DD first) to avoid UTC shift on date-only strings.
 */
export function parseDocumentCalendarMonth(dateStr: string): {
	year: number;
	month: number;
	monthStr: string;
} {
	const s = String(dateStr ?? '').trim();
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
	if (m) {
		const year = parseInt(m[1], 10);
		const month = parseInt(m[2], 10);
		if (month >= 1 && month <= 12) {
			return { year, month, monthStr: String(month).padStart(2, '0') };
		}
	}
	const d = new Date(s);
	if (Number.isNaN(d.getTime())) {
		throw new Error('Invalid document date');
	}
	const year = d.getFullYear();
	const month = d.getMonth() + 1;
	return { year, month, monthStr: String(month).padStart(2, '0') };
}

export type MonthlySeqMeta = {
	seq: number;
	year: number;
	month: number;
	monthStr: string;
	padding: number;
	prefix: string;
};

/**
 * Allocates the next running number for `document_sequences` keyed by
 * UNIQUE(document_type, year, month). Resets each calendar month (starts at 1).
 *
 * Concurrency: INSERT ... ON DUPLICATE KEY UPDATE with LAST_INSERT_ID(last_number + 1).
 */
export async function allocateMonthlySequence(
	connection: MonthlySeqConnection,
	docType: string,
	dateStr: string,
	resolvePrefix: (docType: string) => string
): Promise<MonthlySeqMeta> {
	const { year, month, monthStr } = parseDocumentCalendarMonth(dateStr);
	const prefix = resolvePrefix(docType);

	await connection.execute(
		`INSERT INTO document_sequences (document_type, prefix, year, month, last_number, padding_length)
		 VALUES (?, ?, ?, ?, LAST_INSERT_ID(1), ?)
		 ON DUPLICATE KEY UPDATE last_number = LAST_INSERT_ID(last_number + 1)`,
		[docType, prefix, year, month, DEFAULT_PADDING]
	);

	const [lidRows] = await connection.execute(`SELECT LAST_INSERT_ID() AS seq`);
	const seq = Number((lidRows as { seq: number }[])[0]?.seq ?? 1);

	const [metaRows] = await connection.execute(
		`SELECT padding_length FROM document_sequences WHERE document_type = ? AND year = ? AND month = ?`,
		[docType, year, month]
	);
	const padding = Number((metaRows as { padding_length: number }[])[0]?.padding_length ?? DEFAULT_PADDING);

	return { seq, year, month, monthStr, padding, prefix };
}

/**
 * Standard document number: `{prefix}{YYYY}{MM}-{running}` e.g. PR-202606-0001.
 */
export async function allocateMonthlyDocumentNumber(
	connection: MonthlySeqConnection,
	docType: string,
	dateStr: string,
	resolvePrefix: (docType: string) => string
): Promise<string> {
	const m = await allocateMonthlySequence(connection, docType, dateStr, resolvePrefix);
	const runningNumber = String(m.seq).padStart(m.padding, '0');
	return `${m.prefix}${m.year}${m.monthStr}-${runningNumber}`;
}
