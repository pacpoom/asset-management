import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import pool from '$lib/server/database';
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';

// Type definition for ProductCategory
interface ProductCategory extends RowDataPacket {
	id: number;
	name: string;
	description: string | null;
}

/**
 * Loads product categories with pagination and search.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	try {
		// Permission Check
		checkPermission(locals, 'manage settings');

		// Get page number and search query from URL parameters
		const page = parseInt(url.searchParams.get('page') || '1', 10);
		const searchQuery = url.searchParams.get('search')?.toString()?.trim() || '';
		const pageSize = 16; // Set page size to 16
		const offset = (page - 1) * pageSize;

		// Build WHERE clause for search
		let whereClause = '';
		const params: (string | number)[] = [];
		if (searchQuery) {
			whereClause = `WHERE name LIKE ? OR description LIKE ?`;
			const searchTerm = `%${searchQuery}%`;
			params.push(searchTerm, searchTerm);
		}

		// Get total count for pagination based on the search filter
		const [countResult] = await pool.execute<any[]>(
			`SELECT COUNT(*) as total FROM product_categories ${whereClause}`,
			params
		);
		const total = countResult[0].total;
		const totalPages = Math.ceil(total / pageSize);

		// Fetch categories for the current page with search filter
		const [categoriesData] = await pool.execute<ProductCategory[]>(
			`SELECT id, name, description
             FROM product_categories
             ${whereClause}
             ORDER BY name ASC
             LIMIT ? OFFSET ?`, // Add LIMIT and OFFSET
			[...params, pageSize, offset] // Add pageSize and offset to params
		);

		// Convert RowDataPacket[] to plain object[] for serialization
		const categories = categoriesData.map((cat) => ({
			id: cat.id,
			name: cat.name,
			description: cat.description
		}));

		console.log(`[product-categories/+page.server.ts] Fetched ${categories.length} categories for page ${page}. Search: "${searchQuery}"`);

		return {
			categories: categories,
			currentPage: page,
			totalPages: totalPages,
			searchQuery: searchQuery // Pass search query back to the page
		};
	} catch (err: any) {
		console.error('Failed to load product categories data:', err.message, err.stack);
		if (err.status >= 400 && err.status < 600) {
			throw err;
		}
		throw error(500, `Failed to load data from the server. Error: ${err.message}`);
	}
};

/**
 * Actions for saving and deleting product categories.
 */
export const actions: Actions = {
	/**
	 * Save a new or existing category.
	 */
	saveCategory: async ({ request, locals }) => {
		// Permission Check
		checkPermission(locals, 'manage settings');
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const name = data.get('name')?.toString()?.trim();
		const description = data.get('description')?.toString()?.trim() || null;

		// --- Validation ---
		if (!name) {
			return fail(400, {
				action: 'saveCategory',
				success: false,
				message: 'Category Name is required.'
			});
		}

		try {
			const params = [name, description];

			if (id) {
				// Update existing category
				await pool.execute(
					`UPDATE product_categories SET
                        name = ?, description = ?
                     WHERE id = ?`,
					[...params, parseInt(id)]
				);
			} else {
				// Insert new category
				await pool.execute(
					`INSERT INTO product_categories
                        (name, description)
                     VALUES (?, ?)`,
					params
				);
			}
			// Return success message
			return { action: 'saveCategory', success: true, message: `Category '${name}' saved successfully!` };
		} catch (err: any) {
			console.error('Database error on saving category:', err.message, err.stack);
			// Handle potential duplicate name error
			if (err.code === 'ER_DUP_ENTRY') {
				return fail(409, {
					action: 'saveCategory',
					success: false,
					message: 'A category with this name already exists.'
				});
			}
			// Handle other database errors
			return fail(500, {
				action: 'saveCategory',
				success: false,
				message: `Failed to save category. Error: ${err.message}`
			});
		}
	},

	/**
	 * Delete a category.
	 */
	deleteCategory: async ({ request, locals }) => {
		// Permission Check
		checkPermission(locals, 'manage settings');
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) {
			return fail(400, { action: 'deleteCategory', success: false, message: 'Invalid category ID.' });
		}
		const categoryId = parseInt(id);
		const connection = await pool.getConnection(); // Use transaction for safety

		try {
			await connection.beginTransaction();

			// Check if the category is referenced by products before deleting
			const [productRefs] = await connection.execute<RowDataPacket[]>(
				// Assuming a 'products' table exists with 'category_id' column
				// Adjust this query based on your actual database schema
				`SELECT id FROM products WHERE category_id = ? LIMIT 1`,
				[categoryId]
			);
			if (productRefs.length > 0) {
				await connection.rollback(); // Abort transaction
				connection.release();
				return fail(409, { // 409 Conflict is appropriate here
					action: 'deleteCategory',
					success: false,
					message: 'Cannot delete. This category is assigned to one or more products.'
				});
			}

            // Also check if it's used as a parent category
            const [childRefs] = await connection.execute<RowDataPacket[]>(
				`SELECT id FROM product_categories WHERE parent_category_id = ? LIMIT 1`,
				[categoryId]
			);
            if (childRefs.length > 0) {
				await connection.rollback();
				connection.release();
				return fail(409, {
					action: 'deleteCategory',
					success: false,
					message: 'Cannot delete. This category is used as a parent for other categories.'
				});
			}


			// Proceed with deletion if no references found
			const [result] = await connection.execute('DELETE FROM product_categories WHERE id = ?', [
				categoryId
			]);

			await connection.commit(); // Finalize transaction
			connection.release();

			// Check if any row was actually deleted
			if ((result as any).affectedRows === 0) {
				return fail(404, { action: 'deleteCategory', success: false, message: 'Category not found.' });
			}

			// Return success message
			return { action: 'deleteCategory', success: true, message: 'Category deleted successfully.' };
		} catch (err: any) {
			// Rollback transaction in case of any error during the process
			await connection.rollback();
			connection.release();
			console.error(`Error deleting category ID ${categoryId}: ${err.message}`, err.stack);
			// Catch generic Foreign Key constraint errors if other checks were missed
			if (err.code === 'ER_ROW_IS_REFERENCED_2') {
				return fail(409, {
					action: 'deleteCategory',
					success: false,
					message: 'Cannot delete category. It is referenced elsewhere in the system.'
				});
			}
			// Handle other database errors
			return fail(500, {
				action: 'deleteCategory',
				success: false,
				message: `Failed to delete category. Error: ${err.message}`
			});
		}
	}
};