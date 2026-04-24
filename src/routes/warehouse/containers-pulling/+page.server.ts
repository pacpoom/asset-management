import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { cymspool } from '$lib/server/database';

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('search') || '';
	const statusFilter = url.searchParams.get('status') || 'All';

	const pullingDate = url.searchParams.get('pullingDate') || '';

	const limit = Math.max(1, parseInt(url.searchParams.get('limit') || '10'));
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
	const offset = (page - 1) * limit;

	try {
		let where = `WHERE 1=1`;
		const params: any[] = [];
		if (search) {
			where += ` AND (p.pulling_plan_no LIKE ? OR c.container_no LIKE ? OR op.model LIKE ?)`;
			const s = `%${search}%`;
			params.push(s, s, s);
		}
		if (statusFilter !== 'All') {
			where += ` AND p.status = ?`;
			params.push(statusFilter);
		}

		if (pullingDate) {
			where += ` AND DATE(p.pulling_date) = ?`;
			params.push(pullingDate);
		}

		const [count]: any = await cymspool.execute(
			`SELECT COUNT(p.id) as total FROM container_pulling_plans p LEFT JOIN container_order_plans op ON p.container_order_plan_id = op.id LEFT JOIN containers c ON op.container_id = c.id ${where}`,
			params
		);
		const totalItems = count[0].total;

		const [rows]: any = await cymspool.execute(
			`SELECT p.*, op.model, op.type as op_type, c.container_no FROM container_pulling_plans p LEFT JOIN container_order_plans op ON p.container_order_plan_id = op.id LEFT JOIN containers c ON op.container_id = c.id ${where} ORDER BY p.pulling_date DESC, p.id DESC LIMIT ${limit} OFFSET ${offset}`,
			params
		);

		return {
			plans: rows,
			searchQuery: search,
			statusFilter,
			pullingDate,
			pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) }
		};
	} catch (e) {
		return {
			plans: [],
			searchQuery: '',
			statusFilter: 'All',
			pullingDate: '',
			pagination: { page: 1, limit: 10, totalItems: 0, totalPages: 1 }
		};
	}
};

export const actions: Actions = {
	delete: async ({ request }) => {
		const f = await request.formData();
		const id = f.get('id');
		try {
			await cymspool.execute(`DELETE FROM container_pulling_plans WHERE id = ?`, [id]);
			return { type: 'success' };
		} catch {
			return fail(500, { message: 'Delete failed' });
		}
	},
	import: async ({ request }) => {
		const f = await request.formData();
		const file = f.get('import_file') as File;
		if (!file) return fail(400, { message: 'No file' });
		// TODO: Implement Excel parsing logic here
		return { type: 'success', message: 'Imported' };
	}
};
