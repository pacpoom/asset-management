<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t, locale } from '$lib/i18n';

	export let data;

	$: advances = data.advances || [];
	$: pagination = data.pagination || {
		total: 0,
		page: 1,
		limit: 10,
		search: '',
		startDate: '',
		endDate: ''
	};

	let showDeleteModal = false;
	let advanceToDeleteId: number | null = null;
	let advanceToDeleteName: string = '';
	let isDeleting = false;

	let searchQuery = '';
	let itemsPerPage = 10;
	let currentPage = 1;
	let startDate = '';
	let endDate = '';

	// Sync ค่า State กับ Pagination
	$: {
		searchQuery = pagination.search || '';
		itemsPerPage = pagination.limit || 10;
		currentPage = pagination.page || 1;
		startDate = pagination.startDate || '';
		endDate = pagination.endDate || '';
	}

	$: totalPages = Math.ceil(pagination.total / itemsPerPage);

	function updateData() {
		const url = new URL($page.url);
		url.searchParams.set('page', currentPage.toString());
		url.searchParams.set('limit', itemsPerPage.toString());

		if (searchQuery) url.searchParams.set('search', searchQuery);
		else url.searchParams.delete('search');

		if (startDate) url.searchParams.set('startDate', startDate);
		else url.searchParams.delete('startDate');

		if (endDate) url.searchParams.set('endDate', endDate);
		else url.searchParams.delete('endDate');

		goto(url.toString(), { keepFocus: true, noScroll: true });
	}

	let searchTimeout: ReturnType<typeof setTimeout>;
	function onSearchInput() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			currentPage = 1;
			updateData();
		}, 400);
	}

	function onDateChange() {
		currentPage = 1;
		updateData();
	}

	function onLimitChange() {
		currentPage = 1;
		updateData();
	}

	function prevPage() {
		if (currentPage > 1) {
			currentPage--;
			updateData();
		}
	}

	function nextPage() {
		if (currentPage < totalPages) {
			currentPage++;
			updateData();
		}
	}

	function getStatusClass(status: string) {
		switch (status) {
			case 'Pending':
				return 'bg-yellow-100 text-yellow-800 border-yellow-200';
			case 'Approved':
				return 'bg-blue-100 text-blue-800 border-blue-200';
			case 'Completed':
				return 'bg-green-100 text-green-800 border-green-200';
			case 'Rejected':
				return 'bg-red-100 text-red-800 border-red-200';
			default:
				return 'bg-gray-100 text-gray-800 border-gray-200';
		}
	}

	function confirmDelete(adv: Record<string, unknown>) {
		advanceToDeleteId = adv.id as number;
		advanceToDeleteName = adv.document_number as string;
		showDeleteModal = true;
	}

	function closeModal() {
		showDeleteModal = false;
		advanceToDeleteId = null;
		advanceToDeleteName = '';
		isDeleting = false;
	}
