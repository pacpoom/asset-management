import { redirect } from '@sveltejs/kit';
import pool from '$lib/server/database';

export const load = async ({ params }) => {
	const sql = `
        SELECT 
            j.*, 
            c.name as customer_name, 
            c.company_name, 
            c.address as customer_address,
            c.phone as customer_phone,
            c.tax_id as customer_tax_id,
            con.contract_number
        FROM job_orders j
        LEFT JOIN customers c ON j.customer_id = c.id
        LEFT JOIN contracts con ON j.contract_id = con.id
        WHERE j.id = ?
    `;

	const [rows] = await pool.query(sql, [params.id]);
	const job = (rows as any[])[0];

	if (!job) {
		throw redirect(302, '/freight-forwarder/job-orders');
	}

	return { job: JSON.parse(JSON.stringify(job)) };
};
