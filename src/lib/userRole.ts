/** Client + server safe helpers for session `App.User` / multi-role. */

export function userHasAdminRole(user: {
	role: string;
	roleNames?: string[];
} | null): boolean {
	if (!user) return false;
	if (normalizeRoleName(user.role) === 'admin') return true;
	return user.roleNames?.some((role) => normalizeRoleName(role) === 'admin') ?? false;
}

export function normalizeRoleName(role: string | null | undefined): string {
	return String(role ?? '')
		.trim()
		.toLowerCase()
		.replace(/[\s.\-]+/g, '_')
		.replace(/_+/g, '_');
}

/** Admin_Purchase — เห็น PR/เอกสารจัดซื้อทุกแผนก */
export function userHasAdminPurchaseRole(user: {
	role: string;
	roleNames?: string[];
} | null): boolean {
	return userHasRoleName(user, 'admin_purchase');
}

/** Role Purchase (ไม่รวม Admin_Purchase) — ใช้คู่กับสิทธิ์อื่นในโมดูลจัดซื้อ */
export function userHasPurchaseRole(user: {
	role: string;
	roleNames?: string[];
} | null): boolean {
	return userHasRoleName(user, 'purchase');
}

/** ออก PO จาก PR — เฉพาะ admin หรือ Admin_Purchase (ไม่ใช่แค่ role Purchase) */
export function userCanIssuePurchaseOrderFromPr(user: {
	role: string;
	roleNames?: string[];
} | null): boolean {
	if (!user) return false;
	if (userHasAdminRole(user)) return true;
	return userHasAdminPurchaseRole(user);
}

export function userHasRoleName(
	user: { role: string; roleNames?: string[] } | null,
	roleName: string
): boolean {
	if (!user) return false;
	const target = normalizeRoleName(roleName);
	if (normalizeRoleName(user.role) === target) return true;
	return user.roleNames?.some((role) => normalizeRoleName(role) === target) ?? false;
}

/** จัดการผู้ใช้หน้า /users (เทียบเท่า admin สำหรับ Users module เมื่อมีสิทธิ์ manage users) */
export function canManageUsers(user: {
	role: string;
	roleNames?: string[];
	permissions?: string[];
} | null): boolean {
	if (!user) return false;
	if (userHasAdminRole(user)) return true;
	return user.permissions?.includes('manage users') ?? false;
}
