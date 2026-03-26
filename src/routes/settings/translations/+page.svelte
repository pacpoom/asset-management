<script lang="ts">
	import { enhance } from '$app/forms';
	import { slide, fade } from 'svelte/transition';
	import { t, loadTranslations } from '$lib/i18n';

	const { data, form } = $props<{ data: any; form: any }>();

	let translations = $derived(data.translations || []);
	let searchQuery = $state('');

	let currentPage = $state(1);
	let itemsPerPage = $state(50);

	$effect(() => {
		searchQuery;
		currentPage = 1;
	});

	let filteredTranslations = $derived(
		translations.filter((item: any) => {
			if (!searchQuery) return true;
			const query = searchQuery.toLowerCase();
			return (
				item.translation_key.toLowerCase().includes(query) ||
				(item.en_text && item.en_text.toLowerCase().includes(query)) ||
				(item.th_text && item.th_text.toLowerCase().includes(query))
			);
		})
	);

	let totalPages = $derived(Math.max(1, Math.ceil(filteredTranslations.length / itemsPerPage)));

	let paginatedTranslations = $derived(
		filteredTranslations.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
	);

	function changePage(page: number) {
		if (page >= 1 && page <= totalPages) {
			currentPage = page;
		}
	}

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedItem = $state<any>(null);
	let itemToDelete = $state<any>(null);
	let isSaving = $state(false);
	let isDeleting = $state(false);

	function openModal(mode: 'add' | 'edit', item: any = null) {
		modalMode = mode;
		if (mode === 'edit' && item) {
			selectedItem = { ...item };
		} else {
			selectedItem = { translation_key: '', en_text: '', th_text: '' };
		}
	}

	function closeModal() {
		modalMode = null;
		selectedItem = null;
	}

	$effect(() => {
		if (form?.success) {
			closeModal();
			itemToDelete = null;
			loadTranslations();
		}
	});
</script>

<svelte:head>
	<title>{$t('Translations Management')}</title>
</svelte:head>

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Translations Management')}</h1>
		<p class="mt-1 text-sm text-gray-500">
			{$t('Manage system language translations')}
		</p>
	</div>

	<div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
		<div class="relative w-full sm:w-64">
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<span class="material-symbols-outlined text-[18px] text-gray-400">search</span>
			</div>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder={$t('Search Key or Translation...')}
				class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-9 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
			/>
		</div>
		<button
			onclick={() => openModal('add')}
			class="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-sm transition-colors hover:bg-blue-700"
		>
			<span class="material-symbols-outlined text-[18px]">add</span>
			{$t('Add New Translation')}
		</button>
	</div>
</div>

