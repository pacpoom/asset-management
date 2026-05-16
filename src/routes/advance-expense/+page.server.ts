import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';
import { allocateMonthlyDocumentNumber } from '$lib/server/monthlyDocumentSequence';

interface AdvanceApplication extends RowDataPacket {
	id: number;
	document_number: string;
	document_date: string;
	application_title: string;
	bank_id: number;
	bank_name: string | null;
	reason: string;
	amount: number;
	remark: string | null;
	status: 'Pending' | 'Approved' | 'Rejected' | 'Completed';
	created_by: number;
	creator_name: string | null;
	created_at: string;
	total_spent: number;
	balance: number;
}

interface Bank extends RowDataPacket {
	id: number;
	name: string;
	account_number?: string;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	checkPermission(locals, 'view advance expense');

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const filterStatus = url.searchParams.get('status') || '';
	const pageSize = 15;
	const offset = (page - 1) * pageSize;

	try {
		let whereClause = 'WHERE 1=1';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (aa.document_number LIKE ? OR aa.application_title LIKE ? OR u.full_name LIKE ?)`;
			const t = `%${searchQuery}%`;
			params.push(t, t, t);
		}
		if (filterStatus) {
			whereClause += ` AND aa.status = ?`;
			params.push(filterStatus);
		}

		const [countResult] = await pool.execute<any[]>(
			`SELECT COUNT(aa.id) as total
			 FROM advance_applications aa
			 LEFT JOIN users u ON aa.created_by = u.id
			 ${whereClause}`,
			params
		);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		const [rows] = await pool.execute<AdvanceApplication[]>(
			`SELECT
				aa.id, aa.document_number, aa.document_date, aa.application_title,
				aa.bank_id, b.bank_name AS bank_name,
				aa.reason, aa.amount, aa.remark, aa.status,
				aa.created_by, u.full_name AS creator_name, aa.created_at,
				COALESCE((SELECT SUM(at2.amount) FROM advance_transactions at2 WHERE at2.advance_application_id = aa.id AND at2.type = 'expense'), 0) AS total_spent,
				aa.amount - COALESCE((SELECT SUM(at2.amount) FROM advance_transactions at2 WHERE at2.advance_application_id = aa.id AND at2.type = 'expense'), 0) + COALESCE((SELECT SUM(at2.amount) FROM advance_transactions at2 WHERE at2.advance_application_id = aa.id AND at2.type = 'refund'), 0) AS balance
			 FROM advance_applications aa
			 LEFT JOIN users u ON aa.created_by = u.id
			 LEFT JOIN banks b ON aa.bank_id = b.id
			 ${whereClause}
			 ORDER BY aa.document_date DESC, aa.id DESC
			 LIMIT ${pageSize} OFFSET ${offset}`,
			params
		);

		// Fetch banks for dropdown
		let banks: Bank[] = [];
		try {
			const [bankRows] = await pool.execute<Bank[]>('SELECT id, bank_name AS name FROM banks WHERE is_active = 1 ORDER BY bank_name ASC');
			banks = bankRows;
		} catch {
			banks = [];
		}

		return {
			applications: JSON.parse(JSON.stringify(rows)),
			currentPage: page,
			totalPages,
			total,
			searchQuery,
			filterStatus,
			banks,
			currentUser: locals.user
		};
	} catch (err: any) {
		console.error('Failed to load advance expense page:', err.message);
		if (err.status) throw err;
		throw error(500, `Failed to load data: ${err.message}`);
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		checkPermission(locals, 'create advance expense');
		const userId = locals.user?.id;
		if (!userId) throw error(401, 'Unauthorized');

		const data = await request.formData();
		const document_date = data.get('document_date')?.toString();
		const application_title = data.get('application_title')?.toString()?.trim();
		const bank_id = data.get('bank_id')?.toString();
		const reason = data.get('reason')?.toString()?.trim();
		const amount = parseFloat(data.get('amount')?.toString() || '0');
		const remark = data.get('remark')?.toString()?.trim() || null;

		if (!document_date || !application_title || !bank_id || !reason || isNaN(amount) || amount <= 0) {
			return fail(400, { action: 'create', success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const document_number = await allocateMonthlyDocumentNumber(
				connection,
				'advance_expense',
				document_date,
				() => 'ADV-'
			);

			await connection.execute(
				`INSERT INTO advance_applications (document_number, document_date, application_title, bank_id, reason, amount, remark, status, created_by)
				 VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
				[document_number, document_date, application_title, parseInt(bank_id), reason, amount, remark, userId]
			);

			await connection.commit();
			return { action: 'create', success: true, message: `สร้างเอกสาร ${document_number} สำเร็จ` };
		} catch (err: any) {
			await connection.rollback();
			console.error('Create advance error:', err.message);
			return fail(500, { action: 'create', success: false, message: err.message });
		} finally {
			connection.release();
		}
	},

	updateStatus: async ({ request, locals }) => {
		checkPermission(locals, 'approve advance expense');
		const data = await request.formData();
		const id = parseInt(data.get('id')?.toString() || '0');
		const status = data.get('status')?.toString();

		if (!id || !['Pending', 'Approved', 'Rejected', 'Completed'].includes(status || '')) {
			return fail(400, { action: 'updateStatus', success: false, message: 'ข้อมูลไม่ถูกต้อง' });
		}

		try {
			await pool.execute('UPDATE advance_applications SET status = ? WHERE id = ?', [status, id]);
			return { action: 'updateStatus', success: true, message: 'อัปเดตสถานะสำเร็จ' };
		} catch (err: any) {
			return fail(500, { action: 'updateStatus', success: false, message: err.message });
		}
	},

	delete: async ({ request, locals }) => {
		checkPermission(locals, 'delete advance expense');
		const data = await request.formData();
		const id = parseInt(data.get('id')?.toString() || '0');
		if (!id) return fail(400, { action: 'delete', success: false, message: 'Invalid ID' });

		try {
			await pool.execute('DELETE FROM advance_applications WHERE id = ?', [id]);
			return { action: 'delete', success: true, message: 'ลบเอกสารสำเร็จ' };
		} catch (err: any) {
			return fail(500, { action: 'delete', success: false, message: err.message });
		}
	}
};
