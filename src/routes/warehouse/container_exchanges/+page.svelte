<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t, locale } from '$lib/i18n';

	const { data } = $props<{ data: PageData }>();

	let searchQuery = $state(data.searchQuery ?? '');
	let startDate = $state(data.startDate ?? '');
	let endDate = $state(data.endDate ?? '');
	let searchTimer: NodeJS.Timeout;

	function buildQueryString(
		search: string,
		start: string,
		end: string,
		limitStr: string,
		pageStr: string
	) {
		const query = [];
		if (search) query.push(`search=${encodeURIComponent(search)}`);
		query.push(`startDate=${encodeURIComponent(start)}`);
		query.push(`endDate=${encodeURIComponent(end)}`);
		query.push(`limit=${limitStr}`);
		query.push(`page=${pageStr}`);
		return `?${query.join('&')}`;
	}

	function handleSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			const queryString = buildQueryString(
				searchQuery,
				startDate,
				endDate,
				data.limit.toString(),
				'1'
			);
			goto(queryString, { keepFocus: true, noScroll: true, replaceState: true });
		}, 400);
	}

	function changeLimit(newLimit: string) {
		const queryString = buildQueryString(searchQuery, startDate, endDate, newLimit, '1');
		goto(queryString, { keepFocus: true, noScroll: true, replaceState: true });
	}

	function formatDateOnly(dateVal: any) {
		if (!dateVal) return '-';
		try {
			const strVal = String(dateVal);
			if (strVal.startsWith('0000-00-00')) return '-';
			const dateObj = new Date(dateVal);
			if (isNaN(dateObj.getTime())) return '-';
			return dateObj.toLocaleDateString($locale === 'th' ? 'th-TH' : 'en-GB');
		} catch (e) {
			return '-';
		}
	}

	function formatDateTimeStr(dateVal: any) {
		if (!dateVal) return '-';
		try {
			const strVal = String(dateVal);
			if (strVal.startsWith('0000-00-00')) return '-';
			const dateObj = new Date(dateVal);
			if (isNaN(dateObj.getTime())) return '-';
			return dateObj.toLocaleString($locale === 'th' ? 'th-TH' : 'en-GB', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch (e) {
			return '-';
		}
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
				if (i - l === 2) rangeWithDots.push(l + 1);
				else if (i - l !== 1) rangeWithDots.push('...');
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
			data.limit.toString(),
			pageNum.toString()
		);
	}

	function getExportUrl() {
		const query = [];
		if (searchQuery) query.push(`search=${encodeURIComponent(searchQuery)}`);
		if (startDate) query.push(`startDate=${encodeURIComponent(startDate)}`);
		if (endDate) query.push(`endDate=${encodeURIComponent(endDate)}`);
		return `/warehouse/container_exchanges/export?${query.join('&')}`;
	}
</script>

<svelte:head>
	<title>{$t('Container Exchanges')}</title>
</svelte:head>

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Container Exchanges')}</h1>
		<p class="mt-1 text-sm text-gray-500">{$t('ประวัติการสลับตู้ / เปลี่ยนตู้คอนเทนเนอร์')}</p>
	</div>

	<a
		href={getExportUrl()}
		target="_blank"
		class="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:outline-none"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="mr-2 h-4 w-4"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
			/>
		</svg>
		{$t('Export Excel')}
	</a>
</div>

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
					placeholder={$t('ค้นหาหมายเลขตู้ หรือ หมายเหตุ...')}
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
				>{$t('Exchange Date From')}</label
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
				>{$t('Exchange Date To')}</label
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

		<div class="flex items-end">
			<button
				type="button"
				onclick={() => {
					searchQuery = '';
					startDate = '';
					endDate = '';
					handleSearchInput();
				}}
				class="h-[42px] rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
			>
				{$t('Clear')}
			</button>
		</div>
	</form>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-center font-semibold whitespace-nowrap text-gray-600"
					>{$t('Exchange Date')}</th
				>
				<th class="px-4 py-3 text-center font-semibold whitespace-nowrap text-gray-600"
					>{$t('Source Container')}</th
				>
				<th class="w-10 px-2 py-3 text-center text-gray-400"></th>
				<th class="px-4 py-3 text-center font-semibold whitespace-nowrap text-gray-600"
					>{$t('Destination Container')}</th
				>
				<th class="px-4 py-3 text-center font-semibold whitespace-nowrap text-gray-600"
					>{$t('User')}</th
				>
				<th class="px-4 py-3 text-center font-semibold whitespace-nowrap text-gray-600"
					>{$t('Remarks')}</th
				>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.exchanges.length === 0}
				<tr>
					<td colspan="6" class="py-12 text-center text-gray-500">
						{$t('ไม่พบข้อมูลการสลับตู้คอนเทนเนอร์')}
					</td>
				</tr>
			{:else}
				{#each data.exchanges as item (item.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 text-center text-xs font-semibold text-gray-700">
							{formatDateTimeStr(item.exchange_date)}
						</td>
						<td class="px-4 py-3 text-center">
							<span
								class="rounded bg-red-50 px-2 py-1 font-mono text-sm font-bold whitespace-nowrap text-red-700"
							>
								{item.source_container_no || `ID: ${item.source_container_id}`}
							</span>
						</td>
						<td class="w-10 px-2 py-3 text-center text-gray-400">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mx-auto h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M14 5l7 7m0 0l-7 7m7-7H3"
								/>
							</svg>
						</td>
						<td class="px-4 py-3 text-center">
							<span
								class="rounded bg-green-50 px-2 py-1 font-mono text-sm font-bold whitespace-nowrap text-green-700"
							>
								{item.dest_container_no || `ID: ${item.destination_container_id}`}
							</span>
						</td>
						<td class="px-4 py-3 text-center font-medium text-gray-600">
							{item.user_name || '-'}
						</td>
						<td class="px-4 py-3 text-center text-xs text-gray-500">
							{item.remarks || '-'}
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

{#if data.exchanges.length > 0}
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
				</select>
				<span class="text-sm text-gray-700">{$t('entries')}</span>
			</div>
		</div>

		{#if data.totalPages > 1}
			<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
				<a
					href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'}
					class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage ===
					1
						? 'pointer-events-none opacity-50'
						: ''}"
				>
					<span class="sr-only">Previous</span>
					<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"
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
								? 'z-10 bg-blue-600 text-white'
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
					<span class="sr-only">Next</span>
					<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"
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
