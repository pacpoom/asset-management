import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ url }) => {
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const filterStatus = url.searchParams.get('status') || '';
	const filterType = url.searchParams.get('type') || '';
	const pageSize = 15;
	const offset = (page - 1) * pageSize;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (
                sd.document_number LIKE ? OR
                c.name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm);
		}

		if (filterStatus) {
			whereClause += ` AND sd.status = ? `;
			params.push(filterStatus);
		}

		if (filterType) {
			whereClause += ` AND sd.document_type = ? `;
			params.push(filterType);
		}

		const countSql = `
            SELECT COUNT(sd.id) as total
            FROM sales_documents sd
            LEFT JOIN customers c ON sd.customer_id = c.id
            ${whereClause}`;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		const fetchSql = `
            SELECT
                sd.id, sd.document_type, sd.document_number, sd.document_date, sd.due_date, sd.total_amount, sd.status,
                c.name as customer_name,
                u.full_name as created_by_name
            FROM sales_documents sd
            LEFT JOIN customers c ON sd.customer_id = c.id
            LEFT JOIN users u ON sd.created_by_user_id = u.id
            ${whereClause}
            ORDER BY sd.document_date DESC, sd.id DESC
            LIMIT ? OFFSET ?
        `;
		const fetchParams = [...params, pageSize, offset];
		const [rows] = await pool.query(fetchSql, fetchParams);

		return {
			documents: JSON.parse(JSON.stringify(rows)),
			currentPage: page,
			totalPages,
			searchQuery,
			filterStatus,
			filterType
		};
	} catch (err: any) {
		console.error('Failed to load documents:', err);
		throw error(500, `Failed to load documents: ${err.message}`);
	}
};

export const actions: Actions = {
	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) return fail(400, { message: 'ไม่พบรหัสเอกสาร' });

		try {
			await pool.execute('DELETE FROM sales_document_items WHERE document_id = ?', [id]);
			await pool.execute('DELETE FROM sales_document_attachments WHERE document_id = ?', [id]);
			await pool.execute('DELETE FROM sales_documents WHERE id = ?', [id]);
			return { success: true };
		} catch (err: any) {
			console.error('Delete Document Error:', err);
			return fail(500, { message: err.message });
		}
	}
};
