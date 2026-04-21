import { userHasAdminRole, canManageUsers } from '$lib/userRole';
import { canAccessApplicationEnvConfig } from '$lib/envConfigAccess';
import { hasDarListAccess } from '$lib/isodocsDarPermissions';

type SessionUser = {
	role: string;
	roleNames?: string[];
	permissions: string[];
};

/** โหลด dashboard หลัก (/) ได้เมื่อเป็น admin หรือมีสิทธิ์ view dashboard / view dashboard news */
export function shouldLoadAssetDashboard(user: SessionUser | null): boolean {
	if (!user) return false;
	if (userHasAdminRole(user)) return true;
	const p = user.permissions ?? [];
	return p.includes('view dashboard') || p.includes('view dashboard news');
}

/**
 * หน้าแรกหลัง login เมื่อไม่มีสิทธิ์ view dashboard — ลำดับตามความน่าจะใช้บ่อย
 * สุดท้ายไป /profile (ทุกคนที่ล็อกอินแล้วเข้าได้)
 */
export function getFallbackHomePath(user: SessionUser | null): string {
	if (!user) return '/login';
	const p = new Set(user.permissions ?? []);

	if (p.has('view dashboard news') || p.has('view dashboard')) return '/';
	if (p.has('view isodocs')) return '/isodocs-control';
	if (hasDarListAccess(user)) return '/isodocs-control/dar-list';
	if (p.has('manage isodocs flow')) return '/isodocs-control/approval-flow';
	if (p.has('manage isodocs master')) return '/isodocs-control/type-master';
	if (canManageUsers(user)) return '/users';
	if (p.has('view roles')) return '/roles';
	if (p.has('manage settings')) return '/permissions';
	if (canAccessApplicationEnvConfig(user)) return '/settings/env-config';

	return '/profile';
}
