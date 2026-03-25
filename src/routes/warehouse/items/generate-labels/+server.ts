import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { itemIds, printCount, qtyPerLabel, lot } = body;

		if (!itemIds || itemIds.length === 0 || !printCount || !qtyPerLabel || !lot) {
			return json({ success: false, message: 'Invalid request data' }, { status: 400 });
		}

		const connection = await pool.getConnection();

		try {
			await connection.beginTransaction();

			// 1. ดึงข้อมูล Items ที่ถูกเลือก
			const placeholders = itemIds.map(() => '?').join(',');
			const [items] = await connection.execute<RowDataPacket[]>(
				`SELECT id, item_code, item_name FROM items WHERE id IN (${placeholders})`,
				itemIds
			);

			// 2. จัดการ Running Number สำหรับ Box ID (Document Type: BOX)
			const today = new Date();
			const year = today.getFullYear();
			const month = today.getMonth() + 1;
			const year2Digits = year.toString().slice(-2);
			const monthStr = month.toString().padStart(2, '0');

			// ล็อค Table เพื่อป้องกัน Race Condition
			const [seqRows] = await connection.execute<RowDataPacket[]>(
				`SELECT * FROM document_sequences WHERE document_type = 'BOX' AND year = ? AND month = ? FOR UPDATE`,
				[year, month]
			);

			let lastNumber = 0;
			let paddingLength = 4;
			let prefix = 'BOX-'; 

			if (seqRows.length === 0) {
				// สร้าง Record ใหม่ถ้ายังไม่มีของเดือนนี้
				await connection.execute(
					`INSERT INTO document_sequences (document_type, prefix, year, month, last_number, padding_length) VALUES (?, ?, ?, ?, ?, ?)`,
					['BOX', prefix, year, month, 0, paddingLength]
				);
			} else {
				// ดึงค่า Config จาก Database แทนการ Hardcode
				lastNumber = seqRows[0].last_number;
				prefix = seqRows[0].prefix;
				paddingLength = seqRows[0].padding_length;
			}

			const labels = [];
			let currentSeq = lastNumber;

			// 3. สร้างข้อมูล Label แต่ละดวง
			for (const item of items) {
				for (let i = 0; i < printCount; i++) {
					currentSeq++;
					const runningNum = currentSeq.toString().padStart(paddingLength, '0');
					
					// Format Box ID ตาม Prefix จาก DB (เช่น P + 26 + 03 + 000001 = P2603000001)
					// หมายเหตุ: หากต้องการให้มีขีดคั่นให้เติมขีดเข้าที่ String หรืออัปเดต Prefix เป็น "P-" ใน DB แทน
					const boxId = `${prefix}${year2Digits}${monthStr}${runningNum}`; 
					
					// Format QR Code: item code_box id_qty_lot
					const qrText = `${item.item_code}_${boxId}_${qtyPerLabel}_${lot}`;

					labels.push({
						item_code: item.item_code,
						item_name: item.item_name,
						box_id: boxId,
						qty: qtyPerLabel,
						lot: lot,
						qr_text: qrText
					});
				}
			}

			// 4. อัปเดต Last Number ล่าสุดกลับไปที่ Database
			await connection.execute(
				`UPDATE document_sequences SET last_number = ? WHERE document_type = 'BOX' AND year = ? AND month = ?`,
				[currentSeq, year, month]
			);

			await connection.commit();
			
			return json({ success: true, labels });

		} catch (dbError: any) {
			await connection.rollback();
			throw dbError;
		} finally {
			connection.release();
		}

	} catch (error: any) {
		console.error('Failed to generate labels:', error);
		return json({ success: false, message: error.message }, { status: 500 });
	}
};