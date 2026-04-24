import type { Pool } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { sendMail } from '$lib/server/mailer';
import { sendLineTextMulticast } from '$lib/server/lineMessaging';
import { toYmdDateInputBangkok } from '$lib/bangkokCalendarDate';

type PrivateEnv = Record<string, string | undefined>;

interface DueContractRow extends RowDataPacket {
	id: number;
	title: string;
	contract_number: string | null;
	end_date: string;
	owner_user_id: number | null;
	owner_email: string | null;
	owner_full_name: string | null;
	owner_line_user_id: string | null;
	vendor_name: string | null;
	renewal_notice_days: number | null;
	renewal_notify_emails: string | null;
	days_left: number;
}

let isRunning = false;
let lastRunAt = 0;

function splitEmailList(raw: string | undefined): string[] {
	return (raw || '')
		.split(/[;,]/g)
		.map((s) => s.trim())
		.filter(Boolean);
}

/** Explicit LINE OA userIds from env (comma/semicolon). */
function splitLineUserIds(raw: string | undefined): string[] {
	return (raw || '')
		.split(/[;,]/g)
		.map((s) => s.trim())
		.filter(Boolean);
}

function splitList(raw: string | null | undefined): string[] {
	return String(raw || '')
		.split(/[;,]/g)
		.map((s) => s.trim())
		.filter(Boolean);
}

async function ensureLogTable(pool: Pool): Promise<void> {
	const [idTypeRows] = await pool.query<RowDataPacket[]>(
		`SELECT COLUMN_TYPE
		 FROM INFORMATION_SCHEMA.COLUMNS
		 WHERE TABLE_SCHEMA = DATABASE()
		   AND TABLE_NAME = 'vendor_contracts'
		   AND COLUMN_NAME = 'id'
		 LIMIT 1`
	);
	const vendorContractIdType = String(idTypeRows[0]?.COLUMN_TYPE || '').trim();
	if (!vendorContractIdType) {
		throw new Error('Cannot resolve vendor_contracts.id column type');
	}

	await pool.query(
		`CREATE TABLE IF NOT EXISTS vendor_contract_renewal_notifications (
			id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
			vendor_contract_id ${vendorContractIdType} NOT NULL,
			notify_for_date DATE NOT NULL,
			notified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			days_before_expiry INT NOT NULL DEFAULT 30,
			channels VARCHAR(32) NOT NULL DEFAULT '',
			recipients_email TEXT NULL,
			recipients_line TEXT NULL,
			UNIQUE KEY uq_vendor_contract_notify_once (vendor_contract_id, notify_for_date),
			INDEX idx_vendor_contract_notified_at (notified_at),
			CONSTRAINT fk_vendor_contract_notify_contract
				FOREIGN KEY (vendor_contract_id) REFERENCES vendor_contracts(id)
				ON DELETE CASCADE
		)`
	);
}

async function fetchLineIdsByEmails(pool: Pool, emails: string[]): Promise<string[]> {
	if (!emails.length) return [];
	const lowered = [...new Set(emails.map((e) => e.toLowerCase()))];
	const [rows] = await pool.query<RowDataPacket[]>(
		`SELECT line_user_id
		 FROM users
		 WHERE LOWER(TRIM(email)) IN (?)
		   AND line_user_id IS NOT NULL
		   AND TRIM(line_user_id) <> ''`,
		[lowered]
	);
	return [...new Set(rows.map((r) => String(r.line_user_id || '').trim()).filter(Boolean))];
}

export type VendorContractRenewalNotifyOptions = {
	/** Default job runs at most once per interval; set true after saving a contract to check immediately. */
	bypassThrottle?: boolean;
};

