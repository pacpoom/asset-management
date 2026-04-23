import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url, locals }) => {
	const search = url.searchParams.get('search') || '';
	const statusFilter = url.searchParams.get('status') || 'All';

	const user: any = locals.user || {
		role: 'admin',
		section: 'IT',
		department: 'IT Dept',
		name: 'Admin User'
	};

	try {
		let query = `SELECT * FROM manpower_requests WHERE 1=1`;
		const params: any[] = [];
		if (user.role === 'supervisor') {
			query += ` AND section = ?`;
			params.push(user.section);
		} else if (user.role === 'dept_manager') {
			query += ` AND department = ?`;
			params.push(user.department);
		}

		if (search) {
			query += ` AND (request_no LIKE ? OR requester_name LIKE ? OR section LIKE ? OR position_name LIKE ?)`;
			params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
		}
		if (statusFilter !== 'All') {
			query += ` AND status = ?`;
			params.push(statusFilter);
		}
		query += ` ORDER BY created_at DESC`;
		const [requests]: any = await pool.execute(query, params);

		// 🌟 1. เปลี่ยนมาดึงข้อมูล Divisions และ Sections จากตาราง Master Data แทน
		const [divisions]: any = await pool.execute(
			`SELECT division_name FROM divisions WHERE status = 'Active' ORDER BY division_name ASC`
		);
		const [sections]: any = await pool.execute(
			`SELECT section_name FROM sections WHERE status = 'Active' ORDER BY section_name ASC`
		);

		// 🌟 2. ดึง Job Positions (รองรับสถานะที่เป็นทั้งเลข 1 และตัวหนังสือ 'Active')
		const [positions]: any = await pool.execute(
			`SELECT position_name FROM job_positions WHERE status = 1 OR status = 'Active' ORDER BY position_name ASC`
		);

		const [usersList]: any = await pool.execute(
			`SELECT full_name FROM users WHERE full_name IS NOT NULL ORDER BY full_name ASC`
		);

		// กลุ่มงานยังคงดึงจากพนักงานเหมือนเดิม (ถ้าอนาคตมี Master Data ค่อยมาเปลี่ยนได้ครับ)
		const [groups]: any = await pool.execute(
			`SELECT DISTINCT emp_group FROM employees WHERE emp_group IS NOT NULL AND emp_group != '-' ORDER BY emp_group ASC`
		);

		const [company]: any = await pool.execute(`SELECT logo_path FROM company LIMIT 1`);

		// 🌟 3. ส่งข้อมูลกลับไปหน้าบ้าน (และ Map ชื่อคอลัมน์ให้ตรงกับ Master Data)
		// (ลบ return ที่ซ้ำซ้อนออกให้แล้วครับ)
		return {
			requests: requests,
			divisions: divisions.map((d: any) => d.division_name), // เปลี่ยนเป็นดึงจาก division_name
			sections: sections.map((s: any) => s.section_name), // เปลี่ยนเป็นดึงจาก section_name
			positions: positions.map((p: any) => p.position_name),
			usersList: usersList.map((u: any) => u.full_name),
			groups: groups.map((g: any) => g.emp_group),
			searchQuery: search,
			statusFilter: statusFilter,
			user: user,
			companyLogo: company.length > 0 ? company[0].logo_path : null
		};
	} catch (error) {
		console.error('Error loading manpower requests:', error);
		return {
			requests: [],
			sections: [],
			positions: [],
			divisions: [],
			searchQuery: search,
			statusFilter: 'All',
			user: locals.user
		};
	}
};

