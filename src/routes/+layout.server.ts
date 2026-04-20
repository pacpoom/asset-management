import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { expandPermissionsForMenuInClause } from '$lib/isodocsDarPermissions';
import { userHasAdminRole } from '$lib/userRole';
import { safeInternalRedirect } from '$lib/safeRedirect';
import pool from '$lib/server/database';
import type { RowDataPacket } from 'mysql2';

// Type for a menu item fetched from the database
interface Menu extends RowDataPacket {
	id: number;
	title: string;
	icon: string | null;
	route: string | null;
	parent_id: number | null;
	permission_name: string | null;
	order: number;
	children: Menu[];
}

// Type for company data
interface CompanyData extends RowDataPacket {
	name: string;
	system_name: string | null;
	logo_path: string | null;
}

/**
 * Builds a hierarchical menu structure from a flat list of menu items.
 * @param menus The flat list of menus from the database.
 * @returns An array of root-level menu items with nested children.
 */
function buildMenuTree(menus: Menu[]): Menu[] {
	const menuMap = new Map<number, Menu>();
	const rootMenus: Menu[] = [];

	// First pass: add all menus to a map and initialize children array
	menus.forEach((menu) => {
		const menuWithChildren: Menu = {
			...menu,
			children: [],
			parent_id: menu.parent_id !== undefined ? (menu.parent_id as number | null) : null,
			permission_name:
				menu.permission_name !== undefined ? (menu.permission_name as string | null) : null
		};
		menuMap.set(menu.id, menuWithChildren);
	});

	const menusWithChildren = Array.from(menuMap.values());

	// Second pass: link children to their parents
	menusWithChildren.forEach((menu) => {
		if (menu.parent_id !== null && menuMap.has(menu.parent_id)) {
			const parent = menuMap.get(menu.parent_id);
			if (parent) {
				parent.children?.push(menu);
			} else {
				rootMenus.push(menu);
			}
		} else {
			rootMenus.push(menu);
		}
	});

	// Sort all levels of the menu by the 'order' property
	const sortMenus = (menuList: Menu[]) => {
		menuList.sort((a, b) => a.order - b.order);
		menuList.forEach((menu) => {
			if (menu.children && menu.children.length > 0) {
				sortMenus(menu.children);
			}
		});
	};

	sortMenus(rootMenus);

	return rootMenus;
}

/** Legacy DB menu titles to hide everywhere (whole branch). Kept in code so sidebars stay clean without an immediate DB cleanup. */
const RETIRED_MENU_ROOT_TITLE_KEYS = new Set(['iso document center']);

function excludeRetiredMenuBranches(menus: Menu[]): Menu[] {
	if (!menus.length) return menus;
	const byParent = new Map<number | null, Menu[]>();
	for (const m of menus) {
		const pid = m.parent_id ?? null;
		const list = byParent.get(pid) ?? [];
		list.push(m);
		byParent.set(pid, list);
	}
	const removed = new Set<number>();
	const queue: number[] = [];
	for (const m of menus) {
		if (RETIRED_MENU_ROOT_TITLE_KEYS.has(m.title.trim().toLowerCase())) {
			removed.add(m.id);
			queue.push(m.id);
		}
	}
	while (queue.length) {
		const id = queue.pop()!;
		const kids = byParent.get(id) ?? [];
		for (const ch of kids) {
			if (!removed.has(ch.id)) {
				removed.add(ch.id);
				queue.push(ch.id);
			}
		}
	}
	return menus.filter((m) => !removed.has(m.id));
}

/**
 * LayoutServerLoad function to check login status and load dynamic,
 * permission-based menus for the sidebar on every page.
 * ADDED: Also loads company logo path and name/system_name.
 */
