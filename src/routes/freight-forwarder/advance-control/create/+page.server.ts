import { fail, redirect } from '@sveltejs/kit';
import pool from '$lib/server/database';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';
import { allocateMonthlySequence } from '$lib/server/monthlyDocumentSequence';

const UPLOAD_DIR = path.resolve('uploads', 'advances');

// ฟังก์ชันสำหรับบันทึกไฟล์แนบ
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

interface DbConnection {
	execute(sql: string, values?: unknown[]): Promise<[unknown[], unknown]>;
}

// ฟังก์ชันสร้างเลขเอกสาร ADV-YYMMXXXX
async function generateDocumentNumber(dateStr: string, connection: DbConnection) {
	const meta = await allocateMonthlySequence(connection, 'ADV', dateStr, () => 'ADV-');
	const yy = String(meta.year).slice(-2);
	const runningNumber = String(meta.seq).padStart(meta.padding, '0');
	return `${meta.prefix}${yy}${meta.monthStr}${runningNumber}`;
}

export const load = async () => {
	// ดึงข้อมูล Bank Master ที่สถานะเป็น Active
	const [banks] = await pool.query(
		'SELECT id, bank_code, bank_name, account_number, account_name, branch FROM banks WHERE is_active = 1 ORDER BY bank_name ASC'
	);

	// ดึงข้อมูลเลขรันนิ่งล่าสุดเพื่อใช้ Preview หน้า UI
	const today = new Date();
	const previewYear = today.getFullYear();
	const previewMonth = today.getMonth() + 1;
	const [seqRows] = await pool.query(
		`SELECT last_number, padding_length FROM document_sequences WHERE document_type = 'ADV' AND year = ? AND month = ?`,
		[previewYear, previewMonth]
	);
	
	const typedSeqRows = seqRows as { last_number: number; padding_length: number }[];
	const nextSequence = typedSeqRows && typedSeqRows.length > 0 ? typedSeqRows[0].last_number + 1 : 1;
	const paddingLength = typedSeqRows && typedSeqRows.length > 0 ? typedSeqRows[0].padding_length : 4;

	return {
		banks: JSON.parse(JSON.stringify(banks)),
		nextSequence,
		paddingLength
	};
};

export const actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();

		const document_date = formData.get('document_date')?.toString() || new Date().toISOString().split('T')[0];
		
		const data = {
			document_date: document_date,
			application_title: formData.get('application_title')?.toString() || '',
			bank_id: formData.get('bank_id') || null,
			reason: formData.get('reason')?.toString() || '',
			amount: parseFloat(formData.get('amount')?.toString() || '0'),
			remark: formData.get('remark')?.toString() || '',
			created_by: locals.user?.id || 1
		};

		// ตรวจสอบความถูกต้องเบื้องต้น
		if (!data.application_title || !data.bank_id || data.amount <= 0) {
			return fail(400, { message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วนและจำนวนเงินต้องมากกว่า 0' });
		}

		const connection = await pool.getConnection();
		let newAdvanceId = null;

		try {
			await connection.beginTransaction();

			// 1. สร้างเลขที่เอกสารใหม่
			const document_number = await generateDocumentNumber(document_date, connection);

			// 2. บันทึกข้อมูลลงตาราง advance_applications
			const sql = `
                INSERT INTO advance_applications (
                    document_number, document_date, application_title, bank_id, 
                    reason, amount, remark, status, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?, NOW(), NOW())
            `;

			const insertValues = [
				document_number,
				data.document_date,
				data.application_title,
				data.bank_id,
				data.reason,
				data.amount,
				data.remark,
				data.created_by
			];

			const [result] = await connection.execute(sql, insertValues);
			newAdvanceId = (result as { insertId: number }).insertId;

			// 3. บันทึกไฟล์แนบ (ถ้ามี)
			const files = formData.getAll('attachments') as File[];
			for (const file of files) {
				const savedFile = await saveFile(file);
				if (savedFile) {
					await connection.execute(
						`INSERT INTO advance_attachments
                        (advance_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id)
                        VALUES (?, ?, ?, ?, ?, ?)`,
						[
							newAdvanceId,
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
		} catch (err: unknown) {
			await connection.rollback();
			console.error('Create Advance Application Error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
		} finally {
			connection.release();
		}

		// บันทึกสำเร็จ Redirect ไปหน้ารายละเอียดเอกสาร
		if (newAdvanceId) {
			throw redirect(303, `/freight-forwarder/advance-control/${newAdvanceId}`);
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
				// อาจจะลบไม่ได้ถ้ามีการผูกกับ Advance Applications อยู่แล้ว จะติด Foreign Key Error 
				// ดังนั้นแนะนำให้ทำ Soft Delete ได้โดยเพิ่ม is_active=0 แทน หรือลองลบดูถ้ายังไม่มีการใช้งาน
				try {
					await pool.execute('DELETE FROM banks WHERE id = ?', [id]);
				} catch (deleteErr: any) {
					if (deleteErr.code === 'ER_ROW_IS_REFERENCED_2') {
						await pool.execute('UPDATE banks SET is_active = 0 WHERE id = ?', [id]);
					} else {
						throw deleteErr;
					}
				}
			}
			return { success: true };
		} catch (err) {
			console.error('Manage Bank Error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการจัดการข้อมูลธนาคาร' });
		}
	}
};