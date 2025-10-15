import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

// Type definitions for a permission object
type Permission = RowDataPacket & {
    id: number;
    name: string;
    guard_name: string;
};

/**
 * Loads all permissions from the database.
 * Access is restricted to users with the 'view permissions' right.
 */
export const load: PageServerLoad = async ({ locals }) => {
    // FIX: Changed required permission to 'manage settings' as 'view permissions' doesn't exist in permissions(2).sql
    checkPermission(locals, 'manage settings'); 

    try {
        const [permissions] = await pool.execute<Permission[]>(
            `SELECT id, name, guard_name FROM permissions ORDER BY name ASC`
        );
        return { permissions };
    } catch (err) {
        console.error('Failed to load permissions data:', err);
        throw error(500, 'Failed to load permissions from the server.');
    }
};

/**
 * Contains actions for saving and deleting permissions.
 */
export const actions: Actions = {
    /**
     * Handles creating a new permission or updating an existing one.
     */
    savePermission: async ({ request, locals }) => {
        // FIX: Changed required permission to 'manage settings'
        checkPermission(locals, 'manage settings'); 
        const data = await request.formData();
        const id = data.get('id')?.toString();
        const name = data.get('name')?.toString()?.trim();

        if (!name) {
            return fail(400, { success: false, message: 'Permission name is required.' });
        }

        try {
            if (id) {
                // Update an existing permission
                await pool.execute(
                    `UPDATE permissions SET name = ? WHERE id = ?`,
                    [name, id]
                );
            } else {
                // Insert a new permission
                await pool.execute(
                    `INSERT INTO permissions (name, guard_name) VALUES (?, 'web')`,
                    [name]
                );
            }
            return { success: true, message: `Permission '${name}' saved successfully!` };
        } catch (err: any) {
            console.error('Database error on saving permission:', err);
            if (err.code === 'ER_DUP_ENTRY') {
                return fail(409, { success: false, message: 'A permission with this name already exists.' });
            }
            return fail(500, { success: false, message: 'Failed to save permission.' });
        }
    },

    /**
     * Handles deleting a permission.
     */
    deletePermission: async ({ request, locals }) => {
        // FIX: Changed required permission to 'manage settings'
        checkPermission(locals, 'manage settings'); 
        const data = await request.formData();
        const id = data.get('id')?.toString();

        if (!id) {
            return fail(400, { success: false, message: 'Invalid permission ID.' });
        }

        try {
            await pool.execute('DELETE FROM permissions WHERE id = ?', [id]);
            return { success: true, message: 'Permission deleted successfully.' };
        } catch (err: any) {
            console.error('Error deleting permission:', err);
            if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                return fail(409, { success: false, message: 'Cannot delete. This permission is currently assigned to a role.' });
            }
            return fail(500, { success: false, message: 'Failed to delete permission.' });
        }
    }
};