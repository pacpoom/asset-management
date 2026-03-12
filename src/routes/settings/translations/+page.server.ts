import { fail } from '@sveltejs/kit';
import pool from '$lib/server/database';

export const load = async () => {
	try {
		const [translations] = await pool.query(
			'SELECT * FROM system_translations ORDER BY created_at DESC'
		);
		return {
			translations: translations as any[]
		};
	} catch (error) {
		console.error('Error loading translations:', error);
		return { translations: [] };
	}
};

export const actions = {
	save: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const translation_key = data.get('translation_key')?.toString().trim();
		const en_text = data.get('en_text')?.toString().trim();
		const th_text = data.get('th_text')?.toString().trim();

		if (!translation_key) {
			return fail(400, { success: false, message: 'Translation Key is required.' });
		}

		try {
			if (id) {
				await pool.query(
					'UPDATE system_translations SET translation_key = ?, en_text = ?, th_text = ? WHERE id = ?',
					[translation_key, en_text, th_text, id]
				);
				return { success: true, message: 'Translation updated successfully!' };
			} else {
				const [existing] = await pool.query(
					'SELECT id FROM system_translations WHERE translation_key = ?',
					[translation_key]
				);
				if ((existing as any[]).length > 0) {
					return fail(400, { success: false, message: 'This Translation Key already exists.' });
				}

				await pool.query(
					'INSERT INTO system_translations (translation_key, en_text, th_text) VALUES (?, ?, ?)',
					[translation_key, en_text, th_text]
				);
				return { success: true, message: 'New translation added successfully!' };
			}
		} catch (error) {
			console.error('Error saving translation:', error);
			return fail(500, { success: false, message: 'Database error occurred.' });
		}
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { success: false, message: 'ID is required' });

		try {
			await pool.query('DELETE FROM system_translations WHERE id = ?', [id]);
			return { success: true, message: 'Translation deleted successfully!' };
		} catch (error) {
			console.error('Error deleting translation:', error);
			return fail(500, { success: false, message: 'Database error occurred.' });
		}
	}
};
