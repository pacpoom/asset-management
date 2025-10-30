// src/routes/uploads/[...path]/+server.ts
import { error } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import { fileTypeFromBuffer } from 'file-type'; // ถ้ายังไม่ติดตั้ง: npm install file-type

export async function GET({ locals, params }) {
	// 1. ตรวจสอบว่า login หรือยัง
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// 2. สร้าง Path ไปยังไฟล์
	const filePath = path.resolve('uploads', params.path);

	// 3. ตรวจสอบว่าไฟล์มีอยู่จริง
	if (!fs.existsSync(filePath)) {
		throw error(404, 'Not Found');
	}

	try {
		// 4. อ่านไฟล์
		const fileBuffer = fs.readFileSync(filePath);

		// 5. ตรวจสอบ Mime Type
		const mimeTypeResult = await fileTypeFromBuffer(fileBuffer);
		const mimeType = mimeTypeResult ? mimeTypeResult.mime : 'application/octet-stream';

		// 6. ส่งไฟล์กลับไปพร้อม Header ที่ถูกต้อง
		return new Response(fileBuffer, {
			status: 200,
			headers: {
				'Content-Type': mimeType,
				'Content-Length': fileBuffer.length.toString(), // <--- จุดที่แก้ไขครับ
				// (แนะนำ) เพิ่ม Cache-Control เพื่อให้เบราว์เซอร์โหลดใหม่เมื่อมีการเปลี่ยนแปลง
				'Cache-Control': 'public, max-age=3600' // Cache 1 ชั่วโมง
			}
		});
	} catch (e) {
		console.error('Failed to read file:', e);
		throw error(500, 'Internal Server Error');
	}
}
