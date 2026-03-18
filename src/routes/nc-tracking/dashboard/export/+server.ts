import { error } from '@sveltejs/kit';
import db from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';

export const GET = async () => {
	let connection;
	try {
		connection = await db.getConnection();

		const [rows] = await connection.execute<RowDataPacket[]>(`
            SELECT 
                r.id AS record_id,
                r.vin_no,
                r.model,
                r.color,
                r.soc,
                r.mile,
                DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS inspection_date,
                res.work_name,
                res.status,
                res.defect,
                res.solution,
                res.repair_status,
                res.repair_note
            FROM pdi_records r
            LEFT JOIN pdi_results res ON r.id = res.pdi_record_id
            ORDER BY r.created_at DESC, r.id DESC
        `);

		const header = [
			'Record ID',
			'VIN (เลขตัวถัง)',
			'Model (รุ่น)',
			'Color (สี)',
			'SOC (%)',
			'Mileage (เลขไมล์)',
			'Inspection Date (วันที่ตรวจ)',
			'Inspection Point (จุดที่ตรวจ)',
			'Status (ผลการตรวจ)',
			'Defect (ปัญหาที่พบ)',
			'Solution (วิธีแก้ที่แนะนำ)',
			'Repair Status (สถานะการซ่อม)',
			'Repair Note (บันทึกจากช่าง)'
		];

		const escapeCSV = (val: any) => {
			if (val === null || val === undefined) return '""';
			let str = String(val);
			if (str.startsWith('{') && str.endsWith('}')) {
				try {
					const parsed = JSON.parse(str);
					str = parsed.label || parsed.value || str;
				} catch (e) {}
			}
			return `"${str.replace(/"/g, '""')}"`;
		};

		const csvRows = [header.map(escapeCSV).join(',')];

		for (const row of rows) {
			const csvRow = [
				row.record_id,
				row.vin_no,
				row.model,
				row.color,
				row.soc,
				row.mile,
				row.inspection_date,
				row.work_name,
				row.status,
				row.defect,
				row.solution,
				row.repair_status,
				row.repair_note
			].map(escapeCSV);

			csvRows.push(csvRow.join(','));
		}

		const csvContent = '\uFEFF' + csvRows.join('\n');

		return new Response(csvContent, {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="PDI_Report_${new Date().toISOString().split('T')[0]}.csv"`
			}
		});
	} catch (err) {
		console.error('Export Error:', err);
		throw error(500, 'Failed to export data');
	} finally {
		if (connection) connection.release();
	}
};
