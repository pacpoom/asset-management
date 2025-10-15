import { error } from '@sveltejs/kit';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';

/**
 * Fetches all permissions for a given user ID based on their role.
 * @param userId The ID of the user.
 * @returns A promise that resolves to an array of permission names.
 */
export async function getUserPermissions(userId: number): Promise<string[]> {
	try {
		// Get user's role_id first
		const [userRows] = await pool.execute<RowDataPacket[]>(
			'SELECT role_id FROM users WHERE id = ?',
			[userId]
		);

		if (userRows.length === 0) {
			return [];
		}
		const roleId = userRows[0].role_id;

		// MODIFIED: This query now correctly fetches permissions based on the user's role_id
		// by joining permissions and role_has_permissions.
		const [permissionRows] = await pool.execute<RowDataPacket[]>(
			`
            SELECT p.name
            FROM permissions p
            JOIN role_has_permissions rhp ON p.id = rhp.permission_id
            WHERE rhp.role_id = ?
        `,
			[roleId]
		);

		return permissionRows.map((row) => row.name);
	} catch (err) {
		console.error('Failed to fetch user permissions:', err);
		return []; // Return empty array on error
	}
}

/**
 * Checks if the logged-in user has a specific permission.
 * Throws a 403 Forbidden error if the user is not logged in or lacks the permission.
 * @param locals The SvelteKit event.locals object.
 * @param requiredPermission The name of the permission to check for.
 */
export function checkPermission(locals: App.Locals, requiredPermission: string) {
	if (!locals.user) {
		throw error(401, 'Unauthorized: You must be logged in to perform this action.');
	}
	// The 'admin' role bypasses all permission checks.
	if (locals.user.role === 'admin' || locals.user.permissions.includes(requiredPermission)) {
		return; // User has permission
	}
	throw error(403, `Forbidden: You do not have the '${requiredPermission}' permission.`);
}