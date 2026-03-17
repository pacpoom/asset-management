import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

interface ItemRoute extends RowDataPacket {
	id: number;
	item_id: number;
	route_no: string;
	route_name: string;
	min: number;
	max: number;
	created_at: string;
	updated_at: string;
	// Joined fields
	item_code?: string;
	item_name?: string;
}

interface Item extends RowDataPacket {
	id: number;
	item_code: string;
	item_name: string;
}

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

// ระบบ Auto-run สำหรับ Route No
async function generateRouteNo() {
	const prefix = 'RT';
	const today = new Date();
	const year = today.getFullYear().toString().slice(-2);
	const month = (today.getMonth() + 1).toString().padStart(2, '0');
	const datePrefix = `${prefix}${year}${month}`;

	const [rows]: any[] = await pool.execute(
		`SELECT route_no FROM item_routes WHERE route_no LIKE ? ORDER BY route_no DESC LIMIT 1`,
		[`${datePrefix}-%`]
	);

	let nextNumber = 1;
	if (rows.length > 0) {
		const lastCode = rows[0].route_no;
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

export const load: PageServerLoad = async ({ url, locals }) => {
	checkPermission(locals, 'view item routes');

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	let limit = parseInt(url.searchParams.get('limit') || '10', 10);
	const allowedLimits = [10, 20, 50, 200];
	if (!allowedLimits.includes(limit)) limit = 10;
	const offset = (page - 1) * limit;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];
		
		if (searchQuery) {
			whereClause += ` AND (
                r.route_no LIKE ? OR
                r.route_name LIKE ? OR
                i.item_code LIKE ? OR
                i.item_name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm);
		}

		const countSql = `
            SELECT COUNT(r.id) as total 
            FROM item_routes r 
            LEFT JOIN items i ON r.item_id = i.id 
            ${whereClause}
        `;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / limit);

		const routesSql = `
            SELECT
                r.*,
                i.item_code,
                i.item_name
            FROM item_routes r
            LEFT JOIN items i ON r.item_id = i.id  
            ${whereClause}
            ORDER BY r.route_no ASC
            LIMIT ${limit} OFFSET ${offset}
        `; 
		
		const [routeRows] = await pool.execute<ItemRoute[]>(routesSql, params);

		const [itemRows] = await pool.execute<Item[]>(
			'SELECT id, item_code, item_name FROM items ORDER BY item_code'
		);

		return {
			routes: routeRows,
			items: itemRows,
			currentPage: page,
			totalPages,
			limit,
			searchQuery
		};
	} catch (err: any) {
		console.error('Failed to load route data:', err.message);
		throw error(500, `Failed to load data.`);
	}
};

export const actions: Actions = {
	saveRoute: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString();

		const requiredPermission = id ? 'edit item routes' : 'create item routes';
		checkPermission(locals, requiredPermission);

		let route_no = formData.get('route_no')?.toString()?.trim();
		const route_name = formData.get('route_name')?.toString()?.trim();
		const item_id = parseNumberOrNull(formData.get('item_id'));
		const min = parseFloatOrZero(formData.get('min'));
		const max = parseFloatOrZero(formData.get('max'));

		if (!route_name || !item_id) {
			return fail(400, { action: 'saveRoute', success: false, message: 'Item and Route Name are required.' });
		}

		// ใช้ Auto-run หากไม่กรอก route_no
		if (!route_no) {
			route_no = await generateRouteNo();
		}

		const connection = await pool.getConnection();

		try {
			// ตรวจสอบว่า Route No ซ้ำหรือไม่
			let codeCheckSql = 'SELECT id FROM item_routes WHERE route_no = ?';
			let codeCheckParams: (string | number)[] = [route_no];

			if (id) {
				codeCheckSql += ' AND id != ?';
				codeCheckParams.push(parseInt(id));
			}

			const [existingRoutes] = await connection.execute<any[]>(codeCheckSql, codeCheckParams);
			
			if (existingRoutes.length > 0) {
				connection.release();
				return fail(400, { action: 'saveRoute', success: false, message: `The route no "${route_no}" already exists.` });
			}

			await connection.beginTransaction();

			if (id) {
				const sql = `UPDATE item_routes SET item_id = ?, route_no = ?, route_name = ?, min = ?, max = ? WHERE id = ?`;
				await connection.execute(sql, [item_id, route_no, route_name, min, max, parseInt(id)]);
			} else {
				const sql = `INSERT INTO item_routes (item_id, route_no, route_name, min, max) VALUES (?, ?, ?, ?, ?)`;
				await connection.execute(sql, [item_id, route_no, route_name, min, max]);
			}

			await connection.commit();
			return { action: 'saveRoute', success: true, message: `Route '${route_no}' saved successfully!` };
		} catch (err: any) {
			await connection.rollback();
			console.error(`Database error: ${err.message}`);
			return fail(500, { action: 'saveRoute', success: false, message: `Failed to save route. Error: ${err.message}` });
		} finally {
			connection.release();
		}
	},

	deleteRoute: async ({ request, locals }) => {
		checkPermission(locals, 'delete item routes');
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { action: 'deleteRoute', success: false, message: 'Invalid ID.' });

		try {
			const [deleteResult] = await pool.execute('DELETE FROM item_routes WHERE id = ?', [parseInt(id)]);
			if ((deleteResult as any).affectedRows === 0) {
				return fail(404, { action: 'deleteRoute', success: false, message: 'Route not found.' });
			}
			return { action: 'deleteRoute', success: true, message: 'Route deleted successfully.' };
		} catch (error: any) {
			return fail(500, { action: 'deleteRoute', success: false, message: `Failed to delete route. Error: ${error.message}` });
		}
	}
};