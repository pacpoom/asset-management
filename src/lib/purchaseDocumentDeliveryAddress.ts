/** Ship To dropdown: location name, then optional contact (pipe-separated). */
export function deliveryAddressSelectLabel(row: {
	name?: string | null;
	contact_name?: string | null;
}): string {
	const site = String(row.name ?? '').trim();
	const contact = String(row.contact_name ?? '').trim();
	if (contact) return `${site} | ${contact}`;
	return site || '';
}

/** Ascending sort: location name, then contact, then id (for stable order). */
export function compareDeliveryAddressesForSort(
	a: {
		name?: string | null;
		contact_name?: string | null;
		id?: number | string | null;
	},
	b: {
		name?: string | null;
		contact_name?: string | null;
		id?: number | string | null;
	}
): number {
	const na = String(a.name ?? '').trim();
	const nb = String(b.name ?? '').trim();
	const byName = na.localeCompare(nb, undefined, { sensitivity: 'base', numeric: true });
	if (byName !== 0) return byName;
	const ca = String(a.contact_name ?? '').trim();
	const cb = String(b.contact_name ?? '').trim();
	const byContact = ca.localeCompare(cb, undefined, { sensitivity: 'base', numeric: true });
	if (byContact !== 0) return byContact;
	return String(a.id ?? '').localeCompare(String(b.id ?? ''), undefined, { numeric: true });
}

export type DeliveryAddressPickRow = {
	id: number | string;
	name?: string | null;
	contact_name?: string | null;
	department_id?: number | string | null;
};

function normName(s: string): string {
	return s
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

/**
 * Default Ship To: match master contact_name to PR creator full name, else first row
 * with same department_id as creator, else first row in list order.
 */
export function pickDefaultDeliveryAddressId(
	rows: DeliveryAddressPickRow[],
	opts: {
		creatorFullName: string | null | undefined;
		creatorDepartmentId: number | null | undefined;
	}
): string | number | null {
	if (!rows?.length) return null;
	const sorted = [...rows].sort(compareDeliveryAddressesForSort);
	const targetName = normName(String(opts.creatorFullName || ''));
	if (targetName) {
		const byContact = sorted.find((r) => normName(String(r.contact_name || '')) === targetName);
		if (byContact) return byContact.id;
	}
	const deptId = opts.creatorDepartmentId;
	if (deptId != null && !Number.isNaN(Number(deptId))) {
		const d = Number(deptId);
		const byDept = sorted.find((r) => r.department_id != null && Number(r.department_id) === d);
		if (byDept) return byDept.id;
	}
	return sorted[0]?.id ?? null;
}
