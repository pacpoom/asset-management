import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ url }) => {
	// 1. รับค่าค้นหาและแบ่งหน้า
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const filterStatus = url.searchParams.get('status') || '';
	const pageSize = 15;
	const offset = (page - 1) * pageSize;

	try {
		// 2. สร้าง Query (คล้ายกับ Receipts)
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (
                i.invoice_number LIKE ? OR
                c.name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm);
		}

		if (filterStatus) {
			whereClause += ` AND i.status = ? `;
			params.push(filterStatus);
		}

		// 3. นับจำนวนทั้งหมด
		const countSql = `
            SELECT COUNT(i.id) as total
            FROM invoices i
            LEFT JOIN customers c ON i.customer_id = c.id
            ${whereClause}`;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		// 4. ดึงข้อมูล (Join ลูกค้าและผู้สร้าง)
		const fetchSql = `
            SELECT
                i.id, i.invoice_number, i.invoice_date, i.due_date, i.total_amount, i.status,
                c.name as customer_name,
                u.full_name as created_by_name
            FROM invoices i
            LEFT JOIN customers c ON i.customer_id = c.id
            LEFT JOIN users u ON i.created_by_user_id = u.id
            ${whereClause}
            ORDER BY i.invoice_date DESC, i.id DESC
            LIMIT ? OFFSET ?
        `;
		const fetchParams = [...params, pageSize, offset];
		const [rows] = await pool.query(fetchSql, fetchParams);

		const invoices = JSON.parse(JSON.stringify(rows));

		return {
			invoices,
			currentPage: page,
			totalPages,
			searchQuery,
			filterStatus
		};
	} catch (err: any) {
		console.error('Failed to load invoices:', err);
		throw error(500, `Failed to load invoices: ${err.message}`);
	}
};

export const actions: Actions = {
	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) return fail(400, { message: 'ไม่พบรหัสเอกสาร' });

		try {
			// ลบใบแจ้งหนี้ (Items และ Attachments จะหายไปเองถ้าตั้ง Cascade ไว้ หรือจะลบแยกก็ได้)
			await pool.execute('DELETE FROM invoices WHERE id = ?', [id]);
			return { success: true };
		} catch (err: any) {
			console.error('Delete Invoice Error:', err);
			return fail(500, { message: err.message });
		}
	}
};
