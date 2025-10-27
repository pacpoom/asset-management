<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	let { workflow, steps, positions, departments } = $state(data);

	// Find the next available step order
	let nextStepOrder = $derived(() => {
		if (steps.length === 0) {
			return 1;
		}
		const maxOrder = Math.max(...steps.map(s => s.step_order));
		return maxOrder + 1;
	});

	function handleFormResult({ result }) {
		if (result.type === 'success' && result.data?.success) {
			toast.success(result.data.message);
			// Trigger reload of data
			location.reload();
		} else if (result.type === 'failure') {
			toast.error(result.data?.message || 'An error occurred.');
		}
	}
</script>

<div class="p-6 bg-gray-50 min-h-screen">
	<a href="/approval-workflows" class="text-blue-600 hover:underline mb-4 inline-block">&larr; Back to all workflows</a>
	
	<h1 class="text-3xl font-bold text-gray-800 mb-6">Manage Workflow: {workflow.name}</h1>

	<!-- Edit Workflow Details Form -->
	<div class="bg-white p-6 rounded-lg shadow-lg mb-8">
		<h2 class="text-2xl font-semibold mb-4 text-gray-700">Workflow Details</h2>
		<form method="POST" action="?/updateWorkflow" use:enhance={handleFormResult}>
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				<!-- Workflow Name -->
				<div>
					<label for="name" class="block text-sm font-medium text-gray-600 mb-1">Workflow Name</label>
					<input
						type="text"
						id="name"
						name="name"
						bind:value={workflow.name}
						required
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>
				
				<!-- Document Type (Readonly) -->
				<div>
					<label for="document_type" class="block text-sm font-medium text-gray-600 mb-1">Document Type</label>
					<input
						type="text"
						id="document_type"
						name="document_type"
						value={workflow.document_type}
						readonly
						class="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
					/>
				</div>
				
				<!-- Department -->
				<div>
					<label for="department_id" class="block text-sm font-medium text-gray-600 mb-1">For Department</label>
					<select
						id="department_id"
						name="department_id"
						bind:value={workflow.department_id}
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
					>
						<option value={null}>All Departments</option>
						{#each departments as dept}
							<option value={dept.id}>{dept.name}</option>
						{/each}
					</select>
				</div>
				
				<!-- Min Amount -->
				<div>
					<label for="min_amount" class="block text-sm font-medium text-gray-600 mb-1">Min Amount</label>
					<input
						type="number"
						id="min_amount"
						name="min_amount"
						bind:value={workflow.min_amount}
						step="0.01"
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>
				
				<!-- Max Amount -->
				<div>
					<label for="max_amount" class="block text-sm font-medium text-gray-600 mb-1">Max Amount</label>
					<input
						type="number"
						id="max_amount"
						name="max_amount"
						bind:value={workflow.max_amount}
						step="0.01"
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>

				<!-- Active Status -->
				<div class="flex items-center mt-7">
					<input
						type="checkbox"
						id="is_active"
						name="is_active"
						bind:checked={workflow.is_active}
						class="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
					/>
					<label for="is_active" class="ml-2 block text-sm font-medium text-gray-700">Is Active</label>
				</div>
			</div>
			
			<div class="mt-6 text-right">
				<button
					type="submit"
					class="px-6 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition duration-200"
				>
					Save Changes
				</button>
			</div>
		</form>
	</div>

	<!-- Workflow Steps -->
	<div class="bg-white p-6 rounded-lg shadow-lg">
		<h2 class="text-2xl font-semibold mb-4 text-gray-700">Workflow Steps</h2>
		
		<!-- List of existing steps -->
		<div class="mb-6 space-y-4">
			{#each steps as step (step.id)}
				<div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
					<div class="flex items-center space-x-4">
						<span class="flex items-center justify-center h-10 w-10 bg-blue-600 text-white rounded-full font-bold text-lg">
							{step.step_order}
						</span>
						<div>
							<div class="text-lg font-semibold text-gray-800">{step.position_name}</div>
							<div class="text-sm text-gray-500">
								{step.department_name || 'Same as requester'}
								<span class="mx-2">|</span>
								Type: <span class="font-medium">{step.approval_type}</span>
							</div>
						</div>
					</div>
					<form method="POST" action="?/deleteStep" use:enhance={handleFormResult}>
						<input type="hidden" name="step_id" value={step.id} />
						<button
							type="submit"
							class="text-red-500 hover:text-red-700 font-medium"
							onclick="return confirm('Are you sure you want to delete this step?')"
						>
							Delete
						</button>
					</form>
				</div>
			{:else}
				<p class="text-center text-gray-500 p-4">This workflow has no steps yet.</p>
			{/each}
		</div>

		<!-- Add New Step Form -->
		<hr class="my-6">
		<h3 class="text-xl font-semibold mb-4 text-gray-700">Add New Step</h3>
		<form method="POST" action="?/addStep" use:enhance={handleFormResult} class="space-y-4">
			<input type="hidden" name="step_order" value={nextStepOrder} />
			
			<div>
				<label class="block text-sm font-medium text-gray-600 mb-1">Step Order</label>
				<input
					type="number"
					value={nextStepOrder}
					disabled
					class="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100"
				/>
			</div>

			<div>
				<label for="approver_position_id" class="block text-sm font-medium text-gray-600 mb-1">Approver Position</label>
				<select
					id="approver_position_id"
					name="approver_position_id"
					required
					class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
				>
					<option value="" disabled selected>Select position...</option>
					{#each positions as pos}
						<option value={pos.id}>{pos.name}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="approver_department_id" class="block text-sm font-medium text-gray-600 mb-1">Approver Department (Optional)</label>
				<select
					id="approver_department_id"
					name="approver_department_id"
					class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
				>
					<option value={null}>Same as Requester's Department</option>
					{#each departments as dept}
						<option value={dept.id}>{dept.name}</option>
					{/each}
				</select>
				<p class="text-xs text-gray-500 mt-1">If blank, it will find the position in the same department as the person who created the PR/PO.</p>
			</div>

			<div>
				<label for="approval_type" class="block text-sm font-medium text-gray-600 mb-1">Approval Type</label>
				<select
					id="approval_type"
					name="approval_type"
					required
					class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
				>
					<option value="Any">Any (Only one person in this position needs to approve)</option>
					<option value="All">All (Everyone in this position must approve)</option>
				</select>
			</div>

			<div class="text-right">
				<button
					type="submit"
					class="px-6 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition duration-200"
				>
					Add Step
				</button>
			</div>
		</form>
	</div>
</div>
