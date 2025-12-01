import { error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ url }) => {
	const type = url.searchParams.get('type') || 'ALL';
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const pageSize = 15;
	const offset = (page - 1) * pageSize;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: any[] = [];

		if (type !== 'ALL') {
			whereClause += ' AND voucher_type = ? ';
			params.push(type);
		}

		// ดึงจำนวนทั้งหมด
		const [countResult] = await pool.execute<any[]>(
			`SELECT COUNT(id) as total FROM general_vouchers ${whereClause}`,
			params
		);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		// ดึงข้อมูล
		const [rows] = await pool.query<any[]>(
			`SELECT * FROM general_vouchers 
             ${whereClause} 
             ORDER BY voucher_date DESC, id DESC 
             LIMIT ? OFFSET ?`,
			[...params, pageSize, offset]
		);

		return {
			vouchers: JSON.parse(JSON.stringify(rows)),
			currentPage: page,
			totalPages,
			currentType: type
		};
	} catch (err: any) {
		console.error('Load Vouchers Error:', err);
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');
		if (!id) return;

		try {
			await pool.execute('DELETE FROM general_vouchers WHERE id = ?', [id]);
			return { success: true };
		} catch (err) {
			console.error('Delete Voucher Error:', err);
			return { success: false };
		}
	}
};
