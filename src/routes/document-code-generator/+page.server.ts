import { existsSync } from 'node:fs';
import path from 'node:path';
import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import { checkPermission } from '$lib/server/auth';

export type DocumentAaType = {
	id?: number;
	code: string;
	name_th: string;
	name_en: string;
	format: string;
};

export type DocumentBbProcess = {
	id?: number;
	code: string;
	name_th: string;
	name_en: string;
};

export type DocumentSimpleRef = {
	id?: number;
	code: string;
	name_th: string;
	name_en: string;
};

export type SegmentRunningRow = {
	doc_type: string;
	department_code: string;
	bb_name_th: string;
	bb_name_en: string;
	last_running_no: number;
};

function normCode(s: string): string {
	return s.trim().toUpperCase().replace(/\s+/g, '');
}

/** ประเภทที่ใช้ segment CC ในรหัส */
const CC_SEGMENT_AA = ['WI', 'STD', 'EIS', 'FM'] as const;
/** STD / EIS ใช้ EE และ FF */
const EE_FF_SEGMENT_AA = ['STD', 'EIS'] as const;
/** ประเภทที่มี BB ก่อน GG (เลข GG ต่อ AA×BB อยู่ใน document_running_masters) */
const GG_AA_WITH_BB = ['QP', 'WI', 'STD', 'EIS', 'FM', 'SD', 'ED'] as const;

function runningKey(segment: 'cc' | 'ee' | 'ff', docType: string, deptCode: string): string {
	return `${segment}:${normCode(docType)}:${normCode(deptCode)}`;
}

function ggMasterKey(docType: string, deptCode: string): string {
	return `${normCode(docType)}:${normCode(deptCode)}`;
}

function buildSegmentMatrix(
	segment: 'cc' | 'ee' | 'ff',
	aaList: readonly string[],
	departments: DocumentBbProcess[],
	byKey: Map<string, number>
): SegmentRunningRow[] {
	const rows: SegmentRunningRow[] = [];
	for (const aa of aaList) {
		for (const d of departments) {
			rows.push({
				doc_type: aa,
				department_code: d.code,
				bb_name_th: d.name_th,
				bb_name_en: d.name_en,
				last_running_no: byKey.get(runningKey(segment, aa, d.code)) ?? 0
			});
		}
	}
	return rows;
}

function buildGgRunningRows(
	departments: DocumentBbProcess[],
	byKey: Map<string, number>
): SegmentRunningRow[] {
	const rows: SegmentRunningRow[] = [
		{
			doc_type: 'QM',
			department_code: '',
			bb_name_th: '—',
			bb_name_en: 'ไม่มี BB (รูปแบบ QM-GG)',
			last_running_no: byKey.get(ggMasterKey('QM', '')) ?? 0
		}
	];
	for (const aa of GG_AA_WITH_BB) {
		for (const d of departments) {
			rows.push({
				doc_type: aa,
				department_code: d.code,
				bb_name_th: d.name_th,
				bb_name_en: d.name_en,
				last_running_no: byKey.get(ggMasterKey(aa, d.code)) ?? 0
			});
		}
	}
	return rows;
}

const FALLBACK_DOCUMENT_TYPES: DocumentAaType[] = [
	{ code: 'QM', name_th: 'คู่มือคุณภาพ', name_en: 'Quality Manual', format: 'AA(QM)-GG' },
	{ code: 'QP', name_th: 'ระเบียบปฏิบัติ', name_en: 'Quality Procedures', format: 'AA(QP)-BB-GG' },
	{ code: 'WI', name_th: 'วิธีปฏิบัติงาน', name_en: 'Work Instruction', format: 'AA(WI)-BB-CC-GG' },
	{ code: 'STD', name_th: 'มาตรฐานการทำงาน', name_en: 'Standardized Work', format: 'AA(STD)-BB-CC-EE-FF-GG' },
	{ code: 'EIS', name_th: 'เอกสาร Instruction Sheet', name_en: 'Element Instruction Sheet', format: 'AA(EIS)-BB-CC-EE-FF-GG' },
	{ code: 'FM', name_th: 'แบบฟอร์ม', name_en: 'Form', format: 'AA(FM)-BB-CC-GG' },
	{ code: 'SD', name_th: 'เอกสารสนับสนุน', name_en: 'Support Document', format: 'AA(SD)-BB-GG' },
	{ code: 'ED', name_th: 'เอกสารภายนอก', name_en: 'External Document', format: 'AA(ED)-BB-GG' }
];

