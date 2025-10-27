import { type Actions, fail } from '@sveltejs/kit';
import db from '$lib/server/database'; // สมมติว่านี่คือ connection pool จากไฟล์ `database.ts` ของคุณ
// **แก้ไข 3: เพิ่ม 'readFile' ในการ import**
import { writeFile, mkdir, unlink, stat, readFile } from 'fs/promises';
import path from 'path';
import mime from 'mime-types'; // ใช้สำหรับหา mime type

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
        u.username as owner_name,
        ct.name as type_name
    FROM contracts c
    LEFT JOIN customers cust ON c.customer_id = cust.id
    LEFT JOIN users u ON c.owner_user_id = u.id
    LEFT JOIN contract_types ct ON c.contract_type_id = ct.id
`;

// Helper: ดึงเอกสารทั้งหมดของสัญญา
async function getContractDocuments(contractId: string | number) {
	// ดึงเอกสารทั้งหมดของสัญญา
	const [documents]: [any[], any] = await db.query(
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
		// ดึงข้อมูลหลัก
		const [
			// @ts-ignore
			contractsResult,
			// @ts-ignore
			customersResult,
			// @ts-ignore
			usersResult,
			// @ts-ignore
			contractTypesResult
		] = await Promise.all([
			db.query(`${getContractQuery} ORDER BY c.created_at DESC`),
			db.query('SELECT id, name FROM customers ORDER BY name ASC'),
			db.query('SELECT id, username as name FROM users ORDER BY username ASC'),
			db.query('SELECT id, name FROM contract_types ORDER BY name ASC')
		]);

		// ดึงเอกสารทั้งหมดสำหรับสัญญาแต่ละฉบับ
		// @ts-ignore
		const contractsWithDocs = await Promise.all(
			contractsResult[0].map(async (c: any) => {
				const documents = await getContractDocuments(c.id);
				return {
					...c,
					documents: documents.map((d: any) => ({
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
			customers: customersResult[0],
			users: usersResult[0],
			contractTypes: contractTypesResult[0]
		};
	} catch (error) {
		console.error('Error loading contracts data:', error);
		return fail(500, {
			error: 'ไม่สามารถโหลดข้อมูลสัญญาได้'
		});
	}
}

export const actions: Actions = {
	/**
	 * Action: สร้างสัญญาใหม่
	 */
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		const files = formData.getAll('contractFiles') as File[]; // รับหลายไฟล์
		// @ts-ignore
		const userId = locals.user?.id || 1;

		// --- 1. ตรวจสอบไฟล์ ---
		const validFiles = files.filter((f) => f && f.size > 0);
		if (validFiles.length === 0) {
			return fail(400, {
				error: 'กรุณาอัปโหลดไฟล์เอกสารสัญญาอย่างน้อย 1 ไฟล์',
				source: 'cud'
			});
		}

		// --- 2. ดึงข้อมูลจาก Form ---
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

		// --- 3. บันทึกลง Database (และอัปโหลดไฟล์) ---
		let newContractId: number | undefined;
		const uploadedFilePaths: string[] = [];
		try {
			// 3.1. Insert into `contracts`
			const contractSql = `
                INSERT INTO contracts
                (title, contract_number, customer_id, contract_type_id, status, start_date, end_date, contract_value, owner_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
			// @ts-ignore
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

			// 3.2. อัปโหลดและบันทึกเอกสารทั้งหมด
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
				uploadedFilePaths.push(fullFilePath); // เก็บ path จริงไว้ในกรณีที่ต้องลบ

				await db.query(docSql, [
					newContractId,
					file.name,
					uniqueFilename, // เก็บเฉพาะชื่อไฟล์ระบบ
					fileMimeType,
					file.size,
					userId
				]);
			}

			// --- 4. ดึงข้อมูลที่สร้างใหม่เพื่อส่งกลับไปอัปเดต UI ---
			// @ts-ignore
			const [newContractRows] = await db.query(`${getContractQuery} WHERE c.id = ?`, [
				newContractId
			]);
			let newContract = newContractRows[0];

			// ดึงเอกสารที่เพิ่งอัปโหลดมาแนบด้วย
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

			// ลบไฟล์ที่อัปโหลดไปแล้วถ้า DB fail
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

	/**
	 * Action: อัปเดตสัญญา
	 */
	update: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;
		const files = formData.getAll('contractFiles') as File[]; // รับหลายไฟล์
		// @ts-ignore
		const userId = locals.user?.id || 1;

		if (!id) {
			return fail(400, { error: 'ไม่พบ ID สัญญา', source: 'cud' });
		}

		const validFiles = files.filter((f) => f && f.size > 0);

		// --- 1. ดึงข้อมูล Form ---
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
			// --- 2. อัปเดตตาราง `contracts` ---
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

			// --- 3. (Optional) อัปโหลดไฟล์ใหม่ (ถ้ามี) ---
			if (validFiles.length > 0) {
				// 3.1. หา version ล่าสุด
				// @ts-ignore
				const [versionRows] = await db.query(
					'SELECT MAX(version) as max_version FROM contract_documents WHERE contract_id = ?',
					[id]
				);
				// @ts-ignore
				const lastVersionResult = versionRows[0];
				const baseVersion = lastVersionResult?.max_version || 0;

				let currentVersion = baseVersion;

				// 3.2. บันทึกไฟล์ใหม่และข้อมูลลง DB
				await ensureUploadDir();
				const docSql = `
                    INSERT INTO contract_documents
                    (contract_id, file_original_name, file_system_name, file_mime_type, file_size_bytes, uploaded_by_user_id, version)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `;

				for (const file of validFiles) {
					currentVersion++; // เพิ่ม version สำหรับไฟล์ถัดไป
					const fileMimeType = mime.lookup(file.name) || file.type || 'application/octet-stream';
					const uniqueFilename = `${crypto.randomUUID()}-${file.name}`;
					const fullFilePath = path.join(UPLOAD_DIR, uniqueFilename);

					await writeFile(fullFilePath, Buffer.from(await file.arrayBuffer()));
					uploadedFilePaths.push(fullFilePath); // เก็บ path จริงไว้ในกรณีที่ต้องลบ

					await db.query(docSql, [
						id,
						file.name,
						uniqueFilename, // เก็บเฉพาะชื่อไฟล์ระบบ
						fileMimeType,
						file.size,
						userId,
						currentVersion
					]);
				}
			}

			// --- 4. ดึงข้อมูลที่อัปเดตแล้วส่งกลับ ---
			// @ts-ignore
			const [updatedContractRows] = await db.query(`${getContractQuery} WHERE c.id = ?`, [id]);
			let updatedContract = updatedContractRows[0];

			// ดึงเอกสารที่อัปโหลดมาแนบด้วย
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

			// ลบไฟล์ที่อัปโหลดไปแล้วถ้า DB fail
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

	/**
	 * Action: ลบสัญญา
	 */
	delete: async ({ request }) => {
		const formData = await request.formData();
		const idString = formData.get('id') as string; // *** FIX 2: รับค่าเป็น string

		if (!idString) {
			return fail(400, { error: 'ไม่พบ ID สัญญา' });
		}

		// *** FIX 2: แปลงเป็นตัวเลขและตรวจสอบ ***
		const id = parseInt(idString, 10);
		if (isNaN(id)) {
			return fail(400, { error: 'ID สัญญาไม่ถูกต้อง' });
		}

		try {
			// --- 1. ดึงรายการไฟล์ที่เกี่ยวข้องทั้งหมด ---
			// @ts-ignore
			const [files]: [{ file_system_name: string }[]] = await db.query(
				'SELECT file_system_name FROM contract_documents WHERE contract_id = ?',
				[id] // ใช้ id (number)
			);

			// --- 2. ลบข้อมูลจาก Database ---
			// การลบจาก `contracts` ควรจะลบ `contract_documents` ด้วย (ON DELETE CASCADE)
			await db.query('DELETE FROM contracts WHERE id = ?', [id]); // ใช้ id (number)

			// --- 3. ลบไฟล์ออกจาก Disk (ใช้ file_system_name ที่เป็น Unique ID) ---
			for (const file of files) {
				if (file.file_system_name) {
					try {
						const fullPath = path.join(UPLOAD_DIR, file.file_system_name);
						await unlink(fullPath);
					} catch (e) {
						// ถ้าไฟล์ไม่มี (ENOENT) ก็ไม่เป็นไร
						// @ts-ignore
						if (e.code !== 'ENOENT') {
							console.error(`Failed to delete file: ${file.file_system_name}`, e);
						}
					}
				}
			}

			// *** FIX 2: ส่ง id (number) กลับไป ***
			return { success: true, source: 'delete', deletedId: id };
		} catch (e) {
			console.error('Failed to delete contract:', e);
			return fail(500, { error: 'ลบสัญญาไม่สำเร็จ' });
		}
	},

	/**
	 * Action: ดาวน์โหลดเอกสารสัญญา
	 */
	download: async ({ url }) => {
		const fileSystemName = url.searchParams.get('file');
		const originalFileName = url.searchParams.get('name');

		// *** FIX 1: ตรวจสอบ Path Traversal ***
		// 1. ใช้ path.basename เพื่อเอาเฉพาะชื่อไฟล์
		const safeFileName = path.basename(fileSystemName as string);

		// 2. ตรวจสอบว่ามีข้อมูลครบถ้วน และไฟล์ที่ขอมา (fileSystemName) ตรงกับชื่อไฟล์ที่ปลอดภัย (safeFileName)
		// ถ้าไม่ตรงกัน แสดงว่ามีการพยายามใช้ ../ ใน path
		if (!fileSystemName || !originalFileName || safeFileName !== fileSystemName) {
			return fail(400, { error: 'ข้อมูลไฟล์ไม่ถูกต้อง หรือไม่ปลอดภัย' });
		}

		// 3. ใช้ชื่อไฟล์ที่ปลอดภัย (safeFileName) ในการสร้าง path
		const fullPath = path.join(UPLOAD_DIR, safeFileName);

		try {
			// ตรวจสอบว่าไฟล์มีอยู่จริง
			const fileStats = await stat(fullPath);
			if (!fileStats.isFile()) {
				return fail(404, { error: 'ไม่พบไฟล์ที่ต้องการดาวน์โหลด' });
			}

			// ดึง mime type
			const mimeType = mime.lookup(originalFileName) || 'application/octet-stream';

			// **แก้ไข 3: เปลี่ยน 'fs.readFile' เป็น 'readFile'**
			// อ่านไฟล์เป็น Buffer
			const fileBuffer = await readFile(fullPath);

			// ส่งไฟล์กลับเป็น Response
			return new Response(fileBuffer, {
				headers: {
					'Content-Type': mimeType,
					// ตั้งชื่อไฟล์ที่จะดาวน์โหลด
					'Content-Disposition': `attachment; filename="${encodeURIComponent(originalFileName)}"`,
					'Content-Length': fileStats.size.toString()
				}
			});
		} catch (e: any) {
			// *** FIX 1: ปรับปรุงการดักจับข้อผิดพลาด ***
			if (e.code === 'ENOENT') {
				console.error('File not found for download:', fullPath);
				return fail(404, { error: 'ไม่พบไฟล์ที่ต้องการดาวน์โหลด' });
			}
			console.error('File download failed:', e);
			return fail(500, { error: 'ไม่สามารถดาวน์โหลดไฟล์ได้' });
		}
	}
};