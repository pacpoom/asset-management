import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';

export const load: PageServerLoad = async ({ url, locals }) => {
	// หากมีระบบตรวจสอบสิทธิ์ ให้เปิดใช้งานบรรทัดล่างนี้
	checkPermission(locals, 'view purchase report');

	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	
	// Default ให้แสดงข้อมูลย้อนหลัง 1 เดือนถึงปัจจุบัน
	const lastMonth = String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0');
	const lastMonthYear = now.getMonth() === 0 ? year - 1 : year;
	const defaultStartDate = `${lastMonthYear}-${lastMonth}-${day}`;
	const defaultEndDate = `${year}-${month}-${day}`;

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';

	const startDateParam = url.searchParams.get('startDate');
	const startDate = startDateParam !== null ? startDateParam : defaultStartDate;

	const endDateParam = url.searchParams.get('endDate');
	const endDate = endDateParam !== null ? endDateParam : defaultEndDate;
	const docTypeFilter = url.searchParams.get('docType') || '';

	let limit = parseInt(url.searchParams.get('limit') || '20', 10);
	const allowedLimits = [10, 20, 50, 100, 200];
	if (!allowedLimits.includes(limit)) limit = 20;

	const offset = (page - 1) * limit;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (
                pd.document_number LIKE ? OR
                v.company_name LIKE ? OR
                v.name LIKE ? OR
                j.job_number LIKE ? OR
                pdi.description LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
		}

		if (startDate) {
			whereClause += ` AND pd.document_date >= ? `;
			params.push(startDate);
		}

		if (endDate) {
			whereClause += ` AND pd.document_date <= ? `;
			params.push(endDate);
		}

		if (docTypeFilter) {
			whereClause += ` AND pd.document_type = ? `;
			params.push(docTypeFilter);
		}

		// คำนวณจำนวนข้อมูลทั้งหมด และผลรวมต่างๆ ตามเงื่อนไข VAT (Purchase: 1=Inc, 2=Exc, 3=Non)
		const countSql = `
			SELECT 
				COUNT(*) as total,
				SUM(pdi.line_total) as total_amount,
				SUM(CASE WHEN pd.status = 'Paid' THEN pdi.line_total ELSE 0 END) as total_paid,
				SUM(CASE WHEN pd.status = 'Draft' THEN pdi.line_total ELSE 0 END) as total_draft,
				
				-- Vatable: 2=Exclude คิดเต็ม, 1=Include ถอด VAT ออก
				SUM(
					CASE 
						WHEN pdi.vat_type = 2 THEN pdi.line_total 
						WHEN pdi.vat_type = 1 THEN pdi.line_total * 100 / (100 + COALESCE(pd.vat_rate, 7))
						ELSE 0 
					END
				) as total_vatable,
				
				-- Non-Vatable: 3=No VAT
				SUM(CASE WHEN pdi.vat_type = 3 THEN pdi.line_total ELSE 0 END) as total_non_vatable,

				-- VAT Amount: 2=Exclude คิดตามเรทจากยอดเต็ม, 1=Include ถอด VAT ออกจากยอดรวม
				SUM(
					CASE 
						WHEN pdi.vat_type = 2 THEN pdi.line_total * COALESCE(pd.vat_rate, 7) / 100
						WHEN pdi.vat_type = 1 THEN pdi.line_total * COALESCE(pd.vat_rate, 7) / (100 + COALESCE(pd.vat_rate, 7))
						ELSE 0 
					END
				) as total_vat,

				-- WHT Amount: ใช้ column wht_amount ที่ถูกคำนวณไว้แล้วใน DB
				SUM(COALESCE(pdi.wht_amount, 0)) as total_wht
            FROM purchase_document_items pdi
            JOIN purchase_documents pd ON pdi.document_id = pd.id
			LEFT JOIN vendors v ON pd.vendor_id = v.id
			LEFT JOIN job_orders j ON pd.job_id = j.id
            ${whereClause}
		`;

		const [countResult] = await pool.query<any[]>(countSql, params);

		const totalCount = countResult[0].total || 0;
		const totalAmount = Number(countResult[0].total_amount) || 0;
		const totalPaid = Number(countResult[0].total_paid) || 0;
		const totalDraft = Number(countResult[0].total_draft) || 0;
		
		const totalVatable = Number(countResult[0].total_vatable) || 0;
		const totalNonVatable = Number(countResult[0].total_non_vatable) || 0;
		const totalVat = Number(countResult[0].total_vat) || 0;
		const totalWht = Number(countResult[0].total_wht) || 0;
		const totalNet = totalVatable + totalNonVatable + totalVat - totalWht;
		
		const totalPages = Math.ceil(totalCount / limit);

		// ดึงข้อมูลรายการซื้อ และทำการคำนวณแยกคอลัมน์จาก Database 
		const dataSql = `
            SELECT 
				pdi.id as item_id,
				pdi.description,
				pdi.quantity,
				pdi.unit_price,
				pdi.line_total,
				pdi.vat_type,
				pdi.wht_rate,
				COALESCE(pd.vat_rate, 7) as doc_vat_rate,
				
				CASE 
					WHEN pdi.vat_type = 2 THEN pdi.line_total 
					WHEN pdi.vat_type = 1 THEN pdi.line_total * 100 / (100 + COALESCE(pd.vat_rate, 7))
					ELSE 0 
				END as vatable_amt,
				
				CASE 
					WHEN pdi.vat_type = 3 THEN pdi.line_total 
					ELSE 0 
				END as non_vatable_amt,
				
				CASE 
					WHEN pdi.vat_type = 2 THEN pdi.line_total * COALESCE(pd.vat_rate, 7) / 100
					WHEN pdi.vat_type = 1 THEN pdi.line_total * COALESCE(pd.vat_rate, 7) / (100 + COALESCE(pd.vat_rate, 7))
					ELSE 0 
				END as vat_amt,
				
				COALESCE(pdi.wht_amount, 0) as wht_amt,
				
				pd.document_number,
				pd.document_date,
				pd.document_type,
				pd.status,
				COALESCE(v.company_name, v.name) as vendor_name,
				j.job_number
            FROM purchase_document_items pdi
            JOIN purchase_documents pd ON pdi.document_id = pd.id
			LEFT JOIN vendors v ON pd.vendor_id = v.id
			LEFT JOIN job_orders j ON pd.job_id = j.id
            ${whereClause}
            ORDER BY pd.document_date DESC, pd.document_number DESC, pdi.item_order ASC
            LIMIT ${limit} OFFSET ${offset}
        `;

		const [purchaseRows] = await pool.query<any[]>(dataSql, params);

		return {
			purchases: purchaseRows,
			totalCount,
			totalAmount,
			totalPaid,
			totalDraft,
			totalVatable,
			totalNonVatable,
			totalVat,
			totalWht,
			totalNet,
			currentPage: page,
			totalPages,
			limit,
			searchQuery,
			startDate,
			endDate,
			docTypeFilter
		};
	} catch (err) {
		console.error('Failed to load purchase report:', err);
		const errorMessage = err instanceof Error ? err.message : String(err);
		throw error(500, `Failed to load data. Error: ${errorMessage}`);
	}
};