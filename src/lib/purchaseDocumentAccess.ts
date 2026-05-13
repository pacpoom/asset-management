import {
	userHasAdminRole,
	userHasAdminPurchaseRole,
	userHasPurchaseRole
} from '$lib/userRole';

type SessionUser = {
	role: string;
	roleNames?: string[];
	department_id?: number | null;
} | null;

/**
 * Purchase / PR visibility:
 * - admin, Admin_Purchase: ไม่จำกัดแผนก (เห็นทุก PR)
 * - Purchase: จำกัดตามแผนกของผู้ใช้ (department_id)
 * - อื่นๆ: ไม่บังคับ filter แผนกใน scope นี้ (พฤติกรรมเดิม)
 */
export function getPurchaseDepartmentScope(user: SessionUser): number | null {
	if (!user) return null;
	if (userHasAdminRole(user)) return null;
	// Admin_Purchase ต้องเห็นได้ทุกแผนก — ตรวจก่อน role Purchase เสมอ
	if (userHasAdminPurchaseRole(user)) return null;
	if (!userHasPurchaseRole(user)) return null;
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
