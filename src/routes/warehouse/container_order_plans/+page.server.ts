import { cymspool } from '$lib/server/database';
import type { PageServerLoad, Actions } from './$types';
import { checkPermission } from '$lib/server/auth';
import { fail } from '@sveltejs/kit';
import ExcelJS from 'exceljs';

export const load: PageServerLoad = async ({ url, locals }) => {
    // ตรวจสอบสิทธิ์การเข้าถึงหน้าเว็บ
    checkPermission(locals, 'view container plans');

    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || 10; 

    // รับพารามิเตอร์สำหรับการค้นหา
    const container_no = url.searchParams.get('container_no') || '';
    const plan_no = url.searchParams.get('plan_no') || '';
    
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); 
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0); 
    
    const defaultStartDate = firstDay.toLocaleDateString('en-CA'); 
    const defaultEndDate = lastDay.toLocaleDateString('en-CA');

    const create_date_start = url.searchParams.get('create_date_start') ?? defaultStartDate;
    const create_date_end = url.searchParams.get('create_date_end') ?? defaultEndDate;

    // สร้างเงื่อนไข Query
    let conditions = ['1=1'];
    let params: any[] = [];

    if (container_no) {
        conditions.push('c.container_no LIKE ?');
        params.push(`%${container_no}%`);
    }
    if (plan_no) {
        conditions.push('cop.plan_no LIKE ?');
        params.push(`%${plan_no}%`);
    }
    
    if (create_date_start && create_date_end) {
        conditions.push('cop.created_at >= ? AND cop.created_at <= ?');
        // เติมเวลาให้ครอบคลุมถึงสิ้นวันของ create_date_end
        params.push(`${create_date_start} 00:00:00`, `${create_date_end} 23:59:59`);
    } else if (create_date_start) {
        conditions.push('cop.created_at >= ?');
        params.push(`${create_date_start} 00:00:00`);
    } else if (create_date_end) {
        conditions.push('cop.created_at <= ?');
        params.push(`${create_date_end} 23:59:59`);
    }

    const whereClause = conditions.join(' AND ');

    // Query สำหรับนับจำนวนข้อมูลทั้งหมด
    const countQuery = `
        SELECT COUNT(*) as total 
        FROM container_order_plans cop
        LEFT JOIN containers c ON cop.container_id = c.id
        WHERE ${whereClause}
    `;

    // Query สำหรับดึงข้อมูลในหน้านั้นๆ (Join table)
    // เพิ่ม CASE สำหรับแปลงสถานะ และดึง container_owner ออกมาด้วย
    const dataQuery = `
        SELECT cop.*, c.container_no, c.size, c.agent, c.container_owner,
            CASE cop.status
                WHEN 1 THEN 'Pending'
                WHEN 2 THEN 'Received'
                WHEN 3 THEN 'Shipped Out'
                WHEN 4 THEN 'Returned'
                ELSE 'Unknown'
            END as status_label
        FROM container_order_plans cop
        LEFT JOIN containers c ON cop.container_id = c.id
        WHERE ${whereClause}
        ORDER BY cop.id DESC
        LIMIT ? OFFSET ?
    `;

    try {
        const [countResult]: any = await cymspool.query(countQuery, params);
        const total = countResult[0]?.total || 0;

        const offset = (page - 1) * pageSize;
        const [data]: any = await cymspool.query(dataQuery, [...params, pageSize, offset]);

        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
            searchParams: {
                container_no,
                plan_no,
                create_date_start,
                create_date_end
            }
        };
    } catch (error) {
        console.error('Error fetching container_order_plans:', error);
        
        return {
            data: [],
            total: 0,
            page,
            pageSize,
            totalPages: 0,
            searchParams: {
                container_no,
                plan_no,
                create_date_start: defaultStartDate,
                create_date_end: defaultEndDate
            }
        };
    }
};