const FALLBACK_DEPARTMENTS: DocumentBbProcess[] = [
	{ code: 'QM', name_th: 'การจัดการคุณภาพ', name_en: 'Quality Management / ISO Center' },
	{ code: 'BD', name_th: 'พัฒนาธุรกิจ', name_en: 'Business Development' },
	{ code: 'IE', name_th: 'นำเข้าและส่งออก', name_en: 'Import and Export' },
	{ code: 'HR', name_th: 'บุคคล', name_en: 'Human Resources' },
	{ code: 'GA', name_th: 'ธุรการ', name_en: 'General Affair' },
	{ code: 'PU', name_th: 'จัดซื้อ', name_en: 'Purchase' },
	{ code: 'TR', name_th: 'ขนส่ง', name_en: 'Transportation' },
	{ code: 'FV', name_th: 'ศูนย์รถใหม่และงานซ่อมหลังส่งมอบ', name_en: 'Finish Vehicle' },
	{ code: 'IH', name_th: 'การซ่อมรถใหม่ภายในก่อนส่งมอบ', name_en: 'In House' },
	{ code: 'AF', name_th: 'ศูนย์กระจายอะไหล่', name_en: 'After Sale' },
	{ code: 'IT', name_th: 'เทคโนโลยีสารสนเทศ', name_en: 'Information Technology' },
	{ code: 'MT', name_th: 'ซ่อมบำรุง', name_en: 'Maintenance' },
	{ code: 'ST', name_th: 'ความปลอดภัย', name_en: 'Safety' },
	{ code: 'QC', name_th: 'ควบคุมปฏิบัติการ', name_en: 'Operation Control' }
];

const SIMPLE_REF_TABLES = {
	cc: 'document_cc_reference',
	ee: 'document_ee_reference',
	ff: 'document_ff_reference',
	gg: 'document_gg_reference'
} as const;

type SimpleRefKey = keyof typeof SIMPLE_REF_TABLES;

function trimRefCode(s: string): string {
	return s.trim();
}

function mapSimpleRows(rows: RowDataPacket[]): DocumentSimpleRef[] {
	return rows.map((r) => ({
		id: Number(r.id),
		code: String(r.code),
		name_th: String(r.name_th),
		name_en: String(r.name_en)
	}));
}

async function loadSimpleTable(table: string): Promise<DocumentSimpleRef[]> {
	try {
		const [rows] = await pool.execute<RowDataPacket[]>(
			`SELECT id, code, name_th, name_en FROM \`${table}\` ORDER BY display_order ASC, code ASC`
		);
		return mapSimpleRows(rows);
	} catch {
		return [];
	}
}

async function saveSimpleRef(
	event: RequestEvent,
	table: (typeof SIMPLE_REF_TABLES)[SimpleRefKey],
	flag: string
) {
	checkPermission(event.locals, 'edit_document');
	const fd = await event.request.formData();
	const idRaw = fd.get('id')?.toString();
	const code = trimRefCode(fd.get('code')?.toString() || '');
	const name_th = fd.get('name_th')?.toString()?.trim() || '';
	const name_en = fd.get('name_en')?.toString()?.trim() || '';

	if (!code || !name_th || !name_en) {
		return fail(400, { [flag]: true, error: 'กรุณากรอกรหัส ชื่อไทย และชื่ออังกฤษ' });
	}

	const id = idRaw ? Number(idRaw) : 0;
	const isUpdate = Number.isInteger(id) && id > 0;

	try {
		if (isUpdate) {
			const [existing] = await pool.execute<RowDataPacket[]>(
				`SELECT id FROM \`${table}\` WHERE id = ? LIMIT 1`,
				[id]
			);
			if (!existing.length) {
				return fail(404, { [flag]: true, error: 'ไม่พบรายการ' });
			}
			const [dup] = await pool.execute<RowDataPacket[]>(
				`SELECT id FROM \`${table}\` WHERE code = ? AND id <> ? LIMIT 1`,
				[code, id]
			);
			if (dup.length) {
				return fail(409, { [flag]: true, error: 'รหัสนี้มีอยู่แล้ว' });
			}
			await pool.execute(
				`UPDATE \`${table}\` SET code = ?, name_th = ?, name_en = ? WHERE id = ?`,
				[code, name_th, name_en, id]
			);
		} else {
			const [dup] = await pool.execute<RowDataPacket[]>(
				`SELECT id FROM \`${table}\` WHERE code = ? LIMIT 1`,
				[code]
			);
			if (dup.length) {
				return fail(409, { [flag]: true, error: 'รหัสนี้มีอยู่แล้ว' });
			}
			await pool.execute(
				`INSERT INTO \`${table}\` (code, name_th, name_en, display_order) VALUES (?, ?, ?, 99)`,
				[code, name_th, name_en]
			);
		}
		return { [flag]: true, success: true };
	} catch (err: unknown) {
		const e = err as { code?: string };
		if (e?.code === 'ER_NO_SUCH_TABLE') {
			return fail(500, {
				[flag]: true,
				error: 'ยังไม่ได้รันส่วน CC–GG ใน sql/document_code_reference_masters.sql'
			});
		}
		console.error(`[saveSimpleRef ${table}]`, err);
		return fail(500, { [flag]: true, error: 'บันทึกไม่สำเร็จ' });
	}
}

