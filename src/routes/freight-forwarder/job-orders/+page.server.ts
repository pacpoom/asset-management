import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load = async ({ url }) => {
	// รับค่า page, limit และ search จาก URL params
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '10');
	const search = url.searchParams.get('search') || '';
	const offset = (page - 1) * limit;

	let whereClause = '';
	let queryParams: any[] = [];

	// ถ้ามีการค้นหา ให้สร้าง WHERE clause
	if (search) {
		whereClause = `
			WHERE j.job_number LIKE ? 
			OR c.name LIKE ? 
			OR c.company_name LIKE ? 
			OR v.name LIKE ? 
			OR v.company_name LIKE ?
		`;
		const searchParam = `%${search}%`;
		queryParams = [searchParam, searchParam, searchParam, searchParam, searchParam];
	}

	// Query สำหรับนับจำนวนข้อมูลทั้งหมดตามคำค้นหา
	const countSql = `
		SELECT COUNT(j.id) as total 
		FROM job_orders j
		LEFT JOIN customers c ON j.customer_id = c.id
		LEFT JOIN vendors v ON j.vendor_id = v.id
		${whereClause}
	`;
	const [countRows] = await pool.query(countSql, queryParams);
	const totalJobs = (countRows as any[])[0].total;

	// Query ดึงข้อมูลจริง 
	// เปลี่ยนมาใช้ .query และต่อ string สำหรับ LIMIT/OFFSET เพื่อแก้ปัญหา mysqld_stmt_execute
	const sql = `
		SELECT j.*, 
		       c.name as customer_name, c.company_name, c.phone as customer_phone,
		       v.name as vendor_name, v.company_name as vendor_company_name, v.phone as vendor_phone
		FROM job_orders j
		LEFT JOIN customers c ON j.customer_id = c.id
		LEFT JOIN vendors v ON j.vendor_id = v.id
		${whereClause}
		ORDER BY j.job_date DESC, j.id DESC
		LIMIT ${Number(limit)} OFFSET ${Number(offset)}
	`;
	
	const [rows] = await pool.query(sql, queryParams);
	
	return { 
		job_orders: JSON.parse(JSON.stringify(rows)),
		pagination: {
			total: totalJobs,
			page,
			limit,
			search
		}
	};
};

export const actions = {
	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) {
			return fail(400, { message: 'ไม่พบ ID ของรายการที่ต้องการลบ' });
		}

		try {
			await pool.query('DELETE FROM job_orders WHERE id = ?', [id]);
			return { success: true };
		} catch (error) {
			console.error(error);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
		}
	}
};