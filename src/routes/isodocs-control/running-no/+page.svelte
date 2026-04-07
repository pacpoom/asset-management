<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { invalidateAll } from '$app/navigation';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();
	type DocType = PageData['types'][0];

	function getTypeName(typeId: number): string {
		const found = data.types.find((t: DocType) => t.id === typeId);
		return found ? `${found.code} - ${found.name}` : `Type #${typeId}`;
	}
</script>

<div class="space-y-4">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">IsoDocs Running No</h1>
		<p class="text-sm text-gray-500">Control running number per document type and year.</p>
	</div>

	{#if form?.message}
		<div
			class={`rounded-lg border px-4 py-3 text-sm ${form.success
				? 'border-green-200 bg-green-50 text-green-700'
				: 'border-red-200 bg-red-50 text-red-700'}`}
		>
			{form.message}
		</div>
	{/if}

	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<h2 class="mb-3 text-lg font-semibold text-gray-800">Set Running Number</h2>
		<form
			method="POST"
			action="?/saveRunningNo"
			use:enhance={() => {
				return async ({ result, update }) => {
					await update();
					if (result.type === 'success' && result.data?.success) {
						invalidateAll();
					}
				};
			}}
			class="grid grid-cols-1 gap-3 md:grid-cols-4"
		>
			<div>
				<label for="type" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Document Type</label>
				<select id="type" name="iso_document_type_id" required class="w-full rounded border border-gray-300 px-3 py-2 text-sm">
					<option value="">-- Select Type --</option>
					{#each data.types as t}
						<option value={t.id}>{t.code} - {t.name}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="period_year" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Year</label>
				<input id="period_year" type="number" name="period_year" value={data.currentYear} required class="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
			</div>

			<div>
				<label for="current_no" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Current No</label>
				<input id="current_no" type="number" min="0" name="current_no" value="0" required class="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
			</div>

			<div class="flex items-end">
				<button type="submit" class="w-full rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
					Save
				</button>
			</div>
		</form>
	</div>

	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<h2 class="mb-3 text-lg font-semibold text-gray-800">Current Running Numbers</h2>
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Type</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Year</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Current No</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100 bg-white">
					{#if data.runningNos.length === 0}
						<tr>
							<td colspan="3" class="px-3 py-6 text-center text-gray-500">No running number records yet.</td>
						</tr>
					{:else}
						{#each data.runningNos as row}
							<tr>
								<td class="px-3 py-2">{getTypeName(row.iso_document_type_id)}</td>
								<td class="px-3 py-2">{row.period_year}</td>
								<td class="px-3 py-2 font-mono">{row.current_no}</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
