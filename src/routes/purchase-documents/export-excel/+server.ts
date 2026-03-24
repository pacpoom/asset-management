import { error } from '@sveltejs/kit';
import pool from '$lib/server/database';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const searchQuery = url.searchParams.get('search') || '';
	const filterStatus = url.searchParams.get('status') || '';
	const filterType = url.searchParams.get('type') || '';
	const fromDate = url.searchParams.get('fromDate') || '';
	const toDate = url.searchParams.get('toDate') || '';

	try {
		let whereClause = ' WHERE 1=1 ';
		const params: (string | number)[] = [];

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

		if (fromDate) {
			whereClause += ` AND pd.document_date >= ? `;
			params.push(fromDate);
		}

		if (toDate) {
			whereClause += ` AND pd.document_date <= ? `;
			params.push(toDate);
		}

		// ดึงข้อมูลทั้งหมดโดยไม่ Limit และ Offset สำหรับการ Export
		const fetchSql = `
            SELECT
                pd.document_type, pd.document_number, pd.document_date, pd.due_date, pd.total_amount, pd.status,
                COALESCE(v.company_name, v.name) as vendor_name,
				j.job_number,
                u.full_name as created_by_name
            FROM purchase_documents pd
            LEFT JOIN vendors v ON pd.vendor_id = v.id
            LEFT JOIN users u ON pd.created_by_user_id = u.id
			LEFT JOIN job_orders j ON pd.job_id = j.id
            ${whereClause}
            ORDER BY pd.document_date DESC, pd.id DESC
        `;
		
		const [rows] = await pool.query<any[]>(fetchSql, params);

		// สร้างข้อมูลแบบ CSV
		// ใช้ \uFEFF ด้านหน้าสุดเพื่อให้ Excel อ่านภาษาไทย (UTF-8) ได้ถูกต้อง
		let csvContent = '\uFEFF';
		
		// Header Row
		csvContent += 'Type,Document No.,Job Order,Date,Vendor,Total Amount,Created By,Status\n';

		// Data Rows
		rows.forEach(row => {
			const type = row.document_type || '';
			const docNo = row.document_number || '(Draft)';
			const job = row.job_number || '';
			const date = row.document_date ? new Date(row.document_date).toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
			const vendor = `"${(row.vendor_name || '').replace(/"/g, '""')}"`; // กัน comma ในชื่อ vendor
			const amount = row.total_amount || 0;
			const createdBy = `"${(row.created_by_name || '').replace(/"/g, '""')}"`;
			const status = row.status || '';

			csvContent += `${type},${docNo},${job},${date},${vendor},${amount},${createdBy},${status}\n`;
		});

		// สร้างชื่อไฟล์เป็น purchase_documents_YYYYMMDD.csv
		const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
		const fileName = `purchase_documents_${dateStr}.csv`;

		return new Response(csvContent, {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="${fileName}"`
			}
		});

	} catch (err: any) {
		console.error('Export Error:', err);
		throw error(500, `Failed to export data: ${err.message}`);
	}
};