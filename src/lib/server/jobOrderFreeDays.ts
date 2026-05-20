import pool from '$lib/server/database';

export type JobFreeDays = {
	storage_days: number | null;
	demurrage_days: number | null;
	detention_days: number | null;
};

function parseDayField(raw: FormDataEntryValue | null): number | null {
	if (raw == null || String(raw).trim() === '') return null;
	const n = parseInt(String(raw), 10);
	return Number.isNaN(n) ? null : n;
}

/** อ่าน Free Days จาก hidden fields ที่ส่งมากับฟอร์ม (snapshot จาก UI) */
export function parseJobFreeDaysFromForm(formData: FormData): JobFreeDays {
	return {
		storage_days: parseDayField(formData.get('storage_days')),
		demurrage_days: parseDayField(formData.get('demurrage_days')),
		detention_days: parseDayField(formData.get('detention_days'))
	};
}

/** Snapshot Free Days จาก vessel_master ตอนบันทึก Job (เก็บที่ job_orders) */
export async function resolveJobFreeDaysFromVessel(
	vesselMasterId: number | string | null | undefined
): Promise<JobFreeDays> {
	const id = vesselMasterId ? parseInt(String(vesselMasterId), 10) : NaN;
	if (!id || Number.isNaN(id)) {
		return { storage_days: null, demurrage_days: null, detention_days: null };
	}
	const [rows] = await pool.query(
		'SELECT storage_days, demurrage_days, detention_days FROM vessel_master WHERE id = ? LIMIT 1',
		[id]
	);
	const vm = (rows as JobFreeDays[])[0];
	if (!vm) {
		return { storage_days: null, demurrage_days: null, detention_days: null };
	}
	return {
		storage_days: vm.storage_days ?? null,
		demurrage_days: vm.demurrage_days ?? null,
		detention_days: vm.detention_days ?? null
	};
}

/** ฟอร์มก่อน แล้ว fallback ดึงจาก vessel_master ถ้าฟอร์มว่าง */
export async function resolveJobFreeDaysForSave(
	formData: FormData,
	vesselMasterId: number | string | null | undefined
): Promise<JobFreeDays> {
	const fromForm = parseJobFreeDaysFromForm(formData);
	const hasForm =
		fromForm.storage_days != null ||
		fromForm.demurrage_days != null ||
		fromForm.detention_days != null;
	if (hasForm) return fromForm;

	return resolveJobFreeDaysFromVessel(vesselMasterId);
}
