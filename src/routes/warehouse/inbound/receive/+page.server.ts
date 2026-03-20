import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
// import { checkPermission } from '$lib/server/auth'; // เปิดใช้เมื่อต้องการเช็คสิทธิ์
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
	// checkPermission(locals, 'view inbound'); // ปรับตามสิทธิ์ที่มี

	try {
		// โหลด Master Data มาไว้ใช้สำหรับ Validate ฝั่ง Client เพื่อความรวดเร็วเวลาสแกน
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
	saveInbound: async ({ request, locals }) => {
		// checkPermission(locals, 'create inbound');
		
		const formData = await request.formData();
		const location_id = formData.get('location_id')?.toString();
		const item_id = formData.get('item_id')?.toString();
		const serial_number = formData.get('serial_number')?.toString()?.trim();
		const serial_id = formData.get('serial_id')?.toString()?.trim(); // รับค่า serial_id (Label ตัวเต็ม)
		const qty = parseFloat(formData.get('qty')?.toString() || '1');
		
		// บังคับใช้ Timezone ของไทย (Asia/Bangkok) เพื่อแก้ปัญหา Database ตั้งค่าเป็น UTC
		const nowStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' });
		
		const created_at = nowStr; // "YYYY-MM-DD HH:mm:ss"
		const inbound_date = nowStr.split(' ')[0]; // "YYYY-MM-DD"

		if (!location_id || !item_id || isNaN(qty) || qty <= 0) {
			return fail(400, { action: 'saveInbound', success: false, message: 'ข้อมูลไม่ครบถ้วน หรือระบุจำนวนไม่ถูกต้อง' });
		}

		const connection = await pool.getConnection();

		try {
			// ตรวจสอบ Serial Number ซ้ำ
			if (serial_number) {
				const [existing] = await connection.execute<RowDataPacket[]>(
					'SELECT id FROM inventory_stock WHERE serial_number = ?',
					[serial_number]
				);
				if (existing.length > 0) {
					connection.release();
					return fail(400, { action: 'saveInbound', success: false, message: `Serial Number "${serial_number}" มีในระบบแล้ว ไม่สามารถรับซ้ำได้` });
				}
			}

			await connection.beginTransaction();

			// 1. Insert ลง Inventory Stock (เพิ่ม serial_id)
			const sql = `INSERT INTO inventory_stock (
				item_id, location_id, serial_number, serial_id, qty, actual_qty, inbound_date, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
			
			const [result] = await connection.execute<any>(sql, [
				item_id, location_id, serial_number, serial_id, qty, qty, inbound_date, created_at, created_at 
			]);

			// 2. Insert ลง Transaction Log
			const logSql = `INSERT INTO transaction_logs (
				transaction_type, item_id, location_id, serial_number, qty_change, notes, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?)`;
			await connection.execute(logSql, [
				'INBOUND_RECEIVE', item_id, location_id, serial_number, qty, `รับเข้าจากหน้า Inbound (Stock ID: ${result.insertId})`, created_at
			]);

			await connection.commit();
			return { action: 'saveInbound', success: true, message: `รับเข้า Serial: ${serial_number || 'ไม่ระบุ'} จำนวน ${qty} สำเร็จ!` };
		} catch (err: any) {
			await connection.rollback();
			console.error(`Database error on inbound:`, err);
			return fail(500, { action: 'saveInbound', success: false, message: `เกิดข้อผิดพลาดในการบันทึก: ${err.message}` });
		} finally {
			connection.release();
		}
	}
};