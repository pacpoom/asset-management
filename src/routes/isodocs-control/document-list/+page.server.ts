import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { fail, error as httpError } from '@sveltejs/kit';
import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';

interface DocumentMaster extends RowDataPacket {
	id: number;
	doc_code: string;
	doc_name: string;
	doc_type: string;
	department_id: number;
	department_name: string;
	iso_section_code: string | null;
	iso_section_name_th: string | null;
	iso_section_name_en: string | null;
	current_revision: string;
	effective_date: string;
	status: string;
	description: string;
	attached_file_original_name: string | null;
	attached_file_system_name: string | null;
}

interface IsoSection extends RowDataPacket {
	id: number;
	code: string;
	name_th: string | null;
	name_en: string | null;
}

interface Department extends RowDataPacket {
	id: number;
	name: string;
}

interface DocumentType extends RowDataPacket {
	code: string;
	name_th: string;
	name_en: string;
}

type DocTypeRef = {
	code: string;
	name_th: string;
	name_en: string;
};

/** When document_aa_types is missing, keep import File Master useful */
const FALLBACK_DOC_TYPE_REFS: DocTypeRef[] = [
	{ code: 'QM', name_th: 'คู่มือคุณภาพ', name_en: 'Quality Manual' },
	{ code: 'QP', name_th: 'ระเบียบปฏิบัติ', name_en: 'Quality Procedures' },
	{ code: 'WI', name_th: 'วิธีปฏิบัติงาน', name_en: 'Work Instruction' },
	{ code: 'STD', name_th: 'มาตรฐานการทำงาน', name_en: 'Standardized Work' },
	{ code: 'EIS', name_th: 'เอกสาร Instruction Sheet', name_en: 'Element Instruction Sheet' },
	{ code: 'FM', name_th: 'แบบฟอร์ม', name_en: 'Form' },
	{ code: 'SD', name_th: 'เอกสารสนับสนุน', name_en: 'Support Document' },
	{ code: 'ED', name_th: 'เอกสารภายนอก', name_en: 'External Document' }
];

const MASTER_UPLOAD_DIR = path.resolve('uploads', 'isodocs', 'document-master');
const MAX_MASTER_FILE_BYTES = 35 * 1024 * 1024;
const ALLOWED_MASTER_EXT = new Set(['.pdf', '.doc', '.docx']);

async function ensureMasterUploadDir() {
	await fs.mkdir(MASTER_UPLOAD_DIR, { recursive: true });
}

function validateMasterFile(file: File): string | null {
	if (!file || file.size === 0) return 'No file';
	if (file.size > MAX_MASTER_FILE_BYTES) return 'File too large (max 35 MB)';
	const ext = path.extname(file.name.toLowerCase());
	if (!ALLOWED_MASTER_EXT.has(ext)) return 'Allowed types: PDF, DOC, DOCX';
	return null;
}

async function saveMasterFile(file: File): Promise<{ systemName: string; originalName: string }> {
	await ensureMasterUploadDir();
	const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
	const sanitizedOriginalName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_');
	const systemName = `${uniqueSuffix}-${sanitizedOriginalName}`;
	const uploadPath = path.join(MASTER_UPLOAD_DIR, systemName);
	await fs.writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));
	return { systemName, originalName: file.name };
}

async function unlinkMasterFile(systemName: string | null | undefined) {
	if (!systemName) return;
	const safe = path.basename(String(systemName));
	const fullPath = path.join(MASTER_UPLOAD_DIR, safe);
	try {
		await fs.unlink(fullPath);
	} catch {
		// ignore missing file
	}
}

type ParsedImportRow = {
	docCode: string;
	docName: string;
	revision: string;
	effectiveDate: string;
};

function parseDelimitedLine(line: string, delimiter: string): string[] {
	const values: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (char === delimiter && !inQuotes) {
			values.push(current.trim());
			current = '';
			continue;
		}

		current += char;
	}

	values.push(current.trim());
	return values;
}

