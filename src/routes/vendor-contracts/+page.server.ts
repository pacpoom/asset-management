import { fail, redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth'; // Assuming permission checks are needed
import type { RowDataPacket } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

// --- Types ---
// ... existing interface definitions ...
interface VendorContract extends RowDataPacket {
	id: number;
	title: string;
	contract_number: string | null;
	vendor_id: number;
	contract_type_id: number | null;
	status: string;
	start_date: string | null;
	end_date: string | null;
	contract_value: number | null;
	owner_user_id: number | null;
	renewal_notice_days: number | null;
	created_at: string;
	updated_at: string;
	// Joined fields
	vendor_name?: string;
	owner_name?: string;
	type_name?: string;
	documents: VendorContractDocument[]; // Array to hold documents
}

interface VendorContractDocument extends RowDataPacket {
	id: number;
	vendor_contract_id: number;
	file_original_name: string;
	file_system_name: string; // Unique name stored on server
	file_mime_type: string | null;
	file_size_bytes: number | null;
	uploaded_by_user_id: number;
	version: number;
	uploaded_at: string;
    // For client-side display, add the relative path
    file_path?: string;
}

interface Vendor extends RowDataPacket {
	id: number;
	name: string;
}

interface User extends RowDataPacket {
	id: number;
	full_name: string; // Assuming 'full_name' exists in users table
}

interface ContractType extends RowDataPacket {
	id: number;
	name: string;
}


// --- File Handling Helpers ---
// ... existing file handling helpers ...
const UPLOAD_DIR = path.resolve('uploads', 'vendor_contracts'); // Specific directory

async function ensureUploadDir() {
	try {
		await fs.mkdir(UPLOAD_DIR, { recursive: true });
	} catch (e) {
		console.error('Failed to create upload directory:', UPLOAD_DIR, e);
		throw new Error('Failed to create upload directory');
	}
}

// Helper: Save a single file and return its details or null
async function saveFile(file: File): Promise<{ systemName: string; originalName: string; mimeType: string | null; size: number } | null> {
    if (!file || file.size === 0) return null;
    let uploadPath = '';
    try {
        await ensureUploadDir();
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const systemName = `${uniqueSuffix}-${sanitizedOriginalName}`;
        uploadPath = path.join(UPLOAD_DIR, systemName);

        console.log(`saveFile (Vendor Contract): Attempting write to ${uploadPath}`);
        await fs.writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));
        console.log(`saveFile (Vendor Contract): Successfully wrote ${uploadPath}`);

        const mimeType = mime.lookup(file.name) || file.type || 'application/octet-stream';
        return { systemName, originalName: file.name, mimeType, size: file.size };

    } catch (uploadError: any) {
        console.error(`saveFile (Vendor Contract): Error saving ${uploadPath}. ${uploadError.message}`, uploadError.stack);
        if (uploadPath) { try { if (await fs.stat(uploadPath)) await fs.unlink(uploadPath); } catch (e) {} }
        throw new Error(`Failed to save uploaded file "${file.name}". Reason: ${uploadError.message}`);
    }
}

// Helper: Delete a file based on its system name
async function deleteFile(systemName: string | null | undefined) {
	if (!systemName) return;
	try {
		const fullPath = path.join(UPLOAD_DIR, path.basename(systemName)); // Ensure basename for safety
        console.log(`deleteFile (Vendor Contract): Attempting delete ${fullPath}`);
		await fs.unlink(fullPath);
        console.log(`deleteFile (Vendor Contract): Successfully deleted ${fullPath}`);
	} catch (error: any) {
		if (error.code !== 'ENOENT') {
			console.error(`deleteFile (Vendor Contract): Failed ${systemName}. ${error.message}`, error.stack);
            // Don't throw, just log, maybe the file was already deleted
		} else {
             console.log(`deleteFile (Vendor Contract): Not found, skipping ${systemName}`);
        }
	}
}

// Helper: Get documents for a contract
async function getContractDocuments(contractId: number, connection?: any): Promise<VendorContractDocument[]> {
    const db = connection || pool; // Use transaction connection if provided
	const [documents] = await db.query<VendorContractDocument[]>(
		`SELECT id, vendor_contract_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id, version, uploaded_at
         FROM vendor_contract_documents
         WHERE vendor_contract_id = ?
         ORDER BY version DESC, uploaded_at DESC`,
		[contractId]
	);
    // Add relative file path for client-side links
    return documents.map(doc => ({
        ...doc,
        file_path: `/uploads/vendor_contracts/${doc.file_system_name}` // Construct path
    }));
}

