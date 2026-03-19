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
	// checkPermission(locals, 'create outbound'); 

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
	saveOutbound: async ({ request, locals }) => {
		// checkPermission(locals, 'create outbound');
		
		const formData = await request.formData();
		const location_id = parseInt(formData.get('location_id')?.toString() || '0');
		const item_id = parseInt(formData.get('item_id')?.toString() || '0');
		const serial_number = formData.get('serial_number')?.toString()?.trim() || null;
		const deduct_qty = parseFloat(formData.get('qty')?.toString() || '1');
		
		const nowStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' });

		if (!location_id || !item_id || isNaN(deduct_qty) || deduct_qty <= 0) {
			return fail(400, { action: 'saveOutbound', success: false, message: 'ข้อมูลไม่ครบถ้วน หรือระบุจำนวนไม่ถูกต้อง' });
		}

		const connection = await pool.getConnection();

		try {
			await connection.beginTransaction();

			// 1. ตรวจสอบว่ามีสินค้านี้ใน Location ต้นทางหรือไม่ และมีสต็อกเพียงพอไหม
			let queryStock = `
				SELECT inv.id, inv.qty, inv.actual_qty, l.location_code 
				FROM inventory_stock inv 
				LEFT JOIN locations l ON inv.location_id = l.id 
				WHERE inv.item_id = ? AND inv.location_id = ?
			`;
			const queryParams: any[] = [item_id, location_id];

			if (serial_number) {
				queryStock += ` AND inv.serial_number = ?`;
				queryParams.push(serial_number);
			} else {
				queryStock += ` AND (inv.serial_number IS NULL OR inv.serial_number = '')`;
			}

			const [stockRows] = await connection.execute<RowDataPacket[]>(queryStock, queryParams);

			if (stockRows.length === 0) {
				connection.release();
				return fail(404, { action: 'saveOutbound', success: false, message: `ไม่พบสินค้าหรือ Serial Number นี้ใน Location ที่ระบุ` });
			}

			const stock = stockRows[0];

			if (stock.qty < deduct_qty) {
				connection.release();
				return fail(400, { action: 'saveOutbound', success: false, message: `ยอดสต็อกไม่เพียงพอ (มีอยู่: ${stock.qty}, ต้องการตัด: ${deduct_qty})` });
			}

			// 2. หักลบจำนวนสต็อก
			const newQty = stock.qty - deduct_qty;
			const newActualQty = stock.actual_qty - deduct_qty;

			await connection.execute(
				'UPDATE inventory_stock SET qty = ?, actual_qty = ?, updated_at = ? WHERE id = ?',
				[newQty, newActualQty, nowStr, stock.id]
			);

			// 3. Insert Transaction Log (qty_change ติดลบ)
			const logSql = `INSERT INTO transaction_logs (
				transaction_type, item_id, location_id, serial_number, qty_change, notes, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?)`;
			
			await connection.execute(logSql, [
				'OUTBOUND_ISSUE', 
				item_id, 
				location_id, 
				serial_number, 
				-deduct_qty, // ติดลบเพื่อแสดงว่าเป็นการเอาออก
				`ตัดสต็อกออกจาก ${stock.location_code} (Stock ID: ${stock.id})`, 
				nowStr
			]);

			await connection.commit();
			return { action: 'saveOutbound', success: true, message: `ตัดยอดสินค้า Serial: ${serial_number || 'ไม่มี SN'} จำนวน ${deduct_qty} สำเร็จ!` };
		} catch (err: any) {
			await connection.rollback();
			console.error(`Database error on outbound:`, err);
			return fail(500, { action: 'saveOutbound', success: false, message: `เกิดข้อผิดพลาดในการบันทึก: ${err.message}` });
		} finally {
			connection.release();
		}
	}
};