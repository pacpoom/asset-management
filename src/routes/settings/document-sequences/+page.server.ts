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
		const year = parseInt(formData.get('year')?.toString() || '0');
		const month = parseInt(formData.get('month')?.toString() || '0');
		const last_number = parseInt(formData.get('last_number')?.toString() || '0');
		const padding_length = parseInt(formData.get('padding_length')?.toString() || '4');

		if (!document_type || !prefix || !year || !month) {
			return fail(400, { message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
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