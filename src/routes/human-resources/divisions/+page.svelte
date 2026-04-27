<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import { slide, fade } from 'svelte/transition';

	let { data, form } = $props();

	let activeTab = $state<'division' | 'section' | 'position'>('division');

	// สถานะ Modal (อิงตามโค้ดเดิมของคุณ)
	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedItem = $state<any>(null);
	let itemToDelete = $state<any>(null);
	let isSaving = $state(false);
	let currentData = $derived(() => {
		if (activeTab === 'section') return data.sections || [];
		if (activeTab === 'position') return data.positions || [];
		return data.divisions || [];
	});

	function openModal(mode: 'add' | 'edit', item: any = null) {
		modalMode = mode;
		if (mode === 'edit') {
			selectedItem = {
				...item,
				name: item.division_name || item.section_name || item.position_name
			};
		} else {
			selectedItem = { name: '', description: '', status: 'Active' };
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
		}
	});
</script>

<svelte:head>
	<title>{$t('Master Data Management')}</title>
</svelte:head>

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<h1 class="text-2xl font-bold text-gray-800">{$t('Master Data Management')}</h1>
	<div class="flex items-center gap-3">
		{#if form?.message}
			<span class="text-sm font-semibold {form.success ? 'text-green-600' : 'text-red-600'}">
				{form.message}
			</span>
		{/if}
		<button
			onclick={() => openModal('add')}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500"
		>
			<span class="material-symbols-outlined text-[18px]">add</span>
			{$t('Add New')}
		</button>
	</div>
</div>

<div class="mb-6 flex border-b border-gray-200">
	<button
		onclick={() => (activeTab = 'division')}
		class="px-6 py-2 font-medium {activeTab === 'division'
			? 'border-b-2 border-blue-600 text-blue-600'
			: 'text-gray-500 hover:text-blue-500'}"
	>
		{$t('Divisions')}
	</button>
	<button
		onclick={() => (activeTab = 'section')}
		class="px-6 py-2 font-medium {activeTab === 'section'
			? 'border-b-2 border-blue-600 text-blue-600'
			: 'text-gray-500 hover:text-blue-500'}"
	>
		{$t('Sections')}
	</button>
	<button
		onclick={() => (activeTab = 'position')}
		class="px-6 py-2 font-medium {activeTab === 'position'
			? 'border-b-2 border-blue-600 text-blue-600'
			: 'text-gray-500 hover:text-blue-500'}"
	>
		{$t('Positions')}
	</button>
</div>

<div class="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
	<div class="overflow-x-auto">
		<table class="w-full text-left text-sm text-gray-600">
			<thead class="border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-700 uppercase">
				<tr>
					<th class="px-6 py-4">{$t('Name')}</th>
					<th class="px-6 py-4">{$t('Description')}</th>
					<th class="px-6 py-4 text-center">{$t('Status')}</th>
					<th class="px-6 py-4 text-center">{$t('Actions')}</th>
				</tr>
			</thead>
			<tbody>
				{#if currentData().length === 0}
					<tr
						><td colspan="4" class="px-6 py-10 text-center text-gray-500">{$t('No data found')}</td
						></tr
					>
				{/if}
				{#each currentData() as item}
					<tr class="border-b border-gray-50 transition-colors hover:bg-gray-50">
						<td class="px-6 py-4 font-bold text-gray-900">
							{item.division_name || item.section_name || item.position_name}
						</td>
						<td class="px-6 py-4 text-gray-500">{item.description || '-'}</td>
						<td class="px-6 py-4 text-center">
							<span
								class="rounded-full px-2.5 py-1 text-xs font-semibold {item.status === 'Active'
									? 'bg-green-100 text-green-700'
									: 'bg-red-100 text-red-700'}"
							>
								{item.status}
							</span>
						</td>
						<td class="px-6 py-4 text-center">
							<div class="flex items-center justify-center gap-2">
								<button
									onclick={() => openModal('edit', item)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
								>
									<span class="material-symbols-outlined text-[20px]">edit</span>
								</button>
								<button
									onclick={() => (itemToDelete = item)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
								>
									<span class="material-symbols-outlined text-[20px]">delete</span>
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

{#if modalMode && selectedItem}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div
			transition:slide={{ duration: 200 }}
			class="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl"
		>
			<div class="flex items-center justify-between border-b bg-gray-50 px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? $t('Add New') : $t('Edit')}
					{activeTab.toUpperCase()}
				</h2>
				<button onclick={closeModal} class="text-gray-400 hover:text-gray-600"
					><span class="material-symbols-outlined">close</span></button
				>
			</div>
			<div class="p-6">
				<form
					id="masterForm"
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
					<input type="hidden" name="id" value={selectedItem.id || ''} />
					<input type="hidden" name="tab" value={activeTab} />
					<div class="space-y-4">
						<div>
							<label for="name" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Name')}</label
							>
							<input
								name="name"
								type="text"
								bind:value={selectedItem.name}
								required
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>
						<div>
							<label for="description" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Description')}</label
							>
							<textarea
								name="description"
								bind:value={selectedItem.description}
								rows="3"
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							></textarea>
						</div>
						<div>
							<label for="status" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Status')}</label
							>
							<select
								name="status"
								bind:value={selectedItem.status}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							>
								<option value="Active">Active</option>
								<option value="Inactive">Inactive</option>
							</select>
						</div>
					</div>
				</form>
			</div>
			<div class="flex justify-end gap-3 border-t bg-gray-50 px-6 py-4">
				<button onclick={closeModal} class="rounded-md border px-4 py-2 text-sm"
					>{$t('Cancel')}</button
				>
				<button
					type="submit"
					form="masterForm"
					disabled={isSaving}
					class="rounded-md bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
				>
					{isSaving ? $t('Saving...') : $t('Save Changes')}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if itemToDelete}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl">
			<h3 class="text-lg font-bold">{$t('Confirm Delete')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				คุณต้องการลบ <strong
					>{itemToDelete.division_name ||
						itemToDelete.section_name ||
						itemToDelete.position_name}</strong
				> ใช่หรือไม่?
			</p>
			<form method="POST" action="?/delete" use:enhance class="mt-6 flex justify-center gap-3">
				<input type="hidden" name="id" value={itemToDelete.id} />
				<input type="hidden" name="tab" value={activeTab} />
				<button
					type="button"
					onclick={() => (itemToDelete = null)}
					class="w-full rounded-md border py-2 text-sm">{$t('Cancel')}</button
				>
				<button type="submit" class="w-full rounded-md bg-red-600 py-2 text-sm font-bold text-white"
					>{$t('Confirm')}</button
				>
			</form>
		</div>
	</div>
{/if}
