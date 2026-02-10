import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export const load: PageServerLoad = async ({ locals }) => {
	// ตรวจสอบว่ามี User Login หรือไม่ (ถ้าไม่มีอาจจะ redirect หรือให้เป็น null)
	// สมมติว่า locals.user มีค่าถ้า login แล้ว
	const user = locals.user || null;

	try {
		// ดึงข้อมูล Assets เพื่อนำไปทำ Search Autocomplete
		// ดึง Location มาด้วยเพื่อ Auto-fill สถานที่
		const [assets] = await pool.execute<any[]>(`
			SELECT 
				a.id, 
				a.asset_tag, 
				a.name, 
				l.name as location_name 
			FROM assets a
			LEFT JOIN asset_locations l ON a.location_id = l.id
			WHERE a.status != 'Disposed'
			ORDER BY a.asset_tag ASC
		`);

		return {
			user,
			assets
		};
	} catch (error) {
		console.error('Error loading assets:', error);
		return { user, assets: [] };
	}
};

export const actions: Actions = {
	createRepair: async ({ request, locals }) => {
		const formData = await request.formData();

		// รับค่า asset_id ที่ส่งมาจาก Frontend (ถ้ามี)
		const asset_id_raw = formData.get('asset_id');
		const asset_id = asset_id_raw ? parseInt(asset_id_raw.toString()) : null;

		const asset_name = formData.get('asset_name')?.toString();
		const reporter_name = formData.get('reporter_name')?.toString();
		const contact_info = formData.get('contact_info')?.toString();
		const issue_description = formData.get('issue_description')?.toString();
		const location_name = formData.get('location_name')?.toString();
		const repair_image = formData.get('repair_image') as File;

		// ดึง User ID จาก Session
		const reported_by_user_id = locals.user?.id || null;

		// ดึงพิกัด GPS
		const latitude = formData.get('latitude');
		const longitude = formData.get('longitude');

		if (!asset_name || !reporter_name || !issue_description) {
			return fail(400, { success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
		}

		try {
			// --- 1. สร้าง Ticket Code แบบต่อเนื่อง ---
			const now = new Date();
			const day = String(now.getDate()).padStart(2, '0');
			const month = String(now.getMonth() + 1).padStart(2, '0');
			const year = String(now.getFullYear()).slice(-2);
			const datePrefix = `${day}${month}${year}`;

			// ค้นหา Ticket ล่าสุดของเดือนนี้เพื่อให้รันเลขต่อกันได้ถูกต้อง
			const [lastTicket] = await pool.execute<any[]>(
				'SELECT ticket_code FROM asset_repairs WHERE ticket_code LIKE ? ORDER BY id DESC LIMIT 1',
				[`${datePrefix}-%`]
			);

			let nextNumber = 1;
			if (lastTicket.length > 0) {
				const lastCode = lastTicket[0].ticket_code;
				if (lastCode && lastCode.includes('-')) {
					const parts = lastCode.split('-');
					// เช็คให้แน่ใจว่าเป็นตัวเลขส่วนหลัง
					if (parts.length === 2) {
						const lastSeq = parseInt(parts[1]);
						if (!isNaN(lastSeq)) nextNumber = lastSeq + 1;
					}
				}
			}
			const ticketCode = `${datePrefix}-${String(nextNumber).padStart(3, '0')}`;

			// --- 2. จัดการรูปภาพ ---
			let imageUrl: string | null = null;
			if (repair_image && repair_image.size > 0) {
				const uploadDir = join(process.cwd(), 'static', 'uploads', 'repairs');
				if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
				const fileName = `${Date.now()}-${repair_image.name}`;
				const filePath = join(uploadDir, fileName);
				const buffer = Buffer.from(await repair_image.arrayBuffer());
				writeFileSync(filePath, buffer);
				imageUrl = `/uploads/repairs/${fileName}`;
			}

			// --- 3. บันทึกลง Database ---
			// เพิ่ม column asset_id และ reported_by_user_id
			await pool.execute(
				`INSERT INTO asset_repairs 
     				(ticket_code, asset_id, asset_name, location_name, reporter_name, reported_by_user_id, issue_description, contact_info, image_url, latitude, longitude, repair_status, created_at) 
     				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', NOW())`,
				[
					ticketCode,
					asset_id,
					asset_name,
					location_name || null,
					reporter_name,
					reported_by_user_id,
					issue_description,
					contact_info,
					imageUrl,
					latitude ? parseFloat(latitude.toString()) : null,
					longitude ? parseFloat(longitude.toString()) : null
				]
			);

			return { success: true, ticketId: ticketCode };
		} catch (error) {
			console.error('Error:', error);
			return fail(500, { success: false, message: 'บันทึกข้อมูลไม่สำเร็จ' });
		}
	}
};