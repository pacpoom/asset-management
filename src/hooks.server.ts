import type { Handle } from '@sveltejs/kit';
import pool from '$lib/server/database';
import { getUserPermissions } from '$lib/server/auth';

/**
 * This is the server 'handle' hook, which runs before every request to the server.
 * It's the ideal place to handle authentication and enrich the `event.locals` object.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('session_id');

	if (sessionId) {
		try {
			const [rows]: any[] = await pool.execute(
				`SELECT u.id, u.email, u.full_name, u.profile_image_url, r.name as role
				 FROM users u
				 JOIN roles r ON u.role_id = r.id
				 WHERE u.id = ? LIMIT 1`,
				[sessionId]
			);
			const userData = rows[0];

			if (userData) {
				const permissions = await getUserPermissions(userData.id);

				event.locals.user = {
					id: userData.id,
					email: userData.email,
					full_name: userData.full_name,
					profile_image_url: userData.profile_image_url,
					role: userData.role,
					permissions: permissions
				};
			}
		} catch (err) {
			console.error('[hooks.server.ts] Database error during session check:', err);
		}
	}
	const response = await resolve(event);
	return response;
};
