import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { cymspool } from '$lib/server/database';

export const load: PageServerLoad = async () => {
	try {
		const [rows]: any = await cymspool.execute(`
			SELECT 
				op.id, 
				op.plan_no, 
				c.container_no 
			FROM container_order_plans op
			INNER JOIN container_stocks s ON op.id = s.container_order_plan_id
			INNER JOIN containers c ON s.container_id = c.id
			GROUP BY op.id, op.plan_no, c.container_no
			ORDER BY op.created_at DESC
			LIMIT 100
		`);

		return {
			availablePlans: rows
		};
	} catch (error) {
		console.error('Database Error in Create Load:', error);
		return { availablePlans: [] };
	}
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();

		const container_order_plan_id = formData.get('container_order_plan_id');
		const plan_type = formData.get('plan_type');
		const pulling_date = formData.get('pulling_date');
		const destination = formData.get('destination');
		const remarks = formData.get('remarks');

		if (!container_order_plan_id || !pulling_date) {
			return fail(400, { message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
		}

		try {
			const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, '');
			const randomCode = Math.floor(1000 + Math.random() * 9000);
			const pulling_plan_no = `PL-${dateCode}-${randomCode}`;

			await cymspool.execute(
				`INSERT INTO container_pulling_plans 
				(pulling_plan_no, container_order_plan_id, plan_type, pulling_date, destination, remarks, status, created_at, updated_at) 
				VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
				[pulling_plan_no, container_order_plan_id, plan_type, pulling_date, destination, remarks]
			);
		} catch (error) {
			console.error('Database Error in Create Action:', error);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
		}

		throw redirect(303, '/warehouse/containers-pulling');
	}
};
