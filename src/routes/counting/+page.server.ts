import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';

// --- Types ---
interface Activity extends RowDataPacket {
	id: number;
	name: string;
	start_date: string;
	end_date: string | null;
	status: 'Pending' | 'In Progress' | 'Completed';
	user_id: number;
	full_name: string;
	location_id: number | null;
	location_name: string | null;
	category_id: number | null;
	category_name: string | null;
}

interface Location extends RowDataPacket {
	id: number;
	name: string;
}

interface Category extends RowDataPacket {
	id: number;
	name: string;
}

interface ScanResult extends RowDataPacket {
	asset_tag: string;
	scanned_at: string;
	full_name: string; // Scanned By User
	found_status: 'Found' | 'Unrecorded' | 'Duplicate';
	asset_name: string | null;
}

// --- CORRECTED File Handling Helpers ---
async function saveImage(imageFile: File): Promise<string | null> {
	if (!imageFile || imageFile.size === 0) {
		return null;
	}
	try {
		// Log the file size for debugging upload issues on mobile
		console.log(`Attempting to save image: ${imageFile.name}, size: ${imageFile.size} bytes`);
		
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		const filename = `${uniqueSuffix}-${imageFile.name}`;
		const uploadDir = path.join(process.cwd(), 'uploads');
		await fs.mkdir(uploadDir, { recursive: true });
		const uploadPath = path.join(uploadDir, filename);
		
		// Use file.arrayBuffer() which can fail for very large files on memory-constrained servers
		await fs.writeFile(uploadPath, Buffer.from(await imageFile.arrayBuffer()));
		
		console.log(`Image saved successfully: ${uploadPath}`);
		return `/uploads/${filename}`;
	} catch (error) {
		// Catch specific file-related errors, which might be related to mobile file size
		console.error('Error handling file upload in saveImage:', error);
		// Throw a specific error message that can be caught by the action handler
		throw new Error('File processing failed, possibly due to file size or memory limit.');
	}
}

async function deleteImage(imageUrl: string | null | undefined) {
	if (!imageUrl) return;
	try {
		const filename = path.basename(imageUrl);
		const imagePath = path.join(process.cwd(), 'uploads', filename);
		await fs.unlink(imagePath);
	} catch (error: any) {
		if (error.code !== 'ENOENT') { 
			console.error('Failed to delete image file:', error);
		}
	}
}


// --- Load Function ---
/**
 * Loads all counting activities, locations, categories and users.
 */
export const load: PageServerLoad = async () => {
	try {
		const [activityRows] = await pool.execute<Activity[]>(`
            SELECT 
                aca.id, aca.name, aca.start_date, aca.end_date, aca.status, aca.user_id, aca.location_id, aca.category_id,
                u.full_name,
                al.name AS location_name,
                ac.name AS category_name
            FROM asset_counting_activities aca
            JOIN users u ON aca.user_id = u.id
            LEFT JOIN asset_locations al ON aca.location_id = al.id
            LEFT JOIN asset_categories ac ON aca.category_id = ac.id
            ORDER BY aca.id DESC
        `);

		const [locationRows] = await pool.execute<Location[]>('SELECT id, name FROM asset_locations ORDER BY name');
		const [categoryRows] = await pool.execute<Category[]>('SELECT id, name FROM asset_categories ORDER BY name');
		const [userRows] = await pool.execute('SELECT id, full_name FROM users ORDER BY full_name');
        
        const activities = activityRows.map(activity => ({
            ...activity,
            start_date: activity.start_date ? new Date(activity.start_date).toISOString() : '',
            end_date: activity.end_date ? new Date(activity.end_date).toISOString() : null,
        }));


		return {
			activities,
			locations: locationRows,
			categories: categoryRows,
			users: userRows
		};
	} catch (err) {
		console.error('Failed to load counting data:', err);
		throw error(500, { message: 'Failed to load counting data from the server.' });
	}
};

