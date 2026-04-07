import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

type Department = RowDataPacket & { id: number; name: string };
type DocumentType = RowDataPacket & { id: number; code: string; name: string };
type Role = RowDataPacket & { id: number; name: string };
type User = RowDataPacket & { id: number; full_name: string; email: string | null };

type FlowRow = RowDataPacket & {
	id: number;
	name: string;
	department_id: number;
	department_name: string;
	iso_document_type_id: number | null;
	document_type_code: string | null;
	document_type_name: string | null;
	is_active: number;
	qmr_user_ids_json: string | null;
	created_at: string;
};

type StepRow = RowDataPacket & {
	id: number;
	iso_approval_flow_id: number;
	step_no: number;
	step_key: string | null;
	step_name: string | null;
	approver_role_id: number | null;
	approver_user_id: number | null;
	approver_user_ids_json: string | null;
	action_type: 'approve' | 'review';
	require_remark: number;
	is_active: number;
};

type IncomingStep = {
	step_no: number;
	step_key?: string;
	step_name?: string;
	approver_role_id?: number | null;
	approver_user_id?: number | null;
	approver_user_ids?: number[];
	action_type?: 'approve' | 'review';
	require_remark?: boolean;
	is_active?: boolean;
};

async function pickFallbackDocumentTypeId(connection: PoolConnection): Promise<number> {
	const [rows] = await connection.execute<RowDataPacket[]>(
		`SELECT id FROM iso_document_types WHERE is_active = 1 ORDER BY id ASC LIMIT 1`
	);
	return Number(rows[0]?.id || 0);
}

export const load: PageServerLoad = async ({ locals }) => {
	checkPermission(locals, 'manage isodocs flow');

	try {
		const [departments] = await pool.execute<Department[]>(
			`SELECT id, name FROM departments ORDER BY name ASC`
		);
		const [roles] = await pool.execute<Role[]>(`SELECT id, name FROM roles ORDER BY name ASC`);
		const [users] = await pool.execute<User[]>(
			`SELECT id, full_name, email FROM users ORDER BY full_name ASC`
		);

		const [flows] = await pool.execute<FlowRow[]>(
			`SELECT
				f.id,
				f.name,
				f.department_id,
				d.name AS department_name,
				f.iso_document_type_id,
				t.code AS document_type_code,
				t.name AS document_type_name,
				f.is_active,
				f.qmr_user_ids_json,
				f.created_at
			FROM iso_approval_flows f
			JOIN departments d ON d.id = f.department_id
			LEFT JOIN iso_document_types t ON t.id = f.iso_document_type_id
			ORDER BY f.created_at DESC`
		);

		const [steps] = await pool.execute<StepRow[]>(
			`SELECT
				s.id,
				s.iso_approval_flow_id,
				s.step_no,
				s.step_key,
				s.step_name,
				s.approver_role_id,
				s.approver_user_id,
				s.approver_user_ids_json,
				s.action_type,
				s.require_remark,
				s.is_active
			FROM iso_approval_flow_steps s
			ORDER BY s.iso_approval_flow_id ASC, s.step_no ASC`
		);

		return { departments, roles, users, flows, steps };
	} catch (err) {
		console.error('load approval flow error', err);
		throw error(500, 'Failed to load approval flow data.');
	}
};

