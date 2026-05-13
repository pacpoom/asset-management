import type { RequestHandler } from './$types';
import ExcelJS from 'exceljs';

export const GET: RequestHandler = async () => {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'Asset Management';
	workbook.created = new Date();

	const sheet = workbook.addWorksheet('Sale Order Import');

	// กำหนด columns ตาม template spec
	const columns = [
		{ header: 'Delivery_no', key: 'delivery_no', width: 20 },
		{ header: 'Item_number_delivery', key: 'item_number_delivery', width: 22 },
		{ header: 'Material_Number', key: 'material_number', width: 22 },
		{ header: 'Planed_quantity', key: 'planed_quantity', width: 16 },
		{ header: 'Delivery_Type', key: 'delivery_type', width: 16 }
	];

	sheet.columns = columns;

	// Header row styling
	const headerRow = sheet.getRow(1);
	headerRow.height = 24;
	headerRow.eachCell((cell) => {
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
		cell.alignment = { horizontal: 'center', vertical: 'middle' };
		cell.border = {
			top: { style: 'thin', color: { argb: 'FF93C5FD' } },
			bottom: { style: 'thin', color: { argb: 'FF93C5FD' } },
			left: { style: 'thin', color: { argb: 'FF93C5FD' } },
			right: { style: 'thin', color: { argb: 'FF93C5FD' } }
		};
	});

	// Sample data rows (แถวตัวอย่างสีเทาอ่อน)
	const sampleRows = [
		['4510526361', '00010', 'MAT-001', 10, 'ZC01'],
		['4510526361', '00020', 'MAT-002', 5, 'ZC01']
	];

	sampleRows.forEach((values, idx) => {
		const row = sheet.addRow(values);
		row.height = 20;
		row.eachCell((cell, colNum) => {
			cell.font = { color: { argb: 'FF6B7280' }, italic: true };
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
			cell.border = {
				top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
				bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
				left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
				right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
			};
			if (colNum === 4) {
				cell.numFmt = '#,##0.000';
				cell.alignment = { horizontal: 'right' };
			}
		});
	});

	// Note sheet
	const noteSheet = workbook.addWorksheet('คำอธิบาย');
	const notes = [
		['Field', 'คำอธิบาย', 'ตัวอย่าง', 'Required'],
		['Delivery_no', 'เลขที่ใบส่งของ', '4510526361', 'Yes'],
		['Item_number_delivery', 'เลขที่รายการในใบส่งของ', '00010', 'Yes'],
		['Material_Number', 'รหัสวัสดุ', 'MAT-001', 'Yes'],
		['Planed_quantity', 'จำนวนที่วางแผน (ตัวเลข)', '10.000', 'Yes'],
		['Delivery_Type', 'ประเภทการส่ง เช่น ZC01', 'ZC01', 'Yes']
	];

	noteSheet.columns = [
		{ key: 'field', width: 24 },
		{ key: 'desc', width: 36 },
		{ key: 'example', width: 24 },
		{ key: 'required', width: 12 }
	];

	notes.forEach((row, idx) => {
		const r = noteSheet.addRow(row);
		r.height = 20;
		if (idx === 0) {
			r.eachCell((cell) => {
				cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
				cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
				cell.alignment = { horizontal: 'center', vertical: 'middle' };
			});
		} else {
			r.eachCell((cell, colNum) => {
				cell.fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: idx % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF' }
				};
				if (colNum === 4) {
					cell.font = { bold: true, color: { argb: row[3] === 'Yes' ? 'FFDC2626' : 'FF16A34A' } };
				}
			});
		}
	});

	const buffer = await workbook.xlsx.writeBuffer();

	return new Response(buffer as Buffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="sale_order_template.xlsx"'
		}
	});
};
