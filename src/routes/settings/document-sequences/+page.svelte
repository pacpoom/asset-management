<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { t } from '$lib/i18n';

	export let data: PageData;
	export let form: ActionData;
	$: ({ sequences } = data);

	let isModalOpen = false;
	let isSaving = false;
	let modalMode: 'create' | 'edit' = 'create';

	let formData = {
		id: '',
		document_type: 'INV',
		prefix: 'INV-',
		year: new Date().getFullYear(),
		month: new Date().getMonth() + 1,
		last_number: 0,
		padding_length: 4
	};

	let isDeleteModalOpen = false;
	let itemToDelete: any = null;
	let isDeleting = false;

	function openCreateModal() {
		modalMode = 'create';
		formData = {
			id: '',
			document_type: 'INV',
			prefix: 'INV-',
			year: new Date().getFullYear(),
			month: new Date().getMonth() + 1,
			last_number: 0,
			padding_length: 4
		};
		isModalOpen = true;
	}

	function openEditModal(item: any) {
		modalMode = 'edit';
		formData = { ...item };
		formData.year = new Date().getFullYear();
		formData.month = new Date().getMonth() + 1;
		isModalOpen = true;
	}

	function closeModal() {
		isModalOpen = false;
		if (form?.message) form.message = '';
	}

	function openDeleteModal(item: any) {
		itemToDelete = item;
		isDeleteModalOpen = true;
	}

	function closeDeleteModal() {
		isDeleteModalOpen = false;
		itemToDelete = null;
	}

	function getDocTypeKey(type: string) {
		switch (type) {
			case 'QT':
				return 'Quotation';
			case 'BN':
				return 'Billing Note';
			case 'INV':
				return 'Invoice';
			case 'RE':
				return 'Receipt';
			case 'JOB':
				return 'Transport Job Order';
			case 'AP':
				return 'Accounts Payable';
			case 'GR':
				return 'Goods Receipt';
			case 'PO':
				return 'Purchase Order';
			case 'PR':
				return 'Purchase Request';
			case 'PV':
				return 'Payment Voucher';
			default:
				return type;
		}
	}

	function getDocTypeColor(type: string) {
		switch (type) {
			case 'QT':
				return 'text-purple-700 bg-purple-100 border-purple-200';
			case 'BN':
				return 'text-orange-700 bg-orange-100 border-orange-200';
			case 'INV':
				return 'text-blue-700 bg-blue-100 border-blue-200';
			case 'RE':
				return 'text-green-700 bg-green-100 border-green-200';
			default:
				return 'text-gray-700 bg-gray-100 border-gray-200';
		}
	}

	function handleDocTypeChange() {
		if (modalMode === 'create') {
			formData.prefix = formData.document_type + '-';
		}
	}
</script>

<svelte:head>
	<title>{$t('Document Sequences Settings')}</title>
</svelte:head>

