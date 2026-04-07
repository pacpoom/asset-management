import { userHasAdminRole } from '$lib/userRole';

/** สิทธิ์เปิดหน้า /settings/env-config — ผูกกับ role ใน Roles & Permissions */
export const PERM_MANAGE_ENV_CONFIG = 'manage env config';

function isItDevRoleName(role: string): boolean {
	return role.replace(/\s/g, '').toLowerCase().replace(/-/g, '_') === 'it_dev';
}

export function canAccessApplicationEnvConfig(
	user: { role: string; roleNames?: string[]; permissions: string[] } | null | undefined
): boolean {
	if (!user) return false;
	if (userHasAdminRole(user)) return true;
	if (user.permissions.includes(PERM_MANAGE_ENV_CONFIG)) return true;
	/* Fallback หลังสร้าง role IT_Dev แต่ยังไม่ได้รัน sql/permission_manage_env_config.sql */
	if (isItDevRoleName(user.role)) return true;
	return user.roleNames?.some((n) => isItDevRoleName(n)) ?? false;
}
