import { fail, redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';

// --- Types ---
interface Vendor extends RowDataPacket {
	id: number;
	name: string;
	company_name: string | null;
	email: string | null;
	phone: string | null;
	address: string | null;
	tax_id: string | null;
	notes: string | null; // โน้ตข้อความเดียว (Main Note)
	assigned_to_user_id: number | null;
	assigned_user_name: string | null;
	created_at: string;
	updated_at: string;
	documents: VendorDocument[];
	note_history: VendorNote[]; // [เพิ่ม] รายการประวัติโน้ต
}

interface VendorNote extends RowDataPacket {
	id: number;
	vendor_id: number;
	note: string;
	user_id: number;
	user_full_name: string;
	created_at: string;
}

interface VendorDocument extends RowDataPacket {
	id: number;
	vendor_id: number;
	file_name: string;
	file_path: string;
	uploaded_by_user_id: number;
	uploaded_at: string;
}

interface User extends RowDataPacket {
	id: number;
	full_name: string;
	email: string;
}

// --- File Handling Helpers ---
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'vendor_docs');

async function saveFile(file: File): Promise<{ filePath: string; originalName: string } | null> {
	if (!file || file.size === 0) {
		return null;
	}
	let uploadPath = '';
	try {
		await fs.mkdir(UPLOADS_DIR, { recursive: true });
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
		const filename = `${uniqueSuffix}-${sanitizedOriginalName}`;
		uploadPath = path.join(UPLOADS_DIR, filename);

		await fs.writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));

		const relativePath = `/uploads/vendor_docs/${filename}`;
		return { filePath: relativePath, originalName: file.name };
	} catch (uploadError: any) {
		console.error(`saveFile Error: ${uploadError.message}`);
		if (uploadPath) {
			try {
				await fs.stat(uploadPath);
				await fs.unlink(uploadPath);
			} catch (cleanupError) {
				/* ignore */
			}
		}
		throw new Error(`Failed to save file: ${uploadError.message}`);
	}
}

async function deleteFile(filePath: string | null | undefined) {
	if (!filePath) return;
	try {
		const filename = path.basename(filePath);
		const fullPath = path.join(UPLOADS_DIR, filename);
		await fs.unlink(fullPath);
	} catch (error: any) {
		if (error.code !== 'ENOENT') {
			console.error(`deleteFile Error: ${error.message}`);
		}
	}
}

// --- Load Function ---
export const load: PageServerLoad = async ({ url, locals }) => {
	checkPermission(locals, 'view vendors');

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const pageSize = 15;
	const offset = (page - 1) * pageSize;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (
                v.name LIKE ? OR
                v.company_name LIKE ? OR
                v.email LIKE ? OR
                v.phone LIKE ? OR
                v.tax_id LIKE ? OR
                u.full_name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
		}

		// Count
		const countSql = `SELECT COUNT(*) as total FROM vendors v LEFT JOIN users u ON v.assigned_to_user_id = u.id ${whereClause}`;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		// Fetch Vendors
		const fetchSql = `SELECT
                v.id, v.name, v.company_name, v.email, v.phone, v.address, v.tax_id, v.notes,
                v.assigned_to_user_id, u.full_name AS assigned_user_name,
                v.created_at, v.updated_at
             FROM vendors v
             LEFT JOIN users u ON v.assigned_to_user_id = u.id
             ${whereClause}
             ORDER BY v.created_at DESC
             LIMIT ? OFFSET ?`;

		const fetchParams = [...params, pageSize, offset];
		const [vendorRows] = await pool.query<Vendor[]>(fetchSql, fetchParams);

		// Fetch Documents
		const [documentRows] = await pool.execute<VendorDocument[]>(`
            SELECT id, vendor_id, file_name, file_path, uploaded_by_user_id, uploaded_at
            FROM vendor_documents
            ORDER BY uploaded_at DESC
        `);

		// [เพิ่ม] Fetch Note History
		const [noteRows] = await pool.execute<VendorNote[]>(`
            SELECT vn.id, vn.vendor_id, vn.note, vn.user_id, vn.created_at, u.full_name as user_full_name
            FROM vendor_notes vn
            LEFT JOIN users u ON vn.user_id = u.id
            ORDER BY vn.created_at DESC
        `);

		// Map Data
		const documentsByVendorId = new Map<number, VendorDocument[]>();
		documentRows.forEach((doc) => {
			const list = documentsByVendorId.get(doc.vendor_id) || [];
			list.push(doc);
			documentsByVendorId.set(doc.vendor_id, list);
		});

		const notesByVendorId = new Map<number, VendorNote[]>();
		noteRows.forEach((note) => {
			const list = notesByVendorId.get(note.vendor_id) || [];
			list.push(note);
			notesByVendorId.set(note.vendor_id, list);
		});

		// Fetch Users
		const [userRows] = await pool.execute<User[]>(
			'SELECT id, full_name, email FROM users ORDER BY full_name'
		);

		const vendorsWithData = vendorRows.map((vend) => ({
			...vend,
			documents: documentsByVendorId.get(vend.id) || [],
			note_history: notesByVendorId.get(vend.id) || [] // [เพิ่ม]
		}));

		return {
			vendors: JSON.parse(JSON.stringify(vendorsWithData)),
			users: JSON.parse(JSON.stringify(userRows)),
			currentPage: page,
			totalPages,
			searchQuery,
			totalItems: total
		};
	} catch (err: any) {
		console.error('Failed to load vendors:', err);
		throw error(500, `Server Error: ${err.message}`);
	}
};

