import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { pool } from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';

export const load: PageServerLoad = async ({ url, locals }) => {
	// หากมีระบบตรวจสอบสิทธิ์ ให้เปิดใช้งานบรรทัดล่างนี้
	// checkPermission(locals, 'view sales report');

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
                sd.document_number LIKE ? OR
                c.company_name LIKE ? OR
                j.job_number LIKE ? OR
                sdi.description LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm);
		}

		if (startDate) {
			whereClause += ` AND sd.document_date >= ? `;
			params.push(startDate);
		}

		if (endDate) {
			whereClause += ` AND sd.document_date <= ? `;
			params.push(endDate);
		}

		if (docTypeFilter) {
			whereClause += ` AND sd.document_type = ? `;
			params.push(docTypeFilter);
		}

		// คำนวณจำนวนข้อมูลทั้งหมด และผลรวมต่างๆ ตามเงื่อนไข VAT (0=Exclude, 1=Include, 2=No VAT)
		const countSql = `
			SELECT 
				COUNT(*) as total,
				SUM(sdi.line_total) as total_amount,
				SUM(CASE WHEN sd.status = 'Paid' THEN sdi.line_total ELSE 0 END) as total_paid,
				SUM(CASE WHEN sd.status = 'Draft' THEN sdi.line_total ELSE 0 END) as total_draft,
				
				-- Vatable: 0=Exclude คิดเต็ม, 1=Include ถอด VAT ออก
				SUM(
					CASE 
						WHEN sdi.is_vat = 0 THEN sdi.line_total 
						WHEN sdi.is_vat = 1 THEN sdi.line_total * 100 / 107
						ELSE 0 
					END
				) as total_vatable,
				
				-- Non-Vatable: 2=No VAT
				SUM(CASE WHEN sdi.is_vat = 2 THEN sdi.line_total ELSE 0 END) as total_non_vatable,

				-- VAT Amount: 0=Exclude คิด 7% จากยอดเต็ม, 1=Include ถอด 7% ออกจากยอดรวม
				SUM(
					CASE 
						WHEN sdi.is_vat = 0 THEN sdi.line_total * 0.07
						WHEN sdi.is_vat = 1 THEN sdi.line_total * 7 / 107
						ELSE 0 
					END
				) as total_vat,

				-- WHT Amount: คิดเปอร์เซ็นต์จากยอดก่อนรวม VAT เสมอ
				SUM(
					CASE
						WHEN sdi.is_vat = 0 THEN sdi.line_total * sdi.wht_rate / 100
						WHEN sdi.is_vat = 1 THEN (sdi.line_total * 100 / 107) * sdi.wht_rate / 100
						WHEN sdi.is_vat = 2 THEN sdi.line_total * sdi.wht_rate / 100
						ELSE 0
					END
				) as total_wht
            FROM sales_document_items sdi
            JOIN sales_documents sd ON sdi.document_id = sd.id
			LEFT JOIN customers c ON sd.customer_id = c.id
			LEFT JOIN job_orders j ON sd.job_order_id = j.id
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

		// ดึงข้อมูลรายการขาย และทำการคำนวณแยกคอลัมน์จาก Database 
		const dataSql = `
            SELECT 
				sdi.id as item_id,
				sdi.description,
				sdi.quantity,
				sdi.unit_price,
				sdi.line_total,
				sdi.is_vat,
				sdi.wht_rate,
				
				CASE 
					WHEN sdi.is_vat = 0 THEN sdi.line_total 
					WHEN sdi.is_vat = 1 THEN sdi.line_total * 100 / 107
					ELSE 0 
				END as vatable_amt,
				
				CASE 
					WHEN sdi.is_vat = 2 THEN sdi.line_total 
					ELSE 0 
				END as non_vatable_amt,
				
				CASE 
					WHEN sdi.is_vat = 0 THEN sdi.line_total * 0.07
					WHEN sdi.is_vat = 1 THEN sdi.line_total * 7 / 107
					ELSE 0 
				END as vat_amt,
				
				CASE
					WHEN sdi.is_vat = 0 THEN sdi.line_total * sdi.wht_rate / 100
					WHEN sdi.is_vat = 1 THEN (sdi.line_total * 100 / 107) * sdi.wht_rate / 100
					WHEN sdi.is_vat = 2 THEN sdi.line_total * sdi.wht_rate / 100
					ELSE 0
				END as wht_amt,
				
				sd.document_number,
				sd.document_date,
				sd.document_type,
				sd.status,
				c.company_name as customer_name,
				j.job_number
            FROM sales_document_items sdi
            JOIN sales_documents sd ON sdi.document_id = sd.id
			LEFT JOIN customers c ON sd.customer_id = c.id
			LEFT JOIN job_orders j ON sd.job_order_id = j.id
            ${whereClause}
            ORDER BY sd.document_date DESC, sd.document_number DESC, sdi.item_order ASC
            LIMIT ${limit} OFFSET ${offset}
        `;

		const [salesRows] = await pool.query<any[]>(dataSql, params);

		return {
			sales: salesRows,
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
		console.error('Failed to load sales report:', err);
		const errorMessage = err instanceof Error ? err.message : String(err);
		throw error(500, `Failed to load data. Error: ${errorMessage}`);
	}
};