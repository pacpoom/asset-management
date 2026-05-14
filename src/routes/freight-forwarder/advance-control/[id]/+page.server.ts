import { error, fail, redirect } from '@sveltejs/kit';
import pool from '$lib/server/database';

export const load = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		// ดึงข้อมูล Advance พร้อม Join ชื่อธนาคารและผู้สร้าง
		const sql = `
			SELECT a.*, 
			       b.bank_code, b.bank_name, b.account_number, b.account_name, b.branch,
			       u.full_name as created_by_name
			FROM advance_applications a
			LEFT JOIN banks b ON a.bank_id = b.id
			LEFT JOIN users u ON a.created_by = u.id
			WHERE a.id = ?
		`;
		const [advances] = await pool.query(sql, [id]);
		const advance = (advances as Record<string, unknown>[])[0];

		if (!advance) throw redirect(302, '/freight-forwarder/advance-control');

		// ดึงไฟล์แนบ
		const [attachmentRows] = await pool.query(
			'SELECT * FROM advance_attachments WHERE advance_id = ? ORDER BY created_at DESC',
			[id]
		);
		const attachments = (attachmentRows as Record<string, unknown>[]).map((f) => ({
			...f,
			url: `/uploads/advances/${f.file_system_name}`
		}));

		return {
			advance: JSON.parse(JSON.stringify(advance)),
			attachments: JSON.parse(JSON.stringify(attachments))
		};
	} catch (err) {
		console.error('Error loading advance:', err);
		throw error(500, 'Server error loading advance application');
	}
};

export const actions = {
	updateStatus: async ({ request, params }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();
		const status = formData.get('status')?.toString();

		if (!id || !status) return fail(400, { message: 'Invalid data' });

		try {
			await pool.execute('UPDATE advance_applications SET status = ?, updated_at = NOW() WHERE id = ?', [
				status, id
			]);
			return { success: true };
		} catch (err: unknown) {
			console.error('Update status error:', err);
			return fail(500, { message: err instanceof Error ? err.message : 'Unknown error' });
		}
	}
};