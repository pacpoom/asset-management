import { error } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import { fileTypeFromBuffer } from 'file-type';

export async function GET({ locals, params }) {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const filePath = path.resolve('uploads', params.path);

	if (!fs.existsSync(filePath)) {
		throw error(404, 'Not Found');
	}

	try {
		const fileBuffer = fs.readFileSync(filePath);

		const mimeTypeResult = await fileTypeFromBuffer(fileBuffer);
		const mimeType = mimeTypeResult ? mimeTypeResult.mime : 'application/octet-stream';

		return new Response(fileBuffer, {
			status: 200,
			headers: {
				'Content-Type': mimeType,
				'Content-Length': fileBuffer.length.toString(),

				'Cache-Control': 'public, max-age=3600'
			}
		});
	} catch (e) {
		console.error('Failed to read file:', e);
		throw error(500, 'Internal Server Error');
	}
}
