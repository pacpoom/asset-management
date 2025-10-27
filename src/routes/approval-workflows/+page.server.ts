import db from '$lib/server/database'; // Using default import
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async () => {
	// Fetch existing workflows with department names
	// FIX: Destructure to get rows (first element) from db.query
	// FIX: Reverted to use 'department_id' based on the new error
	const [workflows] = await db.query(`
		SELECT 
			aw.*, 
			d.name as department_name 
		FROM approval_workflows aw
		LEFT JOIN departments d ON aw.department_id = d.id -- Reverted to department_id
		ORDER BY aw.name
	`);

	// Fetch departments for the "create" form
	// FIX: Destructure to get rows (first element) from db.query
	const [departments] = await db.query('SELECT id, name FROM departments ORDER BY name');

	return {
		workflows, // This is now the array of rows
		departments  // This is now the array of rows
	};
};

export const actions: Actions = {
	createWorkflow: async ({ request }) => {
		const data = await request.formData();
		const name = data.get('name') as string;
		const document_type = data.get('document_type') as ('PR' | 'PO');
		// ตัวแปรรับค่าจาก form ยังเป็น department_id เหมือนเดิม (ซึ่งถูกต้อง)
		const department_id = data.get('department_id') ? Number(data.get('department_id')) : null;
		const min_amount = data.get('min_amount') ? Number(data.get('min_amount')) : null;
		const max_amount = data.get('max_amount') ? Number(data.get('max_amount')) : null;

		if (!name || !document_type) {
			return fail(400, { success: false, message: 'Name and Document Type are required.' });
		}

		try {
			// Insert new workflow into the database
			// FIX: Reverted to use 'department_id'
			await db.query(`
				INSERT INTO approval_workflows 
					(name, document_type, department_id, min_amount, max_amount, is_active)
				VALUES
					(?, ?, ?, ?, ?, TRUE)
			`, [name, document_type, department_id, min_amount, max_amount]); // ค่าที่ส่งยังคงเรียงลำดับเดิม

			return { success: true, message: 'Workflow created successfully.' };
		} catch (error: any) {
			console.error('Error creating workflow:', error);
			return fail(500, { success: false, message: `Failed to create workflow: ${error.message}` });
		}
	}
};