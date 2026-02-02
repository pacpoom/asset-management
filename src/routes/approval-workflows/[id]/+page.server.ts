import db from '$lib/server/database';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const workflowId = Number(params.id);
	if (isNaN(workflowId)) {
		throw error(404, 'Not found');
	}

	const [workflowRows] = await db.query<any[]>('SELECT * FROM approval_workflows WHERE id = ?', [
		workflowId
	]);
	if (workflowRows.length === 0) {
		throw error(404, 'Workflow not found');
	}

	const [steps] = await db.query<any[]>(
		`
		SELECT 
			aws.*,
			p.name as position_name,
			d.name as department_name
		FROM approval_workflow_steps aws
		JOIN positions p ON aws.approver_position_id = p.id
		LEFT JOIN departments d ON aws.approver_department_id = d.id
		WHERE aws.workflow_id = ?
		ORDER BY aws.step_order
	`,
		[workflowId]
	);

	const [positions] = await db.query<any[]>('SELECT id, name FROM positions ORDER BY name');
	const [departments] = await db.query<any[]>('SELECT id, name FROM departments ORDER BY name');

	return {
		workflow: JSON.parse(JSON.stringify(workflowRows[0])),
		steps: JSON.parse(JSON.stringify(steps)),
		positions: JSON.parse(JSON.stringify(positions)),
		departments: JSON.parse(JSON.stringify(departments))
	};
};

export const actions: Actions = {
	updateWorkflow: async ({ request, params }) => {
		const workflowId = Number(params.id);
		const data = await request.formData();

		const name = data.get('name') as string;
		const department_id = data.get('department_id') ? Number(data.get('department_id')) : null;
		const min_amount = data.get('min_amount') ? Number(data.get('min_amount')) : null;
		const max_amount = data.get('max_amount') ? Number(data.get('max_amount')) : null;
		const is_active = data.get('is_active') === 'on';

		try {
			await db.query<any>(
				`
				UPDATE approval_workflows
				SET name = ?, department_id = ?, min_amount = ?, max_amount = ?, is_active = ?
				WHERE id = ?
			`,
				[name, department_id, min_amount, max_amount, is_active, workflowId]
			);
			return { success: true, message: 'Workflow updated.' };
		} catch (e: any) {
			return fail(500, { success: false, message: e.message });
		}
	},

	addStep: async ({ request, params }) => {
		const workflowId = Number(params.id);
		const data = await request.formData();

		const step_order = Number(data.get('step_order'));
		const approver_position_id = Number(data.get('approver_position_id'));
		const approver_department_id = data.get('approver_department_id')
			? Number(data.get('approver_department_id'))
			: null;
		const approval_type = data.get('approval_type') as 'Any' | 'All';

		if (!step_order || !approver_position_id || !approval_type) {
			return fail(400, { success: false, message: 'Missing required fields for the step.' });
		}

		try {
			await db.query<any>(
				`
				INSERT INTO approval_workflow_steps
					(workflow_id, step_order, approver_position_id, approver_department_id, approval_type)
				VALUES
					(?, ?, ?, ?, ?)
			`,
				[workflowId, step_order, approver_position_id, approver_department_id, approval_type]
			);
			return { success: true, message: 'Step added.' };
		} catch (e: any) {
			return fail(500, { success: false, message: e.message });
		}
	},

	deleteStep: async ({ request }) => {
		const data = await request.formData();
		const stepId = Number(data.get('step_id'));

		if (!stepId) {
			return fail(400, { success: false, message: 'Invalid Step ID.' });
		}

		try {
			await db.query<any>('DELETE FROM approval_workflow_steps WHERE id = ?', [stepId]);
			return { success: true, message: 'Step deleted.' };
		} catch (e: any) {
			return fail(500, { success: false, message: e.message });
		}
	}
};
