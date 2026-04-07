/** Client + server safe helpers for session `App.User` / multi-role. */

export function userHasAdminRole(user: {
	role: string;
	roleNames?: string[];
} | null): boolean {
	if (!user) return false;
	if (user.role === 'admin') return true;
	return user.roleNames?.includes('admin') ?? false;
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
