import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import ExcelJS from 'exceljs';
import type { RowDataPacket } from 'mysql2';
import { json } from '@sveltejs/kit';

interface CategoryRow extends RowDataPacket {
	id: number;
	name: string;
}
interface UnitRow extends RowDataPacket {
	id: number;
	name: string;
	symbol: string;
}

interface ImportRow {
	rowIdx: number;
	sku?: string;
	barcode?: string;
	name?: string;
	description?: string;
	product_type?: string;
	category?: string;
	unit?: string;
	purchase_cost?: number | null;
	selling_price?: number | null;
	tax_rate?: number | null;
	quantity_on_hand?: number | null;
	reorder_level?: number | null;
	is_active?: boolean;
}

function cellText(cell: ExcelJS.Cell | undefined): string {
	if (!cell) return '';
	const v = cell.value;
	if (v === null || v === undefined) return '';
	if (typeof v === 'object' && 'text' in (v as any)) return String((v as any).text ?? '').trim();
	if (typeof v === 'object' && 'richText' in (v as any))
		return ((v as any).richText as any[]).map((r) => r.text).join('').trim();
	if (typeof v === 'object' && 'result' in (v as any))
		return String((v as any).result ?? '').trim();
	return String(v).trim();
}
function cellNumber(cell: ExcelJS.Cell | undefined): number | null {
	const t = cellText(cell);
	if (!t) return null;
	const n = Number(t.replace(/,/g, ''));
	return isNaN(n) ? null : n;
}
function cellBool(cell: ExcelJS.Cell | undefined): boolean {
	const t = cellText(cell).toLowerCase();
	return ['1', 'true', 'yes', 'y', 't', 'active', 'ใช่'].includes(t);
}

