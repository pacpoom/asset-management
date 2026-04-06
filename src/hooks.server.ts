import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import pool from '$lib/server/database';
import { getUserPermissions } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('session_id');
	const sessionToken = event.cookies.get('session_token');

	if (sessionId) {
		try {
			const [rows]: any[] = await pool.execute(
				`SELECT id, username, email, full_name, profile_image_url, current_session_token, role
				 FROM users 
				 WHERE id = ? LIMIT 1`,
				[sessionId]
			);
			const userData = rows[0];

			if (userData) {
				const isSuperAdmin =
					userData.role === 'admin' &&
					(userData.username === 'admin' || userData.email === 'admin');

				if (!isSuperAdmin && userData.current_session_token !== sessionToken) {
					event.cookies.delete('session_id', { path: '/' });
					event.cookies.delete('session_token', { path: '/' });
					throw redirect(303, '/login?kicked_out=true');
				}

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
		} catch (err: any) {
			if (err?.status === 303 || err?.status === 302 || err?.location) {
				throw err;
			}
			console.error('[hooks.server.ts] Database error during session check:', err);
		}
	}

	return await resolve(event);
};
