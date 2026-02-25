import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
	const id = params.id;

	try {
		const connection = await pool.getConnection();

		const [billingNotes] = (await connection.query('SELECT * FROM billing_notes WHERE id = ?', [
			id
		])) as any;
		if (billingNotes.length === 0) throw error(404, 'ไม่พบใบวางบิล');
		const billingNote = billingNotes[0];

		const [billingNoteItems] = (await connection.query(
			'SELECT * FROM billing_note_items WHERE billing_note_id = ?',
			[id]
		)) as any;

		const [customers] = (await connection.query(
			'SELECT id, name, company_name FROM customers ORDER BY name ASC'
		)) as any;

		const [products] = (await connection.query(
			'SELECT id, name, selling_price, unit_id FROM products ORDER BY name ASC'
		)) as any;

		const [units] = await connection.query<any[]>(
			'SELECT id, name, symbol FROM units ORDER BY name ASC'
		);

		connection.release();

		return {
			billingNote: JSON.parse(JSON.stringify(billingNote)),
			billingNoteItems: JSON.parse(JSON.stringify(billingNoteItems)),
			customers: JSON.parse(JSON.stringify(customers)),
			products: JSON.parse(JSON.stringify(products)),
			units: JSON.parse(JSON.stringify(units))
		};
	} catch (err: any) {
		console.error('Failed to load billing note for edit:', err);
		throw error(500, `Error: ${err.message}`);
	}
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const id = params.id;
		const formData = await request.formData();

		const customer_id = formData.get('customer_id');
		const billing_date = formData.get('billing_date');
		const due_date = formData.get('due_date');
		const notes = formData.get('notes');
		const itemsJson = formData.get('itemsJson') as string;

		const subtotal = formData.get('subtotal');
		const discount_amount = formData.get('discount_amount');
		const vat_rate = formData.get('vat_rate');
		const vat_amount = formData.get('vat_amount');
		const withholding_tax_amount = formData.get('withholding_tax_amount');
		const total_amount = formData.get('total_amount');

		if (!customer_id || !billing_date) {
			return fail(400, { message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			// 1. อัปเดตหัวบิล (ตั้งค่า withholding_tax_rate เป็น 0 เพราะเราใช้รายบรรทัด)
			await connection.execute(
				`
                UPDATE billing_notes 
                SET customer_id = ?, billing_date = ?, due_date = ?, notes = ?,
                    subtotal = ?, discount_amount = ?, vat_rate = ?, vat_amount = ?,
                    withholding_tax_rate = 0, withholding_tax_amount = ?, total_amount = ?
                WHERE id = ?
            `,
				[
					customer_id,
					billing_date,
					due_date || null,
					notes || null,
					subtotal || 0,
					discount_amount || 0,
					vat_rate || 7,
					vat_amount || 0,
					withholding_tax_amount || 0,
					total_amount || 0,
					id
				]
			);

			// 2. ลบรายการเก่า
			await connection.execute('DELETE FROM billing_note_items WHERE billing_note_id = ?', [id]);

			// 3. บันทึกรายการใหม่ (เพิ่ม wht_rate และ wht_amount)
			if (itemsJson) {
				const items = JSON.parse(itemsJson);
				for (const item of items) {
					// คำนวณ WHT ของแต่ละบรรทัดก่อนบันทึก
					const lineAmount = Number(item.amount) || 0;
					const whtRate = Number(item.wht_rate) || 0;
					const whtAmount = (lineAmount * whtRate) / 100;

					await connection.execute(
						`
            INSERT INTO billing_note_items 
            (billing_note_id, product_id, description, quantity, unit_id, unit_price, amount, wht_rate, wht_amount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
						[
							id,
							item.product_id || null,
							item.description || '',
							item.quantity || 0,
							item.unit_id || null,
							item.unit_price || 0,
							item.amount || 0,
							whtRate,
							whtAmount
						]
					);
				}
			}

			await connection.commit();
		} catch (err: any) {
			await connection.rollback();
			console.error('Update Billing Note Error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาด: ' + err.message });
		} finally {
			connection.release();
		}

		// ✅ สำคัญ: throw redirect ต้องอยู่นอก try/catch
		throw redirect(303, `/billing-notes/${id}`);
	}
};
