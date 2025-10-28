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
	notes: string | null;
	assigned_to_user_id: number | null;
	assigned_user_name: string | null; // From JOIN
	created_at: string;
	updated_at: string;
    documents: VendorDocument[];
}

interface VendorNote extends RowDataPacket {
	id: number;
	vendor_id: number;
	note: string;
	user_id: number;
	user_full_name: string; // From JOIN
	created_at: string;
}

interface VendorDocument extends RowDataPacket {
    id: number;
    vendor_id: number;
    file_name: string; // Original file name
    file_path: string; // Relative path on server (/uploads/...)
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
		console.log("saveFile: No file or empty file provided.");
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

		const relativePath = `/uploads/vendor_docs/${filename}`;
		return { filePath: relativePath, originalName: file.name };

	} catch (uploadError: any) {
		console.error(`saveFile: Error during file upload process for path ${uploadPath}. Error: ${uploadError.message}`, uploadError.stack);
        if (uploadPath) {
            try {
                // Check if file exists before attempting unlink
                await fs.stat(uploadPath); // This will throw if it doesn't exist
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
			console.error(`deleteFile: Failed to delete file: ${filePath}. Error: ${error.message}`, error.stack);
            throw new Error(`Failed to delete file "${path.basename(filePath)}". Reason: ${error.message}`);
		} else {
             console.log(`deleteFile: File not found, skipping delete: ${filePath}`);
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

		// Get total count (using execute is fine here as params match placeholders)
		const countSql = `SELECT COUNT(*) as total
             FROM vendors v
             LEFT JOIN users u ON v.assigned_to_user_id = u.id
             ${whereClause}`;
        console.log("[DEBUG][vendors] Count SQL:", countSql.replace(/\s+/g, ' ').trim());
        console.log("[DEBUG][vendors] Count Params:", JSON.stringify(params));
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		// Fetch vendors
        // *** MODIFIED: Changed pool.execute to pool.query ***
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
        console.log("[DEBUG][vendors] Fetch SQL:", fetchSql.replace(/\s+/g, ' ').trim());
        console.log("[DEBUG][vendors] Fetch Params:", JSON.stringify(fetchParams));
		const [vendorRows] = await pool.query<Vendor[]>(fetchSql, fetchParams); // <-- Line 95 changed to query

        // Fetch documents (using execute is fine, no dynamic params)
        const documentSql = `
            SELECT id, vendor_id, file_name, file_path, uploaded_by_user_id, uploaded_at
            FROM vendor_documents
            ORDER BY uploaded_at DESC
        `;
        console.log("[DEBUG][vendors] Document SQL:", documentSql.replace(/\s+/g, ' ').trim());
        const [documentRows] = await pool.execute<VendorDocument[]>(documentSql);

        const documentsByVendorId = new Map<number, VendorDocument[]>();
        documentRows.forEach(doc => {
            const list = documentsByVendorId.get(doc.vendor_id) || [];
            list.push(doc);
            documentsByVendorId.set(doc.vendor_id, list);
        });

		// Fetch users (using execute is fine, no dynamic params)
        const userSql = 'SELECT id, full_name, email FROM users ORDER BY full_name';
        console.log("[DEBUG][vendors] User SQL:", userSql.replace(/\s+/g, ' ').trim());
		const [userRows] = await pool.execute<User[]>(userSql);

        // Combine data (no DB calls)
        const vendorsWithDocs = vendorRows.map(vend => ({
            ...vend,
            documents: documentsByVendorId.get(vend.id) || []
        }));

		return {
			vendors: vendorsWithDocs,
			users: userRows,
			currentPage: page,
			totalPages,
			searchQuery
		};
	} catch (err: any) {
		console.error('Failed to load vendors data:', err.message, err.stack);
		throw error(500, `Failed to load data from the server. Error: ${err.message}`);
	}
};

// --- Actions ---
export const actions: Actions = {
	/**
	 * Save (Add or Edit) Vendor Details
	 */
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
			return fail(400, { action: 'saveVendor', success: false, message: 'Vendor name is required.' });
		}

		const userId = locals.user?.id;
		if (!userId) {
			console.error("saveVendor: User not found in locals.");
			throw error(401, 'Unauthorized: User session not found.');
		}

		try {
			const assignedUserId = assigned_to_user_id ? parseInt(assigned_to_user_id) : null;

			if (id) {
				// Edit
				checkPermission(locals, 'edit vendors');
				await pool.execute(
					`UPDATE vendors SET
                        name = ?, company_name = ?, email = ?, phone = ?, address = ?, tax_id = ?, notes = ?, assigned_to_user_id = ?, updated_at = NOW()
                     WHERE id = ?`,
					[name, company_name, email, phone, address, tax_id, notes, assignedUserId, parseInt(id)]
				);
				return { action: 'saveVendor', success: true, message: 'Vendor updated successfully!' };
			} else {
				// Add
				checkPermission(locals, 'create vendors');
				const [result] = await pool.execute(
					`INSERT INTO vendors
                        (name, company_name, email, phone, address, tax_id, notes, assigned_to_user_id, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
					[name, company_name, email, phone, address, tax_id, notes, assignedUserId]
				);
				const insertId = (result as any).insertId;
				return { action: 'saveVendor', success: true, message: 'Vendor added successfully!', vendorId: insertId };
			}
		} catch (err: any) {
			console.error(`Database error on saving vendor (ID: ${id || 'New'}): ${err.message}`, err.stack);
            if (err.code === 'ER_DUP_ENTRY') {
                return fail(409, { action: 'saveVendor', success: false, message: 'Vendor with this Tax ID or Email might already exist.' });
            }
			return fail(500, { action: 'saveVendor', success: false, message: `Failed to save vendor data. Error: ${err.message}` });
		}
	},

	/**
	 * Delete Vendor
	 */
	deleteVendor: async ({ request, locals }) => {
		checkPermission(locals, 'delete vendors');
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) {
			return fail(400, { action: 'deleteVendor', success: false, message: 'Invalid vendor ID.' });
		}

		const vendorId = parseInt(id);
        const connection = await pool.getConnection();

		try {
            await connection.beginTransaction();

            const [docsToDelete] = await connection.execute<VendorDocument[]>(
                'SELECT file_path FROM vendor_documents WHERE vendor_id = ?',
                [vendorId]
            );

			await connection.execute('DELETE FROM vendors WHERE id = ?', [vendorId]);

            const deletePromises = docsToDelete.map(doc => deleteFile(doc.file_path));
            await Promise.all(deletePromises); // Wait for all file deletions

            await connection.commit();
			// Redirect after successful deletion
            throw redirect(303, '/vendors'); // Use redirect

		} catch (error: any) {
            await connection.rollback();
            // Important: Re-throw redirects
			if (error?.status === 303) throw error;

			console.error(`Error deleting vendor ID ${vendorId}: ${error.message}`, error.stack);
            if (error.code === 'ER_ROW_IS_REFERENCED_2') {
                 return fail(409, { action: 'deleteVendor', success: false, message: 'Cannot delete vendor. Check related records (e.g., contracts, purchase orders).' });
            }
			return fail(500, { action: 'deleteVendor', success: false, message: `Failed to delete vendor. Error: ${error.message}` });
		} finally {
            connection.release();
        }
	},

    /**
     * Upload Vendor Document
     */
    uploadDocument: async ({ request, locals }) => {
        checkPermission(locals, 'upload vendor documents');
        let savedFileData: { filePath: string; originalName: string } | null = null;
        try {
            const data = await request.formData();
            const vendor_id = data.get('vendor_id')?.toString();
            const documentFile = data.get('document') as File;

            if (!vendor_id || !documentFile || documentFile.size === 0) {
                return fail(400, { action: 'uploadDocument', success: false, message: 'Vendor ID and document file are required.' });
            }
            if (!locals.user?.id) {
                 console.error("uploadDocument: User not found in locals.");
                 throw error(401, 'Unauthorized: User session not found.');
            }

            const vendorId = parseInt(vendor_id);
            const uploaderUserId = locals.user.id;

            console.log(`uploadDocument: Attempting upload for vendor ID ${vendorId}, file: ${documentFile.name}`);
            savedFileData = await saveFile(documentFile); // Save first

            if (!savedFileData) {
                 throw new Error('File saving process failed unexpectedly.');
            }

            console.log(`uploadDocument: File saved, attempting DB insert for path ${savedFileData.filePath}`);
            await pool.execute(
                `INSERT INTO vendor_documents (vendor_id, file_name, file_path, uploaded_by_user_id, uploaded_at)
                 VALUES (?, ?, ?, ?, NOW())`,
                [vendorId, savedFileData.originalName, savedFileData.filePath, uploaderUserId]
            );
            console.log(`uploadDocument: DB insert successful for ${savedFileData.originalName}`);

             const [newDocResult] = await pool.execute<VendorDocument[]>(
                `SELECT id, vendor_id, file_name, file_path, uploaded_by_user_id, uploaded_at
                 FROM vendor_documents
                 WHERE vendor_id = ? AND file_path = ? ORDER BY id DESC LIMIT 1`,
                [vendorId, savedFileData.filePath]
             );

             if(newDocResult.length === 0) {
                 console.error(`uploadDocument: Failed to retrieve the newly inserted document record for vendor ${vendorId}, path ${savedFileData.filePath}`);
             }

            return {
                action: 'uploadDocument',
                success: true,
                message: `Document "${savedFileData.originalName}" uploaded successfully.`,
                newDocument: newDocResult.length > 0 ? newDocResult[0] : null
            };

        } catch (err: any) {
            console.error(`Error in uploadDocument action: ${err.message}`, err.stack);
            if (savedFileData?.filePath) {
                console.log(`uploadDocument: Error occurred after file save, attempting cleanup for ${savedFileData.filePath}`);
                await deleteFile(savedFileData.filePath).catch(cleanupErr => {
                    console.error(`uploadDocument: Failed to cleanup file ${savedFileData.filePath} after error: ${cleanupErr.message}`);
                });
            }
            return fail(500, { action: 'uploadDocument', success: false, message: err.message || 'Failed to upload document due to a server error.' });
        }
    },

    /**
     * Delete Vendor Document
     */
    deleteDocument: async ({ request, locals }) => {
        checkPermission(locals, 'delete vendor documents');
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

            const [docResult] = await connection.execute<VendorDocument[]>(
                'SELECT file_path FROM vendor_documents WHERE id = ? FOR UPDATE',
                [documentId]
            );

            if (docResult.length === 0) {
                 await connection.rollback();
                 connection.release();
                 return fail(404, { action: 'deleteDocument', success: false, message: 'Document not found.' });
            }
            filePath = docResult[0].file_path;

            await connection.execute('DELETE FROM vendor_documents WHERE id = ?', [documentId]);
            console.log(`deleteDocument: DB record deleted for ID ${documentId}`);

            await connection.commit();
            connection.release();

            await deleteFile(filePath); // Delete file after DB commit

            return {
                action: 'deleteDocument',
                success: true,
                message: 'Document deleted successfully.',
                deletedDocumentId: documentId
            };

        } catch (err: any) {
            console.error(`Error deleting document ID ${documentId}: ${err.message}`, err.stack);
            return fail(500, { action: 'deleteDocument', success: false, message: `Failed to delete document. Error: ${err.message}` });
        }
    },

	// --- Note Actions ---
	addNote: async ({ request, locals }) => {
        checkPermission(locals, 'add vendor notes');
		const data = await request.formData();
		const vendor_id = data.get('vendor_id')?.toString();
		const note = data.get('note')?.toString()?.trim();

		if (!vendor_id || !note) {
			return fail(400, { action: 'addNote', success: false, message: 'Vendor ID and note text are required.' });
		}
		if (!locals.user?.id) { throw error(401, 'Unauthorized'); }

		try {
			const [result] = await pool.execute(
				'INSERT INTO vendor_notes (vendor_id, note, user_id, created_at) VALUES (?, ?, ?, NOW())',
				[parseInt(vendor_id), note, locals.user.id]
			);
            const insertId = (result as any).insertId;
            const [newNoteResult] = await pool.execute<VendorNote[]>(`
                SELECT vn.id, vn.vendor_id, vn.note, vn.user_id, vn.created_at, u.full_name as user_full_name
                FROM vendor_notes vn
                JOIN users u ON vn.user_id = u.id
                WHERE vn.id = ?
            `, [insertId]);
			return { action: 'addNote', success: true, message: 'Note added.', newNote: newNoteResult[0] };
		} catch (error: any) {
			console.error(`Failed to add note for vendor ${vendor_id}: ${error.message}`, error.stack);
			return fail(500, { action: 'addNote', success: false, message: `Failed to add note. Error: ${error.message}` });
		}
	},

    deleteNote: async ({ request, locals }) => {
        checkPermission(locals, 'delete vendor notes');
		const data = await request.formData();
		const note_id = data.get('note_id')?.toString();
        const vendor_id = data.get('vendor_id')?.toString();

		if (!note_id || !vendor_id) {
			return fail(400, { action: 'deleteNote', success: false, message: 'Note ID and Vendor ID are required.' });
		}
        if (!locals.user?.id) { throw error(401, 'Unauthorized'); }

        try {
            const [result] = await pool.execute('DELETE FROM vendor_notes WHERE id = ?', [note_id]);
            if ((result as any).affectedRows === 0) {
                 return fail(404, { action: 'deleteNote', success: false, message: 'Note not found.' });
            }
			return { action: 'deleteNote', success: true, message: 'Note deleted.', deletedNoteId: parseInt(note_id) };
		} catch (error: any) {
			console.error(`Failed to delete note ID ${note_id}: ${error.message}`, error.stack);
			return fail(500, { action: 'deleteNote', success: false, message: `Failed to delete note. Error: ${error.message}` });
		}
	}
};