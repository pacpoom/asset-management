import { error, fail, redirect } from '@sveltejs/kit';
import pool from '$lib/server/database';
import fs from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = path.resolve('uploads', 'inspections');

async function saveFile(file: File) {
	if (!file || file.size === 0) return null;
	try {
		await fs.access(UPLOAD_DIR);
	} catch {
		await fs.mkdir(UPLOAD_DIR, { recursive: true });
	}
	const ext = path.extname(file.name);
	const filename = `INS-${Date.now()}-${Math.round(Math.random() * 1e5)}${ext}`;
	await fs.writeFile(path.join(UPLOAD_DIR, filename), Buffer.from(await file.arrayBuffer()));
	return filename;
}

export const load = async ({ params }) => {
	const id = params.id;
	try {
		// 1. ดึงข้อมูลหัวบิลจาก pdi_records
		const [recordRows] = await pool.query('SELECT * FROM pdi_records WHERE id = ?', [id]);
		if (!recordRows || (recordRows as any[]).length === 0)
			throw error(404, 'ไม่พบข้อมูลการตรวจสอบนี้');
		const record = (recordRows as any[])[0];

		// 2. ดึงรายการผลการตรวจจาก pdi_results
		const [itemRows] = await pool.query(
			'SELECT * FROM pdi_results WHERE pdi_record_id = ? ORDER BY id ASC',
			[id]
		);

		// 3. ดึง Master Data
		const [defects] = await pool.query('SELECT * FROM master_defects ORDER BY name ASC');
		const [solutions] = await pool.query('SELECT * FROM master_solutions ORDER BY name ASC');
		const [parts] = await pool.query('SELECT * FROM master_parts ORDER BY id ASC');

		return {
			record: JSON.parse(JSON.stringify(record)),
			items: JSON.parse(JSON.stringify(itemRows)),
			masterDefects: JSON.parse(JSON.stringify(defects)),
			masterSolutions: JSON.parse(JSON.stringify(solutions)),
			masterParts: JSON.parse(JSON.stringify(parts))
		};
	} catch (err) {
		console.error(err);
		throw error(500, 'Database Error');
	}
};

export const actions = {
	update: async ({ request, params }) => {
		const id = params.id;
		const formData = await request.formData();
		const pdiDataStr = formData.get('pdi_data') as string;
		if (!pdiDataStr) return fail(400, { message: 'ไม่พบข้อมูลผลการตรวจ' });
		const pdiData = JSON.parse(pdiDataStr);

		try {
			// อัปเดตตารางแม่ (pdi_records)
			await pool.execute(
				`UPDATE pdi_records SET vin_no = ?, model = ?, color = ?, soc = ?, mile = ? WHERE id = ?`,
				[
					formData.get('vin_no'),
					formData.get('model'),
					formData.get('color'),
					formData.get('soc') || null,
					formData.get('mile') || null,
					id
				]
			);

			// อัปเดตตารางลูก (pdi_results)
			for (const item of pdiData) {
				let imgZoomPath = item.img_zoom;
				let imgFarPath = item.img_far;

				const zoomFile = formData.get(`img_zoom_${item.work_detail_id}`) as File;
				const farFile = formData.get(`img_far_${item.work_detail_id}`) as File;

				if (zoomFile && zoomFile.size > 0) imgZoomPath = await saveFile(zoomFile);
				if (farFile && farFile.size > 0) imgFarPath = await saveFile(farFile);

				await pool.execute(
					`UPDATE pdi_results SET status = ?, position = ?, defect = ?, solution = ?, img_zoom = ?, img_far = ? 
					 WHERE pdi_record_id = ? AND work_detail_id = ?`,
					[
						item.status,
						item.position || null,
						item.defect || null,
						item.solution || null,
						imgZoomPath,
						imgFarPath,
						id,
						item.work_detail_id
					]
				);
			}
		} catch (err) {
			console.error(err);
			return fail(500, { message: 'อัปเดตไม่สำเร็จ' });
		}
		throw redirect(303, '/nc-tracking');
	}
};
