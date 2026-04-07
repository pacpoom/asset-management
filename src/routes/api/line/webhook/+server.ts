import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';

/**
 * LINE Messaging API webhook — logs userId from events (message, follow, etc.).
 * Set this URL in LINE Developers → Messaging API → Webhook URL (must be HTTPS, public).
 * Local dev: use ngrok / Cloudflare Tunnel → https://xxxx/api/line/webhook
 *
 * .env: LINE_CHANNEL_SECRET (Basic settings tab) — required for signature verification.
 * Dev only: LINE_WEBHOOK_SKIP_SIGNATURE=true skips signature check (never use in production).
 */
/** LINE: HMAC-SHA256 of raw body, X-Line-Signature is base64 of the digest bytes */
function verifyLineSignature(rawBody: string, signature: string | null, channelSecret: string): boolean {
	if (!signature || !channelSecret) return false;
	const hmac = crypto.createHmac('sha256', channelSecret).update(rawBody).digest();
	let sigBuf: Buffer;
	try {
		sigBuf = Buffer.from(signature, 'base64');
	} catch {
		return false;
	}
	if (sigBuf.length !== hmac.length) return false;
	return crypto.timingSafeEqual(hmac, sigBuf);
}

export const GET: RequestHandler = async () => {
	return new Response('LINE webhook endpoint OK (use POST from LINE)', {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' }
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const rawBody = await request.text();
	const signature = request.headers.get('x-line-signature');
	const secret = (env.LINE_CHANNEL_SECRET || '').trim();
	const skipSignature = ['1', 'true', 'yes'].includes(
		String(env.LINE_WEBHOOK_SKIP_SIGNATURE || '').toLowerCase()
	);

	// LINE "Verify" and some probes may POST with an empty body — still must return 200.
	let trimmed = rawBody.trim().replace(/^\uFEFF/, '');
	if (!trimmed) {
		console.info('[line-webhook] empty body → 200 (OK for LINE URL verification)');
		return json({});
	}

	if (skipSignature) {
		console.warn(
			'[line-webhook] LINE_WEBHOOK_SKIP_SIGNATURE is ON — dev only; remove in production.'
		);
	} else if (secret) {
		if (!verifyLineSignature(rawBody, signature, secret)) {
			console.warn(
				'[line-webhook] invalid X-Line-Signature — try copy Channel secret again, or temporarily LINE_WEBHOOK_SKIP_SIGNATURE=true for local dev only'
			);
			return new Response('Unauthorized', { status: 401 });
		}
	} else {
		console.warn(
			'[line-webhook] LINE_CHANNEL_SECRET not set — tunnel may inject non-JSON; set secret from Basic settings for reliable verify.'
		);
	}

	type LineWebhookBody = {
		events?: Array<{ type?: string; source?: { userId?: string; type?: string } }>;
	};
	let body: LineWebhookBody | null = null;
	try {
		body = JSON.parse(trimmed) as LineWebhookBody;
	} catch (e) {
		// localtunnel sometimes returns an HTML interstitial to the tunnel, not JSON → LINE sees 400.
		// LINE URL verification only requires HTTP 200; log and succeed so Verify passes.
		console.error(
			'[line-webhook] JSON parse error (often HTML from tunnel — try ngrok/Cloudflare, or set LINE_CHANNEL_SECRET)',
			e,
			'| len=',
			rawBody.length,
			'| head=',
			rawBody.slice(0, 160)
		);
		return json({});
	}

	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		console.warn('[line-webhook] unexpected JSON root → 200 OK');
		return json({});
	}

	const events = body.events ?? [];
	for (const ev of events) {
		const uid = ev.source?.userId;
		const st = ev.source?.type;
		if (uid && st === 'user') {
			console.info('[line-webhook] userId (use in Users / LINE_TEST_USER_ID):', uid, '| event:', ev.type);
		} else {
			console.info('[line-webhook] event:', ev.type, JSON.stringify(ev.source ?? {}));
		}
	}
	if (events.length === 0) {
		console.info('[line-webhook] empty events (URL verification ping is OK)');
	}

	return json({});
};
