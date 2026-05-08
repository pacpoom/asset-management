import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
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
		const [scanners]: any = await pool.execute(
			'SELECT * FROM fingerprint_scanners ORDER BY ip_address ASC'
		);

		const [leaveTypes]: any = await pool.execute('SELECT * FROM leave_types ORDER BY id ASC');

		return { divisions, sections, positions, groups, projects, scanners, leaveTypes };
	} catch (error) {
		return {
			divisions: [],
			sections: [],
			positions: [],
			groups: [],
			projects: [],
			scanners: [],
			leaveTypes: []
		};
	}
};

export const actions: Actions = {
	save: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const tab = data.get('tab')?.toString();
		const name = data.get('name')?.toString();
		const name_en = data.get('name_en')?.toString();
		const description = data.get('description')?.toString();
		const status = data.get('status')?.toString();

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
						[name, name_en, finalStatus, id]
					);
				} else if (tab === 'scanner') {
					const ip_address = data.get('ip_address')?.toString();
					await pool.execute(
						`UPDATE fingerprint_scanners SET device_name = ?, ip_address = ?, status = ? WHERE id = ?`,
						[name, ip_address, status, id]
					);
				} else {
					await pool.execute(
						`UPDATE ${table} SET ${col} = ?, description = ?, status = ? WHERE id = ?`,
						[name, description, finalStatus, id]
					);
				}
			} else {
				if (tab === 'leave_type') {
					await pool.execute(
						`INSERT INTO leave_types (leave_name_th, leave_name_en, is_active) VALUES (?, ?, ?)`,
						[name, name_en, finalStatus]
					);
				} else if (tab === 'scanner') {
					const ip_address = data.get('ip_address')?.toString();
					await pool.execute(
						`INSERT INTO fingerprint_scanners (device_name, ip_address, status) VALUES (?, ?, ?)`,
						[name, ip_address, status]
					);
				} else {
					await pool.execute(
						`INSERT INTO ${table} (${col}, description, status) VALUES (?, ?, ?)`,
						[name, description, finalStatus]
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
		const id = data.get('id')?.toString();
		const tab = data.get('tab')?.toString();

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
			await pool.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
			return { success: true, message: 'ลบข้อมูลสำเร็จ' };
		} catch (error) {
			return fail(400, { success: false, message: 'ไม่สามารถลบข้อมูลได้' });
		}
	}
};
