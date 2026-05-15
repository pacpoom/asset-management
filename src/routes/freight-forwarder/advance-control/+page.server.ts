import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';
import type { RowDataPacket } from 'mysql2/promise';

export const load = async ({ url, locals }) => {
	// รับค่าจาก URL params สำหรับ Pagination & Filter
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '10');
	const search = url.searchParams.get('search') || '';
	const offset = (page - 1) * limit;

	// คำนวณวันที่เริ่มต้น (ย้อนหลัง 1 เดือน) และสิ้นสุดของเดือนปัจจุบันเป็น Default
	const now = new Date();
	const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

	const formatYMD = (date: Date) => {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	};

	const defaultStart = formatYMD(firstDay);
	const defaultEnd = formatYMD(lastDay);

	const startDate = url.searchParams.get('startDate') || defaultStart;
	const endDate = url.searchParams.get('endDate') || defaultEnd;

	// ตรวจสอบสิทธิ์: admin เห็นทุก advance, user ทั่วไปเห็นเฉพาะของตัวเอง
	const currentUser = locals.user;
	const isAdmin = currentUser?.role === 'admin';

	// บังคับกรองด้วยวันที่เสมอ
	let whereClause = 'WHERE a.document_date >= ? AND a.document_date <= ?';
	const queryParams: (string | number)[] = [startDate, endDate];

	// กรองเฉพาะ advance ของตัวเองถ้าไม่ใช่ admin
	if (!isAdmin && currentUser?.id) {
		whereClause += ' AND a.created_by = ?';
		queryParams.push(currentUser.id);
	}

	// ถ้ามีการค้นหา ให้เพิ่มเงื่อนไข
	if (search) {
		whereClause += ` AND (
			a.document_number LIKE ? 
			OR a.application_title LIKE ? 
			OR a.reason LIKE ?
			OR b.bank_name LIKE ? 
			OR b.account_number LIKE ?
		)`;
		const searchParam = `%${search}%`;
		queryParams.push(searchParam, searchParam, searchParam, searchParam, searchParam);
	}

	// Query นับจำนวนทั้งหมด
	const countSql = `
		SELECT COUNT(a.id) as total 
		FROM advance_applications a
		LEFT JOIN banks b ON a.bank_id = b.id
		${whereClause}
	`;
	const [countRows] = await pool.query<RowDataPacket[]>(countSql, queryParams);
	const totalAdvances = countRows[0].total;

	// Query ดึงข้อมูลจริง
	const sql = `
		SELECT a.*, 
		       b.bank_code, b.bank_name, b.account_number, b.account_name,
               u.full_name as created_by_name
		FROM advance_applications a
		LEFT JOIN banks b ON a.bank_id = b.id
        LEFT JOIN users u ON a.created_by = u.id
		${whereClause}
		ORDER BY a.document_date DESC, a.id DESC
		LIMIT ${Number(limit)} OFFSET ${Number(offset)}
	`;
	
	const [rows] = await pool.query(sql, queryParams);
	
	return { 
		advances: JSON.parse(JSON.stringify(rows)),
		pagination: {
			total: totalAdvances,
			page,
			limit,
			search,
			startDate,
			endDate
		}
	};
};

export const actions = {
	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) {
			return fail(400, { message: 'ไม่พบ ID ของรายการที่ต้องการลบ' });
		}

		try {
			// ลบข้อมูล (จะ cascade ลบไฟล์แนบที่เชื่อมใน database ด้วยถ้าตั้ง FK ไว้)
			await pool.query('DELETE FROM advance_applications WHERE id = ?', [id]);
			return { success: true };
		} catch (error) {
			console.error(error);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
		}
	}
};