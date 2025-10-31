<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutServerData } from './$types';
	import { page, navigating } from '$app/stores';
	import { slide, fade, fly } from 'svelte/transition';
	import { Toaster } from 'svelte-sonner';

	// Svelte 5 runes: Define props and reactive state
	const { data, children } = $props<{ data: LayoutServerData; children: unknown }>();
	type Menu = LayoutServerData['menus'][0]; // Get the menu type

	// สถานะสำหรับเมนูมือถือ (ซ้าย/ขวา)
	let isSidebarOpen = $state(false);
	// สถานะสำหรับยุบเมนูบน Desktop (เปิด/ปิด)
	let isSidebarCollapsed = $state(false);

	// State for collapsible sub-menus (when not collapsed)
	let openMenuIds = $state(new Set<number>());
	let isAdminMenuOpen = $state(false);

	// State for flyout menu when collapsed
	let flyoutMenuId = $state<number | null>(null);
	let flyoutTimeout: NodeJS.Timeout | null = null; // Timeout for closing flyout

	// ฟังก์ชันสร้างตัวย่อ (Initials)
	function getInitials(nameOrEmail: string | null | undefined): string {
		if (!nameOrEmail) return '??';
		const nameParts = nameOrEmail.includes(' ') ? nameOrEmail.split(' ') : null;
		if (nameParts && nameParts.length > 1 && nameParts[0] && nameParts[1]) {
			return (nameParts[0][0] || '').toUpperCase() + (nameParts[1][0] || '').toUpperCase();
		}
		const email = nameOrEmail.includes('@') ? nameOrEmail : '';
		const emailParts = email.split('@');
		if (emailParts[0] && emailParts[0].length >= 2) {
			return (emailParts[0][0] + emailParts[0][1]).toUpperCase();
		} else if (emailParts[0] && emailParts[0].length === 1) {
			return emailParts[0][0].toUpperCase() + emailParts[0][0].toUpperCase();
		}
		return (nameOrEmail[0] || '').toUpperCase() + (nameOrEmail[1] || '').toUpperCase();
	}

	// Function to toggle *any* menu ID (only used when not collapsed)
	function toggleMenu(id: number) {
		if (isSidebarCollapsed) return;
		const newSet = new Set(openMenuIds);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			const currentMenu = findMenuById(data.menus, id);
			const parentId = currentMenu?.parent_id;
			const siblings = parentId ? findMenuById(data.menus, parentId)?.children : data.menus;
			if (siblings) {
				siblings.forEach((sibling: Menu) => {
					if (sibling.id !== id && sibling.children && sibling.children.length > 0) {
						newSet.delete(sibling.id);
					}
				});
			}
			newSet.add(id);
		}
		openMenuIds = newSet;
	}

	// Helper function to find a menu item by ID recursively
	function findMenuById(menus: Menu[] | undefined, id: number): Menu | null {
		if (!menus) return null;
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
			flyoutMenuId = null;
			if (flyoutTimeout) clearTimeout(flyoutTimeout);
		}
		if (isSidebarCollapsed) {
			openMenuIds = new Set<number>();
			isAdminMenuOpen = false;
			flyoutMenuId = null;
			if (flyoutTimeout) clearTimeout(flyoutTimeout);
		}
	});

	function isLinkActive(href: string | null) {
		if (!href) return false;
		if (href === '/') {
			return $page.url.pathname === '/';
		}
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}

	// Functions to handle flyout menu visibility with delay
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
		}, 200);
	}
</script>

