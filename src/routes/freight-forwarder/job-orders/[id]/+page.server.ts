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
        // ทำการ JOIN ตาราง vendors เพื่อเอาชื่อและบริษัทมาแสดงในคอลัมน์ Paid To
		const [expenses] = await pool.query<RowDataPacket[]>(
			`
			SELECT e.*, i.item_name, c.category_name, v.company_name as vendor_company_name, v.name as vendor_name
			FROM job_expenses e
			JOIN expense_items i ON e.expense_item_id = i.id
			JOIN expense_categories c ON i.expense_category_id = c.id
            LEFT JOIN vendors v ON e.vendor_id = v.id
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
        
        // 6. ดึงรายชื่อ Vendor ทั้งหมดส่งไปให้ฟอร์ม Paid To
        const [vendors] = await pool.query<RowDataPacket[]>(
			'SELECT id, name, company_name FROM vendors ORDER BY name ASC'
		);

		return {
			job: JSON.parse(JSON.stringify(job)),
			company: companyRows.length > 0 ? JSON.parse(JSON.stringify(companyRows[0])) : null,
			attachments: JSON.parse(JSON.stringify(attachmentsWithUrl)),
			expenses: JSON.parse(JSON.stringify(expenses)),
			salesDocuments: JSON.parse(JSON.stringify(salesDocs)),
			expenseCategories: JSON.parse(JSON.stringify(expenseCategories)),
			expenseItems: JSON.parse(JSON.stringify(expenseItems)),
            vendors: JSON.parse(JSON.stringify(vendors)),
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

	// เพิ่มค่าใช้จ่ายแบบหลายรายการ (Multiple Items)
	addExpense: async ({ request, params, locals }) => {
		const job_order_id = parseInt(params.id);
		const formData = await request.formData();
		const created_by = locals.user?.id || null;
		
        // รับค่าชุดข้อมูล JSON ของ Expenses ที่ส่งมาจาก Client
		const expensesDataStr = formData.get('expenses_data')?.toString();
        
        if (!expensesDataStr) {
            return fail(400, { message: 'ไม่พบข้อมูลค่าใช้จ่าย' });
        }

        let entries;
        try {
            entries = JSON.parse(expensesDataStr);
        } catch {
            return fail(400, { message: 'รูปแบบข้อมูลไม่ถูกต้อง' });
        }

        if (!Array.isArray(entries) || entries.length === 0) {
            return fail(400, { message: 'กรุณาระบุรายการค่าใช้จ่ายอย่างน้อย 1 รายการ' });
        }

        const connection = await pool.getConnection();

		try {
            // ใช้ Transaction เพื่อให้แน่ใจว่าบันทึกผ่านทั้งหมดหรือยกเลิกทั้งหมด
            await connection.beginTransaction();

            for (const entry of entries) {
                // ดึงค่า Item ID และ Vendor ID จาก Object ที่ได้จาก svelte-select
                const expense_item_id = entry.selectedItem?.value;
                const vendor_id = entry.selectedVendor?.value || null; // Paid To
                
                const ref_document = entry.refDoc?.toString().trim() || null;
                const price = parseFloat(entry.price?.toString() || '0');
                const qty = parseFloat(entry.qty?.toString() || '1');
                const remarks = entry.remarks?.toString().trim() || null;

                const has_vat = entry.hasVat === true;
                const wht_rate = entry.whtRate?.toString() || 'None';

                if (!expense_item_id || isNaN(price) || price < 0 || isNaN(qty) || qty <= 0) {
                    throw new Error('กรุณาระบุรายการค่าใช้จ่ายและราคา/จำนวน ให้ครบถ้วนถูกต้อง');
                }

                // คำนวณยอดเงินฝั่ง Server เพื่อป้องกันการปลอมแปลงค่า
                const amount = price * qty;
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

                // บันทึกรายการลงฐานข้อมูล (มี vendor_id)
                await connection.execute(
                    `INSERT INTO job_expenses 
                    (job_order_id, expense_item_id, vendor_id, ref_document, price, qty, amount, tax_type, vat_amount, wht_amount, total_amount, remarks, created_by) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [job_order_id, expense_item_id, vendor_id, ref_document, price, qty, amount, tax_type_str, vat_amount, wht_amount, total_amount, remarks, created_by]
                );
            }

			 // อัปเดตสถานะของ Job Order เป็น 'In Progress' ทันทีที่มีการเพิ่มค่าใช้จ่าย
            await connection.execute(
                `UPDATE job_orders SET job_status = 'In Progress', updated_at = NOW() WHERE id = ?`,
                [job_order_id]
            );
			
            await connection.commit();
			return { success: true, action: 'addExpense' };
		} catch (err: unknown) {
            await connection.rollback();
			console.error('Add expense error:', err);
			return fail(500, { message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกค่าใช้จ่าย' });
		} finally {
            connection.release();
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