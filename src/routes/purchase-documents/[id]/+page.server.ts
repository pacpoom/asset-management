import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import { env } from '$env/dynamic/private';
import { sendMail } from '$lib/server/mailer';
import { canAccessPurchaseDocumentByDepartment } from '$lib/purchaseDocumentAccess';

function splitEmailList(raw: string | undefined): string[] {
	return (raw || '')
		.split(/[;,]/g)
		.map((s) => s.trim())
		.filter(Boolean);
}

function escapeHtml(value: unknown): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function formatMoney(value: unknown): string {
	const num = Number(value ?? 0);
	if (Number.isNaN(num)) return '0.00';
	return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function formatDateForMail(value: unknown): string {
	if (!value) return '-';
	const date = new Date(String(value));
	if (Number.isNaN(date.getTime())) return escapeHtml(value);
	return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });
}

function buildPurchaseRequisitionEmailHtml(document: any, items: any[], documentUrl: string): string {
	const rowsHtml = items
		.map((item, index) => {
			const vatText =
				Number(item.vat_type) === 1
					? 'Inc. VAT'
					: Number(item.vat_type) === 2
						? 'VAT 7%'
						: Number(item.vat_type) === 3
							? 'Non-VAT'
							: 'Non-VAT';
			const whtText = Number(item.wht_rate || 0) > 0 ? `${escapeHtml(item.wht_rate)}%` : '-';
			return `
				<tr>
					<td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#111827;">${index + 1}</td>
					<td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#111827;">${escapeHtml(item.description)}</td>
					<td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#111827;text-align:right;">${escapeHtml(item.quantity)}</td>
					<td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#111827;">${escapeHtml(item.unit_symbol || '-')}</td>
					<td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#111827;text-align:right;">THB ${formatMoney(item.unit_price)}</td>
					<td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#1d4ed8;text-align:center;">${vatText}</td>
					<td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#dc2626;text-align:center;">${whtText}</td>
					<td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#111827;text-align:right;">THB ${formatMoney(item.line_total)}</td>
				</tr>
			`;
		})
		.join('');

	const attachmentName =
		String(document.first_attachment_name || '').trim() || String(document.first_attachment_file || '').trim();
	const statusColor =
		document.status === 'Sent'
			? '#2563eb'
			: document.status === 'Draft'
				? '#d97706'
				: document.status === 'Paid'
					? '#16a34a'
					: '#6b7280';

	return `
		<div style="font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;padding:20px;color:#111827;">
			<div style="max-width:980px;margin:0 auto;background:#ffffff;border:1px solid #d1d5db;border-radius:10px;padding:20px;">
				<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
					<tr>
						<td style="font-size:26px;font-weight:700;color:#0f172a;">Purchase Requisition (PR)</td>
						<td style="text-align:right;">
							<span style="display:inline-block;background:${statusColor};color:#fff;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;">
								${escapeHtml(document.status || 'Sent')}
							</span>
						</td>
					</tr>
				</table>
				<table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
					<tr>
						<td style="padding:4px 0;font-size:13px;color:#374151;"><strong>Vendor:</strong> ${escapeHtml(document.vendor_name || '-')}</td>
						<td style="padding:4px 0;font-size:13px;color:#374151;text-align:right;"><strong>Job Order:</strong> ${escapeHtml(document.job_number || '-')}</td>
					</tr>
					<tr>
						<td style="padding:4px 0;font-size:13px;color:#374151;"><strong>Reference:</strong> ${escapeHtml(document.reference_doc || '-')}</td>
						<td style="padding:4px 0;font-size:13px;color:#374151;text-align:right;"><strong>Document No:</strong> #${escapeHtml(document.document_number || '-')}</td>
					</tr>
					<tr>
						<td style="padding:4px 0;font-size:13px;color:#374151;"><strong>Date:</strong> ${formatDateForMail(document.document_date)}</td>
						<td style="padding:4px 0;font-size:13px;color:#374151;text-align:right;"><strong>Credit Term:</strong> ${escapeHtml(document.credit_term || 0)} days</td>
					</tr>
				</table>
				<div style="margin-bottom:14px;padding:10px 12px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:8px;font-size:13px;color:#1e3a8a;">
					<strong>Open PR:</strong>
					<a href="${escapeHtml(documentUrl)}" style="color:#1d4ed8;text-decoration:underline;word-break:break-all;">${escapeHtml(documentUrl)}</a>
				</div>
				<div style="border:1px solid #334155;border-radius:8px;padding:14px;margin-bottom:14px;">
					<table style="width:100%;border-collapse:collapse;">
						<tr>
							<td style="width:34%;vertical-align:top;padding-right:10px;">
								<div style="font-size:11px;font-weight:700;color:#334155;margin-bottom:4px;">VENDOR</div>
								<div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:2px;">${escapeHtml(document.vendor_name || '-')}</div>
								<div style="font-size:12px;color:#374151;line-height:1.5;">${escapeHtml(document.vendor_address || '-')}</div>
								<div style="font-size:12px;color:#374151;line-height:1.5;"><strong>Tax ID:</strong> ${escapeHtml(document.vendor_tax_id || '-')}</div>
							</td>
							<td style="width:33%;vertical-align:top;padding-right:10px;">
								<div style="font-size:11px;font-weight:700;color:#334155;margin-bottom:4px;">SHIP TO</div>
								<div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:2px;">${escapeHtml(document.delivery_location_name || '-')}</div>
								<div style="font-size:12px;color:#374151;line-height:1.5;">${escapeHtml(document.delivery_address_line || '-')}</div>
								<div style="font-size:12px;color:#374151;line-height:1.5;"><strong>Receiver:</strong> ${escapeHtml(document.delivery_contact_name || '-')}</div>
							</td>
							<td style="width:33%;vertical-align:top;">
								<div style="font-size:11px;font-weight:700;color:#334155;margin-bottom:4px;">MORE INFO</div>
								<div style="font-size:12px;color:#374151;line-height:1.6;"><strong>Prepared By:</strong> ${escapeHtml(document.created_by_name || '-')}</div>
								<div style="font-size:12px;color:#059669;line-height:1.6;"><strong>DELIVERY DATE</strong><br>${formatDateForMail(document.delivery_date)}</div>
								<div style="font-size:12px;color:#dc2626;line-height:1.6;"><strong>DUE DATE</strong><br>${formatDateForMail(document.due_date)}</div>
							</td>
						</tr>
					</table>
				</div>
				<div style="border:1px solid #334155;border-radius:8px;overflow:hidden;margin-bottom:14px;">
					<div style="padding:10px 12px;border-bottom:1px solid #334155;font-size:15px;font-weight:700;color:#1f2937;">
						Purchase Items (${items.length})
					</div>
					<table style="width:100%;border-collapse:collapse;">
					<thead>
						<tr style="background:#f9fafb;">
							<th style="padding:8px;text-align:left;width:40px;color:#374151;">#</th>
							<th style="padding:8px;text-align:left;color:#374151;">Product/Description</th>
							<th style="padding:8px;text-align:right;width:80px;color:#374151;">Qty</th>
							<th style="padding:8px;text-align:left;width:70px;color:#374151;">Unit</th>
							<th style="padding:8px;text-align:right;width:110px;color:#374151;">Cost/Unit</th>
							<th style="padding:8px;text-align:center;width:85px;color:#1d4ed8;">VAT Type</th>
							<th style="padding:8px;text-align:center;width:60px;color:#dc2626;">WHT</th>
							<th style="padding:8px;text-align:right;width:120px;color:#374151;">Total</th>
						</tr>
					</thead>
					<tbody>
						${rowsHtml || '<tr><td colspan="8" style="padding:10px;text-align:center;color:#6b7280;">No items</td></tr>'}
					</tbody>
				</table>
				</div>
				<div style="border:1px solid #334155;border-radius:8px;padding:12px;margin-bottom:14px;">
					<div style="font-size:15px;font-weight:700;color:#1f2937;border-bottom:1px solid #334155;padding-bottom:8px;margin-bottom:8px;">
						Financial Summary
					</div>
					<table style="width:100%;border-collapse:collapse;">
						<tr>
							<td style="padding:4px 0;color:#374151;">Subtotal:</td>
							<td style="padding:4px 0;color:#111827;text-align:right;">THB ${formatMoney(document.subtotal)}</td>
						</tr>
						<tr>
							<td style="padding:4px 0;color:#374151;">VAT (${escapeHtml(document.vat_rate || 7)}%):</td>
							<td style="padding:4px 0;color:#111827;text-align:right;">THB ${formatMoney(document.vat_amount)}</td>
						</tr>
						<tr>
							<td style="padding-top:8px;color:#111827;font-weight:700;font-size:16px;">Grand Total:</td>
							<td style="padding-top:8px;color:#1d4ed8;text-align:right;font-size:22px;font-weight:700;">THB ${formatMoney(document.total_amount)}</td>
						</tr>
					</table>
				</div>
				<table style="width:100%;border-collapse:separate;border-spacing:0 0;">
					<tr>
						<td style="width:50%;vertical-align:top;padding-right:8px;">
							<div style="border:1px solid #334155;border-radius:8px;padding:12px;min-height:92px;">
								<div style="font-size:15px;font-weight:700;color:#1f2937;border-bottom:1px solid #334155;padding-bottom:8px;margin-bottom:8px;">Notes</div>
								<div style="font-size:12px;color:#374151;line-height:1.5;">${escapeHtml(document.notes || 'No notes.')}</div>
							</div>
						</td>
						<td style="width:50%;vertical-align:top;padding-left:8px;">
							<div style="border:1px solid #334155;border-radius:8px;padding:12px;min-height:92px;">
								<div style="font-size:15px;font-weight:700;color:#1f2937;border-bottom:1px solid #334155;padding-bottom:8px;margin-bottom:8px;">Attachments</div>
								<div style="font-size:12px;color:#374151;line-height:1.5;">${escapeHtml(attachmentName || 'No attachments')}</div>
							</div>
						</td>
					</tr>
				</table>
				<p style="margin-top:14px;color:#6b7280;font-size:12px;">This is an automated notification email from Biz Core.</p>
			</div>
		</div>
	`;
}

