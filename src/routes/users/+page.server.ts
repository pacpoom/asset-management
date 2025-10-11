import { fail, redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import bcrypt from 'bcrypt';

// Define types for better type-safety
type Department = {
	id: number;
	name: string;
};

type Position = {
	id: number;
	name: string;
};

type User = {
	id: number;
	username: string;
	email: string;
	full_name: string;
	emp_id: string | null;
	role: 'admin' | 'user';
	department_id: number | null;
	position_id: number | null;
	department_name: string | null;
	position_name: string | null;
	created_at: string;
};

/**
 * Load all users, departments, and positions from the database.
 * This page is only accessible by admins.
 */
export const load: PageServerLoad = async ({ locals }) => {
	// Authorization check
	if (locals.user?.role !== 'admin') {
		throw error(403, {
			message: `Forbidden: Your current role is '${locals.user?.role}'. You do not have permission to access this page.`
		});
	}

	try {
		// Fetch users with department and position names
		const [userRows] = await pool.execute<User[]>(`
            SELECT
                u.id, u.username, u.email, u.full_name, u.emp_id, u.role, u.created_at,
                u.department_id, d.name as department_name,
                u.position_id, p.name as position_name
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN positions p ON u.position_id = p.id
            ORDER BY u.created_at DESC
        `);

		// Fetch all departments
		const [departmentRows] = await pool.execute<Department[]>(
			'SELECT id, name FROM departments ORDER BY name ASC'
		);

		// Fetch all positions
		const [positionRows] = await pool.execute<Position[]>(
			'SELECT id, name FROM positions ORDER BY name ASC'
		);

		return {
			users: userRows,
			departments: departmentRows,
			positions: positionRows
		};
	} catch (err) {
		console.error('Failed to load data:', err);
		throw error(500, { message: 'Failed to load data from the server.' });
	}
};

export const actions: Actions = {
	/**
	 * Handles the creation of a new user.
	 */
	addUser: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') throw error(403, 'Forbidden');

		const data = await request.formData();
		const username = data.get('username')?.toString();
		const email = data.get('email')?.toString();
		const full_name = data.get('full_name')?.toString();
		const password = data.get('password')?.toString();
		const role = data.get('role')?.toString() as 'admin' | 'user';
		const department_id = data.get('department_id')?.toString();
		const position_id = data.get('position_id')?.toString();
		const emp_id = data.get('emp_id')?.toString();

		if (!username || !email || !full_name || !password || !role) {
			return fail(400, { success: false, message: 'Please fill in all required fields.' });
		}
		if (password.length < 6) {
			return fail(400, { success: false, message: 'Password must be at least 6 characters long.' });
		}

		try {
			const salt = await bcrypt.genSalt(10);
			const password_hash = await bcrypt.hash(password, salt);

			await pool.execute(
				`INSERT INTO users (username, email, full_name, password_hash, role, department_id, position_id, emp_id)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					username,
					email,
					full_name,
					password_hash,
					role,
					department_id || null, // Convert empty string to NULL
					position_id || null, // Convert empty string to NULL
					emp_id || null
				]
			);

			return { success: true, message: 'User added successfully!' };
		} catch (err: any) {
			console.error('Database error on adding user:', err);
			if (err.code === 'ER_DUP_ENTRY') {
				const message = err.message.includes('email')
					? 'This email is already registered.'
					: err.message.includes('emp_id')
					? 'This Employee ID is already in use.'
					: 'This username is already taken.';
				return fail(409, { success: false, message });
			}
			return fail(500, { success: false, message: 'Failed to add user to the database.' });
		}
	},

	/**
	 * Handles editing an existing user.
	 */
	editUser: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') throw error(403, 'Forbidden');

		const data = await request.formData();
		const id = data.get('id')?.toString();
		const username = data.get('username')?.toString();
		const email = data.get('email')?.toString();
		const full_name = data.get('full_name')?.toString();
		const password = data.get('password')?.toString();
		const role = data.get('role')?.toString() as 'admin' | 'user';
		const department_id = data.get('department_id')?.toString();
		const position_id = data.get('position_id')?.toString();
		const emp_id = data.get('emp_id')?.toString();

		if (!id || !username || !email || !full_name || !role) {
			return fail(400, { success: false, message: 'Please fill in all required fields.' });
		}

		if (id === '1' && (role !== 'admin' || locals.user.id.toString() !== id)) {
			return fail(403, {
				success: false,
				message: 'Cannot change the role of the primary admin account.'
			});
		}

		try {
			let query =
				'UPDATE users SET username = ?, email = ?, full_name = ?, role = ?, department_id = ?, position_id = ?, emp_id = ?';
			const params: (string | number | null)[] = [
				username,
				email,
				full_name,
				role,
				department_id ? parseInt(department_id) : null,
				position_id ? parseInt(position_id) : null,
				emp_id || null
			];

			if (password) {
				if (password.length < 6) {
					return fail(400, {
						success: false,
						message: 'New password must be at least 6 characters long.'
					});
				}
				const salt = await bcrypt.genSalt(10);
				const password_hash = await bcrypt.hash(password, salt);
				query += ', password_hash = ?';
				params.push(password_hash);
			}

			query += ' WHERE id = ?';
			params.push(parseInt(id));

			await pool.execute(query, params);

			return { success: true, message: 'User updated successfully!' };
		} catch (err: any) {
			console.error('Database error on editing user:', err);
			if (err.code === 'ER_DUP_ENTRY') {
				const message = err.message.includes('email')
					? 'This email is already registered.'
					: err.message.includes('emp_id')
					? 'This Employee ID is already in use.'
					: 'This username is already taken.';
				return fail(409, { success: false, message });
			}
			return fail(500, { success: false, message: 'Failed to update user.' });
		}
	},

	/**
	 * Handles deleting a user.
	 */
	deleteUser: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') throw error(403, 'Forbidden');

		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) {
			return fail(400, { success: false, message: 'Invalid user ID.' });
		}

		if (id === '1' || id === locals.user.id.toString()) {
			return fail(403, { success: false, message: 'This user account cannot be deleted.' });
		}

		try {
			await pool.execute('DELETE FROM users WHERE id = ?', [id]);
			throw redirect(303, '/users');
		} catch (err: any) {
			if (err.status === 303) throw err;
			console.error('Error deleting user:', err);
			return fail(500, { success: false, message: 'Failed to delete user.' });
		}
	}
};