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

	function handleSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			const params = new URLSearchParams();
			if (searchQuery) params.set('search', searchQuery);
			if (startDate) params.set('startDate', startDate);
			if (endDate) params.set('endDate', endDate);
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
		if (startDate) params.set('startDate', startDate);
		if (endDate) params.set('endDate', endDate);
		params.set('limit', newLimit);
		params.set('page', '1');

		goto(`${$page.url.pathname}?${params.toString()}`, {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	function formatQuantity(value: number | null | undefined) {
		if (value === null || value === undefined) return '-';
		const formatted = new Intl.NumberFormat($locale === 'th' ? 'th-TH' : 'en-US', {
			style: 'decimal',
			minimumFractionDigits: 0,
			maximumFractionDigits: 2
		}).format(value);
		return value > 0 ? `+${formatted}` : formatted;
	}

	function formatDateTimeStr(dateStr: string | null | undefined) {
		if (!dateStr) return '-';
		const dateObj = new Date(dateStr);
		return dateObj.toLocaleString($locale === 'th' ? 'th-TH' : 'en-GB', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function getTypeBadgeClass(type: string) {
		switch (type) {
			case 'INBOUND_RECEIVE':
				return 'bg-green-100 text-green-800 border-green-200';
			case 'STOCK_ADD':
				return 'bg-blue-100 text-blue-800 border-blue-200';
			case 'STOCK_EDIT':
				return 'bg-orange-100 text-orange-800 border-orange-200';
			case 'STOCK_DELETE':
				return 'bg-red-100 text-red-800 border-red-200';
			default:
				return 'bg-gray-100 text-gray-800 border-gray-200';
		}
	}
	function getTypeLabel(type: string) {
		switch (type) {
			case 'INBOUND_RECEIVE':
				return 'รับเข้า (Inbound)';
			case 'STOCK_ADD':
				return 'เพิ่ม Stock (แมนนวล)';
			case 'STOCK_EDIT':
				return 'แก้ไข Stock';
			case 'STOCK_DELETE':
				return 'ลบ Stock';
			default:
				return type;
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
		if (startDate) params.set('startDate', startDate);
		if (endDate) params.set('endDate', endDate);
		params.set('limit', data.limit.toString());
		params.set('page', pageNum.toString());
		return `${$page.url.pathname}?${params.toString()}`;
	}
</script>

<svelte:head>
	<title>{$t('Transaction Log')}</title>
</svelte:head>

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Transaction Log')}</h1>
		<p class="mt-1 text-sm text-gray-500">
			{$t('ประวัติการทำรายการ รับเข้า, จ่ายออก และแก้ไขสต็อก')}
		</p>
	</div>
	<div class="flex items-center gap-2">
		<form method="POST" action="{$page.url.pathname}/export">
			<input type="hidden" name="search" value={searchQuery} />
			<input type="hidden" name="startDate" value={startDate} />
			<input type="hidden" name="endDate" value={endDate} />
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
				>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
						points="7 10 12 15 17 10"
					/><line x1="12" y1="15" x2="12" y2="3" />
				</svg>
				{$t('Export to Excel')}
			</button>
		</form>
	</div>
</div>

<div class="mb-4">
	<form
		method="GET"
		action={$page.url.pathname}
		class="flex flex-col gap-4 sm:flex-row sm:items-end"
	>
		<input type="hidden" name="page" value="1" />
		<input type="hidden" name="limit" value={data.limit} />

		<div class="relative flex-1">
			<input
				type="search"
				name="search"
				id="search"
				bind:value={searchQuery}
				oninput={handleSearchInput}
				placeholder={$t('Search by Serial Number, Item, Location, or Type...')}
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
		</div>

		<div>
			<label for="startDate" class="mb-1 block text-xs font-semibold text-gray-700"
				>{$t('Transaction Date From')}</label
			>
			<input
				type="date"
				name="startDate"
				id="startDate"
				bind:value={startDate}
				onchange={handleSearchInput}
				class="w-full rounded-lg border-gray-300 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
			/>
		</div>

		<div>
			<label for="endDate" class="mb-1 block text-xs font-semibold text-gray-700"
				>{$t('Transaction Date To')}</label
			>
			<input
				type="date"
				name="endDate"
				id="endDate"
				bind:value={endDate}
				onchange={handleSearchInput}
				class="w-full rounded-lg border-gray-300 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
			/>
		</div>
	</form>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="w-40 px-4 py-3 text-left font-semibold text-gray-600">{$t('Date / Time')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Transaction Type')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Item')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Location')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Serial Number')}</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Unit')}</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Qty Change')}</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Notes')}</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.logs.length === 0}
				<tr>
					<td colspan="8" class="py-12 text-center text-gray-500">
						{#if data.searchQuery || data.startDate || data.endDate}{$t(
								'No logs found for selected filters'
							)}{:else}{$t('No transaction logs found')}{/if}
					</td>
				</tr>
			{:else}
				{#each data.logs as log (log.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 text-xs text-gray-600">{formatDateTimeStr(log.created_at)}</td>
						<td class="px-4 py-3">
							<span
								class="inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium {getTypeBadgeClass(
									log.transaction_type
								)}"
							>
								{getTypeLabel(log.transaction_type)}
							</span>
						</td>
						<td class="px-4 py-3 text-gray-600">
							<span class="font-mono text-xs font-semibold text-blue-700">{log.item_code}</span><br
							/>
							<span class="text-xs text-gray-500">{log.item_name}</span>
						</td>
						<td class="px-4 py-3 font-mono text-gray-700">
							<span class="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700"
								>{log.location_code}</span
							>
						</td>
						<td class="px-4 py-3 font-mono text-xs text-gray-700">{log.serial_number || '-'}</td>
						<td class="px-4 py-3 text-center text-gray-600">
							<span class="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
								{log.unit_symbol || log.unit_name || '-'}
							</span>
						</td>
						<td
							class="px-4 py-3 text-center font-bold {log.qty_change > 0
								? 'text-green-600'
								: log.qty_change < 0
									? 'text-red-600'
									: 'text-gray-500'}"
						>
							{formatQuantity(log.qty_change)}
						</td>
						<td class="max-w-xs truncate px-4 py-3 text-xs text-gray-500" title={log.notes}
							>{log.notes || '-'}</td
						>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

{#if data.logs.length > 0 || data.searchQuery || data.startDate || data.endDate}
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
		{/if}
	</div>
{/if}
