import { fail } from '@sveltejs/kit';
import pool from '$lib/server/database';
import path from 'path';
import fs from 'fs/promises';

// โฟลเดอร์เก็บรูป (สร้างโฟลเดอร์ uploads/inspections ในโปรเจคด้วยนะครับ)
const UPLOAD_DIR = path.resolve('uploads', 'inspections');

async function saveFile(file: File) {
	if (!file || file.size === 0) return null;
	// สร้างโฟลเดอร์ถ้ายังไม่มี
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

	// 1. ดึงรายการ Inspection ล่าสุด
	const [rows] = await pool.query(
		'SELECT * FROM inspections ORDER BY created_at DESC LIMIT ? OFFSET ?',
		[limit, offset]
	);
	const [count] = await pool.query('SELECT COUNT(*) as total FROM inspections');

	// 2. ดึง Master Data
	const [parts] = await pool.query('SELECT * FROM master_parts ORDER BY name ASC');
	const [defects] = await pool.query('SELECT * FROM master_defects ORDER BY name ASC');
	const [solutions] = await pool.query('SELECT * FROM master_solutions ORDER BY name ASC');

	return {
		checklists: JSON.parse(JSON.stringify(rows)),
		total: (count as any)[0].total,
		page,
		limit,
		masterParts: JSON.parse(JSON.stringify(parts)),
		masterDefects: JSON.parse(JSON.stringify(defects)),
		masterSolutions: JSON.parse(JSON.stringify(solutions))
	};
};

export const actions = {
	create: async ({ request }) => {
		const formData = await request.formData();

		try {
			const imgZoomFile = formData.get('img_zoom') as File;
			const imgFarFile = formData.get('img_far') as File;
			const imgZoomPath = await saveFile(imgZoomFile);
			const imgFarPath = await saveFile(imgFarFile);

			const sql = `
				INSERT INTO inspections (
					vin_no, model, color, soc, mile, 
					parts_name, position, defect, solution, 
					img_zoom, img_far, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
			`;

			await pool.execute(sql, [
				formData.get('vin_no'),
				formData.get('model'),
				formData.get('color'),
				formData.get('soc') || null,
				formData.get('mile') || null,
				formData.get('parts_name'),
				formData.get('position'),
				formData.get('defect'),
				formData.get('solution'),
				imgZoomPath,
				imgFarPath
			]);

			return { success: true };
		} catch (err) {
			console.error(err);
			return fail(500, { message: 'Save failed' });
		}
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		await pool.query('DELETE FROM inspections WHERE id = ?', [data.get('id')]);
		return { success: true };
	}
};
