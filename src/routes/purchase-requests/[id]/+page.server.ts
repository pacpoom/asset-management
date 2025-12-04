import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		// 1. ดึงข้อมูล PR Header + ข้อมูลผู้ขอ (Requester)
		const [prRows] = await pool.query<any[]>(
			`
            SELECT pr.*, 
                   u.full_name as requester_name, 
                   u.email as requester_email,
                   v.name as vendor_name,             -- [เพิ่ม] ชื่อผู้ติดต่อ Vendor
                   v.company_name as vendor_company,  -- [เพิ่ม] ชื่อบริษัท Vendor
                   v.phone as vendor_phone,           -- [เพิ่ม] เบอร์โทร Vendor (เผื่อใช้)
                   v.email as vendor_email            -- [เพิ่ม] อีเมล Vendor (เผื่อใช้)
            FROM purchase_requests pr
            LEFT JOIN users u ON pr.requester_id = u.id
            LEFT JOIN vendors v ON pr.vendor_id = v.id  -- [เพิ่ม] Join ตาราง Vendors
            WHERE pr.id = ?
        `,
			[id]
		);

		if (prRows.length === 0) throw error(404, 'Purchase Request not found');
		const pr = prRows[0];

		//ดึงรายการสินค้า
		const [items] = await pool.query<any[]>(
			`SELECT * FROM purchase_request_items WHERE purchase_request_id = ? ORDER BY id ASC`,
			[id]
		);

		// ดึงข้อมูลบริษัท (Company)
		const [companyRows] = await pool.query<any[]>(`SELECT * FROM company LIMIT 1`);

		return {
			pr: JSON.parse(JSON.stringify(pr)),
			items: JSON.parse(JSON.stringify(items)),
			company: companyRows.length > 0 ? JSON.parse(JSON.stringify(companyRows[0])) : null
		};
	} catch (err: any) {
		console.error('Error loading PR:', err);
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	updateStatus: async ({ request, params }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();
		const status = formData.get('status')?.toString();

		if (!id || !status) return fail(400, { message: 'Invalid data' });

		try {
			await pool.execute('UPDATE purchase_requests SET status = ? WHERE id = ?', [status, id]);
			return { success: true };
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
	},

	delete: async ({ params }) => {
		const id = parseInt(params.id);
		if (!id) return fail(400, { message: 'Invalid ID' });

		try {
			const connection = await pool.getConnection();
			await connection.beginTransaction();

			await connection.execute('DELETE FROM purchase_request_items WHERE purchase_request_id = ?', [
				id
			]);
			await connection.execute('DELETE FROM purchase_requests WHERE id = ?', [id]);

			await connection.commit();
			connection.release();
		} catch (err: any) {
			console.error('Delete PR Error:', err);
			return fail(500, { message: err.message });
		}

		throw redirect(303, '/purchase-requests');
	}
};
