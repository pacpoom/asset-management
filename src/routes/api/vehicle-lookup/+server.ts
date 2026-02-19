import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { vdcPool } from '$lib/server/database';

export const GET: RequestHandler = async ({ url }) => {
	const vin = url.searchParams.get('vin');
	if (!vin) return json({ error: 'กรุณาระบุเลขตัวถัง (VIN)' }, { status: 400 });

	try {
		// แก้ไข SQL: Join ตาราง category 2 ครั้ง เพื่อดึงชื่อ Model และ Color
		const sql = `
            SELECT 
                g.vin_number,
                
                -- แปลงรหัส Model เป็นชื่อ (ถ้าหาไม่เจอให้ใช้รหัสเดิม)
                COALESCE(cat_model.topic, vc.model) AS model,
                
                -- แปลงรหัส Color เป็นชื่อ
                COALESCE(cat_color.topic, vc.color) AS color

            FROM gaoff g
            
            -- 1. ดึงข้อมูล Code รถ
            LEFT JOIN gcms_vehicle_code vc ON g.vc_code = vc.vehicle_code
            
            -- 2. Join เพื่อดึงชื่อ Model (สมมติว่า type คือ 'vehicle_model')
            LEFT JOIN gcms_category cat_model 
                ON vc.model = cat_model.category_id 
                AND cat_model.type = 'vehicle_model' 
            
            -- 3. Join เพื่อดึงชื่อ Color (type = 'vehicle_color')
            LEFT JOIN gcms_category cat_color 
                ON vc.color = cat_color.category_id 
                AND cat_color.type = 'vehicle_color'
            
            WHERE g.vin_number = ?
            LIMIT 1
        `;

		const [rows] = await vdcPool.execute<any[]>(sql, [vin]);

		if (rows.length === 0) {
			return json({ found: false, message: 'ไม่พบข้อมูลรถในระบบ VDC' });
		}

		return json({ found: true, data: rows[0] });
	} catch (error: any) {
		console.error('VDC Connection Error:', error);
		return json(
			{ error: 'ไม่สามารถเชื่อมต่อฐานข้อมูล VDC ได้: ' + error.message },
			{ status: 500 }
		);
	}
};
