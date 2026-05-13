import type { RequestHandler } from './$types';
import { afpool } from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';
import { json } from '@sveltejs/kit';


// Parse Excel file → rows array
async function parseExcel(file: File): Promise<{
	rows: ParsedRow[];
	errors: string[];
}> {
	const buffer = await file.arrayBuffer();
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(buffer);

	const sheet = workbook.getWorksheet(1);
	if (!sheet) return { rows: [], errors: ['ไม่พบ Sheet ในไฟล์ Excel'] };

	// Map header name (lowercase) → column index
	const headerRow = sheet.getRow(1);
	const colMap: Record<string, number> = {};
	headerRow.eachCell((cell, colNum) => {
		const name = String(cell.value ?? '').trim().toLowerCase();
		if (name) colMap[name] = colNum;
	});

	// Validate required columns exist
	const requiredCols = [
		'delivery_no',
		'item_number_delivery',
		'material_number',
		'planed_quantity',
		'delivery_type'
	];
	const missingCols = requiredCols.filter((c) => !(c in colMap));
	if (missingCols.length > 0) {
		return { rows: [], errors: [`ไม่พบ Column ที่จำเป็น: ${missingCols.join(', ')}`] };
	}

	const rows: ParsedRow[] = [];
	const errors: string[] = [];

	sheet.eachRow((row, rowNum) => {
		if (rowNum === 1) return; // skip header

		const getCellVal = (col: string): string => {
			const idx = colMap[col];
			if (!idx) return '';
			const cell = row.getCell(idx);
			// ExcelJS อาจ return object สำหรับ rich text
			const val = cell.value;
			if (val === null || val === undefined) return '';
			if (typeof val === 'object' && 'richText' in (val as any)) {
				return (val as any).richText.map((r: any) => r.text).join('').trim();
			}
			return String(val).trim();
		};

		const deliveryNo = getCellVal('delivery_no');
		const itemNumber = getCellVal('item_number_delivery');
		const materialNumber = getCellVal('material_number');
		const planedQtyStr = getCellVal('planed_quantity');
		const deliveryType = getCellVal('delivery_type');

		// ข้ามแถวที่ว่างทั้งหมด
		if (!deliveryNo && !materialNumber && !planedQtyStr) return;

		const rowErrors: string[] = [];
		if (!deliveryNo) rowErrors.push('Delivery_no ห้ามว่าง');
		if (!itemNumber) rowErrors.push('Item_number_delivery ห้ามว่าง');
		if (!materialNumber) rowErrors.push('Material_Number ห้ามว่าง');

		const planedQty = parseFloat(planedQtyStr);
		if (isNaN(planedQty) || planedQty <= 0) {
			rowErrors.push('Planed_quantity ต้องเป็นตัวเลขและมากกว่า 0');
		}
		if (!deliveryType) rowErrors.push('Delivery_Type ห้ามว่าง');

		if (rowErrors.length > 0) {
			rowErrors.forEach((e) => errors.push(`Row ${rowNum}: ${e}`));
		}

		rows.push({
			rowNum,
			deliveryNo,
			itemNumber,
			materialNumber,
			planedQty: isNaN(planedQty) ? 0 : planedQty,
			deliveryType,
			hasError: rowErrors.length > 0
		});
	});

	return { rows, errors };
}

// Validate material_number ทุกตัวกับ material_masters
// คืนค่า map: material_number → sensitive_flg
// ถ้ามีที่ไม่เจอ → คืน errors
async function validateMaterials(
	materialNumbers: string[]
): Promise<{ materialMap: Record<string, number>; errors: string[] }> {
	const unique = [...new Set(materialNumbers.filter(Boolean))];
	if (unique.length === 0) return { materialMap: {}, errors: [] };

	const placeholders = unique.map(() => '?').join(', ');
	const [rows] = await afpool.execute<RowDataPacket[]>(
		`SELECT material_number, COALESCE(sensitive_flg, 0) AS sensitive_flg
		 FROM material_masters
		 WHERE material_number IN (${placeholders})`,
		unique
	);

	const materialMap: Record<string, number> = {};
	(rows as any[]).forEach((r) => {
		materialMap[r.material_number] = Number(r.sensitive_flg ?? 0);
	});

	const errors: string[] = [];
	unique.forEach((mat) => {
		if (!(mat in materialMap)) {
			errors.push(`Material_Number "${mat}" ไม่พบใน Material Master`);
		}
	});

	return { materialMap, errors };
}

type ParsedRow = {
	rowNum: number;
	deliveryNo: string;
	itemNumber: string;
	materialNumber: string;
	planedQty: number;
	deliveryType: string;
	hasError: boolean;
	sensitiveFlg?: number; // เติมหลัง validate
};