export const actions: Actions = {
    // Action สำหรับการเพิ่มข้อมูลแบบทีละรายการ
    create: async ({ request, locals }) => {
        // ตรวจสอบสิทธิ์การบันทึกข้อมูล
        checkPermission(locals, 'create container plans');
        
        const data = await request.formData();
        
        const container_no = data.get('container_no')?.toString().trim();
        const house_bl = data.get('house_bl')?.toString().trim();
        const model = data.get('model')?.toString().trim() || null;
        const type = data.get('type')?.toString().trim() || null;
        const eta_date = data.get('eta_date')?.toString().trim() || null;
        const checkin_date = data.get('checkin_date')?.toString().trim() || null;
        const depot = data.get('depot')?.toString().trim() || null;
        const vessel = data.get('vessel')?.toString().trim() || null;
        const agent = data.get('agent')?.toString().trim() || null;
        
        // จัดการ Data Type Integer สำหรับ free_time และ week_lot
        let free_time: number | null = null;
        const freeTimeVal = data.get('free_time')?.toString().trim();
        if (freeTimeVal) {
            const parsed = parseInt(freeTimeVal, 10);
            if (!isNaN(parsed)) free_time = parsed;
        }

        let week_lot: number | null = null;
        const weekLotVal = data.get('week_lot')?.toString().trim();
        if (weekLotVal) {
            const parsed = parseInt(weekLotVal, 10);
            if (!isNaN(parsed)) week_lot = parsed;
        }

        // ป้องกัน Data too long (DB LIMIT = varchar 50)
        let container_owner = data.get('container_owner')?.toString().trim() || null;
        if (container_owner && container_owner.length > 50) {
            container_owner = container_owner.substring(0, 50);
        }

        if (!container_no || !house_bl) {
            return fail(400, { message: 'กรุณากรอก Container No และ House B/L' });
        }

        const connection = await cymspool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. ดึงข้อมูลหรือสร้าง Container ใหม่
            const [containers]: any = await connection.query('SELECT id FROM containers WHERE container_no = ? LIMIT 1', [container_no]);
            let container_id;
            
            if (containers.length > 0) {
                container_id = containers[0].id;
                await connection.query(
                    'UPDATE containers SET agent = COALESCE(?, agent), container_owner = COALESCE(?, container_owner) WHERE id = ?',
                    [agent, container_owner, container_id]
                );
            } else {
                const [insertContainerResult]: any = await connection.query(
                    'INSERT INTO containers (container_no, agent, container_owner, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
                    [container_no, agent, container_owner]
                );
                container_id = insertContainerResult.insertId;
            }

            // 2. เช็กข้อมูลซ้ำ (Duplicate)
            const [existing]: any = await connection.query(
                'SELECT id FROM container_order_plans WHERE container_id = ? AND house_bl = ? LIMIT 1',
                [container_id, house_bl]
            );
            if (existing.length > 0) {
                await connection.rollback();
                return fail(400, { message: 'ข้อมูล Container Order Plan นี้มีอยู่แล้ว!' });
            }

            // 3. Generate Plan Number (ORDER + YYMMDD + XXXX)
            const today = new Date();
            const yy = today.getFullYear().toString().slice(2);
            const mm = (today.getMonth() + 1).toString().padStart(2, '0');
            const dd = today.getDate().toString().padStart(2, '0');
            const prefix = `ORDER${yy}${mm}${dd}`;
            
            const [maxPlan]: any = await connection.query(
                'SELECT plan_no FROM container_order_plans WHERE plan_no LIKE ? ORDER BY plan_no DESC LIMIT 1 FOR UPDATE',
                [`${prefix}%`]
            );
            
            let sequence = 1;
            if (maxPlan.length > 0 && maxPlan[0].plan_no) {
                const lastSeq = parseInt(maxPlan[0].plan_no.slice(-4), 10);
                if (!isNaN(lastSeq)) sequence = lastSeq + 1;
            }
            const plan_no = `${prefix}${sequence.toString().padStart(4, '0')}`;

            // 4. บันทึกข้อมูลลงฐานข้อมูล (สถานะ Pending = 1)
            await connection.query(
                `INSERT INTO container_order_plans 
                (plan_no, container_id, model, type, house_bl, eta_date, checkin_date, free_time, depot, week_lot, vessel, status, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
                [plan_no, container_id, model, type, house_bl, eta_date, checkin_date, free_time, depot, week_lot, vessel]
            );

            await connection.commit();
            return { success: true };
        } catch (error: any) {
            await connection.rollback();
            console.error('Create error:', error);
            return fail(500, { message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
        } finally {
            connection.release();
        }
    },

    // Action สำหรับการแก้ไขข้อมูล (Update)
    update: async ({ request, locals }) => {
        // ตรวจสอบสิทธิ์การแก้ไขข้อมูล
        checkPermission(locals, 'edit container plans');
        
        const data = await request.formData();
        
        // รับค่า ID ที่จะแก้ไข (จาก hidden input)
        const id = data.get('id')?.toString();
        const container_id = data.get('container_id')?.toString();
        
        if (!id || !container_id) {
            return fail(400, { message: 'ไม่พบรหัสที่ต้องการแก้ไข' });
        }

        const house_bl = data.get('house_bl')?.toString().trim();
        const model = data.get('model')?.toString().trim() || null;
        const type = data.get('type')?.toString().trim() || null;
        const eta_date = data.get('eta_date')?.toString().trim() || null;
        const checkin_date = data.get('checkin_date')?.toString().trim() || null;
        const depot = data.get('depot')?.toString().trim() || null;
        const vessel = data.get('vessel')?.toString().trim() || null;
        const agent = data.get('agent')?.toString().trim() || null;
        
        // จัดการ Data Type Integer สำหรับ free_time และ week_lot
        let free_time: number | null = null;
        const freeTimeVal = data.get('free_time')?.toString().trim();
        if (freeTimeVal) {
            const parsed = parseInt(freeTimeVal, 10);
            if (!isNaN(parsed)) free_time = parsed;
        }

        let week_lot: number | null = null;
        const weekLotVal = data.get('week_lot')?.toString().trim();
        if (weekLotVal) {
            const parsed = parseInt(weekLotVal, 10);
            if (!isNaN(parsed)) week_lot = parsed;
        }

        // ป้องกัน Data too long (DB LIMIT = varchar 50)
        let container_owner = data.get('container_owner')?.toString().trim() || null;
        if (container_owner && container_owner.length > 50) {
            container_owner = container_owner.substring(0, 50);
        }

        if (!house_bl) {
            return fail(400, { message: 'กรุณากรอก House B/L' });
        }

        const connection = await cymspool.getConnection();
        try {
            await connection.beginTransaction();

            // เช็กข้อมูลซ้ำ (Duplicate) ยกเว้นตัวเองที่กำลังแก้ไขอยู่
            const [existing]: any = await connection.query(
                'SELECT id FROM container_order_plans WHERE container_id = ? AND house_bl = ? AND id != ? LIMIT 1',
                [container_id, house_bl, id]
            );
            if (existing.length > 0) {
                await connection.rollback();
                return fail(400, { message: 'ข้อมูล Container Order Plan นี้มีอยู่แล้ว!' });
            }

            // ทำการอัปเดตข้อมูลของ container_order_plans
            await connection.query(
                `UPDATE container_order_plans 
                 SET model = ?, type = ?, house_bl = ?, eta_date = ?, checkin_date = ?, free_time = ?, depot = ?, week_lot = ?, vessel = ?, updated_at = NOW() 
                 WHERE id = ?`,
                [model, type, house_bl, eta_date, checkin_date, free_time, depot, week_lot, vessel, id]
            );

            // ทำการอัปเดตข้อมูลของ containers
            await connection.query(
                `UPDATE containers 
                 SET agent = ?, container_owner = ?, updated_at = NOW() 
                 WHERE id = ?`,
                [agent, container_owner, container_id]
            );

            await connection.commit();
            return { success: true };
        } catch (error: any) {
            await connection.rollback();
            console.error('Update error:', error);
            return fail(500, { message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล' });
        } finally {
            connection.release();
        }
    },

    // Action สำหรับการนำเข้าข้อมูล (Import) จากไฟล์ Excel / CSV
    import: async ({ request, locals }) => {
        // ตรวจสอบสิทธิ์การนำเข้าข้อมูล (ใช้สิทธิ์เดียวกับ create หรือสามารถเปลี่ยนเป็นสิทธิ์ import ได้)
        checkPermission(locals, 'create container plans');
        
        const data = await request.formData();
        const file = data.get('file') as File;
        
        if (!file || file.size === 0) {
            return fail(400, { message: 'กรุณาอัปโหลดไฟล์ที่ต้องการนำเข้า' });
        }

        const connection = await cymspool.getConnection();
        let successCount = 0;
        let skipCount = 0;

        try {
            await connection.beginTransaction();
            const buffer = await file.arrayBuffer();
            let rowsToProcess: any[] = [];

            // จัดการอ่านข้อมูลจากไฟล์ Excel หรือ CSV
            if (file.name.toLowerCase().endsWith('.csv')) {
                const text = new TextDecoder().decode(buffer);
                const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
                if (lines.length > 0) {
                    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
                    for (let i = 1; i < lines.length; i++) {
                        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                        let rowObj: any = {};
                        headers.forEach((h, idx) => {
                            rowObj[h] = values[idx] || null;
                        });
                        rowsToProcess.push(rowObj);
                    }
                }
            } else {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(buffer);
                const worksheet = workbook.worksheets[0];
                
                const headerRow = worksheet.getRow(1);
                const headers: Record<number, string> = {};
                headerRow.eachCell((cell, colNumber) => {
                    headers[colNumber] = cell.value?.toString().trim().toLowerCase() || '';
                });

                for (let i = 2; i <= worksheet.rowCount; i++) {
                    const row = worksheet.getRow(i);
                    // ข้ามแถวที่ว่างเปล่า
                    if (!row.values || !row.values.length) continue;
                    
                    let rowObj: any = {};
                    for (const [colNumber, headerName] of Object.entries(headers)) {
                        rowObj[headerName] = row.getCell(Number(colNumber))?.value ?? null;
                    }
                    rowsToProcess.push(rowObj);
                }
            }

            // Loop นำเข้าข้อมูล
            for (const row of rowsToProcess) {
                const container_no = row['container_no']?.toString().trim();
                const house_bl = row['house_bl']?.toString().trim();

                // ข้ามแถวที่ไม่มีข้อมูลจำเป็น
                if (!container_no || !house_bl) continue;

                // 1. หาหรือสร้าง Container
                const [containers]: any = await connection.query('SELECT id FROM containers WHERE container_no = ? LIMIT 1', [container_no]);
                let container_id;
                
                const agent = row['agent']?.toString().trim() || null;

                // ตัดความยาวไม่ให้เกิน 50 ตัวอักษร
                let container_owner = row['container_owner']?.toString().trim() || null;
                if (container_owner && container_owner.length > 50) {
                    container_owner = container_owner.substring(0, 50);
                }

                if (containers.length > 0) {
                    container_id = containers[0].id;
                    await connection.query(
                        'UPDATE containers SET agent = COALESCE(?, agent), container_owner = COALESCE(?, container_owner) WHERE id = ?',
                        [agent, container_owner, container_id]
                    );
                } else {
                    const [insertContainerResult]: any = await connection.query(
                        'INSERT INTO containers (container_no, agent, container_owner, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
                        [container_no, agent, container_owner]
                    );
                    container_id = insertContainerResult.insertId;
                }

                // 2. เช็ก Duplicate ถ้ามีอยู่แล้วให้ข้าม
                const [existing]: any = await connection.query(
                    'SELECT id FROM container_order_plans WHERE container_id = ? AND house_bl = ? LIMIT 1',
                    [container_id, house_bl]
                );
                if (existing.length > 0) {
                    skipCount++;
                    continue;
                }

                // 3. Generate Plan No
                const today = new Date();
                const yy = today.getFullYear().toString().slice(2);
                const mm = (today.getMonth() + 1).toString().padStart(2, '0');
                const dd = today.getDate().toString().padStart(2, '0');
                const prefix = `ORDER${yy}${mm}${dd}`;
                
                const [maxPlan]: any = await connection.query(
                    'SELECT plan_no FROM container_order_plans WHERE plan_no LIKE ? ORDER BY plan_no DESC LIMIT 1 FOR UPDATE',
                    [`${prefix}%`]
                );
                
                let sequence = 1;
                if (maxPlan.length > 0 && maxPlan[0].plan_no) {
                    const lastSeq = parseInt(maxPlan[0].plan_no.slice(-4), 10);
                    if (!isNaN(lastSeq)) sequence = lastSeq + 1;
                }
                const plan_no = `${prefix}${sequence.toString().padStart(4, '0')}`;

                // Parse Dates
                const parseImportDate = (val: any): string | null => {
                    if (!val) return null;
                    if (val instanceof Date) return val.toISOString().split('T')[0];
                    const strVal = val.toString().trim();
                    if (strVal.length === 8 && /^\d{8}$/.test(strVal)) {
                        return `${strVal.substring(0, 4)}-${strVal.substring(4, 6)}-${strVal.substring(6, 8)}`;
                    }
                    const parsed = new Date(strVal);
                    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
                    return null;
                };

                const eta_date = parseImportDate(row['eta_date']);
                const checkin_date = parseImportDate(row['checkin_date']);

                // จัดการ Data Type Integer สำหรับ free_time และ week_lot
                let free_time: number | null = null;
                const freeTimeVal = row['free_time']?.toString().trim();
                if (freeTimeVal) {
                    const parsed = parseInt(freeTimeVal, 10);
                    if (!isNaN(parsed)) free_time = parsed;
                }

                let week_lot: number | null = null;
                const weekLotVal = row['week_lot']?.toString().trim();
                if (weekLotVal) {
                    const parsed = parseInt(weekLotVal, 10);
                    if (!isNaN(parsed)) week_lot = parsed;
                }

                // 4. บันทึกข้อมูล
                await connection.query(
                    `INSERT INTO container_order_plans 
                    (plan_no, container_id, model, type, house_bl, eta_date, checkin_date, free_time, depot, week_lot, vessel, status, created_at, updated_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
                    [
                        plan_no, 
                        container_id, 
                        row['model']?.toString().trim() || null, 
                        row['type']?.toString().trim() || null, 
                        house_bl, 
                        eta_date, 
                        checkin_date, 
                        free_time, 
                        row['depot']?.toString().trim() || null, 
                        week_lot, 
                        row['vessel']?.toString().trim() || null
                    ]
                );
                successCount++;
            }

            await connection.commit();
            return { success: true, message: `นำเข้าสำเร็จ ${successCount} รายการ (ข้าม ${skipCount} รายการที่มีอยู่แล้ว)` };
        } catch (error: any) {
            await connection.rollback();
            console.error('Import error:', error);
            return fail(500, { message: error.message || 'เกิดข้อผิดพลาดในการนำเข้าข้อมูล' });
        } finally {
            connection.release();
        }
    },

    // Action สำหรับการลบข้อมูล (Delete)
    delete: async ({ request, locals }) => {
        // ตรวจสอบสิทธิ์การลบข้อมูล
        checkPermission(locals, 'delete container plans');
        
        const data = await request.formData();
        const id = data.get('id')?.toString();
        
        if (!id) {
            return fail(400, { message: 'ไม่พบรหัสที่ต้องการลบ' });
        }

        const connection = await cymspool.getConnection();
        try {
            await connection.beginTransaction();

            // ตรวจสอบสถานะก่อนลบฝั่งเซิร์ฟเวอร์ (เพื่อความปลอดภัย ต้องเป็น 1 = Pending เท่านั้น)
            const [plan]: any = await connection.query('SELECT status FROM container_order_plans WHERE id = ? LIMIT 1', [id]);
            
            if (plan.length === 0) {
                await connection.rollback();
                return fail(404, { message: 'ไม่พบข้อมูล Order Plan นี้ในระบบ' });
            }

            if (plan[0].status !== 1) {
                await connection.rollback();
                return fail(400, { message: 'ไม่สามารถลบได้ เนื่องจากสถานะปัจจุบันไม่ใช่ Pending' });
            }

            // ทำการลบข้อมูล
            await connection.query('DELETE FROM container_order_plans WHERE id = ?', [id]);

            await connection.commit();
            return { success: true };
        } catch (error: any) {
            await connection.rollback();
            console.error('Delete error:', error);
            return fail(500, { message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
        } finally {
            connection.release();
        }
    }
};