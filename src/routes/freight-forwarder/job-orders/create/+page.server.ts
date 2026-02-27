import { fail, redirect } from '@sveltejs/kit';
import pool from '$lib/server/database';

async function generateJobNumber(jobType: string, dateStr: string, connection: any) {
	const date = new Date(dateStr);
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const yy = String(year).slice(-2);
	const mm = String(month).padStart(2, '0');

	const updateQuery = `
        INSERT INTO document_sequences (document_type, prefix, year, month, last_number, padding_length)
        VALUES ('JOB', 'JOB-', ?, ?, 1, 4)
        ON DUPLICATE KEY UPDATE last_number = last_number + 1;
    `;
	await connection.execute(updateQuery, [year, month]);

	const selectQuery = `
        SELECT last_number, padding_length 
        FROM document_sequences 
        WHERE document_type = 'JOB' AND year = ? AND month = ?
    `;
	const [rows] = await connection.execute(selectQuery, [year, month]);

	const lastNumber = rows[0].last_number;
	const padding = rows[0].padding_length;

	const runningNumber = String(lastNumber).padStart(padding, '0');
	return `${jobType}${yy}${mm}${runningNumber}`;
}

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

	const date = new Date();
	const [seqRows] = await pool.query(
		`SELECT last_number, padding_length FROM document_sequences WHERE document_type = 'JOB' AND year = ? AND month = ?`,
		[date.getFullYear(), date.getMonth() + 1]
	);
	const nextSequence =
		seqRows && (seqRows as any).length > 0 ? (seqRows as any)[0].last_number + 1 : 1;
	const paddingLength =
		seqRows && (seqRows as any).length > 0 ? (seqRows as any)[0].padding_length : 4;

	return {
		customers: JSON.parse(JSON.stringify(customers)),
		contracts: JSON.parse(JSON.stringify(contracts)),
		liners: JSON.parse(JSON.stringify(liners)),
		nextSequence,
		paddingLength
	};
};

export const actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();

		const job_type = formData.get('job_type')?.toString() || 'SI';
		const job_date = formData.get('job_date')?.toString() || new Date().toISOString().split('T')[0];

		const data = {
			customer_id: formData.get('customer_id'),
			contract_id: formData.get('contract_id') || null,
			job_type: job_type,
			service_type: formData.get('service_type'),
			location: formData.get('location'),
			bl_number: formData.get('bl_number'),
			invoice_no: formData.get('invoice_no'),
			liner_name: formData.get('liner_name'),
			job_status: 'Pending',
			job_date: job_date,
			expire_date: formData.get('expire_date') || null,
			remarks: formData.get('remarks'),
			amount: formData.get('amount') || 0,
			currency: formData.get('currency') || 'THB',
			created_by: locals.user?.id || 1
		};

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const job_number = await generateJobNumber(job_type, job_date, connection);

			const sql = `
                INSERT INTO job_orders (
                    customer_id, contract_id, job_type, service_type, location, bl_number, invoice_no, 
                    liner_name, job_status, job_date, expire_date, remarks, 
                    amount, currency, job_number, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `;

			const insertValues = [
				data.customer_id,
				data.contract_id,
				data.job_type,
				data.service_type,
				data.location,
				data.bl_number,
				data.invoice_no,
				data.liner_name,
				data.job_status,
				data.job_date,
				data.expire_date,
				data.remarks,
				data.amount,
				data.currency,
				job_number,
				data.created_by
			];

			await connection.execute(sql, insertValues);
			await connection.commit();
			return { success: true };
		} catch (err: any) {
			await connection.rollback();
			console.error(err);
			return fail(500, { message: 'บันทึกข้อมูลไม่สำเร็จ' });
		} finally {
			connection.release();
		}
	}
};
