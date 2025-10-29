import { fail, error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';

// --- File Handling Helpers (Reused from +page.server.ts) ---
const UPLOAD_DIR = path.resolve('uploads', 'bill_payments');

async function deleteFile(systemName: string | null | undefined) {
	if (!systemName) return;
	try {
		const fullPath = path.join(UPLOAD_DIR, path.basename(systemName));
        console.log(`deleteFile (Bill Payment): Attempting delete ${fullPath}`);
		await fs.unlink(fullPath);
        console.log(`deleteFile (Bill Payment): Successfully deleted ${fullPath}`);
	} catch (error: any) {
		if (error.code !== 'ENOENT') {
			console.error(`deleteFile (Bill Payment): Failed ${systemName}. ${error.message}`, error.stack);
		} else {
             console.log(`deleteFile (Bill Payment): Not found, skipping ${systemName}`);
        }
	}
}


// --- Types (Simplified/Reused) ---
interface BillPaymentDetailHeader extends RowDataPacket {
    id: number;
    payment_reference: string | null;
    payment_date: string;
    total_amount: number;
    status: 'Draft' | 'Submitted' | 'Paid' | 'Void';
    vendor_name: string;
    prepared_by_user_name: string;
    vendor_contract_id: number | null;
    vendor_contract_number: string | null;
    notes: string | null;
    subtotal: number;
    discount_amount: number;
    total_after_discount: number;
    withholding_tax_rate: number | null;
    withholding_tax_amount: number;
    vendor_id: number; // Added for dropdown/edit logic
}

interface BillPaymentItemRow extends RowDataPacket {
    id: number; // Important for delete/edit actions
    product_name: string;
    product_sku: string;
    unit_symbol: string;
    description: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
    product_id: number;
    unit_id: number;
}

interface BillPaymentAttachmentRow extends RowDataPacket {
    id: number;
    file_original_name: string;
    file_system_name: string;
    file_path: string; // Relative path
    uploaded_at: string;
}

interface Vendor extends RowDataPacket { id: number; name: string; }
interface Unit extends RowDataPacket { id: number; name: string; symbol: string; }
interface Product extends RowDataPacket { id: number; sku: string; name: string; unit_id: number; purchase_cost: number | null; }
interface VendorContract extends RowDataPacket { id: number; title: string; vendor_id: number; contract_number: string; }


// --- Load Function (Fetch full details) ---
export const load: PageServerLoad = async ({ locals, params }) => {
    checkPermission(locals, 'view bill payments');
    const paymentId = parseInt(params.id);

    if (isNaN(paymentId)) {
        throw error(400, 'Invalid Payment ID.');
    }

    try {
        // 1. Fetch Header Details
        const [headerRows] = await pool.execute<BillPaymentDetailHeader[]>(
            `SELECT
                bp.*,
                v.name as vendor_name,
                u.full_name as prepared_by_user_name,
                vc.contract_number as vendor_contract_number
            FROM bill_payments bp
            JOIN vendors v ON bp.vendor_id = v.id
            JOIN users u ON bp.prepared_by_user_id = u.id
            LEFT JOIN vendor_contracts vc ON bp.vendor_contract_id = vc.id
            WHERE bp.id = ? LIMIT 1`,
            [paymentId]
        );
        const header = headerRows[0];
        if (!header) {
             throw error(404, `Bill Payment ID ${paymentId} not found.`);
        }
        
        // 2. Fetch Line Items
        const [itemRows] = await pool.execute<BillPaymentItemRow[]>(
            `SELECT
                bpi.id, bpi.description, bpi.quantity, bpi.unit_price, bpi.line_total,
                p.name as product_name, p.sku as product_sku, bpi.product_id,
                u.symbol as unit_symbol, bpi.unit_id
            FROM bill_payment_items bpi
            JOIN products p ON bpi.product_id = p.id
            LEFT JOIN units u ON bpi.unit_id = u.id
            WHERE bpi.bill_payment_id = ?
            ORDER BY bpi.item_order ASC`,
            [paymentId]
        );
        
        // 3. Fetch Attachments
        const [attachmentRows] = await pool.execute<BillPaymentAttachmentRow[]>(
            `SELECT id, file_original_name, file_system_name, uploaded_at
             FROM bill_payment_attachments
             WHERE bill_payment_id = ?
             ORDER BY uploaded_at DESC`,
            [paymentId]
        );
        const attachments = attachmentRows.map(att => ({
            ...att,
            file_path: `/uploads/bill_payments/${att.file_system_name}`
        }));

        // 4. Fetch Supporting Data (for potential inline editing/dropdowns)
        const [vendorRows] = await pool.execute<Vendor[]>('SELECT id, name FROM vendors ORDER BY name ASC');
        const [unitRows] = await pool.execute<Unit[]>('SELECT id, name, symbol FROM units ORDER BY name ASC');
        const [productRows] = await pool.execute<Product[]>(
             `SELECT id, sku, name, unit_id, purchase_cost FROM products WHERE is_active = 1 ORDER BY sku ASC`
        );
         const [contractRows] = await pool.execute<VendorContract[]>(
             `SELECT id, title, vendor_id, contract_number FROM vendor_contracts WHERE status = 'Active' ORDER BY title ASC`
        );
        
        // --- Return Combined Data ---
        return {
            payment: JSON.parse(JSON.stringify(header)),
            items: JSON.parse(JSON.stringify(itemRows)),
            attachments: JSON.parse(JSON.stringify(attachments)),
            // Supporting data
            vendors: vendorRows,
            units: unitRows,
            products: productRows,
            contracts: contractRows,
            availableStatuses: ['Draft', 'Submitted', 'Paid', 'Void']
        };
    } catch (err: any) {
        console.error(`Failed to load bill payment detail ${paymentId}: ${err.message}`, err.stack);
        if (err.status) throw err;
        throw error(500, `Failed to load payment detail. Error: ${err.message}`);
    }
};

// --- Actions (Re-implementing the necessary list actions here) ---
export const actions: Actions = {
    
    // 1. Update Payment Status (Moved from +page.server.ts)
    updatePaymentStatus: async ({ request, locals, params }) => {
        checkPermission(locals, 'manage bill payments'); 
        const paymentId = parseInt(params.id);
        const data = await request.formData();
        const status = data.get('status')?.toString() as BillPaymentDetailHeader['status'];

        if (isNaN(paymentId) || !status || !['Draft', 'Submitted', 'Paid', 'Void'].includes(status)) {
            return fail(400, { success: false, message: 'Invalid ID or status.' });
        }
        
        try {
             await pool.execute('UPDATE bill_payments SET status = ? WHERE id = ?', [status, paymentId]);
             return { action: 'updatePaymentStatus', success: true, message: `Payment #${paymentId} status updated to ${status}.`, newStatus: status };
        } catch (err: any) {
             console.error(`Error updating payment status ${paymentId}: ${err.message}`, err.stack);
             return fail(500, { success: false, message: 'Failed to update payment status.' });
        }
    },
    
    // 2. Delete Payment (Moved from +page.server.ts)
    deletePayment: async ({ locals, params }) => {
        checkPermission(locals, 'delete bill payments');
        const paymentId = parseInt(params.id);

        if (isNaN(paymentId)) {
            return fail(400, { action: 'deletePayment', success: false, message: 'Invalid payment ID.' });
        }
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            const [docsToDelete] = await connection.query<BillPaymentAttachmentRow[]>(
                'SELECT file_system_name FROM bill_payment_attachments WHERE bill_payment_id = ?',
                [paymentId]
            );

            const [deleteResult] = await connection.execute('DELETE FROM bill_payments WHERE id = ?', [paymentId]);

            if ((deleteResult as any).affectedRows === 0) {
                 await connection.rollback();
                 return fail(404, { action: 'deletePayment', success: false, message: 'Payment not found.' });
            }

            await connection.commit();
            
            for (const doc of docsToDelete) {
                await deleteFile(doc.file_system_name);
            }
            
            // Redirect to list page upon successful deletion
            throw redirect(303, '/bill-payments');

        } catch (error: any) {
             await connection.rollback();
             if (error.status === 303) throw error;
             console.error(`Error deleting payment ID ${paymentId}: ${error.message}`, error.stack);
             return fail(500, { action: 'deletePayment', success: false, message: `Failed to delete payment: ${error.message}` });
        } finally {
             connection.release();
        }
    },
    
    // 3. Delete Attachment (Moved from +page.server.ts)
    deleteAttachment: async ({ request, locals }) => {
        checkPermission(locals, 'manage bill payments');
        const data = await request.formData();
        const attachmentId = data.get('attachment_id')?.toString();

        if (!attachmentId) {
            return fail(400, { action: 'deleteAttachment', success: false, message: 'Attachment ID is required.' });
        }
        const id = parseInt(attachmentId);
        let fileSystemNameToDelete: string | null = null;
        
        try {
            const connection = await pool.getConnection();
            await connection.beginTransaction();
            
            const [docRows] = await connection.query<BillPaymentAttachmentRow[]>(
                'SELECT file_system_name FROM bill_payment_attachments WHERE id = ?',
                [id]
            );
            if (docRows.length === 0) {
                 await connection.rollback();
                 return fail(404, { action: 'deleteAttachment', success: false, message: 'Attachment not found.' });
            }
            fileSystemNameToDelete = docRows[0].file_system_name;
            
            await connection.execute('DELETE FROM bill_payment_attachments WHERE id = ?', [id]);
            
            await connection.commit();
            
            await deleteFile(fileSystemNameToDelete);

            return { action: 'deleteAttachment', success: true, message: 'Attachment deleted successfully.', deletedAttachmentId: id };

        } catch (err: any) {
            console.error(`Error deleting attachment ${id}: ${err.message}`, err.stack);
            return fail(500, { action: 'deleteAttachment', success: false, message: `Failed to delete attachment: ${err.message}` });
        }
    }
};
