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

export type DeliveryAddressPickRow = {
	id: number | string;
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
	const targetName = normName(String(opts.creatorFullName || ''));
	if (targetName) {
		const byContact = rows.find((r) => normName(String(r.contact_name || '')) === targetName);
		if (byContact) return byContact.id;
	}
	const deptId = opts.creatorDepartmentId;
	if (deptId != null && !Number.isNaN(Number(deptId))) {
		const d = Number(deptId);
		const byDept = rows.find((r) => r.department_id != null && Number(r.department_id) === d);
		if (byDept) return byDept.id;
	}
	return rows[0]?.id ?? null;
}
