import { fail, redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';

// --- Types ---
interface Customer extends RowDataPacket {
	id: number;
	name: string;
	company_name: string | null;
	email: string | null;
	phone: string | null;
	address: string | null;
	tax_id: string | null;
	notes: string | null;
	assigned_to_user_id: number | null;
	assigned_user_name: string | null;
	created_at: string;
	updated_at: string;
	documents: CustomerDocument[];
}

interface CustomerNote extends RowDataPacket {
	id: number;
	customer_id: number;
	note: string;
	user_id: number;
	user_full_name: string;
	created_at: string;
}

interface CustomerDocument extends RowDataPacket {
	id: number;
	customer_id: number;
	file_name: string;
	file_path: string;
	uploaded_by_user_id: number;
	uploaded_at: string;
	// uploader_name?: string;
}

interface User extends RowDataPacket {
	id: number;
	full_name: string;
	email: string;
}

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'customer_docs');

async function saveFile(file: File): Promise<{ filePath: string; originalName: string } | null> {
	if (!file || file.size === 0) {
		console.log('saveFile: No file or empty file provided.');
		return null;
	}
	let uploadPath = '';
	try {
		await fs.mkdir(UPLOADS_DIR, { recursive: true });
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
		const filename = `${uniqueSuffix}-${sanitizedOriginalName}`;
		uploadPath = path.join(UPLOADS_DIR, filename);

		console.log(`saveFile: Attempting to write file to ${uploadPath}`);
		await fs.writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));
		console.log(`saveFile: Successfully wrote file ${uploadPath}`);

		const relativePath = `/uploads/customer_docs/${filename}`;
		return { filePath: relativePath, originalName: file.name };
	} catch (uploadError: any) {
		console.error(
			`saveFile: Error during file upload process for path ${uploadPath}. Error: ${uploadError.message}`,
			uploadError.stack
		);
		if (uploadPath) {
			try {
				await fs.stat(uploadPath);
				await fs.unlink(uploadPath);
				console.log(`saveFile: Cleaned up partially written file ${uploadPath}`);
			} catch (cleanupError: any) {
				if (cleanupError.code !== 'ENOENT') {
					console.error(`saveFile: Error cleaning up file ${uploadPath}: ${cleanupError.message}`);
				}
			}
		}
		throw new Error(`Failed to save uploaded file "${file.name}". Reason: ${uploadError.message}`);
	}
}

async function deleteFile(filePath: string | null | undefined) {
	if (!filePath) return;
	try {
		const filename = path.basename(filePath);
		const fullPath = path.join(UPLOADS_DIR, filename);
		console.log(`deleteFile: Attempting to delete ${fullPath}`);
		await fs.unlink(fullPath);
		console.log(`deleteFile: Successfully deleted file: ${fullPath}`);
	} catch (error: any) {
		if (error.code !== 'ENOENT') {
			console.error(
				`deleteFile: Failed to delete file: ${filePath}. Error: ${error.message}`,
				error.stack
			);
			throw new Error(
				`Failed to delete file "${path.basename(filePath)}". Reason: ${error.message}`
			);
		} else {
			console.log(`deleteFile: File not found, skipping delete: ${filePath}`);
		}
	}
}

