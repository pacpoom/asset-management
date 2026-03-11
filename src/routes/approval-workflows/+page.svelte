<script lang="ts">
	// @ts-nocheck
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { t, locale } from '$lib/i18n';

	let { data } = $props();
	let { workflows, departments } = $state(data);
	let showCreateForm = $state(false);

	function handleCreateResult() {
		return async ({ result }) => {
			if (result.type === 'success' && result.data?.success) {
				toast.success(result.data.message);
				location.reload();
			} else if (result.type === 'failure') {
				toast.error(result.data?.message || $t('An error occurred.'));
			}
		};
	}

	const formatAmount = (val: any) => {
		if (val === null || val === undefined || val === '') return $t('Any');
		return new Intl.NumberFormat($locale === 'th' ? 'th-TH' : 'en-US').format(Number(val));
	};
</script>

<svelte:head>
	<title>{$t('Approval Workflows')}</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-3xl font-bold text-gray-800">{$t('Approval Workflows')}</h1>
		<button
			onclick={() => (showCreateForm = !showCreateForm)}
			class="rounded-lg bg-blue-600 px-5 py-2 text-white shadow transition duration-200 hover:bg-blue-700"
		>
			{showCreateForm ? $t('Cancel') : $t('Add New Workflow')}
		</button>
	</div>

	{#if showCreateForm}
		<div class="mb-8 rounded-lg bg-white p-6 shadow-lg transition-all duration-300">
			<h2 class="mb-4 text-2xl font-semibold text-gray-700">{$t('Create New Workflow')}</h2>
			<form method="POST" action="?/createWorkflow" use:enhance={handleCreateResult}>
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					<div>
						<label for="name" class="mb-1 block text-sm font-medium text-gray-600"
							>{$t('Workflow Name')}</label
						>
						<input
							type="text"
							id="name"
							name="name"
							required
							class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
							placeholder={$t('e.g., PR IT Dept > 50,000')}
						/>
					</div>

					<div>
						<label for="document_type" class="mb-1 block text-sm font-medium text-gray-600"
							>{$t('Document Type')}</label
						>
						<select
							id="document_type"
							name="document_type"
							required
							class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
						>
							<option value="" disabled selected>{$t('Select type...')}</option>
							<option value="PR">{$t('PR (Purchase Requisition)')}</option>
							<option value="PO">{$t('PO (Purchase Order)')}</option>
						</select>
					</div>

					<div>
						<label for="department_id" class="mb-1 block text-sm font-medium text-gray-600"
							>{$t('For Department (Optional)')}</label
						>
						<select
							id="department_id"
							name="department_id"
							class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
						>
							<option value="">{$t('All Departments')}</option>
							{#each departments as dept}
								<option value={dept.id}>{dept.name}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="min_amount" class="mb-1 block text-sm font-medium text-gray-600"
							>{$t('Min Amount (Optional)')}</label
						>
						<input
							type="number"
							id="min_amount"
							name="min_amount"
							step="0.01"
							class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
							placeholder={$t('e.g., 50001')}
						/>
					</div>

					<div>
						<label for="max_amount" class="mb-1 block text-sm font-medium text-gray-600"
							>{$t('Max Amount (Optional)')}</label
						>
						<input
							type="number"
							id="max_amount"
							name="max_amount"
							step="0.01"
							class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
							placeholder={$t('e.g., 50000')}
						/>
					</div>
				</div>

				<div class="mt-6 text-right">
					<button
						type="submit"
						class="rounded-lg bg-green-600 px-6 py-2 text-white shadow transition duration-200 hover:bg-green-700"
					>
						{$t('Create Workflow')}
					</button>
				</div>
			</form>
		</div>
	{/if}

	<div class="overflow-x-auto rounded-lg bg-white shadow-lg">
		<table class="min-w-full">
			<thead class="bg-gray-100">
				<tr>
					<th class="p-4 text-left text-sm font-semibold text-gray-600 uppercase">{$t('Name')}</th>
					<th class="p-4 text-left text-sm font-semibold text-gray-600 uppercase"
						>{$t('Doc Type')}</th
					>
					<th class="p-4 text-left text-sm font-semibold text-gray-600 uppercase"
						>{$t('Department')}</th
					>
					<th class="p-4 text-left text-sm font-semibold text-gray-600 uppercase"
						>{$t('Amount Range')}</th
					>
					<th class="p-4 text-left text-sm font-semibold text-gray-600 uppercase">{$t('Status')}</th
					>
					<th class="p-4 text-left text-sm font-semibold text-gray-600 uppercase"
						>{$t('Actions')}</th
					>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200">
				{#each workflows as workflow (workflow.id)}
					<tr class="hover:bg-gray-50">
						<td class="p-4 font-medium whitespace-nowrap text-gray-800">{workflow.name}</td>
						<td class="p-4 whitespace-nowrap">
							<span
								class="rounded-full px-3 py-1 text-xs font-medium
								{workflow.document_type === 'PR' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}"
							>
								{workflow.document_type}
							</span>
						</td>
						<td class="p-4 whitespace-nowrap text-gray-600">
							{workflow.department_name || $t('All Departments')}
						</td>
						<td class="p-4 whitespace-nowrap text-gray-600">
							{formatAmount(workflow.min_amount)} - {formatAmount(workflow.max_amount)}
						</td>
						<td class="p-4 whitespace-nowrap">
							<span
								class="rounded-full px-3 py-1 text-xs font-medium
								{workflow.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}"
							>
								{workflow.is_active ? $t('Active') : $t('Inactive')}
							</span>
						</td>
						<td class="p-4 whitespace-nowrap">
							<a
								href="/approval-workflows/{workflow.id}"
								class="font-medium text-blue-600 hover:text-blue-800"
							>
								{$t('Manage Steps')}
							</a>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="6" class="p-6 text-center text-gray-500">
							{$t('No workflows found. Click "Add New Workflow" to get started.')}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