// Helper: Convert empty strings/nullish values to null for DB insertion/update
function nullIfEmpty(value: FormDataEntryValue | null | undefined): string | number | null {
    if (value === '' || value === null || value === undefined || value === 'null') {
        return null;
    }
    // Attempt to parse as number if it looks like one, otherwise return string
    const num = Number(value);
    // Check if the original string representation ends with '.' or includes 'e'/'E' before declaring NaN
    const stringValue = value.toString();
    if (isNaN(num) || stringValue.endsWith('.') || stringValue.toLowerCase().includes('e')) {
        return stringValue; // Return as string if not a simple number
    }
    return num; // Return as number
}


// --- Load Function ---
// ... existing load function ...
export const load: PageServerLoad = async ({ locals, url }) => {
	checkPermission(locals, 'view vendor contracts'); // Adjust permission name

    const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
    const filterStatus = url.searchParams.get('status') || '';
    const filterVendor = url.searchParams.get('vendor') || '';
	const pageSize = 15;
	const offset = (page - 1) * pageSize;

	try {
        const baseQuery = `
            SELECT
                vc.id, vc.title, vc.contract_number, vc.vendor_id, vc.contract_type_id,
                vc.status, vc.start_date, vc.end_date, vc.contract_value, vc.owner_user_id,
                vc.renewal_notice_days, vc.created_at, vc.updated_at,
                v.name as vendor_name,
                u.full_name as owner_name,
                ct.name as type_name
            FROM vendor_contracts vc
            LEFT JOIN vendors v ON vc.vendor_id = v.id
            LEFT JOIN users u ON vc.owner_user_id = u.id
            LEFT JOIN contract_types ct ON vc.contract_type_id = ct.id
        `;
        const countQueryBase = `
            SELECT COUNT(vc.id) as total
            FROM vendor_contracts vc
            LEFT JOIN vendors v ON vc.vendor_id = v.id
            LEFT JOIN users u ON vc.owner_user_id = u.id
            LEFT JOIN contract_types ct ON vc.contract_type_id = ct.id
        `;

		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

        // Apply filters
		if (searchQuery) {
			whereClause += ` AND (
                vc.title LIKE ? OR
                vc.contract_number LIKE ? OR
                v.name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm);
		}
        if (filterStatus) {
            whereClause += ` AND vc.status = ? `;
            params.push(filterStatus);
        }
        if (filterVendor) {
            whereClause += ` AND vc.vendor_id = ? `;
            params.push(parseInt(filterVendor));
        }

		// Get total count with filters
		const [countResult] = await pool.execute<any[]>(countQueryBase + whereClause, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		// Fetch contracts for the current page with filters and pagination
		const fetchSql = `${baseQuery} ${whereClause} ORDER BY vc.created_at DESC LIMIT ? OFFSET ?`;
		const fetchParams = [...params, pageSize, offset];
        // Use query for potentially varying placeholders
		const [contractRows] = await pool.query<VendorContract[]>(fetchSql, fetchParams);

		// Fetch all documents for all contracts on the current page efficiently
        const contractIds = contractRows.map(c => c.id);
        let allDocuments: VendorContractDocument[] = [];
        if (contractIds.length > 0) {
            // Use query with IN clause
            const [docRows] = await pool.query<VendorContractDocument[]>(
                `SELECT id, vendor_contract_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id, version, uploaded_at
                 FROM vendor_contract_documents
                 WHERE vendor_contract_id IN (?)
                 ORDER BY vendor_contract_id, version DESC, uploaded_at DESC`,
                 [contractIds] // Pass array directly for IN clause with mysql2
            );
            allDocuments = docRows.map(doc => ({
                ...doc,
                file_path: `/uploads/vendor_contracts/${doc.file_system_name}`
            }));
        }

        // Group documents by contract ID
        const docsMap = new Map<number, VendorContractDocument[]>();
        allDocuments.forEach(doc => {
            const list = docsMap.get(doc.vendor_contract_id) || [];
            list.push(doc);
            docsMap.set(doc.vendor_contract_id, list);
        });

        // Attach documents to contracts
        const contractsWithDocs = contractRows.map(contract => ({
            ...contract,
            // Format dates for display consistency (optional, can be done client-side)
            start_date: contract.start_date ? new Date(contract.start_date).toISOString().split('T')[0] : null,
            end_date: contract.end_date ? new Date(contract.end_date).toISOString().split('T')[0] : null,
            documents: docsMap.get(contract.id) || []
        }));

		// Fetch related data for dropdowns
		const [vendors] = await pool.execute<Vendor[]>('SELECT id, name FROM vendors ORDER BY name ASC');
		const [users] = await pool.execute<User[]>('SELECT id, full_name FROM users ORDER BY full_name ASC'); // Use full_name
		const [contractTypes] = await pool.execute<ContractType[]>('SELECT id, name FROM contract_types ORDER BY name ASC');

		return {
			contracts: contractsWithDocs,
			vendors,
			users,
			contractTypes,
			currentPage: page,
			totalPages,
			searchQuery,
            filters: { status: filterStatus, vendor: filterVendor } // Pass filters back
		};
	} catch (err: any) {
		console.error('Failed to load vendor contracts data:', err.message, err.stack);
		throw error(500, `Failed to load data. Error: ${err.message}`);
	}
};


// --- Actions ---
export const actions: Actions = {
	/**
	 * Save (Add or Edit) Vendor Contract
	 */
	saveContract: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString();
        const files = formData.getAll('contractFiles') as File[]; // Multiple files
        const userId = locals.user?.id;

        if (!userId) throw error(401, 'Unauthorized');

        // Determine permission based on add/edit
		const requiredPermission = id ? 'edit vendor contracts' : 'create vendor contracts';
		checkPermission(locals, requiredPermission);

        // --- Extract Contract Data ---
		const data = {
			title: formData.get('title')?.toString().trim(),
			contract_number: nullIfEmpty(formData.get('contract_number')),
			vendor_id: nullIfEmpty(formData.get('vendor_id')),
			contract_type_id: nullIfEmpty(formData.get('contract_type_id')),
			status: formData.get('status')?.toString() || 'Draft',
			start_date: nullIfEmpty(formData.get('start_date')),
			end_date: nullIfEmpty(formData.get('end_date')),
			contract_value: nullIfEmpty(formData.get('contract_value')),
			owner_user_id: nullIfEmpty(formData.get('owner_user_id')),
            renewal_notice_days: nullIfEmpty(formData.get('renewal_notice_days')) ?? 30, // Default 30
		};

        // --- Validation ---
        if (!data.title || !data.vendor_id) {
            return fail(400, { action: 'saveContract', success: false, message: 'Title and Vendor are required.' });
        }
        // Basic file check for 'add' mode
        const validFiles = files.filter(f => f && f.size > 0);
        if (!id && validFiles.length === 0) {
             return fail(400, { action: 'saveContract', success: false, message: 'At least one document file is required for new contracts.' });
        }

        const connection = await pool.getConnection();
        const savedFileInfos: { systemName: string; originalName: string; mimeType: string | null; size: number }[] = [];
        let contractId: number | null = id ? parseInt(id) : null;

        try {
             await connection.beginTransaction();

             // --- Save Contract Details ---
             if (contractId) { // UPDATE
                const sql = `UPDATE vendor_contracts SET
                    title = ?, contract_number = ?, vendor_id = ?, contract_type_id = ?, status = ?,
                    start_date = ?, end_date = ?, contract_value = ?, owner_user_id = ?, renewal_notice_days = ?
                    WHERE id = ?`;
                await connection.execute(sql, [
                    data.title, data.contract_number, data.vendor_id, data.contract_type_id, data.status,
                    data.start_date, data.end_date, data.contract_value, data.owner_user_id, data.renewal_notice_days,
                    contractId
                ]);
             } else { // INSERT
                 const sql = `INSERT INTO vendor_contracts
                    (title, contract_number, vendor_id, contract_type_id, status, start_date, end_date,
                     contract_value, owner_user_id, renewal_notice_days)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                 const [result] = await connection.execute<any>(sql, [
                    data.title, data.contract_number, data.vendor_id, data.contract_type_id, data.status,
                    data.start_date, data.end_date, data.contract_value, data.owner_user_id, data.renewal_notice_days
                 ]);
                 contractId = result.insertId;
             }

             if (!contractId) throw new Error("Failed to get contract ID.");

             // --- Handle File Uploads ---
             if (validFiles.length > 0) {
                 // Get the latest version number for this contract
                 const [versionRows] = await connection.query<RowDataPacket[]>(
					'SELECT MAX(version) as max_version FROM vendor_contract_documents WHERE vendor_contract_id = ?',
					[contractId]
				);
				let nextVersion = (versionRows[0]?.max_version || 0) + 1;

                const docSql = `INSERT INTO vendor_contract_documents
                    (vendor_contract_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id, version)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`;

                 for (const file of validFiles) {
                    const fileInfo = await saveFile(file); // Save file to disk
                    if (fileInfo) {
                        savedFileInfos.push(fileInfo); // Keep track for potential rollback
                        await connection.execute(docSql, [
                            contractId,
                            fileInfo.originalName,
                            fileInfo.systemName,
                            fileInfo.mimeType,
                            fileInfo.size,
                            userId,
                            nextVersion++ // Increment version for each new file in this batch
                        ]);
                    }
                 }
             }

             await connection.commit();

             // Fetch the newly saved/updated contract with documents to return
             // Use baseQuery which is defined in the load function scope (accessible here)
             const baseQuery = `
                SELECT
                    vc.id, vc.title, vc.contract_number, vc.vendor_id, vc.contract_type_id,
                    vc.status, vc.start_date, vc.end_date, vc.contract_value, vc.owner_user_id,
                    vc.renewal_notice_days, vc.created_at, vc.updated_at,
                    v.name as vendor_name,
                    u.full_name as owner_name,
                    ct.name as type_name
                FROM vendor_contracts vc
                LEFT JOIN vendors v ON vc.vendor_id = v.id
                LEFT JOIN users u ON vc.owner_user_id = u.id
                LEFT JOIN contract_types ct ON vc.contract_type_id = ct.id
            `;
             const [finalContractRows] = await pool.query<VendorContract[]>(
                `${baseQuery} WHERE vc.id = ?`,
                [contractId]
             );
             let finalContract = finalContractRows[0];
             finalContract.documents = await getContractDocuments(contractId); // Get updated doc list

             return {
                action: 'saveContract',
                success: true,
                message: `Contract '${data.title}' saved successfully!`,
                // Return the full contract data for potential UI update
                savedContract: JSON.parse(JSON.stringify(finalContract)) // Deep copy/serialize
             };

        } catch (err: any) {
            await connection.rollback();
            console.error(`Database error saving vendor contract (ID: ${contractId}): ${err.message}`, err.stack);
            // Clean up any files saved during this failed transaction
            for (const fileInfo of savedFileInfos) {
                await deleteFile(fileInfo.systemName);
            }
            // --- MODIFICATION START ---
            // Check specifically for the contract_number duplicate error
            if (err.code === 'ER_DUP_ENTRY' && err.message.includes("'vendor_contracts.contract_number'")) {
                 return fail(409, { action: 'saveContract', success: false, message: 'This Contract Number is already in use. Please enter a unique number.' });
            }
            // --- MODIFICATION END ---
            // Add specific FK error handling if needed
            if (err.code === 'ER_NO_REFERENCED_ROW_2') {
                 return fail(400, { action: 'saveContract', success: false, message: 'Invalid Vendor, User, or Contract Type selected.' });
            }
            return fail(500, { action: 'saveContract', success: false, message: err.message || 'Failed to save contract data.' });
        } finally {
            connection.release();
        }
	},

	// ... existing deleteContract action ...
	deleteContract: async ({ request, locals }) => {
		checkPermission(locals, 'delete vendor contracts');
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) {
			return fail(400, { action: 'deleteContract', success: false, message: 'Invalid contract ID.' });
		}
		const contractId = parseInt(id);
        const connection = await pool.getConnection();

		try {
            await connection.beginTransaction();

            // 1. Get list of files associated with the contract BEFORE deleting the contract
            const [docsToDelete] = await connection.query<VendorContractDocument[]>(
                'SELECT file_system_name FROM vendor_contract_documents WHERE vendor_contract_id = ?',
                [contractId]
            );

            // 2. Delete the contract record (ON DELETE CASCADE should handle documents table)
            const [deleteResult] = await connection.execute('DELETE FROM vendor_contracts WHERE id = ?', [contractId]);

            if ((deleteResult as any).affectedRows === 0) {
                 await connection.rollback(); // Contract not found
                 return fail(404, { action: 'deleteContract', success: false, message: 'Contract not found.' });
            }

            // 3. Commit DB changes
            await connection.commit();

            // 4. Delete associated files from filesystem AFTER successful commit
            for (const doc of docsToDelete) {
                await deleteFile(doc.file_system_name);
            }

			// Use invalidateAll on client-side instead of redirect
            return { action: 'deleteContract', success: true, message: 'Contract deleted successfully.', deletedId: contractId };

		} catch (error: any) {
            await connection.rollback();
			console.error(`Error deleting vendor contract ID ${contractId}: ${error.message}`, error.stack);
            // ER_ROW_IS_REFERENCED_2 might occur if ON DELETE CASCADE is not set or fails
			return fail(500, { action: 'deleteContract', success: false, message: `Failed to delete contract. Error: ${error.message}` });
		} finally {
             connection.release();
        }
	},

    // ... existing uploadDocument action ...
    uploadDocument: async ({ request, locals }) => {
        checkPermission(locals, 'upload vendor contract documents');
        const formData = await request.formData();
        const vendor_contract_id = formData.get('vendor_contract_id')?.toString();
        const documentFile = formData.get('document') as File;
        const userId = locals.user?.id;

        if (!vendor_contract_id || !documentFile || documentFile.size === 0 || !userId) {
            return fail(400, { action: 'uploadDocument', success: false, message: 'Contract ID, document file, and user session are required.' });
        }
        const contractId = parseInt(vendor_contract_id);
        let savedFileInfo: { systemName: string; originalName: string; mimeType: string | null; size: number } | null = null;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Get the latest version number
            const [versionRows] = await connection.query<RowDataPacket[]>(
                'SELECT MAX(version) as max_version FROM vendor_contract_documents WHERE vendor_contract_id = ?',
                [contractId]
            );
            const nextVersion = (versionRows[0]?.max_version || 0) + 1;

            savedFileInfo = await saveFile(documentFile); // Save file
            if (!savedFileInfo) throw new Error('File saving failed.');

            // Insert document record
            await connection.execute(
                `INSERT INTO vendor_contract_documents
                 (vendor_contract_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id, version)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [contractId, savedFileInfo.originalName, savedFileInfo.systemName, savedFileInfo.mimeType, savedFileInfo.size, userId, nextVersion]
            );

            await connection.commit();

            // Fetch the newly added document to return
            const [newDocRows] = await pool.query<VendorContractDocument[]>(
                `SELECT id, vendor_contract_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id, version, uploaded_at
                 FROM vendor_contract_documents
                 WHERE vendor_contract_id = ? AND file_system_name = ?`,
                [contractId, savedFileInfo.systemName]
            );
            const newDocument = newDocRows[0] ? {...newDocRows[0], file_path: `/uploads/vendor_contracts/${newDocRows[0].file_system_name}`} : null;


            return {
                action: 'uploadDocument',
                success: true,
                message: 'Document uploaded successfully.',
                newDocument: newDocument // Return new document data
            };

        } catch (err: any) {
            await connection.rollback();
            console.error(`Error uploading document for contract ${contractId}: ${err.message}`, err.stack);
            if (savedFileInfo) await deleteFile(savedFileInfo.systemName); // Cleanup saved file
            return fail(500, { action: 'uploadDocument', success: false, message: err.message || 'Failed to upload document.' });
        } finally {
            connection.release();
        }
    },

    // ... existing deleteDocument action ...
    deleteDocument: async ({ request, locals }) => {
        checkPermission(locals, 'delete vendor contract documents');
        const formData = await request.formData();
        const document_id = formData.get('document_id')?.toString();

        if (!document_id) {
            return fail(400, { action: 'deleteDocument', success: false, message: 'Invalid document ID.' });
        }
        const documentId = parseInt(document_id);
        const connection = await pool.getConnection();
        let fileSystemNameToDelete: string | null = null;

        try {
            await connection.beginTransaction();

            // Find the document to get the file name
            const [docRows] = await connection.query<VendorContractDocument[]>(
                'SELECT file_system_name FROM vendor_contract_documents WHERE id = ?',
                [documentId]
            );
            if (docRows.length === 0) {
                 await connection.rollback();
                 return fail(404, { action: 'deleteDocument', success: false, message: 'Document not found.' });
            }
            fileSystemNameToDelete = docRows[0].file_system_name;

            // Delete the database record
            await connection.execute('DELETE FROM vendor_contract_documents WHERE id = ?', [documentId]);

            await connection.commit();

            // Delete the file from the filesystem AFTER successful commit
            await deleteFile(fileSystemNameToDelete);

            return {
                action: 'deleteDocument',
                success: true,
                message: 'Document deleted successfully.',
                deletedDocumentId: documentId // Return ID for UI update
            };

        } catch (err: any) {
            await connection.rollback();
            console.error(`Error deleting document ID ${documentId}: ${err.message}`, err.stack);
            return fail(500, { action: 'deleteDocument', success: false, message: `Failed to delete document. Error: ${err.message}` });
        } finally {
            connection.release();
        }
	},
};