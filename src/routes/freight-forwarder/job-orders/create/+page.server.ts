import { fail, redirect } from '@sveltejs/kit';
import pool from '$lib/server/database';

export const load = async () => {
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
		customers: JSON.parse(JSON.stringify(customers)),
		contracts: JSON.parse(JSON.stringify(contracts)),
		liners: JSON.parse(JSON.stringify(liners))
	};
};

export const actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();

		const data = {
			customer_id: formData.get('customer_id'),
			contract_id: formData.get('contract_id') || null,
			job_type: formData.get('job_type'),
			service_type: formData.get('service_type'),
			location: formData.get('location'),
			bl_number: formData.get('bl_number'),
			liner_name: formData.get('liner_name'),
			invoice_no: formData.get('invoice_no'),
			job_status: 'Pending',
			job_date: formData.get('job_date'),
			expire_date: formData.get('expire_date') || null,
			remarks: formData.get('remarks'),
			amount: formData.get('amount') || 0,
			currency: formData.get('currency') || 'THB',
			created_by: locals.user?.id || 1
		};

		try {
			const sql = `
                INSERT INTO job_orders (
                    customer_id, contract_id, job_type, service_type, location, bl_number, invoice_no, 
                    liner_name, job_status, job_date, expire_date, remarks, 
                    amount, currency, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `;
			await pool.execute(sql, Object.values(data));
			return { success: true };
		} catch (err: any) {
			console.error(err);
			return fail(500, { message: 'บันทึกข้อมูลไม่สำเร็จ' });
		}
	}
};
