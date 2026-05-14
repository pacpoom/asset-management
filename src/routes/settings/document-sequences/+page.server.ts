import { fail } from '@sveltejs/kit';
import type { RowDataPacket } from 'mysql2';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';

export const load: PageServerLoad = async ({ url }) => {
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
	const pageSize = Math.min(200, Math.max(5, parseInt(url.searchParams.get('pageSize') || '25', 10) || 25));
	const searchQuery = (url.searchParams.get('search') || '').trim();
	const filterType = (url.searchParams.get('type') || '').trim();
	const filterYearRaw = (url.searchParams.get('year') || '').trim();
	const filterMonthRaw = (url.searchParams.get('month') || '').trim();

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause += ` AND (document_type LIKE ? OR prefix LIKE ?) `;
			const term = `%${searchQuery}%`;
			params.push(term, term);
		}
		if (filterType) {
			whereClause += ` AND document_type = ? `;
			params.push(filterType);
		}
		if (filterYearRaw && /^\d{4}$/.test(filterYearRaw)) {
			whereClause += ` AND year = ? `;
			params.push(parseInt(filterYearRaw, 10));
		}
		if (filterMonthRaw) {
			const m = parseInt(filterMonthRaw, 10);
			if (Number.isInteger(m) && m >= 1 && m <= 12) {
				whereClause += ` AND month = ? `;
				params.push(m);
			}
		}

		const [countRows] = await pool.query<RowDataPacket[]>(
			`SELECT COUNT(*) AS total FROM document_sequences ${whereClause}`,
			params
		);
		const totalItems = Number(countRows[0]?.['total'] ?? 0);
		const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
		const safePage = Math.min(page, totalPages);
		const offset = (safePage - 1) * pageSize;

		const [rows] = await pool.query(
			`SELECT * FROM document_sequences ${whereClause} ORDER BY year DESC, month DESC, document_type ASC LIMIT ? OFFSET ?`,
			[...params, pageSize, offset]
		);

		const [typeRows] = await pool.query<RowDataPacket[]>(
			'SELECT DISTINCT document_type FROM document_sequences ORDER BY document_type ASC'
		);
		const distinctTypes = typeRows.map((r) => String(r['document_type'] ?? ''));

		return {
			sequences: JSON.parse(JSON.stringify(rows)),
			currentPage: safePage,
			totalPages,
			totalItems,
			searchQuery,
			filterType,
			filterYear: filterYearRaw,
			filterMonth: filterMonthRaw,
			pageSize,
			distinctTypes: JSON.parse(JSON.stringify(distinctTypes))
		};
	} catch (err: any) {
		console.error('Failed to load sequences:', err);
		return {
			sequences: [],
			currentPage: 1,
			totalPages: 1,
			totalItems: 0,
			searchQuery: '',
			filterType: '',
			filterYear: '',
			filterMonth: '',
			pageSize: 25,
			distinctTypes: []
		};
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