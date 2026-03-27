import { error, fail, redirect, isRedirect } from '@sveltejs/kit';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';

export const load = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		// 1. ดึงข้อมูล Job Order
		const [jobs] = await pool.query<RowDataPacket[]>(
			`
			SELECT j.*, 
			       c.name as customer_name, c.company_name, c.address as customer_address, c.tax_id as customer_tax_id,
			       con.contract_number,
                   v.name as vendor_name, v.company_name as vendor_company_name, v.address as vendor_address, v.tax_id as vendor_tax_id,
                   vc.contract_number as vendor_contract_number,
			       u.full_name as created_by_name,
                   un.name as unit_name, un.symbol as unit_symbol
			FROM job_orders j
			LEFT JOIN customers c ON j.customer_id = c.id
			LEFT JOIN contracts con ON j.contract_id = con.id
            LEFT JOIN vendors v ON j.vendor_id = v.id
            LEFT JOIN vendor_contracts vc ON j.vendor_contract_id = vc.id
			LEFT JOIN users u ON j.created_by = u.id
            LEFT JOIN units un ON j.unit_id = un.id
			WHERE j.id = ?
		`,
			[id]
		);

		if (jobs.length === 0) throw redirect(302, '/freight-forwarder/job-orders');
		const job = jobs[0];

		// 2. ดึงข้อมูลบริษัทและไฟล์แนบ
		const [companyRows] = await pool.query<RowDataPacket[]>('SELECT * FROM company LIMIT 1');
		const [attachments] = await pool.query<RowDataPacket[]>(
			'SELECT * FROM job_order_attachments WHERE job_order_id = ? ORDER BY created_at DESC',
			[id]
		);
		const attachmentsWithUrl = attachments.map((f: RowDataPacket) => ({
			...f,
			url: `/uploads/job_orders/${f.file_system_name}`
		}));

		// 3. ดึงข้อมูล Job Expenses (ค่าใช้จ่ายของ Job นี้)
		const [expenses] = await pool.query<RowDataPacket[]>(
			`
			SELECT e.*, i.item_name, c.category_name 
			FROM job_expenses e
			JOIN expense_items i ON e.expense_item_id = i.id
			JOIN expense_categories c ON i.expense_category_id = c.id
			WHERE e.job_order_id = ?
			ORDER BY e.created_at DESC
		`,
			[id]
		);

		// 4. ดึงข้อมูล Sales Documents (เอกสารขายที่เชื่อมกับ Job นี้)
		const [salesDocs] = await pool.query<RowDataPacket[]>(
			`
			SELECT id, document_type, document_number, document_date, total_amount, status , reference_doc
			FROM sales_documents 
			WHERE job_order_id = ? AND status != 'Void'
			ORDER BY document_date DESC, id DESC
			`,
			[id]
		);

		// 5. ดึงข้อมูล Master Data สำหรับฟอร์มเพิ่มค่าใช้จ่าย
		const [expenseCategories] = await pool.query<RowDataPacket[]>(
			'SELECT id, category_name FROM expense_categories WHERE is_active = 1 ORDER BY category_name ASC'
		);
		const [expenseItems] = await pool.query<RowDataPacket[]>(
			'SELECT id, expense_category_id, item_name FROM expense_items WHERE is_active = 1 ORDER BY item_name ASC'
		);

		return {
			job: JSON.parse(JSON.stringify(job)),
			company: companyRows.length > 0 ? JSON.parse(JSON.stringify(companyRows[0])) : null,
			attachments: JSON.parse(JSON.stringify(attachmentsWithUrl)),
			expenses: JSON.parse(JSON.stringify(expenses)),
			salesDocuments: JSON.parse(JSON.stringify(salesDocs)),
			expenseCategories: JSON.parse(JSON.stringify(expenseCategories)),
			expenseItems: JSON.parse(JSON.stringify(expenseItems)),
			availableStatuses: ['Pending', 'In Progress', 'Completed', 'Cancelled']
		};
	} catch (err: unknown) {
		console.error('Error loading job order:', err);
		if (isRedirect(err)) throw err;
		throw error(500, err instanceof Error ? err.message : 'Unknown error');
	}
};

export const actions = {
	updateStatus: async ({ request, params }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();
		const status = formData.get('status')?.toString();

		if (!id || !status) return fail(400, { message: 'Invalid data' });

		try {
			await pool.execute('UPDATE job_orders SET job_status = ?, updated_at = NOW() WHERE id = ?', [
				status,
				id
			]);
			return { success: true };
		} catch (err: unknown) {
			console.error('Update status error:', err);
			return fail(500, { message: err instanceof Error ? err.message : 'Unknown error' });
		}
	},

	// เพิ่มค่าใช้จ่ายใหม่
	addExpense: async ({ request, params, locals }) => {
		const job_order_id = parseInt(params.id);
		const formData = await request.formData();
		
		const expense_item_id = formData.get('expense_item_id');
		const ref_document = formData.get('ref_document')?.toString().trim() || null;
		
		// รับค่า Price และ Qty จากฟอร์ม และคำนวณ Amount ฝั่ง Server
		const price = parseFloat(formData.get('price')?.toString() || '0');
		const qty = parseFloat(formData.get('qty')?.toString() || '1');
		const amount = price * qty;
		
		const remarks = formData.get('remarks')?.toString().trim() || null;
		const created_by = locals.user?.id || null;

		// รับค่า Checkbox VAT และ Select ของ WHT
		const has_vat = formData.get('has_vat') === 'true';
		const wht_rate = formData.get('wht_rate')?.toString() || 'None';

		if (!expense_item_id || isNaN(price) || price < 0 || isNaN(qty) || qty <= 0) {
			return fail(400, { message: 'กรุณาระบุรายการค่าใช้จ่ายและราคา/จำนวนให้ถูกต้อง' });
		}

		// คำนวณยอดเงินตาม VAT และ WH ที่เลือก
		let vat_amount = 0;
		let wht_amount = 0;
		const tax_types: string[] = [];

		if (has_vat) {
			vat_amount = amount * 0.07;
			tax_types.push('VAT 7%');
		}

		if (wht_rate === '3') {
			wht_amount = amount * 0.03;
			tax_types.push('WHT 3%');
		} else if (wht_rate === '1') {
			wht_amount = amount * 0.01;
			tax_types.push('WHT 1%');
		}

		const tax_type_str = tax_types.length > 0 ? tax_types.join(', ') : 'None';
		const total_amount = amount + vat_amount - wht_amount;

		try {
			await pool.execute(
				`INSERT INTO job_expenses 
				(job_order_id, expense_item_id, ref_document, price, qty, amount, tax_type, vat_amount, wht_amount, total_amount, remarks, created_by) 
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[job_order_id, expense_item_id, ref_document, price, qty, amount, tax_type_str, vat_amount, wht_amount, total_amount, remarks, created_by]
			);
			return { success: true, action: 'addExpense' };
		} catch (err: unknown) {
			console.error('Add expense error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกค่าใช้จ่าย' });
		}
	},

	// ลบค่าใช้จ่าย
	deleteExpense: async ({ request }) => {
		const formData = await request.formData();
		const expense_id = formData.get('expense_id');

		if (!expense_id) return fail(400, { message: 'ไม่พบรหัสค่าใช้จ่าย' });

		try {
			await pool.execute('DELETE FROM job_expenses WHERE id = ?', [expense_id]);
			return { success: true, action: 'deleteExpense' };
		} catch (err: unknown) {
			console.error('Delete expense error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการลบค่าใช้จ่าย' });
		}
	}
};