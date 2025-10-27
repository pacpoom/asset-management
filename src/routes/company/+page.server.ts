import { db } from '$lib/server/database'; // สมมติว่าคุณ import db มาจากที่นี่
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import fs from 'fs/promises';
import path from 'path';

// ฟังก์ชันสำหรับดึงข้อมูลบริษัทมาแสดง
export const load: PageServerLoad = async () => {
	try {
		// --- ADDED START ---
		// Debug check: ตรวจสอบว่า db object ถูก import มาถูกต้องหรือไม่
		if (!db) {
			console.error('Database connection (db) is undefined. Please check export in src/lib/server/database.ts');
			throw new Error('Database connection is not initialized.');
		}
		// --- ADDED END ---
		const [rows] = await db.query('SELECT * FROM company WHERE id = 1 LIMIT 1');
		const companyData = rows[0] || { id: 1, name: 'Your Company Name' }; // ให้มีค่า default ถ้ายังไม่มีข้อมูล
		return {
			company: companyData
		};
	} catch (error) {
		console.error('Failed to load company data:', error);
		return {
			company: { id: 1, name: 'Error Loading Data' }
		};
	}
};

// ฟังก์ชันสำหรับบันทึกข้อมูล (Action)
export const actions: Actions = {
	save: async ({ request }) => {
		const data = await request.formData();
		const name = data.get('name') as string;
		const address_line_1 = data.get('address_line_1') as string;
		const address_line_2 = data.get('address_line_2') as string;
		const city = data.get('city') as string;
		const state_province = data.get('state_province') as string;
		const postal_code = data.get('postal_code') as string;
		const country = data.get('country') as string;
		const phone = data.get('phone') as string;
		const email = data.get('email') as string;
		const website = data.get('website') as string;
		const tax_id = data.get('tax_id') as string;
		const logoFile = data.get('logo') as File;

		let logo_path: string | null = data.get('current_logo_path') as string; // ดึงค่าโลโก้เดิม

		// 1. จัดการการอัปโหลดไฟล์โลโก้
		if (logoFile && logoFile.size > 0) {
			try {
				// สร้างชื่อไฟล์ใหม่ที่ไม่ซ้ำกัน
				const fileExt = path.extname(logoFile.name);
				const newFilename = `logo-${Date.now()}${fileExt}`;

				// --- MODIFICATION START ---
				// กำหนดตำแหน่งที่จะบันทึก (ย้ายไปที่ 'uploads/company/' ใน root directory)
				// ตรวจสอบให้แน่ใจว่าโฟลเดอร์นี้มีอยู่จริง
				const uploadDir = path.resolve('uploads/company');
				// --- MODIFICATION END ---
				await fs.mkdir(uploadDir, { recursive: true });

				// บันทึกไฟล์
				const savePath = path.join(uploadDir, newFilename);
				await fs.writeFile(savePath, Buffer.from(await logoFile.arrayBuffer()));

				// อัปเดต path ที่จะเก็บลง DB (ยังคงเป็น URL path ที่เข้าถึงได้ผ่าน custom endpoint)
				logo_path = `/uploads/company/${newFilename}`;

				// (ทางเลือก) ลบไฟล์โลโก้เก่า ถ้ามี
				const oldLogoPath = data.get('current_logo_path') as string;
				if (oldLogoPath && oldLogoPath.startsWith('/uploads/company/')) {
					// --- MODIFICATION START ---
					// แก้ path ให้อ่านจาก root 'uploads' directory แทน 'static'
					const oldFilePath = path.resolve(oldLogoPath.substring(1));
					// --- MODIFICATION END ---
					try {
						await fs.unlink(oldFilePath);
					} catch (err) {
						// ไม่เป็นไรถ้าลบไม่ได้ (อาจจะไฟล์ไม่มีอยู่แล้ว)
						console.warn('Could not delete old logo:', oldFilePath, err);
					}
				}
			} catch (err) {
				console.error('File upload failed:', err);
				return fail(500, { message: 'ไม่สามารถอัปโหลดไฟล์โลโก้ได้' });
			}
		}

		// 2. อัปเดตข้อมูลลงฐานข้อมูล
		try {
			// --- ADDED START ---
			// Debug check: ตรวจสอบ db อีกครั้งสำหรับ action
			if (!db) {
				console.error('Database connection (db) is undefined for action. Please check export in src/lib/server/database.ts');
				throw new Error('Database connection is not initialized.');
			}
			// --- ADDED END ---
			const sql = `
                UPDATE company
                SET
                    name = ?,
                    logo_path = ?,
                    address_line_1 = ?,
                    address_line_2 = ?,
                    city = ?,
                    state_province = ?,
                    postal_code = ?,
                    country = ?,
                    phone = ?,
                    email = ?,
                    website = ?,
                    tax_id = ?
                WHERE id = 1
            `;
			await db.query(sql, [
				name,
				logo_path,
				address_line_1,
				address_line_2,
				city,
				state_province,
				postal_code,
				country,
				phone,
				email,
				website,
				tax_id
			]);

			// ส่ง logo_path ใหม่กลับไปด้วยเพื่อให้ Svelte อัปเดต UI
			return { success: true, message: 'บันทึกข้อมูลบริษัทสำเร็จ', logo_path: logo_path };
		} catch (dbError) {
			console.error('Database update failed:', dbError);
			return fail(500, { message: 'ไม่สามารถบันทึกข้อมูลลงฐานข้อมูลได้' });
		}
	}
};