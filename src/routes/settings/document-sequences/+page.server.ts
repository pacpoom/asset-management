import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async () => {
	try {
		// โหลดข้อมูลเลขรันทั้งหมด เรียงตาม ปี, เดือน, และประเภทเอกสาร
		const [rows] = await pool.query(
			'SELECT * FROM document_sequences ORDER BY year DESC, month DESC, document_type ASC'
		);
		return {
			sequences: JSON.parse(JSON.stringify(rows))
		};
	} catch (err: any) {
		console.error('Failed to load sequences:', err);
		return { sequences: [] };
	}
};

export const actions: Actions = {
	save: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString();
		const document_type = formData.get('document_type')?.toString();
		const prefix = formData.get('prefix')?.toString();
		const yearRaw = formData.get('year')?.toString();
		const monthRaw = formData.get('month')?.toString();
		const lastNumberRaw = formData.get('last_number')?.toString();
		const paddingRaw = formData.get('padding_length')?.toString();

		const year = Number(yearRaw);
		const month = Number(monthRaw);
		const last_number = Number(lastNumberRaw);
		const padding_length = Number(paddingRaw ?? '4');

		if (!document_type || !prefix || !Number.isInteger(year) || !Number.isInteger(month)) {
			return fail(400, { message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
		}
		if (month < 1 || month > 12) {
			return fail(400, { message: 'เดือนต้องอยู่ระหว่าง 1 - 12' });
		}
		// Allow 0 explicitly: 0 means next number starts from 1.
		if (!Number.isInteger(last_number) || last_number < 0) {
			return fail(400, { message: 'Last Used Number ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป' });
		}
		if (!Number.isInteger(padding_length) || padding_length < 1) {
			return fail(400, { message: 'Padding Length ต้องมากกว่า 0' });
		}

		try {
			if (id) {
				// กรณีแก้ไข (Update)
				await pool.execute(
					`UPDATE document_sequences 
					 SET document_type = ?, prefix = ?, year = ?, month = ?, last_number = ?, padding_length = ? 
					 WHERE id = ?`,
					[document_type, prefix, year, month, last_number, padding_length, id]
				);
			} else {
				// กรณีสร้างใหม่ (Create)
				await pool.execute(
					`INSERT INTO document_sequences (document_type, prefix, year, month, last_number, padding_length) 
					 VALUES (?, ?, ?, ?, ?, ?)`,
					[document_type, prefix, year, month, last_number, padding_length]
				);
			}
			return { success: true };
		} catch (err: any) {
			console.error('Save sequence error:', err);
			// จัดการ Error กรณีเพิ่ม ปี+เดือน+ประเภท ซ้ำกัน (ตาม UNIQUE KEY)
			if (err.code === 'ER_DUP_ENTRY') {
				return fail(400, { message: 'มีข้อมูลลำดับของประเภทเอกสารในเดือนและปีนี้อยู่แล้ว' });
			}
			return fail(500, { message: 'เกิดข้อผิดพลาด: ' + err.message });
		}
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) return fail(400, { message: 'ไม่พบรหัสข้อมูล' });

		try {
			await pool.execute('DELETE FROM document_sequences WHERE id = ?', [id]);
			return { success: true };
		} catch (err: any) {
			console.error('Delete sequence error:', err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการลบ: ' + err.message });
		}
	}
};