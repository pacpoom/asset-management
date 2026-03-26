import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { locationIds, printCount } = body;

		if (!locationIds || locationIds.length === 0 || !printCount) {
			return json({ success: false, message: 'Invalid request data' }, { status: 400 });
		}

		const connection = await pool.getConnection();

		try {
			const placeholders = locationIds.map(() => '?').join(',');
			const [locations] = await connection.execute<RowDataPacket[]>(
				`SELECT location_code, zone, area, bin, min_capacity, max_capacity FROM locations WHERE id IN (${placeholders})`, // 🌟 เพิ่ม area, bin ตรงนี้
				locationIds
			);

			const labels = [];

			for (const loc of locations) {
				for (let i = 0; i < printCount; i++) {
					labels.push({
						location_code: loc.location_code,
						zone: loc.zone,
						area: loc.area,
						bin: loc.bin,
						min_capacity: loc.min_capacity,
						max_capacity: loc.max_capacity,
						qr_text: loc.location_code
					});
				}
			}

			return json({ success: true, labels });
		} finally {
			connection.release();
		}
	} catch (error: any) {
		console.error('Failed to generate location labels:', error);
		return json({ success: false, message: error.message }, { status: 500 });
	}
};
