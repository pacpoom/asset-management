import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

interface AdvanceRow extends RowDataPacket {
	id: number;
	document_number: string;
	document_date: string;
	application_title: string;
	reason: string;
	amount: number;
	status: string;
	bank_name: string | null;
	creator_name: string | null;
}

interface ItemReportRow extends RowDataPacket {
	advance_id: number;
	tx_id: number;
	transaction_date: string;
	tx_type: string;
	job_number: string | null;
	item_id: number;
	product_name: string;
	qty: number;
	price: number;
	amount: number;
	cost_center_code: string | null;
	cost_center_name: string | null;
	department: string | null;
	debit_credit: string;
	account_code: string | null;
	sub_account_code: string | null;
	account_name: string | null;
	account_name_th: string | null;
	account_type: string | null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	checkPermission(locals, 'view advance expense');

	const dateFrom  = url.searchParams.get('date_from')  || '';
	const dateTo    = url.searchParams.get('date_to')    || '';
	const status    = url.searchParams.get('status')     || '';
	const search    = url.searchParams.get('search')     || '';
	const page      = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
	const pageSize  = 20;
	const offset    = (page - 1) * pageSize;

	try {
		// ── Build WHERE for advance_applications ──────────────────────────────
		const where: string[] = ['1=1'];
		const params: (string | number)[] = [];

		if (dateFrom) { where.push('aa.document_date >= ?'); params.push(dateFrom); }
		if (dateTo)   { where.push('aa.document_date <= ?'); params.push(dateTo);   }
		if (status)   { where.push('aa.status = ?');          params.push(status);   }
		if (search) {
			where.push('(aa.document_number LIKE ? OR aa.application_title LIKE ? OR u.full_name LIKE ?)');
			const t = `%${search}%`;
			params.push(t, t, t);
		}

		const whereSQL = where.join(' AND ');

		// Count total advances
		const [countRows] = await pool.execute<any[]>(
			`SELECT COUNT(aa.id) AS total
			 FROM advance_applications aa
			 LEFT JOIN users u ON aa.created_by = u.id
			 WHERE ${whereSQL}`,
			params
		);
		const total      = countRows[0].total as number;
		const totalPages = Math.ceil(total / pageSize);

		// Fetch advances (paginated)
		const [advRows] = await pool.execute<AdvanceRow[]>(
			`SELECT aa.id, aa.document_number, aa.document_date, aa.application_title,
			        aa.reason, aa.amount, aa.status,
			        b.bank_name, u.full_name AS creator_name
			 FROM advance_applications aa
			 LEFT JOIN banks b ON aa.bank_id = b.id
			 LEFT JOIN users u ON aa.created_by = u.id
			 WHERE ${whereSQL}
			 ORDER BY aa.document_date DESC, aa.id DESC
			 LIMIT ${pageSize} OFFSET ${offset}`,
			params
		);
		const advances = JSON.parse(JSON.stringify(advRows)) as AdvanceRow[];

		// ── Fetch items with full COA join for these advances ──────────────────
		let itemsByAdvance: Record<number, ItemReportRow[]> = {};
		if (advances.length > 0) {
			const ids = advances.map(a => a.id);
			const ph  = ids.map(() => '?').join(',');

			const [itemRows] = await pool.execute<ItemReportRow[]>(
				`SELECT
				    aa.id                          AS advance_id,
				    at2.id                         AS tx_id,
				    at2.transaction_date,
				    at2.type                       AS tx_type,
				    jo.job_number,
				    ati.id                         AS item_id,
				    ati.product_name,
				    ati.qty,
				    ati.price,
				    ati.amount,
				    ati.cost_center_code,
				    ati.debit_credit,
				    cc.cost_center_name,
				    cc.department,
				    coa.account_code,
				    coa.sub_account_code,
				    coa.account_name,
				    coa.account_name_th,
				    coa.account_type
				 FROM advance_applications aa
				 JOIN advance_transactions at2
				   ON at2.advance_application_id = aa.id
				 JOIN advance_transaction_items ati
				   ON ati.advance_transaction_id = at2.id
				 LEFT JOIN job_orders jo
				   ON at2.job_order_id = jo.id
				 LEFT JOIN cost_centers cc
				   ON ati.cost_center_code = cc.cost_center_code
				 LEFT JOIN products p
				   ON ati.product_id = p.id
				 LEFT JOIN chart_of_accounts coa
				   ON p.expense_account_id = coa.id
				 WHERE aa.id IN (${ph})
				 ORDER BY aa.id, at2.transaction_date ASC, at2.id, ati.id`,
				ids
			);

			for (const row of JSON.parse(JSON.stringify(itemRows))) {
				if (!itemsByAdvance[row.advance_id]) itemsByAdvance[row.advance_id] = [];
				itemsByAdvance[row.advance_id].push(row);
			}
		}

		// Attach items to each advance
		const report = advances.map(a => ({
			...a,
			items: itemsByAdvance[a.id] || []
		}));

		return {
			report,
			total,
			totalPages,
			currentPage: page,
			filters: { dateFrom, dateTo, status, search }
		};
	} catch (err: any) {
		if (err.status) throw err;
		throw error(500, err.message);
	}
};