<div class="mx-auto max-w-7xl">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">{$t('Document Sequences Management')}</h1>
			<p class="mt-1 text-sm text-gray-500">
				{$t('Set prefix format and current running number')}
			</p>
		</div>
		<button
			type="button"
			on:click={openCreateModal}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
		>
			{$t('Add New Sequence')}
		</button>
	</div>

	<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Document Type')}</th>
						<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Year / Month')}</th>
						<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Prefix')}</th>
						<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Padding Length')}</th
						>
						<th class="px-4 py-3 text-center font-semibold text-blue-600"
							>{$t('Last Used Number')}</th
						>
						<th class="px-4 py-3 text-center font-semibold text-gray-600"
							>{$t('Next Document Example')}</th
						>
						<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Actions')}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#if sequences.length === 0}
						<tr>
							<td colspan="7" class="py-8 text-center text-gray-500">
								{$t('No sequence settings found')}
							</td>
						</tr>
					{:else}
						{#each sequences as seq}
							{@const nextNumStr = String(seq.last_number + 1).padStart(seq.padding_length, '0')}
							{@const monthStr = String(seq.month).padStart(2, '0')}
							{@const currentYY = String(new Date().getFullYear()).slice(-2)}
							{@const currentMM = String(new Date().getMonth() + 1).padStart(2, '0')}

							<tr class="transition-colors hover:bg-gray-50">
								<td class="px-4 py-3">
									<span
										class="inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold {getDocTypeColor(
											seq.document_type
										)}"
									>
										{$t(getDocTypeKey(seq.document_type))} ({seq.document_type})
									</span>
								</td>
								<td class="px-4 py-3 text-center font-medium text-gray-700">
									{new Date().getFullYear()} / {String(new Date().getMonth() + 1).padStart(2, '0')}
								</td>
								<td class="px-4 py-3 text-center">
									<span class="rounded bg-gray-50 px-2 py-1 font-mono text-gray-600">
										{#if seq.document_type === 'JOB'}
											{$t('[Job Code]')}
										{:else}
											{seq.prefix}
										{/if}
									</span>
								</td>
								<td class="px-4 py-3 text-center text-gray-600">{seq.padding_length}</td>
								<td class="px-4 py-3 text-center text-base font-bold text-blue-600"
									>{seq.last_number}</td
								>
								<td class="px-4 py-3 text-center font-mono text-gray-500">
									{#if seq.document_type === 'JOB'}
										{$t('[Job Code]')}{currentYY}{currentMM}{nextNumStr}
									{:else}
										{seq.prefix}{new Date().getFullYear()}{currentMM}-{nextNumStr}
									{/if}
								</td>
								<td class="px-4 py-3 text-center">
									<div class="flex justify-center gap-2">
										<button
											type="button"
											on:click={() => openEditModal(seq)}
											class="text-gray-400 transition-colors hover:text-yellow-600"
											title={$t('Edit')}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 20 20"
												fill="currentColor"
												class="h-5 w-5"
												><path
													d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
												/></svg
											>
										</button>
										<button
											type="button"
											on:click={() => openDeleteModal(seq)}
											class="text-gray-400 transition-colors hover:text-red-600"
											title={$t('Delete')}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 20 20"
												fill="currentColor"
												class="h-5 w-5"
												><path
													fill-rule="evenodd"
													d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
													clip-rule="evenodd"
												/></svg
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
	</div>
</div>

{#if isModalOpen}
	<div
		class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-gray-900 p-4 transition-opacity"
	>
		<div
			class="w-full transform overflow-hidden rounded-lg bg-white shadow-xl transition-all sm:max-w-md"
		>
			<div class="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-4">
				<h3 class="text-lg font-bold text-gray-900">
					{modalMode === 'create' ? $t('Add Document Sequence') : $t('Edit Document Sequence')}
				</h3>
				<button
					type="button"
					on:click={closeModal}
					class="text-xl font-bold text-gray-400 hover:text-gray-600">&times;</button
				>
			</div>

			<form
				method="POST"
				action="?/save"
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
					{#if form?.message}
						<div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
							{form.message}
						</div>
					{/if}

					<input type="hidden" name="id" value={formData.id} />

					<div>
						<label for="document_type" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Document Type')}</label
						>
						<select
							id="document_type"
							name="document_type"
							bind:value={formData.document_type}
							on:change={handleDocTypeChange}
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							disabled={modalMode === 'edit'}
						>
							<option value="QT">{$t('Quotation (QT)')}</option>
							<option value="BN">{$t('Billing Note (BN)')}</option>
							<option value="INV">{$t('Invoice (INV)')}</option>
							<option value="RE">{$t('Receipt (RE)')}</option>
							<option value="JOB">{$t('Transport Job Order (JOB)')}</option>
							<option value="AP">{$t('Accounts Payable (AP)')}</option>
							<option value="GR">{$t('Goods Receipt (GR)')}</option>
							<option value="PO">{$t('Purchase Order (PO)')}</option>
							<option value="PR">{$t('Purchase Request (PR)')}</option>
							<option value="PV">{$t('Payment Voucher (PV)')}</option>
						</select>
						{#if modalMode === 'edit'}
							<input type="hidden" name="document_type" value={formData.document_type} />
							<p class="mt-1 text-xs text-gray-500">
								{$t('Cannot change document type during edit')}
							</p>
						{/if}
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="year" class="mb-1 block text-sm font-medium text-gray-700"
								>{$t('Year (YYYY)')}</label
							>
							<input
								id="year"
								type="number"
								name="year"
								bind:value={formData.year}
								required
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								disabled={modalMode === 'edit'}
							/>
							{#if modalMode === 'edit'}<input
									type="hidden"
									name="year"
									value={formData.year}
								/>{/if}
						</div>
						<div>
							<label for="month" class="mb-1 block text-sm font-medium text-gray-700"
								>{$t('Month (1-12)')}</label
							>
							<input
								id="month"
								type="number"
								name="month"
								bind:value={formData.month}
								min="1"
								max="12"
								required
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								disabled={modalMode === 'edit'}
							/>
							{#if modalMode === 'edit'}<input
									type="hidden"
									name="month"
									value={formData.month}
								/>{/if}
						</div>
					</div>

					<div>
						<label for="prefix" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Prefix')}</label
						>
						{#if formData.document_type === 'JOB'}
							<input
								id="prefix"
								type="text"
								value={$t('[Auto-changes based on SI, SE, etc.]')}
								disabled
								class="w-full rounded-md border-gray-300 bg-gray-100 font-mono text-gray-500 shadow-sm"
							/>
							<input type="hidden" name="prefix" value="-" />
						{:else}
							<input
								id="prefix"
								type="text"
								name="prefix"
								bind:value={formData.prefix}
								required
								class="w-full rounded-md border-gray-300 font-mono shadow-sm focus:border-blue-500 focus:ring-blue-500"
								placeholder={$t('e.g., INV-')}
							/>
						{/if}
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="last_number" class="mb-1 block text-sm font-medium text-blue-700"
								>{$t('Last Used Number')} <span class="text-red-500">*</span></label
							>
							<input
								id="last_number"
								type="number"
								name="last_number"
								bind:value={formData.last_number}
								min="0"
								required
								class="w-full rounded-md border-blue-300 bg-blue-50 font-bold text-blue-700 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
							<p class="mt-1 text-[10px] text-gray-500">{$t('Set to 0 to start at 1')}</p>
						</div>
						<div>
							<label for="padding_length" class="mb-1 block text-sm font-medium text-gray-700"
								>{$t('Padding Length')}</label
							>
							<input
								id="padding_length"
								type="number"
								name="padding_length"
								bind:value={formData.padding_length}
								min="3"
								max="10"
								required
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>
					</div>

					<div class="rounded border border-gray-200 bg-gray-50 p-3 text-center text-sm">
						{$t('Next Document Example:')} <br />
						<strong class="font-mono text-lg text-gray-800">
							{#if formData.document_type === 'JOB'}
								{@const curYY = String(new Date().getFullYear()).slice(-2)}
								{@const curMM = String(new Date().getMonth() + 1).padStart(2, '0')}
								{$t('[Job Code]')}{curYY}{curMM}{String(Number(formData.last_number) + 1).padStart(
									Number(formData.padding_length),
									'0'
								)}
							{:else}
								{formData.prefix}{formData.year}{String(formData.month).padStart(2, '0')}-{String(
									Number(formData.last_number) + 1
								).padStart(Number(formData.padding_length), '0')}
							{/if}
						</strong>
					</div>
				</div>

				<div class="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
					<button
						type="button"
						on:click={closeModal}
						class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						>{$t('Cancel')}</button
					>
					<button
						type="submit"
						disabled={isSaving}
						class="rounded-md bg-blue-600 px-6 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
					>
						{isSaving ? $t('Saving...') : $t('Save Data')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if isDeleteModalOpen}
	<div
		class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-gray-900 p-4 transition-opacity"
	>
		<div
			class="w-full transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all sm:max-w-lg"
		>
			<h3 class="mb-2 text-lg font-medium text-gray-900">{$t('Confirm Deletion')}</h3>
			<p class="text-sm text-gray-500">
				{$t('Are you sure you want to delete the sequence setting for')}
				<strong class="text-gray-800"
					>{$t(getDocTypeKey(itemToDelete?.document_type))} ({$t('Month')}
					{itemToDelete?.month}/{itemToDelete?.year})</strong
				>? <br />
				<span class="text-xs text-red-500"
					>{$t(
						'*Deletion does not affect issued documents, but new documents this month might restart from 1.'
					)}</span
				>
			</p>
			<div class="mt-6 flex justify-end gap-3">
				<button
					type="button"
					on:click={closeDeleteModal}
					class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
					>{$t('Cancel')}</button
				>
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
					<input type="hidden" name="id" value={itemToDelete?.id || ''} />
					<button
						type="submit"
						disabled={isDeleting}
						class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
					>
						{isDeleting ? $t('Deleting...') : $t('Delete')}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
