<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t, locale } from '$lib/i18n';

	// --- Types ---
	type Route = PageData['routes'][0];
	type Item = PageData['items'][0];
	type RouteMaster = PageData['routeMasters'][0];

	// --- Props & State ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedRoute = $state<Partial<Route> | null>(null);
	let routeToDelete = $state<Route | null>(null);
	let isSaving = $state(false);

	// Searchable Dropdown States
	let itemSearchValue = $state('');
	let showItemDropdown = $state(false);

	let rmSearchValue = $state('');
	let showRmDropdown = $state(false);

	// Route Master Modal State
	let showRouteMasterModal = $state(false);
	let editingRouteMasterId = $state<number | null>(null);
	let routeMasterToDelete = $state<RouteMaster | null>(null);
	let isSavingMaster = $state(false);
	let newRouteMasterName = $state('');

	let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(
		null
	);
	let messageTimeout: NodeJS.Timeout;

	// Search State
	let searchQuery = $state(data.searchQuery ?? '');
	let searchTimer: NodeJS.Timeout;

	// --- Functions ---
	function handleSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			const params = new URLSearchParams();
			if (searchQuery) params.set('search', searchQuery);
			params.set('limit', data.limit.toString());
			params.set('page', '1');

			goto(`${$page.url.pathname}?${params.toString()}`, {
				keepFocus: true,
				noScroll: true,
				replaceState: true
			});
		}, 400);
	}

	function changeLimit(newLimit: string) {
		const params = new URLSearchParams();
		if (searchQuery) params.set('search', searchQuery);
		params.set('limit', newLimit);
		params.set('page', '1');

		goto(`${$page.url.pathname}?${params.toString()}`, {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	function openModal(mode: 'add' | 'edit', route: Route | null = null) {
		modalMode = mode;
		globalMessage = null;

		if (mode === 'edit' && route) {
			selectedRoute = { ...route };

			const item = data.items.find((i: Item) => i.id === route.item_id);
			itemSearchValue = item ? `[${item.item_code}] ${item.item_name}` : '';

			const rm = data.routeMasters.find((r: RouteMaster) => r.id === route.route_name_id);
			rmSearchValue = rm ? rm.name : '';
		} else {
			selectedRoute = {
				item_id: undefined as any,
				route_name_id: undefined as any,
				route_no: '',
				stock: 0,
				min: 0,
				max: 0
			} as any;
			itemSearchValue = '';
			rmSearchValue = '';
		}
	}

	function closeModal() {
		modalMode = null;
		selectedRoute = null;
		showItemDropdown = false;
		showRmDropdown = false;
	}

	function openRouteMasterModal(rm: RouteMaster | null = null) {
		if (rm) {
			editingRouteMasterId = rm.id;
			newRouteMasterName = rm.name;
		} else {
			editingRouteMasterId = null;
			newRouteMasterName = '';
		}
		showRouteMasterModal = true;
		showRmDropdown = false;
	}

	function closeRouteMasterModal() {
		showRouteMasterModal = false;
	}

	function confirmDeleteRouteMaster(rm: RouteMaster) {
		routeMasterToDelete = rm;
		showRmDropdown = false;
	}

	function showGlobalMessage(
		message: { success: boolean; text: string; type: 'success' | 'error' },
		duration: number = 5000
	) {
		clearTimeout(messageTimeout);
		globalMessage = message;
		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, duration);
	}

	function formatQuantity(value: number | null | undefined) {
		if (value === null || value === undefined) return '-';
		return new Intl.NumberFormat($locale === 'th' ? 'th-TH' : 'en-US', {
			style: 'decimal',
			minimumFractionDigits: 0,
			maximumFractionDigits: 2
		}).format(value);
	}

	// --- Reactive Effects ---
	$effect.pre(() => {
		if (form?.action === 'saveRoute') {
			if (form.success) {
				closeModal();
				showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
			}
			form.action = undefined;
		}

		if (form?.action === 'deleteRoute') {
			if (form.success) {
				showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
			}
			routeToDelete = null;
			form.action = undefined;
		}

		if (form?.action === 'saveRouteMaster') {
			if (form.success) {
				closeRouteMasterModal();
				showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
				// Auto-select the newly created or edited route master
				if (selectedRoute) {
					selectedRoute.route_name_id = form.newId as number;
					rmSearchValue = newRouteMasterName;
				}
				invalidateAll();
			} else if (form.message) {
				// We don't close modal on error so they see it
			}
			form.action = undefined;
		}

		if (form?.action === 'deleteRouteMaster') {
			if (form.success) {
				showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
				// If we deleted the route master that was currently selected, reset it
				if (selectedRoute && selectedRoute.route_name_id === routeMasterToDelete?.id) {
					selectedRoute.route_name_id = undefined;
					rmSearchValue = '';
				}
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
			}
			routeMasterToDelete = null;
			form.action = undefined;
		}
	});

	// --- Pagination Logic ---
	const paginationRange = $derived.by(() => {
		const delta = 1;
		const left = data.currentPage - delta;
		const right = data.currentPage + delta + 1;
		const range: number[] = [];
		const rangeWithDots: (number | string)[] = [];
		let l: number | undefined;
		for (let i = 1; i <= data.totalPages; i++) {
			if (i == 1 || i == data.totalPages || (i >= left && i < right)) {
				range.push(i);
			}
		}
		for (const i of range) {
			if (l) {
				if (i - l === 2) {
					rangeWithDots.push(l + 1);
				} else if (i - l !== 1) {
					rangeWithDots.push('...');
				}
			}
			rangeWithDots.push(i);
			l = i;
		}
		return rangeWithDots;
	});

	function getPageUrl(pageNum: number) {
		const params = new URLSearchParams();
		if (searchQuery) params.set('search', searchQuery);
		params.set('limit', data.limit.toString());
		params.set('page', pageNum.toString());
		return `${$page.url.pathname}?${params.toString()}`;
	}
</script>

<svelte:head>
	<title>{$t('Item Routes')}</title>
</svelte:head>

<!-- Global Message Toast -->
{#if globalMessage}
	<div
		transition:fade
		class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 text-sm font-semibold shadow-xl {globalMessage.type ===
		'success'
			? 'bg-green-100 text-green-800'
			: 'bg-red-100 text-red-800'}"
	>
		{globalMessage.text}
	</div>
{/if}

<!-- Header -->
<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Items Route')}</h1>
		<p class="mt-1 text-sm text-gray-500">{$t('Manage item routes and configurations')}</p>
	</div>
	<div class="flex items-center gap-2">
		<form method="POST" action="{$page.url.pathname}/export">
			<input type="hidden" name="search" value={searchQuery} />
			<button
				type="submit"
				class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:outline-none"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					class="h-4 w-4"
					><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
						points="7 10 12 15 17 10"
					/><line x1="12" y1="15" x2="12" y2="3" /></svg
				>
				{$t('Export to Excel')}
			</button>
		</form>
		<button
			onclick={() => openModal('add')}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				class="h-4 w-4"
			>
				<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
			</svg>
			{$t('Add New Route')}
		</button>
	</div>
</div>

<!-- Search Bar -->
<div class="mb-4">
	<form method="GET" action={$page.url.pathname} class="relative">
		<input type="hidden" name="page" value="1" />
		<input type="hidden" name="limit" value={data.limit} />
		<input
			type="search"
			name="search"
			bind:value={searchQuery}
			oninput={handleSearchInput}
			placeholder={$t('Search by Route No, Name or Item Code...')}
			class="w-full rounded-lg border-gray-300 py-2 pr-4 pl-10 text-sm focus:border-blue-500 focus:ring-blue-500"
		/>
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<svg
				class="h-4 w-4 text-gray-400"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
			>
				<path
					fill-rule="evenodd"
					d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
					clip-rule="evenodd"
				/>
			</svg>
		</div>
	</form>
</div>

<!-- Data Table -->
<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Route No')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Route Name')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Item')}</th>
				<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('Stock')}</th>
				<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('Min')}</th>
				<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('Max')}</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Actions')}</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.routes.length === 0}
				<tr>
					<td colspan="7" class="py-12 text-center text-gray-500">
						{#if data.searchQuery}{$t('No routes found for:')} "{data.searchQuery}"{:else}{$t(
								'No route data found'
							)}{/if}
					</td>
				</tr>
			{:else}
				{#each data.routes as route (route.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 font-mono font-medium text-gray-800">{route.route_no}</td>
						<td class="px-4 py-3 text-gray-700">{route.route_master_name}</td>
						<td class="px-4 py-3 text-gray-600">
							<span class="font-mono text-xs text-blue-700">{route.item_code}</span> - {route.item_name}
						</td>
						<td class="px-4 py-3 text-right font-medium text-gray-800"
							>{formatQuantity(route.stock)}</td
						>
						<td class="px-4 py-3 text-right font-medium text-orange-600"
							>{formatQuantity(route.min)}</td
						>
						<td class="px-4 py-3 text-right font-medium text-green-600"
							>{formatQuantity(route.max)}</td
						>
						<td class="px-4 py-3 text-center whitespace-nowrap">
							<div class="flex items-center justify-center gap-2">
								<button
									onclick={() => openModal('edit', route)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
									title={$t('Edit')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
									>
								</button>
								<button
									onclick={() => (routeToDelete = route)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
									title={$t('Delete')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg
									>
								</button>
							</div>
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

<!-- Pagination & Paging Size -->
{#if data.routes.length > 0 || data.searchQuery}
	<div class="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
		<div class="flex items-center gap-4">
			<div class="flex items-center gap-2">
				<span class="text-sm text-gray-700">{$t('Show')}</span>
				<select
					class="rounded-md border-gray-300 py-1 pr-8 pl-3 text-sm focus:border-blue-500 focus:ring-blue-500"
					value={data.limit.toString()}
					onchange={(e) => changeLimit(e.currentTarget.value)}
				>
					<option value="10">10</option>
					<option value="20">20</option>
					<option value="50">50</option>
					<option value="200">200</option>
				</select>
				<span class="text-sm text-gray-700">{$t('entries')}</span>
			</div>

			{#if data.totalPages > 0}
				<p class="hidden text-sm text-gray-700 sm:block">
					{$t('Showing page')} <span class="font-medium">{data.currentPage}</span>
					{$t('of')} <span class="font-medium">{data.totalPages}</span>
				</p>
			{/if}
		</div>

		{#if data.totalPages > 1}
			<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
				<!-- Paging Buttons similar to existing pages -->
				<a
					href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'}
					class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage ===
					1
						? 'pointer-events-none opacity-50'
						: ''}"
				>
					<span class="sr-only">{$t('Previous')}</span><svg
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
						><path
							fill-rule="evenodd"
							d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
							clip-rule="evenodd"
						/></svg
					>
				</a>
				{#each paginationRange as pageNum}
					{#if typeof pageNum === 'string'}
						<span
							class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 ring-inset"
							>...</span
						>
					{:else}
						<a
							href={getPageUrl(pageNum)}
							class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum ===
							data.currentPage
								? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
								: 'text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-50'}">{pageNum}</a
						>
					{/if}
				{/each}
				<a
					href={data.currentPage < data.totalPages ? getPageUrl(data.currentPage + 1) : '#'}
					class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage ===
					data.totalPages
						? 'pointer-events-none opacity-50'
						: ''}"
				>
					<span class="sr-only">{$t('Next')}</span><svg
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
						><path
							fill-rule="evenodd"
							d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
							clip-rule="evenodd"
						/></svg
					>
				</a>
			</nav>
		{/if}
	</div>
{/if}

<!-- Add/Edit Main Modal -->
{#if modalMode && selectedRoute}
	<div
		transition:slide
		class="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
	>
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div
			class="relative flex max-h-[90vh] w-full max-w-2xl transform flex-col rounded-xl bg-white shadow-2xl transition-all"
		>
			<div class="flex-shrink-0 border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? $t('Add New Route') : $t('Edit Route')}
				</h2>
			</div>

			<form
				method="POST"
				action="?/saveRoute"
				use:enhance={() => {
					isSaving = true;
					return async ({ update }) => {
						await update({ reset: false });
						isSaving = false;
					};
				}}
				class="flex-1 overflow-y-auto p-6"
			>
				{#if modalMode === 'edit'}
					<input type="hidden" name="id" value={selectedRoute.id} />
				{/if}

				<div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
					<!-- Route No -->
					<div>
						<label for="route_no" class="mb-1 block text-sm font-medium">
							{$t('Route No')}
							<span class="font-normal text-gray-500">({$t('Leave blank to auto-generate')})</span>
						</label>
						<input
							type="text"
							name="route_no"
							id="route_no"
							bind:value={selectedRoute.route_no}
							class="w-full rounded-md border-gray-300 text-sm uppercase focus:border-blue-500 focus:ring-blue-500"
							placeholder={$t('Auto-generate if blank')}
						/>
					</div>

					<!-- Link Item (Searchable Dropdown) -->
					<div class="relative">
						<label for="item_search" class="mb-1 block text-sm font-medium">{$t('Item *')}</label>
						<input type="hidden" name="item_id" value={selectedRoute?.item_id || ''} />
						<input
							type="text"
							id="item_search"
							autocomplete="off"
							required={!selectedRoute?.item_id}
							placeholder={$t('Search and select item...')}
							bind:value={itemSearchValue}
							oninput={() => {
								showItemDropdown = true;
								if (selectedRoute) selectedRoute.item_id = undefined; // Force re-selection if typing changes
							}}
							onfocus={() => (showItemDropdown = true)}
							onblur={() => (showItemDropdown = false)}
							class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500 {selectedRoute?.item_id ===
								undefined && itemSearchValue
								? 'border-red-400 focus:border-red-500 focus:ring-red-500'
								: ''}"
						/>
						{#if showItemDropdown}
							<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
							<ul
								class="ring-opacity-5 absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black focus:outline-none sm:text-sm"
								onmousedown={(e) => e.preventDefault()}
							>
								{#each data.items.filter((i: Item) => `[${i.item_code}] ${i.item_name}`
										.toLowerCase()
										.includes(itemSearchValue.toLowerCase())) as item (item.id)}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
									<li
										class="relative cursor-pointer py-2 pr-9 pl-3 text-gray-900 select-none hover:bg-blue-600 hover:text-white"
										onclick={() => {
											if (selectedRoute) selectedRoute.item_id = item.id;
											itemSearchValue = `[${item.item_code}] ${item.item_name}`;
											showItemDropdown = false;
										}}
									>
										[{item.item_code}] {item.item_name}
									</li>
								{/each}
								{#if data.items.filter((i: Item) => `[${i.item_code}] ${i.item_name}`
										.toLowerCase()
										.includes(itemSearchValue.toLowerCase())).length === 0}
									<li class="relative cursor-default py-2 pr-9 pl-3 text-gray-500 select-none">
										{$t('No items found')}
									</li>
								{/if}
							</ul>
						{/if}
					</div>

					<!-- Route Master Name (Searchable Dropdown + Add Button) -->
					<div class="sm:col-span-2">
						<label for="rm_search" class="mb-1 block text-sm font-medium"
							>{$t('Route Name *')}</label
						>
						<div class="flex items-start gap-2">
							<div class="relative w-full">
								<input
									type="hidden"
									name="route_name_id"
									value={selectedRoute?.route_name_id || ''}
								/>
								<input
									type="text"
									id="rm_search"
									autocomplete="off"
									required={!selectedRoute?.route_name_id}
									placeholder={$t('Search and select route name...')}
									bind:value={rmSearchValue}
									oninput={() => {
										showRmDropdown = true;
										if (selectedRoute) selectedRoute.route_name_id = undefined; // Force re-selection if typing changes
									}}
									onfocus={() => (showRmDropdown = true)}
									onblur={() => (showRmDropdown = false)}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500 {selectedRoute?.route_name_id ===
										undefined && rmSearchValue
										? 'border-red-400 focus:border-red-500 focus:ring-red-500'
										: ''}"
								/>
								{#if showRmDropdown}
									<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
									<ul
										class="ring-opacity-5 absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black focus:outline-none sm:text-sm"
										onmousedown={(e) => e.preventDefault()}
									>
										{#each data.routeMasters.filter((rm: RouteMaster) => rm.name
												.toLowerCase()
												.includes(rmSearchValue.toLowerCase())) as rm (rm.id)}
											<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
											<li
												class="relative flex items-center justify-between border-b border-gray-50 py-1 pr-2 pl-3 last:border-0 hover:bg-gray-100"
											>
												<!-- svelte-ignore a11y_click_events_have_key_events -->
												<!-- svelte-ignore a11y_no_static_element_interactions -->
												<div
													class="flex-1 cursor-pointer py-1 text-gray-900 select-none"
													onclick={() => {
														if (selectedRoute) selectedRoute.route_name_id = rm.id;
														rmSearchValue = rm.name;
														showRmDropdown = false;
													}}
												>
													{rm.name}
												</div>
												<div class="flex items-center gap-1 pl-2">
													<button
														type="button"
														class="rounded p-1.5 text-gray-400 transition-colors hover:bg-blue-100 hover:text-blue-600"
														title={$t('Edit')}
														onclick={(e) => {
															e.stopPropagation();
															openRouteMasterModal(rm);
														}}
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															width="14"
															height="14"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="2"
															><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
														>
													</button>
													<button
														type="button"
														class="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600"
														title={$t('Delete')}
														onclick={(e) => {
															e.stopPropagation();
															confirmDeleteRouteMaster(rm);
														}}
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															width="14"
															height="14"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="2"
															><path d="M3 6h18" /><path
																d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
															/></svg
														>
													</button>
												</div>
											</li>
										{/each}
										{#if data.routeMasters.filter((rm: RouteMaster) => rm.name
												.toLowerCase()
												.includes(rmSearchValue.toLowerCase())).length === 0}
											<li class="relative cursor-default py-2 pr-9 pl-3 text-gray-500 select-none">
												{$t('No route names found')}
											</li>
										{/if}
									</ul>
								{/if}
							</div>
							<button
								type="button"
								onclick={() => openRouteMasterModal(null)}
								class="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-md border border-gray-300 bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 hover:text-blue-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
								title={$t('Add New Route Master')}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									><line x1="12" y1="5" x2="12" y2="19" /><line
										x1="5"
										y1="12"
										x2="19"
										y2="12"
									/></svg
								>
							</button>
						</div>
					</div>

					<!-- Stock -->
					<div>
						<label for="stock" class="mb-1 block text-sm font-medium">{$t('Stock Level')}</label>
						<input
							type="number"
							step="any"
							name="stock"
							id="stock"
							bind:value={selectedRoute.stock}
							class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
						/>
					</div>

					<!-- Min -->
					<div>
						<label for="min" class="mb-1 block text-sm font-medium">{$t('Min Level')}</label>
						<input
							type="number"
							step="any"
							name="min"
							id="min"
							bind:value={selectedRoute.min}
							class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
						/>
					</div>

					<!-- Max -->
					<div>
						<label for="max" class="mb-1 block text-sm font-medium">{$t('Max Level')}</label>
						<input
							type="number"
							step="any"
							name="max"
							id="max"
							bind:value={selectedRoute.max}
							class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
						/>
					</div>
				</div>

				{#if form?.message && !form.success && form.action === 'saveRoute'}
					<div class="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
						<p><strong>{$t('Error:')}</strong> {form.message}</p>
					</div>
				{/if}

				<div class="mt-8 flex justify-end gap-3 border-t pt-4">
					<button
						type="button"
						onclick={closeModal}
						class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
						>{$t('Cancel')}</button
					>
					<button
						type="submit"
						disabled={isSaving}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-400"
					>
						{isSaving ? $t('Saving...') : $t('Save Route')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Add/Edit Route Master Modal -->
{#if showRouteMasterModal}
	<div
		transition:fade
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
	>
		<div class="fixed inset-0" onclick={closeRouteMasterModal} role="presentation"></div>
		<div class="relative w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="mb-4 text-lg font-bold text-gray-900">
				{editingRouteMasterId ? $t('Edit Route Master') : $t('Add Route Master')}
			</h3>

			<form
				method="POST"
				action="?/saveRouteMaster"
				use:enhance={() => {
					isSavingMaster = true;
					return async ({ update }) => {
						await update({ reset: false });
						isSavingMaster = false;
					};
				}}
			>
				{#if editingRouteMasterId}
					<input type="hidden" name="id" value={editingRouteMasterId} />
				{/if}

				<div class="mb-4">
					<label for="new_route_name" class="mb-1 block text-sm font-medium">{$t('Name *')}</label>
					<input
						type="text"
						name="name"
						id="new_route_name"
						required
						bind:value={newRouteMasterName}
						class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
						placeholder="e.g. TRIM1, PACKING"
					/>
				</div>

				{#if form?.message && !form.success && form.action === 'saveRouteMaster'}
					<div class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
						<p><strong>{$t('Error:')}</strong> {form.message}</p>
					</div>
				{/if}

				<div class="flex justify-end gap-3">
					<button
						type="button"
						onclick={closeRouteMasterModal}
						class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
						>{$t('Cancel')}</button
					>
					<button
						type="submit"
						disabled={isSavingMaster}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-400"
					>
						{isSavingMaster ? $t('Saving...') : $t('Save')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Route Master Confirmation Modal -->
{#if routeMasterToDelete}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">{$t('Confirm Delete')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				{$t('Are you sure you want to delete this route master?')} <br />
				<strong class="font-mono text-sm text-gray-800">{routeMasterToDelete.name}</strong>
				<br /><br />
				<span class="text-red-600">{$t('This action cannot be undone.')}</span>
			</p>

			{#if form?.message && !form.success && form.action === 'deleteRouteMaster'}
				<p class="mt-3 text-sm text-red-600"><strong>{$t('Error:')}</strong> {form.message}</p>
			{/if}

			<form
				method="POST"
				action="?/deleteRouteMaster"
				use:enhance
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="id" value={routeMasterToDelete.id} />
				<button
					type="button"
					onclick={() => (routeMasterToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
					>{$t('Cancel')}</button
				>
				<button
					type="submit"
					class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
					>{$t('Delete')}</button
				>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal (Route) -->
{#if routeToDelete}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">{$t('Confirm Delete')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				{$t('Are you sure you want to delete route:')} <br />
				<strong class="font-mono text-sm text-gray-800">{routeToDelete.route_no}</strong> - {routeToDelete.route_master_name}?
				<br /><br />
				<span class="text-red-600">{$t('This action cannot be undone.')}</span>
			</p>

			{#if form?.message && !form.success && form.action === 'deleteRoute'}
				<p class="mt-3 text-sm text-red-600"><strong>{$t('Error:')}</strong> {form.message}</p>
			{/if}

			<form method="POST" action="?/deleteRoute" use:enhance class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="id" value={routeToDelete.id} />
				<button
					type="button"
					onclick={() => (routeToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
					>{$t('Cancel')}</button
				>
				<button
					type="submit"
					class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
					>{$t('Delete')}</button
				>
			</form>
		</div>
	</div>
{/if}
