import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';

// Define a type for our asset data
interface Asset extends RowDataPacket {
	id: number;
	name: string;
	asset_tag: string;
    purchase_date: string;
    category_name: string | null;
    location_name: string | null;
}

/**
 * Handle POST request to generate the PDF/HTML label file.
 * This replaces the failing Server Action.
 */
export const POST: RequestHandler = async ({ request, params }) => {
    // The client sends the asset data in the body
    const body = await request.json(); // Read JSON body since we're using a POST fetch without formData
    const asset: Asset = body.asset_data;

    if (!asset || asset.id.toString() !== params.id) {
        // Basic validation check
        throw error(400, 'Invalid asset data received.');
    }

    // ----------------------------------------------------------------
    // 1. สร้าง HTML/CSS สำหรับฉลากขนาด 50mm x 30mm
    // ----------------------------------------------------------------
    // สไตล์ CSS ต้อง Inline หรืออยู่ใน <style> เพื่อให้ไลบรารี PDF อ่านได้สมบูรณ์
    const labelHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                /* กำหนดขนาดหน้ากระดาษและขอบ (สำคัญมากสำหรับ dompdf/puppeteer) */
                @page {
                    size: 50mm 30mm; /* 5cm x 3cm */
                    margin: 0;
                }

                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 1mm 2mm; /* เพิ่ม padding ด้านซ้าย/ขวาเป็น 2mm */
                    height: 30mm;
                    width: 50mm;
                    box-sizing: border-box;
                    /* ใช้ flexbox ใน body เพื่อจัดเนื้อหาให้เต็มหน้า */
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
                    /* จัดระยะห่างระหว่างบรรทัดให้ยืดจากบนลงล่าง */
                    justify-content: space-between; 
                    flex-grow: 1;
                    padding-right: 1mm;
                    text-align: left;
                    /* ปรับขนาดฟอนต์ของข้อมูลหลักขึ้นเป็น 8pt */
                    font-size: 8pt; 
                    line-height: 1.2;
                    overflow: hidden;
                }

                .info-line {
                    display: flex;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .info-line.name {
                    /* ปรับขนาดฟอนต์ชื่อ Asset: 8pt -> 7.5pt */
                    font-size: 7.5pt; 
                    font-weight: bold;
                    margin-bottom: 0.5mm;
                    color: #000;
                    /* แก้ไขเพื่อให้แสดงผล 2 บรรทัดและตัดด้วย ... */
                    display: -webkit-box;
                    -webkit-line-clamp: 2; /* จำกัดสูงสุด 2 บรรทัด */
                    -webkit-box-orient: vertical;
                    overflow: hidden; 
                    white-space: normal; /* อนุญาตให้ข้อความตัดบรรทัด */
                }
                
                /* ลบ CSS ที่ทำให้ตัดเป็น ... ออกจากชื่อ Asset */
                .info-line.name .info-value {
                    /* ลบ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ออก */
                    line-height: 1; 
                }

                .info-label {
                    /* **แก้ไข: ทำให้ข้อความป้ายกำกับเข้มขึ้น (เหมือนตัวอย่าง)** */
                    font-weight: bold; 
                    color: #000;
                    margin-right: 2mm; /* เพิ่มระยะห่างหลังป้ายกำกับเล็กน้อย */
                    flex-shrink: 0;
                }

                .info-value {
                    /* **แก้ไข: ทำให้ค่าข้อมูลเข้มขึ้น** */
                    color: #000; 
                    font-weight: normal;
                }
                
                /* ขนาด 10mm และจัดให้อยู่ชิดขอบล่าง (ปรับให้เล็กลงตามคำขอ) */
                .qr-code {
                    flex-shrink: 0;
                    width: 10mm; 
                    height: 10mm;
                    display: flex;
                    align-items: flex-end; /* จัดให้อยู่ชิดด้านล่าง */
                    justify-content: center;
                }
                .qr-code img {
                    width: 100%;
                    height: 100%;
                }
            </style>
        </head>
        <body>
            <div class="label">
                <div class="info">
                    <div class="info-line name">
                        <span class="info-value">${asset.name}</span>
                    </div>
                    <div class="info-line">
                        <span class="info-label">Tag:</span>
                        <span class="info-value">${asset.asset_tag}</span>
                    </div>
                    <div class="info-line">
                        <span class="info-label">Cat:</span>
                        <span class="info-value">${asset.category_name ?? 'N/A'}</span>
                    </div>
                    <div class="info-line">
                        <span class="info-label">Loc:</span>
                        <span class="info-value">${asset.location_name ?? 'N/A'}</span>
                    </div>
                    <div class="info-line">
                        <span class="info-label">Date:</span>
                        <span class="info-value">${asset.purchase_date}</span>
                    </div>
                </div>
                
                <div class="qr-code">
                    <!-- ใช้ QuickChart.io เพื่อสร้าง QR Code URL ชั่วคราว -->
                    <img src="https://quickchart.io/qr?text=${asset.asset_tag}&size=50&margin=0" alt="QR Code" />
                </div>
            </div>
        </body>
        </html>
    `;

    // ----------------------------------------------------------------
    // 2. ส่ง HTML กลับไปยัง Client 
    // ----------------------------------------------------------------
    
    return new Response(labelHtml, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8', 
            'Content-Disposition': `inline; filename="label-${asset.asset_tag}.html"`,
            'Access-Control-Allow-Origin': '*'
        }
    });
};