// =================== PUT — Preview (ไม่ insert) ===================
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const formData = await request.formData();
		const file = formData.get('file') as File | null;
		if (!file) return json({ success: false, message: 'กรุณาเลือกไฟล์' }, { status: 400 });

		// 1. Parse Excel
		const { rows, errors: parseErrors } = await parseExcel(file);
		if (parseErrors.length > 0 && rows.length === 0) {
			return json({ success: false, message: parseErrors[0], errors: parseErrors });
		}

		// 2. Validate materials
		const materialNumbers = rows.map((r) => r.materialNumber);
		const { materialMap, errors: matErrors } = await validateMaterials(materialNumbers);

		// เติม sensitiveFlg และ mark error
		const enrichedRows = rows.map((r) => ({
			...r,
			sensitiveFlg: materialMap[r.materialNumber] ?? null,
			hasError: r.hasError || !(r.materialNumber in materialMap)
		}));

		const allErrors = [...parseErrors, ...matErrors];

		return json({
			success: true,
			rows: enrichedRows,
			errors: allErrors,
			total: enrichedRows.length
		});
	} catch (error) {
		console.error('Preview Error:', error);
		return json({ success: false, message: 'ไม่สามารถอ่านไฟล์ได้' }, { status: 500 });
	}
};

// =================== POST — Import จริง ===================
export const POST: RequestHandler = async ({ request }) => {
	try {
		const formData = await request.formData();
		const file = formData.get('file') as File | null;
		const customerCode = (formData.get('customer_code') as string)?.trim();
		const customerName = (formData.get('customer_name') as string)?.trim() || '';
		const deliveryDate = (formData.get('delivery_date') as string)?.trim(); // YYYY-MM-DD

		// --- Basic validation ---
		if (!file) return json({ success: false, message: 'กรุณาเลือกไฟล์ Excel' }, { status: 400 });
		if (!customerCode)
			return json({ success: false, message: 'กรุณาเลือก Customer' }, { status: 400 });
		if (!deliveryDate)
			return json({ success: false, message: 'กรุณาเลือก Delivery Date' }, { status: 400 });

		// แปลง YYYY-MM-DD → YYYYMMDD
		const deliveryDateCompact = deliveryDate.replace(/-/g, '');

		// 1. Parse Excel
		const { rows, errors: parseErrors } = await parseExcel(file);

		if (parseErrors.length > 0) {
			return json(
				{ success: false, message: 'พบข้อผิดพลาดในไฟล์ Excel', errors: parseErrors },
				{ status: 400 }
			);
		}
		if (rows.length === 0) {
			return json(
				{ success: false, message: 'ไม่พบข้อมูลในไฟล์ Excel (มีแค่ header)' },
				{ status: 400 }
			);
		}

		// 2. Validate material_masters — ทุก material_number ต้องอยู่ใน master
		const materialNumbers = rows.map((r) => r.materialNumber);
		const { materialMap, errors: matErrors } = await validateMaterials(materialNumbers);

		if (matErrors.length > 0) {
			// มี material ที่ไม่อยู่ใน master → block ทั้งหมด ไม่ insert
			return json(
				{
					success: false,
					message: `พบ Material ที่ไม่อยู่ใน Material Master จำนวน ${matErrors.length} รายการ — ยกเลิกการนำเข้าทั้งหมด`,
					errors: matErrors
				},
				{ status: 400 }
			);
		}

		// 3. Bulk Insert ใน Transaction
		// SEQ = NULL (AUTO_INCREMENT)
		// create_date ใช้ DATE(DATE_ADD(NOW(), INTERVAL 7 HOUR)) — Bangkok time จาก MySQL โดยตรง
		const insertSql = `
			INSERT INTO sale_order (
				SEQ,
				Status,
				Serial_Number,
				Sale_order,
				Delivery_no,
				Item_number_delivery,
				Delivery_Order,
				Customer_Code,
				Customer_Name,
				Ship_Type,
				Delivery_Type,
				Priority_Delivery,
				Delivery_Date,
				Material_Number,
				Planed_quantity,
				Ship_Qty,
				Actual_Qty,
				Stock_Date,
				Unit,
				Customer_Material_Number,
				Purchase_order,
				Purchase_date,
				Plant,
				Storage_Location,
				File_Name,
				Allocate_Flg,
				IF_QTY,
				create_date
			) VALUES (
				NULL, 0, '0', '', ?, ?, ?, ?, ?, 'ZA', ?, '0', ?, ?, ?, 0, 0, NULL, 'EA', '', '', '', 'A201', '1001', 'Import', 1, 0,
				DATE(DATE_ADD(NOW(), INTERVAL 7 HOUR))
			)
		`;

		const connection = await afpool.getConnection();
		try {
			await connection.beginTransaction();

			for (const row of rows) {
				const sensitiveFlg = materialMap[row.materialNumber]; // ค่า Delivery_Order
				await connection.execute(insertSql, [
					row.deliveryNo,           // Delivery_no
					row.itemNumber,           // Item_number_delivery
					String(sensitiveFlg),     // Delivery_Order = sensitive_flg
					customerCode,             // Customer_Code
					customerName,             // Customer_Name
					row.deliveryType,         // Delivery_Type
					deliveryDateCompact,      // Delivery_Date (YYYYMMDD)
					row.materialNumber,       // Material_Number
					row.planedQty            // Planed_quantity
				]);
			}

			await connection.commit();
		} catch (err) {
			await connection.rollback();
			throw err;
		} finally {
			connection.release();
		}

		return json({
			success: true,
			message: `นำเข้าข้อมูลสำเร็จ ${rows.length} รายการ`,
			count: rows.length
		});
	} catch (error) {
		console.error('Import Error:', error);
		return json(
			{ success: false, message: 'เกิดข้อผิดพลาดในการนำเข้าข้อมูล' },
			{ status: 500 }
		);
	}
};
