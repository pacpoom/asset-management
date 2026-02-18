import { fail } from '@sveltejs/kit';
import pool from '$lib/server/database';
import fs from 'fs';
import path from 'path';
import { checkPermission } from '$lib/server/auth';

export const load = async ({ locals }) => {
	const [docs] = await pool.query(`
		SELECT d.*, u.username as uploader_name 
		FROM freight_documents d
		LEFT JOIN users u ON d.uploaded_by = u.id
		ORDER BY d.created_at DESC
	`);

	return {
		documents: JSON.parse(JSON.stringify(docs))
	};
};

export const actions = {
	upload: async ({ request, locals }) => {
		const formData = await request.formData();
		const file = formData.get('file') as File;
		const title = formData.get('title') as string;
		const description = formData.get('description') as string;

		if (!file || file.size === 0) {
			return fail(400, { message: 'กรุณาเลือกไฟล์' });
		}
		if (!title) {
			return fail(400, { message: 'กรุณาระบุชื่อเอกสาร' });
		}

		try {
			const uploadDir = 'static/uploads/freight-docs';
			if (!fs.existsSync(uploadDir)) {
				fs.mkdirSync(uploadDir, { recursive: true });
			}

			const timestamp = Date.now();
			const safeFilename = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
			const newFilename = `${timestamp}_${safeFilename}`;
			const filePath = path.join(uploadDir, newFilename);

			const buffer = await file.arrayBuffer();
			fs.writeFileSync(filePath, Buffer.from(buffer));

			const webPath = `/uploads/freight-docs/${newFilename}`;
			const fileType = path.extname(file.name).replace('.', '');

			await pool.query(
				`
				INSERT INTO freight_documents 
				(title, filename, original_name, file_path, file_type, file_size, description, uploaded_by, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
			`,
				[
					title,
					newFilename,
					file.name,
					webPath,
					fileType,
					file.size,
					description,
					locals.user?.id || null
				]
			);

			return { success: true };
		} catch (error) {
			console.error('Upload Error:', error);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์' });
		}
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) return fail(400, { message: 'ไม่พบ ID เอกสาร' });

		try {
			const [rows]: any = await pool.query('SELECT file_path FROM freight_documents WHERE id = ?', [
				id
			]);
			if (rows.length > 0) {
				const webPath = rows[0].file_path;
				const sysPath = `static${webPath}`;

				if (fs.existsSync(sysPath)) {
					fs.unlinkSync(sysPath);
				}
			}

			await pool.query('DELETE FROM freight_documents WHERE id = ?', [id]);

			return { success: true };
		} catch (error) {
			console.error('Delete Error:', error);
			return fail(500, { message: 'ลบข้อมูลไม่สำเร็จ' });
		}
	}
};
