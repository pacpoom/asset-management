import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';

export const load: PageServerLoad = async ({ url, locals }) => {
	checkPermission(locals, 'view vendors');

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const pageSize = 15;
	const offset = (page - 1) * pageSize;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (
                pr.pr_number LIKE ? OR
                pr.department LIKE ? OR
                pr.description LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm);
		}

		const [countResult] = await pool.execute<any[]>(
			`SELECT COUNT(*) as total FROM purchase_requests pr ${whereClause}`,
			params
		);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		const fetchSql = `
            SELECT pr.*, u.full_name as requester_name
            FROM purchase_requests pr
            LEFT JOIN users u ON pr.requester_id = u.id
            ${whereClause}
            ORDER BY pr.created_at DESC
            LIMIT ? OFFSET ?
        `;
		const fetchParams = [...params, pageSize, offset];
		const [rows] = await pool.query<any[]>(fetchSql, fetchParams);

		return {
			purchaseRequests: JSON.parse(JSON.stringify(rows)),
			currentPage: page,
			totalPages,
			searchQuery,
			totalItems: total
		};
	} catch (err: any) {
		console.error('Failed to load PRs:', err);
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	delete: async ({ request, locals }) => {
		checkPermission(locals, 'view vendors');
		const formData = await request.formData();
		const id = formData.get('id') as string;

		if (!id) {
			return fail(400, { message: 'ไม่พบ ID ของรายการที่ต้องการลบ' });
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			// ลบรายการสินค้าและใบ PR
			await connection.execute('DELETE FROM purchase_request_items WHERE purchase_request_id = ?', [
				id
			]);
			await connection.execute('DELETE FROM purchase_requests WHERE id = ?', [id]);

			await connection.commit();
			return { success: true, message: 'ลบใบขอซื้อเรียบร้อยแล้ว' };
		} catch (err: any) {
			await connection.rollback();
			console.error('Delete PR Error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการลบ: ' + err.message });
		} finally {
			connection.release();
		}
	}
};
