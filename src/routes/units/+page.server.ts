import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
// Assuming you have permission checks, import if needed
// import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

// Type definitions
type Unit = RowDataPacket & {
	id: number;
	name: string;
	symbol: string;
	is_base_unit: boolean; // Changed to boolean for easier handling
	base_unit_id: number | null;
	base_unit_name?: string; // Optional: For display
};

/**
 * Loads all units from the database.
 */
export const load: PageServerLoad = async ({ locals }) => {
	// Optional: Add permission check if needed
	// checkPermission(locals, 'manage units');

	try {
		// Fetch all units, join with base unit name if applicable
		const [unitRows] = await pool.execute<Unit[]>(`
            SELECT
                u.id, u.name, u.symbol, u.is_base_unit, u.base_unit_id,
                bu.name as base_unit_name
            FROM units u
            LEFT JOIN units bu ON u.base_unit_id = bu.id
            ORDER BY u.is_base_unit DESC, u.name ASC
        `);

		// Convert is_base_unit to boolean
		const units = unitRows.map((u) => ({
			...u,
			is_base_unit: Boolean(u.is_base_unit)
		}));

		// Fetch base units for the dropdown in the modal
		const baseUnits = units.filter((u) => u.is_base_unit);

		return {
			units: units,
			baseUnits: baseUnits // Only pass base units for selection
		};
	} catch (err: any) {
		console.error('Failed to load units data:', err.message, err.stack);
		throw error(500, `Failed to load units data from the server. Error: ${err.message}`);
	}
};

/**
 * Contains actions for saving and deleting units.
 */
export const actions: Actions = {
	/**
	 * Handles creating a new unit or updating an existing one.
	 */
	saveUnit: async ({ request, locals }) => {
		// Optional: Add permission check
		// checkPermission(locals, 'manage units');
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const name = data.get('name')?.toString()?.trim();
		const symbol = data.get('symbol')?.toString()?.trim();
		const is_base_unit = data.get('is_base_unit') === 'true'; // Convert string to boolean
		const base_unit_id_str = data.get('base_unit_id')?.toString();

		let base_unit_id: number | null = null;
		if (!is_base_unit && base_unit_id_str && base_unit_id_str !== 'null') {
			base_unit_id = parseInt(base_unit_id_str, 10);
		}

		if (!name || !symbol) {
			return fail(400, {
				action: 'saveUnit',
				success: false,
				message: 'Unit Name and Symbol are required.'
			});
		}

		// Ensure base_unit_id is null if it's a base unit
		if (is_base_unit) {
			base_unit_id = null;
		} else if (!is_base_unit && !base_unit_id) {
			// If it's *not* a base unit, it *must* have a base_unit_id selected
			return fail(400, {
				action: 'saveUnit',
				success: false,
				message: 'A Base Unit must be selected for non-base units.'
			});
		}

		try {
			const params = [name, symbol, is_base_unit ? 1 : 0, base_unit_id];

			if (id) {
				// Update
				if (parseInt(id) === base_unit_id) {
					return fail(400, {
						action: 'saveUnit',
						success: false,
						message: 'Unit cannot be its own base unit.'
					});
				}
				await pool.execute(
					`UPDATE units SET name = ?, symbol = ?, is_base_unit = ?, base_unit_id = ? WHERE id = ?`,
					[...params, parseInt(id)]
				);
			} else {
				// Insert
				await pool.execute(
					`INSERT INTO units (name, symbol, is_base_unit, base_unit_id) VALUES (?, ?, ?, ?)`,
					params
				);
			}
			return { action: 'saveUnit', success: true, message: `Unit '${name}' saved successfully!` };
		} catch (err: any) {
			console.error('Database error on saving unit:', err.message, err.stack);
			if (err.code === 'ER_DUP_ENTRY') {
				const field = err.message.includes('units_name_unique') ? 'Name' : 'Symbol';
				return fail(409, {
					action: 'saveUnit',
					success: false,
					message: `A unit with this ${field} already exists.`
				});
			}
			return fail(500, {
				action: 'saveUnit',
				success: false,
				message: `Failed to save unit. Error: ${err.message}`
			});
		}
	},

	/**
	 * Handles deleting a unit.
	 */
	deleteUnit: async ({ request, locals }) => {
		// Optional: Add permission check
		// checkPermission(locals, 'manage units');
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) {
			return fail(400, { action: 'deleteUnit', success: false, message: 'Invalid unit ID.' });
		}

		const unitId = parseInt(id);

		try {
			// Check if this unit is used as a base_unit_id for other units
			const [referencingUnits] = await pool.execute<RowDataPacket[]>(
				'SELECT id FROM units WHERE base_unit_id = ? LIMIT 1',
				[unitId]
			);
			if (referencingUnits.length > 0) {
				return fail(409, {
					action: 'deleteUnit',
					success: false,
					message: 'Cannot delete. This unit is used as a base unit for other units.'
				});
			}

			// Check if this unit is used in unit_conversions
			const [conversions] = await pool.execute<RowDataPacket[]>(
				'SELECT id FROM unit_conversions WHERE from_unit_id = ? OR to_unit_id = ? LIMIT 1',
				[unitId, unitId]
			);
			if (conversions.length > 0) {
				return fail(409, {
					action: 'deleteUnit',
					success: false,
					message: 'Cannot delete. This unit is used in unit conversions.'
				});
			}

			// Proceed with deletion
			const [result] = await pool.execute('DELETE FROM units WHERE id = ?', [unitId]);

			if ((result as any).affectedRows === 0) {
				return fail(404, { action: 'deleteUnit', success: false, message: 'Unit not found.' });
			}

			return { action: 'deleteUnit', success: true, message: 'Unit deleted successfully.' };
		} catch (err: any) {
			console.error(`Error deleting unit ID ${unitId}: ${err.message}`, err.stack);
			// Check for other potential foreign key issues if applicable (e.g., product tables)
			if (err.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, {
					action: 'deleteUnit',
					success: false,
					message: 'Cannot delete unit. It might be referenced in other parts of the system (e.g., products).'
				});
			}
			return fail(500, {
				action: 'deleteUnit',
				success: false,
				message: `Failed to delete unit. Error: ${err.message}`
			});
		}
	}
};
