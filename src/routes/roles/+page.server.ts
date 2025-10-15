import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

// Type definitions
type Role = RowDataPacket & {
    id: number;
    name: string;
    permissions: string[];
};

type Permission = RowDataPacket & {
    id: number;
    name: string;
};

/**
 * Load all roles and their associated permissions.
 */
export const load: PageServerLoad = async ({ locals }) => {
    checkPermission(locals, 'view roles'); // Authorization check

    try {
        // Fetch all roles
        const [roleRows] = await pool.execute<Role[]>(
            `SELECT id, name FROM roles ORDER BY name`
        );

        // Fetch all available permissions specifically for the 'web' guard
        const [permissionRows] = await pool.execute<Permission[]>(
            `SELECT id, name FROM permissions WHERE guard_name = 'web' ORDER BY name`
        );

        // --- DEBUGGING LOG ---
        // This will show in your server console (terminal) how many permissions were found.
        // If this shows 0, please check your database connection and ensure the 'permissions' table has data.
        console.log(`[roles/+page.server.ts] Fetched ${permissionRows.length} available permissions.`);

        // Fetch role-permission mappings
        const [mappingRows] = await pool.execute<RowDataPacket[]>(
            `SELECT role_id, permission_id FROM role_has_permissions`
        );

        // Create a map for easy lookup
        const permissionMap = new Map<number, string>();
        permissionRows.forEach(p => permissionMap.set(p.id, p.name));
        
        const rolesWithPermissions = roleRows.map(role => {
            const assignedPermissionIds = mappingRows
                .filter(m => m.role_id === role.id)
                .map(m => m.permission_id);
            
            return {
                ...role,
                permissions: assignedPermissionIds.map(id => permissionMap.get(id)).filter(Boolean) as string[]
            };
        });

        return {
            roles: rolesWithPermissions,
            availablePermissions: permissionRows
        };

    } catch (err) {
        console.error('Failed to load roles data:', err);
        throw error(500, 'Failed to load roles data from the server.');
    }
};

export const actions: Actions = {
    /**
     * Handles adding or editing a role and its permissions.
     */
    saveRole: async ({ request, locals }) => {
        const data = await request.formData();
        const id = data.get('id')?.toString();
        const name = data.get('name')?.toString();
        const permissionIds = data.getAll('permission_ids').map(String);
        
        if (!name) {
            return fail(400, { success: false, message: 'Role name is required.' });
        }

        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();
            let roleId: number;

            if (id) { // Editing existing role
                checkPermission(locals, 'edit roles');
                roleId = parseInt(id, 10);

                if (roleId <= 2) { // Prevent editing of default admin/user roles
                     // For default roles, only permissions can be changed.
                     // We still clear them to re-insert the updated list.
                } else {
                    // For other roles, update the name.
                    await connection.execute(`UPDATE roles SET name = ? WHERE id = ?`, [name, roleId]);
                }
                
                await connection.execute(`DELETE FROM role_has_permissions WHERE role_id = ?`, [roleId]);

            } else { // Adding new role
                checkPermission(locals, 'create roles');
                const [result] = await connection.execute<any>(`INSERT INTO roles (name, guard_name) VALUES (?, 'web')`, [name]);
                roleId = result.insertId;
            }

            if (permissionIds.length > 0) {
                const values = permissionIds.map(permId => [roleId, parseInt(permId, 10)]);
                await connection.query(
                    `INSERT INTO role_has_permissions (role_id, permission_id) VALUES ?`,
                    [values]
                );
            }

            await connection.commit();
            return { success: true, message: `Role '${name}' saved successfully!` };

        } catch (err: any) {
            await connection.rollback();
            console.error('Database error on saving role:', err);
            if (err.code === 'ER_DUP_ENTRY') {
                return fail(409, { success: false, message: 'A role with this name already exists.' });
            }
            if (err.status) throw err; // rethrow kit errors
            return fail(500, { success: false, message: 'Failed to save role.' });
        } finally {
            connection.release();
        }
    },

    /**
     * Handles deleting a role.
     */
    deleteRole: async ({ request, locals }) => {
        checkPermission(locals, 'delete roles');
        const data = await request.formData();
        const id = data.get('id')?.toString();

        if (!id) {
            return fail(400, { success: false, message: 'Invalid role ID.' });
        }
        
        const roleId = parseInt(id, 10);
        if (roleId <= 2) { // Prevent deletion of default admin/user roles
            return fail(403, { success: false, message: 'Cannot delete default Admin or User roles.' });
        }

        try {
            // Deletion will cascade to role_has_permissions table
            await pool.execute('DELETE FROM roles WHERE id = ?', [id]);
            return { success: true, message: 'Role deleted successfully.' };
        } catch (err: any) {
            console.error('Error deleting role:', err);
            // Check for foreign key constraint errors if users are assigned this role
            if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                 return fail(409, { success: false, message: 'Cannot delete role. It is still assigned to some users.' });
            }
            return fail(500, { success: false, message: 'Failed to delete role.' });
        }
    }
};