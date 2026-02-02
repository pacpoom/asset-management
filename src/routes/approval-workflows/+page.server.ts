import db from '$lib/server/database';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async () => {
	const [workflows] = await db.query<any[]>(`
		SELECT 
			aw.*, 
			d.name as department_name 
		FROM approval_workflows aw
		LEFT JOIN departments d ON aw.department_id = d.id
		ORDER BY aw.name
	`);

	const [departments] = await db.query<any[]>('SELECT id, name FROM departments ORDER BY name');

	return {
		workflows: JSON.parse(JSON.stringify(workflows)),
		departments: JSON.parse(JSON.stringify(departments))
	};
};

export const actions: Actions = {
	createWorkflow: async ({ request }) => {
		const data = await request.formData();
		const name = data.get('name') as string;
		const document_type = data.get('document_type') as 'PR' | 'PO';
		const department_id = data.get('department_id') ? Number(data.get('department_id')) : null;
		const min_amount = data.get('min_amount') ? Number(data.get('min_amount')) : null;
		const max_amount = data.get('max_amount') ? Number(data.get('max_amount')) : null;

		if (!name || !document_type) {
			return fail(400, { success: false, message: 'Name and Document Type are required.' });
		}

		try {
			await db.query<any>(
				`
				INSERT INTO approval_workflows 
					(name, document_type, department_id, min_amount, max_amount, is_active)
				VALUES
					(?, ?, ?, ?, ?, TRUE)
			`,
				[name, document_type, department_id, min_amount, max_amount]
			);

			return { success: true, message: 'Workflow created successfully.' };
		} catch (error: any) {
			console.error('Error creating workflow:', error);
			return fail(500, { success: false, message: `Failed to create workflow: ${error.message}` });
		}
	}
};
