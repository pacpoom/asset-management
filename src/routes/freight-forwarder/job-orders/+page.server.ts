import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load = async ({ url }) => {
	// รับค่า page และ limit จาก URL params (ค่าเริ่มต้น page = 1, limit = 10)
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '10');
	const offset = (page - 1) * limit;

	// Query สำหรับนับจำนวนข้อมูลทั้งหมด (เพื่อใช้ทำปุ่มแบ่งหน้าฝั่ง Frontend)
	const [countRows] = await pool.query('SELECT COUNT(id) as total FROM job_orders');
	const totalJobs = (countRows as any[])[0].total;

	// Query ข้อมูลพร้อมการทำ Pagination ด้วย LIMIT และ OFFSET
	const sql = `
		SELECT j.*, 
		       c.name as customer_name, c.company_name, c.phone as customer_phone,
		       v.name as vendor_name, v.company_name as vendor_company_name, v.phone as vendor_phone
		FROM job_orders j
		LEFT JOIN customers c ON j.customer_id = c.id
		LEFT JOIN vendors v ON j.vendor_id = v.id
		ORDER BY j.job_date DESC, j.id DESC
		LIMIT ? OFFSET ?
	`;
	
	// ใช้ .execute เพื่อให้รองรับ parameter แบบตัวเลขสำหรับ LIMIT / OFFSET ได้อย่างปลอดภัย
	const [rows] = await pool.execute(sql, [limit, offset]);
	
	return { 
		job_orders: JSON.parse(JSON.stringify(rows)),
		pagination: {
			total: totalJobs,
			page,
			limit
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