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
		const qty = parseFloat(formData.get('qty')?.toString() || '1');
		
		// ใช้วันที่ปัจจุบันตาม Local Timezone ของ Server
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		const inbound_date = `${year}-${month}-${day}`;

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

			const sql = `INSERT INTO inventory_stock (
				item_id, location_id, serial_number, qty, actual_qty, inbound_date
			) VALUES (?, ?, ?, ?, ?, ?)`;
			
			await connection.execute(sql, [
				item_id, location_id, serial_number, qty, qty, inbound_date // ให้ actual_qty เท่ากับ qty เริ่มต้น
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