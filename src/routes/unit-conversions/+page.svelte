<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n';

	interface UnitConversion {
		id: number;
		from_unit_id: number;
		from_unit_name: string;
		from_unit_symbol: string;
		to_unit_id: number;
		to_unit_name: string;
		to_unit_symbol: string;
		conversion_factor: number;
	}

	interface Unit {
		id: number;
		name: string;
		symbol: string;
	}

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedConversion = $state<Partial<UnitConversion> | null>(null);
	let conversionToDelete = $state<UnitConversion | null>(null);
	let isSaving = $state(false);
	let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(
		null
	);
	let messageTimeout: NodeJS.Timeout;

	const availableFromUnits = $derived(data.units as Unit[]);
	const availableToUnits = $derived(
		(data.units as Unit[]).filter((u: Unit) => u.id !== selectedConversion?.from_unit_id)
	);

	function openModal(mode: 'add' | 'edit', conversion: UnitConversion | null = null) {
		modalMode = mode;
		globalMessage = null;
		if (mode === 'edit' && conversion) {
			selectedConversion = { ...conversion };
		} else {
			selectedConversion = {
				from_unit_id: undefined,
				to_unit_id: undefined,
				conversion_factor: undefined
			} as any;
		}
	}

	function closeModal() {
		modalMode = null;
		selectedConversion = null;
	}

	function showGlobalMessage(
		message: { success: boolean; text: string; type: 'success' | 'error' },
		duration: number = 5000
	) {
		clearTimeout(messageTimeout);
		globalMessage = message;
		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, duration);
	}

	$effect.pre(() => {
		if (form?.action === 'saveConversion') {
			if (form.success) {
				closeModal();
				showGlobalMessage({
					success: true,
					text: (form.message as string) ?? 'Success',
					type: 'success'
				});
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage({
					success: false,
					text: (form.message as string) ?? 'Error',
					type: 'error'
				});
			}
			(form as any).action = undefined;
		}

		if (form?.action === 'deleteConversion') {
			if (form.success) {
				showGlobalMessage({
					success: true,
					text: (form.message as string) ?? 'Success',
					type: 'success'
				});
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage({
					success: false,
					text: (form.message as string) ?? 'Error',
					type: 'error'
				});
			}
			conversionToDelete = null;
			(form as any).action = undefined;
		}
	});

	$effect(() => {
		if (modalMode && selectedConversion && selectedConversion.from_unit_id) {
			if (selectedConversion.to_unit_id === selectedConversion.from_unit_id) {
				selectedConversion.to_unit_id = undefined;
			}
		}
	});
</script>

