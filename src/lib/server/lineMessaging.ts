import { env } from '$env/dynamic/private';

const MULTICAST_URL = 'https://api.line.me/v2/bot/message/multicast';
const MAX_PER_REQUEST = 500;
const MAX_TEXT_LEN = 4500;

/**
 * LINE Messaging API (Official Account). Requires Channel access token (long-lived).
 * Recipients must have added the OA as a friend; use their userId (e.g. U…).
 */
export async function sendLineTextMulticast(userIds: string[], text: string): Promise<boolean> {
	const token = env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
	const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
	if (!token || ids.length === 0) {
		if (ids.length > 0 && !token) {
			console.info('[line] skip multicast: LINE_CHANNEL_ACCESS_TOKEN not set');
		}
		return false;
	}

	let body = text.trim();
	if (!body) return false;
	if (body.length > MAX_TEXT_LEN) {
		body = `${body.slice(0, MAX_TEXT_LEN - 1)}…`;
	}

	try {
		for (let i = 0; i < ids.length; i += MAX_PER_REQUEST) {
			const chunk = ids.slice(i, i + MAX_PER_REQUEST);
			const res = await fetch(MULTICAST_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					to: chunk,
					messages: [{ type: 'text', text: body }]
				})
			});

			if (!res.ok) {
				const errBody = await res.text();
				console.error('[line] multicast failed', res.status, errBody);
				return false;
			}
		}
		return true;
	} catch (e) {
		console.error('[line] multicast error', e);
		return false;
	}
}
