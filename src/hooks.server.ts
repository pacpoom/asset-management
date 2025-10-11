import type { Handle } from '@sveltejs/kit';
import pool from '$lib/server/database';

/**
 * นี่คือ Server Hook 'handle' ซึ่งจะทำงานก่อนทุกๆ request ที่เข้ามายังเซิร์ฟเวอร์
 * เป็นตำแหน่งที่เหมาะสมที่สุดในการจัดการ Authentication
 */
export const handle: Handle = async ({ event, resolve }) => {
	// 1. ดึง session_id จาก cookie
	const sessionId = event.cookies.get('session_id');

	// 2. ถ้ามี session_id, ให้ดึงข้อมูลผู้ใช้จากฐานข้อมูล
	if (sessionId) {
		try {
			const [rows]: any[] = await pool.execute(
				'SELECT id, email, role FROM users WHERE id = ? LIMIT 1',
				[sessionId]
			);
			const userData = rows[0];

			// 3. ถ้าพบข้อมูลผู้ใช้, ให้เก็บไว้ใน event.locals
			//    ข้อมูลใน locals จะสามารถเข้าถึงได้ในทุกๆ +server.ts และ +page.server.ts
			if (userData) {
				event.locals.user = {
					id: userData.id,
					email: userData.email,
					role: userData.role
				};
			}
		} catch (err) {
			console.error('[hooks.server.ts] Database error during session check:', err);
		}
	}

	// 4. เรียก resolve(event) เพื่อให้ SvelteKit ทำงานต่อไปตามปกติ
	//    ขั้นตอนนี้สำคัญมาก, หากไม่มี SvelteKit จะหยุดทำงาน
	const response = await resolve(event);
	return response;
};
