import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ url }) => {
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const filterStatus = url.searchParams.get('status') || '';
	const pageSize = 15;
	const offset = (page - 1) * pageSize;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (
                q.quotation_number LIKE ? OR
                c.name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm);
		}

		if (filterStatus) {
			whereClause += ` AND q.status = ? `;
			params.push(filterStatus);
		}

		const countSql = `
            SELECT COUNT(q.id) as total
            FROM quotations q
            LEFT JOIN customers c ON q.customer_id = c.id
            ${whereClause}`;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		const fetchSql = `
            SELECT
                q.id, q.quotation_number, q.quotation_date, q.valid_until, q.total_amount, q.status,
                c.name as customer_name,
                u.full_name as created_by_name
            FROM quotations q
            LEFT JOIN customers c ON q.customer_id = c.id
            LEFT JOIN users u ON q.created_by_user_id = u.id
            ${whereClause}
            ORDER BY q.quotation_date DESC, q.id DESC
            LIMIT ? OFFSET ?
        `;
		const fetchParams = [...params, pageSize, offset];
		const [rows] = await pool.query(fetchSql, fetchParams);

		return {
			quotations: JSON.parse(JSON.stringify(rows)),
			currentPage: page,
			totalPages,
			searchQuery,
			filterStatus
		};
	} catch (err: any) {
		console.error('Failed to load quotations:', err);
		throw error(500, `Failed to load quotations: ${err.message}`);
	}
};

export const actions: Actions = {
	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) return fail(400, { message: 'ไม่พบรหัสเอกสาร' });

		try {
			await pool.execute('DELETE FROM quotations WHERE id = ?', [id]);
			return { success: true };
		} catch (err: any) {
			console.error('Delete Quotation Error:', err);
			return fail(500, { message: err.message });
		}
	}
};
