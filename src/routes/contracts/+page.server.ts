import { type Actions, fail } from '@sveltejs/kit';
import db from '$lib/server/database';
import { writeFile, mkdir, unlink, stat, readFile } from 'fs/promises';
import path from 'path';
import mime from 'mime-types';
import type { RowDataPacket } from 'mysql2';

interface Customer extends RowDataPacket {
	id: number;
	name: string;
}

interface User extends RowDataPacket {
	id: number;
	username: string;
}

interface ContractType extends RowDataPacket {
	id: number;
	name: string;
}

interface ContractDocument extends RowDataPacket {
	id: number;
	file_original_name: string;
	file_system_name: string;
	version: number;
	uploaded_at: string | Date;
}

interface Contract extends RowDataPacket {
	id: number;
	title: string;
	contract_number: string | null;
	customer_id: number | null;
	owner_user_id: number | null;
	contract_type_id: number | null;
	start_date: string | Date | null;
	end_date: string | Date | null;
	value: number | null;
	status: 'Draft' | 'Active' | 'Expired' | 'Terminated';
	description: string | null;
	created_at: string | Date;
	updated_at: string | Date;

	customer_name: string;
	owner_name: string;
	type_name: string;
}

// กำหนด Path สำหรับอัปโหลด: ย้ายไปเก็บที่ root directory ของ Project/uploads/contracts
// **ตามคำขอ: ย้ายไปเก็บที่ uploads/contracts (root directory เดียวกับ Project)**
// ใน SvelteKit, path.resolve('.') จะอ้างถึง root ของ Project
// ใน production จริง ควรจัดการกับ path นี้ให้ดี
const UPLOAD_DIR = path.resolve('uploads', 'contracts');

// Helper function: สร้าง queryสำหรับดึงข้อมูล contract
const getContractQuery = `
    SELECT
        c.*,
        cust.name as customer_name,
        u.username as owner_name, -- [CHECK] ดึงจาก users
        ct.name as type_name
    FROM contracts c
    LEFT JOIN customers cust ON c.customer_id = cust.id
    LEFT JOIN users u ON c.owner_user_id = u.id
    LEFT JOIN contract_types ct ON c.contract_type_id = ct.id
`;

// Helper: ดึงเอกสารทั้งหมดของสัญญา
async function getContractDocuments(contractId: string | number) {
	const [documents] = await db.query<ContractDocument[]>(
		'SELECT id, file_original_name, file_system_name, file_mime_type, file_size_bytes, version, uploaded_at FROM contract_documents WHERE contract_id = ? ORDER BY version DESC',
		[contractId]
	);
	return documents;
}

// Helper: ตรวจสอบและสร้าง directory
async function ensureUploadDir() {
	try {
		await mkdir(UPLOAD_DIR, { recursive: true });
	} catch (e) {
		console.error('Failed to create upload directory:', e);
		throw new Error('Failed to create upload directory');
	}
}

