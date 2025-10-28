<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	// Update LayoutData type if necessary (SvelteKit might infer it)
	import type { LayoutServerData } from './$types'; // Use LayoutServerData
	import { page, navigating } from '$app/stores';
	// <<< FIX: Import 'fade' along with 'slide' >>>
	import { slide, fade } from 'svelte/transition';
	import { Toaster } from 'svelte-sonner';

	// Svelte 5 runes: Define props and reactive state
	const { data, children } = $props<{ data: LayoutServerData; children: unknown }>(); // Use LayoutServerData
	type Menu = LayoutServerData['menus'][0]; // Get the menu type

	// สถานะสำหรับเมนูมือถือ (ซ้าย/ขวา)
	let isSidebarOpen = $state(false);

	// สถานะสำหรับยุบเมนูบน Desktop (เปิด/ปิด)
	let isSidebarCollapsed = $state(false);

	// State for collapsible sub-menus (when not collapsed)
	let openMenuIds = $state(new Set<number>());
	let isAdminMenuOpen = $state(false);

	// <<< NEW: State for flyout menu when collapsed >>>
	let flyoutMenuId = $state<number | null>(null);
	let flyoutTimeout: NodeJS.Timeout | null = null; // Timeout for closing flyout

	// Function to toggle *any* menu ID (only used when not collapsed)
	function toggleMenu(id: number) {
		if (isSidebarCollapsed) return; // Don't toggle when collapsed

		const newSet = new Set(openMenuIds); // Create a new set for reactivity
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			// Collapse other open menus at the same level when opening a new one
			const currentMenu = findMenuById(data.menus, id);
			const parentId = currentMenu?.parent_id;
			const siblings = parentId
				? findMenuById(data.menus, parentId)?.children
				: data.menus;

			if (siblings) {
				siblings.forEach(sibling => {
					if (sibling.id !== id && sibling.children && sibling.children.length > 0) {
						newSet.delete(sibling.id); // Close sibling submenus
					}
				});
			}

			newSet.add(id);
		}
		openMenuIds = newSet; // Re-assign the state
	}

	// Helper function to find a menu item by ID recursively
	function findMenuById(menus: Menu[] | undefined, id: number): Menu | null {
        if (!menus) return null; // Add check for undefined menus
		for (const menu of menus) {
			if (menu.id === id) {
				return menu;
			}
			if (menu.children && menu.children.length > 0) {
				const found = findMenuById(menu.children, id);
				if (found) {
					return found;
				}
			}
		}
		return null;
	}


	// Close sidebar on navigation change using $effect rune
	$effect(() => {
		if ($navigating) {
			isSidebarOpen = false;
            // <<< NEW: Close flyout on navigation >>>
            flyoutMenuId = null;
            if (flyoutTimeout) clearTimeout(flyoutTimeout);
		}
		// When sidebar collapses, close all open submenus and flyouts
		if (isSidebarCollapsed) {
			openMenuIds = new Set<number>();
            isAdminMenuOpen = false; // Also close admin menu
            flyoutMenuId = null; // Close flyout
            if (flyoutTimeout) clearTimeout(flyoutTimeout);
		}
	});

	function isLinkActive(href: string | null) {
		if (!href) return false;
		// Special case for the root path '/'
		if (href === '/') {
			return $page.url.pathname === '/';
		}
		// Check if the current path starts with the href, ensuring it's not just a partial match of a longer path
        // e.g., /users should match /users and /users/123, but not /users-roles
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}

    // <<< NEW: Functions to handle flyout menu visibility with delay >>>
    function handleMouseEnter(id: number) {
        if (!isSidebarCollapsed) return;
        if (flyoutTimeout) clearTimeout(flyoutTimeout);
        flyoutMenuId = id;
    }

    function handleMouseLeave() {
        if (!isSidebarCollapsed) return;
        if (flyoutTimeout) clearTimeout(flyoutTimeout);
        flyoutTimeout = setTimeout(() => {
            flyoutMenuId = null;
        }, 200); // Delay before closing
    }

