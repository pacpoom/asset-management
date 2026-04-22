<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import { t, locale } from '$lib/i18n';

	export let data: PageData;
	$: ({ documents, currentPage, totalPages, totalItems, limit, searchQuery, filterStatus, filterType, dateFrom, dateTo } = data);

	let searchInput = searchQuery;
	let statusInput = filterStatus;
	let typeInput = filterType;
	let dateFromInput = dateFrom;
	let dateToInput = dateTo;
	let limitInput = limit || 10;

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

	function applyFilters(resetPage = true) {
		const params = new URLSearchParams();
		// หากกดค้นหาหรือเปลี่ยนจำนวนรายการให้รีเซ็ตกลับไปหน้า 1
		params.set('page', resetPage === true ? '1' : currentPage.toString());
		if (searchInput) params.set('search', searchInput);
		if (statusInput) params.set('status', statusInput);
		if (typeInput) params.set('type', typeInput);
		
		// กรณีที่ต้องการให้ผู้ใช้เคลียร์วันที่ได้ ให้ set ค่าว่างได้เลย
		params.set('dateFrom', dateFromInput || '');
		params.set('dateTo', dateToInput || '');
		
		params.set('limit', limitInput.toString());
		goto(`?${params.toString()}`);
	}

	function goToPage(page: number) {
		if (page >= 1 && page <= totalPages) {
			currentPage = page;
			applyFilters(false);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			applyFilters(true);
		}
	}

	function getStatusClass(status: string) {
		switch (status) {
			case 'Draft':
				return 'bg-gray-100 text-gray-800';
			case 'Sent':
				return 'bg-blue-100 text-blue-800';
			case 'Paid':
				return 'bg-green-100 text-green-800';
			case 'Overdue':
				return 'bg-red-100 text-red-800';
			case 'Void':
				return 'bg-gray-300 text-gray-600';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	function getDocTypeName(type: string) {
		switch (type) {
			case 'QT':
				return 'Quotation';
			case 'BN':
				return 'Billing Note';
			case 'D-INV':
				return 'Draft Invoice';
			case 'INV':
				return 'Invoice';
			case 'RE':
				return 'Receipt';
			default:
				return type;
		}
	}

	function getDocTypeColor(type: string) {
		switch (type) {
			case 'QT':
				return 'text-purple-600 bg-purple-50';
			case 'BN':
				return 'text-orange-600 bg-orange-50';
			case 'D-INV':
				return 'text-cyan-600 bg-cyan-50';
			case 'INV':
				return 'text-blue-600 bg-blue-50';
			case 'RE':
				return 'text-green-600 bg-green-50';
			default:
				return 'text-gray-600 bg-gray-50';
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
	<title>{$t('Sales Documents Title')}</title>
</svelte:head>

<div class="mb-6 flex items-center justify-between">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Sales Documents Title')}</h1>
		<p class="mt-1 text-sm text-gray-500">{$t('Sales Documents Desc')}</p>
	</div>
	<a
		href="/sales-documents/new"
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
	>
		{$t('Create New Document')}
	</a>
</div>

<div class="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
	<div class="grid grid-cols-1 gap-4 md:grid-cols-12 lg:grid-cols-12">
		<!-- Search -->
		<div class="md:col-span-4 lg:col-span-3">
			<label for="searchFilter" class="mb-1 block text-xs font-medium text-gray-500">{$t('Search')}</label>
			<input
				id="searchFilter"
				type="search"
				bind:value={searchInput}
				on:keydown={handleKeydown}
				placeholder={$t('Doc No, Customer, Ref')}
				class="w-full rounded-lg border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
			/>
		</div>
		
		<!-- From Date -->
		<div class="md:col-span-4 lg:col-span-2">
			<label for="dateFromFilter" class="mb-1 block text-xs font-medium text-gray-500">{$t('From Date')}</label>
			<input
				id="dateFromFilter"
				type="date"
				bind:value={dateFromInput}
				class="w-full rounded-lg border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
			/>
		</div>
		
		<!-- To Date -->
		<div class="md:col-span-4 lg:col-span-2">
			<label for="dateToFilter" class="mb-1 block text-xs font-medium text-gray-500">{$t('To Date')}</label>
			<input
				id="dateToFilter"
				type="date"
				bind:value={dateToInput}
				class="w-full rounded-lg border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
			/>
		</div>

		<!-- Type -->
		<div class="md:col-span-4 lg:col-span-2">
			<label for="typeFilter" class="mb-1 block text-xs font-medium text-gray-500">{$t('Type')}</label>
			<select
				id="typeFilter"
				bind:value={typeInput}
				class="w-full rounded-lg border-gray-300 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
			>
				<option value="">{$t('All Types')}</option>
				<option value="QT">{$t('Quotation (QT)')}</option>
				<option value="BN">{$t('Billing Note (BN)')}</option>
				<option value="D-INV">{$t('Draft Invoice (D-INV)')}</option>
				<option value="INV">{$t('Invoice (INV)')}</option>
				<option value="RE">{$t('Receipt (RE)')}</option>
			</select>
		</div>

		<!-- Status -->
		<div class="md:col-span-4 lg:col-span-2">
			<label for="statusFilter" class="mb-1 block text-xs font-medium text-gray-500">{$t('Status')}</label>
			<select
				id="statusFilter"
				bind:value={statusInput}
				class="w-full rounded-lg border-gray-300 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
			>
				<option value="">{$t('All Statuses')}</option>
				<option value="Draft">{$t('Status_Draft')}</option>
				<option value="Sent">{$t('Status_Sent')}</option>
				<option value="Paid">{$t('Status_Paid')}</option>
				<option value="Overdue">{$t('Status_Overdue')}</option>
				<option value="Void">{$t('Status_Void')}</option>
			</select>
		</div>

		<!-- Search Button -->
		<div class="md:col-span-4 lg:col-span-1 flex items-end justify-end">
			<button
				type="button"
				on:click={() => applyFilters(true)}
				class="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 h-[38px]"
			>
				{$t('Search')}
			</button>
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
					<th class="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{$t('Date')}</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Customer')}</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Other Ref')}</th>
					<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('Total Amount')}</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Created By')}</th>
					<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Status')}</th>
					<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Actions')}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#if documents.length === 0}
					<tr>
						<td colspan="9" class="py-8 text-center text-gray-500">{$t('No documents found')}</td>
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
							<td class="px-4 py-3 font-medium text-blue-600 whitespace-nowrap">
								<a href="/sales-documents/{doc.id}">{doc.document_number || '(Draft)'}</a>
							</td>
							<td class="px-4 py-3 whitespace-nowrap text-gray-600"
								>{formatDate(doc.document_date)}</td
							>
							<td class="px-4 py-3 font-medium text-gray-900">{doc.customer_name}</td>
							<td class="px-4 py-3 text-gray-600 max-w-[150px] truncate" title={doc.reference_doc}>{doc.reference_doc || '-'}</td>
							<td class="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap"
								>{formatCurrency(doc.total_amount)}</td
							>
							<td class="px-4 py-3 text-gray-600 whitespace-nowrap">{doc.created_by_name || '-'}</td>
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
										href="/sales-documents/{doc.id}"
										class="text-gray-400 transition-colors hover:text-blue-600"
										title={$t('View Details')}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="h-5 w-5"
										>
											<path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
											<path
												fill-rule="evenodd"
												d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 8.142 1.987 10.336 5.404.347.526.347 1.186 0 1.712C18.142 14.013 14.257 16 10 16c-4.257 0-8.142-1.987-10.336-5.404zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
												clip-rule="evenodd"
											/>
										</svg>
									</a>

									{#if doc.status !== 'Draft'}
										<a
											href="/sales-documents/generate-pdf?id={doc.id}&lang={$locale}"
											target="_blank"
											rel="noopener noreferrer"
											class="text-gray-400 transition-colors hover:text-gray-600"
											title={$t('Print PDF')}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 20 20"
												fill="currentColor"
												class="h-5 w-5"
											>
												<path
													fill-rule="evenodd"
													d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z"
													clip-rule="evenodd"
												/>
											</svg>
										</a>
									{:else}
										<span
											class="cursor-not-allowed text-gray-200"
											title={$t('Must save document before printing')}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 20 20"
												fill="currentColor"
												class="h-5 w-5"
											>
												<path
													fill-rule="evenodd"
													d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z"
													clip-rule="evenodd"
												/>
											</svg>
										</span>
									{/if}

									<a
										href="/sales-documents/{doc.id}/edit"
										class="text-gray-400 transition-colors hover:text-yellow-600"
										title={$t('Edit')}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="h-5 w-5"
										>
											<path
												d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
											/>
										</svg>
									</a>

									<button
										type="button"
										on:click={() => openDeleteModal(doc)}
										class="text-gray-400 transition-colors hover:text-red-600"
										title={$t('Delete')}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="h-5 w-5"
										>
											<path
												fill-rule="evenodd"
												d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
												clip-rule="evenodd"
											/>
										</svg>
									</button>
								</div>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>

	<!-- Pagination Footer -->
	{#if documents.length > 0}
	<div class="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
		<div class="flex flex-1 justify-between sm:hidden">
			<button type="button" on:click={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} class="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{$t('Previous')}</button>
			<button type="button" on:click={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} class="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{$t('Next')}</button>
		</div>
		
		<div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
			<div class="flex items-center gap-2">
				<span class="text-sm text-gray-700">{$t('Show')}</span>
				<select bind:value={limitInput} on:change={() => applyFilters(true)} class="rounded-md border-gray-300 py-1.5 text-sm focus:border-blue-500 focus:ring-blue-500">
					<option value={10}>10</option>
					<option value={30}>30</option>
					<option value={50}>50</option>
					<option value={200}>200</option>
				</select>
				<span class="text-sm text-gray-700">{$t('entries')}</span>
				<span class="ml-4 text-sm text-gray-700">{$t('Total')} <span class="font-medium">{totalItems}</span> {$t('records')}</span>
			</div>
			
			<div>
				<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
					<button type="button" on:click={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50">
						<span class="sr-only">{$t('Previous')}</span>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" /></svg>
					</button>
					<span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 focus:outline-offset-0">
						{$t('Page')} {currentPage} {$t('of')} {totalPages || 1}
					</span>
					<button type="button" on:click={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50">
						<span class="sr-only">{$t('Next')}</span>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" /></svg>
					</button>
				</nav>
			</div>
		</div>
	</div>
	{/if}
</div>

{#if isDeleteModalOpen}
	<div
		class="bg-opacity-75 fixed inset-0 z-50 flex items-center justify-center bg-gray-500 p-4 transition-opacity"
	>
		<div
			class="w-full transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all sm:max-w-lg"
		>
			<h3 class="mb-2 text-lg leading-6 font-medium text-gray-900">{$t('Confirm Delete')}</h3>
			<p class="text-sm text-gray-500">
				{$t('Are you sure you want to delete document')}
				<strong>{itemToDelete?.document_number}</strong>?
			</p>
			<div class="mt-6 flex justify-end gap-3">
				<button
					type="button"
					on:click={closeDeleteModal}
					class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700"
				>
					{$t('Cancel')}
				</button>
				<form
					method="POST"
					action="?/delete"
					use:enhance={() => {
						isDeleting = true;
						return async ({ update }) => {
							await update();
							isDeleting = false;
							closeDeleteModal();
						};
					}}
				>
					<input type="hidden" name="id" value={itemToDelete?.id} />
					<button
						type="submit"
						disabled={isDeleting}
						class="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
					>
						{#if isDeleting}
							{$t('Deleting...')}
						{:else}
							{$t('Confirm Delete')}
						{/if}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}