import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
// import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

// Type definitions
type UnitConversion = RowDataPacket & {
	id: number;
	from_unit_id: number;
	to_unit_id: number;
	conversion_factor: number;
	from_unit_name: string;
	from_unit_symbol: string;
	to_unit_name: string;
	to_unit_symbol: string;
};

type Unit = RowDataPacket & {
	id: number;
	name: string;
	symbol: string;
};

/**
 * Loads all unit conversions and available units.
 */
export const load: PageServerLoad = async ({ locals }) => {
	// checkPermission(locals, 'manage unit conversions');

	try {
		// Fetch all conversions with unit names/symbols
		const [conversionRows] = await pool.execute<UnitConversion[]>(`
            SELECT
                uc.id, uc.from_unit_id, uc.to_unit_id, uc.conversion_factor,
                fu.name as from_unit_name, fu.symbol as from_unit_symbol,
                tu.name as to_unit_name, tu.symbol as to_unit_symbol
            FROM unit_conversions uc
            JOIN units fu ON uc.from_unit_id = fu.id
            JOIN units tu ON uc.to_unit_id = tu.id
            ORDER BY fu.name ASC, tu.name ASC
        `);

		// Fetch all units for dropdowns
		const [unitRows] = await pool.execute<Unit[]>('SELECT id, name, symbol FROM units ORDER BY name ASC');

		return {
			conversions: conversionRows,
			units: unitRows
		};
	} catch (err: any) {
		console.error('Failed to load unit conversions data:', err.message, err.stack);
		throw error(500, `Failed to load data. Error: ${err.message}`);
	}
};

/**
 * Actions for saving and deleting unit conversions.
 */
export const actions: Actions = {
	/**
	 * Save a new or existing unit conversion.
	 */
	saveConversion: async ({ request, locals }) => {
		// checkPermission(locals, 'manage unit conversions');
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const from_unit_id_str = data.get('from_unit_id')?.toString();
		const to_unit_id_str = data.get('to_unit_id')?.toString();
		const conversion_factor_str = data.get('conversion_factor')?.toString();

		if (!from_unit_id_str || !to_unit_id_str || !conversion_factor_str) {
			return fail(400, {
				action: 'saveConversion',
				success: false,
				message: 'All fields are required.'
			});
		}

		const from_unit_id = parseInt(from_unit_id_str);
		const to_unit_id = parseInt(to_unit_id_str);
		const conversion_factor = parseFloat(conversion_factor_str);

		if (isNaN(from_unit_id) || isNaN(to_unit_id) || isNaN(conversion_factor)) {
			return fail(400, {
				action: 'saveConversion',
				success: false,
				message: 'Invalid input values.'
			});
		}
		if (from_unit_id === to_unit_id) {
			return fail(400, {
				action: 'saveConversion',
				success: false,
				message: 'Cannot convert a unit to itself.'
			});
		}
		if (conversion_factor <= 0) {
			return fail(400, {
				action: 'saveConversion',
				success: false,
				message: 'Conversion factor must be greater than zero.'
			});
		}

		try {
			const params = [from_unit_id, to_unit_id, conversion_factor];

			if (id) {
				// Update
				await pool.execute(
					`UPDATE unit_conversions SET from_unit_id = ?, to_unit_id = ?, conversion_factor = ? WHERE id = ?`,
					[...params, parseInt(id)]
				);
			} else {
				// Insert
				await pool.execute(
					`INSERT INTO unit_conversions (from_unit_id, to_unit_id, conversion_factor) VALUES (?, ?, ?)`,
					params
				);
			}
			return { action: 'saveConversion', success: true, message: `Conversion saved successfully!` };
		} catch (err: any) {
			console.error('Database error on saving conversion:', err.message, err.stack);
			if (err.code === 'ER_DUP_ENTRY') {
				return fail(409, {
					action: 'saveConversion',
					success: false,
					message: 'This specific unit conversion already exists.'
				});
			}
			// Handle potential foreign key violation if unit IDs are invalid (though UI should prevent this)
			if (err.code === 'ER_NO_REFERENCED_ROW_2') {
				return fail(400, {
					action: 'saveConversion',
					success: false,
					message: 'Invalid unit selected.'
				});
			}
			return fail(500, {
				action: 'saveConversion',
				success: false,
				message: `Failed to save conversion. Error: ${err.message}`
			});
		}
	},

	/**
	 * Delete a unit conversion.
	 */
	deleteConversion: async ({ request, locals }) => {
		// checkPermission(locals, 'manage unit conversions');
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) {
			return fail(400, {
				action: 'deleteConversion',
				success: false,
				message: 'Invalid conversion ID.'
			});
		}

		try {
			const [result] = await pool.execute('DELETE FROM unit_conversions WHERE id = ?', [id]);
			if ((result as any).affectedRows === 0) {
				return fail(404, {
					action: 'deleteConversion',
					success: false,
					message: 'Conversion not found.'
				});
			}
			return { action: 'deleteConversion', success: true, message: 'Conversion deleted successfully.' };
		} catch (err: any) {
			console.error(`Error deleting conversion ID ${id}: ${err.message}`, err.stack);
			return fail(500, {
				action: 'deleteConversion',
				success: false,
				message: `Failed to delete conversion. Error: ${err.message}`
			});
		}
	}
};
