import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

// --- Types ---
interface Item extends RowDataPacket {
	id: number;
	item_code: string;
	item_name: string;
	item_name_eng: string | null;
	unit_id: number;
	min_stock: number;
	max_stock: number;
	created_at: string;
	updated_at: string;
	// Joined fields
	unit_name?: string | null;
	unit_symbol?: string | null;
}

interface Unit extends RowDataPacket {
	id: number;
	name: string;
	symbol: string;
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

// ระบบ Auto-run สำหรับ Item Code
async function generateItemCode() {
	const prefix = 'ITM';
	const today = new Date();
	const year = today.getFullYear().toString().slice(-2);
	const month = (today.getMonth() + 1).toString().padStart(2, '0');
	const datePrefix = `${prefix}${year}${month}`;

	const [rows]: any[] = await pool.execute(
		`SELECT item_code FROM items WHERE item_code LIKE ? ORDER BY item_code DESC LIMIT 1`,
		[`${datePrefix}-%`]
	);

	let nextNumber = 1;
	if (rows.length > 0) {
		const lastCode = rows[0].item_code;
		const parts = lastCode.split('-');
		if (parts.length > 1) {
			const lastNumber = parseInt(parts[1], 10);
			if (!isNaN(lastNumber)) {
				nextNumber = lastNumber + 1;
			}
		}
	}
	return `${datePrefix}-${nextNumber.toString().padStart(4, '0')}`;
}

// --- Load Function ---
export const load: PageServerLoad = async ({ url, locals }) => {
	checkPermission(locals, 'view items master');

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
                i.item_code LIKE ? OR
                i.item_name LIKE ? OR
                i.item_name_eng LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm);
		}

		const countSql = `SELECT COUNT(i.id) as total FROM items i ${whereClause}`;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / limit);

		const itemsSql = `
            SELECT
                i.*,
                u.name AS unit_name,
                u.symbol AS unit_symbol
            FROM items i
            LEFT JOIN units u ON i.unit_id = u.id  
            ${whereClause}
            ORDER BY i.item_code ASC
            LIMIT ${limit} OFFSET ${offset}
        `; 
		
		const [itemRows] = await pool.execute<Item[]>(itemsSql, params);

		const [unitRows] = await pool.execute<Unit[]>(
			'SELECT id, name, symbol FROM units ORDER BY name'
		);

		// ดึงชื่อและโลโก้บริษัทจากตาราง company (ดึง record แรก)
		const [companyRows] = await pool.execute<RowDataPacket[]>(
			'SELECT name, logo_path FROM company LIMIT 1'
		);
		const companyName = companyRows.length > 0 ? companyRows[0].name : '';
		const companyLogo = companyRows.length > 0 ? companyRows[0].logo_path : null;

		return {
			items: itemRows,
			units: unitRows,
			currentPage: page,
			totalPages,
			limit,
			searchQuery,
			companyName,
			companyLogo // ส่ง Logo Path ไปให้หน้าบ้าน
		};
	} catch (err: any) {
		console.error('Failed to load items data:', err.message, err.stack);
		throw error(500, `Failed to load data. Error: ${err.message}`);
	}
};

// --- Actions ---
export const actions: Actions = {
	saveItem: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString();

		const requiredPermission = id ? 'edit items' : 'create items';
		checkPermission(locals, requiredPermission);

		let item_code = formData.get('item_code')?.toString()?.trim();
		const item_name = formData.get('item_name')?.toString()?.trim();
		const item_name_eng = formData.get('item_name_eng')?.toString()?.trim() || null;
		const unit_id = parseNumberOrNull(formData.get('unit_id'));
		const min_stock = parseFloatOrZero(formData.get('min_stock'));
		const max_stock = parseFloatOrZero(formData.get('max_stock'));

		if (!item_name || !unit_id) {
			return fail(400, {
				action: 'saveItem',
				success: false,
				message: 'Item Name and Unit are required.'
			});
		}

		// ใช้ Auto-run หากไม่กรอก item_code
		if (!item_code) {
			item_code = await generateItemCode();
		}

		const connection = await pool.getConnection();

		try {
			// ตรวจสอบ Item Code ซ้ำ
			let codeCheckSql = 'SELECT id FROM items WHERE item_code = ?';
			let codeCheckParams: (string | number)[] = [item_code];

			if (id) {
				codeCheckSql += ' AND id != ?';
				codeCheckParams.push(parseInt(id));
			}

			const [existingItems] = await connection.execute<any[]>(codeCheckSql, codeCheckParams);
			
			if (existingItems.length > 0) {
				connection.release();
				return fail(400, {
					action: 'saveItem',
					success: false,
					message: `The item code "${item_code}" already exists.`
				});
			}

			await connection.beginTransaction();

			if (id) {
				const sql = `UPDATE items SET
                    item_code = ?, item_name = ?, item_name_eng = ?, unit_id = ?, min_stock = ?, max_stock = ?
                    WHERE id = ?`;
				await connection.execute(sql, [
					item_code, item_name, item_name_eng, unit_id, min_stock, max_stock, parseInt(id)
				]);
			} else {
				const sql = `INSERT INTO items (
                    item_code, item_name, item_name_eng, unit_id, min_stock, max_stock
                 ) VALUES (?, ?, ?, ?, ?, ?)`;
				await connection.execute(sql, [
					item_code, item_name, item_name_eng, unit_id, min_stock, max_stock
				]);
			}

			await connection.commit();
			return { action: 'saveItem', success: true, message: `Item '${item_code}' saved successfully!` };
		} catch (err: any) {
			await connection.rollback();
			console.error(`Database error on saving item: ${err.message}`, err.stack);
			return fail(500, { action: 'saveItem', success: false, message: `Failed to save item. Error: ${err.message}` });
		} finally {
			connection.release();
		}
	},

	deleteItem: async ({ request, locals }) => {
		checkPermission(locals, 'delete items');
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { action: 'deleteItem', success: false, message: 'Invalid ID.' });

		try {
			const [deleteResult] = await pool.execute('DELETE FROM items WHERE id = ?', [parseInt(id)]);
			if ((deleteResult as any).affectedRows === 0) {
				return fail(404, { action: 'deleteItem', success: false, message: 'Item not found.' });
			}
			return { action: 'deleteItem', success: true, message: 'Item deleted successfully.' };
		} catch (error: any) {
			if (error.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, { action: 'deleteItem', success: false, message: 'Cannot delete item. It is currently in use.' });
			}
			return fail(500, { action: 'deleteItem', success: false, message: `Failed to delete item. Error: ${error.message}` });
		}
	}
};