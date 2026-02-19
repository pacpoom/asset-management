import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load = async () => {
	const sql = `
		SELECT j.*, c.name as customer_name, c.company_name 
		FROM job_orders j
		LEFT JOIN customers c ON j.customer_id = c.id
		ORDER BY j.job_date DESC, j.id DESC
		LIMIT 100
	`;
	const [rows] = await pool.query(sql);
	return { job_orders: JSON.parse(JSON.stringify(rows)) };
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
