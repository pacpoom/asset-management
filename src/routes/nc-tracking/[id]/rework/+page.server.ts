import { fail, redirect } from '@sveltejs/kit';
import db from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';

export const load = async ({ params }) => {
	const { id } = params;
	let connection;

	try {
		connection = await db.getConnection();

		const [recordRows] = await connection.execute<RowDataPacket[]>(
			'SELECT * FROM pdi_records WHERE id = ?',
			[id]
		);

		if (recordRows.length === 0) {
			throw redirect(302, '/nc-tracking');
		}

		const [ngItems] = await connection.execute<RowDataPacket[]>(
			'SELECT * FROM pdi_results WHERE pdi_record_id = ? AND status = "NG" ORDER BY id ASC',
			[id]
		);

		const cleanedNgItems = ngItems.map((item) => {
			let cleanDefect = item.defect;
			if (
				typeof cleanDefect === 'string' &&
				cleanDefect.startsWith('{') &&
				cleanDefect.endsWith('}')
			) {
				try {
					const parsed = JSON.parse(cleanDefect);
					cleanDefect = parsed.label || parsed.value || cleanDefect;
				} catch (e) {}
			}

			let cleanSolution = item.solution;
			if (
				typeof cleanSolution === 'string' &&
				cleanSolution.startsWith('{') &&
				cleanSolution.endsWith('}')
			) {
				try {
					const parsed = JSON.parse(cleanSolution);
					cleanSolution = parsed.label || parsed.value || cleanSolution;
				} catch (e) {}
			}

			return { ...item, defect: cleanDefect, solution: cleanSolution };
		});

		return {
			record: recordRows[0],
			ngItems: cleanedNgItems
		};
	} catch (error: any) {
		console.error('Error loading rework data:', error);
		throw error;
	} finally {
		if (connection) connection.release();
	}
};

export const actions = {
	saveRepair: async ({ request, params }) => {
		const data = await request.formData();
		const { id } = params;
		const items = JSON.parse(data.get('items')?.toString() || '[]');

		if (!items || items.length === 0) {
			return fail(400, { error: 'ไม่พบข้อมูลที่ต้องการบันทึก' });
		}

		let connection;
		try {
			connection = await db.getConnection();
			await connection.beginTransaction();

			for (const item of items) {
				await connection.execute(
					'UPDATE pdi_results SET repair_status = ?, repair_note = ? WHERE id = ? AND pdi_record_id = ?',
					[item.repair_status, item.repair_note, item.id, id]
				);
			}

			await connection.commit();
			return { success: true };
		} catch (error: any) {
			if (connection) await connection.rollback();
			return fail(500, { error: error.message });
		} finally {
			if (connection) connection.release();
		}
	}
};
