import db from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';

export const load = async () => {
	let connection;
	try {
		connection = await db.getConnection();

		const [totalRows] = await connection.execute<RowDataPacket[]>(
			'SELECT COUNT(id) as total FROM pdi_records'
		);
		const total = totalRows[0].total || 0;

		const [failedRows] = await connection.execute<RowDataPacket[]>(`
            SELECT COUNT(DISTINCT pdi_record_id) as failed 
            FROM pdi_results 
            WHERE status = 'NG'
        `);
		const failed = failedRows[0].failed || 0;
		const passed = total - failed;

		const [pendingRows] = await connection.execute<RowDataPacket[]>(`
            SELECT COUNT(DISTINCT pdi_record_id) as pending 
            FROM pdi_results 
            WHERE status = 'NG' AND (repair_status = 'Pending' OR repair_status IS NULL)
        `);
		const pending = pendingRows[0].pending || 0;

		const [rawTopDefects] = await connection.execute<RowDataPacket[]>(`
            SELECT defect as name, COUNT(DISTINCT pdi_record_id) as count 
            FROM pdi_results 
            WHERE status = 'NG' AND defect IS NOT NULL AND defect != ''
            GROUP BY defect 
        `);

		const defectCounts: Record<string, number> = {};

		rawTopDefects.forEach((row) => {
			let cleanName = row.name;

			if (typeof cleanName === 'string' && cleanName.startsWith('{') && cleanName.endsWith('}')) {
				try {
					const parsed = JSON.parse(cleanName);
					cleanName = parsed.label || parsed.value || cleanName;
				} catch (e) {}
			}

			if (!defectCounts[cleanName]) {
				defectCounts[cleanName] = 0;
			}
			defectCounts[cleanName] += Number(row.count);
		});

		const topDefects = Object.keys(defectCounts)
			.map((name) => ({ name, count: defectCounts[name] }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 5);

		const [recentFailed] = await connection.execute<RowDataPacket[]>(`
            SELECT DISTINCT r.id, r.model, r.vin_no as vin, DATE_FORMAT(r.created_at, '%Y-%m-%d') as date, r.created_at
            FROM pdi_records r
            JOIN pdi_results res ON r.id = res.pdi_record_id
            WHERE res.status = 'NG'
            ORDER BY r.created_at DESC
            LIMIT 5
        `);

		return {
			stats: {
				total: total,
				passed: passed,
				failed: failed,
				pending_rework: pending
			},
			topDefects: topDefects,
			recentFailed: recentFailed
		};
	} catch (error) {
		console.error('Dashboard Error:', error);
		return {
			stats: { total: 0, passed: 0, failed: 0, pending_rework: 0 },
			topDefects: [],
			recentFailed: []
		};
	} finally {
		if (connection) connection.release();
	}
};
