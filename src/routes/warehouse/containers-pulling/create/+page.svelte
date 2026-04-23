<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	let { data, form } = $props();
	let today = new Date().toISOString().split('T')[0];
	let isSubmitting = $state(false);

	let containerOptions = $derived(
		data.availablePlans.map((plan: any) => ({
			value: plan.id,
			label: `${plan.container_no || 'N/A'} (Plan: ${plan.plan_no})`
		}))
	);

	let selectedContainer = $state<any>(null);
</script>

<svelte:head>
	<title>{$t('Create New Pulling Plan')}</title>
</svelte:head>

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Create New Pulling Plan')}</h1>
		<p class="mt-1 text-sm text-gray-500">
			{$t('Fill in the details below to create a new pulling plan')}
		</p>
	</div>
</div>

{#if form?.message}
	<div
		class="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 shadow-sm"
	>
		<span class="material-symbols-outlined text-[20px]">error</span>
		{form.message}
	</div>
{/if}

<form
	method="POST"
	class="rounded-lg border border-gray-100 bg-white shadow-sm"
	use:enhance={() => {
		isSubmitting = true;
		return async ({ update }) => {
			await update();
			isSubmitting = false;
		};
	}}
>
	<div
		class="flex items-center justify-between rounded-t-lg border-b border-gray-100 bg-gray-50/50 px-6 py-4"
	>
		<h2 class="flex items-center gap-2 font-bold text-gray-700">
			{$t('Plan Information')}
		</h2>
	</div>

	<div class="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
		<div>
			<div class="mb-2 block text-sm font-bold text-gray-700">
				{$t('Select Container in Stock')} <span class="text-red-500">*</span>
			</div>

			<Select
				items={containerOptions}
				bind:value={selectedContainer}
				placeholder={$t('-- Search Container --')}
				container={browser ? document.body : null}
				class="svelte-select-custom"
			/>

			<input type="hidden" name="container_order_plan_id" value={selectedContainer?.value || ''} />
		</div>

		<div>
			<label for="planType" class="mb-2 block text-sm font-bold text-gray-700">
				{$t('Plan Type')} <span class="text-red-500">*</span>
			</label>
			<select
				id="planType"
				name="plan_type"
				required
				class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
			>
				<option value="All">All</option>
				<option value="Pull">Pull</option>
			</select>
		</div>

		<div>
			<label for="pullingDate" class="mb-2 block text-sm font-bold text-gray-700">
				{$t('Pulling Date')} <span class="text-red-500">*</span>
			</label>
			<input
				id="pullingDate"
				type="date"
				name="pulling_date"
				value={today}
				required
				class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
			/>
		</div>

		<div>
			<label for="shop" class="mb-2 block text-sm font-bold text-gray-700">{$t('Shop')} *</label>
			<select
				id="shop"
				name="shop"
				required
				class="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
			>
				<option value="" disabled selected>{$t('-- Select Shop --')}</option>
				<option value="SKD">SKD</option>
				<option value="MOQ">MOQ</option>
				<option value="KD">KD</option>
				<option value="BA">BA</option>
				<option value="EA">EA</option>
			</select>
		</div>

		<div>
			<label for="destination" class="mb-2 block text-sm font-bold text-gray-700">
				{$t('Destination')}
			</label>
			<input
				id="destination"
				type="text"
				name="destination"
				class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
				placeholder="Enter destination..."
			/>
		</div>

		<div class="md:col-span-2">
			<label for="remarks" class="mb-2 block text-sm font-bold text-gray-700">
				{$t('Remarks')}
			</label>
			<textarea
				id="remarks"
				name="remarks"
				rows="3"
				class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
				placeholder="Additional notes..."
			></textarea>
		</div>
	</div>

	<div class="flex justify-end gap-3 rounded-b-lg border-t border-gray-100 bg-gray-50/50 px-6 py-4">
		<a
			href="/warehouse/containers-pulling"
			class="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
		>
			{$t('Cancel')}
		</a>
		<button
			type="submit"
			disabled={isSubmitting}
			class="flex items-center gap-2 rounded-lg bg-gray-800 px-5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-gray-700 disabled:opacity-50"
		>
			{#if isSubmitting}
				<div
					class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
				></div>
			{/if}
			{$t('Create Plan')}
		</button>
	</div>
</form>
