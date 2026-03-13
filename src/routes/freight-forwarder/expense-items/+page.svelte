<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';

	let { data, form } = $props<{ data: any; form: any }>();
	let items = $derived(data.items || []);
	let categories = $derived(data.categories || []);

	let isModalOpen = $state(false);
	let isSaving = $state(false);
	let modalMode = $state<'create' | 'edit'>('create');

	let showDeleteModal = $state(false);
	let itemToDeleteId = $state<string | number | null>(null);
	let itemToDeleteName = $state('');
	let isDeleting = $state(false);

	let formData = $state({
		id: '',
		expense_category_id: '',
		item_code: '',
		item_name: '',
		description: '',
		is_active: true
	});

	function openCreateModal() {
		modalMode = 'create';
		formData = {
			id: '',
			expense_category_id: '',
			item_code: '',
			item_name: '',
			description: '',
			is_active: true
		};
		isModalOpen = true;
	}

	function openEditModal(item: any) {
		modalMode = 'edit';
		formData = {
			id: item.id,
			expense_category_id: item.expense_category_id,
			item_code: item.item_code || '',
			item_name: item.item_name,
			description: item.description || '',
			is_active: item.is_active === 1
		};
		isModalOpen = true;
	}

	function closeModal() {
		isModalOpen = false;
	}

	function confirmDelete(item: any) {
		itemToDeleteId = item.id;
		itemToDeleteName = item.item_name;
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
		itemToDeleteId = null;
		itemToDeleteName = '';
		isDeleting = false;
	}
</script>

<div class="mx-auto max-w-6xl p-6">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">{$t('Expense Items')}</h1>
			<p class="text-sm text-gray-500">{$t('Manage Expense Sub-Items')}</p>
		</div>
		<button
			onclick={openCreateModal}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow-sm hover:bg-blue-700"
		>
			{$t('Add Item')}
		</button>
	</div>

	{#if form?.message}
		<div
			class="mb-4 rounded-lg p-4 {form?.success
				? 'bg-green-100 text-green-800'
				: 'bg-red-100 text-red-800'}"
		>
			{$t(form.message)}
		</div>
	{/if}

	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-gray-200">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase"
						>{$t('Item Code')}</th
					>
					<th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase"
						>{$t('Item Name')}</th
					>
					<th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase"
						>{$t('Category')}</th
					>
					<th class="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase"
						>{$t('Status')}</th
					>
					<th class="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase"
						>{$t('Actions')}</th
					>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200">
				{#each items as item}
					<tr class="hover:bg-gray-50">
						<td class="px-6 py-4 font-mono text-gray-600">{item.item_code || '-'}</td>
						<td class="px-6 py-4 font-bold text-gray-900">{item.item_name}</td>
						<td class="px-6 py-4">
							<span class="rounded border bg-gray-100 px-2 py-1 text-xs text-gray-700"
								>{item.category_name}</span
							>
						</td>
						<td class="px-6 py-4 text-center">
							<span
								class="rounded-full px-2 py-1 text-xs font-semibold {item.is_active
									? 'bg-green-100 text-green-800'
									: 'bg-gray-100 text-gray-800'}"
							>
								{item.is_active ? $t('Active') : $t('Inactive')}
							</span>
						</td>
						<td class="flex justify-end gap-2 px-6 py-4 text-right">
							<button
								onclick={() => openEditModal(item)}
								class="p-1 text-blue-600 hover:text-blue-800"
								title={$t('Edit')}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="h-5 w-5"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
									/>
								</svg>
							</button>

							<button
								type="button"
								onclick={() => confirmDelete(item)}
								class="p-1 text-red-600 hover:text-red-800"
								title={$t('Delete')}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="h-5 w-5"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
									/>
								</svg>
							</button>
						</td>
					</tr>
				{:else}
					<tr
						><td colspan="5" class="px-6 py-8 text-center text-gray-500"
							>{$t('No expense items found')}</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	</div>
</div>

