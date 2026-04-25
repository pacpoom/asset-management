import type { RequestHandler } from './$types';
import { cymspool } from '$lib/server/database';
import * as xlsx from 'xlsx';

export const GET: RequestHandler = async ({ url }) => {
	const search = url.searchParams.get('search') || '';
	const statusFilter = url.searchParams.get('status') || 'All';
	const pullingDate = url.searchParams.get('pullingDate') || '';

	try {
		let whereClause = `WHERE 1=1`;
		const params: any[] = [];

		if (search) {
			whereClause += ` AND (p.pulling_plan_no LIKE ? OR c.container_no LIKE ? OR op.model LIKE ? OR p.shop LIKE ?)`;
			const s = `%${search}%`;
			params.push(s, s, s, s);
		}
		if (statusFilter !== 'All') {
			whereClause += ` AND p.status = ?`;
			params.push(statusFilter);
		}
		if (pullingDate) {
			whereClause += ` AND DATE(p.pulling_date) = ?`;
			params.push(pullingDate);
		}

		const query = `
			SELECT 
				p.pulling_plan_no, p.plan_type, p.pulling_date, p.pulling_order, 
				p.destination, p.status, p.shop, op.model, op.type AS op_type, c.container_no
			FROM container_pulling_plans p
			LEFT JOIN container_order_plans op ON p.container_order_plan_id = op.id
			LEFT JOIN containers c ON op.container_id = c.id
			${whereClause}
			ORDER BY p.pulling_date DESC, p.pulling_plan_no DESC
		`;

		const [rows]: any = await cymspool.execute(query, params);

		const worksheetData = [
			[
				'Pulling Plan No.',
				'Container No.',
				'Model',
				'Type',
				'Plan Type',
				'Shop',
				'Pulling Date',
				'Pulling Order',
				'Status'
			]
		];

		rows.forEach((row: any) => {
			let statusText = 'Unknown';
			if (row.status === 1) statusText = 'Planned';
			else if (row.status === 2) statusText = 'In Progress';
			else if (row.status === 3) statusText = 'Completed';

			const formattedDate = row.pulling_date
				? new Date(row.pulling_date).toLocaleDateString('en-GB')
				: '-';

			worksheetData.push([
				row.pulling_plan_no || '-',
				row.container_no || '-',
				row.model || '-',
				row.op_type || '-',
				row.plan_type || '-',
				row.shop || '-',
				formattedDate,
				row.pulling_order || '-',
				statusText
			]);
		});

		const workbook = xlsx.utils.book_new();
		const worksheet = xlsx.utils.aoa_to_sheet(worksheetData);

		worksheet['!cols'] = [
			{ wch: 18 },
			{ wch: 15 },
			{ wch: 12 },
			{ wch: 10 },
			{ wch: 10 },
			{ wch: 10 },
			{ wch: 15 },
			{ wch: 12 },
			{ wch: 15 }
		];

		xlsx.utils.book_append_sheet(workbook, worksheet, 'Export Data');
		const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

		return new Response(buffer, {
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': 'attachment; filename="Export_Container_Pulling.xlsx"'
			}
		});
	} catch (error) {
		console.error('Export Error:', error);
		return new Response('Error generating export file', { status: 500 });
	}
};