// --- Actions ---
export const actions: Actions = {
	/**
	 * Action to create a new counting activity (Header).
	 */
	createActivity: async ({ request, locals }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString();
		const location_id = data.get('location_id')?.toString();
		const category_id = data.get('category_id')?.toString();

		if (!name || !locals.user) {
			return fail(400, { success: false, message: 'กรุณากรอกชื่อกิจกรรม' });
		}

		try {
			const [result] = await pool.execute(
				`INSERT INTO asset_counting_activities (name, user_id, location_id, category_id, status) 
				 VALUES (?, ?, ?, ?, 'In Progress')`,
				[
					name,
					locals.user.id,
					location_id ? parseInt(location_id) : null,
					category_id ? parseInt(category_id) : null
				]
			);
			const insertId = (result as any).insertId;

			return { success: true, message: 'สร้างกิจกรรมสำเร็จ! เริ่มนับได้เลย', activityId: insertId };
		} catch (error) {
			console.error('Database error on creating activity:', error);
			return fail(500, { success: false, message: 'ไม่สามารถสร้างกิจกรรมการนับได้' });
		}
	},

    /**
     * Action to process an Asset Tag scan.
     */
    scanAsset: async ({ request, locals }) => {
        const data = await request.formData();
        const activity_id = data.get('activity_id')?.toString();
        const asset_tag = data.get('asset_tag')?.toString().trim().toUpperCase();

        if (!activity_id || !asset_tag || !locals.user) {
            return fail(400, { success: false, message: 'ข้อมูลไม่ครบถ้วน', assetTag: asset_tag });
        }

        const activityId = parseInt(activity_id);
        const userId = locals.user.id;
        
        try {
            const [duplicateRows] = await pool.execute<RowDataPacket[]>(
                'SELECT id FROM asset_counting_scans WHERE activity_id = ? AND asset_tag = ? LIMIT 1',
                [activityId, asset_tag]
            );

            if (duplicateRows.length > 0) {
                return fail(409, { success: false, isDuplicate: true, assetTag: asset_tag });
            }

            const [assetRows] = await pool.execute<RowDataPacket[]>(
                `SELECT
                    a.id, a.name, a.image_url, a.status,
                    a.category_id, a.location_id, a.assigned_to_user_id,
                    ac.name AS category_name,
                    al.name AS location_name,
                    u.full_name AS assigned_user_name
                 FROM assets a
                 LEFT JOIN asset_categories ac ON a.category_id = ac.id
                 LEFT JOIN asset_locations al ON a.location_id = al.id
                 LEFT JOIN users u ON a.assigned_to_user_id = u.id
                 WHERE a.asset_tag = ? LIMIT 1`,
                [asset_tag]
            );
            const assetFound = assetRows.length > 0;
            const assetDetails = assetFound ? assetRows[0] : null;

            const foundStatus: 'Found' | 'Unrecorded' = assetFound ? 'Found' : 'Unrecorded';

            await pool.execute(
                `INSERT INTO asset_counting_scans 
                 (activity_id, asset_tag, scanned_by_user_id, asset_id, found_status) 
                 VALUES (?, ?, ?, ?, ?)`,
                [activityId, asset_tag, userId, assetDetails?.id ?? null, foundStatus]
            );
            
            const message = assetFound 
                ? `นับสำเร็จ: ${asset_tag} (${assetDetails.name})`
                : `แท็กไม่พบในระบบ: ${asset_tag}`;

            return { 
                success: true, 
                message, 
                foundStatus, 
                assetTag: asset_tag, 
                scannedAsset: assetDetails
            };

        } catch (error: any) {
            console.error('Database error on scanning asset:', error);
             if (error.code === 'ER_DUP_ENTRY') {
                return fail(409, { success: false, isDuplicate: true, assetTag: asset_tag });
             }
            return fail(500, { success: false, message: 'ไม่สามารถบันทึกผลการสแกนได้', assetTag: asset_tag });
        }
    },

	/**
	 * Action to update an asset's details and optionally its image from the counting modal.
	 */
	updateScannedAsset: async ({ request }) => {
        const data = await request.formData();
        const asset_id = data.get('asset_id')?.toString();
        const category_id = data.get('category_id')?.toString();
        const location_id = data.get('location_id')?.toString();
        const assigned_to_user_id = data.get('assigned_to_user_id')?.toString();
        const status = data.get('status')?.toString();
        const imageFile = data.get('image') as File;

        if (!asset_id) {
            return fail(400, { success: false, message: 'Asset ID ไม่ถูกต้อง', updateError: true });
        }

        try {
            let imageUrl: string | undefined | null = undefined;

            if (imageFile && imageFile.size > 0) {
                const [rows]: any[] = await pool.execute('SELECT image_url FROM assets WHERE id = ?', [asset_id]);
                const existingImageUrl = rows.length > 0 ? rows[0].image_url : null;
                
                try {
                    // CATCH file upload error here
                    imageUrl = await saveImage(imageFile);
                    await deleteImage(existingImageUrl);
                } catch (e: any) {
                     console.error('File upload failed during updateScannedAsset:', e);
                     // Return a specific failure message for the client to display
                     return fail(500, { 
                        success: false, 
                        message: `อัปโหลดรูปภาพล้มเหลว: ${e.message} (อาจเป็นเพราะไฟล์มีขนาดใหญ่เกินไป)`, 
                        updateError: true 
                    });
                }
            }

            const updateFields: string[] = [];
            const params: (string | number | null)[] = [];
            const validStatuses = ['In Use', 'In Storage', 'Under Maintenance', 'Disposed'];

            updateFields.push('category_id = ?');
            params.push(category_id ? parseInt(category_id) : null);
            
            updateFields.push('location_id = ?');
            params.push(location_id ? parseInt(location_id) : null);

            updateFields.push('assigned_to_user_id = ?');
            params.push(assigned_to_user_id ? parseInt(assigned_to_user_id) : null);
            
            if (status && validStatuses.includes(status)) {
                updateFields.push('status = ?');
                params.push(status);
            }

            if (imageUrl !== undefined) {
                updateFields.push('image_url = ?');
                params.push(imageUrl);
            }

            if (updateFields.length > 0) {
                const query = `UPDATE assets SET ${updateFields.join(', ')} WHERE id = ?`;
                params.push(parseInt(asset_id));
                await pool.execute(query, params);
            }
            
            return { success: true, detailsUpdated: true, message: 'อัปเดตข้อมูลสินทรัพย์สำเร็จ' };

        } catch (error) {
            console.error('Error updating asset details:', error);
            // General database error
            return fail(500, { success: false, message: 'ไม่สามารถอัปเดตข้อมูลสินทรัพย์ได้ (เกิดข้อผิดพลาดฐานข้อมูล)', updateError: true });
        }
    },

	/**
	 * Action to add a new asset that was found during a count (Unrecorded).
	 */
	addUnrecordedAsset: async ({ request }) => {
        const data = await request.formData();
        
        const activity_id = data.get('activity_id')?.toString();
        const asset_tag = data.get('asset_tag')?.toString();
        const name = data.get('name')?.toString();
        const category_id = data.get('category_id')?.toString();
        const location_id = data.get('location_id')?.toString();
        const assigned_to_user_id = data.get('assigned_to_user_id')?.toString();
        const purchase_date = data.get('purchase_date')?.toString();
        const purchase_cost = data.get('purchase_cost')?.toString();
        const notes = data.get('notes')?.toString() ?? '';
        const imageFile = data.get('image') as File;

        if (!activity_id || !asset_tag || !name || !category_id || !purchase_date || !purchase_cost) {
            return fail(400, { 
                success: false, 
                message: 'กรุณากรอกข้อมูลที่จำเป็นทั้งหมด (ชื่อ, หมวดหมู่, วันที่ซื้อ, มูลค่า)', 
                unrecordedAddError: true 
            });
        }
        
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            let imageUrl = null;
            if (imageFile && imageFile.size > 0) {
                try {
                     // CATCH file upload error here
                     imageUrl = await saveImage(imageFile);
                } catch (e: any) {
                    await connection.rollback(); // Rollback DB transaction since file failed
                    console.error('File upload failed during unrecorded asset add:', e);
                    // Return a specific failure message for the client to display
                    return fail(500, { 
                        success: false, 
                        message: `อัปโหลดรูปภาพล้มเหลว: ${e.message} (อาจเป็นเพราะไฟล์มีขนาดใหญ่เกินไป)`, 
                        unrecordedAddError: true 
                    });
                }
            }
            
            const [insertResult] = await connection.execute(
				`INSERT INTO assets (name, asset_tag, category_id, location_id, assigned_to_user_id, status, purchase_date, purchase_cost, notes, image_url) 
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					name,
					asset_tag,
					parseInt(category_id),
					location_id ? parseInt(location_id) : null,
					assigned_to_user_id ? parseInt(assigned_to_user_id) : null,
					'In Storage',
					purchase_date,
					parseFloat(purchase_cost),
					notes,
					imageUrl
				]
			);
            
            const newAssetId = (insertResult as any).insertId;

            await connection.execute(
                `UPDATE asset_counting_scans 
                 SET asset_id = ?, found_status = 'Found' 
                 WHERE activity_id = ? AND asset_tag = ?`,
                [newAssetId, parseInt(activity_id), asset_tag]
            );

            await connection.commit();

            return { success: true, unrecordedAdded: true, message: `เพิ่มสินทรัพย์ ${asset_tag} สำเร็จ` };

        } catch (error: any) {
            await connection.rollback();
            console.error('Database error on adding unrecorded asset:', error);
			if (error.code === 'ER_DUP_ENTRY') {
				return fail(409, { success: false, message: 'Asset Tag นี้มีอยู่ในระบบแล้ว', unrecordedAddError: true });
			}
            return fail(500, { success: false, message: 'ไม่สามารถเพิ่มสินทรัพย์ใหม่ลงในฐานข้อมูลได้ (เกิดข้อผิดพลาดฐานข้อมูล)', unrecordedAddError: true });
        } finally {
            connection.release();
        }
    },

	/**
	 * Action to Settle / Complete a counting activity.
	 * This marks the activity as 'Completed' and updates the status of any
	 * missing assets within the activity's scope to 'Disposed'.
	 */
	settleActivity: async ({ request, locals }) => {
		const data = await request.formData();
		const activity_id = data.get('activity_id')?.toString();

		if (!activity_id || !locals.user) {
			return fail(400, { success: false, message: 'ข้อมูลไม่ครบถ้วน' });
		}
		const activityId = parseInt(activity_id);
		const connection = await pool.getConnection();

		try {
			await connection.beginTransaction();

			// 1. Fetch activity details to determine the scope
			const [activityRows] = await connection.execute<Activity[]>(
				'SELECT location_id, category_id FROM asset_counting_activities WHERE id = ?',
				[activityId]
			);
			const activity = activityRows[0];
			if (!activity) {
				throw new Error('ไม่พบกิจกรรมการนับ');
			}

			// 2. Determine the scope of expected assets based on activity filters
			let scopeWhereClause = ' WHERE status != "Disposed"';
			const scopeParams: (string | number)[] = [];

			if (activity.location_id) {
				scopeWhereClause += ' AND location_id = ?';
				scopeParams.push(activity.location_id);
			}
			if (activity.category_id) {
				scopeWhereClause += ' AND category_id = ?';
				scopeParams.push(activity.category_id);
			}

			const [expectedAssets] = await connection.execute<RowDataPacket[]>(
				`SELECT asset_tag FROM assets ${scopeWhereClause}`,
				scopeParams
			);
			const expectedTags = new Set(expectedAssets.map((a) => a.asset_tag));

			// 3. Get all unique asset tags scanned in this activity
			const [scannedAssets] = await connection.execute<RowDataPacket[]>(
				'SELECT DISTINCT asset_tag FROM asset_counting_scans WHERE activity_id = ?',
				[activityId]
			);
			const scannedTags = new Set(scannedAssets.map((s) => s.asset_tag));

			// 4. Find missing tags (in expected but not in scanned)
			const missingTags = [...expectedTags].filter((tag) => !scannedTags.has(tag));

			// 5. Update status of missing assets to 'Disposed'
			if (missingTags.length > 0) {
				await connection.query(
                    'UPDATE assets SET status = "Disposed" WHERE asset_tag IN (?)',
                    [missingTags]
                );
			}

			// 6. Update the activity status to 'Completed'
			await connection.execute(
				"UPDATE asset_counting_activities SET status = 'Completed', end_date = NOW() WHERE id = ?",
				[activityId]
			);

			await connection.commit();

			return { success: true, settleSuccess: true, message: 'ปิดกิจกรรมและปรับสถานะสินทรัพย์ที่ขาดหายสำเร็จ' };
		} catch (error) {
			await connection.rollback();
			console.error('Database error on settling activity:', error);
			return fail(500, { success: false, message: 'เกิดข้อผิดพลาดในการปิดกิจกรรม' });
		} finally {
			connection.release();
		}
	},
    
    /**
     * Action to load the detailed scan results for a specific activity ID
     */
    loadScans: async ({ request }) => {
        const data = await request.formData();
        const activity_id = data.get('activity_id')?.toString();
        
        if (!activity_id) {
            return fail(400, { success: false, message: 'Activity ID ไม่ถูกต้อง' });
        }

        const activityId = parseInt(activity_id);

        try {
            const [activityRows] = await pool.execute<Activity[]>(
                `SELECT 
                    aca.id, aca.name, aca.start_date, aca.location_id, aca.category_id,
                    al.name AS location_name, ac.name AS category_name
                FROM asset_counting_activities aca
                LEFT JOIN asset_locations al ON aca.location_id = al.id
                LEFT JOIN asset_categories ac ON aca.category_id = ac.id
                WHERE aca.id = ? LIMIT 1`,
                [activityId]
            );
            const activity = activityRows[0];
            if (!activity) {
                return fail(404, { success: false, message: 'ไม่พบกิจกรรม' });
            }
            
            let scopeWhereClause = ' WHERE a.status != "Disposed"';
            const scopeParams: (string | number)[] = [];

            if (activity.location_id) {
                scopeWhereClause += ' AND a.location_id = ?';
                scopeParams.push(activity.location_id);
            }
            if (activity.category_id) {
                scopeWhereClause += ' AND a.category_id = ?';
                scopeParams.push(activity.category_id);
            }

            const [expectedAssets] = await pool.execute<RowDataPacket[]>(
                `SELECT a.asset_tag, a.name 
                 FROM assets a
                 ${scopeWhereClause}
                 ORDER BY a.asset_tag`,
                scopeParams
            );
            
            const [scanRows] = await pool.execute<ScanResult[]>(
                `SELECT 
                    acs.asset_tag, acs.scanned_at, acs.found_status, 
                    u.full_name, a.name as asset_name
                 FROM asset_counting_scans acs
                 JOIN users u ON acs.scanned_by_user_id = u.id
                 LEFT JOIN assets a ON acs.asset_id = a.id
                 WHERE acs.activity_id = ?
                 ORDER BY acs.scanned_at DESC`,
                [activityId]
            );
            
            const scannedTags = new Set(scanRows.map(s => s.asset_tag));
            const missingAssets = expectedAssets.filter(asset => !scannedTags.has(asset.asset_tag));
            
            const formattedScanList = scanRows.map(scan => ({
                ...scan,
                scanned_at: scan.scanned_at ? new Date(scan.scanned_at).toISOString() : ''
            }));

            const scanData = {
                activity: {
                    ...activity,
                    start_date: activity.start_date ? new Date(activity.start_date).toLocaleDateString('th-TH') : ''
                },
                expected: expectedAssets.length,
                scanned: scanRows.filter(s => s.found_status !== 'Duplicate').length,
                missing: missingAssets.length,
                scanList: formattedScanList,
                missingList: missingAssets
            };
            
            return scanData;
            
        } catch (error) {
            console.error('Database error on loading scans:', error);
            return fail(500, { success: false, message: 'ไม่สามารถดึงข้อมูลผลการนับได้' });
        }
    }
};