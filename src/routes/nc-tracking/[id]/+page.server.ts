import { error } from '@sveltejs/kit';
import pool from '$lib/server/database';

export const load = async ({ params }) => {
	const id = params.id;

	try {
		const [headerRows] = await pool.query('SELECT * FROM pdi_records WHERE id = ?', [id]);

		if (!headerRows || (headerRows as any[]).length === 0) {
			throw error(404, 'ไม่พบข้อมูลการตรวจสอบนี้');
		}

		const headerInfo = (headerRows as any[])[0];

		const [itemRows] = await pool.query(
			'SELECT * FROM pdi_results WHERE pdi_record_id = ? ORDER BY id ASC',
			[id]
		);

		return {
			headerInfo: JSON.parse(JSON.stringify(headerInfo)),
			items: JSON.parse(JSON.stringify(itemRows))
		};
	} catch (err) {
		console.error(err);
		throw error(500, 'Database Error');
	}
};
