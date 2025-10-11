import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import pool from '$lib/server/database';

/**
 * ฟังก์ชัน LayoutServerLoad สำหรับตรวจสอบสถานะการล็อกอินในทุกหน้า
 * หากผู้ใช้ยังไม่ได้ล็อกอิน จะถูก Redirect ไปยังหน้า /login
 */
export const load: LayoutServerLoad = async ({ cookies, url, locals }) => {
	const sessionId = cookies.get('session_id');
	let user: App.User | null = null;

	// 1. ตรวจสอบ Session Cookie และดึงข้อมูลผู้ใช้
	if (sessionId) {
		try {
			const [rows]: any[] = await pool.execute(
				'SELECT id, email, role FROM users WHERE id = ? LIMIT 1',
				[sessionId]
			);
			const userData = rows[0];

			// --- DEBUGGING: เพิ่มการ Log เพื่อตรวจสอบค่า ---
			console.log('[+layout.server.ts] Session ID from cookie:', sessionId);
			console.log('[+layout.server.ts] User data from database:', userData);
			// --- END DEBUGGING ---

			if (userData) {
				user = {
					id: userData.id,
					email: userData.email,
					role: userData.role // บรรทัดนี้คือส่วนที่กำหนดค่า role
				};
				locals.user = user;

				// --- DEBUGGING: ตรวจสอบ object ที่จะเก็บใน locals ---
				console.log('[+layout.server.ts] User object set in locals:', locals.user);
				// --- END DEBUGGING ---

			} else {
				// User ID ใน cookie ไม่ถูกต้อง/ไม่มีอยู่จริง, ล้าง cookie
				console.log('[+layout.server.ts] No user found for this session ID. Deleting cookie.');
				cookies.delete('session_id', { path: '/' });
			}
		} catch (err) {
			console.error('[+layout.server.ts] Database error during session check:', err);
		}
	}

	// 2. บังคับ Redirect ผู้ใช้ที่ไม่ล็อกอิน
	if (!user && url.pathname !== '/login') {
		throw redirect(303, '/login');
	}

	// 3. ส่งข้อมูลผู้ใช้ไปยัง Layout (ถ้ามี)
	return { user };
};