export const load: LayoutServerLoad = async ({ url, locals }) => {
	if (!locals.user && url.pathname !== '/login') {
		const next = `${url.pathname}${url.search}`;
		const dest = safeInternalRedirect(next);
		const loginUrl = dest ? `/login?redirect=${encodeURIComponent(dest)}` : '/login';
		throw redirect(303, loginUrl);
	}

	let menus: Menu[] = [];
	let companyLogoPath: string | null = null;
	let systemName: string = 'Core Business';

	if (locals.user) {
		try {
			// --- Fetch Menus ---
			let query: string;
			let params: any[] = [];
			let isDynamicInClause = false;

			// Admin gets all menus
			if (userHasAdminRole(locals.user)) {
				query = `
                    SELECT id, title, icon, route, parent_id, permission_name, \`order\`
                    FROM menus
                    ORDER BY parent_id ASC, \`order\` ASC, title ASC
                `;
			} else {
				const userPermissions = expandPermissionsForMenuInClause(locals.user.permissions);
				if (userPermissions && userPermissions.length > 0) {
					// Include parents only when the user matches a child by explicit permission.
					// Treating NULL child permission as a match for "pull parent in" used to expose entire
					// branches (e.g. Workforce) to every logged-in user.
					query = `
						SELECT id, title, icon, route, parent_id, permission_name, \`order\`
						FROM menus
						WHERE
							permission_name IS NULL OR
							permission_name IN (?) OR
							id IN (
								SELECT DISTINCT parent_id
								FROM menus
								WHERE parent_id IS NOT NULL AND permission_name IN (?)
							)
						ORDER BY parent_id ASC, \`order\` ASC, title ASC
					`;
					params = [userPermissions, userPermissions];
					isDynamicInClause = true;
				} else {
					query = `
						SELECT id, title, icon, route, parent_id, permission_name, \`order\`
						FROM menus
						WHERE permission_name IS NULL
						ORDER BY parent_id ASC, \`order\` ASC, title ASC
					`;
				}
			}

			let menuRows;
			if (isDynamicInClause) {
				[menuRows] = await pool.query<Menu[]>(query, params);
			} else {
				[menuRows] = await pool.execute<Menu[]>(query, params);
			}
			let flat = menuRows as Menu[];
			flat = excludeRetiredMenuBranches(flat);
			if (!userHasAdminRole(locals.user)) {
				const permissionSet = new Set(
					(expandPermissionsForMenuInClause(locals.user.permissions) ?? []).map((p) =>
						String(p || '').trim().toLowerCase()
					)
				);
				// Keep parent auto-pull behavior generally, but do not auto-show "Configuration/Settings"
				// root menu unless user explicitly has its own permission.
				flat = flat.filter((m) => {
					if (m.parent_id !== null) return true;
					const title = String(m.title || '').trim().toLowerCase();
					const route = String(m.route || '').trim().toLowerCase();
					const isConfigRoot =
						title === 'configuration' ||
						title === 'settings' ||
						title.includes('config') ||
						route.startsWith('/settings');
					if (!isConfigRoot) return true;
					const ownPermission = String(m.permission_name || '').trim().toLowerCase();
					return ownPermission !== '' && permissionSet.has(ownPermission);
				});
			}
			// Drop NULL-permission items when their parent was not loaded (stops "Workforce" branch
			// showing via a free child). Keep rows with explicit permission even if an ancestor is
			// missing so deep trees still work with the single-level parent subquery.
			const selectedIds = new Set(flat.map((m) => m.id));
			flat = flat.filter((m) => {
				if (m.parent_id == null) return true;
				if (selectedIds.has(m.parent_id)) return true;
				const pn = m.permission_name;
				const inherits = pn == null || String(pn).trim() === '';
				return !inherits;
			});
			menus = buildMenuTree(flat);

			// --- Fetch Company Info (Name & Logo) ---
			const [companyRows] = await pool.execute<CompanyData[]>(
				`SELECT name, system_name, logo_path FROM company WHERE id = ? LIMIT 1`,
				[1]
			);
			if (companyRows.length > 0) {
				companyLogoPath = companyRows[0].logo_path;
				if (companyRows[0].system_name) {
					systemName = companyRows[0].system_name;
				} else if (companyRows[0].name) {
					systemName = companyRows[0].name;
				}
			}
		} catch (err) {
			console.error('[+layout.server.ts] Database error during data fetch:', err);
		}
	}

	return {
		user: locals.user,
		menus: menus,
		companyLogoPath,
		systemName
	};
};
