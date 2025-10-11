<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutData } from './$types';
	import { page, navigating } from '$app/stores';

	const { data, children } = $props<{ data: LayoutData; children: unknown }>();

	let isSidebarOpen = $state(false);

	// Close sidebar on navigation change using $effect rune
	$effect(() => {
		if ($navigating) {
			isSidebarOpen = false;
		}
	});

	// Function to create an SVG icon
	const createIcon = (path: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">${path}</svg>`;

	const menuItems = [
		{
			href: '/',
			label: 'Dashboard',
			icon: createIcon(`<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />`)
		},
		{
			href: '/assets',
			label: 'Assets Management',
			icon: createIcon(`<rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />`)
		},
		// --- NEW: Asset Counting Menu ---
		{
			href: '/counting',
			label: 'Asset Counting',
			icon: createIcon(`<path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7" /><path d="M18 18h.01" /><path d="M7 7h4" /><path d="M7 11h4" /><path d="M18 22v-4h4" /><path d="m18 18 4 4" />`)
		}
		// --- END NEW ---
	];
	
	const adminMenuItems = [
		{
			href: '/users',
			label: 'Users Management',
			icon: createIcon(`<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />`)
		}
	]
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Asset Control</title>
</svelte:head>

{#if data.user}
	<!-- Main application layout with a light theme -->
	<div class="min-h-screen bg-gray-50 text-gray-800">
		<!-- Mobile Overlay for Sidebar -->
		{#if isSidebarOpen}
			<div
				class="fixed inset-0 z-20 bg-black/30 lg:hidden"
				onclick={() => (isSidebarOpen = false)}
				role="presentation"
			></div>
		{/if}

		<!-- Sidebar -->
		<aside
			class="fixed inset-y-0 left-0 z-30 flex w-64 transform flex-col border-r border-gray-200 bg-white p-4 transition-transform duration-300 ease-in-out {isSidebarOpen
				? 'translate-x-0'
				: '-translate-x-full'} lg:translate-x-0"
		>
			<!-- Logo/Brand -->
			<div class="mb-8 flex items-center gap-3 px-2">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg"
				>
					<!-- This is the new logo image tag -->
					<img src="/logo.png" alt="Asset Control Logo" class="h-80 w-80 object-contain" />
				</div>
				<span class="text-xl font-bold text-gray-900">Asset Control</span>
			</div>

			<!-- Navigation Menu -->
			<nav class="flex-grow">
				<ul class="space-y-2">
					{#each menuItems as item}
						{@const isActive = $page.url.pathname.startsWith(item.href) && (item.href !== '/' || $page.url.pathname === '/')}
						<li>
							<a
								href={item.href}
								class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors
                {isActive
									? 'bg-blue-600 text-white shadow-md'
									: 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}"
							>
								{@html item.icon}
								<span class="font-medium">{item.label}</span>
							</a>
						</li>
					{/each}
				</ul>

				<!-- Admin Section -->
				{#if data.user?.role === 'admin'}
					<div class="mt-4 border-t border-gray-200 pt-4">
						<span class="px-3 text-xs font-semibold uppercase text-gray-400">Admin</span>
						<ul class="mt-2 space-y-2">
							{#each adminMenuItems as item}
								{@const isActive = $page.url.pathname.startsWith(item.href)}
								<li>
									<a
										href={item.href}
										class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors
										{isActive
											? 'bg-blue-600 text-white shadow-md'
											: 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}"
									>
										{@html item.icon}
										<span class="font-medium">{item.label}</span>
									</a>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</nav>

			<!-- User Info Footer -->
			<div class="mt-auto border-t border-gray-200 pt-4">
				<div class="flex items-center gap-3">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-600"
					>
						{data.user.email.substring(0, 2).toUpperCase()}
						
					</div>
					<div>
						<p class="truncate text-sm font-semibold text-gray-800">{data.user.email}</p>
						<form method="POST" action="/login?/logout" class="block">
							<button type="submit" class="text-xs text-red-500 hover:underline">Logout</button>
						</form>
					</div>
				</div>
			</div>
		</aside>

		<!-- Main Content Area -->
		<div class="flex flex-1 flex-col lg:pl-64">
			<!-- Mobile Header -->
			<header
				class="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 px-4 backdrop-blur-sm lg:hidden"
			>
				<button onclick={() => (isSidebarOpen = true)} class="text-gray-600 hover:text-gray-900">
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
						><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line
							x1="3"
							y1="18"
							x2="21"
							y2="18"
						/></svg
					>
				</button>
				<span class="text-lg font-bold">Asset Control</span>
				<!-- Spacer -->
				<div class="w-6"></div>
			</header>

			<!-- Page Content with Card-like wrapper -->
			<main class="flex-1 p-4 sm:p-6 lg:p-8">
				<div class="h-full w-full rounded-xl bg-white p-4 shadow-md sm:p-6">
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