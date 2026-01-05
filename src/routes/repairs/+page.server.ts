import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export const load: PageServerLoad = async () => {
	try {
		const [repairs] = await pool.execute<any[]>(
			`SELECT 
				ar.*, 
				DATE_FORMAT(ar.created_at, '%d/%m/%Y %H:%i') as created_at_formatted,
				a.asset_tag 
			 FROM asset_repairs ar
			 LEFT JOIN assets a ON ar.asset_id = a.id
			 ORDER BY ar.created_at DESC`
		);

		const [assets] = await pool.execute<any[]>('SELECT id, asset_tag, name FROM assets');

		return {
			repairs: repairs.map((r) => ({ ...r })),
			assets: assets.map((a) => ({ ...a }))
		};
	} catch (error) {
		console.error('Error loading repairs:', error);
		return { repairs: [], assets: [] };
	}
};

export const actions: Actions = {
	updateRepair: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const asset_id = data.get('asset_id') || null;
		const repair_status = data.get('repair_status');
		const admin_notes = data.get('admin_notes');
		const completion_image = data.get('completion_image') as File;

		try {
			let completionImageUrl = data.get('existing_completion_image')?.toString() || null;

			if (completion_image && completion_image.size > 0) {
				const uploadDir = join(process.cwd(), 'static', 'uploads', 'repairs');
				if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
				const fileName = `fixed-${Date.now()}-${completion_image.name}`;
				const filePath = join(uploadDir, fileName);
				const buffer = Buffer.from(await completion_image.arrayBuffer());
				writeFileSync(filePath, buffer);
				completionImageUrl = `/uploads/repairs/${fileName}`;
			}

			await pool.execute(
				`UPDATE asset_repairs SET 
                    asset_id = ?, 
                    repair_status = ?, 
                    admin_notes = ?, 
                    completion_image_url = ? 
                 WHERE id = ?`,
				[asset_id, repair_status, admin_notes, completionImageUrl, id]
			);
			return { success: true };
		} catch (error) {
			console.error(error);
			return fail(500, { message: 'อัปเดตไม่สำเร็จ' });
		}
	},
	deleteRepair: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		try {
			await pool.execute('DELETE FROM asset_repairs WHERE id = ?', [id]);
			return { success: true };
		} catch (error) {
			return fail(500, { message: 'ลบไม่สำเร็จ' });
		}
	}
};
