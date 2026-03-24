<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import { t, locale } from '$lib/i18n';
	import { onMount } from 'svelte';

	// อัปเดต Type ให้ครอบคลุมข้อมูลที่ส่งมาจาก Server เพื่อแก้ TypeScript Error
	export let data: PageData & { totalItems: number, fromDate: string, toDate: string, pageSize: number };
	
	$: ({ documents, currentPage, totalPages, totalItems, searchQuery, filterStatus, filterType, fromDate, toDate, pageSize } = data);

	let searchInput = searchQuery;
	let statusInput = filterStatus;
	let typeInput = filterType;
	let fromDateInput = fromDate;
	let toDateInput = toDate;
	let pageSizeInput = pageSize || 10;

	// ตั้งค่า Default Date เป็นเดือนปัจจุบัน (ถ้าไม่มีการส่งค่ามา)
	onMount(() => {
		if (!fromDateInput || !toDateInput) {
			const now = new Date();
			const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
			const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

			// ปรับเวลาให้เป็น Local TimeZone เพื่อป้องกันการเลื่อนวัน
			const offsetFirst = firstDay.getTimezoneOffset() * 60000;
			const offsetLast = lastDay.getTimezoneOffset() * 60000;
			
			if(!fromDateInput) fromDateInput = new Date(firstDay.getTime() - offsetFirst).toISOString().split('T')[0];
			if(!toDateInput) toDateInput = new Date(lastDay.getTime() - offsetLast).toISOString().split('T')[0];
			
			// Auto search if defaults were applied
			if(!fromDate && !toDate) applyFilters(); 
		}
	});

	let isDeleteModalOpen = false;
	let itemToDelete: any = null;
	let isDeleting = false;

	function openDeleteModal(item: any) {
		itemToDelete = item;
		isDeleteModalOpen = true;
	}

	function closeDeleteModal() {
		isDeleteModalOpen = false;
		itemToDelete = null;
	}

	function applyFilters(page = 1) {
		const params = new URLSearchParams();
		params.set('page', page.toString());
		params.set('pageSize', pageSizeInput.toString());
		if (searchInput) params.set('search', searchInput);
		if (statusInput) params.set('status', statusInput);
		if (typeInput) params.set('type', typeInput);
		if (fromDateInput) params.set('fromDate', fromDateInput);
		if (toDateInput) params.set('toDate', toDateInput);
		goto(`?${params.toString()}`);
	}

	function handleKeyPress(e: KeyboardEvent) {
		if (e.key === 'Enter') applyFilters();
	}

	function getExportUrl() {
		const params = new URLSearchParams();
		if (searchInput) params.set('search', searchInput);
		if (statusInput) params.set('status', statusInput);
		if (typeInput) params.set('type', typeInput);
		if (fromDateInput) params.set('fromDate', fromDateInput);
		if (toDateInput) params.set('toDate', toDateInput);
		return `/purchase-documents/export-excel?${params.toString()}`;
	}

	function getStatusClass(status: string) {
		switch (status) {
			case 'Draft': return 'bg-gray-100 text-gray-800';
			case 'Sent': return 'bg-blue-100 text-blue-800';
			case 'Received': return 'bg-indigo-100 text-indigo-800';
			case 'Paid': return 'bg-green-100 text-green-800';
			case 'Overdue': return 'bg-red-100 text-red-800';
			case 'Void': return 'bg-gray-300 text-gray-600';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	function getDocTypeName(type: string) {
		switch (type) {
			case 'PR': return 'Purchase Request (PR)';
			case 'PO': return 'Purchase Order (PO)';
			case 'GR': return 'Goods Receipt (GR)';
			case 'AP': return 'Account Payable (AP)';
			case 'PV': return 'Payment Voucher (PV)';
			default: return type;
		}
	}

	function getDocTypeColor(type: string) {
		switch (type) {
			case 'PR': return 'text-purple-600 bg-purple-50';
			case 'PO': return 'text-blue-600 bg-blue-50';
			case 'GR': return 'text-indigo-600 bg-indigo-50';
			case 'AP': return 'text-orange-600 bg-orange-50';
			case 'PV': return 'text-green-600 bg-green-50';
			default: return 'text-gray-600 bg-gray-50';
		}
	}

	$: currentLoc = $locale === 'th' ? 'th-TH' : 'en-US';

	$: formatCurrency = (amount: number) =>
		new Intl.NumberFormat(currentLoc, { style: 'currency', currency: 'THB' }).format(amount);

	$: formatDate = (dateStr: string) =>
		dateStr
			? new Date(dateStr).toLocaleDateString(currentLoc, {
					year: 'numeric',
					month: 'short',
					day: 'numeric'
				})
			: '-';
</script>

<svelte:head>
	<title>{$t('Purchase Documents Title')}</title>
</svelte:head>

<div class="mb-6 flex items-center justify-between">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Purchase Documents Header')}</h1>
		<p class="mt-1 text-sm text-gray-500">{$t('Purchase Documents Desc')}</p>
	</div>
	<a
		href="/purchase-documents/new"
		class="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
	>
		{$t('Create New Document')}
	</a>
</div>

<div class="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
	<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
		<div class="md:col-span-2">
			<label for="searchInput" class="mb-1 block text-xs font-semibold text-gray-500">{$t('Search')}</label>
			<input
				id="searchInput"
				type="search"
				bind:value={searchInput}
				on:keypress={handleKeyPress}
				placeholder={$t('Doc No, Vendor, Job Order...')}
				class="w-full rounded-lg border-gray-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
			/>
		</div>
		<div>
			<label for="typeInput" class="mb-1 block text-xs font-semibold text-gray-500">{$t('Type')}</label>
			<select
				id="typeInput"
				bind:value={typeInput}
				class="w-full rounded-lg border-gray-300 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
			>
				<option value="">{$t('All')}</option>
				<option value="PR">PR</option>
				<option value="PO">PO</option>
				<option value="GR">GR</option>
				<option value="AP">AP</option>
				<option value="PV">PV</option>
			</select>
		</div>
		<div>
			<label for="statusInput" class="mb-1 block text-xs font-semibold text-gray-500">{$t('Status')}</label>
			<select
				id="statusInput"
				bind:value={statusInput}
				class="w-full rounded-lg border-gray-300 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
			>
				<option value="">{$t('All')}</option>
				<option value="Draft">{$t('Status_Draft')}</option>
				<option value="Sent">{$t('Status_Sent')}</option>
				<option value="Received">{$t('Status_Received')}</option>
				<option value="Paid">{$t('Status_Paid')}</option>
				<option value="Overdue">{$t('Status_Overdue')}</option>
				<option value="Void">{$t('Status_Void')}</option>
			</select>
		</div>
	</div>

	<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4 lg:grid-cols-5">
		<div>
			<label for="fromDateInput" class="mb-1 block text-xs font-semibold text-gray-500">{$t('From Date')}</label>
			<input
				id="fromDateInput"
				type="date"
				bind:value={fromDateInput}
				class="w-full rounded-lg border-gray-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
			/>
		</div>
		<div>
			<label for="toDateInput" class="mb-1 block text-xs font-semibold text-gray-500">{$t('To Date')}</label>
			<input
				id="toDateInput"
				type="date"
				bind:value={toDateInput}
				class="w-full rounded-lg border-gray-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
			/>
		</div>
		<div class="flex items-end gap-2 md:col-span-2 lg:col-span-3">
			<button
				type="button"
				on:click={() => applyFilters(1)}
				class="rounded-lg bg-gray-800 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-900"
			>
				{$t('Search')}
			</button>
			<a
				href={getExportUrl()}
				target="_blank"
				class="flex items-center gap-2 rounded-lg border border-green-600 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 shadow-sm hover:bg-green-100"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
				Export Excel
			</a>
		</div>
	</div>
</div>

<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Type')}</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Document No.')}</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Job Order')}</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Date')}</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Vendor')}</th>
					<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('Total Amount')}</th>
					<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Created By')}</th>
					<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Status')}</th>
					<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Actions')}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#if documents.length === 0}
					<tr>
						<td colspan="9" class="py-8 text-center text-gray-500"
							>{$t('No purchase documents found')}</td
						>
					</tr>
				{:else}
					{#each documents as doc}
						<tr class="transition-colors hover:bg-gray-50">
							<td class="px-4 py-3">
								<span
									class="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium {getDocTypeColor(
										doc.document_type
									)} border-current opacity-80"
								>
									{$t(getDocTypeName(doc.document_type))}
								</span>
							</td>
							<td class="px-4 py-3 font-medium text-indigo-600">
								<a href="/purchase-documents/{doc.id}">{doc.document_number || '(Draft)'}</a>
							</td>
							<td class="px-4 py-3 text-gray-600">
								{#if doc.job_number}
									<span
										class="inline-flex items-center rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-500/10 ring-inset"
									>
										{doc.job_number}
									</span>
								{:else}
									<span class="text-gray-400">-</span>
								{/if}
							</td>
							<td class="px-4 py-3 whitespace-nowrap text-gray-600"
								>{formatDate(doc.document_date)}</td
							>
							<td class="px-4 py-3 font-medium text-gray-900">{doc.vendor_name}</td>
							<td class="px-4 py-3 text-right font-semibold text-gray-900"
								>{formatCurrency(doc.total_amount)}</td
							>
							<td class="px-4 py-3 text-center text-gray-600 text-xs">
								{doc.created_by_name || '-'}
							</td>
							<td class="px-4 py-3 text-center">
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusClass(
										doc.status
									)}"
								>
									{$t('Status_' + doc.status)}
								</span>
							</td>
							<td class="px-4 py-3 text-center">
								<div class="flex justify-center gap-2">
									<a
										href="/purchase-documents/{doc.id}"
										class="text-gray-400 transition-colors hover:text-indigo-600"
										title={$t('View Details')}
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5"><path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" /><path fill-rule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 8.142 1.987 10.336 5.404.347.526.347 1.186 0 1.712C18.142 14.013 14.257 16 10 16c-4.257 0-8.142-1.987-10.336-5.404zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" /></svg>
									</a>

									{#if doc.status !== 'Draft'}
										<a
											href="/purchase-documents/generate-pdf?id={doc.id}&lang={$locale}"
											target="_blank"
											rel="noopener noreferrer"
											class="text-gray-400 transition-colors hover:text-gray-600"
											title={$t('Print PDF')}
										>
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd" /></svg>
										</a>
									{:else}
										<span class="cursor-not-allowed text-gray-200" title={$t('Must save document before printing') || 'บันทึกเอกสารก่อนพิมพ์'}>
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd" /></svg>
										</span>
									{/if}
									<a
										href="/purchase-documents/{doc.id}/edit"
										class="text-gray-400 transition-colors hover:text-yellow-600"
										title={$t('Edit')}
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
									</a>
									<button
										type="button"
										on:click={() => openDeleteModal(doc)}
										class="text-gray-400 transition-colors hover:text-red-600"
										title={$t('Delete')}
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
									</button>
								</div>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>

	<!-- Pagination Controls -->
	<div class="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
		<div class="flex flex-1 justify-between sm:hidden">
			<button on:click={() => applyFilters(currentPage - 1)} disabled={currentPage === 1} class="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
				{$t('Previous')}
			</button>
			<button on:click={() => applyFilters(currentPage + 1)} disabled={currentPage >= totalPages} class="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
				{$t('Next')}
			</button>
		</div>
		<div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
			<div class="flex items-center gap-4">
				<p class="text-sm text-gray-700">
					{$t('Showing')}
					<span class="font-medium">{totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span>
					{$t('to')}
					<span class="font-medium">{Math.min(currentPage * pageSize, totalItems)}</span>
					{$t('of')}
					<span class="font-medium">{totalItems}</span>
					{$t('entries')}
				</p>
				<select
					bind:value={pageSizeInput}
					on:change={() => applyFilters(1)}
					class="rounded-md border-gray-300 py-1 pl-3 pr-8 text-sm focus:border-indigo-500 focus:ring-indigo-500"
				>
					<option value={10}>10 / {$t('Page')}</option>
					<option value={20}>20 / {$t('Page')}</option>
					<option value={50}>50 / {$t('Page')}</option>
					<option value={200}>200 / {$t('Page')}</option>
				</select>
			</div>
			<div>
				<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
					<button on:click={() => applyFilters(currentPage - 1)} disabled={currentPage === 1} class="relative inline-flex items-center rounded-l-md px-3 py-2 text-sm font-semibold text-gray-500 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
						{$t('Previous')}
					</button>
					
					<span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 bg-white pointer-events-none">
						{$t('Page')} {currentPage} / {Math.max(1, totalPages)}
					</span>

					<button on:click={() => applyFilters(currentPage + 1)} disabled={currentPage >= totalPages} class="relative inline-flex items-center rounded-r-md px-3 py-2 text-sm font-semibold text-gray-500 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
						{$t('Next')}
					</button>
				</nav>
			</div>
		</div>
	</div>
</div>

{#if isDeleteModalOpen}
	<div class="bg-opacity-75 fixed inset-0 z-50 flex items-center justify-center bg-gray-500 p-4 transition-opacity">
		<div class="w-full transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all sm:max-w-lg">
			<h3 class="mb-2 text-lg leading-6 font-medium text-gray-900">{$t('Confirm Delete')}</h3>
			<p class="text-sm text-gray-500">
				{$t('Are you sure you want to delete purchase document')}
				<strong>{itemToDelete?.document_number}</strong>?
			</p>
			<div class="mt-6 flex justify-end gap-3">
				<button type="button" on:click={closeDeleteModal} class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700">{$t('Cancel')}</button>
				<form method="POST" action="?/delete" use:enhance={() => {
						isDeleting = true;
						return async ({ update }) => {
							await update();
							isDeleting = false;
							closeDeleteModal();
						};
					}}>
					<input type="hidden" name="id" value={itemToDelete?.id} />
					<button type="submit" disabled={isDeleting} class="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50">{isDeleting ? $t('Deleting...') : $t('Confirm Delete')}</button>
				</form>
			</div>
		</div>
	</div>
{/if}