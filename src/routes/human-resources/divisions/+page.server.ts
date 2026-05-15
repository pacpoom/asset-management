import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

interface LocalUser {
	id?: number;
	role?: string;
	username?: string;
	email?: string;
	department_id?: number | null;
}

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const [divisions]: any = await pool.execute(
			'SELECT * FROM divisions ORDER BY division_name ASC'
		);
		const [sections]: any = await pool.execute('SELECT * FROM sections ORDER BY section_name ASC');
		const [rawPositions]: any = await pool.execute(
			'SELECT * FROM job_positions ORDER BY position_name ASC'
		);
		const positions = rawPositions.map((pos: any) => ({
			...pos,
			status: pos.status == 1 || pos.status === 'Active' ? 'Active' : 'Inactive'
		}));
		const [groups]: any = await pool.execute('SELECT * FROM `groups` ORDER BY group_name ASC');
		const [projects]: any = await pool.execute('SELECT * FROM projects ORDER BY project_name ASC');

		const [departments]: any = await pool.execute(
			'SELECT id, name FROM departments ORDER BY name ASC'
		);

		const [currentUserRows]: any = await pool.execute(
			'SELECT department_id FROM users WHERE id = ? LIMIT 1',
			[locals.user?.id || 0]
		);
		const actualDeptId = currentUserRows.length > 0 ? currentUserRows[0].department_id : 0;

		const user = locals.user as LocalUser;
		const isSuperAdmin =
			user?.role === 'admin' &&
			(user?.username === 'admin' ||
				user?.email === 'admin' ||
				user?.email?.startsWith('admin@') ||
				user?.id === 1 ||
				user?.id === 2);

		let scannerQuery = `
			SELECT 
				id, 
				device_name, 
				ip_address, 
				status, 
				department_id, 
				DATE_FORMAT(last_sync, '%Y-%m-%d %H:%i:%s') as last_sync 
			FROM fingerprint_scanners
		`;
		let scannerParams: any[] = [];

		if (!isSuperAdmin) {
			scannerQuery += ' WHERE department_id IS NULL OR department_id = ?';
			scannerParams.push(actualDeptId);
		}
		scannerQuery += ' ORDER BY ip_address ASC';

		const [scanners]: any = await pool.execute(scannerQuery, scannerParams);
		const [leaveTypes]: any = await pool.execute('SELECT * FROM leave_types ORDER BY id ASC');

		return { divisions, sections, positions, groups, projects, scanners, leaveTypes, departments };
	} catch (error) {
		return {
			divisions: [],
			sections: [],
			positions: [],
			groups: [],
			projects: [],
			scanners: [],
			leaveTypes: [],
			departments: []
		};
	}
};

export const actions: Actions = {
	save: async ({ request }) => {
		const data = await request.formData();

		const id = data.get('id')?.toString() || null;
		const tab = data.get('tab')?.toString() || '';
		const name = data.get('name')?.toString() || '';
		const name_en = data.get('name_en')?.toString() || '';
		const description = data.get('description')?.toString() || '';
		const status = data.get('status')?.toString() || '';

		let table = '';
		let col = '';
		let finalStatus: string | number = status === 'Active' ? 'Active' : 'Inactive';

		if (tab === 'division') {
			table = 'divisions';
			col = 'division_name';
		} else if (tab === 'section') {
			table = 'sections';
			col = 'section_name';
		} else if (tab === 'position') {
			table = 'job_positions';
			col = 'position_name';
			finalStatus = status === 'Active' ? 1 : 0;
		} else if (tab === 'group') {
			table = '`groups`';
			col = 'group_name';
		} else if (tab === 'project') {
			table = 'projects';
			col = 'project_name';
		} else if (tab === 'scanner') {
			table = 'fingerprint_scanners';
			col = 'device_name';
		} else if (tab === 'leave_type') {
			table = 'leave_types';
			col = 'leave_name_th';
			finalStatus = status === 'Active' ? 1 : 0;
		}

		try {
			if (id) {
				if (tab === 'leave_type') {
					await pool.execute(
						`UPDATE leave_types SET leave_name_th = ?, leave_name_en = ?, is_active = ? WHERE id = ?`,
						[name, name_en, finalStatus, id] as any[]
					);
				} else if (tab === 'scanner') {
					const ip_address = data.get('ip_address')?.toString() || '';
					const department_id = data.get('department_id')?.toString() || null;
					await pool.execute(
						`UPDATE fingerprint_scanners SET device_name = ?, ip_address = ?, status = ?, department_id = ? WHERE id = ?`,
						[name, ip_address, status, department_id, id] as any[]
					);
				} else {
					await pool.execute(
						`UPDATE ${table} SET ${col} = ?, description = ?, status = ? WHERE id = ?`,
						[name, description, finalStatus, id] as any[]
					);
				}
			} else {
				if (tab === 'leave_type') {
					await pool.execute(
						`INSERT INTO leave_types (leave_name_th, leave_name_en, is_active) VALUES (?, ?, ?)`,
						[name, name_en, finalStatus] as any[]
					);
				} else if (tab === 'scanner') {
					const ip_address = data.get('ip_address')?.toString() || '';
					const department_id = data.get('department_id')?.toString() || null;
					await pool.execute(
						`INSERT INTO fingerprint_scanners (device_name, ip_address, status, department_id) VALUES (?, ?, ?, ?)`,
						[name, ip_address, status, department_id] as any[]
					);
				} else {
					await pool.execute(
						`INSERT INTO ${table} (${col}, description, status) VALUES (?, ?, ?)`,
						[name, description, finalStatus] as any[]
					);
				}
			}
			return { success: true, message: 'บันทึกสำเร็จ' };
		} catch (error) {
			console.error(error);
			return fail(400, { success: false, message: 'ข้อมูลซ้ำหรือผิดพลาด' });
		}
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString() || null;
		const tab = data.get('tab')?.toString() || '';

		let table =
			tab === 'section'
				? 'sections'
				: tab === 'position'
					? 'job_positions'
					: tab === 'group'
						? '`groups`'
						: tab === 'project'
							? 'projects'
							: tab === 'scanner'
								? 'fingerprint_scanners'
								: tab === 'leave_type'
									? 'leave_types'
									: 'divisions';

		try {
			await pool.execute(`DELETE FROM ${table} WHERE id = ?`, [id] as any[]);
			return { success: true, message: 'ลบข้อมูลสำเร็จ' };
		} catch (error) {
			return fail(400, { success: false, message: 'ไม่สามารถลบข้อมูลได้' });
		}
	}
};
