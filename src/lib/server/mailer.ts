import { env } from '$env/dynamic/private';
import nodemailer from 'nodemailer';

type MailPayload = {
	to: string[];
	subject: string;
	text: string;
	html?: string;
};

function normalizeEmails(emails: string[]): string[] {
	return Array.from(new Set(emails.map((e) => e.trim()).filter(Boolean)));
}

export async function sendMail(payload: MailPayload): Promise<boolean> {
	const host = env.SMTP_HOST;
	const port = Number(env.SMTP_PORT || 587);
	const user = env.SMTP_USER;
	const pass = env.SMTP_PASS;
	const from = env.SMTP_FROM || user;

	const recipients = normalizeEmails(payload.to);
	if (!host || !user || !pass || !from || recipients.length === 0) {
		// Keep app flow working even if SMTP is not configured.
		console.info('[mailer] skip send; SMTP not configured or empty recipients');
		return false;
	}

	const transporter = nodemailer.createTransport({
		host,
		port,
		secure: port === 465,
		auth: { user, pass },
		connectionTimeout: 15000,
		greetingTimeout: 15000,
		socketTimeout: 30000
	});

	try {
		const info = await transporter.sendMail({
			from,
			to: recipients.join(','),
			subject: payload.subject,
			text: payload.text,
			html: payload.html
		});
		console.info('[mailer] sent', {
			subject: payload.subject,
			toCount: recipients.length,
			messageId: info?.messageId || null
		});
	} catch (err) {
		console.error('[mailer] send failed', {
			subject: payload.subject,
			toCount: recipients.length,
			error: err
		});
		throw err;
	}

	return true;
}
