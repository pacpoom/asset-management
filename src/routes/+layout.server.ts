import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
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
	children: Menu[]; // To hold nested children (REQUIRED for the tree structure)
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
		// Ensure a new object is created and children property is initialized
        const menuWithChildren: Menu = {
            ...menu,
            children: [],
            // Cast properties to ensure correct types (as some might be RowDataPacket defaults)
            parent_id: menu.parent_id !== undefined ? (menu.parent_id as number | null) : null,
            permission_name: menu.permission_name !== undefined ? (menu.permission_name as string | null) : null,
        };
		menuMap.set(menu.id, menuWithChildren);
	});

    // Convert Map values back to array for the next loop
    const menusWithChildren = Array.from(menuMap.values());

	// Second pass: link children to their parents
	menusWithChildren.forEach((menu) => {
		if (menu.parent_id !== null && menuMap.has(menu.parent_id)) {
            // Ensure parent exists before pushing
             const parent = menuMap.get(menu.parent_id);
             if (parent) {
                parent.children?.push(menu);
             } else {
                 // Handle orphaned menu item if necessary, or just add to root
                 rootMenus.push(menu);
             }
		} else {
			rootMenus.push(menu);
		}
	});

	// Sort all levels of the menu by the 'order' property
	const sortMenus = (menuList: Menu[]) => {
		menuList.sort((a, b) => a.order - b.order);
		menuList.forEach(menu => {
			if (menu.children && menu.children.length > 0) {
				sortMenus(menu.children);
			}
		});
	};

	sortMenus(rootMenus);

	return rootMenus;
}


/**
 * LayoutServerLoad function to check login status and load dynamic,
 * permission-based menus for the sidebar on every page.
 * ADDED: Also loads company logo path and name/system_name.
 */
export const load: LayoutServerLoad = async ({ url, locals }) => {
	// If user is not logged in and not on the login page, redirect them.
	if (!locals.user && url.pathname !== '/login') {
		throw redirect(303, '/login');
	}

	let menus: Menu[] = [];
    let companyLogoPath: string | null = null;
    let systemName: string = 'Core Business'; // Default fallback name

	// If the user is logged in, fetch menus and company data
	if (locals.user) {
		try {
            // --- Fetch Menus ---
			let query: string;
			let params: any[] = [];
            let isDynamicInClause = false;

			// Admin gets all menus
			if (locals.user.role === 'admin') {
				query = `
                    SELECT id, title, icon, route, parent_id, permission_name, \`order\`
                    FROM menus
                    ORDER BY parent_id ASC, \`order\` ASC, title ASC
                `;
			} else { // Fetch menus based on user permissions
				const userPermissions = locals.user.permissions;
				if (userPermissions && userPermissions.length > 0) {
					query = `
						SELECT id, title, icon, route, parent_id, permission_name, \`order\`
						FROM menus
						WHERE
							permission_name IS NULL OR
							permission_name IN (?) OR
                            id IN (
                                SELECT DISTINCT parent_id
                                FROM menus
                                WHERE parent_id IS NOT NULL AND (permission_name IS NULL OR permission_name IN (?))
                            )
						ORDER BY parent_id ASC, \`order\` ASC, title ASC
					`;
					params = [userPermissions, userPermissions];
                    isDynamicInClause = true;
				} else { // Fetch only public menus
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
			menus = buildMenuTree(menuRows as Menu[]);

            // --- Fetch Company Info (Name & Logo) ---
            const [companyRows] = await pool.execute<CompanyData[]>(
                `SELECT name, system_name, logo_path FROM company WHERE id = ? LIMIT 1`,
                [1] // Assuming company ID is always 1
            );
            if (companyRows.length > 0) {
                companyLogoPath = companyRows[0].logo_path;
                // Prefer system_name, fallback to name, then default
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
        systemName // Renamed from companyName to indicate intent
	};
};