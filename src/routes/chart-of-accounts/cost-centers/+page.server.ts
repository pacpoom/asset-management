import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

// Type definition for CostCenter
interface CostCenter extends RowDataPacket {
    id: number;
    cost_center_code: string;
    cost_center_name: string;
    cost_center_name_th: string | null;
    department: string | null;
    description: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

// Define common departments (adjust as needed for your system)
const DEPARTMENTS = ['Admin', 'IT', 'HR', 'Sales', 'Marketing', 'Production', 'Finance', 'Operations'];

/**
 * Loads all cost centers records with Server-Side Filtering.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
    // Permission Check
    checkPermission(locals, 'manage settings');

    // 1. Get filter parameters from URL
    const search = url.searchParams.get('search')?.toString()?.trim() || '';
    const department = url.searchParams.get('department')?.toString()?.trim() || '';
    const activeStatus = url.searchParams.get('active')?.toString()?.trim() || 'all';

    let sqlQuery = `
        SELECT id, cost_center_code, cost_center_name, cost_center_name_th, department, description, is_active
        FROM cost_centers
    `;
    const params: (string | number)[] = [];
    const whereClauses: string[] = [];

    // 2. Add WHERE LIKE clauses based on search input
    if (search) {
        const likeSearch = `%${search}%`;
        whereClauses.push(`(cost_center_code LIKE ? OR cost_center_name LIKE ? OR cost_center_name_th LIKE ?)`);
        params.push(likeSearch, likeSearch, likeSearch);
    }
    
    // 3. Add Department filter
    if (department) {
        whereClauses.push(`department = ?`);
        params.push(department);
    }

    // 4. Add Active Status filter
    if (activeStatus !== 'all') {
        whereClauses.push(`is_active = ?`);
        params.push(activeStatus === 'active' ? 1 : 0);
    }

    // Combine WHERE clauses
    if (whereClauses.length > 0) {
        sqlQuery += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    sqlQuery += ` ORDER BY cost_center_code ASC`;

    try {
        const [costCenters] = await pool.execute<CostCenter[]>(sqlQuery, params);
        
        // Data cleaning
        const formattedCostCenters = costCenters.map(cc => ({
            ...cc,
            cost_center_name: cc.cost_center_name.trim(),
            cost_center_name_th: cc.cost_center_name_th?.trim() || null,
            department: cc.department?.trim() || null,
            is_active: Boolean(cc.is_active)
        }));

        return {
            costCenters: formattedCostCenters,
            departments: DEPARTMENTS,
            filters: { search, department, activeStatus }
        };
    } catch (err: any) {
        console.error('Failed to load cost centers data:', err.message, err.stack);
        throw error(500, `Failed to load data from the server. Error: ${err.message}`);
    }
};

/**
 * Actions for saving and deleting cost center entries.
 */
export const actions: Actions = {
    /**
     * Save a new or existing cost center.
     */
    saveCostCenter: async ({ request, locals }) => {
        // Permission Check
        checkPermission(locals, 'manage settings');
        const data = await request.formData();
        const id = data.get('id')?.toString();
        const cost_center_code = data.get('cost_center_code')?.toString()?.trim();
        const cost_center_name = data.get('cost_center_name')?.toString()?.trim();
        const cost_center_name_th = data.get('cost_center_name_th')?.toString()?.trim() || null;
        const department = data.get('department')?.toString()?.trim() || null;
        const description = data.get('description')?.toString()?.trim() || null;
        const is_active = data.get('is_active') === 'on' || data.get('is_active') === 'true';

        // --- Validation ---
        if (!cost_center_code || !cost_center_name) {
            return fail(400, {
                action: 'saveCostCenter', success: false, message: 'Cost Center Code and Name are required.'
            });
        }

        try {
            const params = [cost_center_code, cost_center_name, cost_center_name_th, department, description, is_active ? 1 : 0];

            if (id) {
                // Update
                await pool.execute(
                    `UPDATE cost_centers SET
                        cost_center_code = ?, cost_center_name = ?, cost_center_name_th = ?, department = ?, description = ?, is_active = ?
                     WHERE id = ?`,
                    [...params, parseInt(id)]
                );
            } else {
                // Insert
                await pool.execute(
                    `INSERT INTO cost_centers
                        (cost_center_code, cost_center_name, cost_center_name_th, department, description, is_active)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    params
                );
            }
            return { action: 'saveCostCenter', success: true, message: `Cost Center '${cost_center_name}' saved successfully!` };
        } catch (err: any) {
            console.error('Database error on saving cost center:', err.message, err.stack);
            if (err.code === 'ER_DUP_ENTRY') {
                return fail(409, {
                    action: 'saveCostCenter', success: false, message: 'A Cost Center with this Code already exists.'
                });
            }
            return fail(500, {
                action: 'saveCostCenter', success: false, message: `Failed to save Cost Center. Error: ${err.message}`
            });
        }
    },

    /**
     * Delete a cost center.
     */
    deleteCostCenter: async ({ request, locals }) => {
        // Permission Check
        checkPermission(locals, 'manage settings');
        const data = await request.formData();
        const id = data.get('id')?.toString();

        if (!id) {
            return fail(400, { action: 'deleteCostCenter', success: false, message: 'Invalid Cost Center ID.' });
        }
        const costCenterId = parseInt(id);

        try {
            // Optional: Check if cost center is used in transactions before deleting
            // const [refs] = await pool.execute<RowDataPacket[]>('SELECT id FROM transactions WHERE cost_center_id = ? LIMIT 1', [costCenterId]);
            // if (refs.length > 0) return fail(409, { action: 'deleteCostCenter', success: false, message: 'Cannot delete. Cost Center is in use.' });

            const [result] = await pool.execute('DELETE FROM cost_centers WHERE id = ?', [costCenterId]);

            if ((result as any).affectedRows === 0) {
                return fail(404, { action: 'deleteCostCenter', success: false, message: 'Cost Center not found.' });
            }

            return { action: 'deleteCostCenter', success: true, message: 'Cost Center deleted successfully.' };
        } catch (err: any) {
            console.error(`Error deleting cost center ID ${costCenterId}: ${err.message}`, err.stack);
             if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                return fail(409, {
                    action: 'deleteCostCenter', success: false,
                    message: 'Cannot delete Cost Center. It is referenced in other parts of the system.'
                });
            }
            return fail(500, {
                action: 'deleteCostCenter', success: false, message: `Failed to delete Cost Center. Error: ${err.message}`
            });
        }
    }
};