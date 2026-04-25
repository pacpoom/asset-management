<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t, locale } from '$lib/i18n';

	const { data } = $props<{ data: PageData }>();

	let searchQuery = $state(data.searchQuery ?? '');
	let startDate = $state(data.startDate ?? '');
	let endDate = $state(data.endDate ?? '');
	let docTypeFilter = $state(data.docTypeFilter ?? '');

	function buildQueryString(
		search: string,
		start: string,
		end: string,
		docType: string,
		limitStr: string,
		pageStr: string
	) {
		const query = [];
		if (search) query.push(`search=${encodeURIComponent(search)}`);
		if (start) query.push(`startDate=${encodeURIComponent(start)}`);
		if (end) query.push(`endDate=${encodeURIComponent(end)}`);
		if (docType) query.push(`docType=${encodeURIComponent(docType)}`);
		query.push(`limit=${limitStr}`);
		query.push(`page=${pageStr}`);
		return `?${query.join('&')}`;
	}

	function getExportUrl() {
		const query = [];
		if (searchQuery) query.push(`search=${encodeURIComponent(searchQuery)}`);
		if (startDate) query.push(`startDate=${encodeURIComponent(startDate)}`);
		if (endDate) query.push(`endDate=${encodeURIComponent(endDate)}`);
		if (docTypeFilter) query.push(`docType=${encodeURIComponent(docTypeFilter)}`);
		
		const basePath = $page.url.pathname.endsWith('/') ? $page.url.pathname.slice(0, -1) : $page.url.pathname;
		return `${basePath}/export?${query.join('&')}`;
	}

	function handleSearchInput(e?: Event) {
		if (e) e.preventDefault();
		const queryString = buildQueryString(
			searchQuery,
			startDate,
			endDate,
			docTypeFilter,
			data.limit.toString(),
			'1'
		);

		goto(queryString, {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	function changeLimit(newLimit: string) {
		const queryString = buildQueryString(
			searchQuery,
			startDate,
			endDate,
			docTypeFilter,
			newLimit,
			'1'
		);
		goto(queryString, {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	function formatDateOnly(dateVal: any) {
		if (!dateVal) return '-';
		try {
			const strVal = String(dateVal);
			if (strVal.startsWith('0000-00-00')) return '-';
			const dateObj = new Date(dateVal);
			if (isNaN(dateObj.getTime())) return '-';
			return dateObj.toLocaleDateString($locale === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'UTC' });
		} catch (e) {
			return '-';
		}
	}

	function formatCurrency(amount: any) {
		const num = Number(amount);
		if (isNaN(num)) return '0.00';
		return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
			docTypeFilter,
			data.limit.toString(),
			pageNum.toString()
		);
	}
</script>

<svelte:head>
	<title>{$t('Sales Detail Report')}</title>
</svelte:head>

<div class="mb-6 flex flex-col items-start justify-between gap-4 xl:flex-row xl:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Sales Detail Report')}</h1>
		<p class="mt-1 text-sm text-gray-500">
			{$t('รายงานรายละเอียดการขาย แยกตามรายการสินค้า (Item Details)')}
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<div class="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 shadow-sm">
			<div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="12" y1="1" x2="12" y2="23"></line>
					<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
				</svg>
			</div>
			<div>
				<p class="text-[10px] font-bold text-blue-600 uppercase">{$t('Net Total Value')}</p>
				<p class="text-lg leading-none font-bold text-gray-900">
					฿{formatCurrency(data.totalNet)}
				</p>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-xl border border-purple-100 bg-purple-50 px-4 py-2 shadow-sm">
			<div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 2v20"></path>
					<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
				</svg>
			</div>
			<div>
				<p class="text-[10px] font-bold text-purple-600 uppercase">{$t('Vatable Amt')}</p>
				<p class="text-lg leading-none font-bold text-gray-900">
					฿{formatCurrency(data.totalVatable)}
				</p>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 shadow-sm">
			<div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="10"></circle>
					<line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
				</svg>
			</div>
			<div>
				<p class="text-[10px] font-bold text-gray-600 uppercase">{$t('Non-VAT Amt')}</p>
				<p class="text-lg leading-none font-bold text-gray-900">
					฿{formatCurrency(data.totalNonVatable)}
				</p>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-2 shadow-sm">
			<div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M3 3v18h18"></path>
					<path d="m19 9-5 5-4-4-3 3"></path>
				</svg>
			</div>
			<div>
				<p class="text-[10px] font-bold text-red-600 uppercase">{$t('Total WHT')}</p>
				<p class="text-lg leading-none font-bold text-gray-900">
					฿{formatCurrency(data.totalWht)}
				</p>
			</div>
		</div>
	</div>
</div>

<div class="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
	<form method="GET" action={$page.url.pathname} onsubmit={handleSearchInput} class="flex flex-col gap-4 sm:flex-row sm:items-end">
		<input type="hidden" name="page" value="1" />
		<input type="hidden" name="limit" value={data.limit} />

		<div class="flex-1">
			<label for="search" class="mb-1 block text-xs font-semibold text-gray-700">{$t('Search')}</label>
			<div class="relative">
				<input
					type="search"
					name="search"
					id="search"
					bind:value={searchQuery}
					placeholder={$t('ค้นหาเลขเอกสาร, ชื่อลูกค้า, เลข Job, รายละเอียดสินค้า...')}
					class="w-full rounded-lg border-gray-300 py-2.5 pr-4 pl-10 text-sm focus:border-blue-500 focus:ring-blue-500"
				/>
				<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
					<svg class="h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
					</svg>
				</div>
			</div>
		</div>

		<div>
			<label for="docTypeFilter" class="mb-1 block text-xs font-semibold text-gray-700">{$t('Doc Type')}</label>
			<select
				id="docTypeFilter"
				bind:value={docTypeFilter}
				class="w-full rounded-lg border-gray-300 py-2.5 text-sm focus:border-blue-500 focus:ring-blue-500"
				style="min-width: 120px;"
			>
				<option value="">{$t('All')}</option>
				<option value="INV">Invoice (INV)</option>
				<option value="BN">Billing Note (BN)</option>
				<option value="QT">Quotation (QT)</option>
				<option value="RE">Receipt (RE)</option>
			</select>
		</div>

		<div>
			<label for="startDate" class="mb-1 block text-xs font-semibold text-gray-700">{$t('Date From')}</label>
			<input
				type="date"
				name="startDate"
				id="startDate"
				bind:value={startDate}
				class="w-full rounded-lg border-gray-300 py-2.5 text-sm focus:border-blue-500 focus:ring-blue-500"
			/>
		</div>

		<div>
			<label for="endDate" class="mb-1 block text-xs font-semibold text-gray-700">{$t('Date To')}</label>
			<input
				type="date"
				name="endDate"
				id="endDate"
				bind:value={endDate}
				class="w-full rounded-lg border-gray-300 py-2.5 text-sm focus:border-blue-500 focus:ring-blue-500"
			/>
		</div>

		<div class="flex w-full gap-2 sm:w-auto">
			<button
				type="submit"
				class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:flex-none"
				style="height: 42px;"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
				</svg>
				{$t('Search')}
			</button>

			<a
				href={getExportUrl()}
				target="_blank"
				class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 sm:flex-none"
				style="height: 42px;"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
	</form>
</div>

<!-- ตารางข้อมูล -->
<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold whitespace-nowrap text-gray-600">{$t('Doc Date')}</th>
				<th class="px-4 py-3 text-left font-semibold whitespace-nowrap text-gray-600">{$t('Doc No.')}</th>
				<th class="px-4 py-3 text-left font-semibold whitespace-nowrap text-gray-600">{$t('Customer')}</th>
				<th class="px-4 py-3 text-left font-semibold whitespace-nowrap text-gray-600">{$t('Job No.')}</th>
				<th class="px-4 py-3 text-left font-semibold whitespace-nowrap text-gray-600">{$t('Item Description')}</th>
				<th class="px-4 py-3 text-right font-semibold whitespace-nowrap text-gray-600">{$t('Qty')}</th>
				<th class="px-4 py-3 text-right font-semibold whitespace-nowrap text-gray-600">{$t('Unit Price')}</th>
				<th class="px-4 py-3 text-right font-semibold whitespace-nowrap text-gray-600">{$t('Total')}</th>
				<th class="px-4 py-3 text-center font-semibold whitespace-nowrap text-gray-600">{$t('VAT Status')}</th>
				<th class="px-4 py-3 text-right font-semibold whitespace-nowrap text-gray-600">{$t('Non-VAT Amt')}</th>
				<th class="px-4 py-3 text-right font-semibold whitespace-nowrap text-gray-600">{$t('Vatable Amt')}</th>
				<th class="px-4 py-3 text-right font-semibold whitespace-nowrap text-gray-600">{$t('VAT')}</th>
				<th class="px-4 py-3 text-right font-semibold whitespace-nowrap text-gray-600">{$t('WHT')}</th>
				<th class="px-4 py-3 text-right font-semibold whitespace-nowrap text-gray-600">{$t('Net Total')}</th>
				<th class="px-4 py-3 text-center font-semibold whitespace-nowrap text-gray-600">{$t('Status')}</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.sales.length === 0}
				<tr>
					<td colspan="15" class="py-12 text-center text-gray-500">
						{$t('ไม่พบข้อมูลรายการขายที่ตรงกับเงื่อนไขการค้นหา')}
					</td>
				</tr>
			{:else}
				{#each data.sales as item (item.item_id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 text-xs whitespace-nowrap text-gray-600">
							{formatDateOnly(item.document_date)}
						</td>
						<td class="px-4 py-3">
							<div class="flex flex-col">
								<span class="font-mono text-sm font-bold text-blue-700">{item.document_number || '-'}</span>
								<span class="text-[10px] text-gray-500">{item.document_type}</span>
							</div>
						</td>
						<td class="px-4 py-3 text-xs text-gray-800">
							<div class="max-w-[200px] truncate" title={item.customer_name}>
								{item.customer_name || '-'}
							</div>
						</td>
						<td class="px-4 py-3 font-mono text-xs text-gray-600">
							{item.job_number || '-'}
						</td>
						<td class="px-4 py-3 text-xs text-gray-800">
							<div class="max-w-[200px] truncate" title={item.description}>
								{item.description || '-'}
							</div>
						</td>
						<td class="px-4 py-3 text-right font-medium text-gray-700">
							{Number(item.quantity).toLocaleString()}
						</td>
						<td class="px-4 py-3 text-right font-medium text-gray-700">
							{formatCurrency(item.unit_price)}
						</td>
						<td class="px-4 py-3 text-right font-bold text-gray-900">
							{formatCurrency(item.line_total)}
						</td>
						
						<td class="px-4 py-3 text-center text-xs text-gray-600 whitespace-nowrap">
							{#if item.is_vat == 0}
								<span class="rounded bg-blue-50 px-2 py-0.5 text-blue-700">Exclude VAT</span>
							{:else if item.is_vat == 1}
								<span class="rounded bg-purple-50 px-2 py-0.5 text-purple-700">Include VAT</span>
							{:else}
								<span class="rounded bg-gray-100 px-2 py-0.5 text-gray-600">No VAT</span>
							{/if}
						</td>
						<td class="px-4 py-3 text-right font-medium text-gray-700">
							{formatCurrency(item.non_vatable_amt)}
						</td>
						<td class="px-4 py-3 text-right font-medium text-gray-700">
							{formatCurrency(item.vatable_amt)}
						</td>
						<td class="px-4 py-3 text-right font-medium text-gray-700">
							{formatCurrency(item.vat_amt)}
						</td>
						<td class="px-4 py-3 text-right font-medium text-red-600">
							{formatCurrency(item.wht_amt)}
						</td>
						<td class="px-4 py-3 text-right font-bold text-green-700">
							{formatCurrency(Number(item.vatable_amt) + Number(item.non_vatable_amt) + Number(item.vat_amt) - Number(item.wht_amt))}
						</td>

						<td class="px-4 py-3 text-center">
							<span
								class="rounded-full px-2 py-1 text-[11px] font-semibold whitespace-nowrap
            					{item.status === 'Paid' ? 'bg-green-100 text-green-800' 
								: item.status === 'Draft' ? 'bg-gray-100 text-gray-800' 
								: item.status === 'Sent' ? 'bg-blue-100 text-blue-800'
								: item.status === 'Overdue' ? 'bg-red-100 text-red-800'
								: 'bg-orange-100 text-orange-800'}"
							>
								{item.status || '-'}
							</span>
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
		
		<!-- Grand Total -->
		{#if data.sales.length > 0}
			<tfoot class="bg-blue-50/50 border-t-2 border-blue-200">
				<tr>
					<td colspan="7" class="px-4 py-4 text-right font-bold text-gray-800 uppercase text-sm">
						{$t('Grand Total')}
					</td>
					<td class="px-4 py-4 text-right font-bold text-blue-700 text-base">
						{formatCurrency(data.totalAmount)}
					</td>
					<td class="px-4 py-4"></td>
					<td class="px-4 py-4 text-right font-bold text-gray-800">
						{formatCurrency(data.totalNonVatable)}
					</td>
					<td class="px-4 py-4 text-right font-bold text-gray-800">
						{formatCurrency(data.totalVatable)}
					</td>
					<td class="px-4 py-4 text-right font-bold text-gray-800">
						{formatCurrency(data.totalVat)}
					</td>
					<td class="px-4 py-4 text-right font-bold text-red-600">
						{formatCurrency(data.totalWht)}
					</td>
					<td class="px-4 py-4 text-right font-bold text-green-700 text-base">
						{formatCurrency(data.totalNet)}
					</td>
					<td class="px-4 py-4"></td>
				</tr>
			</tfoot>
		{/if}
	</table>
</div>

<!-- ระบบแบ่งหน้า (Pagination) -->
{#if data.sales.length > 0 || data.searchQuery || data.startDate || data.endDate}
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
					<option value="100">100</option>
					<option value="200">200</option>
				</select>
				<span class="text-sm text-gray-700">{$t('entries')}</span>
			</div>

			{#if data.totalPages > 0}
				<p class="hidden text-sm text-gray-700 sm:block">
					{$t('Showing page')} <span class="font-medium">{data.currentPage}</span>
					{$t('of')} <span class="font-medium">{data.totalPages}</span>
					({$t('Total')} {data.totalCount} {$t('entries')})
				</p>
			{/if}
		</div>

		{#if data.totalPages > 1}
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
				<a
					href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'}
					class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage === 1 ? 'pointer-events-none opacity-50' : ''}"
				>
					<span class="sr-only">{$t('Previous')}</span>
					<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
					</svg>
				</a>
				{#each paginationRange as pageNum, index (index)}
					{#if typeof pageNum === 'string'}
						<span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 ring-inset">...</span>
					{:else}
						<a
							href={getPageUrl(pageNum)}
							class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum === data.currentPage ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600' : 'text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-50'}"
						>
							{pageNum}
						</a>
					{/if}
				{/each}
				<a
					href={data.currentPage < data.totalPages ? getPageUrl(data.currentPage + 1) : '#'}
					class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage === data.totalPages ? 'pointer-events-none opacity-50' : ''}"
				>
					<span class="sr-only">{$t('Next')}</span>
					<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
					</svg>
				</a>
			</nav>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
	</div>
{/if}