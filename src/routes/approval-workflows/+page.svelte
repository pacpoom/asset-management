<script lang="ts">
	// @ts-nocheck
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	let { workflows, departments } = $state(data);
	let showCreateForm = $state(false);

	function handleCreateResult() {
		return async ({ result }) => {
			if (result.type === 'success' && result.data?.success) {
				toast.success(result.data.message);
				showCreateForm = false;
				location.reload();
			} else if (result.type === 'failure') {
				toast.error(result.data?.message || 'An error occurred.');
			}
		};
	}
</script>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-3xl font-bold text-gray-800">Approval Workflows</h1>
		<button
			onclick={() => (showCreateForm = !showCreateForm)}
			class="rounded-lg bg-blue-600 px-5 py-2 text-white shadow transition duration-200 hover:bg-blue-700"
		>
			{showCreateForm ? 'Cancel' : 'Add New Workflow'}
		</button>
	</div>

	{#if showCreateForm}
		<div class="mb-8 rounded-lg bg-white p-6 shadow-lg transition-all duration-300">
			<h2 class="mb-4 text-2xl font-semibold text-gray-700">Create New Workflow</h2>
			<form method="POST" action="?/createWorkflow" use:enhance={handleCreateResult}>
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					<div>
						<label for="name" class="mb-1 block text-sm font-medium text-gray-600"
							>Workflow Name</label
						>
						<input
							type="text"
							id="name"
							name="name"
							required
							class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
							placeholder="e.g., PR แผนก IT > 50,000"
						/>
					</div>

					<div>
						<label for="document_type" class="mb-1 block text-sm font-medium text-gray-600"
							>Document Type</label
						>
						<select
							id="document_type"
							name="document_type"
							required
							class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
						>
							<option value="" disabled selected>Select type...</option>
							<option value="PR">PR (Purchase Requisition)</option>
							<option value="PO">PO (Purchase Order)</option>
						</select>
					</div>

					<div>
						<label for="department_id" class="mb-1 block text-sm font-medium text-gray-600"
							>For Department (Optional)</label
						>
						<select
							id="department_id"
							name="department_id"
							class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
						>
							<option value="">All Departments</option>
							{#each departments as dept}
								<option value={dept.id}>{dept.name}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="min_amount" class="mb-1 block text-sm font-medium text-gray-600"
							>Min Amount (Optional)</label
						>
						<input
							type="number"
							id="min_amount"
							name="min_amount"
							step="0.01"
							class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
							placeholder="e.g., 50001"
						/>
					</div>

					<div>
						<label for="max_amount" class="mb-1 block text-sm font-medium text-gray-600"
							>Max Amount (Optional)</label
						>
						<input
							type="number"
							id="max_amount"
							name="max_amount"
							step="0.01"
							class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
							placeholder="e.g., 50000"
						/>
					</div>
				</div>

				<div class="mt-6 text-right">
					<button
						type="submit"
						class="rounded-lg bg-green-600 px-6 py-2 text-white shadow transition duration-200 hover:bg-green-700"
					>
						Create Workflow
					</button>
				</div>
			</form>
		</div>
	{/if}

	<div class="overflow-hidden rounded-lg bg-white shadow-lg">
		<table class="w-full min-w-[700px]">
			<thead class="bg-gray-100">
				<tr>
					<th class="p-4 text-left text-sm font-semibold text-gray-600 uppercase">Name</th>
					<th class="p-4 text-left text-sm font-semibold text-gray-600 uppercase">Doc Type</th>
					<th class="p-4 text-left text-sm font-semibold text-gray-600 uppercase">Department</th>
					<th class="p-4 text-left text-sm font-semibold text-gray-600 uppercase">Amount Range</th>
					<th class="p-4 text-left text-sm font-semibold text-gray-600 uppercase">Status</th>
					<th class="p-4 text-left text-sm font-semibold text-gray-600 uppercase">Actions</th>
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
							{workflow.department_name || 'All Departments'}
						</td>
						<td class="p-4 whitespace-nowrap text-gray-600">
							{workflow.min_amount || 'Any'} - {workflow.max_amount || 'Any'}
						</td>
						<td class="p-4 whitespace-nowrap">
							<span
								class="rounded-full px-3 py-1 text-xs font-medium
								{workflow.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}"
							>
								{workflow.is_active ? 'Active' : 'Inactive'}
							</span>
						</td>
						<td class="p-4 whitespace-nowrap">
							<a
								href="/approval-workflows/{workflow.id}"
								class="font-medium text-blue-600 hover:text-blue-800"
							>
								Manage Steps
							</a>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="6" class="p-6 text-center text-gray-500">
							No workflows found. Click "Add New Workflow" to get started.
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