export const load: PageServerLoad = async ({ url, locals }) => {
	checkPermission(locals, 'view customers');

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const pageSize = 15;
	const offset = (page - 1) * pageSize;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (
                c.name LIKE ? OR
                c.company_name LIKE ? OR -- NEW: Search company name
                c.email LIKE ? OR
                c.phone LIKE ? OR
                c.tax_id LIKE ? OR
                u.full_name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
		}

		const countSql = `SELECT COUNT(*) as total
             FROM customers c
             LEFT JOIN users u ON c.assigned_to_user_id = u.id
             ${whereClause}`;
		console.log('[DEBUG] Count SQL:', countSql);
		console.log('[DEBUG] Count Params:', JSON.stringify(params));

		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		const fetchSql = `SELECT
                c.id, c.name, c.company_name, c.email, c.phone, c.address, c.tax_id, c.notes, -- Fetched company_name
                c.assigned_to_user_id, u.full_name AS assigned_user_name,
                c.created_at, c.updated_at
             FROM customers c
             LEFT JOIN users u ON c.assigned_to_user_id = u.id
             ${whereClause}
             ORDER BY c.created_at DESC
             LIMIT ? OFFSET ?`;
		const fetchParams = [...params, pageSize, offset];
		console.log('[DEBUG] Fetch SQL:', fetchSql);
		console.log('[DEBUG] Fetch Params:', JSON.stringify(fetchParams));

		const [customerRows] = await pool.query<Customer[]>(fetchSql, fetchParams);

		const documentSql = `
            SELECT id, customer_id, file_name, file_path, uploaded_by_user_id, uploaded_at
            FROM customer_documents
            ORDER BY uploaded_at DESC
        `;
		console.log('[DEBUG] Document SQL:', documentSql);
		const [documentRows] = await pool.execute<CustomerDocument[]>(documentSql);

		const documentsByCustomerId = new Map<number, CustomerDocument[]>();
		documentRows.forEach((doc) => {
			const list = documentsByCustomerId.get(doc.customer_id) || [];
			list.push(doc);
			documentsByCustomerId.set(doc.customer_id, list);
		});

		const userSql = 'SELECT id, full_name, email FROM users ORDER BY full_name';
		console.log('[DEBUG] User SQL:', userSql);
		const [userRows] = await pool.execute<User[]>(userSql);

		const customersWithDocs = customerRows.map((cust) => ({
			...cust,
			documents: documentsByCustomerId.get(cust.id) || []
		}));

		return {
			customers: customersWithDocs,
			users: userRows,
			currentPage: page,
			totalPages,
			searchQuery
		};
	} catch (err: any) {
		console.error('Failed to load customers data:', err.message, err.stack);
		throw error(500, `Failed to load data from the server. Error: ${err.message}`);
	}
};

