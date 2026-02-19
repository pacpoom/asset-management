import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load = async () => {
	try {
		const [liners] = await pool.query('SELECT * FROM liners ORDER BY name ASC');

		const [currencies] = await pool.query('SELECT * FROM currencies ORDER BY code ASC');

		return {
			liners: JSON.parse(JSON.stringify(liners)),
			currencies: JSON.parse(JSON.stringify(currencies))
		};
	} catch (error) {
		console.error('Master Data Load Error:', error);
		return {
			liners: [],
			currencies: []
		};
	}
};

export const actions = {
	save: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');
		const code = formData.get('code') || null;
		const name = formData.get('name');
		const contact_person = formData.get('contact_person') || null;
		const phone = formData.get('phone') || null;
		const email = formData.get('email') || null;
		const status = formData.get('status') || 'Active';

		if (!name) return fail(400, { message: 'กรุณากรอกชื่อสายเรือ' });

		try {
			if (id) {
				await pool.query(
					'UPDATE liners SET code=?, name=?, contact_person=?, phone=?, email=?, status=?, updated_at=NOW() WHERE id=?',
					[code, name, contact_person, phone, email, status, id]
				);
			} else {
				await pool.query(
					'INSERT INTO liners (code, name, contact_person, phone, email, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
					[code, name, contact_person, phone, email, status]
				);
			}
			return { success: true };
		} catch (error) {
			console.error('Save Liner Error:', error);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลสายเรือ' });
		}
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) return fail(400, { message: 'ไม่พบ ID ที่ต้องการลบ' });

		try {
			await pool.query('DELETE FROM liners WHERE id = ?', [id]);
			return { success: true };
		} catch (error) {
			console.error('Delete Liner Error:', error);
			return fail(500, { message: 'ไม่สามารถลบข้อมูลได้ (อาจมีการอ้างอิงใช้งานอยู่)' });
		}
	},

	saveCurrency: async ({ request }) => {
		const formData = await request.formData();
		const code = formData.get('code')?.toString().toUpperCase().trim();
		const name = formData.get('name');
		const symbol = formData.get('symbol');
		const exchange_rate = formData.get('exchange_rate');
		const is_active = formData.get('is_active') === 'on' ? 1 : 0;
		const isEdit = formData.get('isEdit') === 'true';

		if (!code || !name) return fail(400, { message: 'กรุณากรอกรหัสและชื่อสกุลเงิน' });

		try {
			if (isEdit) {
				await pool.query(
					'UPDATE currencies SET name=?, symbol=?, exchange_rate=?, is_active=?, updated_at=NOW() WHERE code=?',
					[name, symbol, exchange_rate, is_active, code]
				);
			} else {
				const [existing]: any = await pool.query('SELECT code FROM currencies WHERE code = ?', [
					code
				]);
				if (existing.length > 0) {
					return fail(400, { message: `สกุลเงินรหัส ${code} มีอยู่ในระบบแล้ว` });
				}

				await pool.query(
					'INSERT INTO currencies (code, name, symbol, exchange_rate, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
					[code, name, symbol, exchange_rate, is_active]
				);
			}
			return { success: true };
		} catch (error) {
			console.error('Save Currency Error:', error);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกสกุลเงิน' });
		}
	},

	deleteCurrency: async ({ request }) => {
		const formData = await request.formData();
		const code = formData.get('code');

		if (!code) return fail(400, { message: 'ไม่พบรหัสสกุลเงิน' });

		try {
			await pool.query('DELETE FROM currencies WHERE code = ?', [code]);
			return { success: true };
		} catch (error) {
			console.error('Delete Currency Error:', error);
			return fail(500, { message: 'ไม่สามารถลบสกุลเงินได้ (อาจมีการอ้างอิงใช้งานในใบงานอยู่)' });
		}
	}
};
