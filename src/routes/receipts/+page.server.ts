import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ url }) => {
	// 1. รับค่าพารามิเตอร์สำหรับการค้นหาและแบ่งหน้า
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const filterStatus = url.searchParams.get('status') || '';
	const pageSize = 15;
	const offset = (page - 1) * pageSize;

	try {
		// --- สร้าง Query สำหรับดึงข้อมูล ---
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		// เงื่อนไขค้นหา (เลขที่ใบเสร็จ หรือ ชื่อลูกค้า)
		if (searchQuery) {
			whereClause += ` AND (
                r.receipt_number LIKE ? OR
                c.name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm);
		}

		// เงื่อนไขสถานะ
		if (filterStatus) {
			whereClause += ` AND r.status = ? `;
			params.push(filterStatus);
		}

		// 2. หาจำนวนรายการทั้งหมด (เพื่อทำ Pagination)
		const countSql = `
            SELECT COUNT(r.id) as total
            FROM receipts r
            LEFT JOIN customers c ON r.customer_id = c.id
            ${whereClause}`;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		// 3. ดึงข้อมูลใบเสร็จ (พร้อมชื่อลูกค้าและผู้สร้าง)
		const fetchSql = `
            SELECT
                r.id, r.receipt_number, r.receipt_date, r.total_amount, r.status,
                c.name as customer_name,
                u.full_name as created_by_name
            FROM receipts r
            LEFT JOIN customers c ON r.customer_id = c.id
            LEFT JOIN users u ON r.created_by_user_id = u.id
            ${whereClause}
            ORDER BY r.receipt_date DESC, r.id DESC
            LIMIT ? OFFSET ?
        `;
		const fetchParams = [...params, pageSize, offset];
		const [rows] = await pool.query(fetchSql, fetchParams);

		// แปลงข้อมูลให้เป็น JSON object ปกติ
		const receipts = JSON.parse(JSON.stringify(rows));

		return {
			receipts,
			currentPage: page,
			totalPages,
			searchQuery,
			filterStatus
		};
	} catch (err: any) {
		console.error('Failed to load receipts:', err);
		throw error(500, `Failed to load receipts: ${err.message}`);
	}
};

export const actions: Actions = {
	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) {
			return fail(400, { message: 'ไม่พบรหัสใบเสร็จที่ต้องการลบ' });
		}

		try {
			// ลบข้อมูล (ตารางลูกอย่าง receipt_items จะถูกลบอัตโนมัติถ้าตั้ง Foreign Key Cascade ไว้ใน DB)
			await pool.execute('DELETE FROM receipts WHERE id = ?', [id]);

			return { success: true, message: 'ลบใบเสร็จเรียบร้อยแล้ว' };
		} catch (err: any) {
			console.error('Delete Receipt Error:', err);
			return fail(500, { message: 'ไม่สามารถลบได้: ' + err.message });
		}
	}
};
