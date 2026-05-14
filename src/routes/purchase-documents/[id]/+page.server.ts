import { error, fail, redirect, isHttpError } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import pool from '$lib/server/database';
import { env } from '$env/dynamic/private';
import { sendMail } from '$lib/server/mailer';
import { canAccessPurchaseDocumentByDepartment } from '$lib/purchaseDocumentAccess';
import { throwIfDeletedPurchaseRequisition } from '$lib/server/purchaseDocumentDeletionLog';
import { userCanIssuePurchaseOrderFromPr } from '$lib/userRole';

function splitEmailList(raw: string | undefined): string[] {
	return (raw || '')
		.split(/[;,]/g)
		.map((s) => s.trim())
		.filter(Boolean);
}

/** รวมอีเมลหลายแหล่ง ไม่ซ้ำ (คนกด Sent / ผู้สร้าง PR จะได้รับแม้ยังไม่ตั้ง SENT_EMAIL_NOTICE_PR_ISSUED) */
function uniqueEmailRecipients(...candidates: (string | null | undefined)[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of candidates) {
		const e = String(raw ?? '')
			.trim()
			.replace(/[\s\u200b]+/g, '');
		if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) continue;
		const key = e.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(e);
	}
	return out;
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

function toAbsoluteUrl(baseUrl: string, value: unknown): string {
	const raw = String(value || '').trim();
	if (!raw) return '';
	if (/^https?:\/\//i.test(raw)) return raw;
	return `${baseUrl}/${raw.replace(/^\/+/, '')}`;
}

function buildPurchaseRequisitionEmailHtml(
	document: any,
	items: any[],
	documentUrl: string,
	company: any,
	baseUrl: string
): string {
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
	const logoUrl = toAbsoluteUrl(baseUrl, company?.logo_path);
	const companyName = company?.name || 'Anji-NYK';
	const companyAddress = [
		company?.address_line_1 || '',
		company?.address_line_2 || '',
		[company?.city || '', company?.state_province || '', company?.postal_code || ''].join(' ').trim(),
		company?.country || ''
	]
		.map((line) => String(line).trim())
		.filter(Boolean)
		.join('<br>');
	const companyTaxId = company?.tax_id ? String(company.tax_id) : '-';

	return `
		<div style="font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;padding:20px;color:#111827;">
			<div style="max-width:980px;margin:0 auto;background:#ffffff;border:1px solid #d1d5db;border-radius:10px;padding:20px;">
				<table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
					<tr>
						<td style="font-size:26px;font-weight:700;color:#0f172a;">
							Purchase Requisition (PR) #${escapeHtml(document.document_number || '-')}
						</td>
						<td style="text-align:right;">
							<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${statusColor};color:#fff;font-size:12px;font-weight:700;">
								${escapeHtml(document.status || 'Sent')}
							</span>
						</td>
					</tr>
				</table>
				<div style="margin-bottom:10px;font-size:12px;color:#6b7280;">
					Vendor: ${escapeHtml(document.vendor_name || '-')} |
					Job Order: ${escapeHtml(document.job_number || '-')} |
					Reference: ${escapeHtml(document.reference_doc || '-')}
				</div>
				<div style="margin-bottom:14px;font-size:13px;color:#1e3a8a;">
					<strong>Open PR:</strong>
					<a href="${escapeHtml(documentUrl)}" style="color:#1d4ed8;text-decoration:underline;word-break:break-all;">${escapeHtml(documentUrl)}</a>
				</div>
				<div style="border:1px solid #334155;border-radius:8px;padding:12px 14px;margin-bottom:14px;">
					<table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
						<tr>
							<td style="width:55%;vertical-align:top;padding-right:14px;">
								${
									logoUrl
										? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)}" style="max-height:56px;max-width:180px;object-fit:contain;margin-bottom:8px;display:block;" />`
										: `<div style="font-size:20px;font-weight:700;color:#111827;margin-bottom:8px;">${escapeHtml(companyName)}</div>`
								}
								<div style="font-size:12px;color:#374151;line-height:1.4;margin-bottom:8px;">
									${companyAddress || '-'}<br>
									<strong>Tax ID:</strong> ${escapeHtml(companyTaxId)}
								</div>
							</td>
							<td style="width:45%;vertical-align:top;text-align:right;">
								<div style="font-size:26px;font-weight:700;color:#111827;line-height:1.1;letter-spacing:0.3px;margin-bottom:10px;">
									PURCHASE REQUISITION (PR)
								</div>
								<div style="font-size:12px;color:#374151;line-height:1.55;">
									<div><strong>Document No:</strong> #${escapeHtml(document.document_number || '-')}</div>
									<div><strong>Date:</strong> ${formatDateForMail(document.document_date)}</div>
									<div><strong>Credit Term:</strong> ${escapeHtml(document.credit_term || 0)} days</div>
									<div><strong>Job Order:</strong> ${escapeHtml(document.job_number || '-')}</div>
									<div><strong>Reference:</strong> ${escapeHtml(document.reference_doc || '-')}</div>
								</div>
							</td>
						</tr>
					</table>
					<div style="height:1px;background:#334155;margin:4px 0 10px 0;"></div>
					<table style="width:100%;border-collapse:collapse;">
						<tr>
							<td style="width:34%;vertical-align:top;padding-right:12px;">
								<div style="font-size:11px;font-weight:700;color:#334155;margin-bottom:4px;letter-spacing:0.4px;">VENDOR</div>
								<div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:2px;">${escapeHtml(document.vendor_name || '-')}</div>
								<div style="font-size:12px;color:#374151;line-height:1.45;">${escapeHtml(document.vendor_address || '-')}</div>
								<div style="font-size:12px;color:#374151;line-height:1.45;"><strong>Tax ID:</strong> ${escapeHtml(document.vendor_tax_id || '-')}</div>
							</td>
							<td style="width:33%;vertical-align:top;padding-right:12px;">
								<div style="font-size:11px;font-weight:700;color:#334155;margin-bottom:4px;letter-spacing:0.4px;">SHIP TO</div>
								<div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:2px;">${escapeHtml(document.delivery_location_name || '-')}</div>
								<div style="font-size:12px;color:#374151;line-height:1.45;">${escapeHtml(document.delivery_address_line || '-')}</div>
								<div style="font-size:12px;color:#374151;line-height:1.45;"><strong>Receiver:</strong> ${escapeHtml(document.delivery_contact_name || '-')}</div>
							</td>
							<td style="width:33%;vertical-align:top;">
								<div style="font-size:11px;font-weight:700;color:#334155;margin-bottom:4px;letter-spacing:0.4px;">MORE INFO</div>
								<div style="font-size:12px;color:#374151;line-height:1.5;"><strong>Prepared By:</strong> ${escapeHtml(document.created_by_name || '-')}</div>
								<div style="font-size:12px;color:#059669;line-height:1.5;margin-top:4px;"><strong>DELIVERY DATE</strong><br>${formatDateForMail(document.delivery_date)}</div>
								<div style="font-size:12px;color:#dc2626;line-height:1.5;margin-top:4px;"><strong>DUE DATE</strong><br>${formatDateForMail(document.due_date)}</div>
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
	if (rows.length === 0) {
		await throwIfDeletedPurchaseRequisition(documentId, user);
		throw error(404, 'Purchase Document not found');
	}
	const creatorDepartmentId =
		rows[0].creator_department_id != null ? Number(rows[0].creator_department_id) : null;
	if (!canAccessPurchaseDocumentByDepartment(user, creatorDepartmentId)) {
		throw error(403, 'Forbidden: document is outside your department scope');
	}
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) {
		throw redirect(303, '/purchase-documents');
	}

	try {
		// ดึงข้อมูลเอกสารจัดซื้อ (Join กับ vendors, contacts, contracts, addresses และ job_orders)
		const [rows] = await pool.query<any[]>(
			`
            SELECT pd.*, 
                   v.name as vendor_name, v.address as vendor_address, v.tax_id as vendor_tax_id,
                   vc.name as contact_name, vc.phone as contact_phone, vc.email as contact_email,
                   vco.title as contract_title, vco.contract_number,
                   u.full_name as created_by_name,
                   u.department_id AS creator_department_id,
                   da.name as delivery_location_name, da.address_line as delivery_address_line,
                   COALESCE(NULLIF(TRIM(pd.delivery_receiver_name), ''), da.contact_name) as delivery_contact_name,
                   COALESCE(NULLIF(TRIM(pd.delivery_receiver_phone), ''), da.contact_phone) as delivery_contact_phone,
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

		if (rows.length === 0) {
			await throwIfDeletedPurchaseRequisition(id, locals.user);
			throw error(404, 'Purchase Document not found');
		}

		const document = rows[0];
		const creatorDepartmentId =
			document.creator_department_id != null ? Number(document.creator_department_id) : null;
		if (!canAccessPurchaseDocumentByDepartment(locals.user, creatorDepartmentId)) {
			throw error(403, 'Forbidden: document is outside your department scope');
		}
		let canEdit = true;
		if (String(document.document_type || '').toUpperCase() === 'PR') {
			const [poRows] = await pool.query<any[]>(
				`SELECT id
				 FROM purchase_documents
				 WHERE document_type = 'PO'
				   AND reference_doc LIKE ?
				 LIMIT 1`,
				[`%${String(document.document_number || '')}%`]
			);
			canEdit = poRows.length === 0;
			// ข้อมูลเก่า: มี PO แล้วแต่ PR ยังไม่ถูกตั้งเป็น Complete → อัปเดตให้ตรงกัน
			if (!canEdit && String(document.status || '') !== 'Complete') {
				await pool.execute(`UPDATE purchase_documents SET status = 'Complete' WHERE id = ?`, [id]);
				document.status = 'Complete';
			}
		}

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
			canEdit,
			canIssuePo: userCanIssuePurchaseOrderFromPr(locals.user),
			availableStatuses: ['Draft', 'Sent', 'Received', 'Paid', 'Overdue', 'Void', 'Complete']
		};
	} catch (err: unknown) {
		if (isHttpError(err)) throw err;
		console.error('Error loading purchase document:', err);
		const message = err instanceof Error ? err.message : 'Unknown error';
		throw error(500, message);
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
						u.email AS created_by_email,
						da.name AS delivery_location_name,
						da.address_line AS delivery_address_line,
						COALESCE(NULLIF(TRIM(pd.delivery_receiver_name), ''), da.contact_name) AS delivery_contact_name,
						COALESCE(NULLIF(TRIM(pd.delivery_receiver_phone), ''), da.contact_phone) AS delivery_contact_phone,
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
					const fromEnv = splitEmailList(env.SENT_EMAIL_NOTICE_PR_ISSUED);
					const recipients = uniqueEmailRecipients(
						...fromEnv,
						doc.created_by_email,
						locals.user?.email
					);
					if (recipients.length === 0) {
						console.warn(
							'[purchase-documents] PR issued: no email recipients. Set SENT_EMAIL_NOTICE_PR_ISSUED and/or ensure user/creator has a valid email in the users table.'
						);
					} else {
						const baseUrl = (env.APP_BASE_URL || 'https://bize_core.freedomsoft.in.th/').replace(/\/$/, '');
						const documentUrl = `${baseUrl}/purchase-documents/${id}`;
						const [companyRows] = await pool.query<any[]>(`SELECT * FROM company LIMIT 1`);
						const company = companyRows[0] || null;
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
						console.info('[purchase-documents] sending PR issued email', {
							documentId: id,
							documentNo: docNo,
							recipientsCount: recipients.length,
							recipients
						});
						void sendMail({
							to: recipients,
							subject: `[PR Issued] ${docNo}`,
							text: `Purchase Requisition ${docNo} has been issued.\nOpen PR: ${documentUrl}`,
							html: buildPurchaseRequisitionEmailHtml(doc, itemRows, documentUrl, company, baseUrl)
						}).then((sent) => {
							if (!sent) {
								console.warn(
									'[purchase-documents] PR issued email not sent: check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in environment.'
								);
							}
							console.info('[purchase-documents] PR issued email send result', {
								documentId: id,
								documentNo: docNo,
								sent
							});
						}).catch((mailErr) => {
							console.error('[purchase-documents] send PR issued email failed:', mailErr);
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