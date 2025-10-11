import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';

// --- Types ---
interface Activity extends RowDataPacket {
	id: number;
	name: string;
	start_date: string;
    end_date: string | null;
	location_id: number | null;
	category_id: number | null;
	location_name: string | null;
	category_name: string | null;
}

interface ScanResult extends RowDataPacket {
	asset_tag: string;
	scanned_at: string;
	full_name: string; // Scanned By User
	found_status: 'Found' | 'Unrecorded' | 'Duplicate';
	asset_name: string | null;
    location_name: string | null; // Location from asset table
    assigned_user_name: string | null; // User from asset table
}

interface MissingAsset extends RowDataPacket {
    asset_tag: string;
    name: string;
    category_name: string | null;
    location_name: string | null;
    assigned_user_name: string | null;
}


export const load: PageServerLoad = async ({ url }) => {
	const activityId = url.searchParams.get('activity_id');

	try {
		// 1. Fetch all activities for the dropdown selector
		const [allActivities] = await pool.execute<Activity[]>(`
            SELECT id, name, start_date 
            FROM asset_counting_activities
            ORDER BY start_date DESC
        `);

        if (!activityId) {
            // If no specific activity is selected yet, just return the list of available activities
            return {
                activities: allActivities,
                reportData: null
            };
        }

        // --- If an activityId is provided, proceed to generate the full report ---

        // 2. Fetch details for the selected activity
        const [activityRows] = await pool.execute<Activity[]>(
            `SELECT 
                aca.id, aca.name, aca.start_date, aca.end_date, aca.location_id, aca.category_id,
                al.name AS location_name, ac.name AS category_name
            FROM asset_counting_activities aca
            LEFT JOIN asset_locations al ON aca.location_id = al.id
            LEFT JOIN asset_categories ac ON aca.category_id = ac.id
            WHERE aca.id = ? LIMIT 1`,
            [activityId]
        );
        const activity = activityRows[0];
        if (!activity) {
            throw error(404, 'Activity not found');
        }

        // 3. Determine the scope of assets that were expected to be scanned
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
            `SELECT a.asset_tag FROM assets a ${scopeWhereClause}`,
            scopeParams
        );
        const expectedAssetTags = new Set(expectedAssets.map(a => a.asset_tag));

        // 4. Fetch all scan records for this activity, joining to get full asset details
        const [scanRows] = await pool.execute<ScanResult[]>(
            `SELECT 
                acs.asset_tag, acs.scanned_at, acs.found_status, 
                u_scanner.full_name, 
                a.name as asset_name,
                al.name as location_name,
                u_owner.full_name as assigned_user_name
             FROM asset_counting_scans acs
             JOIN users u_scanner ON acs.scanned_by_user_id = u_scanner.id
             LEFT JOIN assets a ON acs.asset_tag = a.asset_tag
             LEFT JOIN asset_locations al ON a.location_id = al.id
             LEFT JOIN users u_owner ON a.assigned_to_user_id = u_owner.id
             WHERE acs.activity_id = ?
             ORDER BY acs.scanned_at DESC`,
            [activityId]
        );
        
        // 5. Calculate missing assets by comparing the expected set with the scanned set
        const scannedTags = new Set(scanRows.map(s => s.asset_tag));
        const missingAssetTags = [...expectedAssetTags].filter(tag => !scannedTags.has(tag));

        // 6. Fetch details for all missing assets
        let missingAssets: MissingAsset[] = [];
        if (missingAssetTags.length > 0) {
             const [missingRows] = await pool.execute<MissingAsset[]>(
                `SELECT 
                    a.asset_tag, a.name,
                    ac.name as category_name,
                    al.name as location_name,
                    u.full_name as assigned_user_name
                 FROM assets a
                 LEFT JOIN asset_categories ac ON a.category_id = ac.id
                 LEFT JOIN asset_locations al ON a.location_id = al.id
                 LEFT JOIN users u ON a.assigned_to_user_id = u.id
                 WHERE a.asset_tag IN (?)`,
                [missingAssetTags]
            );
            missingAssets = missingRows;
        }

        // 7. Separate scanned items into 'found' (within scope) and 'unrecorded' (outside scope)
        const scannedFound = scanRows.filter(s => expectedAssetTags.has(s.asset_tag));
        const scannedUnrecorded = scanRows.filter(s => !expectedAssetTags.has(s.asset_tag));

        // 8. Compile the final report data object
        const reportData = {
            activity,
            summary: {
                expected: expectedAssetTags.size,
                scanned: scannedTags.size,
                missing: missingAssets.length,
                found: scannedFound.length,
                unrecorded: scannedUnrecorded.length,
            },
            scanList: scanRows,
            missingList: missingAssets,
            unrecordedList: scannedUnrecorded
        };

		return {
			activities: allActivities,
            reportData
		};

	} catch (err: any) {
		console.error('Failed to load counting report data:', err);
        if (err.status) throw err; // Re-throw SvelteKit-specific errors
		throw error(500, { message: 'Failed to load report data from the server.' });
	}
};