async function ensureCanAccessPurchaseDocument(documentId: number, user: App.User | null): Promise<void> {
	const [rows] = await pool.query<any[]>(
		`SELECT u.department_id AS creator_department_id
		 FROM purchase_documents pd
		 LEFT JOIN users u ON u.id = pd.created_by_user_id
		 WHERE pd.id = ?
		 LIMIT 1`,
		[documentId]
	);
	if (rows.length === 0) throw error(404, 'Purchase Document not found');
	const creatorDepartmentId =
		rows[0].creator_department_id != null ? Number(rows[0].creator_department_id) : null;
	if (!canAccessPurchaseDocumentByDepartment(user, creatorDepartmentId)) {
		throw error(403, 'Forbidden: document is outside your department scope');
	}
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Invalid ID');

	try {
		await ensureCanAccessPurchaseDocument(id, locals.user);

		// ดึงข้อมูลเอกสารจัดซื้อ (Join กับ vendors, contacts, contracts, addresses และ job_orders)
		const [rows] = await pool.query<any[]>(
			`
            SELECT pd.*, 
                   v.name as vendor_name, v.address as vendor_address, v.tax_id as vendor_tax_id,
                   vc.name as contact_name, vc.phone as contact_phone, vc.email as contact_email,
                   vco.title as contract_title, vco.contract_number,
                   u.full_name as created_by_name,
                   da.name as delivery_location_name, da.address_line as delivery_address_line,
                   da.contact_name as delivery_contact_name, da.contact_phone as delivery_contact_phone,
                   j.job_number
            FROM purchase_documents pd
            LEFT JOIN vendors v ON pd.vendor_id = v.id
            LEFT JOIN vendor_contacts vc ON pd.vendor_contact_id = vc.id
            LEFT JOIN vendor_contracts vco ON pd.contract_id = vco.id
            LEFT JOIN users u ON pd.created_by_user_id = u.id
            LEFT JOIN delivery_addresses da ON pd.delivery_address_id = da.id
            LEFT JOIN job_orders j ON pd.job_id = j.id
            WHERE pd.id = ?
        `,
			[id]
		);

		if (rows.length === 0) throw error(404, 'Purchase Document not found');
		const document = rows[0];

		// ดึงรายการสินค้า
		const [items] = await pool.query<any[]>(
			`
            SELECT pdi.*, u.symbol as unit_symbol
            FROM purchase_document_items pdi
            LEFT JOIN units u ON pdi.unit_id = u.id
            WHERE pdi.document_id = ?
            ORDER BY pdi.item_order ASC
        `,
			[id]
		);

		// ดึงไฟล์แนบ
		const [attachments] = await pool.query<any[]>(
			`
            SELECT * FROM purchase_document_attachments WHERE document_id = ?
        `,
			[id]
		);

		const attachmentsWithUrl = attachments.map((f: any) => ({
			...f,
			url: `/uploads/purchase_documents/${f.file_system_name}`
		}));

		// ดึงข้อมูลบริษัทของเรา
		const [companyRows] = await pool.query<any[]>(`SELECT * FROM company LIMIT 1`);

		return {
			document: JSON.parse(JSON.stringify(document)),
			items: JSON.parse(JSON.stringify(items)),
			attachments: JSON.parse(JSON.stringify(attachmentsWithUrl)),
			company: companyRows.length > 0 ? JSON.parse(JSON.stringify(companyRows[0])) : null,
			availableStatuses: ['Draft', 'Sent', 'Received', 'Paid', 'Overdue', 'Void']
		};
	} catch (err: any) {
		console.error('Error loading purchase document:', err);
		throw error(500, err.message);
	}
};

