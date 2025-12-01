import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		const [rows] = await pool.query<any[]>(
			`
            SELECT q.*, 
                   c.name as customer_name, c.address as customer_address, c.tax_id as customer_tax_id,
                   u.full_name as created_by_name
            FROM quotations q
            LEFT JOIN customers c ON q.customer_id = c.id
            LEFT JOIN users u ON q.created_by_user_id = u.id
            WHERE q.id = ?
        `,
			[id]
		);

		if (rows.length === 0) throw error(404, 'Quotation not found');
		const quotation = rows[0];

		const [items] = await pool.query<any[]>(
			`
            SELECT qi.*, u.symbol as unit_symbol
            FROM quotation_items qi
            LEFT JOIN units u ON qi.unit_id = u.id
            WHERE qi.quotation_id = ?
            ORDER BY qi.item_order ASC
        `,
			[id]
		);

		const [attachments] = await pool.query<any[]>(
			`
            SELECT * FROM quotation_attachments WHERE quotation_id = ?
        `,
			[id]
		);

		const attachmentsWithUrl = attachments.map((f: any) => ({
			...f,
			url: `/uploads/quotations/${f.file_system_name}`
		}));

		const [companyRows] = await pool.query<any[]>(`SELECT * FROM company LIMIT 1`);

		return {
			quotation: JSON.parse(JSON.stringify(quotation)),
			items: JSON.parse(JSON.stringify(items)),
			attachments: JSON.parse(JSON.stringify(attachmentsWithUrl)),
			company: companyRows.length > 0 ? JSON.parse(JSON.stringify(companyRows[0])) : null,
			availableStatuses: ['Draft', 'Sent', 'Accepted', 'Rejected', 'Invoiced']
		};
	} catch (err: any) {
		console.error('Error loading quotation:', err);
		throw error(500, err.message);
	}
};

export const actions: Actions = {
	updateStatus: async ({ request, params }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();
		const status = formData.get('status')?.toString();

		if (!id || !status) return fail(400, { message: 'Invalid data' });

		try {
			await pool.execute('UPDATE quotations SET status = ? WHERE id = ?', [status, id]);
			return { success: true };
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
	}
};
