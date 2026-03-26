import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

// --- Types ---
interface SubWarehouse extends RowDataPacket {
	id: number;
	code: string;
	name: string;
	description: string;
	created_at: string;
	updated_at: string;
}

interface Location extends RowDataPacket {
	id: number;
	location_code: string;
	sub_warehouse_id: number | null;
	sub_warehouse_name: string | null;
	zone: string;
	area: string;
	bin: string;
	min_capacity: number;
	max_capacity: number;
	created_at: string;
	updated_at: string;
}

// --- Helper Functions ---
function parseFloatOrZero(value: FormDataEntryValue | null): number {
	if (value === null || value === undefined || value === '') return 0;
	const num = parseFloat(value.toString());
	return isNaN(num) ? 0 : num;
}

// --- Load Function ---
export const load: PageServerLoad = async ({ url, locals }) => {
	checkPermission(locals, 'view locations');

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';

	let limit = parseInt(url.searchParams.get('limit') || '10', 10);
	const allowedLimits = [10, 20, 50, 200];
	if (!allowedLimits.includes(limit)) {
		limit = 10;
	}
	const offset = (page - 1) * limit;

	try {
		// Fetch Sub Warehouses for dropdowns and management
		const [subWarehouses] = await pool.execute<SubWarehouse[]>(
			'SELECT * FROM sub_warehouses ORDER BY name ASC'
		);

		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];
		
		if (searchQuery) {
			whereClause += ` AND (
                l.location_code LIKE ? OR
                l.zone LIKE ? OR
                l.area LIKE ? OR
                l.bin LIKE ? OR
                sw.name LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
		}

		const countSql = `
            SELECT COUNT(l.id) as total 
            FROM locations l
            LEFT JOIN sub_warehouses sw ON l.sub_warehouse_id = sw.id
            ${whereClause}
        `;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / limit);

		const locationsSql = `
            SELECT l.*, sw.name as sub_warehouse_name 
            FROM locations l
            LEFT JOIN sub_warehouses sw ON l.sub_warehouse_id = sw.id
            ${whereClause}
            ORDER BY l.zone ASC, l.area ASC, l.bin ASC
            LIMIT ${limit} OFFSET ${offset}
        `; 
		
		const [locationRows] = await pool.execute<Location[]>(locationsSql, params);

		return {
			locations: locationRows,
			subWarehouses,
			currentPage: page,
			totalPages,
			limit,
			searchQuery
		};
	} catch (err: any) {
		console.error('Failed to load locations data:', err.message, err.stack);
		throw error(500, `Failed to load data. Error: ${err.message}`);
	}
};

// --- Actions ---
export const actions: Actions = {
	// ---------------- LOCATION ACTIONS ----------------
	saveLocation: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString();

		const requiredPermission = id ? 'edit locations' : 'create locations';
		checkPermission(locals, requiredPermission);

		const sub_warehouse_id = formData.get('sub_warehouse_id')?.toString() || null;
		const zone = formData.get('zone')?.toString()?.trim() || '';
		const area = formData.get('area')?.toString()?.trim() || '';
		const bin = formData.get('bin')?.toString()?.trim() || '';
		let location_code = formData.get('location_code')?.toString()?.trim();
		const min_capacity = parseFloatOrZero(formData.get('min_capacity'));
		const max_capacity = parseFloatOrZero(formData.get('max_capacity'));

		if (!zone || !area || !bin) {
			return fail(400, {
				action: 'saveLocation',
				success: false,
				message: 'Zone, Area, and Bin are required.'
			});
		}

		if (!location_code) {
			location_code = `${zone}-${area}-${bin}`;
		}

		const connection = await pool.getConnection();

		try {
			let codeCheckSql = 'SELECT id FROM locations WHERE location_code = ?';
			let codeCheckParams: (string | number)[] = [location_code];

			if (id) {
				codeCheckSql += ' AND id != ?';
				codeCheckParams.push(parseInt(id));
			}

			const [existingLocations] = await connection.execute<any[]>(codeCheckSql, codeCheckParams);
			
			if (existingLocations.length > 0) {
				connection.release();
				return fail(400, {
					action: 'saveLocation',
					success: false,
					message: `The location code "${location_code}" already exists.`
				});
			}

			await connection.beginTransaction();

			const swId = sub_warehouse_id ? parseInt(sub_warehouse_id) : null;

			if (id) {
				const sql = `UPDATE locations SET
                    sub_warehouse_id = ?, location_code = ?, zone = ?, area = ?, bin = ?, min_capacity = ?, max_capacity = ?
                    WHERE id = ?`;
				await connection.execute(sql, [
					swId, location_code, zone, area, bin, min_capacity, max_capacity, parseInt(id)
				]);
			} else {
				const sql = `INSERT INTO locations (
                    sub_warehouse_id, location_code, zone, area, bin, min_capacity, max_capacity
                 ) VALUES (?, ?, ?, ?, ?, ?, ?)`;
				await connection.execute(sql, [
					swId, location_code, zone, area, bin, min_capacity, max_capacity
				]);
			}

			await connection.commit();
			return { action: 'saveLocation', success: true, message: `Location '${location_code}' saved successfully!` };
		} catch (err: any) {
			await connection.rollback();
			console.error(`Database error on saving location: ${err.message}`, err.stack);
			return fail(500, { action: 'saveLocation', success: false, message: `Failed to save location. Error: ${err.message}` });
		} finally {
			connection.release();
		}
	},

	deleteLocation: async ({ request, locals }) => {
		checkPermission(locals, 'delete locations');
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { action: 'deleteLocation', success: false, message: 'Invalid ID.' });

		try {
			const [deleteResult] = await pool.execute('DELETE FROM locations WHERE id = ?', [parseInt(id)]);
			if ((deleteResult as any).affectedRows === 0) {
				return fail(404, { action: 'deleteLocation', success: false, message: 'Location not found.' });
			}
			return { action: 'deleteLocation', success: true, message: 'Location deleted successfully.' };
		} catch (error: any) {
			if (error.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, { action: 'deleteLocation', success: false, message: 'Cannot delete location. It is currently in use by inventory items.' });
			}
			return fail(500, { action: 'deleteLocation', success: false, message: `Failed to delete location. Error: ${error.message}` });
		}
	},

	// ---------------- SUB WAREHOUSE ACTIONS ----------------
	saveSubWarehouse: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString();

		// You might want to create specific permissions like 'manage sub warehouses' later
		checkPermission(locals, id ? 'edit locations' : 'create locations'); 

		const code = formData.get('code')?.toString()?.trim() || '';
		const name = formData.get('name')?.toString()?.trim() || '';
		const description = formData.get('description')?.toString()?.trim() || '';

		if (!code || !name) {
			return fail(400, {
				action: 'saveSubWarehouse',
				success: false,
				message: 'Code and Name are required.'
			});
		}

		try {
			if (id) {
				const sql = `UPDATE sub_warehouses SET code = ?, name = ?, description = ? WHERE id = ?`;
				await pool.execute(sql, [code, name, description, parseInt(id)]);
			} else {
				const sql = `INSERT INTO sub_warehouses (code, name, description) VALUES (?, ?, ?)`;
				await pool.execute(sql, [code, name, description]);
			}
			return { action: 'saveSubWarehouse', success: true, message: `Sub Warehouse '${name}' saved successfully!` };
		} catch (err: any) {
			if (err.code === 'ER_DUP_ENTRY') {
				return fail(400, { action: 'saveSubWarehouse', success: false, message: `The code "${code}" is already in use.` });
			}
			console.error(`Database error on saving Sub Warehouse: ${err.message}`, err.stack);
			return fail(500, { action: 'saveSubWarehouse', success: false, message: `Failed to save Sub Warehouse. Error: ${err.message}` });
		}
	},

	deleteSubWarehouse: async ({ request, locals }) => {
		checkPermission(locals, 'delete locations');
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { action: 'deleteSubWarehouse', success: false, message: 'Invalid ID.' });

		try {
			const [deleteResult] = await pool.execute('DELETE FROM sub_warehouses WHERE id = ?', [parseInt(id)]);
			if ((deleteResult as any).affectedRows === 0) {
				return fail(404, { action: 'deleteSubWarehouse', success: false, message: 'Sub Warehouse not found.' });
			}
			return { action: 'deleteSubWarehouse', success: true, message: 'Sub Warehouse deleted successfully.' };
		} catch (error: any) {
			if (error.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, { action: 'deleteSubWarehouse', success: false, message: 'Cannot delete this Sub Warehouse. It is currently linked to one or more Locations.' });
			}
			return fail(500, { action: 'deleteSubWarehouse', success: false, message: `Failed to delete. Error: ${error.message}` });
		}
	}
};