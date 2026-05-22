import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import ExcelJS from 'exceljs';
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

function fmtDate(d: string | null): string {
	if (!d) return '-';
	const date = new Date(d);
	return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusLabel(s: string): string {
	switch (s) {
		case 'Approved':  return 'Approved';
		case 'Rejected':  return 'Rejected';
		case 'Completed': return 'Completed';
		default:          return 'Pending';
	}
}

export const GET: RequestHandler = async ({ locals, url }) => {
	checkPermission(locals, 'view advance expense');

	const dateFrom = url.searchParams.get('date_from') || '';
	const dateTo   = url.searchParams.get('date_to')   || '';
	const status   = url.searchParams.get('status')    || '';
	const search   = url.searchParams.get('search')    || '';

	try {
		// ── Build WHERE ────────────────────────────────────────────────────────
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

		// ── Fetch ALL advances (no pagination) ─────────────────────────────────
		const [advRows] = await pool.execute<AdvanceRow[]>(
			`SELECT aa.id, aa.document_number, aa.document_date, aa.application_title,
			        aa.reason, aa.amount, aa.status,
			        b.bank_name, u.full_name AS creator_name
			 FROM advance_applications aa
			 LEFT JOIN banks b ON aa.bank_id = b.id
			 LEFT JOIN users u ON aa.created_by = u.id
			 WHERE ${whereSQL}
			 ORDER BY aa.document_date DESC, aa.id DESC`,
			params
		);
		const advances = JSON.parse(JSON.stringify(advRows)) as AdvanceRow[];

		// ── Fetch items ────────────────────────────────────────────────────────
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
				 JOIN advance_transactions at2   ON at2.advance_application_id = aa.id
				 JOIN advance_transaction_items ati ON ati.advance_transaction_id = at2.id
				 LEFT JOIN job_orders jo          ON at2.job_order_id = jo.id
				 LEFT JOIN cost_centers cc        ON ati.cost_center_code = cc.cost_center_code
				 LEFT JOIN products p             ON ati.product_id = p.id
				 LEFT JOIN chart_of_accounts coa  ON p.expense_account_id = coa.id
				 WHERE aa.id IN (${ph})
				 ORDER BY aa.id, at2.transaction_date ASC, at2.id, ati.id`,
				ids
			);

			for (const row of JSON.parse(JSON.stringify(itemRows))) {
				if (!itemsByAdvance[row.advance_id]) itemsByAdvance[row.advance_id] = [];
				itemsByAdvance[row.advance_id].push(row);
			}
		}

		// ── Build Excel ────────────────────────────────────────────────────────
		const wb = new ExcelJS.Workbook();
		wb.creator  = 'Core Business';
		wb.created  = new Date();

		const ws = wb.addWorksheet('Advance Expense Report', {
			pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
			views: [{ state: 'frozen', xSplit: 0, ySplit: 2 }]
		});

		// ── Column definitions ─────────────────────────────────────────────────
		ws.columns = [
			{ key: 'doc_no',        width: 18 },
			{ key: 'status',        width: 12 },
			{ key: 'doc_date',      width: 14 },
			{ key: 'bank',          width: 18 },
			{ key: 'creator',       width: 20 },
			{ key: 'reason',        width: 28 },
			{ key: 'tx_date',       width: 14 },
			{ key: 'tx_type',       width: 10 },
			{ key: 'product',       width: 28 },
			{ key: 'cost_center',   width: 16 },
			{ key: 'cc_name',       width: 24 },
			{ key: 'acct_code',     width: 14 },
			{ key: 'sub_acct',      width: 12 },
			{ key: 'acct_name',     width: 28 },
			{ key: 'acct_name_th',  width: 28 },
			{ key: 'acct_type',     width: 14 },
			{ key: 'dr_cr',         width: 8  },
			{ key: 'qty',           width: 8  },
			{ key: 'price',         width: 14 },
			{ key: 'total',         width: 16 },
			{ key: 'budget',        width: 16 },
		];

		// ── Title row (row 1) ──────────────────────────────────────────────────
		ws.mergeCells('A1:U1');
		const titleCell = ws.getCell('A1');
		titleCell.value = 'Advance Expense Report';
		titleCell.font  = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1E3A5F' } };
		titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
		titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F7' } };
		ws.getRow(1).height = 28;

		// ── Header row (row 2) ─────────────────────────────────────────────────
		const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
		const HEADER_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
		const HEADER_ALIGN: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };

		const headers = [
			'Document No.', 'Status', 'Date', 'Bank', 'Created By', 'Reason',
			'Tx Date', 'Tx Type', 'Product / Service',
			'Cost Center Code', 'Cost Center Name',
			'Account Code', 'Sub Account', 'Account Name', 'Account Name (TH)', 'Account Type',
			'Dr/Cr', 'Qty', 'Price/Unit', 'Total (฿)', 'Budget (฿)'
		];

		const headerRow = ws.getRow(2);
		headerRow.height = 30;
		headers.forEach((h, i) => {
			const cell = headerRow.getCell(i + 1);
			cell.value     = h;
			cell.fill      = HEADER_FILL;
			cell.font      = HEADER_FONT;
			cell.alignment = HEADER_ALIGN;
			cell.border    = {
				top:    { style: 'thin', color: { argb: 'FF93C5FD' } },
				bottom: { style: 'thin', color: { argb: 'FF93C5FD' } },
				left:   { style: 'thin', color: { argb: 'FF93C5FD' } },
				right:  { style: 'thin', color: { argb: 'FF93C5FD' } },
			};
		});

		// ── Styles ─────────────────────────────────────────────────────────────
		const ADV_FILL:  ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
		const SUB_FILL:  ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
		const ODD_FILL:  ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
		const EVEN_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

		const THIN_BORDER: Partial<ExcelJS.Borders> = {
			top:    { style: 'hair', color: { argb: 'FFE5E7EB' } },
			bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
			left:   { style: 'hair', color: { argb: 'FFE5E7EB' } },
			right:  { style: 'hair', color: { argb: 'FFE5E7EB' } },
		};

		const numFmt = '#,##0.00';

		// ── Data rows ──────────────────────────────────────────────────────────
		let rowIdx = 3;
		let itemRowCount = 0;

		for (const adv of advances) {
			const items = itemsByAdvance[adv.id] || [];

			// Advance header row (blue-tinted)
			const advRow = ws.getRow(rowIdx);
			advRow.height = 20;

			const advValues = [
				adv.document_number,
				statusLabel(adv.status),
				fmtDate(adv.document_date),
				adv.bank_name || '-',
				adv.creator_name || '-',
				adv.reason || '',
				'', '', '', '', '', '', '', '', '', '', '', '', '', '',
				adv.amount  // budget in last col
			];

			advValues.forEach((v, i) => {
				const cell = advRow.getCell(i + 1);
				cell.value = v;
				cell.fill  = ADV_FILL;
				cell.font  = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E40AF' } };
				cell.alignment = { vertical: 'middle', wrapText: false };
				cell.border = THIN_BORDER;
				if (i === 20) { // budget col
					cell.numFmt = numFmt;
				}
			});

			// Items count note in col G–T area
			const noteCell = advRow.getCell(7); // Tx Date col — reuse for note
			noteCell.value = items.length > 0 ? `${items.length} item(s)` : 'No items';
			noteCell.font  = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF6B7280' } };

			rowIdx++;

			// Item rows
			if (items.length === 0) {
				const emptyRow = ws.getRow(rowIdx);
				emptyRow.getCell(7).value = '— No items —';
				emptyRow.getCell(7).font  = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF9CA3AF' } };
				for (let c = 1; c <= 21; c++) {
					emptyRow.getCell(c).fill   = ODD_FILL;
					emptyRow.getCell(c).border = THIN_BORDER;
				}
				rowIdx++;
			} else {
				for (let iIdx = 0; iIdx < items.length; iIdx++) {
					const item = items[iIdx];
					const row  = ws.getRow(rowIdx);
					row.height = 18;

					const fill = itemRowCount % 2 === 0 ? EVEN_FILL : ODD_FILL;

					const values: (string | number | null)[] = [
						'', '', '', '', '', '',        // advance cols (blank)
						fmtDate(item.transaction_date),
						item.tx_type === 'expense' ? 'Expense' : 'Refund',
						item.product_name,
						item.cost_center_code || '',
						item.cost_center_name || '',
						item.account_code || '',
						item.sub_account_code && item.sub_account_code !== '0' ? item.sub_account_code : '',
						item.account_name || '',
						item.account_name_th || '',
						item.account_type || '',
						item.debit_credit === 'Debit' ? 'Dr' : 'Cr',
						Number(item.qty),
						Number(item.price),
						Number(item.amount),
						''  // budget (blank on item rows)
					];

					values.forEach((v, i) => {
						const cell = row.getCell(i + 1);
						cell.value     = v;
						cell.fill      = fill;
						cell.font      = { name: 'Calibri', size: 10 };
						cell.alignment = { vertical: 'middle' };
						cell.border    = THIN_BORDER;

						// Right-align numbers
						if (i === 17 || i === 18 || i === 19) {
							cell.alignment = { vertical: 'middle', horizontal: 'right' };
							if (i !== 17) cell.numFmt = numFmt; // price + total
						}
						// Center align specific cols
						if (i === 7 || i === 16) {
							cell.alignment = { vertical: 'middle', horizontal: 'center' };
						}
						// Color Dr/Cr
						if (i === 16) {
							cell.font = {
								name: 'Calibri', size: 10, bold: true,
								color: { argb: item.debit_credit === 'Debit' ? 'FF1D4ED8' : 'FF7C3AED' }
							};
						}
						// Color Tx type
						if (i === 7) {
							cell.font = {
								name: 'Calibri', size: 10,
								color: { argb: item.tx_type === 'expense' ? 'FFEA580C' : 'FF7C3AED' }
							};
						}
					});

					itemRowCount++;
					rowIdx++;
				}

				// Subtotal row
				const netAmt = items.reduce((s, i) =>
					s + (i.tx_type === 'expense' ? Number(i.amount) : -Number(i.amount)), 0);

				const subRow = ws.getRow(rowIdx);
				subRow.height = 18;

				for (let c = 1; c <= 21; c++) {
					const cell = subRow.getCell(c);
					cell.fill   = SUB_FILL;
					cell.border = { top: { style: 'medium', color: { argb: 'FF93C5FD' } }, ...THIN_BORDER };
				}
				subRow.getCell(19).value  = 'Net Amount';
				subRow.getCell(19).font   = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E40AF' } };
				subRow.getCell(19).alignment = { horizontal: 'right', vertical: 'middle' };

				subRow.getCell(20).value  = Math.abs(netAmt);
				subRow.getCell(20).numFmt = numFmt;
				subRow.getCell(20).font   = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E40AF' } };
				subRow.getCell(20).alignment = { horizontal: 'right', vertical: 'middle' };

				rowIdx++;
			}
		}

		// ── Grand total row ────────────────────────────────────────────────────
		if (advances.length > 0) {
			const totalRow = ws.getRow(rowIdx);
			totalRow.height = 22;

			for (let c = 1; c <= 21; c++) {
				const cell = totalRow.getCell(c);
				cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
				cell.border = THIN_BORDER;
			}

			totalRow.getCell(1).value  = `Total: ${advances.length} document(s)`;
			totalRow.getCell(1).font   = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
			totalRow.getCell(1).alignment = { vertical: 'middle' };

			// Sum budget
			const grandBudget = advances.reduce((s, a) => s + Number(a.amount), 0);
			totalRow.getCell(21).value  = grandBudget;
			totalRow.getCell(21).numFmt = numFmt;
			totalRow.getCell(21).font   = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
			totalRow.getCell(21).alignment = { horizontal: 'right', vertical: 'middle' };
		}

		// ── Generate buffer & return ───────────────────────────────────────────
		const buffer = await wb.xlsx.writeBuffer();

		const now      = new Date();
		const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
		const filename = `advance_expense_report_${datePart}.xlsx`;

		return new Response(buffer as ArrayBuffer, {
			status: 200,
			headers: {
				'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Cache-Control':       'no-cache',
			}
		});

	} catch (err: any) {
		if (err.status) throw err;
		throw error(500, err.message);
	}
};
