import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

// --- Types ---
interface Location extends RowDataPacket {
	id: number;
	location_code: string;
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
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];
		
		if (searchQuery) {
			whereClause += ` AND (
                location_code LIKE ? OR
                zone LIKE ? OR
                area LIKE ? OR
                bin LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm);
		}

		const countSql = `SELECT COUNT(id) as total FROM locations ${whereClause}`;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / limit);

		const locationsSql = `
            SELECT *
            FROM locations
            ${whereClause}
            ORDER BY zone ASC, area ASC, bin ASC
            LIMIT ${limit} OFFSET ${offset}
        `; 
		
		const [locationRows] = await pool.execute<Location[]>(locationsSql, params);

		return {
			locations: locationRows,
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
	saveLocation: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString();

		const requiredPermission = id ? 'edit locations' : 'create locations';
		checkPermission(locals, requiredPermission);

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

		// ใช้รูปแบบ Zone-Area-Bin หากไม่ได้กรอก Location Code มา
		if (!location_code) {
			location_code = `${zone}-${area}-${bin}`;
		}

		const connection = await pool.getConnection();

		try {
			// ตรวจสอบ Location Code ซ้ำ
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

			if (id) {
				const sql = `UPDATE locations SET
                    location_code = ?, zone = ?, area = ?, bin = ?, min_capacity = ?, max_capacity = ?
                    WHERE id = ?`;
				await connection.execute(sql, [
					location_code, zone, area, bin, min_capacity, max_capacity, parseInt(id)
				]);
			} else {
				const sql = `INSERT INTO locations (
                    location_code, zone, area, bin, min_capacity, max_capacity
                 ) VALUES (?, ?, ?, ?, ?, ?)`;
				await connection.execute(sql, [
					location_code, zone, area, bin, min_capacity, max_capacity
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
	}
};