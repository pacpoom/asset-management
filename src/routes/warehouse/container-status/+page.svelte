<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t, locale } from '$lib/i18n';

	const { data } = $props<{ data: PageData }>();

	let searchQuery = $state(data.searchQuery ?? '');
	let startDate = $state(data.startDate ?? '');
	let endDate = $state(data.endDate ?? '');
	let statusFilter = $state(data.statusFilter ?? '');
	let searchTimer: NodeJS.Timeout;

	function buildQueryString(
		search: string,
		start: string,
		end: string,
		status: string,
		limitStr: string,
		pageStr: string
	) {
		const query = [];
		if (search) query.push(`search=${encodeURIComponent(search)}`);
		query.push(`startDate=${encodeURIComponent(start)}`);
		query.push(`endDate=${encodeURIComponent(end)}`);
		if (status) query.push(`status=${encodeURIComponent(status)}`);
		query.push(`limit=${limitStr}`);
		query.push(`page=${pageStr}`);
		return `?${query.join('&')}`;
	}

	function getExportUrl() {
		const query = [];
		if (searchQuery) query.push(`search=${encodeURIComponent(searchQuery)}`);
		query.push(`startDate=${encodeURIComponent(startDate)}`);
		query.push(`endDate=${encodeURIComponent(endDate)}`);
		if (statusFilter) query.push(`status=${encodeURIComponent(statusFilter)}`); // 🌟 ให้ตอนโหลด Excel ส่ง status ไปด้วย
		return `/warehouse/container-status/export?${query.join('&')}`;
	}

	function handleSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			const queryString = buildQueryString(
				searchQuery,
				startDate,
				endDate,
				statusFilter,
				data.limit.toString(),
				'1'
			);

			goto(queryString, {
				keepFocus: true,
				noScroll: true,
				replaceState: true
			});
		}, 400);
	}

	function changeLimit(newLimit: string) {
		const queryString = buildQueryString(
			searchQuery,
			startDate,
			endDate,
			statusFilter,
			newLimit,
			'1'
		);

		goto(queryString, {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	function formatDateOnly(dateStr: string | null | undefined) {
		if (!dateStr) return '-';
		const dateObj = new Date(dateStr);
		return dateObj.toLocaleDateString($locale === 'th' ? 'th-TH' : 'en-GB');
	}

	function formatDateTimeStr(dateStr: string | null | undefined) {
		if (!dateStr) return '-';
		const dateObj = new Date(dateStr);
		return dateObj.toLocaleString($locale === 'th' ? 'th-TH' : 'en-GB', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

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
		return buildQueryString(
			searchQuery,
			startDate,
			endDate,
			statusFilter,
			data.limit.toString(),
			pageNum.toString()
		);
	}
</script>

<svelte:head>
	<title>{$t('Container Status')}</title>
</svelte:head>

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Container Status')}</h1>
		<p class="mt-1 text-sm text-gray-500">
			{$t('ติดตามสถานะตู้คอนเทนเนอร์ (Plan, ETD, ATA, Check-in)')}
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<div
			class="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 shadow-sm"
		>
			<div
				class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
					<path d="M6 8h12M6 12h12M6 16h12" />
				</svg>
			</div>
			<div>
				<p class="text-[10px] font-bold text-blue-600 uppercase">{$t('Total')}</p>
				<p class="text-lg leading-none font-bold text-gray-900">
					{data.totalCount.toLocaleString()}
				</p>
			</div>
		</div>

		<div
			class="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-2 shadow-sm"
		>
			<div
				class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
					></path>
					<polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
					<line x1="12" y1="22.08" x2="12" y2="12"></line>
				</svg>
			</div>
			<div>
				<p class="text-[10px] font-bold text-red-600 uppercase">{$t('Full')}</p>
				<p class="text-lg leading-none font-bold text-gray-900">
					{data.fullCount.toLocaleString()}
				</p>
			</div>
		</div>

		<div
			class="flex items-center gap-3 rounded-xl border border-orange-100 bg-orange-50 px-4 py-2 shadow-sm"
		>
			<div
				class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
					></path>
					<polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline>
					<polyline points="7.5 19.79 7.5 14.6 3 12"></polyline>
					<polyline points="21 12 16.5 14.6 16.5 19.79"></polyline>
					<polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
					<line x1="12" y1="22.08" x2="12" y2="12"></line>
				</svg>
			</div>
			<div>
				<p class="text-[10px] font-bold text-orange-600 uppercase">{$t('Partial')}</p>
				<p class="text-lg leading-none font-bold text-gray-900">
					{data.partialCount.toLocaleString()}
				</p>
			</div>
		</div>

		<div
			class="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 shadow-sm"
		>
			<div
				class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
					></path>
					<polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
					<line x1="12" y1="22.08" x2="12" y2="12"></line>
				</svg>
			</div>
			<div>
				<p class="text-[10px] font-bold text-gray-600 uppercase">{$t('Empty')}</p>
				<p class="text-lg leading-none font-bold text-gray-900">
					{data.emptyCount.toLocaleString()}
				</p>
			</div>
		</div>

		<a
			href={getExportUrl()}
			target="_blank"
			class="ml-auto flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
				<polyline points="14 2 14 8 20 8"></polyline>
				<path d="M8 13h2"></path>
				<path d="M8 17h2"></path>
				<path d="M14 13h2"></path>
				<path d="M14 17h2"></path>
			</svg>
			{$t('Export')}
		</a>
	</div>
</div>

<!-- ฟอร์มค้นหา -->
<div class="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
	<form
		method="GET"
		action={$page.url.pathname}
		class="flex flex-col gap-4 sm:flex-row sm:items-end"
	>
		<input type="hidden" name="page" value="1" />
		<input type="hidden" name="limit" value={data.limit} />

		<div class="flex-1">
			<label for="search" class="mb-1 block text-xs font-semibold text-gray-700"
				>{$t('Search')}</label
			>
			<div class="relative">
				<input
					type="search"
					name="search"
					id="search"
					bind:value={searchQuery}
					oninput={handleSearchInput}
					placeholder={$t('ค้นหา Container No, Plan No, House BL, Model...')}
					class="w-full rounded-lg border-gray-300 py-2.5 pr-4 pl-10 text-sm focus:border-blue-500 focus:ring-blue-500"
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
			</div>
		</div>

		<div>
			<label for="startDate" class="mb-1 block text-xs font-semibold text-gray-700"
				>{$t('Check-in Date From')}</label
			>
			<input
				type="date"
				name="startDate"
				id="startDate"
				bind:value={startDate}
				onchange={handleSearchInput}
				class="w-full rounded-lg border-gray-300 py-2.5 text-sm focus:border-blue-500 focus:ring-blue-500"
			/>
		</div>

		<div>
			<label for="endDate" class="mb-1 block text-xs font-semibold text-gray-700"
				>{$t('Check-in Date To')}</label
			>
			<input
				type="date"
				name="endDate"
				id="endDate"
				bind:value={endDate}
				onchange={handleSearchInput}
				class="w-full rounded-lg border-gray-300 py-2.5 text-sm focus:border-blue-500 focus:ring-blue-500"
			/>
		</div>

		<div>
			<label for="statusFilter" class="mb-1 block text-xs font-semibold text-gray-700"
				>{$t('Plan Status')}</label
			>
			<select
				name="status"
				id="statusFilter"
				bind:value={statusFilter}
				onchange={handleSearchInput}
				class="w-full cursor-pointer rounded-lg border-gray-300 py-2.5 pr-8 text-sm focus:border-blue-500 focus:ring-blue-500"
			>
				<option value="">{$t('All Status')}</option>
				<option value="2">{$t('Received')}</option>
				<option value="3">{$t('Shipped Out')}</option>
				<option value="4">{$t('Returned')}</option>
			</select>
		</div>
	</form>
</div>

<!-- ตารางข้อมูล -->
<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Container No')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Plan No')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Model')}</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Type')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('House BL')}</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('ETD Date')}</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('ATA Date')}</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Check-in Date')}</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Status')}</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Stock Status')}</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.containers.length === 0}
				<tr>
					<td colspan="8" class="py-12 text-center text-gray-500">
						{#if data.searchQuery || data.startDate || data.endDate}
							{$t('ไม่พบข้อมูลตู้คอนเทนเนอร์ที่ตรงกับเงื่อนไขการค้นหา')}
						{:else}
							{$t('ยังไม่มีข้อมูลตู้คอนเทนเนอร์ในระบบ')}
						{/if}
					</td>
				</tr>
			{:else}
				{#each data.containers as item (item.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3">
							<span class="font-mono text-sm font-bold text-blue-700">{item.container_no}</span>
						</td>
						<td class="px-4 py-3 font-medium text-gray-800">
							{item.plan_no || '-'}
						</td>
						<td class="px-4 py-3 text-gray-600">
							{item.model || '-'}
						</td>
						<td class="px-4 py-3 text-center">
							<span class="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
								{item.type || '-'}
							</span>
						</td>
						<td class="px-4 py-3 font-mono text-xs text-gray-600">{item.house_bl || '-'}</td>
						<td class="px-4 py-3 text-center text-xs text-gray-600">
							{formatDateOnly(item.etd_date)}
						</td>
						<td class="px-4 py-3 text-center text-xs text-gray-600">
							{formatDateOnly(item.ata_date)}
						</td>
						<td class="px-4 py-3 text-center text-xs font-semibold text-green-700">
							{formatDateTimeStr(item.checkin_date)}
						</td>
						<td class="px-4 py-3 text-center">
							<span
								class="rounded-full px-2 py-1 text-xs font-semibold
        {item.status == 2
									? 'bg-blue-100 text-blue-800'
									: item.status == 4
										? 'bg-gray-100 text-gray-800'
										: 'bg-green-100 text-green-800'}"
							>
								{item.status == 2
									? $t('Received')
									: item.status == 4
										? $t('Returned')
										: $t('Shipped Out')}
							</span>
						</td>

						<td class="px-4 py-3 text-center">
							<span
								class="rounded-full px-2 py-1 text-xs font-semibold
        {item.stock_status == 1
									? 'bg-red-100 text-red-800'
									: item.stock_status == 3
										? 'bg-gray-200 text-gray-800'
										: 'bg-orange-100 text-orange-800'}"
							>
								{item.stock_status == 1
									? $t('Full')
									: item.stock_status == 3
										? $t('Empty')
										: $t('Partial')}
							</span>
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

<!-- ระบบแบ่งหน้า (Pagination) -->
{#if data.containers.length > 0 || data.searchQuery || data.startDate || data.endDate}
	<div class="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
		<div class="flex items-center gap-4">
			<div class="flex items-center gap-2">
				<span class="text-sm text-gray-700">{$t('Showing')}</span>
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
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
				<a
					href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'}
					class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage ===
					1
						? 'pointer-events-none opacity-50'
						: ''}"
				>
					<span class="sr-only">{$t('Previous')}</span>
					<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"
						><path
							fill-rule="evenodd"
							d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
							clip-rule="evenodd"
						/></svg
					>
				</a>
				{#each paginationRange as pageNum, index (index)}
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
					<span class="sr-only">{$t('Next')}</span>
					<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"
						><path
							fill-rule="evenodd"
							d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
							clip-rule="evenodd"
						/></svg
					>
				</a>
			</nav>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
	</div>
{/if}
