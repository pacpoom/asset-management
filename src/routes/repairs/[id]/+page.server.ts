import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const repairId = params.id;

	try {
		const [rows] = await pool.execute<any[]>(
			`
            SELECT 
                ar.*,
                a.name AS asset_name,
                a.asset_tag,
                a.image_url AS asset_image,
                u.full_name AS reported_by_name
            FROM asset_repairs ar
            JOIN assets a ON ar.asset_id = a.id
            LEFT JOIN users u ON ar.reported_by_user_id = u.id
            WHERE ar.id = ?
        `,
			[repairId]
		);

		if (rows.length === 0) {
			throw redirect(302, '/repairs');
		}

		const repair = { ...rows[0] };

		if (repair.repair_date) {
			repair.repair_date = new Date(repair.repair_date).toISOString().split('T')[0];
		}

		return { repair };
	} catch (error) {
		console.error('Error loading repair detail:', error);
		throw error;
	}
};

export const actions: Actions = {
	updateRepair: async ({ request, params }) => {
		const data = await request.formData();
		const repairId = params.id;

		const repair_status = data.get('repair_status');
		const vendor_name = data.get('vendor_name');
		const repair_cost = data.get('repair_cost');
		const notes = data.get('notes');
		const repair_date = data.get('repair_date');

		try {
			await pool.execute(
				`
                UPDATE asset_repairs 
                SET 
                    repair_status = ?,
                    vendor_name = ?,
                    repair_cost = ?,
                    notes = ?,
                    repair_date = ?,
                    updated_at = NOW()
                WHERE id = ?
            `,
				[
					repair_status,
					vendor_name || null,
					repair_cost ? parseFloat(repair_cost.toString()) : 0,
					notes || null,
					repair_date || null,
					repairId
				]
			);

			return { success: true, message: 'อัปเดตข้อมูลการซ่อมเรียบร้อยแล้ว' };
		} catch (error) {
			console.error('Error updating repair:', error);
			return fail(500, { success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
		}
	}
};
