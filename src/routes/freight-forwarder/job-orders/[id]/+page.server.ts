import { error, fail, redirect, isRedirect } from '@sveltejs/kit';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';
import { allocateMonthlySequence } from '$lib/server/monthlyDocumentSequence';

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

		// 7. ดึงข้อมูล Container ของ Job นี้
		// ลอง query ด้วย status/checkout_date ก่อน — fallback ถ้ายังไม่ได้รัน migration
		let containers: RowDataPacket[];
		try {
			const [rows] = await pool.query<RowDataPacket[]>(
				'SELECT id, container_size, container_number, seal_number, remarks, status, checkout_date FROM job_containers WHERE job_order_id = ? ORDER BY container_size ASC, id ASC',
				[id]
			);
			containers = rows;
		} catch {
			const [rows] = await pool.query<RowDataPacket[]>(
				'SELECT id, container_size, container_number, seal_number, remarks FROM job_containers WHERE job_order_id = ? ORDER BY container_size ASC, id ASC',
				[id]
			);
			containers = rows.map(r => ({ ...r, status: 'pending', checkout_date: null }));
		}

		return {
			job: JSON.parse(JSON.stringify(job)),
			company: companyRows.length > 0 ? JSON.parse(JSON.stringify(companyRows[0])) : null,
			attachments: JSON.parse(JSON.stringify(attachmentsWithUrl)),
			expenses: JSON.parse(JSON.stringify(expenses)),
			salesDocuments: JSON.parse(JSON.stringify(salesDocs)),
			expenseCategories: JSON.parse(JSON.stringify(expenseCategories)),
			expenseItems: JSON.parse(JSON.stringify(expenseItems)),
            vendors: JSON.parse(JSON.stringify(vendors)),
			containers: JSON.parse(JSON.stringify(containers)),
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

    // เพิ่ม Master Data ของ Expense Item แบบ On-the-fly
    createExpenseItem: async ({ request }) => {
        const formData = await request.formData();
        const expense_category_id = formData.get('expense_category_id');
        const item_name = formData.get('item_name')?.toString().trim();

        if (!expense_category_id || !item_name) {
            return fail(400, { message: 'กรุณาเลือกหมวดหมู่และระบุชื่อรายการ' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const dateStr = new Date().toISOString().split('T')[0];
            const meta = await allocateMonthlySequence(connection, 'ITE', dateStr, () => 'ITE-');
            const yy = meta.year.toString().slice(-2);
            const runningNo = String(meta.seq).padStart(meta.padding, '0');
            const item_code = `${meta.prefix}${yy}${meta.monthStr}${runningNo}`;

            // บันทึกรายการใหม่
            await connection.execute(
                'INSERT INTO expense_items (expense_category_id, item_code, item_name, is_active) VALUES (?, ?, ?, ?)',
                [expense_category_id, item_code, item_name, 1]
            );

            await connection.commit();
            return { success: true, action: 'createExpenseItem', message: 'เพิ่มรายการสำเร็จ' };
        } catch (err: any) {
            await connection.rollback();
            console.error('Create item error:', err);
            return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล Master Data' });
        } finally {
            connection.release();
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

    // แก้ไขค่าใช้จ่าย
    editExpense: async ({ request }) => {
        const formData = await request.formData();
        const expense_id = formData.get('expense_id');

        if (!expense_id) return fail(400, { message: 'ไม่พบรหัสค่าใช้จ่าย' });

        const expense_item_id = formData.get('expense_item_id');
        const vendor_id = formData.get('vendor_id') || null;
        const ref_document = formData.get('ref_document')?.toString().trim() || null;
        const price = parseFloat(formData.get('price')?.toString() || '0');
        const qty = parseFloat(formData.get('qty')?.toString() || '1');
        const remarks = formData.get('remarks')?.toString().trim() || null;

        const hasVat = formData.get('hasVat') === 'true';
        const whtRate = formData.get('whtRate')?.toString() || 'None';

        if (!expense_item_id || isNaN(price) || price < 0 || isNaN(qty) || qty <= 0) {
            return fail(400, { message: 'กรุณาระบุรายการค่าใช้จ่ายและราคา/จำนวน ให้ครบถ้วนถูกต้อง' });
        }

        const amount = price * qty;
        let vat_amount = 0;
        let wht_amount = 0;
        const tax_types: string[] = [];

        if (hasVat) {
            vat_amount = amount * 0.07;
            tax_types.push('VAT 7%');
        }

        if (whtRate === '3') {
            wht_amount = amount * 0.03;
            tax_types.push('WHT 3%');
        } else if (whtRate === '1') {
            wht_amount = amount * 0.01;
            tax_types.push('WHT 1%');
        }

        const tax_type_str = tax_types.length > 0 ? tax_types.join(', ') : 'None';
        const total_amount = amount + vat_amount - wht_amount;

        try {
            await pool.execute(
                `UPDATE job_expenses 
                SET expense_item_id = ?, vendor_id = ?, ref_document = ?, price = ?, qty = ?, amount = ?, tax_type = ?, vat_amount = ?, wht_amount = ?, total_amount = ?, remarks = ?
                WHERE id = ?`,
                [expense_item_id, vendor_id, ref_document, price, qty, amount, tax_type_str, vat_amount, wht_amount, total_amount, remarks, expense_id]
            );
            return { success: true, action: 'editExpense' };
        } catch (err: unknown) {
            console.error('Edit expense error:', err);
            return fail(500, { message: 'เกิดข้อผิดพลาดในการแก้ไขค่าใช้จ่าย' });
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
	},

	// เพิ่ม Container ใหม่ (manual)
	addContainer: async ({ request, params }) => {
		const job_order_id = parseInt(params.id);
		const formData = await request.formData();
		const container_size = formData.get('container_size')?.toString();

		if (!container_size || !['20', '40'].includes(container_size)) {
			return fail(400, { message: 'กรุณาระบุขนาดตู้ (20 หรือ 40)' });
		}

		try {
			await pool.execute(
				'INSERT INTO job_containers (job_order_id, container_size) VALUES (?, ?)',
				[job_order_id, container_size]
			);
			return { success: true, action: 'addContainer' };
		} catch (err: unknown) {
			console.error('Add container error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการเพิ่มตู้' });
		}
	},

	// แก้ไข Container (เบอร์ตู้ / เบอร์ซีล / remarks)
	updateContainer: async ({ request }) => {
		const formData = await request.formData();
		const container_id = formData.get('container_id');
		const container_number = formData.get('container_number')?.toString().trim() || null;
		const seal_number = formData.get('seal_number')?.toString().trim() || null;
		const remarks = formData.get('remarks')?.toString().trim() || null;

		if (!container_id) return fail(400, { message: 'ไม่พบรหัสตู้' });

		try {
			await pool.execute(
				'UPDATE job_containers SET container_number = ?, seal_number = ?, remarks = ?, updated_at = NOW() WHERE id = ?',
				[container_number, seal_number, remarks, container_id]
			);
			return { success: true, action: 'updateContainer' };
		} catch (err: unknown) {
			console.error('Update container error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลตู้' });
		}
	},

	// ลบ Container
	deleteContainer: async ({ request }) => {
		const formData = await request.formData();
		const container_id = formData.get('container_id');

		if (!container_id) return fail(400, { message: 'ไม่พบรหัสตู้' });

		try {
			await pool.execute('DELETE FROM job_containers WHERE id = ?', [container_id]);
			return { success: true, action: 'deleteContainer' };
		} catch (err: unknown) {
			console.error('Delete container error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการลบตู้' });
		}
	},

	// Checkout ตู้หลายตู้พร้อมกัน
	checkoutContainersBulk: async ({ request }) => {
		const formData = await request.formData();
		const container_ids_str = formData.get('container_ids')?.toString();
		const checkout_date = formData.get('checkout_date')?.toString().trim() || null;

		if (!container_ids_str) return fail(400, { message: 'ไม่พบรายการตู้' });
		if (!checkout_date) return fail(400, { message: 'กรุณาระบุวันที่นำตู้ออก' });

		let ids: number[];
		try {
			ids = JSON.parse(container_ids_str);
			if (!Array.isArray(ids) || ids.length === 0) throw new Error();
		} catch {
			return fail(400, { message: 'รูปแบบรายการตู้ไม่ถูกต้อง' });
		}

		try {
			const placeholders = ids.map(() => '?').join(', ');
			await pool.execute(
				`UPDATE job_containers SET status = 'checked_out', checkout_date = ?, updated_at = NOW() WHERE id IN (${placeholders})`,
				[checkout_date, ...ids]
			);
			return { success: true, action: 'checkoutContainersBulk', count: ids.length };
		} catch (err: unknown) {
			console.error('Bulk checkout error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกวันออกตู้' });
		}
	},

	// บันทึกวันที่นำตู้ออกจากท่าเรือ (Checkout)
	checkoutContainer: async ({ request }) => {
		const formData = await request.formData();
		const container_id = formData.get('container_id');
		const checkout_date = formData.get('checkout_date')?.toString().trim() || null;

		if (!container_id) return fail(400, { message: 'ไม่พบรหัสตู้' });
		if (!checkout_date) return fail(400, { message: 'กรุณาระบุวันที่นำตู้ออก' });

		try {
			await pool.execute(
				"UPDATE job_containers SET status = 'checked_out', checkout_date = ?, updated_at = NOW() WHERE id = ?",
				[checkout_date, container_id]
			);
			return { success: true, action: 'checkoutContainer' };
		} catch (err: unknown) {
			console.error('Checkout container error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกวันออกตู้' });
		}
	},

	// ยกเลิก Checkout (คืนสถานะเป็น pending)
	undoCheckoutContainer: async ({ request }) => {
		const formData = await request.formData();
		const container_id = formData.get('container_id');

		if (!container_id) return fail(400, { message: 'ไม่พบรหัสตู้' });

		try {
			await pool.execute(
				"UPDATE job_containers SET status = 'pending', checkout_date = NULL, updated_at = NOW() WHERE id = ?",
				[container_id]
			);
			return { success: true, action: 'undoCheckoutContainer' };
		} catch (err: unknown) {
			console.error('Undo checkout error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการยกเลิก checkout' });
		}
	},

	// Import containers จาก Excel (แทนที่ข้อมูลทั้งหมด)
	importContainers: async ({ request, params }) => {
		const job_order_id = parseInt(params.id);
		const formData = await request.formData();
		const data_str = formData.get('containers_json')?.toString();

		if (!data_str) return fail(400, { message: 'ไม่พบข้อมูล' });

		let rows: { container_size: string; container_number: string; seal_number: string; remarks: string }[];
		try {
			rows = JSON.parse(data_str);
		} catch {
			return fail(400, { message: 'รูปแบบข้อมูลไม่ถูกต้อง' });
		}

		if (!Array.isArray(rows) || rows.length === 0) {
			return fail(400, { message: 'ไม่พบข้อมูลในไฟล์' });
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();
			await connection.execute('DELETE FROM job_containers WHERE job_order_id = ?', [job_order_id]);
			for (const row of rows) {
				if (!['20', '40'].includes(String(row.container_size))) continue;
				await connection.execute(
					'INSERT INTO job_containers (job_order_id, container_size, container_number, seal_number, remarks) VALUES (?, ?, ?, ?, ?)',
					[
						job_order_id,
						String(row.container_size),
						row.container_number?.trim() || null,
						row.seal_number?.trim() || null,
						row.remarks?.trim() || null
					]
				);
			}
			await connection.commit();
			return { success: true, action: 'importContainers' };
		} catch (err: unknown) {
			await connection.rollback();
			console.error('Import containers error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการนำเข้าข้อมูล' });
		} finally {
			connection.release();
		}
	}
};