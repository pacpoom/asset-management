import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { vdcPool } from '$lib/server/database';

export const GET: RequestHandler = async ({ url }) => {
	const vin = url.searchParams.get('vin');
	const q = url.searchParams.get('q');

	if (!vin && !q) return json({ error: 'กรุณาระบุเลขตัวถัง (VIN) หรือคำค้นหา' }, { status: 400 });

	try {
		let sql = `
            SELECT 
                g.vin_number,
                COALESCE(cat_model.topic, vc.model) AS model,
                COALESCE(cat_color.topic, vc.color) AS color
            FROM gaoff g
            LEFT JOIN gcms_vehicle_code vc ON g.vc_code = vc.vehicle_code
            LEFT JOIN gcms_category cat_model 
                ON vc.model = cat_model.category_id 
                AND cat_model.type = 'vehicle_model' 
            LEFT JOIN gcms_category cat_color 
                ON vc.color = cat_color.category_id 
                AND cat_color.type = 'vehicle_color'
        `;

		if (q) {
			sql += ` WHERE g.vin_number LIKE ? LIMIT 15`;
			const [rows] = await vdcPool.execute<any[]>(sql, [`%${q}%`]);
			return json(rows);
		} else {
			sql += ` WHERE g.vin_number = ? LIMIT 1`;
			const [rows] = await vdcPool.execute<any[]>(sql, [vin]);

			if (rows.length === 0) {
				return json({ found: false, message: 'ไม่พบข้อมูลรถในระบบ VDC' });
			}
			return json({ found: true, data: rows[0] });
		}
	} catch (error: any) {
		console.error('VDC Connection Error:', error);
		return json(
			{ error: 'ไม่สามารถเชื่อมต่อฐานข้อมูล VDC ได้: ' + error.message },
			{ status: 500 }
		);
	}
};
