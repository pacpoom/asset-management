import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

// --- Types ---
interface InventoryStock extends RowDataPacket {
	id: number;
	item_id: number;
	location_id: number;
	serial_number: string | null;
	serial_id: string | null;
	qty: number;
	actual_qty: number;
	inbound_date: string;
	created_at: string;
	updated_at: string;
	// Joined fields
	item_code?: string;
	item_name?: string;
	location_code?: string;
	sub_warehouse_name?: string | null;
	unit_name?: string;
	unit_symbol?: string;
}

interface Item extends RowDataPacket {
	id: number;
	item_code: string;
	item_name: string;
}

interface Location extends RowDataPacket {
	id: number;
	location_code: string;
	sub_warehouse_name?: string | null;
}

// --- Helper Functions ---
function parseFloatOrZero(value: FormDataEntryValue | null): number {
	if (value === null || value === undefined || value === '') return 0;
	const num = parseFloat(value.toString());
	return isNaN(num) ? 0 : num;
}
function parseNumberOrNull(value: FormDataEntryValue | null): number | null {
	if (value === null || value === undefined || value === '') return null;
	const num = Number(value);
	return isNaN(num) ? null : num;
}

// --- Load Function ---
export const load: PageServerLoad = async ({ url, locals }) => {
	checkPermission(locals, 'view inventory stock');

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';

	let limit = parseInt(url.searchParams.get('limit') || '10', 10);
	const allowedLimits = [10, 20, 50, 200];
	if (!allowedLimits.includes(limit)) {
		limit = 10;
	}
	const offset = (page - 1) * limit;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];
		
		if (searchQuery) {
			whereClause += ` AND (
                inv.serial_number LIKE ? OR
                inv.serial_id LIKE ? OR
                i.item_code LIKE ? OR
                i.item_name LIKE ? OR
                l.location_code LIKE ? OR
                sw.name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
		}

		const countSql = `
            SELECT COUNT(inv.id) as total 
            FROM inventory_stock inv
            LEFT JOIN items i ON inv.item_id = i.id
            LEFT JOIN locations l ON inv.location_id = l.id
            LEFT JOIN sub_warehouses sw ON l.sub_warehouse_id = sw.id
            ${whereClause}
        `;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / limit);

		const stockSql = `
            SELECT
                inv.*,
                i.item_code,
                i.item_name,
                u.name AS unit_name,
                u.symbol AS unit_symbol,
                l.location_code,
                sw.name AS sub_warehouse_name
            FROM inventory_stock inv
            LEFT JOIN items i ON inv.item_id = i.id
            LEFT JOIN units u ON i.unit_id = u.id
            LEFT JOIN locations l ON inv.location_id = l.id
            LEFT JOIN sub_warehouses sw ON l.sub_warehouse_id = sw.id
            ${whereClause}
            ORDER BY inv.created_at DESC, inv.id DESC
            LIMIT ${limit} OFFSET ${offset}
        `; 
		
		const [stockRows] = await pool.execute<InventoryStock[]>(stockSql, params);

		// โหลด Data สำหรับทำ Dropdown
		const [itemRows] = await pool.execute<Item[]>('SELECT id, item_code, item_name FROM items ORDER BY item_code');
		const [locationRows] = await pool.execute<Location[]>('SELECT l.id, l.location_code, sw.name AS sub_warehouse_name FROM locations l LEFT JOIN sub_warehouses sw ON l.sub_warehouse_id = sw.id ORDER BY l.location_code');

		return {
			stocks: stockRows,
			items: itemRows,
			locations: locationRows,
			currentPage: page,
			totalPages,
			limit,
			searchQuery
		};
	} catch (err: any) {
		console.error('Failed to load inventory stock data:', err.message, err.stack);
		throw error(500, `Failed to load data. Error: ${err.message}`);
	}
};

// --- Actions ---
export const actions: Actions = {
	saveStock: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString();

		const requiredPermission = id ? 'edit inventory stock' : 'create inventory stock';
		checkPermission(locals, requiredPermission);

		const item_id = parseNumberOrNull(formData.get('item_id'));
		const location_id = parseNumberOrNull(formData.get('location_id'));
		const serial_number = formData.get('serial_number')?.toString()?.trim() || null;
		const serial_id = formData.get('serial_id')?.toString()?.trim() || null;
		const qty = parseFloatOrZero(formData.get('qty'));
		const actual_qty = parseFloatOrZero(formData.get('actual_qty'));
		const inbound_date = formData.get('inbound_date')?.toString();

		if (!item_id || !location_id || !inbound_date) {
			return fail(400, {
				action: 'saveStock',
				success: false,
				message: 'Item, Location, and Inbound Date are required.'
			});
		}

		const connection = await pool.getConnection();

		try {
			// ตรวจสอบ Serial Number ซ้ำ (ถ้ามีการกรอกเข้ามา)
			if (serial_number) {
				let checkSql = 'SELECT id FROM inventory_stock WHERE serial_number = ?';
				let checkParams: (string | number)[] = [serial_number];

				if (id) {
					checkSql += ' AND id != ?';
					checkParams.push(parseInt(id));
				}

				const [existingSerial] = await connection.execute<any[]>(checkSql, checkParams);
				
				if (existingSerial.length > 0) {
					connection.release();
					return fail(400, {
						action: 'saveStock',
						success: false,
						message: `The Serial Number "${serial_number}" already exists.`
					});
				}
			}

			await connection.beginTransaction();

			if (id) {
				const sql = `UPDATE inventory_stock SET
                    item_id = ?, location_id = ?, serial_number = ?, serial_id = ?, qty = ?, actual_qty = ?, inbound_date = ?
                    WHERE id = ?`;
				await connection.execute(sql, [
					item_id, location_id, serial_number, serial_id, qty, actual_qty, inbound_date, parseInt(id)
				]);
			} else {
				const sql = `INSERT INTO inventory_stock (
                    item_id, location_id, serial_number, serial_id, qty, actual_qty, inbound_date
                 ) VALUES (?, ?, ?, ?, ?, ?, ?)`;
				await connection.execute(sql, [
					item_id, location_id, serial_number, serial_id, qty, actual_qty, inbound_date
				]);
			}

			await connection.commit();
			return { action: 'saveStock', success: true, message: `Inventory Stock saved successfully!` };
		} catch (err: any) {
			await connection.rollback();
			console.error(`Database error on saving stock: ${err.message}`, err.stack);
			return fail(500, { action: 'saveStock', success: false, message: `Failed to save stock. Error: ${err.message}` });
		} finally {
			connection.release();
		}
	},

	deleteStock: async ({ request, locals }) => {
		checkPermission(locals, 'delete inventory stock');
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { action: 'deleteStock', success: false, message: 'Invalid ID.' });

		try {
			const [deleteResult] = await pool.execute('DELETE FROM inventory_stock WHERE id = ?', [parseInt(id)]);
			if ((deleteResult as any).affectedRows === 0) {
				return fail(404, { action: 'deleteStock', success: false, message: 'Stock record not found.' });
			}
			return { action: 'deleteStock', success: true, message: 'Stock record deleted successfully.' };
		} catch (error: any) {
			return fail(500, { action: 'deleteStock', success: false, message: `Failed to delete stock. Error: ${error.message}` });
		}
	}
};