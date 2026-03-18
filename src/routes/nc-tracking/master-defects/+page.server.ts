import { fail } from '@sveltejs/kit';
import db from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';

export const load = async () => {
	let connection;
	try {
		connection = await db.getConnection();
		const [rows] = await connection.execute<RowDataPacket[]>(
			'SELECT * FROM master_defects ORDER BY id ASC'
		);
		return { defects: rows };
	} catch (error: any) {
		console.error('Database error:', error);
		return { defects: [] };
	} finally {
		if (connection) connection.release();
	}
};

export const actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString();
		const description = data.get('description')?.toString() || '';

		if (!name) {
			return fail(400, { error: 'กรุณากรอกชื่อลักษณะปัญหา' });
		}

		let connection;
		try {
			connection = await db.getConnection();
			await connection.execute(
				'INSERT INTO master_defects (name, description, is_active) VALUES (?, ?, 1)',
				[name, description]
			);
			return { success: true };
		} catch (error: any) {
			return fail(500, { error: error.message });
		} finally {
			if (connection) connection.release();
		}
	},

	update: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const name = data.get('name')?.toString();
		const description = data.get('description')?.toString() || '';

		if (!id || !name) return fail(400, { error: 'ข้อมูลไม่ครบถ้วน' });

		let connection;
		try {
			connection = await db.getConnection();
			await connection.execute('UPDATE master_defects SET name = ?, description = ? WHERE id = ?', [
				name,
				description,
				id
			]);
			return { success: true };
		} catch (error: any) {
			return fail(500, { error: error.message });
		} finally {
			if (connection) connection.release();
		}
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { error: 'ไม่พบ ID' });

		let connection;
		try {
			connection = await db.getConnection();
			await connection.execute('DELETE FROM master_defects WHERE id = ?', [id]);
			return { success: true };
		} catch (error: any) {
			return fail(500, { error: 'ไม่สามารถลบได้ เนื่องจากข้อมูลนี้ถูกใช้งานอยู่' });
		} finally {
			if (connection) connection.release();
		}
	}
};
