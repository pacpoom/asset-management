<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { invalidateAll } from '$app/navigation';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	type DocType = PageData['types'][0];

	let editing = $state<DocType | null>(null);
	let showForm = $state(false);

	function openCreate() {
		editing = null;
		showForm = true;
	}

	function openEdit(item: DocType) {
		editing = item;
		showForm = true;
	}

	function closeForm() {
		showForm = false;
		editing = null;
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">IsoDocs Type Master</h1>
			<p class="text-sm text-gray-500">Manage document type, prefix, and running number format.</p>
		</div>
		<button
			type="button"
			onclick={openCreate}
			class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
		>
			+ New Type
		</button>
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

	{#if showForm}
		<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<h2 class="mb-3 text-lg font-semibold text-gray-800">
				{editing ? 'Edit Type' : 'Create Type'}
			</h2>
			<form
				method="POST"
				action="?/saveType"
				use:enhance={() => {
					return async ({ result, update }) => {
						await update();
						if (result.type === 'success' && result.data?.success) {
							closeForm();
							invalidateAll();
						}
					};
				}}
				class="grid grid-cols-1 gap-3 md:grid-cols-2"
			>
				{#if editing}
					<input type="hidden" name="id" value={editing.id} />
				{/if}

				<div>
					<label for="code" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Code</label>
					<input id="code" name="code" required value={editing?.code || ''} class="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
				</div>

				<div>
					<label for="name" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Name</label>
					<input id="name" name="name" required value={editing?.name || ''} class="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
				</div>

				<div>
					<label for="prefix" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Prefix</label>
					<input id="prefix" name="prefix" required value={editing?.prefix || ''} class="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
				</div>

				<div>
					<label for="running_digits" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Running Digits</label>
					<input id="running_digits" type="number" min="1" max="12" name="running_digits" required value={editing?.running_digits || 4} class="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
				</div>

				<div class="md:col-span-2">
					<label for="number_format" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Number Format</label>
					<input id="number_format" name="number_format" value={editing?.number_format || '{PREFIX}-{YEAR}-{RUNNING}'} class="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
				</div>

				<div>
					<label for="reset_mode" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Reset Mode</label>
					<select id="reset_mode" name="reset_mode" class="w-full rounded border border-gray-300 px-3 py-2 text-sm">
						<option value="yearly" selected={(editing?.reset_mode || 'yearly') === 'yearly'}>Yearly</option>
						<option value="never" selected={editing?.reset_mode === 'never'}>Never</option>
					</select>
				</div>

				<div>
					<label for="is_active" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Status</label>
					<select id="is_active" name="is_active" class="w-full rounded border border-gray-300 px-3 py-2 text-sm">
						<option value="1" selected={(editing?.is_active ?? 1) === 1}>Active</option>
						<option value="0" selected={editing?.is_active === 0}>Inactive</option>
					</select>
				</div>

				<div class="md:col-span-2 flex gap-2">
					<button type="submit" class="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
						{editing ? 'Update' : 'Create'}
					</button>
					<button type="button" onclick={closeForm} class="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
						Cancel
					</button>
				</div>
			</form>
		</div>
	{/if}

	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Code</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Name</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Prefix</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Format</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Digits</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Reset</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Status</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100 bg-white">
					{#if data.types.length === 0}
						<tr>
							<td colspan="8" class="px-3 py-6 text-center text-gray-500">No document types yet.</td>
						</tr>
					{:else}
						{#each data.types as item}
							<tr>
								<td class="px-3 py-2 font-semibold text-gray-700">{item.code}</td>
								<td class="px-3 py-2">{item.name}</td>
								<td class="px-3 py-2">{item.prefix}</td>
								<td class="px-3 py-2 font-mono text-xs text-gray-600">{item.number_format}</td>
								<td class="px-3 py-2">{item.running_digits}</td>
								<td class="px-3 py-2 capitalize">{item.reset_mode}</td>
								<td class="px-3 py-2">
									<span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
										{item.is_active ? 'Active' : 'Inactive'}
									</span>
								</td>
								<td class="px-3 py-2">
									<div class="flex gap-1">
										<button type="button" onclick={() => openEdit(item)} class="rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">Edit</button>
										<form method="POST" action="?/deleteType" onsubmit={() => confirm('Delete this type?')}>
											<input type="hidden" name="id" value={item.id} />
											<button type="submit" class="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">Delete</button>
										</form>
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
