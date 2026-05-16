import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

interface AdvanceApp extends RowDataPacket {
	id: number;
	document_number: string;
	document_date: string;
	application_title: string;
	reason: string;
	amount: number;
	remark: string | null;
	status: string;
	bank_name: string | null;
	bank_account: string | null;
	creator_name: string | null;
}

interface CompanyData extends RowDataPacket {
	name: string;
	logo_path: string | null;
	address_line_1: string | null;
	address_line_2: string | null;
	tax_id: string | null;
	phone: string | null;
}

interface TxSummary extends RowDataPacket {
	total_spent: number;
	total_refund: number;
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
				const data = fs.readFileSync(p);
				const ext = path.extname(p).replace('.', '').replace('jpg', 'jpeg');
				return `data:image/${ext};base64,${data.toString('base64')}`;
			}
		} catch {}
	}
	return null;
}

function formatCurrencyTH(n: number) {
	return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTH(d: string) {
	if (!d) return '-';
	const date = new Date(d);
	return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', calendar: 'gregory' });
}

function statusLabel(s: string) {
	switch (s) {
		case 'Approved': return 'อนุมัติแล้ว';
		case 'Rejected': return 'ปฏิเสธ';
		case 'Completed': return 'เสร็จสิ้น';
		default: return 'รอดำเนินการ';
	}
}

function statusColor(s: string) {
	switch (s) {
		case 'Approved': return '#16a34a';
		case 'Rejected': return '#dc2626';
		case 'Completed': return '#2563eb';
		default: return '#d97706';
	}
}

export const GET: RequestHandler = async ({ params, request }) => {
	const id = parseInt(params.id);
	if (!id) throw error(400, 'Invalid ID');

	const origin = new URL(request.url).origin;
	const applyUrl = `${origin}/advance-expense/apply/${id}`;
	const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(applyUrl)}&size=200&margin=1&ecLevel=M`;

	try {
		const [appRows] = await pool.execute<AdvanceApp[]>(
			`SELECT aa.*, b.bank_name AS bank_name, b.account_number AS bank_account, u.full_name AS creator_name
			 FROM advance_applications aa
			 LEFT JOIN banks b ON aa.bank_id = b.id
			 LEFT JOIN users u ON aa.created_by = u.id
			 WHERE aa.id = ?`,
			[id]
		);
		if (!appRows.length) throw error(404, 'ไม่พบเอกสาร');
		const app = appRows[0];

		let company: CompanyData | null = null;
		let logoBase64: string | null = null;
		try {
			const [companyRows] = await pool.execute<CompanyData[]>('SELECT * FROM company LIMIT 1');
			if (companyRows.length) {
				company = companyRows[0];
				logoBase64 = getLogoBase64(company.logo_path);
			}
		} catch {}

		const [txSummary] = await pool.execute<TxSummary[]>(
			`SELECT
				COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS total_spent,
				COALESCE(SUM(CASE WHEN type='refund' THEN amount ELSE 0 END),0) AS total_refund
			 FROM advance_transactions WHERE advance_application_id = ?`,
			[id]
		);
		const totalSpent = Number(txSummary[0]?.total_spent || 0);
		const totalRefund = Number(txSummary[0]?.total_refund || 0);
		const balance = Number(app.amount) - totalSpent + totalRefund;

		const logoHtml = logoBase64
			? `<img src="${logoBase64}" style="max-height:60px;max-width:160px;object-fit:contain;" alt="Logo">`
			: '';

		const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Advance Control - ${app.document_number}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', Arial, sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; }
  @media print {
    @page { size: A4; margin: 15mm 12mm; }
    body { font-size: 12px; }
    .no-print { display: none !important; }
    .page-break { page-break-after: always; }
  }
  .page { max-width: 780px; margin: 0 auto; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1d4ed8; padding-bottom: 14px; margin-bottom: 16px; }
  .company-info h1 { font-size: 16px; font-weight: 700; color: #1d4ed8; }
  .company-info p { font-size: 11px; color: #555; margin-top: 2px; }
  .doc-title { text-align: center; margin-bottom: 18px; }
  .doc-title h2 { font-size: 20px; font-weight: 700; color: #1d4ed8; letter-spacing: 0.5px; }
  .doc-title p { color: #666; font-size: 12px; margin-top: 3px; }
  .doc-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .field { margin-bottom: 8px; }
  .field-label { font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .field-value { font-size: 13px; color: #111; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; color: #fff; }
  .info-box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 16px; background: #f9fafb; }
  .info-box h3 { font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  .balance-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .balance-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; text-align: center; }
  .balance-card .label { font-size: 10px; font-weight: 600; color: #6b7280; margin-bottom: 4px; }
  .balance-card .value { font-size: 15px; font-weight: 700; }
  .qr-section { display: flex; align-items: center; gap: 20px; border: 2px dashed #3b82f6; border-radius: 12px; padding: 14px 18px; margin-bottom: 20px; background: #eff6ff; }
  .qr-section img { width: 120px; height: 120px; flex-shrink: 0; }
  .qr-info h3 { font-size: 14px; font-weight: 700; color: #1d4ed8; margin-bottom: 6px; }
  .qr-info p { font-size: 11px; color: #374151; line-height: 1.5; }
  .qr-url { font-size: 10px; color: #6b7280; word-break: break-all; margin-top: 4px; }
  .sig-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 24px; }
  .sig-box { border-top: 1px solid #d1d5db; padding-top: 8px; text-align: center; }
  .sig-box .title { font-size: 11px; font-weight: 600; color: #374151; }
  .sig-box .line { height: 36px; }
  .sig-box .name { font-size: 11px; color: #6b7280; margin-top: 4px; }
  .print-btn { position: fixed; bottom: 20px; right: 20px; background: #2563eb; color: white; border: none; border-radius: 50%; width: 52px; height: 52px; font-size: 22px; cursor: pointer; box-shadow: 0 4px 12px rgba(37,99,235,0.4); display: flex; align-items: center; justify-content: center; }
  .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 80px; font-weight: 900; color: rgba(0,0,0,0.04); pointer-events: none; white-space: nowrap; z-index: 0; }
</style>
</head>
<body>
<div class="watermark">ADVANCE CONTROL</div>

<div class="page">
  <!-- Header -->
  <div class="header">
    <div class="company-info">
      ${logoHtml}
      <h1>${company?.name || 'บริษัท'}</h1>
      ${company?.address_line_1 ? `<p>${company.address_line_1}${company.address_line_2 ? ' ' + company.address_line_2 : ''}</p>` : ''}
      ${company?.tax_id ? `<p>เลขประจำตัวผู้เสียภาษี: ${company.tax_id}</p>` : ''}
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">เอกสารเลขที่</div>
      <div style="font-size:20px;font-weight:800;color:#1d4ed8;font-family:monospace;">${app.document_number}</div>
      <div style="margin-top:6px;">
        <span class="status-badge" style="background-color:${statusColor(app.status)};">${statusLabel(app.status)}</span>
      </div>
    </div>
  </div>

  <!-- Title -->
  <div class="doc-title">
    <h2>ใบควบคุมเงินทดรองจ่าย (Advance Control)</h2>
    <p>วันที่เอกสาร: ${formatDateTH(app.document_date)}</p>
  </div>

  <!-- Document Info -->
  <div class="info-box">
    <h3>ข้อมูลการขอเบิก</h3>
    <div class="doc-meta">
      <div>
        <div class="field">
          <div class="field-label">หัวข้อการขอเบิก</div>
          <div class="field-value" style="font-weight:600;">${app.application_title}</div>
        </div>
        <div class="field">
          <div class="field-label">ธนาคาร</div>
          <div class="field-value">${app.bank_name || '-'}${app.bank_account ? ` / ${app.bank_account}` : ''}</div>
        </div>
        <div class="field">
          <div class="field-label">ผู้สร้างเอกสาร</div>
          <div class="field-value">${app.creator_name || '-'}</div>
        </div>
      </div>
      <div>
        <div class="field">
          <div class="field-label">เหตุผลการขอเบิก</div>
          <div class="field-value">${app.reason}</div>
        </div>
        ${app.remark ? `<div class="field"><div class="field-label">หมายเหตุ</div><div class="field-value">${app.remark}</div></div>` : ''}
      </div>
    </div>
  </div>

  <!-- Balance Summary -->
  <div class="balance-grid">
    <div class="balance-card" style="border-color:#bfdbfe;background:#eff6ff;">
      <div class="label" style="color:#1d4ed8;">ยอดขอเบิก</div>
      <div class="value" style="color:#1d4ed8;">${formatCurrencyTH(app.amount)}</div>
      <div style="font-size:10px;color:#6b7280;">บาท</div>
    </div>
    <div class="balance-card" style="border-color:#fed7aa;background:#fff7ed;">
      <div class="label" style="color:#ea580c;">ใช้ไปแล้ว</div>
      <div class="value" style="color:#ea580c;">${formatCurrencyTH(totalSpent)}</div>
      <div style="font-size:10px;color:#6b7280;">บาท</div>
    </div>
    <div class="balance-card" style="border-color:#e9d5ff;background:#faf5ff;">
      <div class="label" style="color:#7c3aed;">คืนเงิน</div>
      <div class="value" style="color:#7c3aed;">${formatCurrencyTH(totalRefund)}</div>
      <div style="font-size:10px;color:#6b7280;">บาท</div>
    </div>
    <div class="balance-card" style="border-color:${balance < 0 ? '#fecaca' : '#bbf7d0'};background:${balance < 0 ? '#fef2f2' : '#f0fdf4'};">
      <div class="label" style="color:${balance < 0 ? '#dc2626' : '#16a34a'};">คงเหลือ</div>
      <div class="value" style="color:${balance < 0 ? '#dc2626' : '#16a34a'};">${formatCurrencyTH(balance)}</div>
      <div style="font-size:10px;color:#6b7280;">บาท</div>
    </div>
  </div>

  <!-- QR Section -->
  <div class="qr-section">
    <img src="${qrUrl}" alt="QR Code" />
    <div class="qr-info">
      <h3>สแกน QR เพื่อบันทึกค่าใช้จ่าย</h3>
      <p>
        สแกน QR Code นี้ด้วยกล้องมือถือ เพื่อเปิดแบบฟอร์มบันทึกค่าใช้จ่าย<br>
        สามารถเลือก Job Order, กรอกรายละเอียด และถ่ายรูป Invoice / สลิปโอนเงินได้โดยตรงจากมือถือ
      </p>
      <div class="qr-url">${applyUrl}</div>
    </div>
  </div>

  <!-- Signature -->
  <div class="sig-grid">
    <div class="sig-box">
      <div class="line"></div>
      <div class="title">ผู้สร้างเอกสาร</div>
      <div class="name">${app.creator_name || '................................'}</div>
      <div class="name">วันที่: ..................................</div>
    </div>
    <div class="sig-box">
      <div class="line"></div>
      <div class="title">ผู้ตรวจสอบ</div>
      <div class="name">................................</div>
      <div class="name">วันที่: ..................................</div>
    </div>
    <div class="sig-box">
      <div class="line"></div>
      <div class="title">ผู้อนุมัติ</div>
      <div class="name">................................</div>
      <div class="name">วันที่: ..................................</div>
    </div>
  </div>

  <div style="margin-top:16px;border-top:1px solid #e5e7eb;padding-top:8px;text-align:center;font-size:10px;color:#9ca3af;">
    พิมพ์วันที่: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })} | ${app.document_number}
  </div>
</div>

<button class="print-btn no-print" onclick="window.print()" title="พิมพ์">🖨</button>

<script>
  window.onload = function() {
    // Auto-print on load if ?print=1
    if (new URLSearchParams(window.location.search).get('print') === '1') {
      setTimeout(() => window.print(), 800);
    }
  };
<\/script>
</body>
</html>`;

		return new Response(html, {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'no-store'
			}
		});
	} catch (err: any) {
		if (err.status) throw err;
		throw error(500, err.message);
	}
};