// เปลี่ยนสถานะเอกสาร
export const actions: Actions = {
	updateStatus: async ({ request, params, locals }) => {
		const id = parseInt(params.id);
		const formData = await request.formData();
		const status = formData.get('status')?.toString();

		if (!id || !status) return fail(400, { message: 'Invalid data' });

		try {
			await ensureCanAccessPurchaseDocument(id, locals.user);
			await pool.execute('UPDATE purchase_documents SET status = ? WHERE id = ?', [status, id]);

			// Notify purchasing recipients when a PR is issued (status changed to Sent).
			if (status === 'Sent') {
				const [rows] = await pool.query<any[]>(
					`SELECT
						pd.id,
						pd.document_number,
						pd.document_type,
						pd.status,
						pd.document_date,
						pd.reference_doc,
						pd.delivery_date,
						pd.due_date,
						pd.credit_term,
						pd.vat_rate,
						pd.subtotal,
						pd.vat_amount,
						pd.total_amount,
						pd.notes,
						COALESCE(v.company_name, v.name) AS vendor_name,
						v.address AS vendor_address,
						v.tax_id AS vendor_tax_id,
						u.full_name AS created_by_name,
						da.name AS delivery_location_name,
						da.address_line AS delivery_address_line,
						da.contact_name AS delivery_contact_name,
						j.job_number,
						pa.file_original_name AS first_attachment_name,
						pa.file_system_name AS first_attachment_file
					FROM purchase_documents pd
					LEFT JOIN vendors v ON v.id = pd.vendor_id
					LEFT JOIN users u ON u.id = pd.created_by_user_id
					LEFT JOIN delivery_addresses da ON da.id = pd.delivery_address_id
					LEFT JOIN job_orders j ON j.id = pd.job_id
					LEFT JOIN purchase_document_attachments pa ON pa.document_id = pd.id
					WHERE pd.id = ?
					LIMIT 1`,
					[id]
				);
				const doc = rows[0];
				if (doc?.document_type === 'PR') {
					const recipients = splitEmailList(env.SENT_EMAIL_NOTICE_PR_ISSUED);
					if (recipients.length > 0) {
						const baseUrl = (env.APP_BASE_URL || 'https://bize_core.freedomsoft.in.th/').replace(/\/$/, '');
						const documentUrl = `${baseUrl}/purchase-documents/${id}`;
						const [itemRows] = await pool.query<any[]>(
							`SELECT
								pdi.description,
								pdi.quantity,
								pdi.unit_price,
								pdi.line_total,
								pdi.vat_type,
								pdi.wht_rate,
								u.symbol AS unit_symbol
							 FROM purchase_document_items pdi
							 LEFT JOIN units u ON u.id = pdi.unit_id
							 WHERE pdi.document_id = ?
							 ORDER BY pdi.item_order ASC`,
							[id]
						);
						const docNo = doc.document_number || `PR #${id}`;
						await sendMail({
							to: recipients,
							subject: `[PR Issued] ${docNo}`,
							text: `Purchase Requisition ${docNo} has been issued.\nOpen PR: ${documentUrl}`,
							html: buildPurchaseRequisitionEmailHtml(doc, itemRows, documentUrl)
						});
					}
				}
			}

			return { success: true };
		} catch (err: any) {
			return fail(500, { message: err.message });
		}
	}
};