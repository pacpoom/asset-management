import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { cymspool } from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const { id } = params;

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
		const orderRaw = f.get('pulling_order');

		const new_order = orderRaw ? parseInt(orderRaw as string, 10) : null;

		if (!plan_id || !p_date) {
			return fail(400, { message: 'Required fields missing' });
		}

		try {
			const [oldData]: any = await cymspool.execute(
				`SELECT pulling_order, DATE(pulling_date) as old_date, shop 
				 FROM container_pulling_plans WHERE id = ?`,
				[id]
			);

			if (oldData.length > 0) {
				const old_order = oldData[0].pulling_order;
				const old_shop = oldData[0].shop;
				const old_date_str = new Date(oldData[0].old_date).toISOString().split('T')[0];

				if (new_order !== null) {
					if (old_order === null || old_date_str !== p_date) {
						await cymspool.execute(
							`UPDATE container_pulling_plans 
							 SET pulling_order = pulling_order + 1 
							 WHERE DATE(pulling_date) = ? AND shop = ? AND pulling_order >= ? AND id != ?`,
							[p_date, old_shop, new_order, id]
						);
					} else if (new_order < old_order) {
						await cymspool.execute(
							`UPDATE container_pulling_plans 
							 SET pulling_order = pulling_order + 1 
							 WHERE DATE(pulling_date) = ? AND shop = ? AND pulling_order >= ? AND pulling_order < ? AND id != ?`,
							[p_date, old_shop, new_order, old_order, id]
						);
					} else if (new_order > old_order) {
						await cymspool.execute(
							`UPDATE container_pulling_plans 
							 SET pulling_order = pulling_order - 1 
							 WHERE DATE(pulling_date) = ? AND shop = ? AND pulling_order > ? AND pulling_order <= ? AND id != ?`,
							[p_date, old_shop, old_order, new_order, id]
						);
					}
				} else if (old_order !== null) {
					await cymspool.execute(
						`UPDATE container_pulling_plans 
						 SET pulling_order = pulling_order - 1 
						 WHERE DATE(pulling_date) = ? AND shop = ? AND pulling_order > ? AND id != ?`,
						[old_date_str, old_shop, old_order, id]
					);
				}
			}

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
					new_order,
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
