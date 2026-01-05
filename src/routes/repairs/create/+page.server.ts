import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import pool from '$lib/server/database';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export const actions: Actions = {
	createRepair: async ({ request }) => {
		const formData = await request.formData();

		const asset_name = formData.get('asset_name')?.toString();
		const reporter_name = formData.get('reporter_name')?.toString();
		const contact_info = formData.get('contact_info')?.toString();
		const issue_description = formData.get('issue_description')?.toString();
		const repair_image = formData.get('repair_image') as File;

		// ดึงพิกัด GPS
		const latitude = formData.get('latitude');
		const longitude = formData.get('longitude');

		if (!asset_name || !reporter_name || !issue_description) {
			return fail(400, { success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
		}

		try {
			// --- 1. สร้าง Ticket Code แบบต่อเนื่อง (โค้ดเดิม) ---
			const now = new Date();
			const day = String(now.getDate()).padStart(2, '0');
			const month = String(now.getMonth() + 1).padStart(2, '0');
			const year = String(now.getFullYear()).slice(-2);
			const datePrefix = `${day}${month}${year}`;

			const [lastTicket] = await pool.execute<any[]>(
				'SELECT ticket_code FROM asset_repairs ORDER BY id DESC LIMIT 1'
			);

			let nextNumber = 1;
			if (lastTicket.length > 0) {
				const lastCode = lastTicket[0].ticket_code;
				if (lastCode && lastCode.includes('-')) {
					const lastSeq = parseInt(lastCode.split('-').pop() || '0');
					if (!isNaN(lastSeq)) nextNumber = lastSeq + 1;
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
			await pool.execute(
				`INSERT INTO asset_repairs 
     				(ticket_code, asset_name, location_name, reporter_name, issue_description, contact_info, image_url, latitude, longitude, repair_status, created_at) 
     				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', NOW())`,
				[
					ticketCode,
					asset_name,
					formData.get('location_name')?.toString(), // รับค่าชื่อสถานที่จากช่องกรอก
					reporter_name,
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
