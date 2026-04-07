/**
 * ชื่อ Role และข้อความ UI สำหรับ DAR workflow — ให้ตรงกับ Roles & Permissions / sql/roles_isodocs_approval_flow.sql
 */
export {
	PERM_ISODOCS_DAR_MGR as DAR_PERM_MGR,
	PERM_ISODOCS_DAR_VP as DAR_PERM_VP,
	PERM_ISODOCS_DAR_QMR as DAR_PERM_QMR,
	PERM_ISODOCS_DAR_APPROVE as DAR_PERM_APPROVE_ALL,
	PERM_ISODOCS_DAR_MANAGE as DAR_PERM_MANAGE_DAR
} from '$lib/isodocsDarPermissions';

/** Role ในตาราง roles (หน้า /roles) */
export const DAR_ROLE_MGR = 'ISO_DOCS_MGR';
export const DAR_ROLE_VP = 'ISO_DOCS_VP';
export const DAR_ROLE_QMR = 'ISODOCS_QMR';

export const DAR_UI_WORKFLOW_LINE = `${DAR_ROLE_MGR} → ${DAR_ROLE_VP} → ${DAR_ROLE_QMR}`;

export const DAR_UI_MGR_TITLE = `${DAR_ROLE_MGR} · Reviewed By`;
export const DAR_UI_VP_TITLE = `${DAR_ROLE_VP} · Approved By`;
export const DAR_UI_QMR_TITLE = `${DAR_ROLE_QMR} · Notify QMR`;
