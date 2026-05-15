import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import { getPurchaseDepartmentScope } from '$lib/purchaseDocumentAccess';
import { insertPurchaseDocumentDeletionLog } from '$lib/server/purchaseDocumentDeletionLog';

export const load: PageServerLoad = async ({ url, locals }) => {
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const filterStatus = url.searchParams.get('status') || '';
	const filterType = url.searchParams.get('type') || '';
	
	// รับค่าจาก URL หรือตั้งค่าเริ่มต้น (จะถูกจัดการหลักๆ ที่หน้าบ้าน แต่รับไว้เผื่อมีการส่งมา)
	const fromDate = url.searchParams.get('fromDate') || '';
	const toDate = url.searchParams.get('toDate') || '';
	
	// ตั้งค่า Paging: Default = 10
	const pageSize = parseInt(url.searchParams.get('pageSize') || '10', 10);
	const offset = (page - 1) * pageSize;

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];
		const scopedDepartmentId = getPurchaseDepartmentScope(locals.user);

		if (scopedDepartmentId !== null) {
			whereClause += ` AND creator.department_id = ? `;
			params.push(scopedDepartmentId);
		}

		if (searchQuery) {
			whereClause += ` AND (
                pd.document_number LIKE ? OR
                v.name LIKE ? OR
				v.company_name LIKE ? OR
				j.job_number LIKE ?
            ) `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm);
		}

		if (filterStatus) {
			whereClause += ` AND pd.status = ? `;
			params.push(filterStatus);
		}

		if (filterType) {
			whereClause += ` AND pd.document_type = ? `;
			params.push(filterType);
		}

		// เพิ่มเงื่อนไขค้นหาตามวันที่
		if (fromDate) {
			whereClause += ` AND pd.document_date >= ? `;
			params.push(fromDate);
		}

		if (toDate) {
			whereClause += ` AND pd.document_date <= ? `;
			params.push(toDate);
		}

		const countSql = `
            SELECT COUNT(pd.id) as total
            FROM purchase_documents pd
            LEFT JOIN vendors v ON pd.vendor_id = v.id
			LEFT JOIN job_orders j ON pd.job_id = j.id
			LEFT JOIN users creator ON pd.created_by_user_id = creator.id
            ${whereClause}`;
		const [countResult] = await pool.execute<any[]>(countSql, params);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		const fetchSql = `
            SELECT
                pd.id, pd.document_type, pd.document_number, pd.currency, pd.document_date, pd.due_date, pd.total_amount, pd.status,
                COALESCE(v.company_name, v.name) as vendor_name,
				j.job_number,
                u.full_name as created_by_name,
				CASE
					WHEN pd.document_type <> 'PR' THEN 1
					WHEN pd.status = 'Complete' THEN 0
					WHEN EXISTS (
						SELECT 1 FROM purchase_documents po
						WHERE po.document_type = 'PO'
						  AND pd.document_number IS NOT NULL AND TRIM(pd.document_number) <> ''
						  AND (
							  po.source_pr_id = pd.id
							  OR po.reference_doc LIKE CONCAT('%', pd.document_number, '%')
						  )
						LIMIT 1
					) THEN 0
					ELSE 1
				END AS can_edit
            FROM purchase_documents pd
            LEFT JOIN vendors v ON pd.vendor_id = v.id
            LEFT JOIN users u ON pd.created_by_user_id = u.id
			LEFT JOIN job_orders j ON pd.job_id = j.id
			LEFT JOIN users creator ON pd.created_by_user_id = creator.id
            ${whereClause}
            ORDER BY pd.document_date DESC, pd.id DESC
            LIMIT ? OFFSET ?
        `;
		const fetchParams = [...params, pageSize, offset];
		const [rows] = await pool.query(fetchSql, fetchParams);

		return {
			documents: JSON.parse(JSON.stringify(rows)),
			currentPage: page,
			totalPages,
			searchQuery,
			filterStatus,
			filterType,
			fromDate,
			toDate,
			pageSize,
			totalItems: total
		};
	} catch (err: any) {
		console.error('Failed to load purchase documents:', err);
		throw error(500, `Failed to load documents: ${err.message}`);
	}
};

export const actions: Actions = {
	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id) return fail(400, { message: 'ไม่พบรหัสเอกสาร' });
		if (!locals.user?.id) return fail(401, { message: 'กรุณาเข้าสู่ระบบ' });

		try {
			const scopedDepartmentId = getPurchaseDepartmentScope(locals.user);
			const [docRows] = await pool.query<any[]>(
				`SELECT pd.id, pd.document_type, pd.document_number, creator.department_id AS creator_department_id
				 FROM purchase_documents pd
				 LEFT JOIN users creator ON creator.id = pd.created_by_user_id
				 WHERE pd.id = ?
				 LIMIT 1`,
				[id]
			);
			if (docRows.length === 0) return fail(404, { message: 'ไม่พบเอกสาร' });

			if (scopedDepartmentId !== null) {
				const creatorDept = docRows[0].creator_department_id;
				if (creatorDept == null || Number(creatorDept) !== scopedDepartmentId) {
					return fail(403, { message: 'ไม่มีสิทธิ์ลบเอกสารข้ามแผนก' });
				}
			}

			await insertPurchaseDocumentDeletionLog({
				documentId: Number(id),
				documentType: String(docRows[0].document_type || ''),
				documentNumber:
					docRows[0].document_number != null ? String(docRows[0].document_number) : null,
				creatorDepartmentId:
					docRows[0].creator_department_id != null
						? Number(docRows[0].creator_department_id)
						: null,
				deletedByUserId: locals.user.id
			});

			await pool.execute('DELETE FROM purchase_document_items WHERE document_id = ?', [id]);
			await pool.execute('DELETE FROM purchase_document_attachments WHERE document_id = ?', [id]);
			await pool.execute('DELETE FROM purchase_documents WHERE id = ?', [id]);
			return { success: true };
		} catch (err: any) {
			console.error('Delete Purchase Document Error:', err);
			return fail(500, { message: err.message });
		}
	}
};