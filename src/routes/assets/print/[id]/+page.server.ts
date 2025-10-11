import { error } from '@sveltejs/kit';
import pool from '$lib/server/database';
import type { PageServerLoad } from './$types';
import type { RowDataPacket } from 'mysql2';

// Define a type for our asset data for better type-safety
interface Asset extends RowDataPacket {
	id: number;
	name: string;
	asset_tag: string;
    purchase_date: string;
    category_name: string | null;
    location_name: string | null;
}

/**
 * Load a single asset for printing.
 */
export const load: PageServerLoad = async ({ params }) => {
	const assetId = params.id;

	if (!assetId) {
		throw error(400, 'Asset ID is required.');
	}

	try {
        const [assetRows] = await pool.execute<Asset[]>(
			`
            SELECT 
                a.id, a.name, a.asset_tag, a.purchase_date,
                ac.name AS category_name,
                al.name AS location_name
            FROM assets a
            LEFT JOIN asset_categories ac ON a.category_id = ac.id
            LEFT JOIN asset_locations al ON a.location_id = al.id
            WHERE a.id = ?
            LIMIT 1
            `,
			[assetId]
		);

        if (assetRows.length === 0) {
            throw error(404, 'Asset not found.');
        }

        const asset = assetRows[0];
        
        // Format date for display, e.g., YYYY-MM-DD
        if (asset.purchase_date) {
            asset.purchase_date = new Date(asset.purchase_date).toLocaleDateString('en-CA');
        }

		return {
			asset
		};
	} catch (err: any) {
        if (err.status) throw err; // Re-throw kit errors
		console.error('Failed to load asset data for printing:', err);
		throw error(500, 'Failed to load asset data from the server.');
	}
};

// **ACTIONS REMOVED:** The PDF generation logic has been moved to the dedicated
// +server.ts file in this directory to handle the Response object correctly.
// export const actions: Actions = { ... } 
