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
                pd.document_number LIKE ? OR
                v.name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm);
		}

		if (filterStatus) {
			whereClause += ` AND pd.status = ? `;
			params.push(filterStatus);
		}

		if (filterType) {
			whereClause += ` AND pd.document_type = ? `;
			params.push(filterType);
		}

		const countSql = `
            SELECT COUNT(pd.id) as total
            FROM purchase_documents pd
            LEFT JOIN vendors v ON pd.vendor_id = v.id
            ${whereClause}`;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		const fetchSql = `
            SELECT
                pd.id, pd.document_type, pd.document_number, pd.document_date, pd.due_date, pd.total_amount, pd.status,
                v.name as vendor_name,
                u.full_name as created_by_name
            FROM purchase_documents pd
            LEFT JOIN vendors v ON pd.vendor_id = v.id
            LEFT JOIN users u ON pd.created_by_user_id = u.id
            ${whereClause}
            ORDER BY pd.document_date DESC, pd.id DESC
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
		console.error('Failed to load purchase documents:', err);
		throw error(500, `Failed to load documents: ${err.message}`);
	}
};

export const actions: Actions = {
	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) return fail(400, { message: 'ไม่พบรหัสเอกสาร' });

		try {
			// ลบข้อมูลรายการและไฟล์แนบก่อนลบหัวเอกสาร
			await pool.execute('DELETE FROM purchase_document_items WHERE document_id = ?', [id]);
			await pool.execute('DELETE FROM purchase_document_attachments WHERE document_id = ?', [id]);
			await pool.execute('DELETE FROM purchase_documents WHERE id = ?', [id]);
			return { success: true };
		} catch (err: any) {
			console.error('Delete Purchase Document Error:', err);
			return fail(500, { message: err.message });
		}
	}
};