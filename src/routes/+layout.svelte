<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutData } from './$types';
	import { page, navigating } from '$app/stores';

	// Svelte 5 runes: Define props and reactive state
	const { data, children } = $props<{ data: LayoutData; children: unknown }>();
	
	// สถานะสำหรับเมนูมือถือ (ซ้าย/ขวา)
	let isSidebarOpen = $state(false);
	
	// สถานะใหม่สำหรับยุบเมนูบน Desktop (เปิด/ปิด)
	let isSidebarCollapsed = $state(false); 

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
			settings: `<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>`
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
			class="fixed inset-y-0 left-0 z-30 flex transform flex-col border-r border-gray-200 bg-white p-4 transition-all duration-300 ease-in-out 
			{isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
			lg:translate-x-0 
			{isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}" 
			aria-expanded={!isSidebarCollapsed}
		>
			<!-- Logo/Brand (Hidden on Collapse) -->
			<div class="mb-8 flex items-center gap-3 px-2">
				<div class="flex h-10 w-10 items-center justify-center rounded-lg">
					<!-- Assume logo.png is served from static/ -->
					<img src="/logo.png" alt="Asset Control Logo" class="h-8 w-8 object-contain" />
				</div>
				<span class:hidden={isSidebarCollapsed} class="text-xl font-bold text-gray-900 whitespace-nowrap overflow-hidden transition-all duration-100">Asset Control</span>
			</div>

			<!-- DYNAMIC Navigation Menu -->
			<nav class="flex-grow">
				<ul class="space-y-2">
					{#each data.menus as menu}
						{#if !menu.children || menu.children.length === 0}
							<!-- Regular Menu Item -->
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
									<span class:hidden={isSidebarCollapsed} class="font-medium whitespace-nowrap overflow-hidden transition-all duration-100">{menu.title}</span>
								</a>
							</li>
						{:else}
							<!-- Menu with Sub-items -->
							<li class="space-y-2">
								<span class:hidden={isSidebarCollapsed} class="px-3 text-xs font-semibold uppercase text-gray-400 whitespace-nowrap overflow-hidden transition-all duration-100">{menu.title}</span>
								<!-- หากยุบเมนูหลักจะไม่แสดง Sub-menu เพื่อลดความซับซ้อน -->
								{#if !isSidebarCollapsed}
									<ul class="space-y-1 pl-2">
										{#each menu.children as subMenu}
											<li>
												<a
													href={subMenu.route || '#'}
													class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-150
													{isLinkActive(subMenu.route)
														? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
														: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
													focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
													title={subMenu.title}
												>
													<!-- ใช้ไอคอนเดิมหรือใช้จุดแทนหากไม่มีไอคอนเฉพาะ -->
													{@html getIcon(subMenu.icon)} 
													<span class="font-medium whitespace-nowrap overflow-hidden transition-all duration-100">{subMenu.title}</span>
												</a>
											</li>
										{/each}
									</ul>
								{/if}
							</li>
						{/if}
					{/each}

					<!-- Manually add System Management for admin -->
					{#if data.user.role === 'admin'}
						<li class="space-y-2 pt-4 border-t mt-4 border-gray-200">
							<span class:hidden={isSidebarCollapsed} class="px-3 text-xs font-semibold uppercase text-gray-400 whitespace-nowrap overflow-hidden transition-all duration-100">System Management</span>
							{#if !isSidebarCollapsed}
							<ul class="space-y-1 pl-2">
								<li>
									<a href="/roles" class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors {isLinkActive('/roles') ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" title="Roles & Permissions">
										{@html getIcon('roles')}
										<span class="font-medium">Roles & Permissions</span>
									</a>
								</li>
								<li>
									<a href="/permissions" class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors {isLinkActive('/permissions') ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" title="Permissions">
										{@html getIcon('settings')}
										<span class="font-medium">Permissions</span>
									</a>
								</li>
								<li>
									<a href="/menus" class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors {isLinkActive('/menus') ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" title="Menu Management">
										{@html getIcon('menus')}
										<span class="font-medium">Menu Management</span>
									</a>
								</li>
							</ul>
							{/if}
						</li>
					{/if}
				</ul>
			</nav>

			<!-- User Info Footer (Hidden on Collapse, except for the Avatar) -->
			<div class="mt-auto border-t border-gray-200 pt-4">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white shadow-md flex-shrink-0">
						{data.user.email.substring(0, 2).toUpperCase()}
					</div>
					<div class:hidden={isSidebarCollapsed} class="overflow-hidden transition-all duration-100">
						<p class="truncate text-sm font-semibold text-gray-800">{data.user.email}</p>
						<form method="POST" action="/login?/logout" class="block">
							<button type="submit" class="text-xs text-red-500 hover:underline focus:outline-none focus:ring-1 focus:ring-red-500 rounded-sm">Logout</button>
						</form>
					</div>
				</div>
			</div>
		</aside>

		<!-- Main Content Area -->
		<div class="flex flex-1 flex-col transition-all duration-300 ease-in-out 
			{isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}">
			
			<!-- Desktop Header/Toggle Button -->
			<header class="hidden sticky top-0 z-10 h-16 items-center border-b border-gray-200 bg-white/90 px-4 backdrop-blur-sm lg:flex shadow-sm">
				<!-- Toggle Sidebar Button -->
				<button 
					onclick={() => (isSidebarCollapsed = !isSidebarCollapsed)} 
					class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
					title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
				>
					<span class="sr-only">{isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}</span>
					{#if isSidebarCollapsed}
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6"><path d="M15 17h5"/><path d="M17 21v-4"/><path d="M5 17h5"/><path d="M7 21v-4"/><path d="M9 17v-4"/><path d="M4 4h16v13H4z"/></svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6"><path d="M20 17H4"/><path d="M4 21v-4"/><path d="M20 21v-4"/><path d="M4 7h16"/><path d="M4 3v4"/><path d="M20 3v4"/><path d="M12 7v10"/></svg>
					{/if}
				</button>
				<!-- Spacer/Additional Header Content -->
				<div class="flex-grow"></div> 
			</header>


			<!-- Mobile Header (Always visible on mobile, sticky) -->
			<header class="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-gray-200 bg-white/90 px-4 backdrop-blur-sm lg:hidden shadow-sm">
				<button 
					onclick={() => (isSidebarOpen = true)} 
					class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
				>
					<span class="sr-only">Open sidebar</span>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6">
						<line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
					</svg>
				</button>
				
				<!-- Logo in the middle -->
				<div class="flex items-center gap-2">
					<img src="/logo.png" alt="Asset Control Logo" class="h-6 w-6 object-contain" />
					<span class="text-lg font-bold text-gray-800">Asset Control</span>
				</div>
				
				<div class="w-10"></div> <!-- Spacer to balance the hamburger button -->
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