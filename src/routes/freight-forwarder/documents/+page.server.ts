import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';

interface Department {
	id: string;
	name: string;
}

interface FreightDocument extends RowDataPacket {
	id: number;
	department: string;
	title: string;
	filename: string;
	original_name: string;
	file_path: string;
	description: string | null;
	uploaded_by: number;
	uploader_name: string;
	created_at: string;
}

const FREIGHT_DEPARTMENTS: Department[] = [
	{ id: 'Import', name: 'Import' },
	{ id: 'Export', name: 'Export' },
	{ id: 'Cross-Trade', name: 'Cross-Trade' },
	{ id: 'General', name: 'General' }
];

const UPLOADS_DIR = path.join(process.cwd(), 'static', 'uploads', 'freight-docs');
const BASE_URL_PATH = '/uploads/freight-docs';

async function saveFile(
	file: File,
	folderName: string
): Promise<{ filePath: string; filename: string } | null> {
	if (!file || file.size === 0) return null;

	const folderPath = path.join(UPLOADS_DIR, folderName);
	let uploadPath = '';

	try {
		await fs.mkdir(folderPath, { recursive: true });

		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
		const filename = `${uniqueSuffix}-${sanitizedName}`;

		uploadPath = path.join(folderPath, filename);
		await fs.writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));

		const relativePath = `${BASE_URL_PATH}/${folderName}/${filename}`.replace(/\\/g, '/');

		return { filePath: relativePath, filename: filename };
	} catch (err: any) {
		console.error(`Save file error: ${err.message}`);
		if (uploadPath) {
			try {
				await fs.unlink(uploadPath);
			} catch {}
		}
		throw new Error(`Failed to save file: ${err.message}`);
	}
}

async function deleteFileFromDisk(webPath: string) {
	if (!webPath) return;
	try {
		const relativePart = webPath.replace(BASE_URL_PATH, '');
		const fullPath = path.join(UPLOADS_DIR, relativePart);

		await fs.unlink(fullPath);
	} catch (error: any) {
		if (error.code !== 'ENOENT') {
			console.error(`Delete file error: ${error.message}`);
		}
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const [docRows] = await pool.execute<FreightDocument[]>(`
			SELECT 
				d.*,
				COALESCE(u.username, 'Unknown User') as uploader_name
			FROM freight_documents d
			LEFT JOIN users u ON d.uploaded_by = u.id
			ORDER BY d.created_at DESC
		`);

		const groupedDocuments: { [key: string]: FreightDocument[] } = {};

		FREIGHT_DEPARTMENTS.forEach((dept) => {
			groupedDocuments[dept.id] = [];
		});

		docRows.forEach((doc) => {
			const key = doc.department || 'General';
			if (!groupedDocuments[key]) {
				groupedDocuments[key] = [];
			}
			groupedDocuments[key].push(doc);
		});

		return {
			departments: FREIGHT_DEPARTMENTS,
			groupedDocuments
		};
	} catch (err: any) {
		console.error('Load Error:', err);
		throw error(500, `Failed to load data: ${err.message}`);
	}
};

export const actions: Actions = {
	uploadDocument: async ({ request, locals }) => {
		const formData = await request.formData();
		const department = formData.get('department_id')?.toString();
		const title = formData.get('description')?.toString()?.trim();
		const files = formData.getAll('document') as File[];

		if (!department) return fail(400, { success: false, message: 'กรุณาเลือกแผนก' });

		const validFiles = files.filter((f) => f.size > 0);
		if (validFiles.length === 0)
			return fail(400, { success: false, message: 'กรุณาเลือกไฟล์อย่างน้อย 1 ไฟล์' });

		const connection = await pool.getConnection();

		try {
			await connection.beginTransaction();

			const uploadedDocs: FreightDocument[] = [];
			const userId = locals.user?.id || null;

			for (const file of validFiles) {
				const fileInfo = await saveFile(file, department);
				if (!fileInfo) throw new Error('File save failed');

				const docTitle = title || file.name;

				const [res] = await connection.execute(
					`INSERT INTO freight_documents 
					(department, title, filename, original_name, file_path, file_size, description, uploaded_by, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
					[
						department,
						docTitle,
						fileInfo.filename,
						file.name,
						fileInfo.filePath,
						file.size,
						title,
						userId
					]
				);

				const insertId = (res as any).insertId;

				const [newRows] = await connection.execute<FreightDocument[]>(
					`
					SELECT d.*, COALESCE(u.username, 'Unknown User') as uploader_name
					FROM freight_documents d
					LEFT JOIN users u ON d.uploaded_by = u.id
					WHERE d.id = ?
				`,
					[insertId]
				);

				if (newRows.length > 0) uploadedDocs.push(newRows[0]);
			}

			await connection.commit();
			return {
				action: 'uploadDocument',
				success: true,
				message: `อัปโหลด ${validFiles.length} ไฟล์เรียบร้อยแล้ว`,
				newDocuments: uploadedDocs
			};
		} catch (err: any) {
			await connection.rollback();
			console.error(err);
			return fail(500, { success: false, message: err.message || 'Upload failed' });
		} finally {
			connection.release();
		}
	},

	deleteDocument: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('document_id')?.toString();

		if (!id) return fail(400, { success: false, message: 'Invalid ID' });

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const [rows] = await connection.execute<FreightDocument[]>(
				'SELECT file_path FROM freight_documents WHERE id = ? FOR UPDATE',
				[id]
			);

			if (rows.length === 0) {
				await connection.rollback();
				return fail(404, { success: false, message: 'Document not found' });
			}

			await connection.execute('DELETE FROM freight_documents WHERE id = ?', [id]);

			await connection.commit();

			await deleteFileFromDisk(rows[0].file_path);

			return {
				action: 'deleteDocument',
				success: true,
				deletedDocumentId: parseInt(id)
			};
		} catch (err: any) {
			await connection.rollback();
			return fail(500, { success: false, message: err.message });
		} finally {
			connection.release();
		}
	},

	renameDocument: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('document_id');
		const newName = formData.get('new_name')?.toString();
		const newDesc = formData.get('new_description')?.toString();

		if (!id || !newName) return fail(400, { success: false, message: 'Missing Data' });

		try {
			await pool.execute('UPDATE freight_documents SET title = ?, description = ? WHERE id = ?', [
				newName,
				newDesc,
				id
			]);

			const [rows] = await pool.execute<FreightDocument[]>(
				`
				SELECT d.*, COALESCE(u.username, 'Unknown User') as uploader_name
				FROM freight_documents d
				LEFT JOIN users u ON d.uploaded_by = u.id
				WHERE d.id = ?
			`,
				[id]
			);

			return {
				action: 'renameDocument',
				success: true,
				updatedDocument: rows[0]
			};
		} catch (err: any) {
			return fail(500, { success: false, message: err.message });
		}
	}
};
