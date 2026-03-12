import { json } from '@sveltejs/kit';
import pool from '$lib/server/database';

export const GET = async () => {
	try {
		const [rows] = await pool.query(
			'SELECT translation_key, en_text, th_text FROM system_translations'
		);
		return json(rows);
	} catch (error) {
		console.error('Error fetching translations:', error);
		return json({ error: 'Failed to fetch translations' }, { status: 500 });
	}
};
