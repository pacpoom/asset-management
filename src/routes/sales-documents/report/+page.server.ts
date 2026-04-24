import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { pool } from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';

export const load: PageServerLoad = async ({ url, locals }) => {
	// หากมีระบบตรวจสอบสิทธิ์ ให้เปิดใช้งานบรรทัดล่างนี้
	checkPermission(locals, 'view sales report');

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

		// คำนวณจำนวนข้อมูลทั้งหมด และผลรวมยอดขาย พร้อมยอด Vat, Non-Vat และ WHT สำหรับโชว์บน Dashboard
		const countSql = `
			SELECT 
				COUNT(*) as total,
				SUM(sdi.line_total) as total_amount,
				SUM(CASE WHEN sd.status = 'Paid' THEN sdi.line_total ELSE 0 END) as total_paid,
				SUM(CASE WHEN sd.status = 'Draft' THEN sdi.line_total ELSE 0 END) as total_draft,
				SUM(CASE WHEN sdi.is_vat = 1 THEN sdi.line_total ELSE 0 END) as total_vatable,
				SUM(CASE WHEN sdi.is_vat = 0 THEN sdi.line_total ELSE 0 END) as total_non_vatable,
				SUM(sdi.line_total * sdi.wht_rate / 100) as total_wht
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
		const totalWht = Number(countResult[0].total_wht) || 0;
		const totalPages = Math.ceil(totalCount / limit);

		// ดึงข้อมูลรายการขาย (Sales Details)
		const dataSql = `
            SELECT 
				sdi.id as item_id,
				sdi.description,
				sdi.quantity,
				sdi.unit_price,
				sdi.line_total,
				sdi.is_vat,
				sdi.wht_rate,
				(sdi.line_total * sdi.wht_rate / 100) as wht_amount,
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
			totalWht,
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