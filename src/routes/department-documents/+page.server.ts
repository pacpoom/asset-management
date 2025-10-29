

import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';

// --- Types ---
interface Department extends RowDataPacket {
	id: number;
	name: string;
}
interface DepartmentDocument extends RowDataPacket {
	id: number;
	department_id: number;
	department_name: string;
	file_name: string;
	file_path: string;
	description: string | null;
	uploaded_by_user_id: number;
	uploader_name: string;
	uploaded_at: string;
}

// --- File Handling Helpers ---
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'department_docs');
const BASE_URL_PATH = '/uploads/department_docs';

/**
 */
async function saveFile(
	file: File,
	departmentFolderName: string 
): Promise<{ filePath: string; originalName: string } | null> {
	if (!file || file.size === 0) return null;

	
	const departmentPath = path.join(UPLOADS_DIR, departmentFolderName);
	let uploadPath = ''; // Path เต็มของไฟล์ที่จะบันทึก

	try {
		
		await fs.mkdir(departmentPath, { recursive: true });

		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
		const filename = `${uniqueSuffix}-${sanitizedOriginalName}`;

		
		uploadPath = path.join(departmentPath, filename);

		
		await fs.writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));

		//  Path ที่เก็บใน DB ต้องมีชื่อโฟลเดอร์แผนกด้วย
		// (ใช้ .replace(/\\/g, '/') เพื่อให้ทำงานได้ทั้ง Windows/Linux)
		const relativePath = `${BASE_URL_PATH}/${departmentFolderName}/${filename}`.replace(/\\/g, '/');

		return { filePath: relativePath, originalName: file.name };
	} catch (uploadError: any) {
		console.error(`saveFile Error: ${uploadError.message}`, uploadError.stack);
		
		if (uploadPath) {
			try {
				await fs.unlink(uploadPath);
			} catch (cleanupError) {
				/* ignore */
			}
		}
		throw new Error(`Failed to save file "${file.name}". Reason: ${uploadError.message}`);
	}
}

/**
 *  
 * (Helper ที่ลบไฟล์ออกจาก Disk)
 */
async function deleteFile(filePath: string | null | undefined) {
	if (!filePath) return;
	try {
		
		const relativeSubPath = path.relative(BASE_URL_PATH, filePath);
		
		const fullPath = path.join(UPLOADS_DIR, relativeSubPath);
		
		await fs.unlink(fullPath);

	} catch (error: any) {

		if (error.code !== 'ENOENT') {
			console.error(`deleteFile Error: ${error.message}`, error.stack);
			throw new Error(`Failed to delete file "${path.basename(filePath)}". Reason: ${error.message}`);
		}
	}
}

// --- Load Function ---
export const load: PageServerLoad = async ({ locals }) => {
	checkPermission(locals, 'view department documents');
	try {
		const [departmentRows] = await pool.execute<Department[]>(
			'SELECT id, name FROM departments ORDER BY name ASC'
		);

		const [documentRows] = await pool.execute<DepartmentDocument[]>(`
            SELECT
                dd.id, dd.department_id,
                COALESCE(d.name, 'Unknown Department') as department_name,
                dd.file_name, dd.file_path, dd.description,
                dd.uploaded_by_user_id,
                COALESCE(u.full_name, 'Unknown User') as uploader_name,
                dd.uploaded_at
            FROM departments_documents dd
            LEFT JOIN departments d ON dd.department_id = d.id
            LEFT JOIN users u ON dd.uploaded_by_user_id = u.id
            ORDER BY d.name ASC, dd.uploaded_at DESC
        `);

		const documentsByDepartment: { [key: number]: DepartmentDocument[] } = {};
		documentRows.forEach((doc) => {
			// (แก้bug)
			const key = doc.department_id ?? 0; 
			if (!documentsByDepartment[key]) {
				documentsByDepartment[key] = [];
			}
			documentsByDepartment[key].push(doc);
		});
		return {
			departments: departmentRows,
			groupedDocuments: documentsByDepartment
		};
	} catch (err: any) {
		console.error('Failed to load department documents data:', err.message, err.stack);
		throw error(500, `Failed to load data. Error: ${err.message}`);
	}
};

