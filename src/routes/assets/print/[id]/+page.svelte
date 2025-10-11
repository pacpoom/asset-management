<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';

	export let data: PageData;
	let qrCanvas: HTMLCanvasElement; // ยังคงเก็บไว้เพื่อแสดง QR Code ในหน้า Svelte
	let isGeneratingPdf = false;

	// ไม่ต้องมีการประกาศ declare const QRCode, html2canvas, jspdf อีกต่อไป

	onMount(() => {
		// A simple check to see if the global QRCode object exists
		// โหลด QRCode JS (ยังจำเป็นสำหรับการแสดงผลในหน้า Svelte นี้ก่อนพิมพ์)
		const checkQRCode = () => {
			if (typeof QRCode !== 'undefined') {
				try {
					// Generate QR code once the library is available
					// ปรับขนาด width ภายใน canvas ให้สัมพันธ์กับขนาด CSS
					QRCode.toCanvas(qrCanvas, data.asset.asset_tag, {
						width: 55, // pixels (ลดจาก 75)
						margin: 1,
						errorCorrectionLevel: 'H'
					});
				} catch (err) {
					console.error('Failed to generate QR Code:', err);
				}
			} else {
				// If not loaded, wait and try again
				setTimeout(checkQRCode, 100);
			}
		};
		checkQRCode();
	});

	// ฟังก์ชันใหม่สำหรับเรียก Server Endpoint (POST +server.ts) เพื่อสร้าง PDF
	async function generateAndDownloadPdf(event: Event) {
		event.preventDefault(); // ป้องกันการ Submit form แบบปกติ
		isGeneratingPdf = true;

		try {
			// **เปลี่ยนจากการใช้ FormData ไปเป็น JSON body** เพื่อให้เข้าถึงใน +server.ts ได้ง่ายขึ้น
			const response = await fetch('', { // ใช้ URL ว่างเพื่อเรียกไปยัง POST +server.ts ใน path ปัจจุบัน
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ asset_data: data.asset }) // ส่งข้อมูล Asset เป็น JSON
			});

			// จัดการ Response
			if (response.ok) {
				// Server Endpoint จะส่งไฟล์กลับมาเป็น Response 
				// เราจะอ่าน Response เป็น Blob (จะเป็น PDF หรือ HTML ขึ้นอยู่กับ Server)
				const blob = await response.blob();
                const url = URL.createObjectURL(blob);

				// เปิด URL ใหม่ (จะเป็น PDF หรือ HTML)
				window.open(url, '_blank');
			} else {
				// จัดการ Error
				const errorText = await response.text();
				console.error('Server endpoint failed:', errorText);
				alert('An error occurred while generating the PDF on the server: ' + errorText);
			}
		} catch (err) {
			console.error('Error in network request:', err);
			alert('A network error occurred.');
		} finally {
			isGeneratingPdf = false;
		}
	}
</script>

<svelte:head>
	<title>Print Label - {data.asset.asset_tag}</title>
	<!-- ยังคงต้องโหลด QRCode สำหรับแสดงผลในหน้า Svelte ก่อนพิมพ์ -->
	<script src="https://cdn.jsdelivr.net/npm/qrcode@1/build/qrcode.min.js"></script>
	<!-- ลบ script ของ html2canvas และ jspdf ออก -->
</svelte:head>

