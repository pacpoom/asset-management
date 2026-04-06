import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database'; // Import connection pool
import bcrypt from 'bcrypt'; // Import bcrypt for password hashing
import type { RowDataPacket } from 'mysql2'; // Import RowDataPacket

// Type for company logo data
interface CompanyLogo extends RowDataPacket {
	logo_path: string | null;
}

/**
 * PageServerLoad: ตรวจสอบว่าผู้ใช้ล็อกอินอยู่หรือไม่ และโหลด logo path
 * หากล็อกอินแล้ว (มี session_id) จะถูก Redirect ไปยังหน้าหลัก (/) ทันที
 */
export const load: PageServerLoad = async ({ cookies }) => {
	const sessionId = cookies.get('session_id');
	if (sessionId) {
		// ถ้ามี session cookie อยู่, Redirect ไปยังหน้าหลัก
		throw redirect(303, '/');
	}

	let companyLogoPath: string | null = null;
	try {
		// Fetch Company Logo
		const [companyRows] = await pool.execute<CompanyLogo[]>(
			`SELECT logo_path FROM company WHERE id = ? LIMIT 1`,
			[1] // Assuming company ID is always 1
		);
		if (companyRows.length > 0) {
			companyLogoPath = companyRows[0].logo_path;
		}
	} catch (err) {
		console.error('[login/+page.server.ts] Failed to load company logo:', err);
		// Don't prevent login page from loading, just log the error
	}

	// ถ้าไม่มี session ให้แสดงหน้า login ต่อไป พร้อมส่ง logo path
	return {
		companyLogoPath // Pass logo path to the page
	};
};

export const actions: Actions = {
	login: async ({ cookies, request }) => {
		const data = await request.formData();
		const identifier = data.get('identifier')?.toString();
		const password = data.get('password')?.toString();

		// --- ตรวจสอบข้อมูลเบื้องต้น ---
		if (!identifier || !password) {
			return fail(400, {
				message: 'กรุณากรอกอีเมล/Username และรหัสผ่าน',
				identifier: identifier as string
			});
		}

		// --- ตรวจสอบข้อมูลกับฐานข้อมูลจริง ---
		try {
			const [rows]: any[] = await pool.execute(
				'SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1',
				[identifier, identifier]
			);
			const user = rows[0];

			if (!user) {
				return fail(401, { message: 'อีเมล/Username หรือรหัสผ่านไม่ถูกต้อง', identifier });
			}

			const passwordMatch = await bcrypt.compare(password, user.password_hash);

			if (!passwordMatch) {
				return fail(401, { message: 'อีเมล/Username หรือรหัสผ่านไม่ถูกต้อง', identifier });
			}

			// --- Login สำเร็จ ---
			const sessionToken = crypto.randomUUID();

			const isSuperAdmin =
				(user.username === 'admin' || user.email === 'admin') && user.role === 'admin';

			if (!isSuperAdmin) {
				await pool.execute('UPDATE users SET current_session_token = ? WHERE id = ?', [
					sessionToken,
					user.id
				]);
			}

			cookies.set('session_id', user.id, {
				path: '/',
				httpOnly: true,
				sameSite: 'strict',
				secure: process.env.NODE_ENV === 'production',
				maxAge: 60 * 60 * 24 * 7
			});

			cookies.set('session_token', sessionToken, {
				path: '/',
				httpOnly: true,
				sameSite: 'strict',
				secure: process.env.NODE_ENV === 'production',
				maxAge: 60 * 60 * 24 * 7
			});

			throw redirect(303, '/');

			// Redirect ไปยังหน้าหลัก
			throw redirect(303, '/');
		} catch (err) {
			console.error(err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการเชื่อมต่อระบบ โปรดลองใหม่อีกครั้ง' });
			identifier: identifier;
		}
	},

	// Action สำหรับ Logout
	logout: async ({ cookies }) => {
		cookies.delete('session_id', { path: '/' });
		throw redirect(303, '/login');
	}
};
