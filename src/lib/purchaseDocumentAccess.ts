import { userHasAdminRole, userHasRoleName } from '$lib/userRole';

type SessionUser = {
	role: string;
	roleNames?: string[];
	department_id?: number | null;
} | null;

/**
 * Purchase visibility rule:
 * - admin / Admin_Purchase: see all departments
 * - Purchase: only own department
 * - others: keep existing behavior (no department restriction)
 */
export function getPurchaseDepartmentScope(user: SessionUser): number | null {
	if (!user) return null;
	if (userHasAdminRole(user)) return null;
	if (userHasRoleName(user, 'admin_purchase')) return null;
	if (!userHasRoleName(user, 'purchase')) return null;
	return user.department_id ?? -1;
}

export function canAccessPurchaseDocumentByDepartment(
	user: SessionUser,
	documentDepartmentId: number | null
): boolean {
	const scopedDepartmentId = getPurchaseDepartmentScope(user);
	if (scopedDepartmentId === null) return true;
	if (documentDepartmentId == null) return false;
	return Number(documentDepartmentId) === scopedDepartmentId;
}
