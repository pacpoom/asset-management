import { json } from '@sveltejs/kit';
import { btpool } from '$lib/server/database';
import type { RequestEvent } from './$types';

export const GET = async ({ url }: RequestEvent) => {
    const container_no = url.searchParams.get('container_no');
    
    if (!container_no) {
        return json([]);
    }

    try {
        // ดึงข้อมูล packing_list โดยใช้ btpool ตามเบอร์ตู้ (Container No)
        const [rows]: any = await btpool.query(`
            SELECT * FROM packing_list 
            WHERE container = ? 
            ORDER BY id DESC
        `, [container_no]);
        
        return json(rows);
    } catch (error) {
        console.error('Error fetching packing list from btpool:', error);
        return json({ error: 'Failed to fetch packing list' }, { status: 500 });
    }
};