<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutData } from './$types';
	import { page, navigating } from '$app/stores';
	import { slide } from 'svelte/transition';

	// Svelte 5 runes: Define props and reactive state
	const { data, children } = $props<{ data: LayoutData; children: unknown }>();
	type Menu = LayoutData['menus'][0]; // Get the menu type from LayoutData

	// สถานะสำหรับเมนูมือถือ (ซ้าย/ขวา)
	let isSidebarOpen = $state(false);

	// สถานะสำหรับยุบเมนูบน Desktop (เปิด/ปิด)
	let isSidebarCollapsed = $state(false);

	// --- 1. REPLACED State for collapsible sub-menus ---
	// Remove old state:
	// let openMenuId = $state<number | null>(null);
	// let openSubMenuId = $state<number | null>(null);

	// Add new state to handle infinite levels
	let openMenuIds = $state(new Set<number>());
	let isAdminMenuOpen = $state(false);

	// Function to toggle *any* menu ID
	function toggleMenu(id: number) {
		const newSet = new Set(openMenuIds); // Create a new set for reactivity
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		openMenuIds = newSet; // Re-assign the state
	}

	// Close sidebar on navigation change using $effect rune
	$effect(() => {
		if ($navigating) {
			isSidebarOpen = false;
		}
	});

	// Function to create an SVG icon from a simple name (Lucide icons)
	function getIcon(iconName: string | null): string {
		const icons: { [key: string]: string } = {
			dashboard: `<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />`,
			assets: `<rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />`,
			counting: `<path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7" /><path d="M18 18h.01" /><path d="M7 7h4" /><path d="M7 11h4" /><path d="M18 22v-4h4" /><path d="m18 18 4 4" />`,
			users: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />`,
			roles: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path>`,
			menus: `<path d="M4 6h16M4 12h16M4 18h16"></path>`,
			settings: `<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82-.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>`
		};
		const path = iconName ? icons[iconName] : '<circle cx="12" cy="12" r="10"></circle>'; // Default circle icon
		return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">${path}</svg>`;
	}

	function isLinkActive(href: string | null) {
		if (!href) return false;
		if (href === '/') {
			return $page.url.pathname === '/';
		}
		return $page.url.pathname.startsWith(href);
	}
</script>

