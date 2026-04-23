import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { cymspool } from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const { id } = params;

	// 🌟 1. ดึงข้อมูลแผนที่จะแก้ไขมาแสดง
	const [rows]: any = await cymspool.execute(
		`SELECT p.*, op.plan_no, c.container_no 
		 FROM container_pulling_plans p
		 LEFT JOIN container_order_plans op ON p.container_order_plan_id = op.id
		 LEFT JOIN containers c ON op.container_id = c.id
		 WHERE p.id = ?`,
		[id]
	);

	if (rows.length === 0) {
		throw redirect(303, '/warehouse/containers-pulling');
	}

	// 🌟 2. ดึงรายการตู้ที่มีในสต็อกมาเผื่อกรณีเปลี่ยนตู้ (เหมือนหน้า Create)
	const [availablePlans]: any = await cymspool.execute(
		`SELECT op.id, op.plan_no, c.container_no 
		 FROM container_order_plans op 
		 INNER JOIN containers c ON op.container_id = c.id 
		 ORDER BY op.created_at DESC LIMIT 100`
	);

	return {
		plan: rows[0],
		availablePlans
	};
};

export const actions: Actions = {
	default: async ({ request, params }) => {
		const { id } = params;
		const f = await request.formData();

		const plan_id = f.get('container_order_plan_id');
		const p_date = f.get('pulling_date');
		const status = f.get('status');
		const order = f.get('pulling_order');

		if (!plan_id || !p_date) {
			return fail(400, { message: 'Required fields missing' });
		}

		try {
			// 🌟 อัปเดตข้อมูลแผนการเบิก
			await cymspool.execute(
				`UPDATE container_pulling_plans 
				 SET container_order_plan_id = ?, 
				     plan_type = ?, 
				     pulling_date = ?, 
				     destination = ?, 
				     remarks = ?, 
				     status = ?, 
				     pulling_order = ?, 
				     updated_at = NOW() 
				 WHERE id = ?`,
				[
					plan_id,
					f.get('plan_type'),
					p_date,
					f.get('destination'),
					f.get('remarks'),
					status,
					order || null,
					id
				]
			);
		} catch (e) {
			console.error('Update Error:', e);
			return fail(500, { message: 'Database error occurred' });
		}

		throw redirect(303, '/warehouse/containers-pulling');
	}
};
