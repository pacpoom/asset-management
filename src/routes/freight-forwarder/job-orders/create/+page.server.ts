import { fail, redirect } from '@sveltejs/kit';
import pool from '$lib/server/database';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

const UPLOAD_DIR = path.resolve('uploads', 'job_orders');

async function saveFile(file: File) {
	if (!file || file.size === 0) return null;
	try {
		await fs.mkdir(UPLOAD_DIR, { recursive: true });
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
		const systemName = `${uniqueSuffix}-${sanitizedOriginalName}`;
		const uploadPath = path.join(UPLOAD_DIR, systemName);
		await fs.writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));
		return {
			systemName,
			originalName: file.name,
			mimeType: mime.lookup(file.name) || file.type || 'application/octet-stream',
			size: file.size
		};
	} catch (e) {
		console.error('Save file error:', e);
		return null;
	}
}

async function generateJobNumber(jobType: string, dateStr: string, connection: any) {
	const date = new Date(dateStr);
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const yy = String(year).slice(-2);
	const mm = String(month).padStart(2, '0');

	const selectQuery = `SELECT last_number, padding_length FROM document_sequences WHERE document_type = 'JOB' LIMIT 1`;
	const [rows] = await connection.execute(selectQuery);

	let lastNumber = 0;
	let padding = 4;

	if ((rows as any[]).length > 0) {
		await connection.execute(
			`UPDATE document_sequences 
             SET last_number = last_number + 1, year = ?, month = ? 
             WHERE document_type = 'JOB'`,
			[year, month]
		);
		lastNumber = (rows as any[])[0].last_number + 1;
		padding = (rows as any[])[0].padding_length;
	} else {
		await connection.execute(
			`INSERT INTO document_sequences (document_type, prefix, year, month, last_number, padding_length) 
             VALUES ('JOB', '[SI,SE,AI,AF,SP]', ?, ?, 1, 4)`,
			[year, month]
		);
		lastNumber = 1;
	}

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

	const [currencies] = await pool.query(
		'SELECT code, name, symbol FROM currencies WHERE is_active = 1 ORDER BY code ASC'
	);
	const [salesDocs] = await pool.query(
		'SELECT document_number, total_amount FROM sales_documents WHERE status != "Cancelled" ORDER BY id DESC'
	);

	const [vendors] = await pool.query(
		'SELECT id, name, company_name, address FROM vendors ORDER BY name ASC'
	);
	const [vendorContracts] = await pool.query(
		'SELECT id, contract_number, title, vendor_id, contract_value FROM vendor_contracts WHERE status = "Active"'
	);

	const date = new Date();
	const [seqRows] = await pool.query(
		`SELECT last_number, padding_length FROM document_sequences WHERE document_type = 'JOB' LIMIT 1`
	);
	const nextSequence =
		seqRows && (seqRows as any).length > 0 ? (seqRows as any)[0].last_number + 1 : 1;
	const paddingLength =
		seqRows && (seqRows as any).length > 0 ? (seqRows as any)[0].padding_length : 4;

	return {
		customers: JSON.parse(JSON.stringify(customers)),
		contracts: JSON.parse(JSON.stringify(contracts)),
		liners: JSON.parse(JSON.stringify(liners)),
		currencies: JSON.parse(JSON.stringify(currencies)),
		salesDocs: JSON.parse(JSON.stringify(salesDocs)),
		vendors: JSON.parse(JSON.stringify(vendors)),
		vendorContracts: JSON.parse(JSON.stringify(vendorContracts)),
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
			customer_id: formData.get('customer_id') || null,
			contract_id: formData.get('contract_id') || null,
			vendor_id: formData.get('vendor_id') || null,
			vendor_contract_id: formData.get('vendor_contract_id') || null,
			job_type: job_type,
			service_type: formData.get('service_type'),
			location: formData.get('location'),
			bl_number: formData.get('bl_number'),
			mbl: formData.get('mbl'),
			invoice_no: formData.get('invoice_no'),
			ccl: formData.get('ccl'),
			liner_name: formData.get('liner_name'),
			job_status: 'Pending',
			job_date: job_date,
			etd: formData.get('etd') || null,
			eta: formData.get('eta') || null,
			expire_date: formData.get('expire_date') || null,
			quantity: formData.get('quantity') || 0,
			weight: formData.get('weight') || 0,
			kgs_volume: formData.get('kgs_volume') || 0,
			remarks: formData.get('remarks'),
			amount: formData.get('amount') || 0,
			currency: formData.get('currency') || 'THB',
			created_by: locals.user?.id || 1
		};

		const connection = await pool.getConnection();
		let newJobId = null;

		try {
			await connection.beginTransaction();

			const job_number = await generateJobNumber(job_type, job_date, connection);

			const sql = `
                INSERT INTO job_orders (
                    customer_id, contract_id, vendor_id, vendor_contract_id, 
                    job_type, service_type, location, bl_number, mbl, invoice_no, ccl,
                    liner_name, job_status, job_date, etd, eta, expire_date, 
                    quantity, weight, kgs_volume, remarks, 
                    amount, currency, job_number, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `;

			const insertValues = [
				data.customer_id,
				data.contract_id,
				data.vendor_id,
				data.vendor_contract_id,
				data.job_type,
				data.service_type,
				data.location,
				data.bl_number,
				data.mbl,
				data.invoice_no,
				data.ccl,
				data.liner_name,
				data.job_status,
				data.job_date,
				data.etd,
				data.eta,
				data.expire_date,
				data.quantity,
				data.weight,
				data.kgs_volume,
				data.remarks,
				data.amount,
				data.currency,
				job_number,
				data.created_by
			];

			const [result] = await connection.execute(sql, insertValues);
			newJobId = (result as any).insertId;

			const files = formData.getAll('attachments') as File[];
			for (const file of files) {
				const savedFile = await saveFile(file);
				if (savedFile) {
					await connection.execute(
						`INSERT INTO job_order_attachments 
                        (job_order_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id)
                        VALUES (?, ?, ?, ?, ?, ?)`,
						[
							newJobId,
							savedFile.originalName,
							savedFile.systemName,
							savedFile.mimeType,
							savedFile.size,
							locals.user?.id || null
						]
					);
				}
			}

			await connection.commit();
		} catch (err: any) {
			await connection.rollback();
			console.error('Create Job Order Error:', err);
			return fail(500, { message: 'บันทึกข้อมูลไม่สำเร็จ' });
		} finally {
			connection.release();
		}

		if (newJobId) {
			throw redirect(303, `/freight-forwarder/job-orders/${newJobId}`);
		}
	}
};