export async function maybeNotifyVendorContractRenewals(
	pool: Pool,
	env: PrivateEnv,
	options?: VendorContractRenewalNotifyOptions
): Promise<void> {
	const intervalMinutes = Number(env.VENDOR_CONTRACT_RENEWAL_CHECK_INTERVAL_MINUTES || 60);
	const minIntervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
	const now = Date.now();
	const throttleOk = options?.bypassThrottle || now - lastRunAt >= minIntervalMs;
	if (isRunning || !throttleOk) return;

	isRunning = true;
	lastRunAt = now;

	try {
		await ensureLogTable(pool);

		const [dueContracts] = await pool.query<DueContractRow[]>(
			`SELECT
				vc.id,
				vc.title,
				vc.contract_number,
				vc.end_date,
				vc.owner_user_id,
				u.email AS owner_email,
				u.full_name AS owner_full_name,
				u.line_user_id AS owner_line_user_id,
				COALESCE(NULLIF(TRIM(v.company_name), ''), v.name) AS vendor_name,
				vc.renewal_notice_days,
				vc.renewal_notify_emails,
				DATEDIFF(DATE(vc.end_date), CURDATE()) AS days_left
			FROM vendor_contracts vc
			LEFT JOIN users u ON u.id = vc.owner_user_id
			LEFT JOIN vendors v ON v.id = vc.vendor_id
			WHERE vc.status = 'Active'
			  AND vc.end_date IS NOT NULL
			  AND DATE(vc.end_date) >= CURDATE()
			  AND DATEDIFF(DATE(vc.end_date), CURDATE()) <= 30
			ORDER BY DATE(vc.end_date) ASC`
		);

		if (!dueContracts.length) return;

		const configuredNotifyEmails = splitEmailList(env.VENDOR_CONTRACT_RENEWAL_NOTIFY_EMAILS);
		const lineIdsFromEmails = await fetchLineIdsByEmails(pool, configuredNotifyEmails);
		const adminLineIds = splitLineUserIds(env.VENDOR_CONTRACT_RENEWAL_NOTIFY_LINE_IDS);
		const configuredLineIds = [...new Set([...lineIdsFromEmails, ...adminLineIds])];

		for (const contract of dueContracts) {
			const endDate = toYmdDateInputBangkok(contract.end_date);
			if (!endDate) continue;

			const [alreadyRows] = await pool.query<RowDataPacket[]>(
				`SELECT id
				 FROM vendor_contract_renewal_notifications
				 WHERE vendor_contract_id = ?
				   AND notify_for_date = DATE_SUB(DATE(?), INTERVAL 30 DAY)
				 LIMIT 1`,
				[contract.id, endDate]
			);
			if (alreadyRows.length > 0) continue;

			const ownerEmail = String(contract.owner_email || '').trim();
			const contractNotifyEmails = splitList(contract.renewal_notify_emails);
			const ownerLineId = String(contract.owner_line_user_id || '').trim();
			const mailTo = [
				...new Set([...configuredNotifyEmails, ...contractNotifyEmails, ownerEmail].filter(Boolean))
			];
			const contractLineIds = await fetchLineIdsByEmails(pool, contractNotifyEmails);
			const lineTo = [...new Set([...configuredLineIds, ...contractLineIds, ownerLineId].filter(Boolean))];

			if (!mailTo.length && !lineTo.length) {
				console.info(
					`[vendorContractRenewalNotifier] skip contract id=${contract.id}: no recipients (set VENDOR_CONTRACT_RENEWAL_NOTIFY_EMAILS / LINE IDs or contract owner email/LINE)`
				);
				continue;
			}

			const vendorName = String(contract.vendor_name || '-');
			const contractNo = String(contract.contract_number || '-');
			const daysLeft = Number(contract.days_left);
			const endDateLabel = `${endDate} (GMT+7)`;
			const subject = `[Contract Renewal Reminder][Vendor] ${contract.title} expires in ${daysLeft} day(s)`;
			const text = [
				`Contract renewal reminder: Vendor contract expires in ${daysLeft} day(s).`,
				`Title: ${contract.title}`,
				`Contract No: ${contractNo}`,
				`Vendor: ${vendorName}`,
				`End Date (GMT+7): ${endDateLabel}`,
				'Please prepare renewal process.'
			].join('\n');
			const html = `<p>Contract renewal reminder: Vendor contract expires in <strong>${daysLeft}</strong> day(s).</p>
				<ul>
					<li><strong>Title:</strong> ${contract.title}</li>
					<li><strong>Contract No:</strong> ${contractNo}</li>
					<li><strong>Vendor:</strong> ${vendorName}</li>
					<li><strong>End Date (GMT+7):</strong> ${endDateLabel}</li>
				</ul>
				<p>Please prepare renewal process.</p>`;

			let sentMail = false;
			let sentLine = false;

			try {
				if (mailTo.length) {
					sentMail = await sendMail({ to: mailTo, subject, text, html });
				}
				if (lineTo.length) {
					sentLine = await sendLineTextMulticast(lineTo, `${subject}\n\n${text}`);
				}
			} catch (e) {
				console.error('[vendorContractRenewalNotifier] send failed:', e);
			}

			if (mailTo.length && !sentMail) {
				console.info(
					'[vendorContractRenewalNotifier] email skipped or failed — verify SMTP_* in .env and recipients'
				);
			}
			if (lineTo.length && !sentLine) {
				console.info(
					'[vendorContractRenewalNotifier] LINE skipped or failed — verify LINE_CHANNEL_ACCESS_TOKEN and userIds'
				);
			}

			if (sentMail || sentLine) {
				await pool.query(
					`INSERT INTO vendor_contract_renewal_notifications
						(vendor_contract_id, notify_for_date, days_before_expiry, channels, recipients_email, recipients_line)
					 VALUES (?, DATE_SUB(DATE(?), INTERVAL 30 DAY), 30, ?, ?, ?)`,
					[
						contract.id,
						endDate,
						[sentMail ? 'email' : null, sentLine ? 'line' : null].filter(Boolean).join(','),
						mailTo.join(','),
						lineTo.join(',')
					]
				);
			}
		}
	} catch (e) {
		console.error('[vendorContractRenewalNotifier] failed:', e);
	} finally {
		isRunning = false;
	}
}
