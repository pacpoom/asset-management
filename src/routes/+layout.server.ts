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
    
    // Convert Map values back to array for the next loop (important if the map altered object references, though Svelte's behavior is often fine without this step)
    const menusWithChildren = Array.from(menuMap.values());

	// Second pass: link children to their parents
	menusWithChildren.forEach((menu) => {
		if (menu.parent_id !== null && menuMap.has(menu.parent_id)) {
			menuMap.get(menu.parent_id)?.children?.push(menu);
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
 */
export const load: LayoutServerLoad = async ({ url, locals }) => {
	// If user is not logged in and not on the login page, redirect them.
	if (!locals.user && url.pathname !== '/login') {
		throw redirect(303, '/login');
	}

	let menus: Menu[] = [];

	// If the user is logged in, fetch the menus they are allowed to see.
	if (locals.user) {
		try {
			let query: string;
			let params: any[] = [];
            let isDynamicInClause = false;

			// Admin gets all menus, no parameters needed.
			if (locals.user.role === 'admin') {
				query = `
                    SELECT id, title, icon, route, parent_id, permission_name, \`order\`
                    FROM menus
                    ORDER BY parent_id ASC, \`order\` ASC, title ASC
                `;
			} else {
				const userPermissions = locals.user.permissions;

				if (userPermissions && userPermissions.length > 0) {
					// For users with permissions, fetch public menus AND their specific menus.
                    // IMPORTANT: We need all menus (root and children) to build the tree, even if the parent itself has no route.
					query = `
						SELECT id, title, icon, route, parent_id, permission_name, \`order\`
						FROM menus
						WHERE
							permission_name IS NULL OR
							permission_name IN (?) OR
                            -- Also include parent menus whose children the user can see (route is null, but needed for navigation structure)
                            id IN (
                                SELECT DISTINCT parent_id 
                                FROM menus 
                                WHERE parent_id IS NOT NULL AND (permission_name IS NULL OR permission_name IN (?))
                            )
						ORDER BY parent_id ASC, \`order\` ASC, title ASC
					`;
					// Pass permissions nested in an array for `pool.query` to expand the IN (?) clause.
					params = [userPermissions, userPermissions]; 
                    isDynamicInClause = true; // Flag that we need to use pool.query
				} else {
					// For users with NO permissions, only fetch public menus.
					query = `
						SELECT id, title, icon, route, parent_id, permission_name, \`order\`
						FROM menus
						WHERE
							permission_name IS NULL
						ORDER BY parent_id ASC, \`order\` ASC, title ASC
					`;
					// No parameters are needed for this query.
				}
			}

            let menuRows;
            
            // FIX: Use pool.query for the dynamic IN clause (isDynamicInClause = true) 
            // as pool.execute does not handle array parameter expansion correctly.
            if (isDynamicInClause) {
                 [menuRows] = await pool.query<Menu[]>(query, params);
            } else {
                 [menuRows] = await pool.execute<Menu[]>(query, params);
            }


			menus = buildMenuTree(menuRows as Menu[]);

		} catch (err) {
			console.error('[+layout.server.ts] Database error during menu fetch:', err);
		}
	}

	return { 
		user: locals.user,
		menus: menus // Pass the hierarchical menu structure to the layout
	};
};