async function deleteSimpleRef(
	event: RequestEvent,
	table: (typeof SIMPLE_REF_TABLES)[SimpleRefKey],
	flag: string
) {
	checkPermission(event.locals, 'edit_document');
	const fd = await event.request.formData();
	const id = Number(fd.get('id')?.toString() || 0);
	if (!Number.isInteger(id) || id <= 0) {
		return fail(400, { [flag]: true, error: 'รหัสรายการไม่ถูกต้อง' });
	}
	try {
		const [rows] = await pool.execute<RowDataPacket[]>(
			`SELECT id FROM \`${table}\` WHERE id = ? LIMIT 1`,
			[id]
		);
		if (!rows.length) return fail(404, { [flag]: true, error: 'ไม่พบรายการ' });
		await pool.execute(`DELETE FROM \`${table}\` WHERE id = ?`, [id]);
		return { [flag]: true, success: true };
	} catch (err: unknown) {
		const e = err as { code?: string };
		if (e?.code === 'ER_NO_SUCH_TABLE') {
			return fail(500, {
				[flag]: true,
				error: 'ยังไม่ได้รันส่วน CC–GG ใน sql/document_code_reference_masters.sql'
			});
		}
		console.error(`[deleteSimpleRef ${table}]`, err);
		return fail(500, { [flag]: true, error: 'ลบไม่สำเร็จ' });
	}
}

const CODING_SPEC_PDF = path.join(
	process.cwd(),
	'static',
	'isodocs',
	'document-code-coding-spec.pdf'
);

