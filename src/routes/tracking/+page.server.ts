import type { Actions } from './$types';
import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load = async () => {
	return {};
};

export const actions: Actions = {
	search: async ({ request }) => {
		const data = await request.formData();
		const keyword = data.get('keyword')?.toString().trim();

		if (!keyword) {
			return fail(400, { message: 'กรุณากรอกเลข Ticket หรือ เบอร์โทรศัพท์' });
		}

		try {
			const [rows] = await pool.execute<any[]>(
				`SELECT 
                    ticket_code, 
                    asset_name, 
                    repair_status, 
                    issue_description, 
                    admin_notes, 
                    image_url, 
                    completion_image_url,
                    DATE_FORMAT(created_at, '%d/%m/%Y %H:%i') as created_at_formatted 
                 FROM asset_repairs 
                 WHERE ticket_code = ? OR contact_info LIKE ? 
                 ORDER BY created_at DESC`,
				[keyword, `%${keyword}%`]
			);

			if (rows.length === 0) {
				return fail(404, { message: 'ไม่พบข้อมูลการแจ้งซ่อมในระบบ', keyword });
			}

			return { success: true, results: rows, keyword };
		} catch (error) {
			console.error(error);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการค้นหา' });
		}
	}
};