</script>

<!-- Snippet for rendering menu items recursively -->
<!-- <<< MODIFIED: Snippet now handles both normal and flyout rendering >>> -->
{#snippet menuList(menus: Menu[] | undefined, level: number, isFlyout: boolean = false)}
    {#if menus}
	<ul class="space-y-1 {level > 0 && !isFlyout ? (isSidebarCollapsed ? 'pl-0 hidden' : 'pl-5 pt-1') : ''} {isFlyout ? 'min-w-[200px]' : ''}">
		{#each menus as menu}
			<li
                class="{isSidebarCollapsed && level === 0 ? 'relative' : ''}"
                onmouseenter={isSidebarCollapsed && level === 0 && menu.children && menu.children.length > 0 ? () => handleMouseEnter(menu.id) : null}
                onmouseleave={isSidebarCollapsed && level === 0 && menu.children && menu.children.length > 0 ? handleMouseLeave : null}
            >
				{#if menu.route}
					{#if menu.children && menu.children.length > 0 && !isSidebarCollapsed}
						<!-- CASE: Parent with Route, NOT Collapsed -->
						<div class="relative group">
							<a
								href={menu.route}
								class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-150 {isLinkActive(menu.route) ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 pr-8"
								title={menu.title}
							>
								<span class="material-symbols-outlined h-5 w-5 flex-shrink-0 transition-transform group-hover:scale-110">{menu.icon || 'folder'}</span>
								<span class="whitespace-nowrap overflow-hidden font-medium transition-all duration-100">{menu.title}</span>
							</a>
							<button
								type="button"
								onclick={event => { event.stopPropagation(); toggleMenu(menu.id); }}
								class="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 z-10"
								aria-label="Toggle submenu"
							>
                                <span class="sr-only">Toggle submenu</span>
								<svg class={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${openMenuIds.has(menu.id) ? 'rotate-90' : 'rotate-0'}`} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="m9 18 6-6-6-6" />
								</svg>
							</button>
						</div>
					{:else}
						<!-- CASE: Leaf with Route OR Parent with Route (Collapsed/Flyout) -->
						<a
							href={menu.route}
							class="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors duration-150 group
                                {isLinkActive(menu.route) ? (isSidebarCollapsed || isFlyout ? 'bg-blue-100 text-blue-700' : 'bg-blue-600 text-white shadow-md hover:bg-blue-700') : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
                                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                                {isSidebarCollapsed && !isFlyout ? 'justify-center' : ''}"
							title={isSidebarCollapsed && !isFlyout ? menu.title : ''}
						>
							<span class="material-symbols-outlined h-6 w-6 flex-shrink-0 transition-transform group-hover:scale-110">
                                {menu.icon || (menu.children && menu.children.length > 0 ? 'folder' : 'circle')}
                            </span>
							<span class={`whitespace-nowrap overflow-hidden font-medium transition-all duration-100 ${(isSidebarCollapsed && !isFlyout) ? 'lg:hidden' : ''}`}>
                                {menu.title}
                            </span>
						</a>
					{/if}
				{:else if menu.children && menu.children.length > 0}
					<!-- CASE: Parent without Route (Toggle OR Flyout Trigger) -->
					{#if isSidebarCollapsed && !isFlyout}
                        <!-- Flyout Trigger (Collapsed): Just show icon, hover handled by li -->
                         <div
                            class="flex items-center justify-center gap-3 rounded-lg px-3 py-3 transition-colors duration-150 group text-gray-600 hover:bg-gray-100 hover:text-gray-900 cursor-pointer"
                            title={menu.title}
                         >
                            <span class="material-symbols-outlined h-6 w-6 flex-shrink-0 transition-transform group-hover:scale-110">{menu.icon || 'folder'}</span>
                         </div>
                    {:else}
                         <!-- Normal Toggle Button (Not Collapsed or Inside Flyout) -->
                        <button
                            type="button"
                            onclick={() => toggleMenu(menu.id)}
                            class="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 transition-colors duration-150 group text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                            <div class="flex items-center gap-3">
                                <span class="material-symbols-outlined h-6 w-6 flex-shrink-0 transition-transform group-hover:scale-110">{menu.icon || 'folder'}</span>
                                <span class="whitespace-nowrap overflow-hidden font-medium transition-all duration-100">{menu.title}</span>
                            </div>
                            <svg class={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${openMenuIds.has(menu.id) ? 'rotate-90' : 'rotate-0'}`} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="m9 18 6-6-6-6" />
                            </svg>
                        </button>
                    {/if}
				{:else}
					<!-- CASE: Item without Route and without Children (Render as non-interactive) -->
					<div class="flex items-center gap-3 rounded-lg px-3 py-3 text-gray-400 {isSidebarCollapsed && !isFlyout ? 'justify-center' : ''}" title={isSidebarCollapsed && !isFlyout ? menu.title : ''}>
						<span class="material-symbols-outlined h-6 w-6 flex-shrink-0">{menu.icon || 'circle'}</span>
						<span class={`whitespace-nowrap overflow-hidden font-medium transition-all duration-100 ${(isSidebarCollapsed && !isFlyout) ? 'lg:hidden' : ''}`}>{menu.title}</span>
					</div>
				{/if}

				<!-- Submenu Rendering (Normal State) -->
				{#if menu.children && menu.children.length > 0 && !isSidebarCollapsed && !isFlyout && openMenuIds.has(menu.id)}
					<div transition:slide={{ duration: 200 }}>
						{@render menuList(menu.children, level + 1)}
					</div>
				{/if}

                <!-- <<< NEW: Flyout Submenu Rendering (Collapsed State) >>> -->
                {#if isSidebarCollapsed && level === 0 && menu.children && menu.children.length > 0 && flyoutMenuId === menu.id}
                     <div
                        class="absolute left-full top-0 ml-1 z-40 rounded-md bg-white shadow-xl border border-gray-200 p-2"
                        onmouseenter={() => handleMouseEnter(menu.id)}
                        onmouseleave={handleMouseLeave}
                        transition:fade={{ duration: 100 }}
                     >
                         <!-- Render children in flyout mode -->
                        {@render menuList(menu.children, level + 1, true)}
                     </div>
                {/if}
			</li>
		{/each}
	</ul>
    {/if}
{/snippet}


<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Core Business</title>
    <!-- Add styles for Material Symbols -->
    <style>
        .material-symbols-outlined {
          font-variation-settings:
          'FILL' 0,
          'wght' 400,
          'GRAD' 0,
          'opsz' 24 /* Increased default size slightly */
        }
    </style>
</svelte:head>

{#if data.user}
	<!-- Main application layout with a light theme -->
	<div class="min-h-screen bg-gray-50 text-gray-800">
		<!-- Mobile Overlay for Sidebar -->
		{#if isSidebarOpen}
			<div
				class="fixed inset-0 z-20 bg-black/50 lg:hidden"
				onclick={() => (isSidebarOpen = false)}
				role="presentation"
			></div>
		{/if}

		<!-- Sidebar -->
		<aside
			class="fixed inset-y-0 left-0 z-30 flex transform flex-col border-r border-gray-200 bg-white transition-all duration-300 ease-in-out
			{isSidebarOpen ? 'translate-x-0 w-64 p-4' : '-translate-x-full w-64 p-4'}
			lg:translate-x-0
			{isSidebarCollapsed ? 'lg:w-20 lg:px-2 lg:py-4' : 'lg:w-64 lg:p-4'}"
			aria-expanded={!isSidebarCollapsed}
		>
			<div class="flex h-full flex-col overflow-y-auto overflow-x-hidden">
				<!-- Logo/Brand -->
				<div class="mb-6 flex h-16 items-center gap-3 px-2 flex-shrink-0 {isSidebarCollapsed ? 'justify-center' : ''}">
                    <div class="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0">
						<!-- *** UPDATED IMG SRC *** -->
                        {#if data.companyLogoPath}
                            <img src={data.companyLogoPath} alt="Company Logo" class="h-8 w-8 object-contain" />
                        {:else}
						    <img src="/logo.png" alt="Default Logo" class="h-8 w-8 object-contain" /> <!-- Fallback logo -->
                        {/if}
					</div>
					<span class={`whitespace-nowrap overflow-hidden text-xl font-bold text-gray-900 transition-all duration-100 ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>
						Core Business
					</span>
				</div>
				<div class="flex-grow">
                    <nav>
					    {@render menuList(data.menus, 0)}

					    <!-- Manually add System Management for admin -->
					    {#if data.user.role === 'admin'}
						    <li
                                class="mt-4 border-t border-gray-200 pt-4 space-y-1 list-none relative"
                                onmouseenter={isSidebarCollapsed ? () => handleMouseEnter(-1) : null}
                                onmouseleave={isSidebarCollapsed ? handleMouseLeave : null}
                             >
                                <button
								    type="button"
								    onclick={() => { if(!isSidebarCollapsed) isAdminMenuOpen = !isAdminMenuOpen }}
								    class="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 transition-colors duration-150 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 {isSidebarCollapsed ? 'justify-center' : ''}"
                                    title={isSidebarCollapsed ? 'System Management' : ''}
							    >
                                    <div class="flex items-center gap-3">
                                        <span class="material-symbols-outlined h-6 w-6 flex-shrink-0 text-gray-400">admin_panel_settings</span>
								        <span class={`whitespace-nowrap overflow-hidden px-0 text-xs font-semibold uppercase text-gray-400 transition-all duration-100 ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>
									        System Management
								        </span>
                                    </div>
								    <svg
									    class={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200 ${isAdminMenuOpen ? 'rotate-90' : 'rotate-0'} ${isSidebarCollapsed ? 'lg:hidden' : ''}`}
									    xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
								    >
									    <path d="m9 18 6-6-6-6" />
								    </svg>
							    </button>

                                {#if !isSidebarCollapsed && isAdminMenuOpen}
								    <ul class="space-y-1 pl-5 pt-1" transition:slide>
									    <li><a href="/roles" class="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors {isLinkActive('/roles') ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" title="Roles & Permissions"><span class="material-symbols-outlined h-6 w-6 flex-shrink-0">shield_person</span><span class="font-medium">Roles & Permissions</span></a></li>
									    <li><a href="/permissions" class="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors {isLinkActive('/permissions') ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" title="Permissions"><span class="material-symbols-outlined h-6 w-6 flex-shrink-0">verified_user</span><span class="font-medium">Permissions</span></a></li>
									    <li><a href="/menus" class="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors {isLinkActive('/menus') ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" title="Menu Management"><span class="material-symbols-outlined h-6 w-6 flex-shrink-0">menu</span><span class="font-medium">Menu Management</span></a></li>
								    </ul>
							    {/if}

                                <!-- <<< NEW: Flyout for Admin Menu >>> -->
                                {#if isSidebarCollapsed && flyoutMenuId === -1}
                                     <div
                                        class="absolute left-full top-0 ml-1 z-40 rounded-md bg-white shadow-xl border border-gray-200 p-2 min-w-[200px]"
                                        onmouseenter={() => handleMouseEnter(-1)}
                                        onmouseleave={handleMouseLeave}
                                        transition:fade={{ duration: 100 }}
                                     >
                                         <ul class="space-y-1">
                                            <li><a href="/roles" class="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors {isLinkActive('/roles') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" title="Roles & Permissions"><span class="material-symbols-outlined h-6 w-6 flex-shrink-0">shield_person</span><span class="font-medium">Roles & Permissions</span></a></li>
                                            <li><a href="/permissions" class="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors {isLinkActive('/permissions') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" title="Permissions"><span class="material-symbols-outlined h-6 w-6 flex-shrink-0">verified_user</span><span class="font-medium">Permissions</span></a></li>
                                            <li><a href="/menus" class="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors {isLinkActive('/menus') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" title="Menu Management"><span class="material-symbols-outlined h-6 w-6 flex-shrink-0">menu</span><span class="font-medium">Menu Management</span></a></li>
                                         </ul>
                                     </div>
                                {/if}
						    </li>
					    {/if}
				    </nav>
                </div>

				<!-- User Info Footer -->
				<div class="mt-auto border-t border-gray-200 pt-4 flex-shrink-0 {isSidebarCollapsed ? 'px-1' : 'px-2'}">
					<div class="flex items-center gap-3 {isSidebarCollapsed ? 'justify-center' : ''}">
                        <div
							class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white shadow-md"
						>
							{data.user.email.substring(0, 2).toUpperCase()}
						</div>
						<div class={`overflow-hidden transition-all duration-100 ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>
							<p class="truncate text-sm font-semibold text-gray-800">{data.user.email}</p>
							<form method="POST" action="/login?/logout" class="block">
								<button type="submit" class="rounded-sm text-xs text-red-500 hover:underline focus:outline-none focus:ring-1 focus:ring-red-500">
									Logout
								</button>
							</form>
						</div>
					</div>
				</div>
			</div>
			<!-- END INNER SIDEBAR CONTENT -->
		</aside>

		<!-- Main Content Area -->
		<div
			class="flex flex-1 flex-col transition-all duration-300 ease-in-out
			{isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}"
		>
			<!-- Desktop Header/Toggle Button -->
			<header
				class="sticky top-0 z-10 hidden h-16 items-center border-b border-gray-200 bg-white/90 px-4 backdrop-blur-sm shadow-sm lg:flex"
			>
				<!-- Toggle Sidebar Button -->
				<button
					onclick={() => (isSidebarCollapsed = !isSidebarCollapsed)}
					class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
					title={isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
				>
					<span class="sr-only">{isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}</span>
					{#if isSidebarCollapsed}
						<span class="material-symbols-outlined h-6 w-6">menu</span>
					{:else}
						<span class="material-symbols-outlined h-6 w-6">menu_open</span>
					{/if}
				</button>
				<!-- Spacer -->
				<div class="flex-grow"></div>
			</header>

			<!-- Mobile Header -->
			<header
				class="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-gray-200 bg-white/90 px-4 backdrop-blur-sm shadow-sm lg:hidden"
			>
				<button
					onclick={() => (isSidebarOpen = true)}
					class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
				>
					<span class="sr-only">Open sidebar</span>
                    <span class="material-symbols-outlined h-6 w-6">menu</span>
				</button>
				<div class="flex items-center gap-2">
                     <!-- *** UPDATED IMG SRC *** -->
                    {#if data.companyLogoPath}
                        <img src={data.companyLogoPath} alt="Company Logo" class="h-6 w-6 object-contain" />
                    {:else}
                        <img src="/logo.png" alt="Default Logo" class="h-6 w-6 object-contain" /> <!-- Fallback logo -->
                    {/if}
					<span class="text-lg font-bold text-gray-800">Core Business</span>
				</div>
				<div class="w-10"></div> <!-- Spacer -->
			</header>

			<!-- Page Content -->
			<main class="flex-1 p-4 sm:p-6 lg:p-8">
                <!-- Use max-w-7xl and mx-auto for better centering and max width -->
				<div class="h-full w-full max-w-7xl mx-auto rounded-xl bg-white p-4 shadow-xl sm:p-6 lg:p-8">
					{@render children?.()}
				</div>
			</main>
		</div>
	</div>
{:else}
	<!-- Layout for non-logged-in users -->
	<main class="h-full">
		{@render children?.()}
	</main>
{/if}

<!-- Toaster for Notifications -->
<Toaster richColors position="top-right" />