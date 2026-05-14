import { fail, redirect } from '@sveltejs/kit';
import pool from '$lib/server/database';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

const UPLOAD_DIR = path.resolve('uploads', 'advances');

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
	
    // 1. ดึงข้อมูล Advance
	const [advances] = await pool.query('SELECT * FROM advance_applications WHERE id = ?', [id]);
	const advance = (advances as Record<string, unknown>[])[0];

	if (!advance) throw redirect(302, '/freight-forwarder/advance-control');

    // 2. ดึงข้อมูลธนาคาร
	const [banks] = await pool.query(
		'SELECT id, bank_code, bank_name, account_number, account_name, branch FROM banks WHERE is_active = 1 ORDER BY bank_name ASC'
	);

    // 3. ดึงไฟล์แนบเดิม
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
		banks: JSON.parse(JSON.stringify(banks)),
		existingAttachments: JSON.parse(JSON.stringify(attachments))
	};
};

export const actions = {
	update: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const id = params.id;

		const data = {
			document_date: formData.get('document_date')?.toString() || new Date().toISOString().split('T')[0],
			application_title: formData.get('application_title')?.toString() || '',
			bank_id: formData.get('bank_id') || null,
			reason: formData.get('reason')?.toString() || '',
			amount: parseFloat(formData.get('amount')?.toString() || '0'),
			remark: formData.get('remark')?.toString() || '',
			status: formData.get('status')?.toString() || 'Pending'
		};

		if (!data.application_title || !data.bank_id || data.amount <= 0) {
			return fail(400, { message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วนและจำนวนเงินต้องมากกว่า 0' });
		}

		try {
			const sql = `
                UPDATE advance_applications SET
                    document_date = ?, application_title = ?, bank_id = ?, 
                    reason = ?, amount = ?, remark = ?, status = ?, updated_at = NOW()
                WHERE id = ?
            `;
			await pool.execute(sql, [
                data.document_date, data.application_title, data.bank_id, 
                data.reason, data.amount, data.remark, data.status, id
            ]);

			// แนบไฟล์ใหม่
			const files = formData.getAll('attachments') as File[];
			for (const file of files) {
				const savedFile = await saveFile(file);
				if (savedFile) {
					await pool.execute(
						`INSERT INTO advance_attachments 
                        (advance_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id)
                        VALUES (?, ?, ?, ?, ?, ?)`,
						[
							id, savedFile.originalName, savedFile.systemName,
							savedFile.mimeType, savedFile.size, locals.user?.id || null
						]
					);
				}
			}

			return { success: true };
		} catch (err) {
			console.error('Update advance error:', err);
			return fail(500, { message: 'อัปเดตข้อมูลไม่สำเร็จ' });
		}
	},

	deleteAttachment: async ({ request }) => {
		const formData = await request.formData();
		const attachmentId = formData.get('attachment_id');

		try {
			const [rows] = await pool.query(
				'SELECT file_system_name FROM advance_attachments WHERE id = ?',
				[attachmentId]
			);
			const fileRows = rows as { file_system_name: string }[];

			if (fileRows.length > 0) {
				const filename = fileRows[0].file_system_name;
				const filePath = path.join(UPLOAD_DIR, filename);
				try { await fs.unlink(filePath); } catch { /* Ignore */ }
			}

			await pool.execute('DELETE FROM advance_attachments WHERE id = ?', [attachmentId]);
			return { success: true };
		} catch (err) {
			console.error(err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการลบไฟล์' });
		}
	},

	manageBank: async ({ request }) => {
		const formData = await request.formData();
		const action_type = formData.get('action_type')?.toString();
		const id = formData.get('id')?.toString();
		
		const bank_code = formData.get('bank_code')?.toString()?.trim() || '';
		const bank_name = formData.get('bank_name')?.toString()?.trim() || '';
		const account_number = formData.get('account_number')?.toString()?.trim() || '';
		const account_name = formData.get('account_name')?.toString()?.trim() || '';
		const branch = formData.get('branch')?.toString()?.trim() || '';

		try {
			if (action_type === 'add' && bank_name && account_number && account_name) {
				await pool.execute(
					'INSERT INTO banks (bank_code, bank_name, account_number, account_name, branch, is_active) VALUES (?, ?, ?, ?, ?, 1)',
					[bank_code, bank_name, account_number, account_name, branch]
				);
			} else if (action_type === 'edit' && id && bank_name && account_number && account_name) {
				await pool.execute(
					'UPDATE banks SET bank_code = ?, bank_name = ?, account_number = ?, account_name = ?, branch = ? WHERE id = ?',
					[bank_code, bank_name, account_number, account_name, branch, id]
				);
			} else if (action_type === 'delete' && id) {
				try {
					await pool.execute('DELETE FROM banks WHERE id = ?', [id]);
				} catch (deleteErr: any) {
					if (deleteErr.code === 'ER_ROW_IS_REFERENCED_2') {
						await pool.execute('UPDATE banks SET is_active = 0 WHERE id = ?', [id]);
					} else { throw deleteErr; }
				}
			}
			return { success: true };
		} catch (err) {
			console.error('Manage Bank Error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการจัดการข้อมูลธนาคาร' });
		}
	}
};