<div class="print-container">
	<!-- The actual label for client-side preview (size 50mm x 30mm) -->
	<div id="asset-label" class="label">
		<div class="info">
			<div class="info-line name">
				<span class="info-value">{data.asset.name}</span>
			</div>
			<div class="info-line">
				<span class="info-label">Asset Tag:</span>
				<span class="info-value tag">{data.asset.asset_tag}</span>
			</div>
			<div class="info-line">
				<span class="info-label">Category:</span>
				<span class="info-value">{data.asset.category_name ?? 'N/A'}</span>
			</div>
			<div class="info-line">
				<span class="info-label">Location:</span>
				<span class="info-value">{data.asset.location_name ?? 'N/A'}</span>
			</div>
			<div class="info-line">
				<span class="info-label">Purchase:</span>
				<span class="info-value">{data.asset.purchase_date}</span>
			</div>
		</div>
		<div class="qr-code">
			<canvas bind:this={qrCanvas}></canvas>
		</div>
	</div>

	<!-- Print controls, hidden on print -->
	<div class="controls no-print">
		<!-- เปลี่ยนไปใช้ form/button ที่เรียก Server Action -->
		<button on:click={generateAndDownloadPdf} disabled={isGeneratingPdf} class="print-button">
			{#if isGeneratingPdf}
				Generating PDF...
			{:else}
				Download PDF (Server-side)
			{/if}
		</button>
		<a href="/assets" class="back-button">Back to Assets</a>
	</div>
</div>

<style>
	/* CSS สำหรับแสดงผลในหน้า Svelte (preview) */
	:global(body) {
		background-color: #f0f2f5; 
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif,
			'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';
	}
    /* แก้ไข Layout หลักให้ใช้ Flexbox เต็มหน้าจอและจัดให้อยู่กึ่งกลาง */
	:global(main) {
		display: flex;
		justify-content: center; /* จัดแนวนอนกึ่งกลาง */
		align-items: center; /* จัดแนวตั้งกึ่งกลาง */
		min-height: 100vh;
	}

	.print-container {
		text-align: center;
		padding: 20px; 
        /* เพิ่ม background และ shadow เพื่อให้เป็นเหมือน "กล่อง" ตรงกลาง */
        background-color: white;
        border-radius: 12px;
        box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
        /* กำหนดขนาดสูงสุดเพื่อไม่ให้กว้างเกินไป */
        max-width: 90%;
	}

	/* Label dimensions and styling (for Svelte preview only) */
	.label {
		/* ขนาด 5cm x 3cm สำหรับ Preview */
		width: 50mm; 
		height: 30mm; 
		border: 1px dashed #999;
		padding: 2mm;
		display: flex;
		justify-content: space-between;
		align-items: stretch; 
		background-color: white;
		box-sizing: border-box;
		overflow: hidden;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	.info {
		display: flex;
		flex-direction: column;
		justify-content: space-around; 
		flex-grow: 1;
		padding-right: 2mm;
		text-align: left;
		font-size: 6.5pt; /* ปรับลดขนาดตัวอักษรของข้อมูลหลัก */
		line-height: 1.3;
	}

	.info-line {
		display: flex;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.info-line.name {
		font-size: 7.5pt; /* ปรับลดขนาดตัวอักษรของชื่อ Asset: 8pt -> 7.5pt */
		font-weight: bold;
		margin-bottom: 1mm;
        /* *** แก้ไข: ทำให้ข้อความตัดขึ้นบรรทัดใหม่ได้ 2 บรรทัด *** */
        max-width: 100%; 
        white-space: normal; /* อนุญาตให้ข้อความตัดบรรทัด */
        line-height: 1.1; /* ปรับลด line-height เล็กน้อย */
        max-height: 16.5pt; /* จำกัดความสูง: 7.5pt * 1.1 * 2 = 16.5pt (ประมาณ 2 บรรทัด) */
        overflow: hidden;
	}
    /* ลบ CSS ที่ทำให้ตัดด้วยจุดไข่ปลาออก */
    .info-line.name .info-value {
        /* ลบ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ออก */
    }

	.info-label {
		font-weight: 600;
		color: #333;
		margin-right: 1.5mm;
		flex-shrink: 0;
	}

	.info-value {
		color: #555;
		/* ลบ overflow, text-overflow, white-space ออกจาก info-value ทั่วไป */
	}

	.info-value.tag {
		font-family: 'Courier New', Courier, monospace;
	}

	.qr-code {
		display: flex;
		/* *** การแก้ไขที่ 3: จัด QR code ให้อยู่ด้านล่างขวา (ชิดด้านล่าง) *** */
        align-items: flex-end; /* จัดให้อยู่ชิดด้านล่าง */
		justify-content: center;
		flex-shrink: 0;
		/* *** การแก้ไขที่ 4: ลดขนาด QR Code (15mm -> 12mm) *** */
		width: 12mm; 
		height: 12mm;
        /* ลบ align-self: center; ออก */
	}

	.controls {
		margin-top: 20px;
        display: flex;
        justify-content: center;
        gap: 15px; /* เพิ่มระยะห่างระหว่างปุ่ม */
	}

	.print-button,
	.back-button {
		display: inline-block;
		margin: 0; /* ลบ margin เดิมออก */
		padding: 10px 20px;
		border: none;
		border-radius: 5px;
		color: white;
		background-color: #3b82f6; /* Blue-600 */
		cursor: pointer;
		text-decoration: none;
		font-size: 16px;
		transition: background-color 0.2s;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}
	.print-button:hover {
		background-color: #2563eb;
	}
	.print-button:disabled {
		background-color: #93c5fd; /* Blue-300 */
		cursor: not-allowed;
	}

	.back-button {
		background-color: #6b7280; /* Gray-500 */
	}
	.back-button:hover {
		background-color: #4b5563;
	}

	/* Print-specific styles (สำหรับใช้ในการพิมพ์ด้วย Ctrl+P โดยตรง) */
	@media print {
		/* ซ่อนปุ่มควบคุมเมื่อสั่งพิมพ์ */
		.no-print {
			display: none !important;
		}
        /* ยกเลิกการจัดกึ่งกลางเพื่อให้พิมพ์ได้เต็มหน้ากระดาษ */
        :global(main) {
            display: block; 
            min-height: auto;
        }
        .print-container {
            padding: 0;
            margin: 0;
            box-shadow: none;
            background-color: transparent;
        }

		/* กำหนดขนาดหน้ากระดาษสำหรับการสั่งพิมพ์ปกติ (Ctrl+P) */
		@page {
			size: 50mm 30mm;
			margin: 0;
		}
		
		/* จัดการ Label ให้ไม่มีขอบและจัดวางพอดี */
		.label {
			border: none; 
			margin: 0;
			padding: 0;
			width: 50mm; 
			height: 30mm;
			box-shadow: none;
			page-break-after: always; 
		}
        /* ต้องกำหนดขนาด QR code ใน media print ด้วย */
        .qr-code {
            width: 12mm; 
            height: 12mm;
            align-items: flex-end; /* จัดให้อยู่ชิดด้านล่าง */
        }
        /* ต้องปรับขนาดฟอนต์ใน media print สำหรับชื่อ Asset ด้วย */
        .info-line.name {
            font-size: 7.5pt; /* ปรับ font-size ในการพิมพ์ */
            max-height: 16.5pt; /* 2 บรรทัด */
        }
	}
</style>