{#if form?.message && !form?.success}
	<div
		class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm"
		transition:fade
	>
		<strong>{$t('Error')}:</strong>
		{form.message}
	</div>
{/if}
{#if form?.message && form?.success}
	<div
		class="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 shadow-sm"
		transition:fade
	>
		{form.message}
	</div>
{/if}

<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-6 py-3 text-left font-semibold tracking-wider text-gray-600 uppercase"
						>{$t('Key')}</th
					>
					<th class="px-6 py-3 text-left font-semibold tracking-wider text-gray-600 uppercase"
						>{$t('English')}</th
					>
					<th class="px-6 py-3 text-left font-semibold tracking-wider text-gray-600 uppercase"
						>{$t('Thai')}</th
					>
					<th
						class="px-6 py-3 text-center font-semibold tracking-wider whitespace-nowrap text-gray-600 uppercase"
						>{$t('Actions')}</th
					>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#each paginatedTranslations as item (item.id)}
					<tr class="transition-colors hover:bg-gray-50">
						<td class="px-6 py-4 font-mono text-xs font-bold text-blue-600"
							>{item.translation_key}</td
						>
						<td class="px-6 py-4 text-gray-800">{item.en_text || '-'}</td>
						<td class="px-6 py-4 text-gray-800">{item.th_text || '-'}</td>
						<td class="px-6 py-4 text-center whitespace-nowrap">
							<div class="flex items-center justify-center gap-2">
								<button
									onclick={() => openModal('edit', item)}
									class="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-yellow-600"
									title={$t('Edit')}
								>
									<span class="material-symbols-outlined block text-[20px]">edit</span>
								</button>
								<button
									onclick={() => (itemToDelete = item)}
									class="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600"
									title={$t('Delete')}
								>
									<span class="material-symbols-outlined block text-[20px]">delete</span>
								</button>
							</div>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="4" class="py-12 text-center text-gray-500"
							>{$t('No translation data found')}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if filteredTranslations.length > 0}
		<div
			class="flex flex-col items-center justify-between gap-4 border-t border-gray-200 bg-white px-6 py-3 sm:flex-row"
		>
			<div class="flex items-center gap-4 text-sm text-gray-700">
				<div class="flex items-center gap-2">
					<span>{$t('Items per page:')}</span>
					<select
						bind:value={itemsPerPage}
						onchange={() => (currentPage = 1)}
						class="rounded-md border-gray-300 py-1 pr-8 pl-3 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
					>
						<option value={50}>50</option>
						<option value={100}>100</option>
						<option value={200}>200</option>
						<option value={500}>500</option>
					</select>
				</div>
				<p class="hidden sm:block">
					{$t('Showing')} <span class="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span>
					{$t('to')}
					<span class="font-medium"
						>{Math.min(currentPage * itemsPerPage, filteredTranslations.length)}</span
					>
					{$t('of')} <span class="font-medium">{filteredTranslations.length}</span>
					{$t('entries')}
				</p>
			</div>

			<nav class="inline-flex items-center space-x-1 rounded-md shadow-sm" aria-label="Pagination">
				<button
					onclick={() => changePage(currentPage - 1)}
					disabled={currentPage === 1}
					class="relative inline-flex items-center rounded-l-md border border-gray-300 bg-white px-2 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-white"
				>
					<span class="sr-only">Previous</span>
					<span class="material-symbols-outlined text-[20px]">chevron_left</span>
				</button>

				<span
					class="relative inline-flex items-center border-t border-b border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700"
				>
					{$t('Page')}
					{currentPage} / {totalPages}
				</span>

				<button
					onclick={() => changePage(currentPage + 1)}
					disabled={currentPage === totalPages}
					class="relative inline-flex items-center rounded-r-md border border-gray-300 bg-white px-2 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-white"
				>
					<span class="sr-only">Next</span>
					<span class="material-symbols-outlined text-[20px]">chevron_right</span>
				</button>
			</nav>
		</div>
	{/if}
</div>

{#if modalMode && selectedItem}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div
			transition:slide={{ duration: 200 }}
			class="w-full max-w-lg rounded-xl bg-white shadow-2xl"
		>
			<div class="border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? $t('Add New Translation') : $t('Edit Translation')}
				</h2>
			</div>
			<form
				method="POST"
				action="?/save"
				use:enhance={() => {
					isSaving = true;
					return async ({ update }) => {
						await update();
						isSaving = false;
					};
				}}
			>
				<div class="space-y-4 p-6">
					{#if modalMode === 'edit'}
						<input type="hidden" name="id" value={selectedItem.id} />
					{/if}

					<div>
						<label for="translation_key" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('Key (for code reference)')} <span class="text-red-500">*</span></label
						>
						<input
							type="text"
							name="translation_key"
							id="translation_key"
							required
							bind:value={selectedItem.translation_key}
							readonly={modalMode === 'edit'}
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 {modalMode ===
							'edit'
								? 'bg-gray-100 text-gray-500'
								: ''}"
							placeholder="e.g., Dashboard, Save_Button"
						/>
						{#if modalMode === 'edit'}
							<p class="mt-1 text-xs text-red-500">
								{$t('* Cannot edit Key. To change, delete and recreate.')}
							</p>
						{/if}
					</div>

					<div>
						<label for="en_text" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('English Translation')}</label
						>
						<textarea
							name="en_text"
							id="en_text"
							rows="2"
							bind:value={selectedItem.en_text}
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							placeholder={$t('Enter english translation...')}
						></textarea>
					</div>

					<div>
						<label for="th_text" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('Thai Translation')}</label
						>
						<textarea
							name="th_text"
							id="th_text"
							rows="2"
							bind:value={selectedItem.th_text}
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							placeholder={$t('Enter thai translation...')}
						></textarea>
					</div>
				</div>
				<div class="flex justify-end gap-3 rounded-b-xl border-t bg-gray-50 px-6 py-4">
					<button
						type="button"
						onclick={closeModal}
						class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
					>
						{$t('Cancel')}
					</button>
					<button
						type="submit"
						disabled={isSaving}
						class="rounded-md bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-70"
					>
						{isSaving ? $t('Saving...') : $t('Save')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if itemToDelete}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl">
			<div
				class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600"
			>
				<span class="material-symbols-outlined text-[24px]">delete</span>
			</div>
			<h3 class="text-lg font-bold text-gray-900">{$t('Confirm Delete Translation')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				{$t('Are you sure you want to delete translation Key:')}
				<strong class="text-gray-900">"{itemToDelete.translation_key}"</strong>?
			</p>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					isDeleting = true;
					return async ({ update }) => {
						await update();
						isDeleting = false;
					};
				}}
				class="mt-6 flex justify-center gap-3"
			>
				<input type="hidden" name="id" value={itemToDelete.id} />
				<button
					type="button"
					onclick={() => (itemToDelete = null)}
					class="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
				>
					{$t('Cancel')}
				</button>
				<button
					type="submit"
					disabled={isDeleting}
					class="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-70"
				>
					{isDeleting ? $t('Deleting...') : $t('Delete')}
				</button>
			</form>
		</div>
	</div>
{/if}
