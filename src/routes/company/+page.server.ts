import { fail, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database'; // Use the pool directly
import { checkPermission } from '$lib/server/auth';
import type { RowDataPacket } from 'mysql2';
import fs from 'fs/promises';
import path from 'path';

// Type for Company Data based on company.sql
interface CompanyData extends RowDataPacket {
	id: number;
	name: string;
	logo_path: string | null;
	address_line_1: string | null;
	address_line_2: string | null;
	city: string | null;
	state_province: string | null;
	postal_code: string | null;
	country: string | null;
	phone: string | null;
	email: string | null;
	website: string | null;
	tax_id: string | null;
}

// --- File Handling Helpers (Similar to assets/customers) ---
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'company'); // Specific directory

async function saveLogo(logoFile: File): Promise<string | null> {
	if (!logoFile || logoFile.size === 0) return null;
	let uploadPath = '';
	try {
		await fs.mkdir(UPLOADS_DIR, { recursive: true });
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		// Sanitize and keep original extension
		const ext = path.extname(logoFile.name);
		const baseName = path.basename(logoFile.name, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
		const filename = `${baseName}-${uniqueSuffix}${ext}`;
		uploadPath = path.join(UPLOADS_DIR, filename);

		console.log(`saveLogo: Attempting to write logo to ${uploadPath}`);
		await fs.writeFile(uploadPath, Buffer.from(await logoFile.arrayBuffer()));
		console.log(`saveLogo: Successfully wrote logo ${uploadPath}`);

		const relativePath = `/uploads/company/${filename}`; // Adjusted path
		return relativePath;
	} catch (uploadError: any) {
		console.error(`saveLogo Error: ${uploadError.message}`, uploadError.stack);
		if (uploadPath) { try { if (await fs.stat(uploadPath)) await fs.unlink(uploadPath); } catch (e) { /* ignore */ } }
		throw new Error(`Failed to save logo file "${logoFile.name}". Reason: ${uploadError.message}`);
	}
}

async function deleteLogo(logoPath: string | null | undefined) {
	if (!logoPath) return;
	try {
		const filename = path.basename(logoPath);
		const fullPath = path.join(UPLOADS_DIR, filename);
		console.log(`deleteLogo: Attempting to delete ${fullPath}`);
		await fs.unlink(fullPath);
		console.log(`deleteLogo: Successfully deleted logo: ${fullPath}`);
	} catch (error: any) {
		if (error.code !== 'ENOENT') {
			console.error(`deleteLogo Error: ${error.message}`, error.stack);
			// Optional: Don't throw, just log
		} else {
			console.log(`deleteLogo: File not found, skipping delete: ${logoPath}`);
		}
	}
}

// --- Load Function ---
// Fetches the single company record (ID = 1)
export const load: PageServerLoad = async ({ locals }) => {
	checkPermission(locals, 'manage settings'); // Ensure user has permission

	try {
		const [rows] = await pool.execute<CompanyData[]>(
			`SELECT * FROM company WHERE id = ? LIMIT 1`,
			[1] // Fetch the company with ID 1
		);

		let companyData: Partial<CompanyData> | null = null;
		if (rows.length > 0) {
			companyData = rows[0];
		} else {
			// Provide default empty values if no record exists yet
			companyData = { id: 1, name: '' };
		}

		return { company: companyData };

	} catch (err: any) {
		console.error('Failed to load company data:', err.message, err.stack);
		throw error(500, `Failed to load company data. Error: ${err.message}`);
	}
};

// --- Actions ---
export const actions: Actions = {
	/**
	 * Action: Save Company Details (Upsert for ID 1)
	 */
	save: async ({ request, locals }) => {
		checkPermission(locals, 'manage settings');
		const formData = await request.formData();

		const data = {
			name: formData.get('name')?.toString()?.trim() || '',
			address_line_1: formData.get('address_line_1')?.toString()?.trim() || null,
			address_line_2: formData.get('address_line_2')?.toString()?.trim() || null,
			city: formData.get('city')?.toString()?.trim() || null,
			state_province: formData.get('state_province')?.toString()?.trim() || null,
			postal_code: formData.get('postal_code')?.toString()?.trim() || null,
			country: formData.get('country')?.toString()?.trim() || null,
			phone: formData.get('phone')?.toString()?.trim() || null,
			email: formData.get('email')?.toString()?.trim() || null,
			website: formData.get('website')?.toString()?.trim() || null,
			tax_id: formData.get('tax_id')?.toString()?.trim() || null,
		};

		// Basic validation
		if (!data.name) {
			return fail(400, { success: false, message: 'Company Name is required.' });
		}

		const logoFile = formData.get('logo') as File | null;
		const removeLogo = formData.get('remove_logo') === 'true';
		const existingLogoPath = formData.get('existing_logo_path')?.toString() || null;

		let newLogoPath: string | null = existingLogoPath; // Start with existing
		let savedLogoTempPath: string | null = null; // Track newly saved path for rollback

		const connection = await pool.getConnection();

		try {
			await connection.beginTransaction();

			// Handle logo upload/removal
			if (logoFile && logoFile.size > 0) {
				savedLogoTempPath = await saveLogo(logoFile);
				newLogoPath = savedLogoTempPath; // Set path to the newly saved logo
				// Old logo deletion happens *after* commit
			} else if (removeLogo && existingLogoPath) {
				newLogoPath = null; // Clear the logo path
				// Old logo deletion happens *after* commit
			}

			// Upsert logic: Try to update first, if no rows affected, insert.
			const updateSql = `
                UPDATE company SET
                    name = ?, logo_path = ?, address_line_1 = ?, address_line_2 = ?,
                    city = ?, state_province = ?, postal_code = ?, country = ?,
                    phone = ?, email = ?, website = ?, tax_id = ?
                WHERE id = ?`;
			const [updateResult] = await connection.execute(updateSql, [
				data.name, newLogoPath, data.address_line_1, data.address_line_2,
				data.city, data.state_province, data.postal_code, data.country,
				data.phone, data.email, data.website, data.tax_id,
				1 // Always update ID 1
			]);

			// If update didn't affect any rows (meaning ID 1 didn't exist), insert it.
			if ((updateResult as any).affectedRows === 0) {
				const insertSql = `
                    INSERT INTO company (
                        id, name, logo_path, address_line_1, address_line_2, city, state_province,
                        postal_code, country, phone, email, website, tax_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
				await connection.execute(insertSql, [
					1, // Always insert ID 1
					data.name, newLogoPath, data.address_line_1, data.address_line_2, data.city, data.state_province,
					data.postal_code, data.country, data.phone, data.email, data.website, data.tax_id
				]);
			}

			await connection.commit();

			// Delete old logo only after successful commit
			if (existingLogoPath && (newLogoPath !== existingLogoPath)) {
				await deleteLogo(existingLogoPath);
			}

			return { success: true, message: 'Company details saved successfully.', logoPath: newLogoPath };

		} catch (err: any) {
			await connection.rollback();
			// If a new logo was saved but DB failed, delete the temporary logo file
			if (savedLogoTempPath) {
				await deleteLogo(savedLogoTempPath);
			}
			console.error('Failed to save company details:', err.message, err.stack);
			return fail(500, { success: false, message: `Failed to save company details. Error: ${err.message}` });
		} finally {
			connection.release();
		}
	},
};