// --- Actions --- (Keep existing actions unchanged)
export const actions: Actions = {
	saveCustomer: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const name = data.get('name')?.toString()?.trim();
		const company_name = data.get('company_name')?.toString()?.trim() || null; // NEW: Get company name
		const email = data.get('email')?.toString()?.trim() || null;
		const phone = data.get('phone')?.toString()?.trim() || null;
		const address = data.get('address')?.toString()?.trim() || null;
		const tax_id = data.get('tax_id')?.toString()?.trim() || null;
		const notes = data.get('notes')?.toString()?.trim() || null;
		const assigned_to_user_id = data.get('assigned_to_user_id')?.toString();

		if (!name) {
			return fail(400, {
				action: 'saveCustomer',
				success: false,
				message: 'Customer name is required.'
			});
		}

		const userId = locals.user?.id;
		if (!userId) {
			console.error('saveCustomer: User not found in locals.');
			throw error(401, 'Unauthorized: User session not found.');
		}

		try {
			const assignedUserId = assigned_to_user_id ? parseInt(assigned_to_user_id) : null;

			if (id) {
				checkPermission(locals, 'edit customers');
				await pool.execute(
					`UPDATE customers SET
                        name = ?, company_name = ?, email = ?, phone = ?, address = ?, tax_id = ?, notes = ?, assigned_to_user_id = ?, updated_at = NOW()
                     WHERE id = ?`,
					[name, company_name, email, phone, address, tax_id, notes, assignedUserId, parseInt(id)] // Added company_name
				);
				return { action: 'saveCustomer', success: true, message: 'Customer updated successfully!' };
			} else {
				checkPermission(locals, 'create customers');
				const [result] = await pool.execute(
					`INSERT INTO customers
                        (name, company_name, email, phone, address, tax_id, notes, assigned_to_user_id, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`, // Added company_name
					[name, company_name, email, phone, address, tax_id, notes, assignedUserId]
				);
				const insertId = (result as any).insertId;
				return {
					action: 'saveCustomer',
					success: true,
					message: 'Customer added successfully!',
					customerId: insertId
				};
			}
		} catch (err: any) {
			console.error(
				`Database error on saving customer (ID: ${id || 'New'}): ${err.message}`,
				err.stack
			);
			if (err.code === 'ER_DUP_ENTRY') {
				return fail(409, {
					action: 'saveCustomer',
					success: false,
					message: 'Customer with this Tax ID or Email might already exist.'
				});
			}
			return fail(500, {
				action: 'saveCustomer',
				success: false,
				message: `Failed to save customer data. Error: ${err.message}`
			});
		}
	},

	deleteCustomer: async ({ request, locals }) => {
		checkPermission(locals, 'delete customers');
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) {
			return fail(400, {
				action: 'deleteCustomer',
				success: false,
				message: 'Invalid customer ID.'
			});
		}

		const customerId = parseInt(id);
		const connection = await pool.getConnection();

		try {
			await connection.beginTransaction();

			const [docsToDelete] = await connection.execute<CustomerDocument[]>(
				'SELECT file_path FROM customer_documents WHERE customer_id = ?',
				[customerId]
			);

			await connection.execute('DELETE FROM customers WHERE id = ?', [customerId]);

			const deletePromises = docsToDelete.map((doc) => deleteFile(doc.file_path));
			await Promise.all(deletePromises); // Wait for all file deletions

			await connection.commit();
			throw redirect(303, '/customers');
		} catch (error: any) {
			await connection.rollback();
			if (error.status === 303) throw error;

			console.error(`Error deleting customer ID ${customerId}: ${error.message}`, error.stack);
			if (error.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, {
					action: 'deleteCustomer',
					success: false,
					message: 'Cannot delete customer. Check related records (e.g., invoices, orders).'
				});
			}
			return fail(500, {
				action: 'deleteCustomer',
				success: false,
				message: `Failed to delete customer. Error: ${error.message}`
			});
		} finally {
			connection.release();
		}
	},

	uploadDocument: async ({ request, locals }) => {
		checkPermission(locals, 'upload customer documents');

		let savedFileData: { filePath: string; originalName: string } | null = null;

		try {
			const data = await request.formData();
			const customer_id = data.get('customer_id')?.toString();
			const documentFile = data.get('document') as File;

			if (!customer_id || !documentFile || documentFile.size === 0) {
				return fail(400, {
					action: 'uploadDocument',
					success: false,
					message: 'Customer ID and document file are required.'
				});
			}

			if (!locals.user?.id) {
				console.error('uploadDocument: User not found in locals.');
				throw error(401, 'Unauthorized: User session not found.');
			}

			const customerId = parseInt(customer_id);
			const uploaderUserId = locals.user.id;

			console.log(
				`uploadDocument: Attempting upload for customer ID ${customerId}, file: ${documentFile.name}`
			);

			savedFileData = await saveFile(documentFile);

			if (!savedFileData) {
				throw new Error('File saving process failed unexpectedly.');
			}

			const fileInfo = savedFileData;

			console.log(`uploadDocument: File saved, attempting DB insert for path ${fileInfo.filePath}`);

			await pool.execute(
				`INSERT INTO customer_documents (customer_id, file_name, file_path, uploaded_by_user_id, uploaded_at)
                 VALUES (?, ?, ?, ?, NOW())`,
				[customerId, fileInfo.originalName, fileInfo.filePath, uploaderUserId]
			);
			console.log(`uploadDocument: DB insert successful for ${fileInfo.originalName}`);

			const [newDocResult] = await pool.execute<CustomerDocument[]>(
				`SELECT id, customer_id, file_name, file_path, uploaded_by_user_id, uploaded_at
                 FROM customer_documents
                 WHERE customer_id = ? AND file_path = ? ORDER BY id DESC LIMIT 1`,
				[customerId, fileInfo.filePath]
			);

			if (newDocResult.length === 0) {
				console.error(
					`uploadDocument: Failed to retrieve the newly inserted document record for customer ${customerId}, path ${fileInfo.filePath}`
				);
			}

			return {
				action: 'uploadDocument',
				success: true,
				message: `Document "${fileInfo.originalName}" uploaded successfully.`,
				newDocument: newDocResult.length > 0 ? newDocResult[0] : null
			};
		} catch (err: any) {
			console.error(`Error in uploadDocument action: ${err.message}`, err.stack);

			if (savedFileData?.filePath) {
				console.log(
					`uploadDocument: Error occurred after file save, attempting cleanup for ${savedFileData.filePath}`
				);
				await deleteFile(savedFileData.filePath).catch((cleanupErr) => {
					console.error(
						`uploadDocument: Failed to cleanup file ${savedFileData?.filePath} after error: ${cleanupErr.message}`
					);
				});
			}

			return fail(500, {
				action: 'uploadDocument',
				success: false,
				message: err.message || 'Failed to upload document due to a server error.'
			});
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

			const [docs] = await connection.execute<any[]>(
				'SELECT file_path FROM customer_documents WHERE id = ?',
				[docId]
			);

			if (docs.length === 0) {
				await connection.rollback();
				return fail(404, {
					action: 'deleteDocument',
					success: false,
					message: 'Document not found in database.'
				});
			}

			const filePath = docs[0].file_path;

			await connection.execute('DELETE FROM customer_documents WHERE id = ?', [docId]);

			await connection.commit();

			if (filePath) {
				try {
					const filename = path.basename(filePath);
					const fullPath = path.join(process.cwd(), 'uploads', 'customer_docs', filename);

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
		checkPermission(locals, 'add customer notes');
		const data = await request.formData();
		const customer_id = data.get('customer_id')?.toString();
		const note = data.get('note')?.toString()?.trim();

		if (!customer_id || !note) {
			return fail(400, {
				action: 'addNote',
				success: false,
				message: 'Customer ID and note text are required.'
			});
		}
		if (!locals.user?.id) {
			throw error(401, 'Unauthorized');
		}

		try {
			const [result] = await pool.execute(
				'INSERT INTO customer_notes (customer_id, note, user_id, created_at) VALUES (?, ?, ?, NOW())',
				[parseInt(customer_id), note, locals.user.id]
			);
			const insertId = (result as any).insertId;
			const [newNoteResult] = await pool.execute<CustomerNote[]>(
				`
                SELECT cn.id, cn.customer_id, cn.note, cn.user_id, cn.created_at, u.full_name as user_full_name
                FROM customer_notes cn
                JOIN users u ON cn.user_id = u.id
                WHERE cn.id = ?
            `,
				[insertId]
			);
			return {
				action: 'addNote',
				success: true,
				message: 'Note added.',
				newNote: newNoteResult[0]
			};
		} catch (error: any) {
			console.error(
				`Failed to add note for customer ${customer_id}: ${error.message}`,
				error.stack
			);
			return fail(500, {
				action: 'addNote',
				success: false,
				message: `Failed to add note. Error: ${error.message}`
			});
		}
	},

	deleteNote: async ({ request, locals }) => {
		checkPermission(locals, 'delete customer notes');
		const data = await request.formData();
		const note_id = data.get('note_id')?.toString();
		const customer_id = data.get('customer_id')?.toString();

		if (!note_id || !customer_id) {
			return fail(400, {
				action: 'deleteNote',
				success: false,
				message: 'Note ID and Customer ID are required.'
			});
		}
		if (!locals.user?.id) {
			throw error(401, 'Unauthorized');
		}

		try {
			const [result] = await pool.execute('DELETE FROM customer_notes WHERE id = ?', [note_id]);
			if ((result as any).affectedRows === 0) {
				return fail(404, { action: 'deleteNote', success: false, message: 'Note not found.' });
			}
			return {
				action: 'deleteNote',
				success: true,
				message: 'Note deleted.',
				deletedNoteId: parseInt(note_id)
			};
		} catch (error: any) {
			console.error(`Failed to delete note ID ${note_id}: ${error.message}`, error.stack);
			return fail(500, {
				action: 'deleteNote',
				success: false,
				message: `Failed to delete note. Error: ${error.message}`
			});
		}
	}
};
