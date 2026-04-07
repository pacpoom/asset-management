import { userHasAdminRole } from '$lib/userRole';

/**
 * สิทธิ์รวม DAR List / workflow (โหลดหน้าได้)
 * บทบาทแยกขั้น: ISO_DOCS_MGR / ISO_DOCS_VP / ISODOCS_QMR ตาม sql/roles_isodocs_approval_flow.sql
 */
export const PERM_ISODOCS_DAR_APPROVE = 'approve isodocs dar';
export const PERM_ISODOCS_DAR_MANAGE = 'manage isodocs dar';

/** ขั้น Reviewed By → Role ISO_DOCS_MGR */
export const PERM_ISODOCS_DAR_MGR = 'isodocs dar approval manager';
/** ขั้น Approved By → Role ISO_DOCS_VP */
export const PERM_ISODOCS_DAR_VP = 'isodocs dar approval vp';
/** Notify QMR / ลงทะเบียน → Role ISODOCS_QMR */
export const PERM_ISODOCS_DAR_QMR = 'isodocs dar approval qmr';

const VIEW_ISODOCS = 'view isodocs';

const DAR_LIST_PERMISSIONS = [
	PERM_ISODOCS_DAR_APPROVE,
	PERM_ISODOCS_DAR_MANAGE,
	PERM_ISODOCS_DAR_MGR,
	PERM_ISODOCS_DAR_VP,
	PERM_ISODOCS_DAR_QMR
] as const;

/**
 * ขยายรายการสิทธิ์เฉพาะตอนโหลดเมนู: ให้เมนู DAR ที่ผูก `approve isodocs dar` แสดงเมื่อมีสิทธิ์ขั้น MGR/VP/QMR ด้วย
 * (ไม่เปลี่ยน locals.user.permissions)
 */
export function expandPermissionsForMenuInClause(permissions: string[]): string[] {
	const set = new Set(permissions);

	// If user has any IsoDocs-related capability, ensure the root menu is visible.
	// Root menu '/isodocs-control' is permissioned by `view isodocs`, but legacy/utility
	// roles (e.g. IT_Dev) may only have manage/approve perms without explicitly having view.
	if (![...set].some((p) => String(p || '').toLowerCase().includes('isodocs'))) {
		// keep as-is
	} else {
		set.add(VIEW_ISODOCS);
	}
	if (
		set.has(PERM_ISODOCS_DAR_MGR) ||
		set.has(PERM_ISODOCS_DAR_VP) ||
		set.has(PERM_ISODOCS_DAR_QMR)
	) {
		set.add(PERM_ISODOCS_DAR_APPROVE);
		set.add(VIEW_ISODOCS);
	}
	return [...set];
}

export function hasDarListAccess(
	user: { role: string; roleNames?: string[]; permissions: string[] } | null | undefined
): boolean {
	if (!user) return false;
	if (userHasAdminRole(user)) return true;
	const p = new Set(user.permissions);
	return DAR_LIST_PERMISSIONS.some((name) => p.has(name));
}

/**
 * สิทธิ์ approve isodocs dar / manage isodocs dar (เช่น ISO_DOCS_ADMIN) — ใช้ได้ทุกขั้นเมื่อถูกกำหนดใน Flow
 */
function hasBundledDarStepPower(perms: Set<string>): boolean {
	return perms.has(PERM_ISODOCS_DAR_APPROVE) || perms.has(PERM_ISODOCS_DAR_MANAGE);
}

function canActAsManager(perms: Set<string>): boolean {
	return perms.has(PERM_ISODOCS_DAR_MGR) || hasBundledDarStepPower(perms);
}

function canActAsVp(perms: Set<string>): boolean {
	return perms.has(PERM_ISODOCS_DAR_VP) || hasBundledDarStepPower(perms);
}

function canActAsQmr(perms: Set<string>): boolean {
	return perms.has(PERM_ISODOCS_DAR_QMR) || hasBundledDarStepPower(perms);
}

/**
 * ขั้นละอย่างใดอย่างหนึ่ง:
 * - ถูกเลือกใน Iso Approval Flow ขั้นนั้น หรือ
 * - มีสิทธิ์ขั้นแบบ Role (isodocs dar approval manager | vp | qmr)
 *
 * สิทธิ์รวม approve | manage isodocs dar ต้องถูกเลือกใน Flow อยู่ดี (ไม่ใช้สิทธิ์ขั้นแทนรายชื่อ)
 */
export function darStepFlagsWithPermissions(
	actors: { reviewerUserIds: number[]; approverUserIds: number[]; controllerUserIds: number[] } | null,
	userId: number,
	permissions: string[]
): { canReview: boolean; canApprove: boolean; canRegister: boolean } {
	if (!actors) {
		return { canReview: false, canApprove: false, canRegister: false };
	}
	const perms = new Set(permissions);

	const inReviewers = actors.reviewerUserIds.includes(userId);
	const inApprovers = actors.approverUserIds.includes(userId);
	const inQmr = actors.controllerUserIds.includes(userId);

	const reviewAllowed = inReviewers || perms.has(PERM_ISODOCS_DAR_MGR);
	const approveAllowed = inApprovers || perms.has(PERM_ISODOCS_DAR_VP);
	const registerAllowed = inQmr || perms.has(PERM_ISODOCS_DAR_QMR);

	return {
		canReview: canActAsManager(perms) && reviewAllowed,
		canApprove: canActAsVp(perms) && approveAllowed,
		canRegister: canActAsQmr(perms) && registerAllowed
	};
}
