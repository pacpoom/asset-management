import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { canAccessApplicationEnvConfig } from '$lib/envConfigAccess';
import { env } from '$env/dynamic/private';
import fs from 'fs/promises';
import path from 'path';

const ENV_PATH = path.resolve(process.cwd(), '.env');

/** Keys managed on this screen (same order as typical .env) */
const ENV_FIELDS = [
	{ key: 'DB_HOST', label: 'DB host', secret: false, group: 'database' as const, hint: 'เช่น localhost' },
	{ key: 'DB_PORT', label: 'DB port', secret: false, group: 'database' as const, hint: 'เช่น 3306' },
	{ key: 'DB_USER', label: 'DB user', secret: false, group: 'database' as const, hint: '' },
	{
		key: 'DB_PASSWORD',
		label: 'DB password',
		secret: true,
		group: 'database' as const,
		hint: 'เว้นว่างถ้าไม่ต้องการเปลี่ยน'
	},
	{ key: 'DB_DATABASE', label: 'DB database name', secret: false, group: 'database' as const, hint: '' },
	{ key: 'SMTP_HOST', label: 'SMTP host', secret: false, group: 'smtp' as const, hint: '' },
	{ key: 'SMTP_PORT', label: 'SMTP port', secret: false, group: 'smtp' as const, hint: 'เช่น 587' },
	{ key: 'SMTP_USER', label: 'SMTP user', secret: false, group: 'smtp' as const, hint: '' },
	{
		key: 'SMTP_PASS',
		label: 'SMTP password',
		secret: true,
		group: 'smtp' as const,
		hint: 'เว้นว่างถ้าไม่ต้องการเปลี่ยน'
	},
	{
		key: 'SMTP_FROM',
		label: 'SMTP From',
		secret: false,
		group: 'smtp' as const,
		hint: 'เช่น "Name <email@domain.com>"'
	},
	{
		key: 'APP_BASE_URL',
		label: 'APP_BASE_URL',
		secret: false,
		group: 'app' as const,
		hint: 'URL หลักของระบบ (ไม่มี slash ท้ายก็ได้)'
	},
	{
		key: 'LINE_CHANNEL_ACCESS_TOKEN',
		label: 'LINE channel access token',
		secret: true,
		group: 'line' as const,
		hint: 'เว้นว่างถ้าไม่ต้องการเปลี่ยน'
	},
	{
		key: 'LINE_CHANNEL_SECRET',
		label: 'LINE channel secret',
		secret: true,
		group: 'line' as const,
		hint: 'เว้นว่างถ้าไม่ต้องการเปลี่ยน'
	},
	{
		key: 'VENDOR_CONTRACT_RENEWAL_NOTIFY_EMAILS',
		label: 'Contract renewal notify emails (ฝั่งซื้อ)',
		secret: false,
		group: 'renewal' as const,
		hint: 'รายการอีเมลรับแจ้งเตือนต่อสัญญา คั่นด้วย , หรือ ;'
	},
	{
		key: 'VENDOR_CONTRACT_RENEWAL_CHECK_INTERVAL_MINUTES',
		label: 'Contract renewal check interval (minutes) (ฝั่งซื้อ)',
		secret: false,
		group: 'renewal' as const,
		hint: 'ความถี่เช็คแจ้งเตือนในฝั่งเซิร์ฟเวอร์ (ค่าแนะนำ 60)'
	},
	{
		key: 'VENDOR_CONTRACT_RENEWAL_NOTIFY_LINE_IDS',
		label: 'Contract renewal notify LINE user IDs (ฝั่งซื้อ)',
		secret: false,
		group: 'renewal' as const,
		hint: 'LINE userId (U…) แจ้งเตือนหมดสัญญา — หลายค่าคั่นด้วย , หรือ ;'
	},
	{
		key: 'SALE_CONTRACT_RENEWAL_NOTIFY_EMAILS',
		label: 'Contract renewal notify emails (ฝั่งขาย)',
		secret: false,
		group: 'renewal' as const,
		hint: 'รายการอีเมลรับแจ้งเตือนต่อสัญญา คั่นด้วย , หรือ ;'
	},
	{
		key: 'SALE_CONTRACT_RENEWAL_CHECK_INTERVAL_MINUTES',
		label: 'Contract renewal check interval (minutes) (ฝั่งขาย)',
		secret: false,
		group: 'renewal' as const,
		hint: 'ความถี่เช็คแจ้งเตือนในฝั่งเซิร์ฟเวอร์ (ค่าแนะนำ 60)'
	},
	{
		key: 'SALE_CONTRACT_RENEWAL_NOTIFY_LINE_IDS',
		label: 'Contract renewal notify LINE user IDs (ฝั่งขาย)',
		secret: false,
		group: 'renewal' as const,
		hint: 'LINE userId (U…) แจ้งเตือนหมดสัญญา — หลายค่าคั่นด้วย , หรือ ;'
	}
] as const;

