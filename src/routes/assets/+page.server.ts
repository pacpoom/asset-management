import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import fs from 'fs/promises';
import path from 'path';

/**
 * Configuration for the /assets page.
 * We're increasing the bodySizeLimit to 10MB to allow for larger
 * image uploads in the 'addAsset' and 'editAsset' form actions.
 * The default SvelteKit limit is 512KB.
 */
export const config = {
	bodySizeLimit: 10 * 1024 * 1024 // 10 MB
};

// Define a type for our asset data for better type-safety
type Asset = {
	id: number;
	name: string;
	asset_tag: string;
	asset_tag_sub: string | null;
	status: 'In Use' | 'In Storage' | 'Under Maintenance' | 'Disposed';
	purchase_date: string;
	purchase_cost: number;
	location_name?: string;
	category_name?: string;
	assigned_user_name?: string;
	image_url?: string;
	notes?: string;
	category_id: number;
	location_id?: number;
	assigned_to_user_id?: number;
};

/**
 * Load all assets, categories, locations, and users from the database.
 */
export const load: PageServerLoad = async ({ url }) => {
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const searchQuery = url.searchParams.get('search') || '';
	const pageSize = 16;
	const offset = (page - 1) * pageSize;

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

		// Get total count for pagination with filter
		const [countResult] = await pool.execute<any[]>(
			`SELECT COUNT(*) as total 
             FROM assets a
             LEFT JOIN asset_categories ac ON a.category_id = ac.id
             LEFT JOIN asset_locations al ON a.location_id = al.id
             LEFT JOIN users u ON a.assigned_to_user_id = u.id
             ${whereClause}`,
			params
		);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		// Query to fetch assets.
		// LIMIT and OFFSET are directly interpolated as they are guaranteed to be numbers (safe from SQL injection).
		// The `params` array now only contains the search terms, matching the `?` placeholders in whereClause.
		const [assetRows] = await pool.execute<Asset[]>(
			`
            SELECT 
                a.id, a.name, a.asset_tag, a.asset_tag_sub, a.status, a.purchase_date,
                a.purchase_cost, a.notes, a.image_url, a.category_id, a.location_id,
                a.assigned_to_user_id,
                ac.name AS category_name, 
                al.name AS location_name,
                u.full_name AS assigned_user_name
            FROM assets a
            LEFT JOIN asset_categories ac ON a.category_id = ac.id
            LEFT JOIN asset_locations al ON a.location_id = al.id
            LEFT JOIN users u ON a.assigned_to_user_id = u.id
            ${whereClause}
            ORDER BY a.created_at DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `,
			params
		);

		// Fetch supporting data for forms
		const [categoryRows] = await pool.execute('SELECT id, name FROM asset_categories ORDER BY name');
		const [locationRows] = await pool.execute('SELECT id, name FROM asset_locations ORDER BY name');
		const [userRows] = await pool.execute('SELECT id, full_name, email FROM users ORDER BY full_name');

		// Format date for display
		const assets = assetRows.map((asset) => ({
			...asset,
			purchase_date: asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString('en-CA') : ''
		}));

		return {
			assets,
			categories: categoryRows,
			locations: locationRows,
			users: userRows,
			currentPage: page,
			totalPages,
			searchQuery
		};
	} catch (error) {
		console.error('Failed to load assets data:', error);
		return {
			assets: [],
			categories: [],
			locations: [],
			users: [],
			currentPage: 1,
			totalPages: 1,
			searchQuery
		};
	}
};

// Function to handle file saving
async function saveImage(imageFile: File): Promise<string | null> {
	if (!imageFile || imageFile.size === 0) {
		return null;
	}
	try {
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		const filename = `${uniqueSuffix}-${imageFile.name}`;
		// **FIX**: Use a dedicated 'uploads' directory at the project root, not inside 'static'.
		const uploadDir = path.join(process.cwd(), 'uploads');
		await fs.mkdir(uploadDir, { recursive: true });
		const uploadPath = path.join(uploadDir, filename);
		await fs.writeFile(uploadPath, Buffer.from(await imageFile.arrayBuffer()));
		return `/uploads/${filename}`;
	} catch (error) {
		console.error('Error handling file upload:', error);
		throw new Error('Failed to upload image.');
	}
}

// Function to handle file deletion
async function deleteImage(imageUrl: string | null | undefined) {
	if (!imageUrl) return;
	try {
		// **FIX**: Construct the correct path to the 'uploads' directory.
		// imageUrl is '/uploads/filename.jpg', so we extract 'filename.jpg'.
		const filename = path.basename(imageUrl);
		const imagePath = path.join(process.cwd(), 'uploads', filename);
		await fs.unlink(imagePath);
	} catch (error: any) {
		// If file doesn't exist, we don't need to throw an error
		if (error.code !== 'ENOENT') {
			console.error('Failed to delete image file:', error);
		}
	}
}

// Function to generate a new asset tag
async function generateAssetTag() {
	const today = new Date();
	const year = today.getFullYear();
	const month = (today.getMonth() + 1).toString().padStart(2, '0');
	const day = today.getDate().toString().padStart(2, '0');
	const datePrefix = `${year}${month}${day}`;

	// Find the last tag for today to determine the next number
	const [rows]: any[] = await pool.execute(
		`SELECT asset_tag FROM assets WHERE asset_tag LIKE ? ORDER BY asset_tag DESC LIMIT 1`,
		[`${datePrefix}-%`]
	);

	let nextNumber = 1;
	if (rows.length > 0) {
		const lastTag = rows[0].asset_tag;
		const lastNumber = parseInt(lastTag.split('-')[1], 10);
		nextNumber = lastNumber + 1;
	}

	const paddedNumber = nextNumber.toString().padStart(5, '0');
	return `${datePrefix}-${paddedNumber}`;
}

