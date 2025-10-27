<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner'; // Assuming you have svelte-sonner or similar

	let { data } = $props();
	let { workflows, departments } = $state(data);
	
	let showCreateForm = $state(false);

	function handleCreateResult({ result }) {
		if (result.type === 'success' && result.data?.success) {
			toast.success(result.data.message);
			showCreateForm = false;
			// We need to trigger a reload of workflows, ideally just invalidate
			// For simplicity here, we might need to invalidate 'app:workflows'
			// or just reload the page if invalidate isn't set up
			location.reload(); 
		} else if (result.type === 'failure') {
			toast.error(result.data?.message || 'An error occurred.');
		}
	}
</script>

<div class="p-6 bg-gray-50 min-h-screen">
	<div class="flex justify-between items-center mb-6">
		<h1 class="text-3xl font-bold text-gray-800">Approval Workflows</h1>
		<button
			onclick={() => (showCreateForm = !showCreateForm)}
			class="px-5 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition duration-200"
		>
			{showCreateForm ? 'Cancel' : 'Add New Workflow'}
		</button>
	</div>

	<!-- Create New Workflow Form -->
	{#if showCreateForm}
		<div class="bg-white p-6 rounded-lg shadow-lg mb-8 transition-all duration-300">
			<h2 class="text-2xl font-semibold mb-4 text-gray-700">Create New Workflow</h2>
			<form method="POST" action="?/createWorkflow" use:enhance={handleCreateResult}>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<!-- Workflow Name -->
					<div>
						<label for="name" class="block text-sm font-medium text-gray-600 mb-1">Workflow Name</label>
						<input
							type="text"
							id="name"
							name="name"
							required
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
							placeholder="e.g., PR แผนก IT > 50,000"
						/>
					</div>

					<!-- Document Type -->
					<div>
						<label for="document_type" class="block text-sm font-medium text-gray-600 mb-1">Document Type</label>
						<select
							id="document_type"
							name="document_type"
							required
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
						>
							<option value="" disabled selected>Select type...</option>
							<option value="PR">PR (Purchase Requisition)</option>
							<option value="PO">PO (Purchase Order)</option>
						</select>
					</div>

					<!-- Department (Condition) -->
					<div>
						<label for="department_id" class="block text-sm font-medium text-gray-600 mb-1">For Department (Optional)</label>
						<select
							id="department_id"
							name="department_id"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
						>
							<option value="">All Departments</option>
							{#each departments as dept}
								<option value={dept.id}>{dept.name}</option>
							{/each}
						</select>
					</div>
					
					<!-- Min Amount -->
					<div>
						<label for="min_amount" class="block text-sm font-medium text-gray-600 mb-1">Min Amount (Optional)</label>
						<input
							type="number"
							id="min_amount"
							name="min_amount"
							step="0.01"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
							placeholder="e.g., 50001"
						/>
					</div>

					<!-- Max Amount -->
					<div>
						<label for="max_amount" class="block text-sm font-medium text-gray-600 mb-1">Max Amount (Optional)</label>
						<input
							type="number"
							id="max_amount"
							name="max_amount"
							step="0.01"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
							placeholder="e.g., 50000"
						/>
					</div>
				</div>

				<!-- Submit Button -->
				<div class="mt-6 text-right">
					<button
						type="submit"
						class="px-6 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition duration-200"
					>
						Create Workflow
					</button>
				</div>
			</form>
		</div>
	{/if}

	<!-- Existing Workflows List -->
	<div class="bg-white rounded-lg shadow-lg overflow-hidden">
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
						<td class="p-4 whitespace-nowrap text-gray-800 font-medium">{workflow.name}</td>
						<td class="p-4 whitespace-nowrap">
							<span class="px-3 py-1 rounded-full text-xs font-medium
								{workflow.document_type === 'PR' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}">
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
							<span class="px-3 py-1 rounded-full text-xs font-medium
								{workflow.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
								{workflow.is_active ? 'Active' : 'Inactive'}
							</span>
						</td>
						<td class="p-4 whitespace-nowrap">
							<a
								href="/approval-workflows/{workflow.id}"
								class="text-blue-600 hover:text-blue-800 font-medium"
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