<svelte:head>
	<title>{$t('Unit Conversions')}</title>
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

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Unit Conversions')}</h1>
		<p class="mt-1 text-sm text-gray-500">{$t('Manage unit conversion rates')}</p>
	</div>
	<button
		onclick={() => openModal('add')}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			class="h-4 w-4"
			><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg
		>
		{$t('Add New Conversion')}
	</button>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('From Unit')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('To Unit')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Conversion Factor')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Formula')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Actions')}</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.conversions.length === 0}
				<tr>
					<td colspan="5" class="py-12 text-center text-gray-500">
						{$t('No conversion data found')}
					</td>
				</tr>
			{:else}
				{#each data.conversions as conv (conv.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 font-medium text-gray-900"
							>{conv.from_unit_name}
							<span class="text-xs text-gray-500">({conv.from_unit_symbol})</span></td
						>
						<td class="px-4 py-3 font-medium text-gray-900"
							>{conv.to_unit_name}
							<span class="text-xs text-gray-500">({conv.to_unit_symbol})</span></td
						>
						<td class="px-4 py-3 text-gray-700">{conv.conversion_factor}</td>
						<td class="px-4 py-3 text-xs text-gray-500 italic">
							1 {conv.from_unit_symbol} = {conv.conversion_factor}
							{conv.to_unit_symbol}
						</td>
						<td class="px-4 py-3">
							<div class="flex items-center gap-2">
								<button
									onclick={() => openModal('edit', conv)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
									aria-label={$t('Edit Conversion')}
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
										><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
									>
								</button>
								<button
									onclick={() => (conversionToDelete = conv)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
									aria-label={$t('Delete')}
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

{#if modalMode && selectedConversion}
	<div
		transition:slide
		class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
	>
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div class="relative w-full max-w-lg transform rounded-xl bg-white shadow-2xl">
			<div class="border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? $t('Add New Conversion') : $t('Edit Conversion')}
				</h2>
			</div>

			<form
				method="POST"
				action="?/saveConversion"
				use:enhance={() => {
					isSaving = true;
					return async ({ update }) => {
						await update();
						isSaving = false;
					};
				}}
			>
				<div class="space-y-4 p-6">
					{#if modalMode === 'edit'}<input
							type="hidden"
							name="id"
							value={selectedConversion.id}
						/>{/if}

					<div class="grid grid-cols-2 items-end gap-4">
						<div>
							<label for="from_unit_id" class="mb-1 block text-sm font-medium text-gray-700"
								>{$t('From Unit *')}</label
							>
							<select
								name="from_unit_id"
								id="from_unit_id"
								bind:value={selectedConversion.from_unit_id}
								required
								class="w-full rounded-md border-gray-300"
							>
								<option value={undefined} disabled>{$t('-- Select Unit --')}</option>
								{#each availableFromUnits as unit (unit.id)}
									<option value={unit.id}>{unit.name} ({unit.symbol})</option>
								{/each}
							</select>
						</div>
						<div class="pb-2 text-center">=</div>
						<div>
							<label for="to_unit_id" class="mb-1 block text-sm font-medium text-gray-700"
								>{$t('To Unit *')}</label
							>
							<select
								name="to_unit_id"
								id="to_unit_id"
								bind:value={selectedConversion.to_unit_id}
								required
								class="w-full rounded-md border-gray-300"
								disabled={!selectedConversion.from_unit_id}
							>
								<option value={undefined} disabled>{$t('-- Select Unit --')}</option>
								{#each availableToUnits as unit (unit.id)}
									<option value={unit.id}>{unit.name} ({unit.symbol})</option>
								{/each}
							</select>
						</div>
					</div>
					<div>
						<label for="conversion_factor" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Conversion Factor *')}</label
						>
						<input
							type="number"
							name="conversion_factor"
							id="conversion_factor"
							step="any"
							min="0.000001"
							required
							bind:value={selectedConversion.conversion_factor}
							placeholder="e.g., 12"
							class="w-full rounded-md border-gray-300"
						/>
						<p class="mt-1 text-xs text-gray-500">
							{$t("How many 'To Units' make up one 'From Unit'?")}
							{$t('(e.g., if 1 Box = 12 Pieces, enter 12)')}
						</p>
					</div>

					{#if form?.message && !form.success && form.action === 'saveConversion'}
						<div class="rounded-md bg-red-50 p-3 text-sm text-red-600">
							<p><strong>{$t('Error:')}</strong> {form.message}</p>
						</div>
					{/if}
				</div>
				<div class="flex justify-end gap-3 border-t bg-gray-50 p-4">
					<button
						type="button"
						onclick={closeModal}
						class="rounded-md border bg-white px-4 py-2 text-sm">{$t('Cancel')}</button
					>
					<button
						type="submit"
						disabled={isSaving}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:bg-blue-400"
					>
						{#if isSaving}
							{$t('Saving...')}
						{:else}
							{$t('Save Conversion')}
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if conversionToDelete}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">{$t('Confirm Delete Conversion')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				{$t('Are you sure you want to delete conversion:')} <br />
				<strong class="font-mono text-xs"
					>1 {conversionToDelete.from_unit_symbol} = {conversionToDelete.conversion_factor}
					{conversionToDelete.to_unit_symbol}</strong
				>?
			</p>
			{#if form?.message && !form.success && form.action === 'deleteConversion'}
				<p class="mt-2 text-sm text-red-600"><strong>{$t('Error:')}</strong> {form.message}</p>
			{/if}
			<form
				method="POST"
				action="?/deleteConversion"
				use:enhance
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="id" value={conversionToDelete.id} />
				<button
					type="button"
					onclick={() => (conversionToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm">{$t('Cancel')}</button
				>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white"
					>{$t('Delete')}</button
				>
			</form>
		</div>
	</div>
{/if}
