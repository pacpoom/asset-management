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
	default: async ({ request, locals }) => {
		const formData = await request.formData();

		const container_order_plan_id = formData.get('container_order_plan_id');
		const plan_type = formData.get('plan_type');
		const pulling_date = formData.get('pulling_date');
		const destination = formData.get('destination');
		const remarks = formData.get('remarks');

		const shop = formData.get('shop');

		const user_id = locals.user?.id || 1;

		if (!container_order_plan_id || !pulling_date || !shop) {
			return fail(400, { message: 'กรุณากรอกข้อมูลที่จำเป็น (Container, Date, Shop) ให้ครบถ้วน' });
		}

		try {
			const d = new Date();
			const yy = d.getFullYear().toString().slice(-2);
			const mm = String(d.getMonth() + 1).padStart(2, '0');
			const dd = String(d.getDate()).padStart(2, '0');
			const dateCode = `${yy}${mm}${dd}`;
			const prefix = `PULL${dateCode}`;

			const [latestRows]: any = await cymspool.execute(
				`SELECT pulling_plan_no FROM container_pulling_plans 
				 WHERE pulling_plan_no LIKE ? 
				 ORDER BY pulling_plan_no DESC LIMIT 1`,
				[`${prefix}%`]
			);

			let nextNum = 1;
			if (latestRows.length > 0 && latestRows[0].pulling_plan_no) {
				const lastNo = latestRows[0].pulling_plan_no;
				const lastRunningStr = lastNo.slice(-4);
				const lastRunningNum = parseInt(lastRunningStr, 10);
				if (!isNaN(lastRunningNum)) {
					nextNum = lastRunningNum + 1;
				}
			}

			const runningCode = String(nextNum).padStart(4, '0');
			const pulling_plan_no = `${prefix}${runningCode}`;

			await cymspool.execute(
				`INSERT INTO container_pulling_plans 
				(pulling_plan_no, container_order_plan_id, plan_type, pulling_date, shop, destination, remarks, status, user_id, created_at, updated_at) 
				VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
				[
					pulling_plan_no,
					container_order_plan_id,
					plan_type,
					pulling_date,
					shop,
					destination,
					remarks,
					user_id
				]
			);
		} catch (error) {
			console.error('Database Error in Create Action:', error);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
		}

		throw redirect(303, '/warehouse/containers-pulling');
	}
};