// Helper: แปลงค่าว่างเป็น null
function nullIfEmpty(value: string | number | null | undefined) {
	if (value === '' || value === undefined) {
		return null;
	}
	if (value === 'null') return null; // แปลง 'null' (string) เป็น null
	return value;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
	try {
		// ดึงข้อมูลหลักจากฐานข้อมูล โดยใช้ Promise.all เพื่อความรวดเร็ว
		const [contractsResult, customersResult, usersResult, contractTypesResult] = await Promise.all([
			// ดึงข้อมูลสัญญาพร้อม Join ชื่อลูกค้าและชื่อผู้ดูแล
			db.query<Contract[]>(`${getContractQuery} ORDER BY c.created_at DESC`),

			// ดึงรายชื่อลูกค้าเพื่อใช้ใน Dropdown
			db.query<Customer[]>('SELECT id, name FROM customers ORDER BY name ASC'),

			db.query<User[]>('SELECT id, username FROM users ORDER BY username ASC'),

			// ดึงประเภทสัญญา
			db.query<ContractType[]>('SELECT id, name FROM contract_types ORDER BY name ASC')
		]);

		console.log('--- DEBUG USERS DATA ---');
		console.log('Total Users Found:', usersResult[0].length);
		console.log('First 5 Users:', usersResult[0].slice(0, 5));
		console.log('------------------------');

		// วนลูปเพื่อดึงรายการเอกสารแนบสำหรับสัญญาแต่ละฉบับ
		const contractsWithDocs = await Promise.all(
			contractsResult[0].map(async (c) => {
				const documents = await getContractDocuments(c.id);
				return {
					...c,
					// แปลงรูปแบบข้อมูลเอกสารให้ Frontend ใช้งานได้ง่าย
					documents: documents.map((d) => ({
						id: d.id,
						name: d.file_original_name,
						system_name: d.file_system_name,
						version: d.version,
						uploaded_at: d.uploaded_at
					}))
				};
			})
		);

		return {
			contracts: JSON.parse(JSON.stringify(contractsWithDocs)),
			customers: JSON.parse(JSON.stringify(customersResult[0])),
			users: JSON.parse(JSON.stringify(usersResult[0])),
			contractTypes: JSON.parse(JSON.stringify(contractTypesResult[0]))
		};
	} catch (error) {
		console.error('Error loading contracts data:', error);
		return fail(500, {
			error: 'ไม่สามารถโหลดข้อมูลสัญญาได้'
		});
	}
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		const files = formData.getAll('contractFiles') as File[];
		const userId = locals.user?.id || 1;

		const validFiles = files.filter((f) => f && f.size > 0);
		if (validFiles.length === 0) {
			return fail(400, {
				error: 'กรุณาอัปโหลดไฟล์เอกสารสัญญาอย่างน้อย 1 ไฟล์',
				source: 'cud'
			});
		}

		const data = {
			title: formData.get('title') as string,
			contract_number: nullIfEmpty(formData.get('contract_number') as string),
			customer_id: nullIfEmpty(formData.get('customer_id') as string),
			contract_type_id: nullIfEmpty(formData.get('contract_type_id') as string),
			status: formData.get('status') as string,
			start_date: nullIfEmpty(formData.get('start_date') as string),
			end_date: nullIfEmpty(formData.get('end_date') as string),
			contract_value: nullIfEmpty(formData.get('contract_value') as string),
			owner_user_id: nullIfEmpty(formData.get('owner_user_id') as string)
		};

		let newContractId: number | undefined;
		const uploadedFilePaths: string[] = [];
		try {
			const contractSql = `
                INSERT INTO contracts
                (title, contract_number, customer_id, contract_type_id, status, start_date, end_date, contract_value, owner_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
			const [contractResult] = await db.query(contractSql, [
				data.title,
				data.contract_number,
				data.customer_id,
				data.contract_type_id,
				data.status,
				data.start_date,
				data.end_date,
				data.contract_value,
				data.owner_user_id
			]);

			// @ts-ignore
			newContractId = contractResult.insertId;

			if (!newContractId) {
				throw new Error('Failed to get new contract ID');
			}

			await ensureUploadDir();
			const docSql = `
                INSERT INTO contract_documents
                (contract_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id, version)
                VALUES (?, ?, ?, ?, ?, ?, 1)
            `;

			for (const file of validFiles) {
				const fileMimeType = mime.lookup(file.name) || file.type || 'application/octet-stream';
				const uniqueFilename = `${crypto.randomUUID()}-${file.name}`;
				const fullFilePath = path.join(UPLOAD_DIR, uniqueFilename);

				await writeFile(fullFilePath, Buffer.from(await file.arrayBuffer()));
				uploadedFilePaths.push(fullFilePath);

				await db.query(docSql, [
					newContractId,
					file.name,
					uniqueFilename,
					fileMimeType,
					file.size,
					userId
				]);
			}

			// @ts-ignore
			const [newContractRows] = await db.query<Contract[]>(`${getContractQuery} WHERE c.id = ?`, [
				newContractId
			]);
			let newContract = newContractRows[0];

			const documents = await getContractDocuments(newContractId);
			newContract = {
				...newContract,
				documents: documents.map((d: any) => ({
					id: d.id,
					name: d.file_original_name,
					system_name: d.file_system_name,
					version: d.version,
					uploaded_at: d.uploaded_at
				}))
			};

			return {
				success: true,
				source: 'cud',
				newContract: JSON.parse(JSON.stringify(newContract))
			};
		} catch (e) {
			console.error('Database transaction failed:', e);

			for (const fullPath of uploadedFilePaths) {
				try {
					await unlink(fullPath);
				} catch (unlinkError) {
					console.error('Failed to unlink orphaned file:', unlinkError);
				}
			}

			return fail(500, { error: 'บันทึกข้อมูลสัญญาไม่สำเร็จ', source: 'cud' });
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;
		const files = formData.getAll('contractFiles') as File[];
		// @ts-ignore
		const userId = locals.user?.id || 1;

		if (!id) {
			return fail(400, { error: 'ไม่พบ ID สัญญา', source: 'cud' });
		}

		const validFiles = files.filter((f) => f && f.size > 0);

		const data = {
			title: formData.get('title') as string,
			contract_number: nullIfEmpty(formData.get('contract_number') as string),
			customer_id: nullIfEmpty(formData.get('customer_id') as string),
			contract_type_id: nullIfEmpty(formData.get('contract_type_id') as string),
			status: formData.get('status') as string,
			start_date: nullIfEmpty(formData.get('start_date') as string),
			end_date: nullIfEmpty(formData.get('end_date') as string),
			contract_value: nullIfEmpty(formData.get('contract_value') as string),
			owner_user_id: nullIfEmpty(formData.get('owner_user_id') as string)
		};

		const uploadedFilePaths: string[] = [];
		try {
			const sql = `
                UPDATE contracts SET
                title = ?, contract_number = ?, customer_id = ?, contract_type_id = ?,
                status = ?, start_date = ?, end_date = ?, contract_value = ?, owner_user_id = ?
                WHERE id = ?
            `;
			await db.query(sql, [
				data.title,
				data.contract_number,
				data.customer_id,
				data.contract_type_id,
				data.status,
				data.start_date,
				data.end_date,
				data.contract_value,
				data.owner_user_id,
				id
			]);

			if (validFiles.length > 0) {
				// @ts-ignore
				const [versionRows] = await db.query(
					'SELECT MAX(version) as max_version FROM contract_documents WHERE contract_id = ?',
					[id]
				);
				// @ts-ignore
				const lastVersionResult = versionRows[0];
				const baseVersion = lastVersionResult?.max_version || 0;

				let currentVersion = baseVersion;

				await ensureUploadDir();
				const docSql = `
                    INSERT INTO contract_documents
                    (contract_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id, version)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `;

				for (const file of validFiles) {
					currentVersion++;
					const fileMimeType = mime.lookup(file.name) || file.type || 'application/octet-stream';
					const uniqueFilename = `${crypto.randomUUID()}-${file.name}`;
					const fullFilePath = path.join(UPLOAD_DIR, uniqueFilename);

					await writeFile(fullFilePath, Buffer.from(await file.arrayBuffer()));
					uploadedFilePaths.push(fullFilePath);

					await db.query(docSql, [
						id,
						file.name,
						uniqueFilename,
						fileMimeType,
						file.size,
						userId,
						currentVersion
					]);
				}
			}

			// @ts-ignore
			const [updatedContractRows] = await db.query<Contract[]>(
				`${getContractQuery} WHERE c.id = ?`,
				[id]
			);
			let updatedContract = updatedContractRows[0];

			const documents = await getContractDocuments(id);
			updatedContract = {
				...updatedContract,
				documents: documents.map((d: any) => ({
					id: d.id,
					name: d.file_original_name,
					system_name: d.file_system_name,
					version: d.version,
					uploaded_at: d.uploaded_at
				}))
			};

			return {
				success: true,
				source: 'cud',
				updatedContract: JSON.parse(JSON.stringify(updatedContract))
			};
		} catch (e) {
			console.error('Database update failed:', e);

			for (const fullPath of uploadedFilePaths) {
				try {
					await unlink(fullPath);
				} catch (unlinkError) {
					console.error('Failed to unlink orphaned file after update failure:', unlinkError);
				}
			}

			return fail(500, { error: 'อัปเดตข้อมูลสัญญาไม่สำเร็จ', source: 'cud' });
		}
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const idString = formData.get('id') as string;

		if (!idString) {
			return fail(400, { error: 'ไม่พบ ID สัญญา' });
		}

		const id = parseInt(idString, 10);
		if (isNaN(id)) {
			return fail(400, { error: 'ID สัญญาไม่ถูกต้อง' });
		}

		try {
			// @ts-ignore
			const [files]: [{ file_system_name: string }[]] = await db.query(
				'SELECT file_system_name FROM contract_documents WHERE contract_id = ?',
				[id]
			);

			await db.query('DELETE FROM contracts WHERE id = ?', [id]);

			for (const file of files) {
				if (file.file_system_name) {
					try {
						const fullPath = path.join(UPLOAD_DIR, file.file_system_name);
						await unlink(fullPath);
					} catch (e) {
						// @ts-ignore
						if (e.code !== 'ENOENT') {
							console.error(`Failed to delete file: ${file.file_system_name}`, e);
						}
					}
				}
			}

			return { success: true, source: 'delete', deletedId: id };
		} catch (e) {
			console.error('Failed to delete contract:', e);
			return fail(500, { error: 'ลบสัญญาไม่สำเร็จ' });
		}
	},

	download: async ({ url }) => {
		const fileSystemName = url.searchParams.get('file');
		const originalFileName = url.searchParams.get('name');

		const safeFileName = path.basename(fileSystemName as string);

		if (!fileSystemName || !originalFileName || safeFileName !== fileSystemName) {
			return fail(400, { error: 'ข้อมูลไฟล์ไม่ถูกต้อง หรือไม่ปลอดภัย' });
		}

		const fullPath = path.join(UPLOAD_DIR, safeFileName);

		try {
			const fileStats = await stat(fullPath);
			if (!fileStats.isFile()) {
				return fail(404, { error: 'ไม่พบไฟล์ที่ต้องการดาวน์โหลด' });
			}

			const mimeType = mime.lookup(originalFileName) || 'application/octet-stream';

			const fileBuffer = await readFile(fullPath);
			const uint8Array = new Uint8Array(fileBuffer);

			return new Response(uint8Array, {
				headers: {
					'Content-Type': mimeType,
					'Content-Disposition': `attachment; filename="${encodeURIComponent(originalFileName)}"`,
					'Content-Length': fileStats.size.toString()
				}
			});
		} catch (e: any) {
			if (e.code === 'ENOENT') {
				console.error('File not found for download:', fullPath);
				return fail(404, { error: 'ไม่พบไฟล์ที่ต้องการดาวน์โหลด' });
			}
			console.error('File download failed:', e);
			return fail(500, { error: 'ไม่สามารถดาวน์โหลดไฟล์ได้' });
		}
	}
};
