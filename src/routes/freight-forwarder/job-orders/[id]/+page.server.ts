import { error, fail, redirect } from '@sveltejs/kit';
import pool from '$lib/server/database';

export const load = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		// 1. ดึงข้อมูล Job Order (ใช้ u.full_name ตามแบบ Invoices)
		const [jobs] = await pool.query<any[]>(
			`
			SELECT j.*, 
			       c.name as customer_name, 
			       c.company_name, 
			       c.address as customer_address, 
			       c.tax_id as customer_tax_id,
			       con.contract_number,
			       u.full_name as created_by_name
			FROM job_orders j
			LEFT JOIN customers c ON j.customer_id = c.id
			LEFT JOIN contracts con ON j.contract_id = con.id
			LEFT JOIN users u ON j.created_by = u.id
			WHERE j.id = ?
		`,
			[id]
		);

		if (jobs.length === 0) throw redirect(302, '/freight-forwarder/job-orders');
		const job = jobs[0];

		// 2. ดึงข้อมูลบริษัท (ใช้ตาราง company เหมือน Invoices)
		const [companyRows] = await pool.query<any[]>('SELECT * FROM company LIMIT 1');

		// 3. ดึงข้อมูลไฟล์แนบ (Attachments)
		const [attachments] = await pool.query<any[]>(
			'SELECT * FROM job_order_attachments WHERE job_order_id = ? ORDER BY created_at DESC',
			[id]
		);

		// 4. แปลงข้อมูลไฟล์แนบให้มี url ไว้สำหรับดาวน์โหลด (เปลี่ยนโฟลเดอร์เป็น job_orders)
		const attachmentsWithUrl = attachments.map((f: any) => ({
			...f,
			url: `/uploads/job_orders/${f.file_system_name}`
		}));

		return {
			job: JSON.parse(JSON.stringify(job)),
			company: companyRows.length > 0 ? JSON.parse(JSON.stringify(companyRows[0])) : null,
			attachments: JSON.parse(JSON.stringify(attachmentsWithUrl)),
			availableStatuses: ['Pending', 'In Progress', 'Completed', 'Cancelled']
		};
	} catch (err: any) {
		console.error('Error loading job order:', err);
		// ถ้าระบบโยน redirect มาแล้ว ให้โยนต่อไปเลย
		if (err.status === 302) throw err;
		throw error(500, err.message);
	}
};

export const actions = {
	updateStatus: async ({ request, params }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();
		const status = formData.get('status')?.toString();

		if (!id || !status) return fail(400, { message: 'Invalid data' });

		try {
			await pool.execute('UPDATE job_orders SET job_status = ?, updated_at = NOW() WHERE id = ?', [
				status,
				id
			]);
			return { success: true };
		} catch (err: any) {
			console.error('Update status error:', err);
			return fail(500, { message: err.message });
		}
	}
};