export const actions: Actions = {
	/**
	 * Handles the creation of a new asset.
	 */
	addAsset: async ({ request }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString();
		const asset_tag_sub = data.get('asset_tag_sub')?.toString();
		const category_id = data.get('category_id')?.toString();
		const location_id = data.get('location_id')?.toString();
		const assigned_to_user_id = data.get('assigned_to_user_id')?.toString();
		const status = data.get('status')?.toString() ?? 'In Storage';
		const purchase_date = data.get('purchase_date')?.toString();
		const purchase_cost = data.get('purchase_cost')?.toString();
		const notes = data.get('notes')?.toString() ?? '';
		const imageFile = data.get('image') as File;

		if (!name || !category_id || !purchase_date || !purchase_cost) {
			return fail(400, { success: false, message: 'Please fill in all required fields.' });
		}

		try {
			const newAssetTag = await generateAssetTag();
			const imageUrl = await saveImage(imageFile);

			await pool.execute(
				`INSERT INTO assets (name, asset_tag, asset_tag_sub, category_id, location_id, assigned_to_user_id, status, purchase_date, purchase_cost, notes, image_url) 
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					name,
					newAssetTag,
					asset_tag_sub ? asset_tag_sub : null,
					parseInt(category_id),
					location_id ? parseInt(location_id) : null,
					assigned_to_user_id ? parseInt(assigned_to_user_id) : null,
					status,
					purchase_date,
					parseFloat(purchase_cost),
					notes,
					imageUrl
				]
			);

			return { success: true, message: 'Asset added successfully!' };
		} catch (error: any) {
			console.error('Database error on adding asset:', error);
			if (error.code === 'ER_DUP_ENTRY') {
				return fail(409, { success: false, message: 'This Asset Tag already exists. Please try again.' });
			}
			return fail(500, { success: false, message: 'Failed to add asset to the database.' });
		}
	},

	/**
	 * Handles editing an existing asset.
	 */
	editAsset: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const name = data.get('name')?.toString();
		const asset_tag_sub = data.get('asset_tag_sub')?.toString(); // Manual input is editable
		const category_id = data.get('category_id')?.toString();
		const location_id = data.get('location_id')?.toString();
		const assigned_to_user_id = data.get('assigned_to_user_id')?.toString();
		const status = data.get('status')?.toString();
		const purchase_date = data.get('purchase_date')?.toString();
		const purchase_cost = data.get('purchase_cost')?.toString();
		const notes = data.get('notes')?.toString() ?? '';
		const imageFile = data.get('image') as File;
		const existingImageUrl = data.get('existing_image_url')?.toString();

		// Asset Tag is not editable, so it's not retrieved from the form
		if (!id || !name || !category_id || !purchase_date || !purchase_cost) {
			return fail(400, { success: false, message: 'Please fill in all required fields.' });
		}

		try {
			let imageUrl = existingImageUrl;
			// If a new image is uploaded, save it and delete the old one
			if (imageFile && imageFile.size > 0) {
				imageUrl = await saveImage(imageFile);
				await deleteImage(existingImageUrl);
			}

			await pool.execute(
				`UPDATE assets SET 
					name = ?, asset_tag_sub = ?, category_id = ?, location_id = ?, assigned_to_user_id = ?, 
					status = ?, purchase_date = ?, purchase_cost = ?, notes = ?, image_url = ?
				 WHERE id = ?`,
				[
					name,
					asset_tag_sub ? asset_tag_sub : null,
					parseInt(category_id),
					location_id ? parseInt(location_id) : null,
					assigned_to_user_id ? parseInt(assigned_to_user_id) : null,
					status,
					purchase_date,
					parseFloat(purchase_cost),
					notes,
					imageUrl,
					parseInt(id)
				]
			);

			return { success: true, message: 'Asset updated successfully!' };
		} catch (error: any) {
			console.error('Database error on editing asset:', error);
			// ER_DUP_ENTRY check on asset_tag is not needed as it's not editable.
			return fail(500, { success: false, message: 'Failed to update asset.' });
		}
	},

	/**
	 * Handles deleting an asset.
	 */
	deleteAsset: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) {
			return fail(400, { success: false, message: 'Invalid asset ID.' });
		}

		try {
			// First, get the image URL to delete the file
			const [rows]: any[] = await pool.execute('SELECT image_url FROM assets WHERE id = ?', [id]);
			if (rows.length > 0) {
				await deleteImage(rows[0].image_url);
			}

			// Then, delete the database record
			await pool.execute('DELETE FROM assets WHERE id = ?', [id]);

			// Use a redirect to refresh the page data after deletion
			throw redirect(303, '/assets');
		} catch (error: any) {
			// If it's a redirect, don't log it as a server error
			if (error.status === 303) throw error;
			console.error('Error deleting asset:', error);
			return fail(500, { success: false, message: 'Failed to delete asset.' });
		}
	}
	
	/* The exportCsv action has been removed because it incorrectly returned a non-serializable 
	Response object. It has been moved to src/routes/assets/export/+server.ts */
};