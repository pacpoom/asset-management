import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

import { fail, redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import bcrypt from 'bcrypt';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

// --- Types (คงเดิม) ---
type Department = {
	id: number;
	name: string;
};

type Position = {
	id: number;
	name: string;
};

type Role = {
	id: number;
	name: string;
};

type User = RowDataPacket & {
	id: number;
	username: string;
	email: string;
	created_at: string;
	role_id: number | null;
	role: string;
	full_name: string | null;
	emp_id: string | null;
	profile_image_url: string | null;
	department_id: number | null;
	position_id: number | null;
	department_name: string | null;
	position_name: string | null;
};

/**
 *
 */
export const load: PageServerLoad = async ({ locals }) => {
	try {
		const [userRows] = await pool.execute<User[]>(`
            SELECT
                u.*, 
                r.name as role,
                d.name as department_name,
                p.name as position_name
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN positions p ON u.position_id = p.id
            ORDER BY u.created_at DESC
        `);

		const [departmentRows] = await pool.execute<Department[] & RowDataPacket[]>(
			'SELECT id, name FROM departments ORDER BY name ASC'
		);
		const [positionRows] = await pool.execute<Position[] & RowDataPacket[]>(
			'SELECT id, name FROM positions ORDER BY name ASC'
		);
		const [roleRows] = await pool.execute<Role[] & RowDataPacket[]>(
			'SELECT id, name FROM roles ORDER BY name ASC'
		);

		return {
			users: userRows,
			departments: departmentRows,
			positions: positionRows,
			roles: roleRows
		};
	} catch (err) {
		console.error('Failed to load data:', err);
		throw error(500, { message: 'Failed to load data from the server.' });
	}
};

export const actions: Actions = {
	/**
	 *
	 */
	addUser: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') throw error(403, 'Forbidden');

		const data = await request.formData();

		const username = data.get('username')?.toString();
		const email = data.get('email')?.toString();
		const password = data.get('password')?.toString();
		const role_id = data.get('role_id')?.toString();
		const full_name = data.get('full_name')?.toString();
		const emp_id = data.get('emp_id')?.toString();
		const department_id_str = data.get('department_id')?.toString();
		const position_id_str = data.get('position_id')?.toString();
		const profile_image = data.get('profile_image') as File;

		if (!username || !email || !full_name || !password || !role_id) {
			return fail(400, {
				action: 'addUser',
				success: false,
				message: 'Please fill in all required fields.'
			});
		}
		if (password.length < 6) {
			return fail(400, {
				action: 'addUser',
				success: false,
				message: 'Password must be at least 6 characters long.'
			});
		}

		let profile_image_url: string | null = null;
		let uploadedFilePath: string | null = null;

		if (profile_image && profile_image.size > 0) {
			try {
				const fileExt = path.extname(profile_image.name);
				const fileName = `${uuidv4()}${fileExt}`;
				const uploadDir = path.join('static', 'uploads', 'profiles');

				if (!fs.existsSync(uploadDir)) {
					fs.mkdirSync(uploadDir, { recursive: true });
				}

				uploadedFilePath = path.join(uploadDir, fileName);
				fs.writeFileSync(uploadedFilePath, Buffer.from(await profile_image.arrayBuffer()));
				profile_image_url = `/uploads/profiles/${fileName}`;
			} catch (err) {
				console.error('File upload failed:', err);
				return fail(500, {
					action: 'addUser',
					success: false,
					message: 'Failed to upload profile image.'
				});
			}
		}

		try {
			const salt = await bcrypt.genSalt(10);
			const password_hash = await bcrypt.hash(password, salt);

			const departmentIdValue =
				department_id_str && department_id_str !== 'undefined' ? Number(department_id_str) : null;
			const positionIdValue =
				position_id_str && position_id_str !== 'undefined' ? Number(position_id_str) : null;

			await pool.execute(
				`INSERT INTO users (
					username, email, password_hash, role_id, 
					full_name, emp_id, department_id, position_id, 
					profile_image_url
				 )
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					username,
					email,
					password_hash,
					role_id,
					full_name,
					emp_id || null,
					departmentIdValue,
					positionIdValue,
					profile_image_url
				]
			);

			return { action: 'addUser', success: true, message: 'User added successfully!' };
		} catch (err: any) {
			if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
				fs.unlinkSync(uploadedFilePath);
			}

			console.error('Database error on adding user:', err);
			if (err.code === 'ER_DUP_ENTRY') {
				const message = err.message.includes('email')
					? 'This email is already registered.'
					: err.message.includes('emp_id')
						? 'This Employee ID is already in use.'
						: 'This username is already taken.';
				return fail(409, { action: 'addUser', success: false, message });
			}
			return fail(500, {
				action: 'addUser',
				success: false,
				message: 'Failed to add user to the database.'
			});
		}
	},

	/**
	 *
	 */
	editUser: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') throw error(403, 'Forbidden');

		const data = await request.formData();

		const id = data.get('id')?.toString();
		if (!id) return fail(400, { action: 'editUser', success: false, message: 'Invalid User ID.' });

		// Fields
		const full_name = data.get('full_name')?.toString();
		const email = data.get('email')?.toString();
		const username = data.get('username')?.toString();
		const emp_id = data.get('emp_id')?.toString();
		const role_id = data.get('role_id')?.toString();
		const department_id_str = data.get('department_id')?.toString();
		const position_id_str = data.get('position_id')?.toString();

		// Optional fields
		const new_password = data.get('password')?.toString();
		const profile_image = data.get('profile_image') as File;

		if (!full_name || !email || !username || !role_id) {
			return fail(400, { action: 'editUser', success: false, message: 'Missing required fields.' });
		}

		let profile_image_url: string | undefined = undefined;
		let old_image_path: string | null = null;
		let uploadedFilePath: string | null = null;

		// 1. Handle file upload (if new one provided)
		if (profile_image && profile_image.size > 0) {
			try {
				// 1a. Get old image path (to delete later)
				const [userRows] = await pool.execute<RowDataPacket[]>(
					'SELECT profile_image_url FROM users WHERE id = ?',
					[id]
				);
				if (userRows.length > 0) old_image_path = userRows[0].profile_image_url;

				// 1b. Save new image
				const fileExt = path.extname(profile_image.name);
				const fileName = `${uuidv4()}${fileExt}`;
				const uploadDir = path.join('static', 'uploads', 'profiles');

				if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

				uploadedFilePath = path.join(uploadDir, fileName);
				fs.writeFileSync(uploadedFilePath, Buffer.from(await profile_image.arrayBuffer()));
				profile_image_url = `/uploads/profiles/${fileName}`;
			} catch (err) {
				console.error('File upload failed:', err);
				return fail(500, {
					action: 'editUser',
					success: false,
					message: 'Failed to upload image.'
				});
			}
		}

		// 2. Build and execute DB update
		try {
			const queryParams: any[] = [];
			const queryFields: string[] = [];

			// Add standard fields
			queryFields.push('full_name = ?');
			queryParams.push(full_name);
			queryFields.push('email = ?');
			queryParams.push(email);
			queryFields.push('username = ?');
			queryParams.push(username);
			queryFields.push('emp_id = ?');
			queryParams.push(emp_id || null);
			queryFields.push('role_id = ?');
			queryParams.push(Number(role_id));

			const departmentIdValue =
				department_id_str && department_id_str !== 'undefined' ? Number(department_id_str) : null;
			const positionIdValue =
				position_id_str && position_id_str !== 'undefined' ? Number(position_id_str) : null;
			queryFields.push('department_id = ?');
			queryParams.push(departmentIdValue);
			queryFields.push('position_id = ?');
			queryParams.push(positionIdValue);

			// Add optional file
			if (profile_image_url) {
				queryFields.push('profile_image_url = ?');
				queryParams.push(profile_image_url);
			}

			// Add optional password
			if (new_password && new_password.length > 0) {
				if (new_password.length < 6)
					return fail(400, {
						action: 'editUser',
						success: false,
						message: 'Password must be at least 6 characters.'
					});
				const salt = await bcrypt.genSalt(10);
				const password_hash = await bcrypt.hash(new_password, salt);
				queryFields.push('password_hash = ?');
				queryParams.push(password_hash);
			}

			queryParams.push(id); // For WHERE
			const sql = `UPDATE users SET ${queryFields.join(', ')} WHERE id = ?`;

			await pool.execute(sql, queryParams);

			// 3. Success: Delete old file
			if (profile_image_url && old_image_path) {
				const oldFilePath = path.join('static', old_image_path);
				if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
			}

			return { action: 'editUser', success: true, message: 'User updated successfully!' };
		} catch (err: any) {
			// 4. DB Error: Rollback file upload
			if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
				fs.unlinkSync(uploadedFilePath);
			}
			console.error('Profile update failed:', err);
			if (err.code === 'ER_DUP_ENTRY')
				return fail(409, {
					action: 'editUser',
					success: false,
					message: 'Email, Username, or Employee ID already exists.'
				});
			return fail(500, { action: 'editUser', success: false, message: 'Failed to update user.' });
		}
	},

	/**
	 *
	 */
	deleteUser: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') throw error(403, 'Forbidden');

		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { action: 'deleteUser', success: false, message: 'Invalid ID.' });

		let old_image_path: string | null = null;

		try {
			// 1. Get image path before deleting
			const [userRows] = await pool.execute<RowDataPacket[]>(
				'SELECT profile_image_url FROM users WHERE id = ?',
				[id]
			);
			if (userRows.length > 0) old_image_path = userRows[0].profile_image_url;

			// 2. Delete user from DB
			await pool.execute('DELETE FROM users WHERE id = ?', [id]);

			// 3. Delete file (if it exists)
			if (old_image_path) {
				const oldFilePath = path.join('static', old_image_path);
				if (fs.existsSync(oldFilePath)) {
					fs.unlinkSync(oldFilePath);
				}
			}

			return { action: 'deleteUser', success: true, message: 'User deleted.' };
		} catch (err: any) {
			console.error('Failed to delete user:', err);

			if (err.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, {
					action: 'deleteUser',
					success: false,
					message:
						'Cannot delete user: This user is referenced in other parts of the system (e.g., assets, approvals).'
				});
			}
			return fail(500, {
				action: 'deleteUser',
				success: false,
				message: 'Failed to delete user.'
			});
		}
	},

	// --- Department Actions  ---
	saveDepartment: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const name = data.get('name')?.toString()?.trim();

		if (!name) {
			return fail(400, {
				action: 'saveDepartment',
				success: false,
				message: 'Department name is required.'
			});
		}

		try {
			if (id) {
				await pool.execute('UPDATE departments SET name = ? WHERE id = ?', [name, parseInt(id)]);
			} else {
				await pool.execute('INSERT INTO departments (name) VALUES (?)', [name]);
			}
			return { action: 'saveDepartment', success: true, message: `Department '${name}' saved.` };
		} catch (err: any) {
			if (err.code === 'ER_DUP_ENTRY') {
				return fail(409, {
					action: 'saveDepartment',
					success: false,
					message: 'Department name already exists.'
				});
			}
			return fail(500, {
				action: 'saveDepartment',
				success: false,
				message: `Failed to save department: ${err.message}`
			});
		}
	},

	deleteDepartment: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id)
			return fail(400, { action: 'deleteDepartment', success: false, message: 'Invalid ID.' });

		try {
			const [userRefs] = await pool.execute<RowDataPacket[]>(
				'SELECT id FROM users WHERE department_id = ? LIMIT 1',
				[id]
			);
			if (userRefs.length > 0) {
				return fail(409, {
					action: 'deleteDepartment',
					success: false,
					message: 'Cannot delete: Department is assigned to users.'
				});
			}

			const [result] = await pool.execute<ResultSetHeader>('DELETE FROM departments WHERE id = ?', [
				id
			]);
			if (result.affectedRows === 0) {
				return fail(404, {
					action: 'deleteDepartment',
					success: false,
					message: 'Department not found.'
				});
			}
			return { action: 'deleteDepartment', success: true, message: 'Department deleted.' };
		} catch (err: any) {
			if (err.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, {
					action: 'deleteDepartment',
					success: false,
					message: 'Cannot delete: Department is referenced elsewhere.'
				});
			}
			return fail(500, {
				action: 'deleteDepartment',
				success: false,
				message: `Failed to delete department: ${err.message}`
			});
		}
	},

	// --- Position Actions  ---
	savePosition: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const name = data.get('name')?.toString()?.trim();

		if (!name) {
			return fail(400, {
				action: 'savePosition',
				success: false,
				message: 'Position name is required.'
			});
		}

		try {
			if (id) {
				await pool.execute('UPDATE positions SET name = ? WHERE id = ?', [name, parseInt(id)]);
			} else {
				await pool.execute('INSERT INTO positions (name) VALUES (?)', [name]);
			}
			return { action: 'savePosition', success: true, message: `Position '${name}' saved.` };
		} catch (err: any) {
			if (err.code === 'ER_DUP_ENTRY') {
				return fail(409, {
					action: 'savePosition',
					success: false,
					message: 'Position name already exists.'
				});
			}
			return fail(500, {
				action: 'savePosition',
				success: false,
				message: `Failed to save position: ${err.message}`
			});
		}
	},

	deletePosition: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { action: 'deletePosition', success: false, message: 'Invalid ID.' });

		try {
			const [userRefs] = await pool.execute<RowDataPacket[]>(
				'SELECT id FROM users WHERE position_id = ? LIMIT 1',
				[id]
			);
			if (userRefs.length > 0) {
				return fail(409, {
					action: 'deletePosition',
					success: false,
					message: 'Cannot delete: Position is assigned to users.'
				});
			}

			const [result] = await pool.execute<ResultSetHeader>('DELETE FROM positions WHERE id = ?', [
				id
			]);
			if (result.affectedRows === 0) {
				return fail(404, {
					action: 'deletePosition',
					success: false,
					message: 'Position not found.'
				});
			}
			return { action: 'deletePosition', success: true, message: 'Position deleted.' };
		} catch (err: any) {
			if (err.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, {
					action: 'deletePosition',
					success: false,
					message: 'Cannot delete: Position is referenced elsewhere.'
				});
			}
			return fail(500, {
				action: 'deletePosition',
				success: false,
				message: `Failed to delete position: ${err.message}`
			});
		}
	}
};
