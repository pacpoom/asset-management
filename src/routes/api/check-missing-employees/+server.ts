import { json } from '@sveltejs/kit';
import pool from '$lib/server/database';

export async function GET() {
	const ZKLib = (await import('node-zklib')).default;
	const ips = ['192.168.115.69', '192.168.115.70', '192.168.115.71'];

	let missingReport: any[] = [];

	try {
		const [rows]: any = await pool.execute('SELECT emp_id FROM employees');
		const masterIds = new Set(rows.map((e: any) => e.emp_id.replace(/\D/g, '')));

		for (const ip of ips) {
			const zkInstance = new ZKLib(ip, 4370, 10000, 4000);
			try {
				await zkInstance.createSocket();
				const users = await zkInstance.getUsers();
				const deviceUsers = users.data || [];

				const missing = deviceUsers
					.map((u: any) => u.userId.toString().trim())
					.filter((id: string) => id !== '' && !masterIds.has(id));

				missingReport.push({
					ip,
					totalUsersInDevice: deviceUsers.length,
					missingCount: missing.length,
					missingEmployeeIds: missing
				});

				await zkInstance.disconnect();
			} catch (err: any) {
				missingReport.push({ ip, error: `เชื่อมต่อไม่ได้: ${err.message}` });
			}
		}

		return json({
			success: true,
			message: 'ตรวจสอบรหัสพนักงานที่ตกหล่นเสร็จสิ้น',
			report: missingReport
		});
	} catch (error: any) {
		return json({
			success: false,
			error: error.message,
			partialReport: missingReport
		});
	}
}
