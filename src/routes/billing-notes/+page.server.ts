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
                bn.billing_note_number LIKE ? OR
                c.name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm);
		}

		if (filterStatus) {
			whereClause += ` AND bn.status = ? `;
			params.push(filterStatus);
		}

		const countSql = `
            SELECT COUNT(bn.id) as total
            FROM billing_notes bn
            LEFT JOIN customers c ON bn.customer_id = c.id
            ${whereClause}`;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		const fetchSql = `
            SELECT
                bn.id, bn.billing_note_number, bn.billing_date, bn.due_date, bn.total_amount, bn.status,
                c.name as customer_name,
                u.full_name as created_by_name
            FROM billing_notes bn
            LEFT JOIN customers c ON bn.customer_id = c.id
            LEFT JOIN users u ON bn.created_by_user_id = u.id
            ${whereClause}
            ORDER BY bn.billing_date DESC, bn.id DESC
            LIMIT ? OFFSET ?
        `;
		const fetchParams = [...params, pageSize, offset];
		const [rows] = await pool.query(fetchSql, fetchParams);

		return {
			billingNotes: JSON.parse(JSON.stringify(rows)),
			currentPage: page,
			totalPages,
			searchQuery,
			filterStatus
		};
	} catch (err: any) {
		console.error('Failed to load billing notes:', err);
		throw error(500, `Failed to load billing notes: ${err.message}`);
	}
};

export const actions: Actions = {
	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) return fail(400, { message: 'ไม่พบรหัสเอกสาร' });

		try {
			await pool.execute('DELETE FROM billing_notes WHERE id = ?', [id]);
			return { success: true };
		} catch (err: any) {
			console.error('Delete Billing Note Error:', err);
			return fail(500, { message: err.message });
		}
	}
};
