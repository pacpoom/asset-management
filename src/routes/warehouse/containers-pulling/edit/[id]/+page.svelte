<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	let { data, form } = $props();
	let isSubmitting = $state(false);

	let containerOptions = $derived(
		data.availablePlans.map((p: any) => ({
			value: p.id,
			label: `${p.container_no || 'N/A'} (${$t('Plan')}: ${p.plan_no})`
		}))
	);

	let selectedContainer = $state<any>({
		value: data.plan.container_order_plan_id,
		label: `${data.plan.container_no || 'N/A'} (${$t('Plan')}: ${data.plan.plan_no})`
	});

	function getLocalYYYYMMDD(dateString: any) {
		if (!dateString) return '';
		const d = new Date(dateString);
		const year = d.getFullYear();
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	let formattedDate = $state(getLocalYYYYMMDD(data.plan.pulling_date));
</script>

<svelte:head>
	<title>{$t('Edit Pulling Plan')}: {data.plan.pulling_plan_no}</title>
</svelte:head>

<div class="mx-auto max-w-4xl p-6">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">{$t('Edit Pulling Plan')}</h1>
			<p class="text-sm text-gray-500">{data.plan.pulling_plan_no}</p>
		</div>
	</div>

	{#if form?.message}
		<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 shadow-sm">
			<span class="material-symbols-outlined mr-1 align-middle text-[20px]">error</span>
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
				<span class="material-symbols-outlined text-gray-400">edit_note</span>
				{$t('Plan Information')}
			</h2>
		</div>

		<div class="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
			<div>
				<label class="block">
					<span class="mb-2 block text-sm font-bold text-gray-700">
						{$t('Select Container in Stock')} *
					</span>

					<Select
						items={containerOptions}
						bind:value={selectedContainer}
						placeholder={$t('-- Search Container --')}
						container={browser ? document.body : null}
						class="svelte-select-custom"
					>
						<div slot="empty" class="p-2 text-center text-sm text-gray-500">
							{$t('No containers found')}
						</div>
					</Select>
				</label>

				<input
					type="hidden"
					name="container_order_plan_id"
					value={selectedContainer?.value || ''}
				/>
			</div>

			<div>
				<label for="planType" class="mb-2 block text-sm font-bold text-gray-700">
					{$t('Plan Type')} *
				</label>
				<select
					id="planType"
					name="plan_type"
					required
					class="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
				>
					<option value="All" selected={data.plan.plan_type === 'All'}>All</option>
					<option value="Pull" selected={data.plan.plan_type === 'Pull'}>Pull</option>
				</select>
			</div>

			<div>
				<label for="pullingDate" class="mb-2 block text-sm font-bold text-gray-700">
					{$t('Pulling Date')} *
				</label>
				<input
					id="pullingDate"
					type="date"
					name="pulling_date"
					value={formattedDate}
					required
					class="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
				/>
			</div>

			<div>
				<label for="destination" class="mb-2 block text-sm font-bold text-gray-700">
					{$t('Destination')}
				</label>
				<input
					id="destination"
					type="text"
					name="destination"
					value={data.plan.destination || ''}
					placeholder={$t('Enter destination...')}
					class="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
				/>
			</div>

			<div>
				<label for="status" class="mb-2 block text-sm font-bold text-gray-700">
					{$t('Status')} *
				</label>
				<select
					id="status"
					name="status"
					class="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
				>
					<option value="1" selected={data.plan.status === 1}>Planned</option>
					<option value="2" selected={data.plan.status === 2}>In Progress</option>
					<option value="3" selected={data.plan.status === 3}>Completed</option>
				</select>
			</div>

			<div>
				<label for="pullingOrder" class="mb-2 block text-sm font-bold text-gray-700">
					{$t('Pulling Order')}
				</label>
				<input
					id="pullingOrder"
					type="number"
					name="pulling_order"
					value={data.plan.pulling_order || ''}
					class="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
					placeholder={$t('Additional notes...')}
					class="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
					>{data.plan.remarks || ''}</textarea
				>
			</div>
		</div>

		<div
			class="flex justify-end gap-3 rounded-b-lg border-t border-gray-100 bg-gray-50/50 px-6 py-4"
		>
			<a
				href="/warehouse/containers-pulling"
				class="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
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
				<span class="material-symbols-outlined text-[18px]">save</span>
				{$t('Update Plan')}
			</button>
		</div>
	</form>
</div>