</script>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">{$t('Advance Applications')}</h1>
			<p class="text-sm text-gray-500">{$t('Manage advance payments and requests')}</p>
		</div>

		<div class="flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:items-center">
			<!-- Date Filters -->
			<div class="flex w-full flex-col items-center gap-2 sm:flex-row lg:w-auto">
				<div class="relative w-full sm:w-auto">
					<input
						type="date"
						bind:value={startDate}
						onchange={onDateChange}
						class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
						title={$t('Start Date')}
					/>
				</div>
				<span class="hidden text-gray-400 sm:inline">-</span>
				<div class="relative w-full sm:w-auto">
					<input
						type="date"
						bind:value={endDate}
						onchange={onDateChange}
						class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
						title={$t('End Date')}
					/>
				</div>
			</div>

			<!-- Search -->
			<div class="relative w-full lg:w-64">
				<input
					type="text"
					bind:value={searchQuery}
					oninput={onSearchInput}
					placeholder={$t('Search Document, Bank...')}
					class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-9 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
				/>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="absolute top-2.5 left-3 h-4 w-4 text-gray-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
				</svg>
			</div>

			<!-- Buttons -->
			<div class="flex w-full gap-2 sm:w-auto">
				<!-- Export Button Placeholder (Can point to export API later) -->
				<button
					type="button"
					class="flex flex-1 flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white shadow transition-colors hover:bg-green-700 sm:w-auto sm:flex-none"
					onclick={() => alert($t('Export function coming soon!'))}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
					<span class="hidden sm:inline">{$t('Export')}</span>
				</button>

				<a
					href="/freight-forwarder/advance-control/create"
					class="flex flex-1 flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow transition-colors hover:bg-blue-700 sm:w-auto sm:flex-none"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
						<path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
					</svg>
					<span class="hidden sm:inline">{$t('New Advance')}</span>
					<span class="sm:hidden">{$t('New')}</span>
				</a>
			</div>
		</div>
	</div>

	<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50 text-gray-700">
					<tr>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase">
							{$t('Document No. / Date')}
						</th>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase">
							{$t('Title & Reason')}
						</th>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase">
							{$t('Transfer To')}
						</th>
						<th class="px-6 py-3 text-center text-xs font-semibold tracking-wider uppercase whitespace-nowrap">
							{$t('Status')}
						</th>
						<th class="px-6 py-3 text-right text-xs font-semibold tracking-wider uppercase whitespace-nowrap">
							{$t('Amount (THB)')}
						</th>
						<th class="px-6 py-3 text-center text-xs font-semibold tracking-wider uppercase">
							{$t('Action')}
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#each advances as adv (adv.id)}
						<tr class="hover:bg-gray-50">
							<!-- Document No & Date -->
							<td class="px-6 py-4 align-top">
								<a href="/freight-forwarder/advance-control/{adv.id}" class="font-bold text-blue-600 hover:underline">
									{adv.document_number}
								</a>
								<div class="mt-0.5 text-xs text-gray-500">
									{new Date(adv.document_date).toLocaleDateString($locale === 'th' ? 'th-TH' : 'en-US')}
								</div>
								{#if adv.created_by_name}
									<div class="mt-1 flex items-center text-[11px] text-gray-500" title={$t('Created By')}>
										<svg xmlns="http://www.w3.org/2000/svg" class="mr-1 h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
										</svg>
										<span class="max-w-[120px] truncate">{adv.created_by_name}</span>
									</div>
								{/if}
							</td>

							<!-- Title & Reason -->
							<td class="px-6 py-4 align-top">
								<div class="font-semibold text-gray-800">{adv.application_title}</div>
								<div class="mt-1 max-w-sm truncate text-xs text-gray-500" title={adv.reason}>
									{adv.reason}
								</div>
							</td>

							<!-- Transfer To (Bank) -->
							<td class="px-6 py-4 align-top">
								<div class="font-semibold text-gray-800">
									{adv.bank_name ? `[${adv.bank_code}] ${adv.bank_name}` : '-'}
								</div>
								<div class="mt-0.5 text-xs text-gray-500">
									{adv.account_number} ({adv.account_name})
								</div>
							</td>

							<!-- Status -->
							<td class="px-6 py-4 text-center align-top">
								<span class={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap ${getStatusClass(adv.status)}`}>
									{$t(`Status_${adv.status}`) || adv.status}
								</span>
							</td>

							<!-- Amount -->
							<td class="px-6 py-4 text-right align-top whitespace-nowrap">
								<div class="font-mono font-bold text-gray-800">
									{Number(adv.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
								</div>
							</td>

							<!-- Action -->
							<td class="px-4 py-4 text-center align-top">
								<div class="mt-1 flex justify-center gap-2">
									<a
										href="/freight-forwarder/advance-control/{adv.id}"
										class="text-gray-400 transition-colors hover:text-blue-600"
										title={$t('View Details')}
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
											<path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
											<path fill-rule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 8.142 1.987 10.336 5.404.347.526.347 1.186 0 1.712C18.142 14.013 14.257 16 10 16c-4.257 0-8.142-1.987-10.336-5.404zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
										</svg>
									</a>

									<a
										href="/freight-forwarder/advance-control/{adv.id}/edit"
										class="text-gray-400 transition-colors hover:text-yellow-600"
										title={$t('Edit')}
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
											<path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
										</svg>
									</a>

									<button
										type="button"
										onclick={() => confirmDelete(adv)}
										class="text-gray-400 transition-colors hover:text-red-600"
										title={$t('Delete')}
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
											<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
										</svg>
									</button>
								</div>
							</td>
						</tr>
					{/each}
					{#if advances.length === 0}
						<tr>
							<td colspan="6" class="py-12 text-center text-gray-500">
								<div class="flex flex-col items-center justify-center">
									<svg class="mb-3 h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
									</svg>
									<span>{$t('No Advance Applications found or search did not match any data')}</span>
								</div>
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>

		{#if pagination.total > 0}
			<div class="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-6">
				<div class="flex flex-1 flex-col items-center justify-between gap-4 sm:flex-row">
					<div class="flex items-center gap-3">
						<span class="text-sm text-gray-700">
							{$t('Showing')}
							<span class="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span>
							{$t('to')}
							<span class="font-medium">{Math.min(currentPage * itemsPerPage, pagination.total)}</span>
							{$t('of')} <span class="font-medium">{pagination.total}</span>
							{$t('entries')}
						</span>
						<select
							bind:value={itemsPerPage}
							onchange={onLimitChange}
							class="rounded-md border border-gray-300 bg-white py-1.5 pr-8 pl-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
						>
							<option value={10}>10 / {$t('Page')}</option>
							<option value={30}>30 / {$t('Page')}</option>
							<option value={50}>50 / {$t('Page')}</option>
						</select>
					</div>
					<div>
						<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
							<button
								onclick={prevPage}
								disabled={currentPage === 1}
								class="relative inline-flex items-center rounded-l-md px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-100 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:hover:bg-white"
							>
								{$t('Previous')}
							</button>
							<span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 ring-inset focus:outline-offset-0">
								{$t('Page')} {currentPage} / {totalPages}
							</span>
							<button
								onclick={nextPage}
								disabled={currentPage === totalPages || totalPages === 0}
								class="relative inline-flex items-center rounded-r-md px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-100 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:hover:bg-white"
							>
								{$t('Next')}
							</button>
						</nav>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

{#if showDeleteModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity">
		<div class="animate-in fade-in zoom-in-95 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl duration-200">
			<div class="p-6">
				<div class="flex items-start gap-4">
					<div class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:h-10 sm:w-10">
						<svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
					</div>
					<div class="mt-1 text-left sm:mt-0">
						<h3 class="text-lg leading-6 font-bold text-gray-900">{$t('Confirm Delete')}</h3>
						<div class="mt-2">
							<p class="text-sm text-gray-500">
								{$t('Are you sure you want to delete advance application')}
								<span class="font-bold text-gray-800">{advanceToDeleteName}</span>
								?
								<br />{$t('This action')}
								<span class="font-semibold text-red-600">{$t('cannot be undone')}</span>
							</p>
						</div>
					</div>
				</div>
			</div>

			<div class="flex justify-end gap-3 bg-gray-50 px-6 py-4 sm:flex-row">
				<button
					type="button"
					class="mt-3 inline-flex w-full justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 sm:mt-0 sm:w-auto"
					onclick={closeModal}
					disabled={isDeleting}
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
							closeModal();
						};
					}}
					class="m-0 flex w-full sm:w-auto"
				>
					<input type="hidden" name="id" value={advanceToDeleteId} />
					<button
						type="submit"
						class="inline-flex w-full justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-500 disabled:opacity-50 sm:w-auto"
						disabled={isDeleting}
					>
						{#if isDeleting}
							<svg class="mr-2 -ml-1 h-4 w-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
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