import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		//ดึงข้อมูลเอกสาร (Join job_orders เพื่อนำข้อมูล Job มาแสดง)
		const [rows] = await pool.query<any[]>(
			`
            SELECT sd.*, 
                   c.name as customer_name, c.address as customer_address, c.tax_id as customer_tax_id,
                   u.full_name as created_by_name,
                   jo.job_type as jo_job_type, jo.bl_number as jo_bl_number
            FROM sales_documents sd
            LEFT JOIN customers c ON sd.customer_id = c.id
            LEFT JOIN users u ON sd.created_by_user_id = u.id
            LEFT JOIN job_orders jo ON sd.job_order_id = jo.id
            WHERE sd.id = ?
        `,
			[id]
		);

		if (rows.length === 0) throw error(404, 'Document not found');
		const document = rows[0];

		//ดึงรายการสินค้า
		const [items] = await pool.query<any[]>(
			`
            SELECT sdi.*, u.symbol as unit_symbol
            FROM sales_document_items sdi
            LEFT JOIN units u ON sdi.unit_id = u.id
            WHERE sdi.document_id = ?
            ORDER BY sdi.item_order ASC
        `,
			[id]
		);

		//ดึงไฟล์แนบ
		const [attachments] = await pool.query<any[]>(
			`
            SELECT * FROM sales_document_attachments WHERE document_id = ?
        `,
			[id]
		);

		const attachmentsWithUrl = attachments.map((f: any) => ({
			...f,
			url: `/uploads/sales_documents/${f.file_system_name}`
		}));

		//ดึงข้อมูลบริษัท
		const [companyRows] = await pool.query<any[]>(`SELECT * FROM company LIMIT 1`);

		return {
			document: JSON.parse(JSON.stringify(document)),
			items: JSON.parse(JSON.stringify(items)),
			attachments: JSON.parse(JSON.stringify(attachmentsWithUrl)),
			company: companyRows.length > 0 ? JSON.parse(JSON.stringify(companyRows[0])) : null,
			availableStatuses: ['Draft', 'Sent', 'Paid', 'Overdue', 'Void']
		};
	} catch (err: any) {
		console.error('Error loading document:', err);
		throw error(500, err.message);
	}
};

//เปลี่ยนสถานะ
export const actions: Actions = {
	updateStatus: async ({ request, params }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();
		const status = formData.get('status')?.toString();

		if (!id || !status) return fail(400, { message: 'Invalid data' });

		try {
			await pool.execute('UPDATE sales_documents SET status = ? WHERE id = ?', [status, id]);
			return { success: true };
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
	}
};