function normalizeHeader(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseEffectiveDate(input: string | Date): string | null {
	const toDateOnly = (date: Date): string =>
		`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
			date.getDate()
		).padStart(2, '0')}`;

	if (input instanceof Date && !Number.isNaN(input.getTime())) {
		// Keep local date components to avoid timezone shifts.
		return toDateOnly(input);
	}

	const raw = String(input || '').trim();
	if (!raw) return null;

	const cleaned = raw.replace(/^effective\s*date\s*:\s*/i, '').trim();

	// ISO date input from html/date cells
	if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

	// US-style short date in imported sheets, e.g. 5/1/2025 or 05/01/2025
	const shortDateMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (shortDateMatch) {
		const mm = shortDateMatch[1].padStart(2, '0');
		const dd = shortDateMatch[2].padStart(2, '0');
		return `${shortDateMatch[3]}-${mm}-${dd}`;
	}

	const match = cleaned.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
	if (!match) return null;

	const monthMap: Record<string, string> = {
		january: '01',
		jan: '01',
		february: '02',
		feb: '02',
		march: '03',
		mar: '03',
		april: '04',
		apr: '04',
		may: '05',
		june: '06',
		jun: '06',
		july: '07',
		jul: '07',
		august: '08',
		aug: '08',
		september: '09',
		sep: '09',
		sept: '09',
		october: '10',
		oct: '10',
		november: '11',
		nov: '11',
		december: '12',
		dec: '12'
	};

	const month = monthMap[match[1].toLowerCase()];
	if (!month) return null;

	return `${match[3]}-${month}-${match[2].padStart(2, '0')}`;
}

function parseRevision(input: string): string {
	const value = String(input || '').trim();
	const match = value.match(/(?:rev\.?\s*)?(\d{1,3})/i);
	return (match?.[1] || '00').padStart(2, '0');
}

function extractDocCodeParts(docCode: string) {
	const match = docCode.trim().toUpperCase().match(/^([A-Z]+)-([A-Z]+)-(\d+)/);
	if (!match) return null;

	return {
		docType: match[1],
		departmentCode: match[2],
		runningNo: Number(match[3])
	};
}

async function resolveDepartmentIdByIsoSectionCode(isoSectionCode: string): Promise<number | null> {
	const normalizedCode = isoSectionCode.trim().toUpperCase();
	const [isoRows] = await pool.execute<IsoSection[]>(
		`SELECT id, code, name_th, name_en
		 FROM iso_sections
		 WHERE UPPER(code) = ?
		 LIMIT 1`,
		[normalizedCode]
	);

	if (isoRows.length === 0) return null;
	const section = isoRows[0];

	const [departmentRows] = await pool.execute<Department[]>(
		`SELECT id, name
		 FROM departments
		 WHERE UPPER(name) LIKE ?
		    OR UPPER(name) = UPPER(?)
		    OR UPPER(name) = UPPER(?)
		 ORDER BY id ASC
		 LIMIT 1`,
		[`%(${normalizedCode})%`, section.name_th || '', section.name_en || '']
	);

	if (departmentRows.length > 0) return Number(departmentRows[0].id);

	const generatedName = section.name_en
		? `${section.name_en} (${section.code})`
		: section.name_th
			? `${section.name_th} (${section.code})`
			: section.code;

	try {
		const [insertResult] = await pool.execute(`INSERT INTO departments (name) VALUES (?)`, [generatedName]);
		return Number((insertResult as any).insertId || 0);
	} catch (err: any) {
		if (err?.code === 'ER_DUP_ENTRY') {
			const [retryRows] = await pool.execute<Department[]>(
				`SELECT id, name FROM departments WHERE UPPER(name) = UPPER(?) LIMIT 1`,
				[generatedName]
			);
			if (retryRows.length > 0) return Number(retryRows[0].id);
		}
		throw err;
	}
}

async function upsertDocumentRunningMaster(docType: string, departmentCode: string, runningNo: number) {
	await pool.execute(
		`INSERT INTO document_running_masters
		 (doc_type, department_code, last_running_no)
		 VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE
		 last_running_no = GREATEST(last_running_no, VALUES(last_running_no)),
		 updated_at = CURRENT_TIMESTAMP`,
		[docType, departmentCode, runningNo]
	);
}

async function parseImportFile(file: File): Promise<ParsedImportRow[]> {
	const fileName = file.name.toLowerCase();

	if (fileName.endsWith('.xlsx')) {
		const workbook = new ExcelJS.Workbook();
		const workbookData: any = new Uint8Array(await file.arrayBuffer());
		await workbook.xlsx.load(workbookData);

		const worksheet = workbook.worksheets[0];
		if (!worksheet) return [];

		const headerRow = worksheet.getRow(1);
		const headerMap = new Map<string, number>();
		headerRow.eachCell((cell, colNumber) => {
			headerMap.set(normalizeHeader(String(cell.value || '')), colNumber);
		});

		const docCodeCol = headerMap.get('documentcode');
		const docNameCol = headerMap.get('documentname');
		const revCol = headerMap.get('rev') || headerMap.get('rev00') || headerMap.get('revision');
		const effectiveDateCol = headerMap.get('effectivedate');

		if (!docCodeCol || !revCol || !effectiveDateCol) {
			throw new Error('Import file must contain Document code, Rev, and Effective Date columns.');
		}

		const rows: ParsedImportRow[] = [];
		worksheet.eachRow((row, rowNumber) => {
			if (rowNumber === 1) return;
			const docCode = String(row.getCell(docCodeCol).value || '').trim();
			const docName = docNameCol ? String(row.getCell(docNameCol).value || '').trim() : '';
			const revision = parseRevision(String(row.getCell(revCol).value || ''));
			const effectiveDate = parseEffectiveDate(row.getCell(effectiveDateCol).value as string | Date);

			if (docCode && effectiveDate) {
				rows.push({
					docCode,
					docName: docName || docCode,
					revision,
					effectiveDate
				});
			}
		});

		return rows;
	}

	const text = await file.text();
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	if (lines.length === 0) return [];

	if (lines[0].includes('|')) {
		return lines.map((line) => {
			const parts = line.split('|').map((p) => p.trim());
			return {
				docCode: parts[0] || '',
				docName: parts[1] || '',
				revision: parseRevision(parts[2] || ''),
				effectiveDate: parseEffectiveDate(parts[3] || parts[2] || '') || ''
			};
		}).filter((row) => row.docCode && row.effectiveDate);
	}

	const delimiter = lines[0].includes('\t') ? '\t' : ',';
	const header = parseDelimitedLine(lines[0], delimiter).map(normalizeHeader);
	const docCodeIndex = header.findIndex((h) => h === 'documentcode');
	const docNameIndex = header.findIndex((h) => h === 'documentname');
	const revIndex = header.findIndex((h) => h === 'rev' || h === 'rev00' || h === 'revision');
	const effectiveDateIndex = header.findIndex((h) => h === 'effectivedate');

	if (docCodeIndex === -1 || revIndex === -1 || effectiveDateIndex === -1) {
		throw new Error('Import file must contain Document code, Rev, and Effective Date columns.');
	}

	return lines.slice(1)
		.map((line) => parseDelimitedLine(line, delimiter))
		.map((cols) => ({
			docCode: cols[docCodeIndex] || '',
			docName: docNameIndex >= 0 ? cols[docNameIndex] || '' : '',
			revision: parseRevision(cols[revIndex] || ''),
			effectiveDate: parseEffectiveDate(cols[effectiveDateIndex] || '') || ''
		}))
		.map((row) => ({ ...row, docName: row.docName || row.docCode }))
		.filter((row) => row.docCode && row.effectiveDate);
}

export const load: PageServerLoad = async () => {
	try {
		// Fetch all documents with department names + iso section by BB code
		const [documents] = await pool.execute<DocumentMaster[]>(`
			SELECT 
				dml.id,
				dml.doc_code,
				dml.doc_name,
				dml.doc_type,
				dml.department_id,
				d.name as department_name,
				SUBSTRING_INDEX(SUBSTRING_INDEX(dml.doc_code, '-', 2), '-', -1) AS iso_section_code,
				isec.name_th AS iso_section_name_th,
				isec.name_en AS iso_section_name_en,
				dml.current_revision,
				dml.effective_date,
				dml.status,
				dml.description,
				dml.attached_file_original_name,
				dml.attached_file_system_name
			FROM document_master_list dml
			LEFT JOIN departments d ON dml.department_id = d.id
			LEFT JOIN iso_sections isec
				ON (isec.code COLLATE utf8mb4_unicode_ci) =
				   (SUBSTRING_INDEX(SUBSTRING_INDEX(dml.doc_code, '-', 2), '-', -1) COLLATE utf8mb4_unicode_ci)
			WHERE LOWER(TRIM(COALESCE(dml.status, ''))) IN ('active', 'inactive', 'draft', 'obsolete', 'superseded')
			ORDER BY isec.code ASC, dml.doc_code ASC
		`);

		// Fetch all ISO sections for BB filter
		const [isoSections] = await pool.execute<IsoSection[]>(`
			SELECT id, code, name_th, name_en FROM iso_sections ORDER BY code ASC
		`);

		let documentTypeRefs: DocTypeRef[] = [];
		try {
			const [aaRows] = await pool.execute<RowDataPacket[]>(
				`SELECT code, name_th, name_en FROM document_aa_types ORDER BY display_order ASC, code ASC`
			);
			if (aaRows?.length) {
				documentTypeRefs = aaRows.map((r) => ({
					code: String(r.code),
					name_th: String(r.name_th ?? ''),
					name_en: String(r.name_en ?? '')
				}));
			}
		} catch {
			// document_aa_types may not exist yet
		}
		if (documentTypeRefs.length === 0) {
			documentTypeRefs = [...FALLBACK_DOC_TYPE_REFS];
		}

		return {
			documents: documents || [],
			isoSections: isoSections || [],
			documentTypeRefs
		};
	} catch (error) {
		console.error('Error loading document list:', error);
		return {
			documents: [],
			isoSections: [],
			documentTypeRefs: [...FALLBACK_DOC_TYPE_REFS],
			error: 'Failed to load document master list'
		};
	}
};

export const actions: Actions = {
	create: async ({ request }) => {
		try {
			const formData = await request.formData();
			const docCode = String(formData.get('doc_code') || '').trim().toUpperCase();
			const docName = String(formData.get('doc_name') || '').trim();
			const revision = parseRevision(String(formData.get('current_revision') || '00'));
			const effectiveDate = parseEffectiveDate(String(formData.get('effective_date') || ''));
			const status = String(formData.get('status') || 'active').trim().toLowerCase();
			const descriptionRaw = String(formData.get('description') || '').trim();
			const fileField = formData.get('file');
			const attachment =
				fileField instanceof File && fileField.size > 0 ? fileField : null;
			if (attachment) {
				const fileErr = validateMasterFile(attachment);
				if (fileErr) {
					return fail(400, { success: false, error: fileErr });
				}
			}

			const parsedCode = extractDocCodeParts(docCode);
			if (!parsedCode) {
				return fail(400, { success: false, error: 'Invalid document code. Expected format: AA-BB-NN...' });
			}

			if (!docName) {
				return fail(400, { success: false, error: 'Document name is required' });
			}

			if (!effectiveDate) {
				return fail(400, { success: false, error: 'Effective date is required' });
			}

			if (!['active', 'inactive'].includes(status)) {
				return fail(400, { success: false, error: 'Invalid status value' });
			}

			const departmentId = await resolveDepartmentIdByIsoSectionCode(parsedCode.departmentCode);

			if (!departmentId) {
				return fail(400, {
					success: false,
					error: `Iso_Section code ${parsedCode.departmentCode} not found in iso_sections`
				});
			}

			const [insertRes] = await pool.execute<ResultSetHeader>(
				`INSERT INTO document_master_list
				 (doc_code, doc_name, doc_type, department_id, current_revision, effective_date, status, description)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					docCode,
					docName,
					parsedCode.docType,
					departmentId,
					revision,
					effectiveDate,
					status,
					descriptionRaw || null
				]
			);

			await upsertDocumentRunningMaster(
				parsedCode.docType,
				parsedCode.departmentCode,
				parsedCode.runningNo
			);

			if (attachment) {
				const newId = Number(insertRes.insertId || 0);
				if (newId > 0) {
					try {
						const { systemName, originalName } = await saveMasterFile(attachment);
						await pool.execute(
							`UPDATE document_master_list SET attached_file_original_name = ?, attached_file_system_name = ? WHERE id = ?`,
							[originalName, systemName, newId]
						);
					} catch (attachErr) {
						console.error('Create attachment error:', attachErr);
						return fail(500, { success: false, error: 'Saved master but failed to store file' });
					}
				}
			}

			return { success: true, message: `Saved ${docCode} successfully` };
		} catch (err: any) {
			if (err?.code === 'ER_DUP_ENTRY') {
				return fail(409, {
					success: false,
					error: 'Document with same Doc Code and Revision already exists'
				});
			}
			console.error('Create document master error:', err);
			return fail(500, { success: false, error: 'Failed to save document master' });
		}
	},

	delete: async ({ request }) => {
		try {
			const formData = await request.formData();
			const id = formData.get('id');

			if (!id) {
				return fail(400, { success: false, error: 'Invalid document ID' });
			}

			const [delRows] = await pool.execute<RowDataPacket[]>(
				`SELECT attached_file_system_name FROM document_master_list WHERE id = ? LIMIT 1`,
				[id]
			);
			const prev = delRows[0]?.attached_file_system_name
				? String(delRows[0].attached_file_system_name)
				: null;

			await pool.execute('DELETE FROM document_master_list WHERE id = ?', [id]);
			if (prev) await unlinkMasterFile(prev);

			return { success: true, message: 'Document deleted successfully' };
		} catch (err) {
			console.error('Delete error:', err);
			return fail(500, { success: false, error: 'Failed to delete document' });
		}
	},

	updateStatus: async ({ request }) => {
		try {
			const formData = await request.formData();
			const id = formData.get('id');
			const status = String(formData.get('status') || '').trim().toLowerCase();

			if (!id) {
				return fail(400, { success: false, error: 'Invalid document ID' });
			}

			if (!['active', 'inactive'].includes(status)) {
				return fail(400, { success: false, error: 'Invalid status value' });
			}

			const [res] = await pool.execute(
				`UPDATE document_master_list SET status = ? WHERE id = ?`,
				[status, id]
			);

			const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
			if (affected === 0) {
				return fail(404, { success: false, error: 'Document not found' });
			}

			return { success: true, message: 'Status updated' };
		} catch (err) {
			console.error('updateStatus error:', err);
			return fail(500, { success: false, error: 'Failed to update status' });
		}
	},

	uploadFile: async ({ request }) => {
		try {
			const formData = await request.formData();
			const id = formData.get('id');
			const fileField = formData.get('file');
			if (!id) {
				return fail(400, { success: false, error: 'Invalid document ID' });
			}
			const file = fileField instanceof File && fileField.size > 0 ? fileField : null;
			if (!file) {
				return fail(400, { success: false, error: 'No file provided' });
			}
			const fileErr = validateMasterFile(file);
			if (fileErr) {
				return fail(400, { success: false, error: fileErr });
			}

			const [rows] = await pool.execute<RowDataPacket[]>(
				`SELECT id, attached_file_system_name FROM document_master_list WHERE id = ? LIMIT 1`,
				[id]
			);
			if (!rows.length) {
				return fail(404, { success: false, error: 'Document not found' });
			}
			const prev = rows[0].attached_file_system_name
				? String(rows[0].attached_file_system_name)
				: null;
			const { systemName, originalName } = await saveMasterFile(file);
			await pool.execute(
				`UPDATE document_master_list SET attached_file_original_name = ?, attached_file_system_name = ? WHERE id = ?`,
				[originalName, systemName, id]
			);
			if (prev) await unlinkMasterFile(prev);

			return { success: true, message: 'File uploaded' };
		} catch (err) {
			console.error('uploadFile error:', err);
			return fail(500, { success: false, error: 'Failed to upload file' });
		}
	},

	removeFile: async ({ request }) => {
		try {
			const formData = await request.formData();
			const id = formData.get('id');
			if (!id) {
				return fail(400, { success: false, error: 'Invalid document ID' });
			}

			const [rows] = await pool.execute<RowDataPacket[]>(
				`SELECT attached_file_system_name FROM document_master_list WHERE id = ? LIMIT 1`,
				[id]
			);
			if (!rows.length) {
				return fail(404, { success: false, error: 'Document not found' });
			}
			const sys = rows[0].attached_file_system_name
				? String(rows[0].attached_file_system_name)
				: null;
			if (!sys) {
				return { success: true, message: 'No file to remove' };
			}

			await pool.execute(
				`UPDATE document_master_list SET attached_file_original_name = NULL, attached_file_system_name = NULL WHERE id = ?`,
				[id]
			);
			await unlinkMasterFile(sys);

			return { success: true, message: 'File removed' };
		} catch (err) {
			console.error('removeFile error:', err);
			return fail(500, { success: false, error: 'Failed to remove file' });
		}
	},

	import: async ({ request }) => {
		try {
			const formData = await request.formData();
			const file = formData.get('file') as File;

			if (!file) {
				return fail(400, { success: false, error: 'No file provided' });
			}

			const rows = await parseImportFile(file);

			if (rows.length === 0) {
				return fail(400, { success: false, error: 'No valid rows found in import file' });
			}

			let importedCount = 0;
			const errors: string[] = [];

			for (let i = 0; i < rows.length; i++) {
				const row = rows[i];

				try {
					const parsedCode = extractDocCodeParts(row.docCode);
					if (!parsedCode) {
						errors.push(`Row ${i + 2}: Invalid document code format (${row.docCode})`);
						continue;
					}

					const departmentId = await resolveDepartmentIdByIsoSectionCode(parsedCode.departmentCode);
					if (!departmentId) {
						errors.push(
							`Row ${i + 2}: Iso_Section code ${parsedCode.departmentCode} not found in iso_sections`
						);
						continue;
					}

					await pool.execute(
						`INSERT INTO document_master_list 
						(doc_code, doc_name, doc_type, department_id, current_revision, effective_date, status)
						VALUES (?, ?, ?, ?, ?, ?, 'active')
						ON DUPLICATE KEY UPDATE 
						doc_type = VALUES(doc_type),
						department_id = VALUES(department_id),
						current_revision = VALUES(current_revision),
						effective_date = VALUES(effective_date)`,
						[
							row.docCode,
							row.docName || row.docCode,
							parsedCode.docType,
							departmentId,
							row.revision,
							row.effectiveDate
						]
					);

					await upsertDocumentRunningMaster(
						parsedCode.docType,
						parsedCode.departmentCode,
						parsedCode.runningNo
					);

					importedCount++;
				} catch (lineErr) {
					errors.push(`Row ${i + 2}: ${String(lineErr)}`);
				}
			}

			return {
				success: true,
				message: `Imported ${importedCount} documents`,
				errors: errors.length > 0 ? errors : undefined
			};
		} catch (err) {
			console.error('Import error:', err);
			return fail(500, { success: false, error: 'Failed to import documents' });
		}
	}
};
