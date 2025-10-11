import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';

// Define types for the data we'll fetch
interface StatSummary {
    total_assets: number;
    total_value: number;
    in_use_count: number;
    in_storage_count: number;
    maintenance_count: number;
    disposed_count: number;
}

interface AssetByGroup extends RowDataPacket {
    name: string;
    count: number;
}

interface RecentAsset extends RowDataPacket {
    id: number;
    name: string;
    asset_tag: string;
    created_at: string;
    image_url: string | null;
}


export const load: PageServerLoad = async ({ locals }) => {
    // Check if user is logged in
    if (!locals.user) {
        // This should be handled by the layout server load, but as a safeguard.
        return {};
    }

    try {
        // 1. Get main statistics in a single query for efficiency
        const [statsResult] = await pool.execute<RowDataPacket[]>(`
            SELECT
                COUNT(*) AS total_assets,
                SUM(purchase_cost) AS total_value,
                SUM(CASE WHEN status = 'In Use' THEN 1 ELSE 0 END) AS in_use_count,
                SUM(CASE WHEN status = 'In Storage' THEN 1 ELSE 0 END) AS in_storage_count,
                SUM(CASE WHEN status = 'Under Maintenance' THEN 1 ELSE 0 END) AS maintenance_count,
                SUM(CASE WHEN status = 'Disposed' THEN 1 ELSE 0 END) AS disposed_count
            FROM assets
        `);
        const summary: StatSummary = statsResult[0] as StatSummary;

        // 2. Get asset count by category
        const [assetsByCategory] = await pool.execute<AssetByGroup[]>(`
            SELECT ac.name, COUNT(a.id) AS count
            FROM assets a
            JOIN asset_categories ac ON a.category_id = ac.id
            GROUP BY ac.name
            ORDER BY count DESC
            LIMIT 7
        `);

        // 3. Get asset count by location
        const [assetsByLocation] = await pool.execute<AssetByGroup[]>(`
            SELECT al.name, COUNT(a.id) AS count
            FROM assets a
            JOIN asset_locations al ON a.location_id = al.id
            GROUP BY al.name
            ORDER BY count DESC
            LIMIT 7
        `);

        // 4. Get 5 most recently added assets
        const [recentAssets] = await pool.execute<RecentAsset[]>(`
            SELECT id, name, asset_tag, created_at, image_url
            FROM assets
            ORDER BY created_at DESC
            LIMIT 5
        `);
        
        // 5. Get any ongoing counting activities
        const [ongoingActivities] = await pool.execute<RowDataPacket[]>(`
            SELECT id, name, start_date 
            FROM asset_counting_activities
            WHERE status = 'In Progress'
            ORDER BY start_date DESC
        `);

        return {
            summary,
            assetsByCategory,
            assetsByLocation,
            recentAssets,
            ongoingActivities,
            user: locals.user // Pass user info for greeting
        };

    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        // Return a default structure on error to prevent page crashes
        return {
            summary: { total_assets: 0, total_value: 0, in_use_count: 0, in_storage_count: 0, maintenance_count: 0, disposed_count: 0 },
            assetsByCategory: [],
            assetsByLocation: [],
            recentAssets: [],
            ongoingActivities: [],
            user: locals.user,
            error: 'Could not load dashboard data.'
        };
    }
};