export const load: PageServerLoad = async () => {
	const codingSpecPdfAvailable = existsSync(CODING_SPEC_PDF);
	let refSchemaOk = false;
	let documentTypes: DocumentAaType[] = [];
	let departments: DocumentBbProcess[] = [];

	try {
		await pool.execute('SELECT 1 FROM document_aa_types LIMIT 1');
		refSchemaOk = true;

		const [aaRows] = await pool.execute<RowDataPacket[]>(
			`SELECT id, code, name_th, name_en, format FROM document_aa_types ORDER BY display_order ASC, code ASC`
		);
		const [bbRows] = await pool.execute<RowDataPacket[]>(
			`SELECT id, code, name_th, name_en FROM document_bb_processes ORDER BY display_order ASC, code ASC`
		);
		if (aaRows.length > 0) {
			documentTypes = aaRows.map((r) => ({
				id: Number(r.id),
				code: String(r.code),
				name_th: String(r.name_th),
				name_en: String(r.name_en),
				format: String(r.format)
			}));
		}
		if (bbRows.length > 0) {
			departments = bbRows.map((r) => ({
				id: Number(r.id),
				code: String(r.code),
				name_th: String(r.name_th),
				name_en: String(r.name_en)
			}));
		}
	} catch (e) {
		console.error('[document-code-generator] load masters:', e);
	}

	if (documentTypes.length === 0) documentTypes = [...FALLBACK_DOCUMENT_TYPES];
	if (departments.length === 0) departments = [...FALLBACK_DEPARTMENTS];

	const ccRefs = refSchemaOk ? await loadSimpleTable(SIMPLE_REF_TABLES.cc) : [];
	const eeRefs = refSchemaOk ? await loadSimpleTable(SIMPLE_REF_TABLES.ee) : [];
	const ffRefs = refSchemaOk ? await loadSimpleTable(SIMPLE_REF_TABLES.ff) : [];
	const ggRefs = refSchemaOk ? await loadSimpleTable(SIMPLE_REF_TABLES.gg) : [];

	let segmentRunningSchemaOk = false;
	const segmentRunningByKey = new Map<string, number>();
	try {
		const [segRows] = await pool.execute<RowDataPacket[]>(
			`SELECT segment, doc_type, department_code, last_running_no FROM document_iso_segment_running`
		);
		segmentRunningSchemaOk = true;
		for (const r of segRows) {
			const seg = String(r.segment) as 'cc' | 'ee' | 'ff';
			if (seg !== 'cc' && seg !== 'ee' && seg !== 'ff') continue;
			segmentRunningByKey.set(
				runningKey(seg, String(r.doc_type), String(r.department_code)),
				Number(r.last_running_no) || 0
			);
		}
	} catch {
		// table missing until migration
	}

	const ggRunningByKey = new Map<string, number>();
	try {
		const [grRows] = await pool.execute<RowDataPacket[]>(
			`SELECT doc_type, department_code, last_running_no FROM document_running_masters`
		);
		for (const r of grRows) {
			const dt = String(r.doc_type || '');
			const bb = String(r.department_code ?? '');
			ggRunningByKey.set(ggMasterKey(dt, bb), Number(r.last_running_no) || 0);
		}
	} catch {
		// ignore
	}

	const runningCc = buildSegmentMatrix('cc', CC_SEGMENT_AA, departments, segmentRunningByKey);
	const runningEe = buildSegmentMatrix('ee', EE_FF_SEGMENT_AA, departments, segmentRunningByKey);
	const runningFf = buildSegmentMatrix('ff', EE_FF_SEGMENT_AA, departments, segmentRunningByKey);
	const runningGg = buildGgRunningRows(departments, ggRunningByKey);

	return {
		documentTypes,
		departments,
		ccRefs,
		eeRefs,
		ffRefs,
		ggRefs,
		refSchemaOk,
		segmentRunningSchemaOk,
		runningCc,
		runningEe,
		runningFf,
		runningGg,
		codingSpecPdfAvailable
	};
};

