<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { fade } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { t, locale } from '$lib/i18n';

	export type BillingNoteHeader = PageData['billingNotes'][0];

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let searchQuery = $state(data.searchQuery ?? '');
	let filterCustomer = $state(data.filters?.customer ?? '');
	let filterStatus = $state(data.filters?.status ?? '');
	const billingNotes = $derived(data.billingNotes || []);

	let noteToDelete = $state<BillingNoteHeader | null>(null);
	let isDeleting = $state(false);

	let globalMessage = $state<{ text: string; type: 'success' | 'error' } | null>(null);
	let messageTimeout: NodeJS.Timeout;

	function showGlobalMessage(text: string, type: 'success' | 'error', duration = 5000) {
		clearTimeout(messageTimeout);
		globalMessage = { text, type };
		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, duration);
	}

	const paginationRange = $derived(() => {
		if (!data.totalPages || data.totalPages <= 1) return [];
		const delta = 1;
		const left = data.currentPage - delta;
		const right = data.currentPage + delta + 1;
		const range: number[] = [];
		const rangeWithDots: (number | string)[] = [];
		let l: number | undefined;
		for (let i = 1; i <= data.totalPages; i++)
			if (i == 1 || i == data.totalPages || (i >= left && i < right)) range.push(i);
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
		const params = new URLSearchParams();
		params.set('page', pageNum.toString());
		if (searchQuery) params.set('search', searchQuery);
		if (filterCustomer) params.set('customer', filterCustomer);
		if (filterStatus) params.set('status', filterStatus);
		return `/billing-notes?${params.toString()}`;
	}

	function applyFilters() {
		goto(getPageUrl(1));
	}

	const currentLoc = $derived($locale === 'th' ? 'th-TH' : $locale === 'zh' ? 'zh-CN' : 'en-US');

	function formatCurrency(val: number) {
		return new Intl.NumberFormat(currentLoc, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(val || 0);
	}

	function formatDateOnly(iso: string) {
		if (!iso) return '-';
		try {
			return new Date(iso).toLocaleDateString(currentLoc, {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return '-';
		}
	}

	function getStatusClass(s: string) {
		const m: any = {
			Draft: 'bg-gray-100 text-gray-800',
			Sent: 'bg-blue-100 text-blue-800',
			Paid: 'bg-green-100 text-green-800',
			Void: 'bg-red-100 text-red-800'
		};
		return m[s] || 'bg-yellow-100 text-yellow-800';
	}
</script>

<svelte:head>
	<title>{$t('Billing Notes Title')}</title>
</svelte:head>

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

<div class="mb-6 flex items-center justify-between">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Billing Notes Title')}</h1>
		<p class="mt-1 text-sm text-gray-500">{$t('Billing Notes Desc')}</p>
	</div>
	<a
		href="/billing-notes/create"
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			class="h-4 w-4"
		>
			<line x1="12" y1="5" x2="12" y2="19" />
			<line x1="5" y1="12" x2="19" y2="12" />
		</svg>
		{$t('Create Billing Note')}
	</a>
</div>

<div
	class="mb-4 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-4"
>
	<div class="relative">
		<input
			type="search"
			bind:value={searchQuery}
			placeholder={$t('Search Billing Note Placeholder')}
			class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 text-sm focus:border-blue-500 focus:ring-blue-500"
			onchange={applyFilters}
		/>
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<svg class="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
				<path
					fill-rule="evenodd"
					d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
					clip-rule="evenodd"
				/>
			</svg>
		</div>
	</div>
	<div>
		<select
			bind:value={filterCustomer}
			onchange={applyFilters}
			class="w-full rounded-lg border border-gray-300 p-2 text-sm shadow-sm"
		>
			<option value="">{$t('All Customers')}</option>
			{#each data.customers || [] as c}
				<option value={c.id}>{c.name}</option>
			{/each}
		</select>
	</div>
	<div>
		<select
			bind:value={filterStatus}
			onchange={applyFilters}
			class="w-full rounded-lg border border-gray-300 p-2 text-sm shadow-sm"
		>
			<option value="">{$t('All Statuses')}</option>
			<option value="Draft">{$t('Status_Draft')}</option>
			<option value="Sent">{$t('Status_Sent')}</option>
			<option value="Paid">{$t('Status_Paid')}</option>
			<option value="Void">{$t('Status_Void')}</option>
		</select>
	</div>
	<div class="flex items-center">
		<button
			type="button"
			onclick={applyFilters}
			class="w-full rounded-lg bg-blue-500 px-4 py-2 text-sm text-white shadow-sm hover:bg-blue-600"
			>{$t('Apply Filters')}</button
		>
	</div>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-center">{$t('ID')}</th>
				<th class="px-4 py-3 text-center">{$t('Document No.')}</th>
				<th class="px-4 py-3 text-center">{$t('Customer')}</th>
				<th class="px-4 py-3 text-center">{$t('Date')}</th>
				<th class="px-4 py-3 text-right">{$t('Net Total')}</th>
				<th class="px-4 py-3 text-center">{$t('Status')}</th>
				<th class="px-4 py-3 text-center">{$t('Actions')}</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if billingNotes.length === 0}
				<tr>
					<td colspan="7" class="py-12 text-center text-gray-500">
						{$t('No billing notes found')}
					</td>
				</tr>
			{:else}
				{#each billingNotes as note}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 text-center text-gray-700">#{note.id}</td>
						<td class="px-4 py-3 text-center font-medium">{note.billing_note_number}</td>
						<td class="px-4 py-3 text-center">{note.customer_name}</td>
						<td class="px-4 py-3 text-center">{formatDateOnly(note.billing_date)}</td>
						<td class="px-4 py-3 text-right font-semibold text-green-700"
							>{formatCurrency(note.total_amount)}</td
						>
						<td class="px-4 py-3 text-center">
							<span
								class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {getStatusClass(
									note.status
								)}"
							>
								{$t('Status_' + note.status)}
							</span>
						</td>
						<td class="px-4 py-3 text-center">
							<div class="flex justify-center gap-2">
								<a
									href="/billing-notes/{note.id}"
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
									aria-label={$t('View Details')}
									title={$t('View Details')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle
											cx="12"
											cy="12"
											r="3"
										/></svg
									>
								</a>
								<a
									href="/billing-notes/generate-pdf?id={note.id}"
									target="_blank"
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-purple-600"
									aria-label={$t('Print PDF')}
									title={$t('Print PDF')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path
											d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
										/><path d="M6 14h12v8H6z" /></svg
									>
								</a>
								<a
									href="/billing-notes/{note.id}/edit"
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-orange-600"
									aria-label={$t('Edit')}
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
										stroke-linecap="round"
										stroke-linejoin="round"
										><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg
									>
								</a>
								<button
									onclick={() => (noteToDelete = note)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
									aria-label={$t('Delete')}
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
										stroke-linecap="round"
										stroke-linejoin="round"
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

{#if data.totalPages > 1}
	<div class="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
		<div>
			<p class="text-sm text-gray-700">
				{$t('Showing page')}
				{data.currentPage}
				{$t('of')}
				{data.totalPages}
			</p>
		</div>
		<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm">
			<a
				href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'}
				class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage ===
				1
					? 'pointer-events-none opacity-50'
					: ''}">&lt;</a
			>
			{#each paginationRange() as pageNum}
				{#if typeof pageNum === 'string'}
					<span class="px-4 py-2 text-sm text-gray-700 ring-1 ring-gray-300">...</span>
				{:else}
					<a
						href={getPageUrl(pageNum as number)}
						class="px-4 py-2 text-sm font-semibold {pageNum === data.currentPage
							? 'bg-blue-600 text-white'
							: 'text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50'}">{pageNum}</a
					>
				{/if}
			{/each}
			<a
				href={data.currentPage < data.totalPages ? getPageUrl(data.currentPage + 1) : '#'}
				class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage ===
				data.totalPages
					? 'pointer-events-none opacity-50'
					: ''}">&gt;</a
			>
		</nav>
	</div>
{/if}

{#if noteToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">{$t('Confirm Delete')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				{$t('Are you sure you want to delete billing note')} #{noteToDelete.billing_note_number}?
			</p>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					isDeleting = true;
					return async ({ update, result }) => {
						await update();
						isDeleting = false;

						if (result.type === 'success') {
							showGlobalMessage('ลบข้อมูลเรียบร้อยแล้ว', 'success');
							noteToDelete = null;
						} else if (result.type === 'failure') {
							showGlobalMessage(
								(result.data?.message as string) || 'เกิดข้อผิดพลาดในการลบ',
								'error'
							);
						}
					};
				}}
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="id" value={noteToDelete.id} />
				<button
					type="button"
					onclick={() => (noteToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm">{$t('Cancel')}</button
				>
				<button
					type="submit"
					disabled={isDeleting}
					class="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:bg-red-400"
					>{$t('Delete')}</button
				>
			</form>
		</div>
	</div>
{/if}