<!-- --- 2. MOVED SNIPPET TO HERE (Outside <script>) --- -->
{#snippet menuList(menus: Menu[], level: number)}
	<ul class="space-y-1 {level > 0 ? 'pl-5 pt-1' : ''}">
		{#each menus as menu}
			{#if !menu.children || menu.children.length === 0}
				<!-- Leaf Item (No children) -->
				<li>
					<a
						href={menu.route || '#'}
						class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-150
						{isLinkActive(menu.route)
							? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
							: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
						focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
						title={menu.title}
					>
						{@html getIcon(menu.icon)}
						<span class="whitespace-nowrap overflow-hidden font-medium transition-all duration-100"
							>{menu.title}</span
						>
					</a>
				</li>
			{:else}
				<!-- Parent Item (Has children) -->
				<li class="space-y-1">
					<button
						type="button"
						onclick={() => toggleMenu(menu.id)}
						class="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors duration-150
						text-gray-600 hover:bg-gray-100 hover:text-gray-900
						focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
						title={menu.title}
					>
						<div class="flex items-center gap-3">
							{@html getIcon(menu.icon)}
							<span
								class="whitespace-nowrap overflow-hidden font-medium transition-all duration-100"
								>{menu.title}</span
							>
						</div>
						<!-- Chevron Icon -->
						<svg
							class="h-4 w-4 flex-shrink-0 transition-transform duration-200 {openMenuIds.has(
								menu.id
							)
								? 'rotate-90'
								: 'rotate-0'}"
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="m9 18 6-6-6-6" />
						</svg>
					</button>

					<!-- Recursive Call -->
					{#if openMenuIds.has(menu.id)}
						<div transition:slide={{ duration: 200 }}>
							{@render menuList(menu.children, level + 1)}
						</div>
					{/if}
				</li>
			{/if}
		{/each}
	</ul>
{/snippet}

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Asset Control</title>
</svelte:head>

{#if data.user}
	<!-- Main application layout with a light theme -->
	<div class="min-h-screen bg-gray-50 text-gray-800">
		<!-- Mobile Overlay for Sidebar (Darkens the background when menu is open) -->
		{#if isSidebarOpen}
			<div
				class="fixed inset-0 z-20 bg-black/50 lg:hidden"
				onclick={() => (isSidebarOpen = false)}
				role="presentation"
			></div>
		{/if}

		<!-- Sidebar (Fixed on Desktop, Sliding on Mobile, Collapsible on Desktop) -->
		<aside
			class="fixed inset-y-0 left-0 z-30 flex transform flex-col border-r border-gray-200 bg-white transition-all duration-300 ease-in-out
			{isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
			lg:translate-x-0
			{isSidebarCollapsed ? 'lg:w-0 lg:p-0' : 'lg:w-64 lg:p-4'} overflow-hidden"
			aria-expanded={!isSidebarCollapsed}
		>
			<!-- INNER SIDEBAR CONTENT: ซ่อนเนื้อหาทั้งหมดเมื่อเมนูถูกซ่อนบน Desktop (isSidebarCollapsed=true) -->
			<div class:hidden={isSidebarCollapsed && !isSidebarOpen} class="flex h-full flex-col">
				<!-- Logo/Brand -->
				<div class="mb-8 flex items-center gap-3 px-2">
					<div class="flex h-10 w-10 items-center justify-center rounded-lg">
						<!-- Assume logo.png is served from static/ -->
						<img src="/logo.png" alt="Asset Control Logo" class="h-8 w-8 object-contain" />
					</div>
					<span
						class="whitespace-nowrap overflow-hidden text-xl font-bold text-gray-900 transition-all duration-100"
						>Asset Control</span
					>
				</div>

				<!-- DYNAMIC Navigation Menu -->
				<nav class="flex-grow">
					<!-- --- 3. REPLACE OLD LOOP WITH NEW RECURSIVE SNIPPET --- -->
					{@render menuList(data.menus, 0)}

					<!-- Manually add System Management for admin (BONUS: Make collapsible) -->
					{#if data.user.role === 'admin'}
						<li class="mt-4 border-t border-gray-200 pt-4 space-y-1 list-none">
							<button
								type="button"
								onclick={() => (isAdminMenuOpen = !isAdminMenuOpen)}
								class="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors duration-150 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
							>
								<span
									class="whitespace-nowrap overflow-hidden px-0 text-xs font-semibold uppercase text-gray-400 transition-all duration-100"
									>System Management</span
								>
								<svg
									class="h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200 {isAdminMenuOpen
										? 'rotate-90'
										: 'rotate-0'}"
									xmlns="http://www.w3.org/2000/svg"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="m9 18 6-6-6-6" />
								</svg>
							</button>

							{#if isAdminMenuOpen}
								<ul class="space-y-1 pl-5 pt-1" transition:slide>
									<li>
										<a
											href="/roles"
											class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors {isLinkActive(
												'/roles'
											)
												? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
												: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
											title="Roles & Permissions"
										>
											{@html getIcon('roles')}
											<span class="font-medium">Roles & Permissions</span>
										</a>
									</li>
									<li>
										<a
											href="/permissions"
											class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors {isLinkActive(
												'/permissions'
											)
												? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
												: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
											title="Permissions"
										>
											{@html getIcon('settings')}
											<span class="font-medium">Permissions</span>
										</a>
									</li>
									<li>
										<a
											href="/menus"
											class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors {isLinkActive(
												'/menus'
											)
												? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
												: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
											title="Menu Management"
										>
											{@html getIcon('menus')}
											<span class="font-medium">Menu Management</span>
										</a>
									</li>
								</ul>
							{/if}
						</li>
					{/if}
				</nav>

				<!-- User Info Footer (Hidden on Collapse, except for the Avatar) -->
				<div class="mt-auto border-t border-gray-200 pt-4">
					<div class="flex items-center gap-3">
						<div
							class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white shadow-md"
						>
							{data.user.email.substring(0, 2).toUpperCase()}
						</div>
						<div class="overflow-hidden transition-all duration-100">
							<p class="truncate text-sm font-semibold text-gray-800">{data.user.email}</p>
							<form method="POST" action="/login?/logout" class="block">
								<button
									type="submit"
									class="rounded-sm text-xs text-red-500 hover:underline focus:outline-none focus:ring-1 focus:ring-red-500"
									>Logout</button
								>
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
			{isSidebarCollapsed ? 'lg:pl-0' : 'lg:pl-64'}"
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
					<!-- UPDATED: ใช้ไอคอน Menu/Arrow เพื่อบ่งบอกการซ่อน/แสดง -->
					{#if isSidebarCollapsed}
						<!-- Menu Icon (Show) -->
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-6 w-6"
						>
							<line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line
								x1="3"
								y1="18"
								x2="21"
								y2="18"
							/>
						</svg>
					{:else}
						<!-- Arrow Left Icon (Hide) -->
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-6 w-6"
						>
							<path d="M15 18l-6-6 6-6" />
						</svg>
					{/if}
				</button>
				<!-- Spacer/Additional Header Content -->
				<div class="flex-grow"></div>
			</header>

			<!-- Mobile Header (Always visible on mobile, sticky) -->
			<header
				class="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-gray-200 bg-white/90 px-4 backdrop-blur-sm shadow-sm lg:hidden"
			>
				<button
					onclick={() => (isSidebarOpen = true)}
					class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
				>
					<span class="sr-only">Open sidebar</span>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-6 w-6"
					>
						<line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line
							x1="3"
							y1="18"
							x2="21"
							y2="18"
						/>
					</svg>
				</button>

				<!-- Logo in the middle -->
				<div class="flex items-center gap-2">
					<img src="/logo.png" alt="Asset Control Logo" class="h-6 w-6 object-contain" />
					<span class="text-lg font-bold text-gray-800">Asset Control</span>
				</div>

				<div class="w-10"></div>
				<!-- Spacer to balance the hamburger button -->
			</header>

			<!-- Page Content with Card-like wrapper -->
			<main class="flex-1 p-4 sm:p-6 lg:p-8">
				<div class="h-full w-full rounded-xl bg-white p-4 shadow-xl sm:p-6 lg:p-8">
					<!-- Main content is rendered here -->
					{@render children?.()}
				</div>
			</main>
		</div>
	</div>
{:else}
	<!-- Layout for non-logged-in users (e.g., login page) -->
	<main class="h-full">
		{@render children?.()}
	</main>
{/if}