// --- Actions ---
export const actions: Actions = {
	saveVendor: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const name = data.get('name')?.toString()?.trim();
		const company_name = data.get('company_name')?.toString()?.trim() || null;
		const email = data.get('email')?.toString()?.trim() || null;
		const phone = data.get('phone')?.toString()?.trim() || null;
		const address = data.get('address')?.toString()?.trim() || null;
		const tax_id = data.get('tax_id')?.toString()?.trim() || null;
		const notes = data.get('notes')?.toString()?.trim() || null;
		const assigned_to_user_id = data.get('assigned_to_user_id')?.toString();

		if (!name) {
			return fail(400, {
				action: 'saveVendor',
				success: false,
				message: 'Vendor name is required.'
			});
		}

		try {
			const assignedUserId =
				assigned_to_user_id && assigned_to_user_id !== 'undefined'
					? parseInt(assigned_to_user_id)
					: null;

			if (id) {
				checkPermission(locals, 'edit vendors');
				await pool.execute(
					`UPDATE vendors SET
                        name = ?, company_name = ?, email = ?, phone = ?, address = ?, tax_id = ?, notes = ?, assigned_to_user_id = ?, updated_at = NOW()
                     WHERE id = ?`,
					[name, company_name, email, phone, address, tax_id, notes, assignedUserId, parseInt(id)]
				);
				return {
					action: 'saveVendor',
					success: true,
					message: 'Vendor updated successfully!'
				};
			} else {
				checkPermission(locals, 'create vendors');
				const [result] = await pool.execute(
					`INSERT INTO vendors
                        (name, company_name, email, phone, address, tax_id, notes, assigned_to_user_id, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
					[name, company_name, email, phone, address, tax_id, notes, assignedUserId]
				);
				return { action: 'saveVendor', success: true, message: 'Vendor added successfully!' };
			}
		} catch (err: any) {
			console.error(`Save Vendor Error: ${err.message}`);
			if (err.code === 'ER_DUP_ENTRY') {
				return fail(409, {
					action: 'saveVendor',
					success: false,
					message: 'Vendor with this Tax ID or Email might already exist.'
				});
			}
			return fail(500, {
				action: 'saveVendor',
				success: false,
				message: `Failed to save vendor. Error: ${err.message}`
			});
		}
	},

	deleteVendor: async ({ request, locals }) => {
		checkPermission(locals, 'delete vendors');
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { action: 'deleteVendor', success: false, message: 'Invalid ID.' });

		const vendorId = parseInt(id);
		const connection = await pool.getConnection();

		try {
			await connection.beginTransaction();

			const [docsToDelete] = await connection.execute<VendorDocument[]>(
				'SELECT file_path FROM vendor_documents WHERE vendor_id = ?',
				[vendorId]
			);

			await connection.execute('DELETE FROM vendor_notes WHERE vendor_id = ?', [vendorId]);

			await connection.execute('DELETE FROM vendor_documents WHERE vendor_id = ?', [vendorId]);

			await connection.execute('DELETE FROM vendors WHERE id = ?', [vendorId]);

			await connection.commit();
			connection.release();

			const deletePromises = docsToDelete.map((doc) => deleteFile(doc.file_path));
			await Promise.all(deletePromises);

			return { action: 'deleteVendor', success: true };
		} catch (error: any) {
			await connection.rollback();
			connection.release();
			console.error(`Delete Vendor Error: ${error.message}`);

			if (error.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, {
					action: 'deleteVendor',
					success: false,
					message: 'ไม่สามารถลบได้: ข้อมูลนี้ถูกใช้งานอยู่ในส่วนอื่น (เช่น ใบสั่งซื้อ หรือ สัญญา)'
				});
			}
			return fail(500, {
				action: 'deleteVendor',
				success: false,
				message: `Failed to delete. Error: ${error.message}`
			});
		}
	},

	uploadDocument: async ({ request, locals }) => {
		checkPermission(locals, 'upload vendor documents');
		let savedFileData: { filePath: string; originalName: string } | null = null;
		try {
			const data = await request.formData();
			const vendor_id = data.get('vendor_id')?.toString();
			const documentFile = data.get('document') as File;

			if (!vendor_id || !documentFile || documentFile.size === 0) {
				return fail(400, {
					action: 'uploadDocument',
					success: false,
					message: 'Vendor ID and File are required.'
				});
			}

			const vendorId = parseInt(vendor_id);
			const uploaderUserId = locals.user?.id;

			savedFileData = await saveFile(documentFile);
			if (!savedFileData) throw new Error('File saving failed.');

			await pool.execute(
				`INSERT INTO vendor_documents (vendor_id, file_name, file_path, uploaded_by_user_id, uploaded_at)
                 VALUES (?, ?, ?, ?, NOW())`,
				[vendorId, savedFileData.originalName, savedFileData.filePath, uploaderUserId]
			);

			const [newDocResult] = await pool.execute<VendorDocument[]>(
				`SELECT * FROM vendor_documents WHERE vendor_id = ? AND file_path = ? ORDER BY id DESC LIMIT 1`,
				[vendorId, savedFileData.filePath]
			);

			return {
				action: 'uploadDocument',
				success: true,
				message: 'Upload successful.',
				newDocument: JSON.parse(JSON.stringify(newDocResult[0]))
			};
		} catch (err: any) {
			console.error(`Upload Error: ${err.message}`);
			if (savedFileData?.filePath) {
				await deleteFile(savedFileData.filePath);
			}
			return fail(500, { action: 'uploadDocument', success: false, message: err.message });
		}
	},

	deleteDocument: async ({ request, locals }) => {
		const data = await request.formData();
		const document_id = data.get('document_id')?.toString();

		if (!document_id) {
			return fail(400, { action: 'deleteDocument', success: false, message: 'Invalid ID.' });
		}

		const docId = parseInt(document_id);
		let connection;

		try {
			connection = await pool.getConnection();
			await connection.beginTransaction();

			const [docs] = await connection.execute<VendorDocument[]>(
				'SELECT file_path FROM vendor_documents WHERE id = ?',
				[docId]
			);

			if (docs.length === 0) {
				await connection.rollback();
				return fail(404, {
					action: 'deleteDocument',
					success: false,
					message: 'Document not found.'
				});
			}

			const filePath = docs[0].file_path;

			await connection.execute('DELETE FROM vendor_documents WHERE id = ?', [docId]);

			await connection.commit();

			if (filePath) {
				try {
					const filename = path.basename(filePath);
					const fullPath = path.join(process.cwd(), 'uploads', 'vendor_docs', filename);

					await fs.unlink(fullPath);
				} catch (fileErr: any) {
					if (fileErr.code !== 'ENOENT') {
						console.error('Failed to delete physical file:', fileErr);
					}
				}
			}

			return {
				action: 'deleteDocument',
				success: true,
				message: 'Document deleted.',
				deletedDocumentId: docId
			};
		} catch (err: any) {
			if (connection) await connection.rollback();
			console.error(`Delete Document Error: ${err.message}`);
			return fail(500, {
				action: 'deleteDocument',
				success: false,
				message: `Failed to delete. Error: ${err.message}`
			});
		} finally {
			if (connection) connection.release();
		}
	},

	addNote: async ({ request, locals }) => {
		checkPermission(locals, 'add vendor notes');
		const data = await request.formData();
		const vendor_id = data.get('vendor_id')?.toString();
		const note = data.get('note')?.toString()?.trim();

		if (!vendor_id || !note)
			return fail(400, { action: 'addNote', success: false, message: 'Missing data.' });

		try {
			const [result] = await pool.execute(
				'INSERT INTO vendor_notes (vendor_id, note, user_id, created_at) VALUES (?, ?, ?, NOW())',
				[parseInt(vendor_id), note, locals.user?.id]
			);
			const insertId = (result as any).insertId;
			const [newNoteResult] = await pool.execute<VendorNote[]>(
				`
                SELECT vn.*, u.full_name as user_full_name
                FROM vendor_notes vn JOIN users u ON vn.user_id = u.id
                WHERE vn.id = ?
            `,
				[insertId]
			);
			return {
				action: 'addNote',
				success: true,
				message: 'Note added.',
				newNote: JSON.parse(JSON.stringify(newNoteResult[0]))
			};
		} catch (error: any) {
			return fail(500, { action: 'addNote', success: false, message: error.message });
		}
	},

	deleteNote: async ({ request, locals }) => {
		checkPermission(locals, 'delete vendor notes');
		const data = await request.formData();
		const note_id = data.get('note_id')?.toString();

		if (!note_id)
			return fail(400, { action: 'deleteNote', success: false, message: 'Missing ID.' });

		try {
			await pool.execute('DELETE FROM vendor_notes WHERE id = ?', [note_id]);
			return {
				action: 'deleteNote',
				success: true,
				message: 'Note deleted.',
				deletedNoteId: parseInt(note_id)
			};
		} catch (error: any) {
			return fail(500, { action: 'deleteNote', success: false, message: error.message });
		}
	}
};
