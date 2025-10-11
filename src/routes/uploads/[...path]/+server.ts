import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

/**
 * This GET handler serves files from the 'uploads' directory.
 * It's necessary for production builds (like in Docker) where
 * the server needs to be explicitly told how to handle these files.
 */
export const GET: RequestHandler = ({ params }) => {
	// Construct the full path to the requested file.
	// params.path will contain everything after /uploads/
	// e.g., if the request is for /uploads/image.jpg, params.path will be 'image.jpg'
	const filePath = path.resolve(process.cwd(), 'uploads', params.path);

	// Security Check: Prevent directory traversal attacks.
	// Ensure the final resolved path is still inside the 'uploads' directory.
	const uploadsDir = path.resolve(process.cwd(), 'uploads');
	if (!filePath.startsWith(uploadsDir)) {
		throw error(403, 'Forbidden');
	}

	try {
		// Check if the file exists at the constructed path
		if (fs.existsSync(filePath)) {
			// Read the file from the filesystem into a buffer
			const fileBuffer = fs.readFileSync(filePath);

			// Determine the correct Content-Type based on the file extension
			const ext = path.extname(filePath).toLowerCase();
			let contentType = 'application/octet-stream'; // Default content type
			if (ext === '.jpg' || ext === '.jpeg') {
				contentType = 'image/jpeg';
			} else if (ext === '.png') {
				contentType = 'image/png';
			} else if (ext === '.webp') {
				contentType = 'image/webp';
			} else if (ext === '.gif') {
				contentType = 'image/gif';
			}

			// Return the file buffer as a new Response object
			return new Response(fileBuffer, {
				status: 200,
				headers: {
					'Content-Type': contentType
				}
			});
		} else {
			// If the file doesn't exist, return a 404 error
			throw error(404, 'Not Found');
		}
	} catch (err) {
		console.error(`Failed to serve file: ${filePath}`, err);
		throw error(500, 'Internal Server Error');
	}
};

// Disable prerendering for this dynamic route
export const prerender = false;