export const actions: Actions = {
	saveFlow: async ({ request, locals }) => {
		checkPermission(locals, 'manage isodocs flow');
		const data = await request.formData();

		const flowId = Number(data.get('id')?.toString() || 0);
		const name = (data.get('name')?.toString() || '').trim();
		const departmentId = Number(data.get('department_id')?.toString() || 0);
		const isActive = data.get('is_active')?.toString() === '1' ? 1 : 0;
		const issuedUserIds = data
			.getAll('issued_user_ids')
			.map((v) => Number(v.toString()))
			.filter((v) => Number.isInteger(v) && v > 0);
		const reviewedUserIds = data
			.getAll('reviewed_user_ids')
			.map((v) => Number(v.toString()))
			.filter((v) => Number.isInteger(v) && v > 0);
		const approvedUserIds = data
			.getAll('approved_user_ids')
			.map((v) => Number(v.toString()))
			.filter((v) => Number.isInteger(v) && v > 0);
		const qmrUserIds = data
			.getAll('qmr_user_ids')
			.map((v) => Number(v.toString()))
			.filter((v) => Number.isInteger(v) && v > 0);

		if (!name || !departmentId) {
			return fail(400, {
				success: false,
				action: 'saveFlow',
				message: 'Name and department are required.'
			});
		}

		const incomingSteps: IncomingStep[] = [
			{
				step_no: 1,
				step_key: 'issued_by',
				step_name: 'Issued By',
				approver_user_ids: Array.from(new Set(issuedUserIds)),
				action_type: 'review',
				require_remark: true,
				is_active: true
			},
			{
				step_no: 2,
				step_key: 'reviewed_by',
				step_name: 'Reviewed By',
				approver_user_ids: Array.from(new Set(reviewedUserIds)),
				action_type: 'review',
				require_remark: true,
				is_active: true
			},
			{
				step_no: 3,
				step_key: 'approved_by',
				step_name: 'Approved By',
				approver_user_ids: Array.from(new Set(approvedUserIds)),
				action_type: 'approve',
				require_remark: true,
				is_active: true
			}
		];

		if (!incomingSteps.every((s) => (s.approver_user_ids || []).length > 0)) {
			return fail(400, {
				success: false,
				action: 'saveFlow',
				message: 'Each stage must assign at least one user.'
			});
		}

		for (const s of incomingSteps) {
			if (!s.step_no || s.step_no < 1) {
				return fail(400, {
					success: false,
					action: 'saveFlow',
					message: 'Each step must have step_no >= 1.'
				});
			}
		}

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();
			const fallbackTypeId = await pickFallbackDocumentTypeId(connection);

			let targetFlowId = flowId;
			if (flowId > 0) {
				const [existingRows] = await connection.execute<RowDataPacket[]>(
					`SELECT iso_document_type_id FROM iso_approval_flows WHERE id = ? LIMIT 1`,
					[flowId]
				);
				const keepTypeId = Number(existingRows[0]?.iso_document_type_id || fallbackTypeId || 0);

				await connection.execute(
					`UPDATE iso_approval_flows
					 SET name = ?, department_id = ?, iso_document_type_id = ?, is_active = ?, qmr_user_ids_json = ?
					 WHERE id = ?`,
					[
						name,
						departmentId,
						keepTypeId || null,
						isActive,
						JSON.stringify(Array.from(new Set(qmrUserIds))),
						flowId
					]
				);

				await connection.execute(`DELETE FROM iso_approval_flow_steps WHERE iso_approval_flow_id = ?`, [
					flowId
				]);
			} else {
				if (!fallbackTypeId) {
					await connection.rollback();
					return fail(400, {
						success: false,
						action: 'saveFlow',
						message: 'No active document type found in master data.'
					});
				}
				const [insertResult] = await connection.execute<ResultSetHeader>(
					`INSERT INTO iso_approval_flows
					 (name, department_id, iso_document_type_id, is_active, qmr_user_ids_json, created_by)
					 VALUES (?, ?, ?, ?, ?, ?)`,
					[
						name,
						departmentId,
						fallbackTypeId,
						isActive,
						JSON.stringify(Array.from(new Set(qmrUserIds))),
						locals.user?.id || null
					]
				);
				targetFlowId = Number(insertResult.insertId);
			}

			for (const s of incomingSteps.sort((a, b) => a.step_no - b.step_no)) {
				await connection.execute(
					`INSERT INTO iso_approval_flow_steps
					 (iso_approval_flow_id, step_no, step_key, step_name, approver_role_id, approver_user_id, approver_user_ids_json, action_type, require_remark, is_active)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					[
						targetFlowId,
						s.step_no,
						s.step_key || null,
						s.step_name || null,
						s.approver_role_id || null,
						(s.approver_user_ids && s.approver_user_ids.length > 0
							? s.approver_user_ids[0]
							: s.approver_user_id) || null,
						JSON.stringify(s.approver_user_ids || []),
						s.action_type || 'approve',
						s.require_remark === false ? 0 : 1,
						s.is_active === false ? 0 : 1
					]
				);
			}

			await connection.commit();
			return {
				success: true,
				action: 'saveFlow',
				message: flowId > 0 ? 'Approval flow updated.' : 'Approval flow created.'
			};
		} catch (err: any) {
			await connection.rollback();
			if (err.code === 'ER_DUP_ENTRY') {
				return fail(409, {
					success: false,
					action: 'saveFlow',
					message: 'Duplicate flow for the same department or duplicate step number.'
				});
			}
			console.error('saveFlow error', err);
			return fail(500, {
				success: false,
				action: 'saveFlow',
				message: err?.sqlMessage || err?.message || 'Failed to save approval flow.'
			});
		} finally {
			connection.release();
		}
	},

	deleteFlow: async ({ request, locals }) => {
		checkPermission(locals, 'manage isodocs flow');
		const data = await request.formData();
		const id = Number(data.get('id')?.toString() || 0);

		if (!id) {
			return fail(400, { success: false, action: 'deleteFlow', message: 'Invalid flow id.' });
		}

		const [result] = await pool.execute<ResultSetHeader>(`DELETE FROM iso_approval_flows WHERE id = ?`, [id]);
		if (result.affectedRows === 0) {
			return fail(404, { success: false, action: 'deleteFlow', message: 'Flow not found.' });
		}

		return { success: true, action: 'deleteFlow', message: 'Approval flow deleted.' };
	}
};