export const actions: Actions = {
	createRequest: async ({ request, locals }) => {
		const user: any = locals.user || { role: 'admin', name: 'Admin User' };
		if (user.role !== 'supervisor' && user.role !== 'admin')
			return fail(403, { success: false, message: 'คุณไม่มีสิทธิ์สร้างคำขอ' });

		const data = await request.formData();
		const requester_name = data.get('requester_name')?.toString();
		const department = data.get('department')?.toString();
		const division = data.get('division')?.toString();
		const section = data.get('section')?.toString();
		const emp_group = data.get('emp_group')?.toString();
		const position_name = data.get('position_name')?.toString();
		const report_to = data.get('report_to')?.toString();
		const request_qty = parseInt(data.get('request_qty')?.toString() || '1');
		const target_date = data.get('target_date')?.toString();
		const position_type = data.get('position_type')?.toString();
		const position_period = data.get('position_period')?.toString() || null;
		const wage_type = data.get('wage_type')?.toString();
		const budget_status = data.get('budget_status')?.toString();
		const req_nature = data.get('req_nature')?.toString();
		const replacement_name = data.get('replacement_name')?.toString() || null;
		const replacement_resign_date = data.get('replacement_resign_date')?.toString() || null;
		const replacement_reason = data.get('replacement_reason')?.toString() || null;
		const additional_reason = data.get('additional_reason')?.toString() || null;
		const edu_level = data.get('edu_level')?.toString() || null;
		const req_age = data.get('req_age')?.toString() || null;
		const req_experience = data.get('req_experience')?.toString() || null;
		const req_major = data.get('req_major')?.toString() || null;
		const req_gender = data.get('req_gender')?.toString() || 'Not specified';
		const cert_driving = data.get('cert_driving')?.toString() || null;
		const cert_forklift = data.get('cert_forklift') ? 1 : 0;
		const cert_safety = data.get('cert_safety') ? 1 : 0;
		const cert_other = data.get('cert_other')?.toString() || null;
		const other_qualifications = data.get('other_qualifications')?.toString() || null;

		if (!requester_name || !section || !position_name || !target_date) {
			return fail(400, { success: false, message: 'Please fill in all required fields' });
		}

		try {
			const today = new Date();
			const year = today.getFullYear();
			const month = today.getMonth() + 1; // 1-12
			const yymm = `${year.toString().slice(-2)}${String(month).padStart(2, '0')}`;
			const request_date = today.toISOString().split('T')[0];

			const docType = 'MPR';
			let prefix = 'MPR-';
			let lastNumber = 1;
			let paddingLength = 3;

			const [seqRows]: any = await pool.execute(
				`SELECT prefix, last_number, padding_length 
				 FROM document_sequences 
				 WHERE document_type = ? AND year = ? AND month = ?`,
				[docType, year, month]
			);

			if (seqRows.length > 0) {
				prefix = seqRows[0].prefix || 'MPR-';
				paddingLength = seqRows[0].padding_length || 3;
				lastNumber = seqRows[0].last_number + 1;

				await pool.execute(
					`UPDATE document_sequences 
					 SET last_number = ? 
					 WHERE document_type = ? AND year = ? AND month = ?`,
					[lastNumber, docType, year, month]
				);
			} else {
				await pool.execute(
					`INSERT INTO document_sequences 
					 (document_type, prefix, year, month, last_number, padding_length) 
					 VALUES (?, ?, ?, ?, ?, ?)`,
					[docType, prefix, year, month, lastNumber, paddingLength]
				);
			}

			const paddedNum = String(lastNumber).padStart(paddingLength, '0');
			const request_no = `${prefix}${yymm}${paddedNum}`;

			await pool.execute(
				`INSERT INTO manpower_requests (
					request_no, request_date, requester_name, department, division, section, emp_group, position_name, report_to, request_qty, target_date, reason, status,
					position_type, position_period, wage_type, budget_status, req_nature, replacement_name, replacement_resign_date, replacement_reason, additional_reason,
					edu_level, req_age, req_experience, req_major, req_gender, cert_driving, cert_forklift, cert_safety, cert_other, other_qualifications
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Dept', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					request_no,
					request_date,
					requester_name,
					department,
					division,
					section,
					emp_group,
					position_name,
					report_to,
					request_qty,
					target_date,
					'See details',
					position_type,
					position_period,
					wage_type,
					budget_status,
					req_nature,
					replacement_name,
					replacement_resign_date,
					replacement_reason,
					additional_reason,
					edu_level,
					req_age,
					req_experience,
					req_major,
					req_gender,
					cert_driving,
					cert_forklift,
					cert_safety,
					cert_other,
					other_qualifications
				]
			);
			return { success: true, message: 'Manpower request submitted successfully!' };
		} catch (error) {
			console.error('Error creating request:', error);
			return fail(500, { success: false, message: 'Error submitting request' });
		}
	},

	editRequest: async ({ request, locals }) => {
		const user: any = locals.user || { role: 'admin', name: 'Admin User' };
		if (user.role !== 'supervisor' && user.role !== 'admin')
			return fail(403, { success: false, message: 'คุณไม่มีสิทธิ์แก้ไขข้อมูล' });

		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { success: false, message: 'ID is missing' });

		const requester_name = data.get('requester_name')?.toString();
		const department = data.get('department')?.toString();
		const division = data.get('division')?.toString();
		const section = data.get('section')?.toString();
		const emp_group = data.get('emp_group')?.toString();
		const position_name = data.get('position_name')?.toString();
		const report_to = data.get('report_to')?.toString();
		const request_qty = parseInt(data.get('request_qty')?.toString() || '1');
		const target_date = data.get('target_date')?.toString();
		const position_type = data.get('position_type')?.toString();
		const position_period = data.get('position_period')?.toString() || null;
		const wage_type = data.get('wage_type')?.toString();
		const budget_status = data.get('budget_status')?.toString();
		const req_nature = data.get('req_nature')?.toString();
		const replacement_name = data.get('replacement_name')?.toString() || null;
		const replacement_resign_date = data.get('replacement_resign_date')?.toString() || null;
		const replacement_reason = data.get('replacement_reason')?.toString() || null;
		const additional_reason = data.get('additional_reason')?.toString() || null;
		const edu_level = data.get('edu_level')?.toString() || null;
		const req_age = data.get('req_age')?.toString() || null;
		const req_experience = data.get('req_experience')?.toString() || null;
		const req_major = data.get('req_major')?.toString() || null;
		const req_gender = data.get('req_gender')?.toString() || 'Not specified';
		const cert_driving = data.get('cert_driving')?.toString() || null;
		const cert_forklift = data.get('cert_forklift') ? 1 : 0;
		const cert_safety = data.get('cert_safety') ? 1 : 0;
		const cert_other = data.get('cert_other')?.toString() || null;
		const other_qualifications = data.get('other_qualifications')?.toString() || null;

		try {
			const [check]: any = await pool.execute(`SELECT status FROM manpower_requests WHERE id = ?`, [
				id
			]);
			if (check[0].status !== 'Pending Dept')
				return fail(403, {
					success: false,
					message: 'เอกสารนี้ถูกดำเนินการไปแล้ว ไม่สามารถแก้ไขได้'
				});

			await pool.execute(
				`UPDATE manpower_requests SET 
					requester_name=?, department=?, division=?, section=?, emp_group=?, position_name=?, report_to=?, request_qty=?, target_date=?,
					position_type=?, position_period=?, wage_type=?, budget_status=?, req_nature=?, replacement_name=?, replacement_resign_date=?, replacement_reason=?, additional_reason=?,
					edu_level=?, req_age=?, req_experience=?, req_major=?, req_gender=?, cert_driving=?, cert_forklift=?, cert_safety=?, cert_other=?, other_qualifications=?
				WHERE id=? AND status='Pending Dept'`,
				[
					requester_name,
					department,
					division,
					section,
					emp_group,
					position_name,
					report_to,
					request_qty,
					target_date,
					position_type,
					position_period,
					wage_type,
					budget_status,
					req_nature,
					replacement_name,
					replacement_resign_date,
					replacement_reason,
					additional_reason,
					edu_level,
					req_age,
					req_experience,
					req_major,
					req_gender,
					cert_driving,
					cert_forklift,
					cert_safety,
					cert_other,
					other_qualifications,
					id
				]
			);
			return { success: true, message: 'Request updated successfully!' };
		} catch (error) {
			return fail(500, { success: false, message: 'Error updating request' });
		}
	},

	deleteRequest: async ({ request, locals }) => {
		const user: any = locals.user || { role: 'admin', name: 'Admin User' };
		if (user.role !== 'supervisor' && user.role !== 'admin')
			return fail(403, { success: false, message: 'คุณไม่มีสิทธิ์ลบข้อมูล' });

		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { success: false, message: 'ID is missing' });

		try {
			const [check]: any = await pool.execute(`SELECT status FROM manpower_requests WHERE id = ?`, [
				id
			]);
			if (check[0].status !== 'Pending Dept')
				return fail(403, {
					success: false,
					message: 'ไม่สามารถลบได้เนื่องจากเอกสารนี้ถูกดำเนินการไปแล้ว'
				});

			await pool.execute(`DELETE FROM manpower_requests WHERE id = ? AND status = 'Pending Dept'`, [
				id
			]);
			return { success: true, message: 'Request deleted successfully!' };
		} catch (error) {
			return fail(500, { success: false, message: 'Error deleting request' });
		}
	},

	updateStatus: async ({ request, locals }) => {
		const user: any = locals.user || { role: 'admin', name: 'Admin User' };
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const status = data.get('status')?.toString();
		const remark = data.get('remark')?.toString() || null;

		if (!id || !status) return fail(400, { success: false, message: 'Incomplete data' });

		if (user.role !== 'hr_manager' && user.role !== 'dept_manager' && user.role !== 'admin') {
			return fail(403, { success: false, message: 'คุณไม่มีสิทธิ์อนุมัติเอกสารนี้' });
		}

		try {
			const [check]: any = await pool.execute(`SELECT status FROM manpower_requests WHERE id = ?`, [
				id
			]);
			const currentStatus = check[0]?.status;

			if (
				currentStatus === 'Pending Dept' &&
				(user.role === 'dept_manager' || user.role === 'admin')
			) {
				const nextStatus = status === 'Approved' ? 'Pending HR' : 'Rejected';
				const approverName =
					user.name || (user.role === 'admin' ? 'Admin (as Dept)' : 'Department Manager');
				await pool.execute(
					`UPDATE manpower_requests SET status = ?, dept_manager_name = ?, dept_manager_date = NOW(), dept_manager_remark = ? WHERE id = ?`,
					[nextStatus, approverName, remark, id]
				);
			} else if (
				currentStatus === 'Pending HR' &&
				(user.role === 'hr_manager' || user.role === 'admin')
			) {
				const nextStatus = status === 'Approved' ? 'Approved' : 'Rejected';
				const approverName = user.name || (user.role === 'admin' ? 'Admin (as HR)' : 'HR Manager');
				await pool.execute(
					`UPDATE manpower_requests SET status = ?, hr_manager_name = ?, hr_manager_date = NOW(), hr_manager_remark = ? WHERE id = ?`,
					[nextStatus, approverName, remark, id]
				);
			} else {
				return fail(403, {
					success: false,
					message: 'สถานะเอกสารไม่ถูกต้อง หรือคุณไม่มีสิทธิ์ในขั้นตอนนี้'
				});
			}

			return { success: true, message: 'Status updated successfully!' };
		} catch (error) {
			return fail(500, { success: false, message: 'Error updating status' });
		}
	}
};
