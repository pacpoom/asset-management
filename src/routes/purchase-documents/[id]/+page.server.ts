import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		// ดึงข้อมูลเอกสารจัดซื้อ (Join กับ vendors และ job_orders)
		const [rows] = await pool.query<any[]>(
			`
            SELECT pd.*, 
                   v.name as vendor_name, v.address as vendor_address, v.tax_id as vendor_tax_id,
                   u.full_name as created_by_name,
                   j.job_number
            FROM purchase_documents pd
            LEFT JOIN vendors v ON pd.vendor_id = v.id
            LEFT JOIN users u ON pd.created_by_user_id = u.id
            LEFT JOIN job_orders j ON pd.job_id = j.id
            WHERE pd.id = ?
        `,
			[id]
		);

		if (rows.length === 0) throw error(404, 'Purchase Document not found');
		const document = rows[0];

		// ดึงรายการสินค้า
		const [items] = await pool.query<any[]>(
			`
            SELECT pdi.*, u.symbol as unit_symbol
            FROM purchase_document_items pdi
            LEFT JOIN units u ON pdi.unit_id = u.id
            WHERE pdi.document_id = ?
            ORDER BY pdi.item_order ASC
        `,
			[id]
		);

		// ดึงไฟล์แนบ
		const [attachments] = await pool.query<any[]>(
			`
            SELECT * FROM purchase_document_attachments WHERE document_id = ?
        `,
			[id]
		);

		const attachmentsWithUrl = attachments.map((f: any) => ({
			...f,
			url: `/uploads/purchase_documents/${f.file_system_name}`
		}));

		// ดึงข้อมูลบริษัทของเรา
		const [companyRows] = await pool.query<any[]>(`SELECT * FROM company LIMIT 1`);

		return {
			document: JSON.parse(JSON.stringify(document)),
			items: JSON.parse(JSON.stringify(items)),
			attachments: JSON.parse(JSON.stringify(attachmentsWithUrl)),
			company: companyRows.length > 0 ? JSON.parse(JSON.stringify(companyRows[0])) : null,
			availableStatuses: ['Draft', 'Sent', 'Received', 'Paid', 'Overdue', 'Void']
		};
	} catch (err: any) {
		console.error('Error loading purchase document:', err);
		throw error(500, err.message);
	}
};

// เปลี่ยนสถานะเอกสาร
export const actions: Actions = {
	updateStatus: async ({ request, params }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();
		const status = formData.get('status')?.toString();

		if (!id || !status) return fail(400, { message: 'Invalid data' });

		try {
			await pool.execute('UPDATE purchase_documents SET status = ? WHERE id = ?', [status, id]);
			return { success: true };
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
	}
};