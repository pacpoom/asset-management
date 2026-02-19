import { fail, redirect } from '@sveltejs/kit';
import pool from '$lib/server/database';

export const load = async ({ params }) => {
	const [jobs] = await pool.query('SELECT * FROM job_orders WHERE id = ?', [params.id]);
	const job = (jobs as any[])[0];

	if (!job) throw redirect(302, '/freight-forwarder/job-orders');

	const [customers] = await pool.query(
		'SELECT id, name, company_name, address FROM customers ORDER BY name ASC'
	);
	const [contracts] = await pool.query(
		'SELECT id, contract_number, title, customer_id FROM contracts WHERE status = "Active"'
	);

	const [liners] = await pool.query(
		'SELECT id, code, name FROM liners WHERE status = "Active" ORDER BY name ASC'
	);

	return {
		job: JSON.parse(JSON.stringify(job)),
		customers: JSON.parse(JSON.stringify(customers)),
		contracts: JSON.parse(JSON.stringify(contracts)),
		liners: JSON.parse(JSON.stringify(liners))
	};
};

export const actions = {
	update: async ({ request, params }) => {
		const formData = await request.formData();

		const data = [
			formData.get('customer_id'),
			formData.get('contract_id') || null,
			formData.get('job_type'),
			formData.get('service_type'),
			formData.get('location'),
			formData.get('bl_number'),
			formData.get('invoice_no'),
			formData.get('liner_name'),
			formData.get('job_status'),
			formData.get('job_date'),
			formData.get('expire_date') || null,
			formData.get('remarks'),
			formData.get('amount') || 0,
			formData.get('currency'),
			params.id
		];

		try {
			const sql = `
                UPDATE job_orders SET
                    customer_id = ?, contract_id = ?, job_type = ?, service_type = ?, location = ?, bl_number = ?, invoice_no = ?, 
                    liner_name = ?, job_status = ?, job_date = ?, expire_date = ?, remarks = ?, 
                    amount = ?, currency = ?, updated_at = NOW()
                WHERE id = ?
            `;
			await pool.execute(sql, data);
			return { success: true };
		} catch (err) {
			console.error(err);
			return fail(500, { message: 'อัปเดตไม่สำเร็จ' });
		}
	}
};