async function generateSku() {
	const prefix = 'PROD';
	const today = new Date();
	const year = today.getFullYear().toString().slice(-2);
	const month = (today.getMonth() + 1).toString().padStart(2, '0');
	const datePrefix = `${prefix}${year}${month}`;
	const [rows]: any[] = await pool.execute(
		`SELECT sku FROM products WHERE sku LIKE ? ORDER BY sku DESC LIMIT 1`,
		[`${datePrefix}-%`]
	);
	let nextNumber = 1;
	if (rows.length > 0) {
		const lastSku = rows[0].sku;
		const lastNumberStr = lastSku.split('-')[1];
		if (lastNumberStr) {
			const lastNumber = parseInt(lastNumberStr, 10);
			if (!isNaN(lastNumber)) nextNumber = lastNumber + 1;
		}
	}
	return `${datePrefix}-${nextNumber.toString().padStart(5, '0')}`;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	checkPermission(locals, 'import products');

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const updateExisting = formData.get('update_existing') === '1';

	if (!file || file.size === 0) {
		return json({ success: false, message: 'No file provided.' }, { status: 400 });
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	const workbook = new ExcelJS.Workbook();

	const isCsv = /\.csv$/i.test(file.name);
	try {
		if (isCsv) {
			const text = buffer.toString('utf-8');
			// Use a temp stream-less load: parse CSV via exceljs's csv read
			const ws = workbook.addWorksheet('Sheet1');
			const lines = text.split(/\r?\n/);
			lines.forEach((line, i) => {
				if (!line.trim() && i > 0) return;
				// naive CSV split — supports quoted strings
				const cells: string[] = [];
				let cur = '';
				let inQ = false;
				for (let j = 0; j < line.length; j++) {
					const ch = line[j];
					if (inQ) {
						if (ch === '"' && line[j + 1] === '"') {
							cur += '"';
							j++;
						} else if (ch === '"') inQ = false;
						else cur += ch;
					} else {
						if (ch === ',') {
							cells.push(cur);
							cur = '';
						} else if (ch === '"' && cur === '') inQ = true;
						else cur += ch;
					}
				}
				cells.push(cur);
				ws.addRow(cells);
			});
		} else {
			await workbook.xlsx.load(buffer as any);
		}
	} catch (err: any) {
		return json(
			{ success: false, message: `Failed to read file: ${err.message}` },
			{ status: 400 }
		);
	}

	const ws = workbook.worksheets[0];
	if (!ws) return json({ success: false, message: 'No worksheet found.' }, { status: 400 });

	// Detect headers from row 1 → map column index → field name (case-insensitive)
	const headerRow = ws.getRow(1);
	const headerMap: Record<string, number> = {};
	headerRow.eachCell((cell, colNumber) => {
		const key = cellText(cell).toLowerCase().replace(/\s+/g, '_');
		if (key) headerMap[key] = colNumber;
	});

	const fieldAliases: Record<string, string[]> = {
		sku: ['sku'],
		barcode: ['barcode'],
		name: ['name', 'product_name'],
		description: ['description'],
		product_type: ['product_type', 'type'],
		category: ['category', 'category_name'],
		unit: ['unit', 'base_unit', 'unit_symbol'],
		purchase_cost: ['purchase_cost', 'cost'],
		selling_price: ['selling_price', 'price'],
		tax_rate: ['tax_rate', 'tax', 'vat'],
		quantity_on_hand: ['quantity_on_hand', 'qty', 'quantity', 'qty_on_hand'],
		reorder_level: ['reorder_level', 'reorder'],
		is_active: ['is_active', 'active', 'status']
	};

	function colOf(field: string): number | undefined {
		for (const alias of fieldAliases[field] ?? [field]) {
			if (headerMap[alias] !== undefined) return headerMap[alias];
		}
		return undefined;
	}

	// Preload categories and units
	const [catRows] = await pool.execute<CategoryRow[]>('SELECT id, name FROM product_categories');
	const [unitRows] = await pool.execute<UnitRow[]>('SELECT id, name, symbol FROM units');
	const categoryMap = new Map<string, number>();
	for (const r of catRows) categoryMap.set(r.name.toLowerCase(), r.id);
	const unitMap = new Map<string, number>();
	for (const r of unitRows) {
		unitMap.set(r.name.toLowerCase(), r.id);
		if (r.symbol) unitMap.set(r.symbol.toLowerCase(), r.id);
	}

	const errors: string[] = [];
	const toInsert: ImportRow[] = [];
	const toUpdate: ImportRow[] = [];

	const lastRow = ws.actualRowCount || ws.rowCount;
	for (let r = 2; r <= lastRow; r++) {
		const row = ws.getRow(r);
		// Skip blank rows
		if (
			!row.hasValues ||
			(row.values as any[]).every((v) => v === null || v === undefined || String(v).trim() === '')
		)
			continue;

		const get = (field: string) => {
			const col = colOf(field);
			return col ? row.getCell(col) : undefined;
		};

		const item: ImportRow = {
			rowIdx: r,
			sku: cellText(get('sku')) || undefined,
			barcode: cellText(get('barcode')) || undefined,
			name: cellText(get('name')) || undefined,
			description: cellText(get('description')) || undefined,
			product_type: cellText(get('product_type')) || undefined,
			category: cellText(get('category')) || undefined,
			unit: cellText(get('unit')) || undefined,
			purchase_cost: cellNumber(get('purchase_cost')),
			selling_price: cellNumber(get('selling_price')),
			tax_rate: cellNumber(get('tax_rate')),
			quantity_on_hand: cellNumber(get('quantity_on_hand')),
			reorder_level: cellNumber(get('reorder_level')),
			is_active: get('is_active') ? cellBool(get('is_active')) : true
		};

		if (!item.name) {
			errors.push(`Row ${r}: missing "name"`);
			continue;
		}
		const type = (item.product_type || 'Stock').trim();
		if (!['Stock', 'NonStock', 'Service'].includes(type)) {
			errors.push(`Row ${r}: invalid product_type "${item.product_type}" (use Stock/NonStock/Service)`);
			continue;
		}
		item.product_type = type;

		if (!item.unit) {
			errors.push(`Row ${r}: missing "unit"`);
			continue;
		}
		const unitId = unitMap.get(item.unit.toLowerCase());
		if (!unitId) {
			errors.push(`Row ${r}: unit "${item.unit}" not found`);
			continue;
		}
		(item as any)._unitId = unitId;

		if (item.category) {
			const catId = categoryMap.get(item.category.toLowerCase());
			if (!catId) {
				errors.push(`Row ${r}: category "${item.category}" not found`);
				continue;
			}
			(item as any)._categoryId = catId;
		}

		// route as insert or update
		if (item.sku && updateExisting) {
			const [exists] = await pool.execute<RowDataPacket[]>(
				'SELECT id FROM products WHERE sku = ? LIMIT 1',
				[item.sku]
			);
			if (exists.length > 0) {
				(item as any)._existingId = (exists[0] as any).id;
				toUpdate.push(item);
				continue;
			}
		}
		toInsert.push(item);
	}

	if (errors.length > 0 && toInsert.length === 0 && toUpdate.length === 0) {
		return json(
			{ success: false, message: `Import failed: ${errors.length} error(s).\n` + errors.slice(0, 10).join('\n') },
			{ status: 400 }
		);
	}

	const conn = await pool.getConnection();
	let insertedCount = 0;
	let updatedCount = 0;
	try {
		await conn.beginTransaction();

		for (const it of toInsert) {
			const sku = it.sku || (await generateSku());
			// Skip duplicate name within DB
			const [nm] = await conn.execute<RowDataPacket[]>(
				'SELECT id FROM products WHERE name = ? LIMIT 1',
				[it.name]
			);
			if (nm.length > 0) {
				errors.push(`Row ${it.rowIdx}: product name "${it.name}" already exists, skipped.`);
				continue;
			}
			await conn.execute(
				`INSERT INTO products (
					sku, barcode, name, description, product_type, category_id, unit_id,
					purchase_cost, selling_price, tax_rate,
					quantity_on_hand, reorder_level, is_active
				 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					sku,
					it.barcode ?? null,
					it.name,
					it.description ?? null,
					it.product_type,
					(it as any)._categoryId ?? null,
					(it as any)._unitId,
					it.purchase_cost,
					it.selling_price,
					it.tax_rate,
					it.product_type === 'Stock' ? (it.quantity_on_hand ?? 0) : 0,
					it.reorder_level,
					it.is_active ? 1 : 0
				]
			);
			insertedCount++;
		}

		for (const it of toUpdate) {
			await conn.execute(
				`UPDATE products SET
					barcode = ?, name = ?, description = ?, product_type = ?,
					category_id = ?, unit_id = ?,
					purchase_cost = ?, selling_price = ?, tax_rate = ?,
					quantity_on_hand = ?, reorder_level = ?, is_active = ?
				 WHERE id = ?`,
				[
					it.barcode ?? null,
					it.name,
					it.description ?? null,
					it.product_type,
					(it as any)._categoryId ?? null,
					(it as any)._unitId,
					it.purchase_cost,
					it.selling_price,
					it.tax_rate,
					it.product_type === 'Stock' ? (it.quantity_on_hand ?? 0) : 0,
					it.reorder_level,
					it.is_active ? 1 : 0,
					(it as any)._existingId
				]
			);
			updatedCount++;
		}

		await conn.commit();
	} catch (err: any) {
		await conn.rollback();
		conn.release();
		console.error('Import error:', err);
		return json(
			{ success: false, message: `Import failed: ${err.message}` },
			{ status: 500 }
		);
	}
	conn.release();

	const summary = `Imported ${insertedCount} new, updated ${updatedCount}.` +
		(errors.length ? ` ${errors.length} row(s) skipped: ${errors.slice(0, 5).join('; ')}` : '');

	return json({ success: true, message: summary, inserted: insertedCount, updated: updatedCount, errors });
};

export const prerender = false;
