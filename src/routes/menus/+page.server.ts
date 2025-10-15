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
};

type Permission = RowDataPacket & {
    id: number;
    name: string;
};

export const load: PageServerLoad = async ({ locals }) => {
    // FIX: Changed required permission to 'manage settings'
    checkPermission(locals, 'manage settings');

    try {
        const [menuRows] = await pool.execute<Menu[]>(
            `SELECT id, title, icon, route, parent_id, permission_name, \`order\` FROM menus ORDER BY \`order\` ASC, title ASC`
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
        const parent_id = data.get('parent_id')?.toString();
        const permission_name = data.get('permission_name')?.toString();
        const order = data.get('order')?.toString();

        if (!title || !order) {
            return fail(400, { success: false, message: 'Title and Order are required.' });
        }
        
        try {
            const params = [
                title,
                icon,
                route,
                parent_id ? parseInt(parent_id, 10) : null,
                permission_name || null,
                parseInt(order, 10)
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

        try {
            await pool.execute('DELETE FROM menus WHERE id = ?', [id]);
            return { success: true, message: 'Menu deleted successfully.' };
        } catch (err: any) {
            console.error('Error deleting menu:', err);
            if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                return fail(409, { success: false, message: 'Cannot delete menu. It is a parent to other menu items.' });
            }
            return fail(500, { success: false, message: 'Failed to delete menu.' });
        }
    }
};