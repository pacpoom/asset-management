import type { RequestHandler } from './$types';
import pool from '$lib/server/database';

// Minimal type definition for the data used in this endpoint
type Asset = {
	asset_tag: string;
	asset_tag_sub: string | null;
	name: string;
	status: string;
	purchase_date: string;
	purchase_cost: number;
	notes: string;
	category_name?: string;
	location_name?: string;
	assigned_user_name?: string;
};

/**
 * Helper to sanitize CSV fields by escaping double quotes and wrapping in quotes if needed.
 */
const sanitizeField = (field: any): string => {
	if (field === null || field === undefined) {
		return '';
	}
	const str = String(field);
	// If the string contains a comma, double quote, or newline, wrap it in double quotes.
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		// Escape existing double quotes by doubling them up
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
};

/**
 * Handle POST request for exporting filtered assets to CSV.
 * This function returns a Response object directly, avoiding the SvelteKit action serialization error.
 */
export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const searchQuery = formData.get('search')?.toString() || '';

	try {
		let whereClause = '';
		const params: (string | number)[] = [];

		if (searchQuery) {
			whereClause = `
                WHERE 
                    a.name LIKE ? OR 
                    a.asset_tag LIKE ? OR 
                    a.asset_tag_sub LIKE ? OR 
                    u.full_name LIKE ? OR
                    ac.name LIKE ? OR
                    al.name LIKE ?
            `;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
		}

		// Query to fetch all assets with their related names, without pagination
		const [assetRows] = await pool.execute<Asset[]>(
			`
            SELECT 
                a.asset_tag, a.asset_tag_sub, a.name, a.status, a.purchase_date,
                a.purchase_cost, a.notes,
                ac.name AS category_name, 
                al.name AS location_name,
                u.full_name AS assigned_user_name
            FROM assets a
            LEFT JOIN asset_categories ac ON a.category_id = ac.id
            LEFT JOIN asset_locations al ON a.location_id = al.id
            LEFT JOIN users u ON a.assigned_to_user_id = u.id
            ${whereClause}
            ORDER BY a.created_at DESC
            `,
			params
		);

		const headers = [
			'Asset Tag',
			'Sub Tag',
			'Name',
			'Status',
			'Category',
			'Location',
			'Assigned To',
			'Purchase Date',
			'Purchase Cost',
			'Notes'
		];

		const csvRows = assetRows.map((asset) => {
			const purchaseDate = asset.purchase_date
				? new Date(asset.purchase_date).toLocaleDateString('en-CA')
				: '';
			return [
				sanitizeField(asset.asset_tag),
				sanitizeField(asset.asset_tag_sub),
				sanitizeField(asset.name),
				sanitizeField(asset.status),
				sanitizeField(asset.category_name),
				sanitizeField(asset.location_name),
				sanitizeField(asset.assigned_user_name),
				sanitizeField(asset.purchase_date), // Use raw date string for proper import by spreadsheet software
				sanitizeField(asset.purchase_cost),
				sanitizeField(asset.notes)
			].join(',');
		});

		// Add UTF-8 BOM to ensure Thai characters display correctly in Excel
		const BOM = '\ufeff'; 
		const csvContent = BOM + [headers.join(','), ...csvRows].join('\n');

		// Return the file download Response
		return new Response(csvContent, {
			status: 200,
			headers: {
				'Content-Type': 'text/csv;charset=utf-8',
				'Content-Disposition': `attachment; filename="assets-${new Date()
					.toISOString()
					.slice(0, 10)}.csv"`
			}
		});
	} catch (error) {
		console.error('Failed to export assets to CSV:', error);
		// Return a 500 status response with plain text error message
		return new Response('Failed to export assets due to a server error.', {
			status: 500,
			headers: { 'Content-Type': 'text/plain' }
		});
	}
};