export const actions: Actions = {
	saveAaType: async ({ request, locals }) => {
		checkPermission(locals, 'edit_document');
		const fd = await request.formData();
		const idRaw = fd.get('id')?.toString();
		const code = normCode(fd.get('code')?.toString() || '');
		const name_th = fd.get('name_th')?.toString()?.trim() || '';
		const name_en = fd.get('name_en')?.toString()?.trim() || '';
		const format = fd.get('format')?.toString()?.trim() || '';

		if (!code || !name_th || !name_en || !format) {
			return fail(400, { saveAa: true, error: 'กรุณากรอกรหัส ชื่อไทย ชื่ออังกฤษ และรูปแบบรหัส' });
		}

		const id = idRaw ? Number(idRaw) : 0;
		const isUpdate = Number.isInteger(id) && id > 0;

		try {
			if (isUpdate) {
				const [existing] = await pool.execute<RowDataPacket[]>(
					'SELECT code FROM document_aa_types WHERE id = ? LIMIT 1',
					[id]
				);
				if (!existing.length) {
					return fail(404, { saveAa: true, error: 'ไม่พบรายการ' });
				}
				const oldCode = String(existing[0].code);
				const [dup] = await pool.execute<RowDataPacket[]>(
					'SELECT id FROM document_aa_types WHERE code = ? AND id <> ? LIMIT 1',
					[code, id]
				);
				if (dup.length) {
					return fail(409, { saveAa: true, error: 'รหัสนี้มีอยู่แล้ว' });
				}
				await pool.execute(
					`UPDATE document_aa_types SET code = ?, name_th = ?, name_en = ?, format = ? WHERE id = ?`,
					[code, name_th, name_en, format, id]
				);
				if (oldCode !== code) {
					await pool.execute(
						`UPDATE document_running_masters SET doc_type = ? WHERE doc_type = ?`,
						[code, oldCode]
					);
				}
			} else {
				const [dup] = await pool.execute<RowDataPacket[]>(
					'SELECT id FROM document_aa_types WHERE code = ? LIMIT 1',
					[code]
				);
				if (dup.length) {
					return fail(409, { saveAa: true, error: 'รหัสนี้มีอยู่แล้ว' });
				}
				await pool.execute(
					`INSERT INTO document_aa_types (code, name_th, name_en, format, display_order)
					 VALUES (?, ?, ?, ?, 99)`,
					[code, name_th, name_en, format]
				);
			}
			return { saveAa: true, success: true };
		} catch (err: unknown) {
			const e = err as { code?: string };
			if (e?.code === 'ER_NO_SUCH_TABLE') {
				return fail(500, {
					saveAa: true,
					error: 'ยังไม่ได้รัน sql/document_code_reference_masters.sql บนฐานข้อมูล'
				});
			}
			console.error('[saveAaType]', err);
			return fail(500, { saveAa: true, error: 'บันทึกไม่สำเร็จ' });
		}
	},

	deleteAaType: async ({ request, locals }) => {
		checkPermission(locals, 'edit_document');
		const fd = await request.formData();
		const id = Number(fd.get('id')?.toString() || 0);
		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { deleteAa: true, error: 'รหัสรายการไม่ถูกต้อง' });
		}
		try {
			const [rows] = await pool.execute<RowDataPacket[]>(
				'SELECT code FROM document_aa_types WHERE id = ? LIMIT 1',
				[id]
			);
			if (!rows.length) return fail(404, { deleteAa: true, error: 'ไม่พบรายการ' });
			const code = String(rows[0].code);
			const [used] = await pool.execute<RowDataPacket[]>(
				'SELECT 1 FROM document_running_masters WHERE doc_type = ? LIMIT 1',
				[code]
			);
			if (used.length) {
				return fail(409, {
					deleteAa: true,
					error: 'ลบไม่ได้: มีการใช้รหัสนี้ใน running master แล้ว'
				});
			}
			await pool.execute('DELETE FROM document_aa_types WHERE id = ?', [id]);
			return { deleteAa: true, success: true };
		} catch (err: unknown) {
			const e = err as { code?: string };
			if (e?.code === 'ER_NO_SUCH_TABLE') {
				return fail(500, {
					deleteAa: true,
					error: 'ยังไม่ได้รัน sql/document_code_reference_masters.sql บนฐานข้อมูล'
				});
			}
			console.error('[deleteAaType]', err);
			return fail(500, { deleteAa: true, error: 'ลบไม่สำเร็จ' });
		}
	},

	saveBbProcess: async ({ request, locals }) => {
		checkPermission(locals, 'edit_document');
		const fd = await request.formData();
		const idRaw = fd.get('id')?.toString();
		const code = normCode(fd.get('code')?.toString() || '');
		const name_th = fd.get('name_th')?.toString()?.trim() || '';
		const name_en = fd.get('name_en')?.toString()?.trim() || '';

		if (!code || !name_th || !name_en) {
			return fail(400, { saveBb: true, error: 'กรุณากรอกรหัส ชื่อไทย และชื่ออังกฤษ' });
		}

		const id = idRaw ? Number(idRaw) : 0;
		const isUpdate = Number.isInteger(id) && id > 0;

		try {
			if (isUpdate) {
				const [existing] = await pool.execute<RowDataPacket[]>(
					'SELECT code FROM document_bb_processes WHERE id = ? LIMIT 1',
					[id]
				);
				if (!existing.length) {
					return fail(404, { saveBb: true, error: 'ไม่พบรายการ' });
				}
				const oldCode = String(existing[0].code);
				const [dup] = await pool.execute<RowDataPacket[]>(
					'SELECT id FROM document_bb_processes WHERE code = ? AND id <> ? LIMIT 1',
					[code, id]
				);
				if (dup.length) {
					return fail(409, { saveBb: true, error: 'รหัสนี้มีอยู่แล้ว' });
				}
				await pool.execute(
					`UPDATE document_bb_processes SET code = ?, name_th = ?, name_en = ? WHERE id = ?`,
					[code, name_th, name_en, id]
				);
				if (oldCode !== code) {
					await pool.execute(
						`UPDATE document_running_masters SET department_code = ? WHERE department_code = ?`,
						[code, oldCode]
					);
				}
			} else {
				const [dup] = await pool.execute<RowDataPacket[]>(
					'SELECT id FROM document_bb_processes WHERE code = ? LIMIT 1',
					[code]
				);
				if (dup.length) {
					return fail(409, { saveBb: true, error: 'รหัสนี้มีอยู่แล้ว' });
				}
				await pool.execute(
					`INSERT INTO document_bb_processes (code, name_th, name_en, display_order) VALUES (?, ?, ?, 99)`,
					[code, name_th, name_en]
				);
			}
			return { saveBb: true, success: true };
		} catch (err: unknown) {
			const e = err as { code?: string };
			if (e?.code === 'ER_NO_SUCH_TABLE') {
				return fail(500, {
					saveBb: true,
					error: 'ยังไม่ได้รัน sql/document_code_reference_masters.sql บนฐานข้อมูล'
				});
			}
			console.error('[saveBbProcess]', err);
			return fail(500, { saveBb: true, error: 'บันทึกไม่สำเร็จ' });
		}
	},

	deleteBbProcess: async ({ request, locals }) => {
		checkPermission(locals, 'edit_document');
		const fd = await request.formData();
		const id = Number(fd.get('id')?.toString() || 0);
		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { deleteBb: true, error: 'รหัสรายการไม่ถูกต้อง' });
		}
		try {
			const [rows] = await pool.execute<RowDataPacket[]>(
				'SELECT code FROM document_bb_processes WHERE id = ? LIMIT 1',
				[id]
			);
			if (!rows.length) return fail(404, { deleteBb: true, error: 'ไม่พบรายการ' });
			const code = String(rows[0].code);
			const [used] = await pool.execute<RowDataPacket[]>(
				'SELECT 1 FROM document_running_masters WHERE department_code = ? LIMIT 1',
				[code]
			);
			if (used.length) {
				return fail(409, {
					deleteBb: true,
					error: 'ลบไม่ได้: มีการใช้รหัสนี้ใน running master แล้ว'
				});
			}
			await pool.execute('DELETE FROM document_bb_processes WHERE id = ?', [id]);
			return { deleteBb: true, success: true };
		} catch (err: unknown) {
			const e = err as { code?: string };
			if (e?.code === 'ER_NO_SUCH_TABLE') {
				return fail(500, {
					deleteBb: true,
					error: 'ยังไม่ได้รัน sql/document_code_reference_masters.sql บนฐานข้อมูล'
				});
			}
			console.error('[deleteBbProcess]', err);
			return fail(500, { deleteBb: true, error: 'ลบไม่สำเร็จ' });
		}
	},

	saveSegmentRunning: async ({ request, locals }) => {
		checkPermission(locals, 'edit_document');
		const fd = await request.formData();
		const segment = fd.get('segment')?.toString() as 'cc' | 'ee' | 'ff';
		const doc_type = normCode(fd.get('doc_type')?.toString() || '');
		const department_code = normCode(fd.get('department_code')?.toString() || '');
		const raw = fd.get('last_running_no')?.toString() ?? '0';
		const lastNum = Math.max(
			0,
			Math.min(9999, parseInt(String(raw).replace(/\D/g, '') || '0', 10) || 0)
		);

		if (segment !== 'cc' && segment !== 'ee' && segment !== 'ff') {
			return fail(400, { saveSegmentRunning: true, error: 'segment ไม่ถูกต้อง' });
		}
		if (!doc_type || !department_code) {
			return fail(400, { saveSegmentRunning: true, error: 'กรุณาระบุ AA และ BB' });
		}

		const allowedAa: readonly string[] =
			segment === 'cc' ? CC_SEGMENT_AA : EE_FF_SEGMENT_AA;
		if (!allowedAa.includes(doc_type)) {
			return fail(400, { saveSegmentRunning: true, error: 'ประเภทเอกสารไม่ตรงกับ segment นี้' });
		}

		try {
			const [bbOk] = await pool.execute<RowDataPacket[]>(
				'SELECT 1 FROM document_bb_processes WHERE UPPER(code) = UPPER(?) LIMIT 1',
				[department_code]
			);
			if (!bbOk.length) {
				return fail(400, { saveSegmentRunning: true, error: 'ไม่พบรหัส BB ในระบบ' });
			}

			await pool.execute(
				`INSERT INTO document_iso_segment_running (segment, doc_type, department_code, last_running_no)
				 VALUES (?, ?, ?, ?)
				 ON DUPLICATE KEY UPDATE last_running_no = VALUES(last_running_no), updated_at = CURRENT_TIMESTAMP`,
				[segment, doc_type, department_code, lastNum]
			);
			return { saveSegmentRunning: true, success: true };
		} catch (err: unknown) {
			const e = err as { code?: string };
			if (e?.code === 'ER_NO_SUCH_TABLE') {
				return fail(500, {
					saveSegmentRunning: true,
					error: 'ยังไม่มีตาราง document_iso_segment_running — รัน sql/document_code_reference_masters.sql'
				});
			}
			console.error('[saveSegmentRunning]', err);
			return fail(500, { saveSegmentRunning: true, error: 'บันทึกไม่สำเร็จ' });
		}
	},

	saveGgRunning: async ({ request, locals }) => {
		checkPermission(locals, 'edit_document');
		const fd = await request.formData();
		const doc_type = normCode(fd.get('doc_type')?.toString() || '');
		const department_code = normCode(fd.get('department_code')?.toString() || '');
		const raw = fd.get('last_running_no')?.toString() ?? '0';
		const lastNum = Math.max(
			0,
			Math.min(9999, parseInt(String(raw).replace(/\D/g, '') || '0', 10) || 0)
		);

		if (!doc_type) {
			return fail(400, { saveGgRunning: true, error: 'กรุณาระบุ AA' });
		}

		if (doc_type === 'QM') {
			if (department_code !== '') {
				return fail(400, { saveGgRunning: true, error: 'QM ไม่ใช้ BB' });
			}
		} else {
			if (!GG_AA_WITH_BB.includes(doc_type as (typeof GG_AA_WITH_BB)[number])) {
				return fail(400, { saveGgRunning: true, error: 'ประเภทเอกสารไม่ใช้รูปแบบ GG แบบนี้' });
			}
			if (!department_code) {
				return fail(400, { saveGgRunning: true, error: 'กรุณาระบุ BB' });
			}
			const [bbOk] = await pool.execute<RowDataPacket[]>(
				'SELECT 1 FROM document_bb_processes WHERE UPPER(code) = UPPER(?) LIMIT 1',
				[department_code]
			);
			if (!bbOk.length) {
				return fail(400, { saveGgRunning: true, error: 'ไม่พบรหัส BB ในระบบ' });
			}
		}

		try {
			await pool.execute(
				`INSERT INTO document_running_masters (doc_type, department_code, last_running_no)
				 VALUES (?, ?, ?)
				 ON DUPLICATE KEY UPDATE last_running_no = VALUES(last_running_no), updated_at = CURRENT_TIMESTAMP`,
				[doc_type, doc_type === 'QM' ? '' : department_code, lastNum]
			);
			return { saveGgRunning: true, success: true };
		} catch (err: unknown) {
			const e = err as { code?: string };
			if (e?.code === 'ER_NO_SUCH_TABLE') {
				return fail(500, {
					saveGgRunning: true,
					error: 'ยังไม่มีตาราง document_running_masters'
				});
			}
			console.error('[saveGgRunning]', err);
			return fail(500, { saveGgRunning: true, error: 'บันทึกไม่สำเร็จ' });
		}
	},

	saveCcRef: async (e) => saveSimpleRef(e, SIMPLE_REF_TABLES.cc, 'saveCc'),
	deleteCcRef: async (e) => deleteSimpleRef(e, SIMPLE_REF_TABLES.cc, 'deleteCc'),
	saveEeRef: async (e) => saveSimpleRef(e, SIMPLE_REF_TABLES.ee, 'saveEe'),
	deleteEeRef: async (e) => deleteSimpleRef(e, SIMPLE_REF_TABLES.ee, 'deleteEe'),
	saveFfRef: async (e) => saveSimpleRef(e, SIMPLE_REF_TABLES.ff, 'saveFf'),
	deleteFfRef: async (e) => deleteSimpleRef(e, SIMPLE_REF_TABLES.ff, 'deleteFf'),
	saveGgRef: async (e) => saveSimpleRef(e, SIMPLE_REF_TABLES.gg, 'saveGg'),
	deleteGgRef: async (e) => deleteSimpleRef(e, SIMPLE_REF_TABLES.gg, 'deleteGg')
};
