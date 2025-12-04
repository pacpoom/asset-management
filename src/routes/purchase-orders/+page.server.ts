import { fail, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

interface PurchaseOrder extends RowDataPacket {
	id: number;
	po_number: string;
	po_date: string;
	vendor_id: number;
	vendor_name: string;
	status: string;
	total_amount: number;
	created_by_name: string;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const pageSize = 15;
	const offset = (page - 1) * pageSize;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (
                po.po_number LIKE ? OR
                v.name LIKE ? OR
                po.status LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm);
		}

		const countSql = `
            SELECT COUNT(*) as total
            FROM purchase_orders po
            LEFT JOIN vendors v ON po.vendor_id = v.id
            ${whereClause}
        `;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		const fetchSql = `
            SELECT 
                po.id, po.po_number, po.po_date, po.status, po.total_amount,
                v.name as vendor_name,
                u.full_name as created_by_name
            FROM purchase_orders po
            LEFT JOIN vendors v ON po.vendor_id = v.id
            LEFT JOIN users u ON po.created_by = u.id
            ${whereClause}
            ORDER BY po.created_at DESC
            LIMIT ? OFFSET ?
        `;
		const fetchParams = [...params, pageSize, offset];
		const [rows] = await pool.query<any[]>(fetchSql, fetchParams);

		return {
			purchaseOrders: JSON.parse(JSON.stringify(rows)),
			currentPage: page,
			totalPages,
			searchQuery,
			totalItems: total
		};
	} catch (err: any) {
		console.error('Failed to load purchase orders:', err.message);
		throw error(500, `Failed to load data: ${err.message}`);
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

			await connection.execute('DELETE FROM purchase_order_items WHERE purchase_order_id = ?', [
				id
			]);

			await connection.execute('DELETE FROM purchase_orders WHERE id = ?', [id]);

			await connection.commit();
			return { success: true, message: 'ลบใบสั่งซื้อเรียบร้อยแล้ว' };
		} catch (err: any) {
			await connection.rollback();
			console.error('Delete PO Error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการลบ: ' + err.message });
		} finally {
			connection.release();
		}
	}
};