{#if isModalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
		<div class="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
			<div class="border-b bg-gray-50 px-6 py-4">
				<h3 class="text-lg font-bold text-gray-800">
					{modalMode === 'create' ? $t('Add New Item') : $t('Edit Item')}
				</h3>
			</div>

			<form
				method="POST"
				action="?/{modalMode === 'edit' ? 'update' : 'create'}"
				use:enhance={() => {
					isSaving = true;
					return async ({ update, result }) => {
						await update();
						isSaving = false;
						if (result.type === 'success') closeModal();
					};
				}}
			>
				<div class="space-y-4 p-6">
					{#if modalMode === 'edit'}
						<input type="hidden" name="id" value={formData.id} />
					{/if}

					<div>
						<label for="expense_category_id" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('Category')} <span class="text-red-500">*</span></label
						>
						<select
							id="expense_category_id"
							name="expense_category_id"
							bind:value={formData.expense_category_id}
							required
							class="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
						>
							<option value="" disabled selected>{$t('Select category...')}</option>
							{#each categories as cat}
								<option value={cat.id}>{cat.category_name}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="item_code" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('Item Code')}</label
						>
						<input
							id="item_code"
							type="text"
							name="item_code"
							bind:value={formData.item_code}
							class="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
							placeholder={$t('Optional code')}
						/>
					</div>

					<div>
						<label for="item_name" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('Item Name')} <span class="text-red-500">*</span></label
						>
						<input
							id="item_name"
							type="text"
							name="item_name"
							bind:value={formData.item_name}
							required
							class="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
							placeholder={$t('e.g. ค่ารถหัวลาก')}
						/>
					</div>

					<div>
						<label for="item_description" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('Description')}</label
						>
						<textarea
							id="item_description"
							name="description"
							bind:value={formData.description}
							rows="2"
							class="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
							placeholder={$t('Additional description...')}
						></textarea>
					</div>

					{#if modalMode === 'edit'}
						<div class="mt-4 flex items-center gap-2">
							<input
								type="checkbox"
								id="is_active"
								name="is_active"
								value="true"
								checked={formData.is_active}
								class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							<label for="is_active" class="text-sm font-medium text-gray-700">{$t('Active')}</label
							>
						</div>
					{/if}
				</div>

				<div class="flex justify-end gap-3 border-t bg-gray-50 px-6 py-4">
					<button
						type="button"
						onclick={closeModal}
						class="rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
						>{$t('Cancel')}</button
					>
					<button
						type="submit"
						disabled={isSaving}
						class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
					>
						{isSaving ? $t('Saving...') : $t('Save Data')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if showDeleteModal}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity"
	>
		<div
			class="animate-in fade-in zoom-in-95 w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl duration-200"
		>
			<div class="flex items-start gap-4 border-b bg-red-50 px-6 py-5">
				<div
					class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100"
				>
					<svg
						class="h-6 w-6 text-red-600"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
				</div>
				<div>
					<h3 class="mt-1 text-lg font-bold text-red-800">{$t('Confirm Delete')}</h3>
				</div>
			</div>
			<div class="p-6">
				<p class="text-sm text-gray-600">
					{$t('Are you sure you want to delete item')}
					<span class="font-bold text-gray-900">{itemToDeleteName}</span>?
				</p>
				<p class="mt-2 text-xs font-semibold text-red-600">{$t('This action cannot be undone.')}</p>
			</div>

			<div class="flex justify-end gap-3 border-t bg-gray-50 px-6 py-4">
				<button
					type="button"
					onclick={closeDeleteModal}
					class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
					disabled={isDeleting}
				>
					{$t('Cancel')}
				</button>

				<form
					method="POST"
					action="?/delete"
					use:enhance={() => {
						isDeleting = true;
						return async ({ update, result }) => {
							await update();
							if (result.type === 'success') {
								closeDeleteModal();
							} else {
								isDeleting = false;
							}
						};
					}}
				>
					<input type="hidden" name="id" value={itemToDeleteId} />
					<button
						type="submit"
						class="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50"
						disabled={isDeleting}
					>
						{#if isDeleting}
							<svg
								class="mr-2 -ml-1 h-4 w-4 animate-spin text-white"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								><circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle><path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path></svg
							>
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
