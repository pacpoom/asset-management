import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
// import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

interface Item extends RowDataPacket {
	id: number;
	item_code: string;
	item_name: string;
}

interface Location extends RowDataPacket {
	id: number;
	location_code: string;
}

export const load: PageServerLoad = async ({ locals }) => {
	// checkPermission(locals, 'view putaway');

	try {
		// โหลด Master Data มาเตรียมไว้สำหรับการ Validate ฝั่ง Client
		const [items] = await pool.execute<Item[]>('SELECT id, item_code, item_name FROM items');
		const [locations] = await pool.execute<Location[]>('SELECT id, location_code FROM locations');

		return {
			items,
			locations
		};
	} catch (err: any) {
		console.error('Failed to load master data:', err);
		throw error(500, `Failed to load master data. Error: ${err.message}`);
	}
};

export const actions: Actions = {
	savePutAway: async ({ request, locals }) => {
		// checkPermission(locals, 'create putaway');
		
		const formData = await request.formData();
		const dest_location_id = parseInt(formData.get('location_id')?.toString() || '0');
		const item_id = parseInt(formData.get('item_id')?.toString() || '0');
		const serial_number = formData.get('serial_number')?.toString()?.trim();
		
		const nowStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' });

		if (!dest_location_id || !item_id || !serial_number) {
			return fail(400, { action: 'savePutAway', success: false, message: 'ข้อมูลไม่ครบถ้วน กรุณาสแกนให้ครบถ้วน' });
		}

		const connection = await pool.getConnection();

		try {
			await connection.beginTransaction();

			// 1. ตรวจสอบว่ามีสินค้านี้ใน Inventory Stock หรือไม่
			const [stockRows] = await connection.execute<RowDataPacket[]>(
				`SELECT inv.id, inv.location_id, inv.qty, l.location_code as old_loc_code 
				 FROM inventory_stock inv 
				 LEFT JOIN locations l ON inv.location_id = l.id 
				 WHERE inv.item_id = ? AND inv.serial_number = ?`,
				[item_id, serial_number]
			);

			if (stockRows.length === 0) {
				connection.release();
				return fail(404, { action: 'savePutAway', success: false, message: `ไม่พบ Serial Number "${serial_number}" ในระบบสต็อก` });
			}

			const stock = stockRows[0];

			// 2. ตรวจสอบว่า Location เดิม ตรงกับ Location ปลายทางหรือไม่ (ป้องกันย้ายไปที่เดิม)
			if (stock.location_id === dest_location_id) {
				connection.release();
				return fail(400, { action: 'savePutAway', success: false, message: `สินค้านี้อยู่ใน Location "${stock.old_loc_code}" อยู่แล้ว` });
			}

			// ดึงชื่อ Location ปลายทางมาเพื่อใช้ลง Log
			const [destLocRows] = await connection.execute<RowDataPacket[]>('SELECT location_code FROM locations WHERE id = ?', [dest_location_id]);
			const destLocCode = destLocRows[0].location_code;

			// 3. Update Location ใหม่ใน Inventory Stock
			await connection.execute(
				'UPDATE inventory_stock SET location_id = ?, updated_at = ? WHERE id = ?',
				[dest_location_id, nowStr, stock.id]
			);

			// 4. Insert Transaction Log
			const logSql = `INSERT INTO transaction_logs (
				transaction_type, item_id, location_id, serial_number, qty_change, notes, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?)`;
			
			await connection.execute(logSql, [
				'PUT_AWAY', 
				item_id, 
				dest_location_id, // เก็บ Location ปลายทาง
				serial_number, 
				stock.qty, // บันทึกจำนวนที่ย้าย
				`ย้ายจาก ${stock.old_loc_code} ไปยัง ${destLocCode} (Stock ID: ${stock.id})`, 
				nowStr
			]);

			await connection.commit();
			return { action: 'savePutAway', success: true, message: `จัดเก็บ Serial: ${serial_number} ไปยัง ${destLocCode} สำเร็จ!` };
		} catch (err: any) {
			await connection.rollback();
			console.error(`Database error on put-away:`, err);
			return fail(500, { action: 'savePutAway', success: false, message: `เกิดข้อผิดพลาดในการบันทึก: ${err.message}` });
		} finally {
			connection.release();
		}
	}
};