const MANAGED_KEYS: Set<string> = new Set(ENV_FIELDS.map((f) => f.key));
const SECRET_KEYS: Set<string> = new Set(ENV_FIELDS.filter((f) => f.secret).map((f) => f.key));
const KEY_ORDER: string[] = ENV_FIELDS.map((f) => f.key);

function quoteEnvValue(val: string): string {
	if (val === '') return '""';
	if (/^[A-Za-z0-9_.:@/-]+$/.test(val)) return val;
	return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '').replace(/\n/g, '\\n')}"`;
}

/** Merge managed keys into `.env`; preserve comments and unknown keys */
async function writeMergedEnv(updates: Record<string, string>): Promise<void> {
	let lines: string[];
	try {
		const raw = await fs.readFile(ENV_PATH, 'utf8');
		lines = raw.split(/\r?\n/);
	} catch (e: unknown) {
		const err = e as { code?: string };
		if (err?.code === 'ENOENT') lines = [];
		else throw e;
	}

	const updatedKeys = new Set<string>();
	const out: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			out.push(line);
			continue;
		}
		const eq = trimmed.indexOf('=');
		if (eq === -1) {
			out.push(line);
			continue;
		}
		const key = trimmed.slice(0, eq).trim();
		if (!MANAGED_KEYS.has(key)) {
			out.push(line);
			continue;
		}
		let val = updates[key] ?? '';
		if (SECRET_KEYS.has(key) && val === '') {
			// Keep the exact current file value for secret keys when the form leaves them blank.
			out.push(line);
			updatedKeys.add(key);
			continue;
		}
		out.push(`${key}=${quoteEnvValue(val)}`);
		updatedKeys.add(key);
	}

	for (const key of KEY_ORDER) {
		if (updatedKeys.has(key)) continue;
		let val = updates[key] ?? '';
		out.push(`${key}=${quoteEnvValue(val)}`);
	}

	await fs.writeFile(ENV_PATH, out.join('\n') + '\n', 'utf8');
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!canAccessApplicationEnvConfig(locals.user)) {
		throw error(403, 'Forbidden: ต้องมีสิทธิ์ manage env config หรือเป็น admin');
	}

	const fields = ENV_FIELDS.map((def) => {
		const raw = env[def.key as keyof typeof env];
		const str = raw != null ? String(raw) : '';
		return {
			key: def.key,
			label: def.label,
			group: def.group,
			hint: def.hint,
			secret: def.secret,
			inputValue: def.secret ? '' : str,
			hasValue: str.length > 0
		};
	});

	return {
		fields,
		groupTitles: {
			database: 'ฐานข้อมูล',
			smtp: 'อีเมล (SMTP)',
			app: 'แอปพลิเคชัน',
			line: 'LINE Messaging',
			renewal: 'แจ้งเตือนต่อสัญญา (ฝั่งซื้อ / ฝั่งขาย)'
		} as const
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Unauthorized' });
		if (!canAccessApplicationEnvConfig(locals.user)) {
			return fail(403, { message: 'Forbidden: ต้องมีสิทธิ์ manage env config หรือเป็น admin' });
		}

		const form = await request.formData();
		const updates: Record<string, string> = {};
		for (const { key } of ENV_FIELDS) {
			updates[key] = (form.get(key)?.toString() ?? '').trim();
		}

		try {
			await writeMergedEnv(updates);
		} catch (e: unknown) {
			console.error('[env-config] write .env failed:', e);
			const msg = e instanceof Error ? e.message : 'Write failed';
			return fail(500, { message: msg });
		}

		return {
			success: true,
			message:
				'บันทึก .env แล้ว — บางค่าอาจต้องรีสตาร์ทแอป (npm run dev / process) ถึงจะโหลดใหม่ทั้งหมด'
		};
	}
};
