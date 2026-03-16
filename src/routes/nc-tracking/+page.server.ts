import { error, fail } from '@sveltejs/kit';
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

export const load = async ({ url }) => {
	const page = Number(url.searchParams.get('page')) || 1;
	const limit = 10;
	const offset = (page - 1) * limit;

	try {
		// 🌟 ดึงข้อมูลหัวบิล พร้อมนับจำนวนข้อที่ NG มาโชว์
		const [rows] = await pool.query(
			`SELECT r.*, 
			(SELECT COUNT(*) FROM pdi_results WHERE pdi_record_id = r.id AND status = 'NG') as ng_count 
			FROM pdi_records r 
			ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
			[limit, offset]
		);
		const [count] = await pool.query('SELECT COUNT(*) as total FROM pdi_records');

		const [masters] = await pool.query('SELECT * FROM Work_Master ORDER BY id ASC');
		const [details] = await pool.query('SELECT * FROM Work_detail ORDER BY id ASC');
		const [defects] = await pool.query('SELECT * FROM master_defects ORDER BY name ASC');
		const [solutions] = await pool.query('SELECT * FROM master_solutions ORDER BY name ASC');
		const [parts] = await pool.query('SELECT * FROM master_parts ORDER BY id ASC');

		return {
			checklists: JSON.parse(JSON.stringify(rows)),
			total: (count as any)[0].total,
			page,
			limit,
			masters: JSON.parse(JSON.stringify(masters)),
			details: JSON.parse(JSON.stringify(details)),
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
	submit_pdi: async ({ request }) => {
		const formData = await request.formData();
		const vin_no = formData.get('vin_no') as string;
		const model = formData.get('model') as string;
		const color = formData.get('color') as string;
		const soc = formData.get('soc') ? Number(formData.get('soc')) : null;
		const mile = formData.get('mile') ? Number(formData.get('mile')) : null;
		const pdiDataStr = formData.get('pdi_data') as string;

		if (!pdiDataStr) return fail(400, { message: 'ไม่พบข้อมูลการตรวจสอบ' });
		const pdiData = JSON.parse(pdiDataStr);

		try {
			// 1. 🌟 บันทึกลงตารางแม่ (pdi_records) ก่อน
			const [recordResult] = await pool.execute(
				`INSERT INTO pdi_records (vin_no, model, color, soc, mile) VALUES (?, ?, ?, ?, ?)`,
				[vin_no, model, color, soc, mile]
			);
			const recordId = (recordResult as any).insertId;

			// 2. 🌟 วนลูปบันทึกลงตารางลูก (pdi_results)
			for (const item of pdiData) {
				let imgZoomPath = null;
				let imgFarPath = null;

				if (item.status === 'NG') {
					const zoomFile = formData.get(`img_zoom_${item.work_detail_id}`) as File;
					const farFile = formData.get(`img_far_${item.work_detail_id}`) as File;
					if (zoomFile && zoomFile.size > 0) imgZoomPath = await saveFile(zoomFile);
					if (farFile && farFile.size > 0) imgFarPath = await saveFile(farFile);
				}

				await pool.execute(
					`INSERT INTO pdi_results 
					(pdi_record_id, work_detail_id, work_name, status, position, defect, solution, img_zoom, img_far)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					[
						recordId,
						item.work_detail_id,
						item.parts_name,
						item.status,
						item.position || null,
						item.defect || null,
						item.solution || null,
						imgZoomPath,
						imgFarPath
					]
				);
			}
		} catch (err) {
			console.error(err);
			return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
		}
		return { success: true };
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');
		try {
			// ลบแค่ตารางแม่ เดี๋ยวตารางลูกมันจะหายตามไปเอง (เพราะ ON DELETE CASCADE)
			await pool.execute('DELETE FROM pdi_records WHERE id = ?', [id]);
		} catch (err) {
			console.error(err);
			return fail(500, { message: 'ลบข้อมูลไม่สำเร็จ' });
		}
		return { success: true };
	}
};
