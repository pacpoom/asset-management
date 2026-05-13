import type { RequestHandler } from './$types';
import { afpool } from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';

function toBangkokDateString(offsetDays = 0): string {
	const now = new Date();
	const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
	return bkk.toISOString().split('T')[0];
}

function toCompactDate(dateStr: string): string {
	return dateStr.replace(/-/g, '');
}

function formatDeliveryDate(raw: string | null | undefined): string {
	if (!raw || raw.length !== 8) return '-';
	return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

export const GET: RequestHandler = async ({ url }) => {
	const today = toBangkokDateString(0);
	const yesterday = toBangkokDateString(-1);

	const createDateStart = url.searchParams.get('create_date_start')?.trim() || yesterday;
	const createDateEnd = url.searchParams.get('create_date_end')?.trim() || today;
	const saleOrder = url.searchParams.get('sale_order')?.trim() || '';
	const deliveryNo = url.searchParams.get('delivery_no')?.trim() || '';
	const materialNumber = url.searchParams.get('material_number')?.trim() || '';
	const deliveryDateStart = url.searchParams.get('delivery_date_start')?.trim() || '';
	const deliveryDateEnd = url.searchParams.get('delivery_date_end')?.trim() || '';

	let whereClause = 'WHERE 1=1';
	const values: any[] = [];

	whereClause += ' AND DATE(so.Create_date) >= ? AND DATE(so.Create_date) <= ?';
	values.push(createDateStart, createDateEnd);

	if (saleOrder) {
		whereClause += ' AND so.Sale_order LIKE ?';
		values.push(`%${saleOrder}%`);
	}
	if (deliveryNo) {
		whereClause += ' AND so.Delivery_no LIKE ?';
		values.push(`%${deliveryNo}%`);
	}
	if (materialNumber) {
		whereClause += ' AND so.Material_number LIKE ?';
		values.push(`%${materialNumber}%`);
	}
	if (deliveryDateStart) {
		whereClause += ' AND so.Delivery_Date >= ?';
		values.push(toCompactDate(deliveryDateStart));
	}
	if (deliveryDateEnd) {
		whereClause += ' AND so.Delivery_Date <= ?';
		values.push(toCompactDate(deliveryDateEnd));
	}

	const sql = `
		SELECT
			so.Sale_order,
			so.Delivery_no,
			so.Customer_Code,
			cm.customer_name,
			so.Material_Number,
			so.Planed_quantity,
			so.Ship_Qty,
			(COALESCE(so.Planed_quantity, 0) - COALESCE(so.Ship_Qty, 0)) AS Balance,
			so.Delivery_Date,
			so.Create_date
		FROM sale_order so
		LEFT JOIN customer_masters cm ON so.Customer_code = cm.customer_code
		${whereClause}
		ORDER BY so.SEQ DESC
	`;

	const [rows] = await afpool.execute<RowDataPacket[]>(sql, values);

	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'Asset Management';
	workbook.created = new Date();

	const sheet = workbook.addWorksheet('Sale Order', {
		pageSetup: { paperSize: 9, orientation: 'landscape' }
	});

	// Title row
	sheet.mergeCells('A1:L1');
	const titleCell = sheet.getCell('A1');
	titleCell.value = `Sale Order Report  (${createDateStart} ถึง ${createDateEnd})`;
	titleCell.font = { bold: true, size: 13 };
	titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
	sheet.getRow(1).height = 28;

	// Header row — 12 columns now
	const headers = [
		{ header: 'No.', key: 'no', width: 6 },
		{ header: 'Sale Order', key: 'sale_order', width: 16 },
		{ header: 'Delivery No.', key: 'delivery_no', width: 16 },
		{ header: 'Customer Code', key: 'customer_code', width: 16 },
		{ header: 'Customer Name', key: 'customer_name', width: 28 },
		{ header: 'Material Number', key: 'material_number', width: 18 },
		{ header: 'Planned Qty', key: 'planed_qty', width: 14 },
		{ header: 'Ship Qty', key: 'ship_qty', width: 12 },
		{ header: 'Balance', key: 'balance', width: 12 },
		{ header: 'Delivery Date', key: 'delivery_date', width: 14 },
		{ header: 'Create Date', key: 'create_date', width: 14 },
		{ header: 'Status', key: 'status', width: 12 }
	];

	sheet.columns = headers;

	const headerRow = sheet.getRow(2);
	headerRow.values = headers.map((h) => h.header);
	headerRow.height = 22;
	headerRow.eachCell((cell) => {
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
		cell.alignment = { horizontal: 'center', vertical: 'middle' };
		cell.border = {
			top: { style: 'thin', color: { argb: 'FFB0C4DE' } },
			bottom: { style: 'thin', color: { argb: 'FFB0C4DE' } },
			left: { style: 'thin', color: { argb: 'FFB0C4DE' } },
			right: { style: 'thin', color: { argb: 'FFB0C4DE' } }
		};
	});

	// Data rows
	(rows as any[]).forEach((order, idx) => {
		const planedQty = Number(order.Planed_quantity) || 0;
		const shipQty = Number(order.Ship_Qty) || 0;
		const balance = planedQty - shipQty;
		const isComplete = balance === 0;
		const status = isComplete ? 'Complete' : 'Pending';

		const deliveryDate = formatDeliveryDate(order.Delivery_Date);
		const createDate = order.Create_date
			? new Date(order.Create_date).toLocaleDateString('th-TH')
			: '-';

		const row = sheet.addRow([
			idx + 1,
			order.Sale_order || '-',
			order.Delivery_no || '-',
			order.Customer_Code || '-',
			order.customer_name || '-',
			order.Material_Number || '-',
			planedQty,
			shipQty,
			balance,
			deliveryDate,
			createDate,
			status
		]);

		row.height = 20;
		const fillColor = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFF';

		row.eachCell((cell, colNumber) => {
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
			cell.border = {
				top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
				bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
				left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
				right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
			};
			if (colNumber >= 7 && colNumber <= 9) {
				cell.alignment = { horizontal: 'right', vertical: 'middle' };
				cell.numFmt = '#,##0';
			} else {
				cell.alignment = { vertical: 'middle' };
			}
		});

		// Status cell (col 12)
		const statusCell = row.getCell(12);
		if (isComplete) {
			statusCell.font = { color: { argb: 'FF16A34A' }, bold: true };
			statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFdcfce7' } };
		} else {
			statusCell.font = { color: { argb: 'FFD97706' }, bold: true };
			statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
		}

		// Balance cell (col 9)
		const balanceCell = row.getCell(9);
		balanceCell.font = { bold: balance !== 0, color: { argb: balance === 0 ? 'FF16A34A' : 'FFEA580C' } };
	});

	// Summary row
	const totalRows = rows.length;
	const summaryRowIndex = totalRows + 3;
	sheet.mergeCells(`B${summaryRowIndex}:F${summaryRowIndex}`);
	sheet.getCell(`B${summaryRowIndex}`).value = 'Total';

	const totalPlanedQty = (rows as any[]).reduce((s, r) => s + (Number(r.Planed_quantity) || 0), 0);
	const totalShipQty = (rows as any[]).reduce((s, r) => s + (Number(r.Ship_Qty) || 0), 0);
	const totalBalance = totalPlanedQty - totalShipQty;

	const summaryCells = [
		{ col: `B${summaryRowIndex}`, value: 'Total' },
		{ col: `G${summaryRowIndex}`, value: totalPlanedQty },
		{ col: `H${summaryRowIndex}`, value: totalShipQty },
		{ col: `I${summaryRowIndex}`, value: totalBalance }
	];
	summaryCells.forEach(({ col, value }) => {
		const cell = sheet.getCell(col);
		cell.value = value;
		cell.font = { bold: true };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
		cell.numFmt = '#,##0';
	});

	sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

	const buffer = await workbook.xlsx.writeBuffer();
	const filename = `sale_order_${createDateStart}_${createDateEnd}.xlsx`;

	return new Response(buffer as Buffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
