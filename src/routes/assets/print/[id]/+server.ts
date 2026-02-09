import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

interface CompanyData extends RowDataPacket {
	id: number;
	name: string;
	logo_path: string | null;
}

interface Asset extends RowDataPacket {
	id: number;
	name: string;
	asset_tag: string;
	purchase_date: string;
	category_name: string | null;
	location_name: string | null;
}

function getLogoBase64(logoPath: string | null | undefined): string | null {
	if (!logoPath) return null;
	const tryPaths = [
		path.resolve(process.cwd(), logoPath.startsWith('/') ? logoPath.slice(1) : logoPath),
		path.resolve(process.cwd(), 'static', logoPath.startsWith('/') ? logoPath.slice(1) : logoPath),
		path.resolve(process.cwd(), 'uploads/company/Logo.png'),
		path.resolve(process.cwd(), 'uploads/company/logo.png'),
		path.resolve(process.cwd(), 'static/logo.png')
	];

	for (const p of tryPaths) {
		try {
			if (fs.existsSync(p)) {
				const fileData = fs.readFileSync(p);
				const ext = path.extname(p).replace('.', '');
				return `data:image/${ext};base64,${fileData.toString('base64')}`;
			}
		} catch (e) {
			continue;
		}
	}
	return null;
}

/**
 * Handle POST request to generate the PDF/HTML label file.
 */
export const POST: RequestHandler = async ({ request, params }) => {
	const body = await request.json();
	const asset: Asset = body.asset_data;

	if (!asset || asset.id.toString() !== params.id) {
		throw error(400, 'Invalid asset data received.');
	}

	let logoBase64: string | null = null;
	try {
		const [companies] = await pool.execute<CompanyData[]>('SELECT * FROM company LIMIT 1');
		if (companies.length > 0) {
			logoBase64 = getLogoBase64(companies[0].logo_path);
		}
	} catch (dbError) {
		console.error('Error fetching company data:', dbError);
	}

	const logoHtml = logoBase64
		? `<img src="${logoBase64}" style="max-height: 6mm; display: block; margin-bottom: 1mm;" alt="Logo" />`
		: '';

	const labelHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                @page {
                    size: 50mm 30mm; /* 5cm x 3cm */
                    margin: 0;
                }

                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 1mm 2mm; 
                    height: 30mm;
                    width: 50mm;
                    box-sizing: border-box;
                    display: flex; 
                    flex-direction: column;
                }

                .label {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    justify-content: space-between;
                    align-items: stretch;
                    box-sizing: border-box;
                }

                .info {
                    display: flex;
                    flex-direction: column;
                    justify-content: flex-start; /* เปลี่ยนเป็น flex-start เพื่อเรียงจากบนลงล่าง */
                    flex-grow: 1;
                    padding-right: 1mm;
                    text-align: left;
                    font-size: 7pt; /* ปรับลดขนาดลงนิดหน่อยเพื่อให้พอดีกับโลโก้ */
                    line-height: 1.1;
                    overflow: hidden;
                }

                .info-line {
                    display: flex;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    margin-bottom: 0.5mm; /* ระยะห่างระหว่างบรรทัด */
                }

                .info-line.name {
                    font-size: 7.5pt; 
                    font-weight: bold;
                    margin-bottom: 1mm;
                    color: #000;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden; 
                    white-space: normal;
                }
                
                .info-line.name .info-value {
                    line-height: 1; 
                }

                .info-label {
                    font-weight: bold; 
                    color: #000;
                    margin-right: 2mm; 
                    flex-shrink: 0;
                    width: 20px; /* จัดให้ Label ตรงกัน */
                }

                .info-value {
                    color: #000; 
                    font-weight: normal;
                }
                
                .qr-code {
                    flex-shrink: 0;
                    width: 12mm; /* ขยาย QR Code เล็กน้อย */
                    height: 100%; /* ให้เต็มความสูงด้านขวา */
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }
                .qr-code img {
                    width: 100%;
                    height: auto;
                }
            </style>
        </head>
        <body>
            <div class="label">
                <div class="info">
                    ${logoHtml}

                    <div class="info-line name">
                        <span class="info-value">${asset.name}</span>
                    </div>
                    <div class="info-line">
                        <span class="info-label">Tag:</span>
                        <span class="info-value">${asset.asset_tag}</span>
                    </div>
                    <div class="info-line">
                        <span class="info-label">Cat:</span>
                        <span class="info-value">${asset.category_name ?? '-'}</span>
                    </div>
                    <div class="info-line">
                        <span class="info-label">Loc:</span>
                        <span class="info-value">${asset.location_name ?? '-'}</span>
                    </div>
                    <div class="info-line">
                        <span class="info-label">Date:</span>
                        <span class="info-value">${asset.purchase_date}</span>
                    </div>
                </div>
                
                <div class="qr-code">
                    <img src="https://quickchart.io/qr?text=${asset.asset_tag}&size=100&margin=0" alt="QR Code" />
                </div>
            </div>
        </body>
        </html>
    `;

	return new Response(labelHtml, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Content-Disposition': `inline; filename="label-${asset.asset_tag}.html"`,
			'Access-Control-Allow-Origin': '*'
		}
	});
};
