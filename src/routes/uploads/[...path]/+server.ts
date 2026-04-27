import { error } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import { fileTypeFromBuffer } from 'file-type';

export async function GET({ locals, params }) {
    const isPublic = params.path.startsWith('company/') || params.path.startsWith('company\\');

    if (!isPublic && !locals.user) {
        throw error(401, 'Unauthorized');
    }

    // Normalize path to prevent directory traversal and handle leading slashes safely
    const safePath = path.normalize(params.path).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(process.cwd(), 'uploads', safePath);

    if (!fs.existsSync(filePath)) {
        throw error(404, `Not Found: ${filePath}`);
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