// --- Actions ---
export const actions: Actions = {
	/**

	 */
	uploadDocument: async ({ request, locals }) => {
		checkPermission(locals, 'upload department documents');
		const connection = await pool.getConnection(); 
		let savedFilesData: { filePath: string; originalName: string }[] = []; 

		try {
			await connection.beginTransaction(); 

			const data = await request.formData();
			const department_id = data.get('department_id')?.toString();
			const descriptionInput = data.get('description')?.toString()?.trim() || null;
			const documentFiles = data.getAll('document') as File[];

			if (!department_id) {
				return fail(400, { action: 'uploadDocument', success: false, message: 'Department is required.' });
			}
			const validFiles = documentFiles.filter((f) => f && f.size > 0);
			if (validFiles.length === 0) {
				return fail(400, { action: 'uploadDocument', success: false, message: 'At least one document file is required.' });
			}
			if (!locals.user?.id) {
				throw error(401, 'Unauthorized');
			}

			const departmentId = BigInt(department_id);
			const uploaderUserId = BigInt(locals.user.id);

			
			const [deptResult] = await connection.execute<Department[]>(
				'SELECT name FROM departments WHERE id = ?',
				[departmentId]
			);
			if (deptResult.length === 0) {
				throw new Error('Department not found.');
			}
			
			const departmentFolderName = deptResult[0].name.replace(/[^a-zA-Z0-9._-]/g, '_');

			const uploadedDocuments: DepartmentDocument[] = [];

			
			for (const documentFile of validFiles) {
				
				
				const savedFileData = await saveFile(documentFile, departmentFolderName);
				if (!savedFileData) {
					throw new Error(`File saving failed for ${documentFile.name}.`);
				}
				savedFilesData.push(savedFileData); 

				
				const [result] = await connection.execute(
					`INSERT INTO departments_documents (department_id, file_name, file_path, description, uploaded_by_user_id, uploaded_at) VALUES (?, ?, ?, ?, ?, NOW())`,
					[departmentId, savedFileData.originalName, savedFileData.filePath, descriptionInput, uploaderUserId]
				);
				const insertId = (result as any).insertId;

				
				const [newDocResult] = await connection.execute<DepartmentDocument[]>(
					`
                    SELECT
                        dd.id, dd.department_id,
                        COALESCE(d.name, 'Unknown Dept') as department_name,
                        dd.file_name, dd.file_path, dd.description, dd.uploaded_by_user_id,
                        COALESCE(u.full_name, 'Unknown User') as uploader_name,
                        dd.uploaded_at
                    FROM departments_documents dd
                    LEFT JOIN departments d ON dd.department_id = d.id
                    LEFT JOIN users u ON dd.uploaded_by_user_id = u.id
                    WHERE dd.id = ?
                `,
					[insertId]
				);

				if (newDocResult.length > 0) {
					uploadedDocuments.push(newDocResult[0]);
				}
			}

			await connection.commit(); 

			return {
				action: 'uploadDocument',
				success: true,
				message: `${validFiles.length} document(s) uploaded successfully.`,
				newDocuments: uploadedDocuments
			};
		} catch (err: any) {
			console.error(`Error in uploadDocument action: ${err.message}`, err.stack);
			await connection.rollback(); 

			
			for (const savedFile of savedFilesData) {
				await deleteFile(savedFile.filePath).catch(() => {});
			}

			return fail(500, { action: 'uploadDocument', success: false, message: err.message || 'Upload failed.' });
		} finally {
			connection.release();
		}
	},

	/**
	 */
	renameDocument: async ({ request, locals }) => {
		checkPermission(locals, 'edit department documents');

		const data = await request.formData();
		const document_id = data.get('document_id')?.toString();
		const new_name = data.get('new_name')?.toString()?.trim();
		const new_description = data.get('new_description')?.toString()?.trim() || null;

		if (!document_id || !new_name) {
			return fail(400, { action: 'renameDocument', success: false, message: 'Document ID and new name are required.' });
		}
		
		let oldAbsolutePath = '';
		let newAbsolutePath = '';

		try {

			const [docResult] = await pool.execute<DepartmentDocument[]>(
				'SELECT file_path FROM departments_documents WHERE id = ?',
				[document_id]
			);
			if (docResult.length === 0) {
				return fail(404, { action: 'renameDocument', success: false, message: 'Document not found.' });
			}

			const oldRelativePath = docResult[0].file_path;
			const oldRelativeSubPath = path.relative(BASE_URL_PATH, oldRelativePath);
			oldAbsolutePath = path.join(UPLOADS_DIR, oldRelativeSubPath);


			// (Sanitize ชื่อใหม่ด้วย)
			const sanitizedNewName = new_name.replace(/[^a-zA-Z0-9._-]/g, '_');
			const newRelativeSubPath = path.join(path.dirname(oldRelativeSubPath), sanitizedNewName);
			newAbsolutePath = path.join(UPLOADS_DIR, newRelativeSubPath);
			const newRelativePath = `${BASE_URL_PATH}/${newRelativeSubPath}`.replace(/\\/g, '/');


			try {
				await fs.rename(oldAbsolutePath, newAbsolutePath);
			} catch(renameError: any) {
				// ถ้าไฟล์เก่าไม่มี ก็ไม่เป็นไร (อาจจะ error) แต่ก็อัปเดต DB ต่อไป
				if (renameError.code !== 'ENOENT') {
					throw renameError; 
				}
				console.warn(`File not found to rename: ${oldAbsolutePath}`);
			}



			const [result] = await pool.execute(
				`UPDATE departments_documents SET file_name = ?, description = ?, file_path = ? WHERE id = ?`,
				[new_name, new_description, newRelativePath, parseInt(document_id)]
			);

			if ((result as any).affectedRows === 0) {

				return fail(404, { action: 'renameDocument', success: false, message: 'Document not found.' });
			}


			const [updatedDocResult] = await pool.execute<DepartmentDocument[]>(
				`
                SELECT
                    dd.id, dd.department_id,
                    COALESCE(d.name, 'Unknown Dept') as department_name,
                    dd.file_name, dd.file_path, dd.description, dd.uploaded_by_user_id,
                    COALESCE(u.full_name, 'Unknown User') as uploader_name,
                    dd.uploaded_at
                FROM departments_documents dd
                LEFT JOIN departments d ON dd.department_id = d.id
                LEFT JOIN users u ON dd.uploaded_by_user_id = u.id
                WHERE dd.id = ?
            `,
				[document_id]
			);

			return {
				action: 'renameDocument',
				success: true,
				message: 'Document details updated.',
				updatedDocument: updatedDocResult[0] ?? null
			};
		} catch (err: any) {
			console.error(`Error renaming document ID ${document_id}: ${err.message}`, err.stack);
			
			// พยายาม Rollback การเปลี่ยนชื่อไฟล์ ถ้าทำได้
			if(oldAbsolutePath && newAbsolutePath) {
				try { await fs.rename(newAbsolutePath, oldAbsolutePath); } catch(rollbackError) { /* ignore */ }
			}

			return fail(500, { action: 'renameDocument', success: false, message: `Update failed. Error: ${err.message}` });
		}
	},

	/**
	 */
	deleteDocument: async ({ request, locals }) => {
		checkPermission(locals, 'delete department documents');
		const data = await request.formData();
		const document_id = data.get('document_id')?.toString();

		if (!document_id) {
			return fail(400, { action: 'deleteDocument', success: false, message: 'Invalid document ID.' });
		}
		const documentId = parseInt(document_id);
		let filePath: string | null = null;
		try {
			const connection = await pool.getConnection();
			await connection.beginTransaction();
			
			// 1. ดึง file_path ก่อน
			const [docResult] = await connection.execute<DepartmentDocument[]>(
				'SELECT file_path FROM departments_documents WHERE id = ? FOR UPDATE',
				[documentId]
			);
			if (docResult.length === 0) {
				await connection.rollback();
				connection.release();
				return fail(404, { action: 'deleteDocument', success: false, message: 'Document not found.' });
			}
			filePath = docResult[0].file_path;
			

			await connection.execute('DELETE FROM departments_documents WHERE id = ?', [documentId]);
			
			await connection.commit();
			connection.release();
			

			await deleteFile(filePath); 
			
			return {
				action: 'deleteDocument',
				success: true,
				message: 'Document deleted.',
				deletedDocumentId: documentId
			};
		} catch (err: any) {
			console.error(`Error deleting document ID ${documentId}: ${err.message}`, err.stack);
			return fail(500, {
				action: 'deleteDocument',
				success: false,
				message: `Deletion failed. Error: ${err.message}`
			});
		}
	}
};