{#snippet menuList(menus: Menu[] | undefined, level: number, isFlyout: boolean = false)}
	{#if menus}
		<ul
			class="space-y-1 {level > 0 && !isFlyout
				? isSidebarCollapsed
					? 'hidden pl-0'
					: 'pt-1 pl-5'
				: ''} {isFlyout ? 'min-w-[200px]' : ''}"
		>
			{#each menus as menu}
				<li
					class={isSidebarCollapsed && level === 0 ? 'relative' : ''}
					onmouseenter={isSidebarCollapsed &&
					level === 0 &&
					menu.children &&
					menu.children.length > 0
						? () => handleMouseEnter(menu.id)
						: null}
					onmouseleave={isSidebarCollapsed &&
					level === 0 &&
					menu.children &&
					menu.children.length > 0
						? handleMouseLeave
						: null}
				>
					{#if menu.route}
						{#if menu.children && menu.children.length > 0 && !isSidebarCollapsed}
							<div class="group relative">
								<a
									href={menu.route}
									class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-150 {isLinkActive(
										menu.route
									)
										? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
										: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} pr-8 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
									title={menu.title}
								>
									<span
										class="material-symbols-outlined h-5 w-5 flex-shrink-0 transition-transform group-hover:scale-110"
										>{menu.icon || 'folder'}</span
									>
									<span
										class="overflow-hidden font-medium whitespace-nowrap transition-all duration-100"
										>{menu.title}</span
									>
								</a>
								<button
									type="button"
									onclick={(event) => {
										event.stopPropagation();
										toggleMenu(menu.id);
									}}
									class="absolute top-1/2 right-1 z-10 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-200 focus:ring-1 focus:ring-blue-500 focus:outline-none"
									aria-label="Toggle submenu"
								>
									<span class="sr-only">Toggle submenu</span>
									<svg
										class={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${openMenuIds.has(menu.id) ? 'rotate-90' : 'rotate-0'}`}
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
							</div>
						{:else}
							<a
								href={menu.route}
								class="group flex items-center gap-3 rounded-lg px-3 py-3 transition-colors duration-150
                                {isLinkActive(menu.route)
									? isSidebarCollapsed || isFlyout
										? 'bg-blue-100 text-blue-700'
										: 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
									: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
                                focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none
                                {isSidebarCollapsed && !isFlyout ? 'justify-center' : ''}"
								title={isSidebarCollapsed && !isFlyout ? menu.title : ''}
							>
								<span
									class="material-symbols-outlined h-6 w-6 flex-shrink-0 transition-transform group-hover:scale-110"
								>
									{menu.icon || (menu.children && menu.children.length > 0 ? 'folder' : 'circle')}
								</span>
								<span
									class={`overflow-hidden font-medium whitespace-nowrap transition-all duration-100 ${isSidebarCollapsed && !isFlyout ? 'lg:hidden' : ''}`}
								>
									{menu.title}
								</span>
							</a>
						{/if}
					{:else if menu.children && menu.children.length > 0}
						{#if isSidebarCollapsed && !isFlyout}
							<div
								class="group flex cursor-pointer items-center justify-center gap-3 rounded-lg px-3 py-3 text-gray-600 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900"
								title={menu.title}
							>
								<span
									class="material-symbols-outlined h-6 w-6 flex-shrink-0 transition-transform group-hover:scale-110"
									>{menu.icon || 'folder'}</span
								>
							</div>
						{:else}
							<button
								type="button"
								onclick={() => toggleMenu(menu.id)}
								class="group flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-gray-600 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
							>
								<div class="flex items-center gap-3">
									<span
										class="material-symbols-outlined h-6 w-6 flex-shrink-0 transition-transform group-hover:scale-110"
										>{menu.icon || 'folder'}</span
									>
									<span
										class="overflow-hidden font-medium whitespace-nowrap transition-all duration-100"
										>{menu.title}</span
									>
								</div>
								<svg
									class={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${openMenuIds.has(menu.id) ? 'rotate-90' : 'rotate-0'}`}
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
						{/if}
					{:else}
						<div
							class="flex items-center gap-3 rounded-lg px-3 py-3 text-gray-400 {isSidebarCollapsed &&
							!isFlyout
								? 'justify-center'
								: ''}"
							title={isSidebarCollapsed && !isFlyout ? menu.title : ''}
						>
							<span class="material-symbols-outlined h-6 w-6 flex-shrink-0"
								>{menu.icon || 'circle'}</span
							>
							<span
								class={`overflow-hidden font-medium whitespace-nowrap transition-all duration-100 ${isSidebarCollapsed && !isFlyout ? 'lg:hidden' : ''}`}
								>{menu.title}</span
							>
						</div>
					{/if}

					{#if menu.children && menu.children.length > 0 && !isSidebarCollapsed && !isFlyout && openMenuIds.has(menu.id)}
						<div transition:fly={{ y: -10, duration: 300 }}>
							{@render menuList(menu.children, level + 1)}
						</div>
					{/if}

					{#if isSidebarCollapsed && level === 0 && menu.children && menu.children.length > 0 && flyoutMenuId === menu.id}
						<div
							role="group"
							class="absolute top-0 left-full z-40 ml-1 rounded-md border border-gray-200 bg-white p-2 shadow-xl"
							onmouseenter={() => handleMouseEnter(menu.id)}
							onmouseleave={handleMouseLeave}
							transition:fade={{ duration: 100 }}
						>
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
	<style>
		.material-symbols-outlined {
			font-variation-settings:
				'FILL' 0,
				'wght' 400,
				'GRAD' 0,
				'opsz' 24;
		}
	</style>
</svelte:head>

{#if data.user}
	<div class="min-h-screen bg-gray-50 text-gray-800">
		{#if isSidebarOpen}
			<div
				class="fixed inset-0 z-20 bg-black/50 lg:hidden"
				onclick={() => (isSidebarOpen = false)}
				role="presentation"
			></div>
		{/if}

		<aside
			class="fixed inset-y-0 left-0 z-30 flex transform flex-col border-r border-gray-200 bg-white transition-all duration-300 ease-in-out
			{isSidebarOpen ? 'w-64 translate-x-0 p-4' : 'w-64 -translate-x-full p-4'}
			lg:translate-x-0
			{isSidebarCollapsed ? 'lg:w-20 lg:px-2 lg:py-4' : 'lg:w-64 lg:p-4'}"
		>
			<div class="flex h-full flex-col overflow-x-hidden overflow-y-auto">
				<div
					class="mb-6 flex h-16 flex-shrink-0 items-center gap-3 px-2 {isSidebarCollapsed
						? 'justify-center'
						: ''}"
				>
					<div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg">
						{#if data.companyLogoPath}
							<img src={data.companyLogoPath} alt="Company Logo" class="h-8 w-8 object-contain" />
						{:else}
							<img src="/logo.png" alt="Default Logo" class="h-8 w-8 object-contain" />
						{/if}
					</div>
					<span
						class={`overflow-hidden text-xl font-bold whitespace-nowrap text-gray-900 transition-all duration-100 ${isSidebarCollapsed ? 'lg:hidden' : ''}`}
					>
						Core Business
					</span>
				</div>
				<div class="flex-grow">
					<nav>
						{@render menuList(data.menus, 0)}

						{#if data.user.role === 'admin'}
							<li
								class="relative mt-4 list-none space-y-1 border-t border-gray-200 pt-4"
								onmouseenter={isSidebarCollapsed ? () => handleMouseEnter(-1) : null}
								onmouseleave={isSidebarCollapsed ? handleMouseLeave : null}
							>
								<button
									type="button"
									onclick={() => {
										if (!isSidebarCollapsed) isAdminMenuOpen = !isAdminMenuOpen;
									}}
									class="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-gray-600 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none {isSidebarCollapsed
										? 'justify-center'
										: ''}"
									title={isSidebarCollapsed ? 'System Management' : ''}
								>
									<div class="flex items-center gap-3">
										<span class="material-symbols-outlined h-6 w-6 flex-shrink-0 text-gray-400"
											>admin_panel_settings</span
										>
										<span
											class={`overflow-hidden px-0 text-xs font-semibold whitespace-nowrap text-gray-400 uppercase transition-all duration-100 ${isSidebarCollapsed ? 'lg:hidden' : ''}`}
										>
											System Management
										</span>
									</div>
									<svg
										class={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200 ${isAdminMenuOpen ? 'rotate-90' : 'rotate-0'} ${isSidebarCollapsed ? 'lg:hidden' : ''}`}
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

								{#if !isSidebarCollapsed && isAdminMenuOpen}
									<ul class="space-y-1 pt-1 pl-5" transition:slide>
										<li>
											<a
												href="/roles"
												class="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors {isLinkActive(
													'/roles'
												)
													? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
													: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
												title="Roles & Permissions"
												><span class="material-symbols-outlined h-6 w-6 flex-shrink-0"
													>shield_person</span
												><span class="font-medium">Roles & Permissions</span></a
											>
										</li>
										<li>
											<a
												href="/permissions"
												class="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors {isLinkActive(
													'/permissions'
												)
													? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
													: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
												title="Permissions"
												><span class="material-symbols-outlined h-6 w-6 flex-shrink-0"
													>verified_user</span
												><span class="font-medium">Permissions</span></a
											>
										</li>
										<li>
											<a
												href="/menus"
												class="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors {isLinkActive(
													'/menus'
												)
													? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
													: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
												title="Menu Management"
												><span class="material-symbols-outlined h-6 w-6 flex-shrink-0">menu</span
												><span class="font-medium">Menu Management</span></a
											>
										</li>
									</ul>
								{/if}

								{#if isSidebarCollapsed && flyoutMenuId === -1}
									<div
										role="group"
										class="absolute top-0 left-full z-40 ml-1 min-w-[200px] rounded-md border border-gray-200 bg-white p-2 shadow-xl"
										onmouseenter={() => handleMouseEnter(-1)}
										onmouseleave={handleMouseLeave}
										transition:fade={{ duration: 100 }}
									>
										<ul class="space-y-1">
											<li>
												<a
													href="/roles"
													class="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors {isLinkActive(
														'/roles'
													)
														? 'bg-blue-100 text-blue-700'
														: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
													title="Roles & Permissions"
													><span class="material-symbols-outlined h-6 w-6 flex-shrink-0"
														>shield_person</span
													><span class="font-medium">Roles & Permissions</span></a
												>
											</li>
											<li>
												<a
													href="/permissions"
													class="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors {isLinkActive(
														'/permissions'
													)
														? 'bg-blue-100 text-blue-700'
														: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
													title="Permissions"
													><span class="material-symbols-outlined h-6 w-6 flex-shrink-0"
														>verified_user</span
													><span class="font-medium">Permissions</span></a
												>
											</li>
											<li>
												<a
													href="/menus"
													class="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors {isLinkActive(
														'/menus'
													)
														? 'bg-blue-100 text-blue-700'
														: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
													title="Menu Management"
													><span class="material-symbols-outlined h-6 w-6 flex-shrink-0">menu</span
													><span class="font-medium">Menu Management</span></a
												>
											</li>
										</ul>
									</div>
								{/if}
							</li>
						{/if}
					</nav>
				</div>
			</div>
		</aside>

		<div
			class="flex flex-1 flex-col transition-all duration-300 ease-in-out
			{isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}"
		>
			<header
				class="sticky top-0 z-10 hidden h-16 items-center border-b border-gray-200 bg-white/90 px-4 shadow-sm backdrop-blur-sm lg:flex"
			>
				<button
					onclick={() => (isSidebarCollapsed = !isSidebarCollapsed)}
					class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					title={isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
				>
					<span class="sr-only">{isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}</span>
					{#if isSidebarCollapsed}
						<span class="material-symbols-outlined h-6 w-6">menu</span>
					{:else}
						<span class="material-symbols-outlined h-6 w-6">menu_open</span>
					{/if}
				</button>
				<div class="flex-grow"></div>

				{#if $page.data.user}
					<div class="ml-auto flex items-center gap-4">
						<div class="text-right">
							<a
								href="/profile"
								class="block truncate text-sm font-semibold text-gray-800 hover:text-blue-600 hover:underline"
							>
								{$page.data.user.full_name || $page.data.user.email}
							</a>
						</div>
						<a href="/profile" class="flex-shrink-0">
							{#if $page.data.user.profile_image_url}
								<img
									src={$page.data.user.profile_image_url}
									alt="Profile"
									class="h-10 w-10 rounded-full border border-gray-200 object-cover shadow-sm transition-transform hover:scale-105"
								/>
							{:else}
								<img
									src="/default-avatar.jpg"
									alt="Default Profile"
									class="h-10 w-10 rounded-full border border-gray-200 object-cover shadow-sm transition-transform hover:scale-105"
								/>
							{/if}
						</a>
					</div>
				{/if}
			</header>

			<header
				class="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-gray-200 bg-white/90 px-4 shadow-sm backdrop-blur-sm lg:hidden"
			>
				<button
					onclick={() => (isSidebarOpen = true)}
					class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				>
					<span class="sr-only">Open sidebar</span>
					<span class="material-symbols-outlined h-6 w-6">menu</span>
				</button>
				<div class="flex items-center gap-2">
					{#if data.companyLogoPath}
						<img src={data.companyLogoPath} alt="Company Logo" class="h-6 w-6 object-contain" />
					{:else}
						<img src="/logo.png" alt="Default Logo" class="h-6 w-6 object-contain" />
					{/if}
					<span class="text-lg font-bold text-gray-800">Core Business</span>
				</div>
				<div class="w-10"></div>
			</header>

			<main class="flex-1 p-4 sm:p-6 lg:p-8">
				<div
					class="mx-auto h-full w-full max-w-7xl rounded-xl bg-white p-4 shadow-xl sm:p-6 lg:p-8"
				>
					{@render children?.()}
				</div>
			</main>
		</div>
	</div>
{:else}
	<main class="h-full">
		{@render children?.()}
	</main>
{/if}

<Toaster richColors position="top-right" />
