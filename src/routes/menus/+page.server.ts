import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

type Menu = RowDataPacket & {
    id: number;
    title: string;
    icon: string | null;
    route: string | null;
    parent_id: number | null;
    permission_name: string | null;
    order: number;
    // Added for display logic in Svelte component:
    children?: Menu[]; 
    level?: number;
};

type Permission = RowDataPacket & {
    id: number;
    name: string;
};

export const load: PageServerLoad = async ({ locals }) => {
    // FIX: Changed required permission to 'manage settings'
    checkPermission(locals, 'manage settings');

    try {
        // We fetch a flat list of all menus here, which is sufficient for the svelte page to build the hierarchy for display.
        const [menuRows] = await pool.execute<Menu[]>(
            `SELECT id, title, icon, route, parent_id, permission_name, \`order\` FROM menus ORDER BY parent_id ASC, \`order\` ASC, title ASC`
        );
        const [permissionRows] = await pool.execute<Permission[]>(
            `SELECT name FROM permissions ORDER BY name ASC`
        );
        return {
            menus: menuRows,
            availablePermissions: permissionRows.map(p => p.name)
        };
    } catch (err) {
        console.error('Failed to load menus data:', err);
        throw error(500, 'Failed to load menus data from the server.');
    }
};

export const actions: Actions = {
    saveMenu: async ({ request, locals }) => {
        // FIX: Changed required permission to 'manage settings'
        checkPermission(locals, 'manage settings');

        const data = await request.formData();
        const id = data.get('id')?.toString();
        const title = data.get('title')?.toString();
        const icon = data.get('icon')?.toString() || null;
        const route = data.get('route')?.toString() || null;
        const parent_id_raw = data.get('parent_id')?.toString();
        const permission_name = data.get('permission_name')?.toString();
        const order_raw = data.get('order')?.toString();
        
        // Handle parent_id: if 'null' string is passed, set to null, otherwise parse as int
        const parent_id = parent_id_raw && parent_id_raw !== 'null' ? parseInt(parent_id_raw, 10) : null;
        const order = order_raw ? parseInt(order_raw, 10) : 0;

        if (!title || !order_raw) {
            return fail(400, { success: false, message: 'Title and Order are required.' });
        }

        // Rule: If it has a parent, the route must be null (it's a grouping menu)
        const finalRoute = parent_id !== null ? null : route;
        
        // Rule: Prevent setting self as parent
        if (id && parent_id && parseInt(id, 10) === parent_id) {
            return fail(400, { success: false, message: 'Menu cannot be its own parent.' });
        }
        
        // Rule: Prevent setting a child as a parent of its ancestor (not strictly necessary with one level, but good practice)
        // This is complex to check in SQL and is mostly handled by the Svelte UI filtering `rootMenus`

        try {
            const params = [
                title,
                icon,
                finalRoute,
                parent_id,
                permission_name || null,
                order
            ];

            if (id) {
                // Update
                await pool.execute(
                    `UPDATE menus SET title = ?, icon = ?, route = ?, parent_id = ?, permission_name = ?, \`order\` = ? WHERE id = ?`,
                    [...params, parseInt(id, 10)]
                );
            } else {
                // Insert
                await pool.execute(
                    `INSERT INTO menus (title, icon, route, parent_id, permission_name, \`order\`) VALUES (?, ?, ?, ?, ?, ?)`,
                    params
                );
            }
            return { success: true, message: `Menu '${title}' saved successfully!` };
        } catch (err: any) {
            console.error('Database error on saving menu:', err);
            return fail(500, { success: false, message: 'Failed to save menu.' });
        }
    },

    deleteMenu: async ({ request, locals }) => {
        // FIX: Changed required permission to 'manage settings'
        checkPermission(locals, 'manage settings');
        const data = await request.formData();
        const id = data.get('id')?.toString();

        if (!id) {
            return fail(400, { success: false, message: 'Invalid menu ID.' });
        }
        
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();
            const menuId = parseInt(id, 10);
            
            // 1. Delete all sub-menus (children) first
            await connection.execute('DELETE FROM menus WHERE parent_id = ?', [menuId]);

            // 2. Delete the parent menu itself
            const [result] = await connection.execute('DELETE FROM menus WHERE id = ?', [menuId]);

            await connection.commit();
            
            if ((result as any).affectedRows === 0) {
                 return fail(404, { success: false, message: 'Menu not found.' });
            }

            return { success: true, message: 'Menu and its sub-menus deleted successfully.' };
        } catch (err: any) {
             await connection.rollback();
            console.error('Error deleting menu:', err);
            // This specific error should not happen after deleting children, but keep for general safety.
            if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                return fail(409, { success: false, message: 'Cannot delete menu. It is still referenced by other database records.' });
            }
            return fail(500, { success: false, message: 'Failed to delete menu.' });
        } finally {
             connection.release();
        }
    }
};