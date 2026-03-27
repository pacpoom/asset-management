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

export const load = async ({ params }) => {
	const id = params.id;
	const [jobs] = await pool.query('SELECT * FROM job_orders WHERE id = ?', [id]);
	const job = (jobs as Record<string, unknown>[])[0];

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

	const [units] = await pool.query(
		'SELECT id, name, symbol FROM units ORDER BY name ASC'
	);

	const [ports] = await pool.query(
		'SELECT id, port_name FROM ports WHERE is_active = 1 ORDER BY port_name ASC'
	);

	const [attachmentRows] = await pool.query(
		'SELECT * FROM job_order_attachments WHERE job_order_id = ? ORDER BY created_at DESC',
		[id]
	);
	const attachments = (attachmentRows as Record<string, unknown>[]).map((f) => ({
		...f,
		url: `/uploads/job_orders/${f.file_system_name}`
	}));

	return {
		job: JSON.parse(JSON.stringify(job)),
		customers: JSON.parse(JSON.stringify(customers)),
		contracts: JSON.parse(JSON.stringify(contracts)),
		liners: JSON.parse(JSON.stringify(liners)),
		currencies: JSON.parse(JSON.stringify(currencies)),
		salesDocs: JSON.parse(JSON.stringify(salesDocs)),
		vendors: JSON.parse(JSON.stringify(vendors)),
		vendorContracts: JSON.parse(JSON.stringify(vendorContracts)),
		units: JSON.parse(JSON.stringify(units)),
		ports: JSON.parse(JSON.stringify(ports)),
		existingAttachments: JSON.parse(JSON.stringify(attachments))
	};
};

export const actions = {
	update: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const id = params.id;

		const job_type = formData.get('job_type') as string;
		const job_date = formData.get('job_date') as string;

		try {
			const [existing] = await pool.query('SELECT job_number FROM job_orders WHERE id = ?', [id]);
			const oldJobNumber = (existing as { job_number?: string }[])[0]?.job_number || '';

			const runningNum =
				oldJobNumber.length >= 4 ? oldJobNumber.slice(-4) : String(id).padStart(4, '0');

			const d = new Date(job_date);
			const yy = String(d.getFullYear()).slice(-2);
			const mm = String(d.getMonth() + 1).padStart(2, '0');
			const new_job_number = `${job_type}${yy}${mm}${runningNum}`;

			const data = [
				formData.get('customer_id') || null,
				formData.get('contract_id') || null,
				formData.get('vendor_id') || null,
				formData.get('vendor_contract_id') || null,
				job_type,
				formData.get('service_type'),
				formData.get('location'),
				formData.get('bl_number'),
				formData.get('mbl'),
				formData.get('invoice_no'),
				formData.get('ccl'),
				formData.get('liner_name'),
				formData.get('job_status'),
				job_date,
				formData.get('etd') || null,
				formData.get('eta') || null,
				formData.get('expire_date') || null,
				formData.get('quantity') || 0,
				formData.get('unit_id') || null,
				formData.get('weight') || 0,
				formData.get('kgs_volume') || 0,
				formData.get('remarks'),
				formData.get('amount') || 0,
				formData.get('currency'),
				formData.get('booking_no') || null,
				formData.get('vessel') || null,
				formData.get('feeder') || null,
				formData.get('port_of_loading') || null,
				formData.get('port_of_discharge') || null,
				new_job_number,
				id
			];

			const sql = `
                UPDATE job_orders SET
                    customer_id = ?, contract_id = ?, vendor_id = ?, vendor_contract_id = ?, 
                    job_type = ?, service_type = ?, location = ?, bl_number = ?, mbl = ?, invoice_no = ?, ccl = ?,
                    liner_name = ?, job_status = ?, job_date = ?, etd = ?, eta = ?, expire_date = ?, 
                    quantity = ?, unit_id = ?, weight = ?, kgs_volume = ?, remarks = ?, 
                    amount = ?, currency = ?, 
					booking_no = ?, vessel = ?, feeder = ?, port_of_loading = ?, port_of_discharge = ?,
					job_number = ?, updated_at = NOW()
                WHERE id = ?
            `;
			await pool.execute(sql, data);

			const files = formData.getAll('attachments') as File[];
			for (const file of files) {
				const savedFile = await saveFile(file);
				if (savedFile) {
					await pool.execute(
						`INSERT INTO job_order_attachments 
                        (job_order_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id)
                        VALUES (?, ?, ?, ?, ?, ?)`,
						[
							id,
							savedFile.originalName,
							savedFile.systemName,
							savedFile.mimeType,
							savedFile.size,
							locals.user?.id || null
						]
					);
				}
			}

			return { success: true };
		} catch (err) {
			console.error(err);
			return fail(500, { message: 'อัปเดตไม่สำเร็จ' });
		}
	},

	deleteAttachment: async ({ request }) => {
		const formData = await request.formData();
		const attachmentId = formData.get('attachment_id');

		try {
			const [rows] = await pool.query(
				'SELECT file_system_name FROM job_order_attachments WHERE id = ?',
				[attachmentId]
			);
			
			const fileRows = rows as { file_system_name: string }[];

			if (fileRows.length > 0) {
				const filename = fileRows[0].file_system_name;
				const filePath = path.join(UPLOAD_DIR, filename);

				try {
					await fs.unlink(filePath);
				} catch {
					console.warn(`ลบไฟล์ในโฟลเดอร์ไม่สำเร็จ (อาจไม่มีไฟล์อยู่แล้ว): ${filePath}`);
				}
			}

			await pool.execute('DELETE FROM job_order_attachments WHERE id = ?', [attachmentId]);

			return { success: true };
		} catch (err) {
			console.error(err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
		}
	},

	managePort: async ({ request }) => {
		const formData = await request.formData();
		const action_type = formData.get('action_type')?.toString();
		const id = formData.get('id')?.toString();
		const port_name = formData.get('port_name')?.toString();

		try {
			if (action_type === 'add' && port_name) {
				await pool.execute('INSERT INTO ports (port_name) VALUES (?)', [port_name]);
			} else if (action_type === 'edit' && id && port_name) {
				await pool.execute('UPDATE ports SET port_name = ? WHERE id = ?', [port_name, id]);
			} else if (action_type === 'delete' && id) {
				await pool.execute('DELETE FROM ports WHERE id = ?', [id]);
			}
			return { success: true };
		} catch (err) {
			console.error('Manage Port Error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการจัดการ Port' });
		}
	}
};