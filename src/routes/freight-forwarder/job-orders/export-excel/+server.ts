import pool from '$lib/server/database';
import ExcelJS from 'exceljs';
import type { RequestEvent } from '@sveltejs/kit';

export const GET = async ({ url, locals }: RequestEvent) => {
	const search = url.searchParams.get('search') || '';

	// รับค่าภาษาจาก URL (ถ้าไม่มีให้ใช้ 'en')
	const locale = url.searchParams.get('locale') || 'en';
	const dateFormatStr = locale === 'th' ? 'th-TH' : 'en-US';
	const isEn = locale !== 'th';

	// ฟังก์ชันช่วยแปลภาษา
	const t = (key: string) => {
		const dict: Record<string, Record<string, string>> = {
			th: {
				// Sheet names
				'Job Orders': 'รายการใบงาน',
				'Container Alerts': 'แจ้งเตือนตู้',
				// Job columns
				'Job No.': 'เลขที่ใบงาน',
				'Job Date': 'วันที่',
				'Type': 'ประเภท',
				'Service': 'บริการ',
				'Customer': 'ลูกค้า',
				'Vendor': 'ผู้จำหน่าย',
				'B/L Number': 'เลขที่ B/L',
				'Liner / Carrier': 'สายเรือ',
				'Status': 'สถานะ',
				'Amount': 'ยอดเงิน',
				'Currency': 'สกุลเงิน',
				'Created By': 'ผู้สร้าง',
				// Alert columns
				'ETA': 'ETA',
				'Free Days (Dem/Sto/Det)': 'วันฟรี (ภาระท่า/ฝากตู้/เช่าตู้)',
				'Pending Containers': 'ตู้รอ Checkout',
				'Days Since ETA': 'วันที่ผ่าน ETA',
				'Demurrage Overdue': 'เกินฟรี ภาระท่า (วัน)',
				'Storage Overdue': 'เกินฟรี ฝากตู้ (วัน)',
				'Detention Overdue': 'เกินฟรี เช่าตู้ (วัน)',
				'Alert Status': 'สถานะแจ้งเตือน',
				// Alert status values
				'Overdue': 'เกินกำหนด',
				'Due Today': 'ครบวันนี้',
				'Expiring Soon': 'ใกล้ครบกำหนด',
				// Info row
				'Exported by': 'ส่งออกโดย',
				'Export Date': 'วันที่ส่งออก',
				'Date Range': 'ช่วงวันที่',
				'Note: Admin sees all jobs. Regular users see only their own jobs.':
					'หมายเหตุ: Admin เห็นข้อมูลทั้งหมด, User ทั่วไปเห็นเฉพาะงานของตัวเอง'
			}
		};
		return dict[locale]?.[key] || key;
	};

	// คำนวณวันที่เริ่มต้น (ย้อนหลัง 1 เดือน) และสิ้นสุดของเดือนปัจจุบันเป็น Default
	const now = new Date();
	const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

	const formatYMD = (date: Date) => {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	};

	const defaultStart = formatYMD(firstDay);
	const defaultEnd = formatYMD(lastDay);

	const startDate = url.searchParams.get('startDate') || defaultStart;
	const endDate = url.searchParams.get('endDate') || defaultEnd;

	// ── Role-based filtering ────────────────────────────────────────────────
	const currentUser = (locals as { user?: { id: number; role: string; full_name?: string } }).user;
	const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'admin_freight';

	let whereClause = 'WHERE j.job_date >= ? AND j.job_date <= ?';
	const queryParams: unknown[] = [startDate, endDate];

	// กรองเฉพาะ job ของตัวเองถ้าไม่ใช่ admin
	if (!isAdmin && currentUser?.id) {
		whereClause += ' AND j.created_by = ?';
		queryParams.push(currentUser.id);
	}

	// ใช้เงื่อนไขการค้นหาแบบเดียวกับในหน้า Job Order List
	if (search) {
		whereClause += ` AND (
			j.job_number LIKE ?
			OR c.name LIKE ?
			OR c.company_name LIKE ?
			OR v.name LIKE ?
			OR v.company_name LIKE ?
			OR j.invoice_no LIKE ?
			OR j.ccl LIKE ?
		)`;
		const searchParam = `%${search}%`;
		queryParams.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
	}

	const sql = `
		SELECT j.*,
		       c.name as customer_name, c.company_name, c.phone as customer_phone,
		       v.name as vendor_name, v.company_name as vendor_company_name, v.phone as vendor_phone,
		       u.full_name as created_by_name
		FROM job_orders j
		LEFT JOIN customers c ON j.customer_id = c.id
		LEFT JOIN vendors v ON j.vendor_id = v.id
		LEFT JOIN users u ON j.created_by = u.id
		${whereClause}
		ORDER BY j.job_date DESC, j.id DESC
	`;

	const [rows] = await pool.query(sql, queryParams);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const jobs = rows as any[];

	// ── Alert query (same logic as +page.server.ts) ─────────────────────────
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let alertRows: any[] = [];
	try {
		const alertParams: unknown[] = [];
		let alertWhere = `WHERE j.eta IS NOT NULL
			AND (
			  (j.demurrage_days IS NULL AND j.storage_days IS NULL AND j.detention_days IS NULL
			   AND DATEDIFF(CURDATE(), j.eta) >= -3)
			  OR (j.demurrage_days IS NOT NULL AND DATEDIFF(CURDATE(), DATE_ADD(j.eta, INTERVAL j.demurrage_days DAY)) >= -3)
			  OR (j.storage_days IS NOT NULL AND DATEDIFF(CURDATE(), DATE_ADD(j.eta, INTERVAL j.storage_days DAY)) >= -3)
			  OR (j.detention_days IS NOT NULL AND DATEDIFF(CURDATE(), DATE_ADD(j.eta, INTERVAL j.detention_days DAY)) >= -3)
			)
			AND j.job_status NOT IN ('Cancelled', 'Completed')`;

		if (!isAdmin && currentUser?.id) {
			alertWhere += ' AND j.created_by = ?';
			alertParams.push(currentUser.id);
		}

		const alertSql = `
			SELECT j.id, j.job_number, j.eta, j.job_status,
			       j.demurrage_days, j.storage_days, j.detention_days,
			       COALESCE(c.company_name, c.name) as customer_name,
			       u.full_name as created_by_name,
			       COUNT(jc.id) as pending_count,
			       DATEDIFF(CURDATE(), j.eta) as days_since_eta,
			       IF(j.demurrage_days IS NOT NULL,
			          DATEDIFF(CURDATE(), DATE_ADD(j.eta, INTERVAL j.demurrage_days DAY)), NULL) as days_overdue_demurrage,
			       IF(j.storage_days IS NOT NULL,
			          DATEDIFF(CURDATE(), DATE_ADD(j.eta, INTERVAL j.storage_days  DAY)), NULL) as days_overdue_storage,
			       IF(j.detention_days IS NOT NULL,
			          DATEDIFF(CURDATE(), DATE_ADD(j.eta, INTERVAL j.detention_days DAY)), NULL) as days_overdue_detention
			FROM job_orders j
			JOIN job_containers jc ON jc.job_order_id = j.id AND jc.status = 'pending'
			LEFT JOIN customers c ON j.customer_id = c.id
			LEFT JOIN users u ON j.created_by = u.id
			${alertWhere}
			GROUP BY j.id, j.job_number, j.eta, j.job_status,
			         j.demurrage_days, j.storage_days, j.detention_days,
			         c.company_name, c.name, u.full_name
			ORDER BY days_since_eta DESC
		`;
		const [_alertRows] = await pool.query(alertSql, alertParams);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		alertRows = _alertRows as any[];
	} catch {
		// alert query failed — omit sheet gracefully
	}

	// ── Build Workbook ───────────────────────────────────────────────────────
	const workbook = new ExcelJS.Workbook();
	workbook.creator = currentUser?.full_name || 'System';
	workbook.created = new Date();

	// ════════════════════════════════════════════════════════════════════════
	// Sheet 1 — Job Orders
	// ════════════════════════════════════════════════════════════════════════
	const wsJobs = workbook.addWorksheet(t('Job Orders').substring(0, 31));

	// ── Info rows (rows 1-3) ─────────────────────────────────────────────
	wsJobs.getRow(1).getCell(1).value = t('Export Date');
	wsJobs.getRow(1).getCell(2).value = new Date().toLocaleDateString(dateFormatStr, {
		year: 'numeric', month: 'long', day: 'numeric'
	});
	wsJobs.getRow(2).getCell(1).value = t('Date Range');
	wsJobs.getRow(2).getCell(2).value = `${startDate}  →  ${endDate}`;
	wsJobs.getRow(3).getCell(1).value = t('Exported by');
	wsJobs.getRow(3).getCell(2).value = currentUser?.full_name || '-';

	[1, 2, 3].forEach((r) => {
		wsJobs.getRow(r).getCell(1).font = { bold: true, color: { argb: 'FF555555' } };
	});

	// ── Header row (row 5) ────────────────────────────────────────────────
	const HEADER_ROW = 5;
	wsJobs.getRow(HEADER_ROW).values = [
		t('Job No.'),
		t('Job Date'),
		t('Type'),
		t('Service'),
		t('Customer'),
		t('Vendor'),
		t('B/L Number'),
		t('Liner / Carrier'),
		t('Status'),
		t('Amount'),
		t('Currency'),
		t('Created By')
	];

	wsJobs.getRow(HEADER_ROW).eachCell((cell) => {
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
		cell.alignment = { horizontal: 'center', vertical: 'middle' };
		cell.border = {
			bottom: { style: 'medium', color: { argb: 'FFAAAAAA' } }
		};
	});

	// Column widths
	const JOB_COLS = [20, 13, 10, 15, 38, 38, 22, 28, 14, 14, 10, 24];
	JOB_COLS.forEach((w, i) => {
		wsJobs.getColumn(i + 1).width = w;
	});

	// Status color helper
	const statusFill = (status: string): ExcelJS.Fill => {
		const colors: Record<string, string> = {
			Pending: 'FFBFDBFE',
			'In Progress': 'FFFEF08A',
			Completed: 'FFBBF7D0',
			Cancelled: 'FFFECACA'
		};
		return { type: 'pattern', pattern: 'solid', fgColor: { argb: colors[status] || 'FFFFFFFF' } };
	};

	// ── Data rows ────────────────────────────────────────────────────────
	jobs.forEach((job, idx) => {
		const rowNum = HEADER_ROW + 1 + idx;
		const row = wsJobs.getRow(rowNum);

		const jobDate = job.job_date
			? new Date(job.job_date as string).toLocaleDateString(dateFormatStr)
			: '';
		const customer = (job.company_name || job.customer_name || '-') as string;
		const vendor = (job.vendor_company_name || job.vendor_name || '-') as string;

		row.values = [
			job.job_number || `JOB-${job.id}`,
			jobDate,
			job.job_type || '-',
			job.service_type || '-',
			customer,
			vendor,
			job.bl_number || '-',
			job.liner_name || '-',
			job.job_status || '-',
			Number(job.amount || 0),
			job.currency || 'THB',
			job.created_by_name || '-'
		];

		// Zebra striping
		const bgColor = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';
		row.eachCell((cell) => {
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
		});

		// Status cell colour
		const statusCell = row.getCell(9);
		statusCell.fill = statusFill(job.job_status as string);
		statusCell.alignment = { horizontal: 'center' };

		// Amount formatting
		row.getCell(10).numFmt = '#,##0.00';
		row.getCell(10).alignment = { horizontal: 'right' };
		row.getCell(11).alignment = { horizontal: 'center' };
	});

	// Freeze panes below header
	wsJobs.views = [{ state: 'frozen', ySplit: HEADER_ROW }];

	// ════════════════════════════════════════════════════════════════════════
	// Sheet 2 — Container Alerts  (only if there is data)
	// ════════════════════════════════════════════════════════════════════════
	if (alertRows.length > 0) {
		const wsAlert = workbook.addWorksheet(t('Container Alerts').substring(0, 31));

		// ── Info rows ──────────────────────────────────────────────────────
		wsAlert.getRow(1).getCell(1).value = isEn
			? 'Containers with pending checkout near or past free-time expiry'
			: 'ตู้ที่ยังไม่ Checkout และใกล้/เกินวันหมด Free Time';
		wsAlert.getRow(1).getCell(1).font = { bold: true, size: 12, color: { argb: 'FFC0392B' } };
		wsAlert.mergeCells(1, 1, 1, 10);

		wsAlert.getRow(2).getCell(1).value = `${t('Export Date')}: ${new Date().toLocaleDateString(dateFormatStr, { year: 'numeric', month: 'long', day: 'numeric' })}`;
		wsAlert.getRow(2).getCell(1).font = { italic: true, color: { argb: 'FF555555' } };

		// ── Header row (row 4) ─────────────────────────────────────────────
		const ALERT_HEADER_ROW = 4;
		wsAlert.getRow(ALERT_HEADER_ROW).values = [
			t('Job No.'),
			t('Customer'),
			t('Status'),
			t('ETA'),
			t('Free Days (Dem/Sto/Det)'),
			t('Pending Containers'),
			t('Days Since ETA'),
			t('Demurrage Overdue'),
			t('Storage Overdue'),
			t('Detention Overdue'),
			t('Alert Status'),
			t('Created By')
		];

		wsAlert.getRow(ALERT_HEADER_ROW).eachCell((cell) => {
			cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7F1D1D' } };
			cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
			cell.border = { bottom: { style: 'medium', color: { argb: 'FFAAAAAA' } } };
		});
		wsAlert.getRow(ALERT_HEADER_ROW).height = 36;

		// Alert column widths
		const ALERT_COLS = [18, 36, 14, 14, 22, 18, 16, 18, 16, 16, 16, 24];
		ALERT_COLS.forEach((w, i) => {
			wsAlert.getColumn(i + 1).width = w;
		});

		// ── Data rows ──────────────────────────────────────────────────────
		alertRows.forEach((alert, idx) => {
			const rowNum = ALERT_HEADER_ROW + 1 + idx;
			const row = wsAlert.getRow(rowNum);

			const hasDays =
				alert.demurrage_days != null ||
				alert.storage_days != null ||
				alert.detention_days != null;

			const dOD = alert.days_overdue_demurrage != null ? Number(alert.days_overdue_demurrage) : null;
			const dOS = alert.days_overdue_storage != null ? Number(alert.days_overdue_storage) : null;
			const dODet = alert.days_overdue_detention != null ? Number(alert.days_overdue_detention) : null;
			const daysSince = Number(alert.days_since_eta);

			// Worst overdue across the three types (or days-since-ETA for unset jobs)
			const worstOverdue = hasDays
				? Math.max(dOD ?? -999, dOS ?? -999, dODet ?? -999)
				: daysSince;

			// Alert status label
			let alertStatus: string;
			if (worstOverdue > 0) alertStatus = t('Overdue');
			else if (worstOverdue === 0) alertStatus = t('Due Today');
			else alertStatus = t('Expiring Soon');

			// Free-days summary string  e.g. "7 / 7 / 30"
			const freeDays = [
				alert.demurrage_days != null ? String(alert.demurrage_days) : '-',
				alert.storage_days != null ? String(alert.storage_days) : '-',
				alert.detention_days != null ? String(alert.detention_days) : '-'
			].join(' / ');

			const etaStr = alert.eta
				? new Date(alert.eta as string).toLocaleDateString(dateFormatStr)
				: '-';

			row.values = [
				alert.job_number || `JOB-${alert.id}`,
				alert.customer_name || '-',
				alert.job_status || '-',
				etaStr,
				freeDays,
				Number(alert.pending_count),
				daysSince,
				dOD !== null ? dOD : '-',
				dOS !== null ? dOS : '-',
				dODet !== null ? dODet : '-',
				alertStatus,
				alert.created_by_name || '-'
			];

			// Row background by severity
			let rowBg: string;
			if (worstOverdue > 0) rowBg = 'FFFFF1F0'; // light red  — overdue
			else if (worstOverdue === 0) rowBg = 'FFFFF7ED'; // light orange — due today
			else rowBg = 'FFFFFBEB'; // light yellow — expiring soon

			row.eachCell((cell) => {
				cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
				cell.alignment = { vertical: 'middle' };
			});

			// Alert Status cell — bold + colour
			const statusCell = row.getCell(11);
			if (worstOverdue > 0) {
				statusCell.font = { bold: true, color: { argb: 'FFC0392B' } };
			} else if (worstOverdue === 0) {
				statusCell.font = { bold: true, color: { argb: 'FFD35400' } };
			} else {
				statusCell.font = { bold: true, color: { argb: 'FF856404' } };
			}
			statusCell.alignment = { horizontal: 'center', vertical: 'middle' };

			// Overdue day cells — red text if positive
			[8, 9, 10].forEach((colIdx, i) => {
				const val = [dOD, dOS, dODet][i];
				const cell = row.getCell(colIdx);
				if (val !== null && val > 0) {
					cell.font = { bold: true, color: { argb: 'FFC0392B' } };
				}
				cell.alignment = { horizontal: 'center', vertical: 'middle' };
			});

			// Center-align numeric/short columns
			[6, 7].forEach((c) => {
				row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
			});

			// Job number as link
			row.getCell(1).font = { color: { argb: 'FF1D4ED8' }, underline: true };
		});

		// Freeze panes
		wsAlert.views = [{ state: 'frozen', ySplit: ALERT_HEADER_ROW }];

		// Summary row at the bottom
		const summaryRowNum = ALERT_HEADER_ROW + alertRows.length + 2;
		const summaryRow = wsAlert.getRow(summaryRowNum);
		const overdueCount = alertRows.filter((a) => {
			const hasDays = a.demurrage_days != null || a.storage_days != null || a.detention_days != null;
			const worst = hasDays
				? Math.max(
					a.days_overdue_demurrage != null ? Number(a.days_overdue_demurrage) : -999,
					a.days_overdue_storage != null ? Number(a.days_overdue_storage) : -999,
					a.days_overdue_detention != null ? Number(a.days_overdue_detention) : -999
				  )
				: Number(a.days_since_eta);
			return worst > 0;
		}).length;

		summaryRow.getCell(1).value = isEn
			? `Total: ${alertRows.length} job(s) pending checkout — ${overdueCount} overdue`
			: `รวม: ${alertRows.length} งานรอ Checkout — เกินกำหนด ${overdueCount} งาน`;
		summaryRow.getCell(1).font = { bold: true, color: { argb: 'FF7F1D1D' } };
		wsAlert.mergeCells(summaryRowNum, 1, summaryRowNum, 10);
	}

	// ── Output ──────────────────────────────────────────────────────────────
	const buffer = await workbook.xlsx.writeBuffer();
	const exportDate = formatYMD(new Date());

	return new Response(buffer as BlobPart, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="Job_Orders_${exportDate}_${locale}.xlsx"`
		}
	});
};
