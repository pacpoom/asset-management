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
		// เปลี่ยนชื่อตัวแปรจาก 'email' เป็น 'identifier'
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
			// ดึงข้อมูลผู้ใช้จาก identifier (ซึ่งอาจเป็น email หรือ username)
			// ค้นหาผู้ใช้โดยใช้ OR condition
			const [rows]: any[] = await pool.execute(
				'SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1',
				[identifier, identifier]
			);
			const user = rows[0];

			// ตรวจสอบว่ามีผู้ใช้นี้ในระบบหรือไม่
			if (!user) {
				return fail(401, { message: 'อีเมล/Username หรือรหัสผ่านไม่ถูกต้อง', identifier });
			}

			// เปรียบเทียบรหัสผ่านที่ผู้ใช้กรอกกับ hash ในฐานข้อมูล
			const passwordMatch = await bcrypt.compare(password, user.password_hash);

			if (!passwordMatch) {
				return fail(401, { message: 'อีเมล/Username หรือรหัสผ่านไม่ถูกต้อง', identifier });
			}

			// --- Login สำเร็จ ---
			// สร้าง session และเก็บข้อมูลที่จำเป็นใน cookie
			cookies.set('session_id', user.id, {
				path: '/',
				httpOnly: true, // ป้องกันการเข้าถึงจาก JavaScript ฝั่ง Client
				sameSite: 'strict',
				secure: process.env.NODE_ENV === 'production', // ใช้ secure cookie เฉพาะตอน production
				maxAge: 60 * 60 * 24 * 7 // อายุ cookie 1 สัปดาห์
			});

			// Redirect ไปยังหน้าหลัก
			throw redirect(303, '/');

		} catch (err) {
			console.error(err);
			// ในกรณีที่เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล
			return fail(500, { message: 'เกิดข้อผิดพลาดในการเชื่อมต่อระบบ โปรดลองใหม่อีกครั้ง' });
		}
	},

	// Action สำหรับ Logout
	logout: async ({ cookies }) => {
		// ลบ Session Cookie
		cookies.delete('session_id', { path: '/' });
		// Redirect ไปยังหน้า Login
		throw redirect(303, '/login');
	}
};