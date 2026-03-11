<script lang="ts">
	//@ts-nocheck
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { t, locale } from '$lib/i18n';

	let { data } = $props();
	let { workflow, steps, positions, departments } = $state(data);

	let nextStepOrder = $derived(() => {
		if (steps.length === 0) {
			return 1;
		}
		const maxOrder = Math.max(...steps.map((s) => s.step_order));
		return maxOrder + 1;
	});

	function handleFormResult() {
		return async ({ result }) => {
			if (result.type === 'success' && result.data?.success) {
				toast.success(result.data.message);
				location.reload();
			} else if (result.type === 'failure') {
				toast.error(result.data?.message || $t('An error occurred.'));
			}
		};
	}
</script>

<svelte:head>
	<title>{$t('Manage Workflow:')} {workflow.name}</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-6">
	<a href="/approval-workflows" class="mb-4 inline-block text-blue-600 hover:underline"
		>&larr; {$t('Back to all workflows')}</a
	>

	<h1 class="mb-6 text-3xl font-bold text-gray-800">{$t('Manage Workflow:')} {workflow.name}</h1>

	<div class="mb-8 rounded-lg bg-white p-6 shadow-lg">
		<h2 class="mb-4 text-2xl font-semibold text-gray-700">{$t('Workflow Details')}</h2>
		<form method="POST" action="?/updateWorkflow" use:enhance={handleFormResult}>
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
				<div>
					<label for="name" class="mb-1 block text-sm font-medium text-gray-600"
						>{$t('Workflow Name')}</label
					>
					<input
						type="text"
						id="name"
						name="name"
						bind:value={workflow.name}
						required
						class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>

				<div>
					<label for="document_type" class="mb-1 block text-sm font-medium text-gray-600"
						>{$t('Document Type')}</label
					>
					<input
						type="text"
						id="document_type"
						name="document_type"
						value={workflow.document_type}
						readonly
						class="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-100 px-4 py-2 text-gray-500"
					/>
				</div>

				<div>
					<label for="department_id" class="mb-1 block text-sm font-medium text-gray-600"
						>{$t('For Department (Optional)')}</label
					>
					<select
						id="department_id"
						name="department_id"
						bind:value={workflow.department_id}
						class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
					>
						<option value={null}>{$t('All Departments')}</option>
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
						bind:value={workflow.min_amount}
						step="0.01"
						class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
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
						bind:value={workflow.max_amount}
						step="0.01"
						class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>

				<div class="mt-7 flex items-center">
					<input
						type="checkbox"
						id="is_active"
						name="is_active"
						bind:checked={workflow.is_active}
						class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
					/>
					<label for="is_active" class="ml-2 block text-sm font-medium text-gray-700"
						>{$t('Is Active')}</label
					>
				</div>
			</div>

			<div class="mt-6 text-right">
				<button
					type="submit"
					class="rounded-lg bg-blue-600 px-6 py-2 text-white shadow transition duration-200 hover:bg-blue-700"
				>
					{$t('Save Changes')}
				</button>
			</div>
		</form>
	</div>

	<div class="rounded-lg bg-white p-6 shadow-lg">
		<h2 class="mb-4 text-2xl font-semibold text-gray-700">{$t('Workflow Steps')}</h2>

		<div class="mb-6 space-y-4">
			{#each steps as step (step.id)}
				<div
					class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4"
				>
					<div class="flex items-center space-x-4">
						<span
							class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white"
						>
							{step.step_order}
						</span>
						<div>
							<div class="text-lg font-semibold text-gray-800">
								{step.position_name}
							</div>
							<div class="text-sm text-gray-500">
								{step.department_name || $t('Same as requester')}
								<span class="mx-2">|</span>
								{$t('Type:')} <span class="font-medium">{step.approval_type}</span>
							</div>
						</div>
					</div>
					<form method="POST" action="?/deleteStep" use:enhance={handleFormResult}>
						<input type="hidden" name="step_id" value={step.id} />
						<button
							type="submit"
							class="font-medium text-red-500 hover:text-red-700"
							onclick={(e) => {
								if (!confirm($t('Are you sure you want to delete this step?'))) e.preventDefault();
							}}
						>
							{$t('Delete')}
						</button>
					</form>
				</div>
			{:else}
				<p class="p-4 text-center text-gray-500">{$t('This workflow has no steps yet.')}</p>
			{/each}
		</div>

		<hr class="my-6 border-gray-200" />
		<h3 class="mb-4 text-xl font-semibold text-gray-700">{$t('Add New Step')}</h3>
		<form method="POST" action="?/addStep" use:enhance={handleFormResult} class="space-y-4">
			<input type="hidden" name="step_order" value={nextStepOrder} />

			<div>
				<label for="step_order" class="mb-1 block text-sm font-medium text-gray-600"
					>{$t('Step Order')}</label
				>
				<input
					id="step_order"
					type="number"
					value={nextStepOrder}
					disabled
					class="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-100 px-4 py-2 text-gray-500"
				/>
			</div>

			<div>
				<label for="approver_position_id" class="mb-1 block text-sm font-medium text-gray-600"
					>{$t('Approver Position')}</label
				>
				<select
					id="approver_position_id"
					name="approver_position_id"
					required
					class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
				>
					<option value="" disabled selected>{$t('Select position...')}</option>
					{#each positions as pos}
						<option value={pos.id}>{pos.name}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="approver_department_id" class="mb-1 block text-sm font-medium text-gray-600"
					>{$t('Approver Department (Optional)')}</label
				>
				<select
					id="approver_department_id"
					name="approver_department_id"
					class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
				>
					<option value={null}>{$t("Same as Requester's Department")}</option>
					{#each departments as dept}
						<option value={dept.id}>{dept.name}</option>
					{/each}
				</select>
				<p class="mt-1 text-xs text-gray-500">
					{$t(
						'If blank, it will find the position in the same department as the person who created the PR/PO.'
					)}
				</p>
			</div>

			<div>
				<label for="approval_type" class="mb-1 block text-sm font-medium text-gray-600"
					>{$t('Approval Type')}</label
				>
				<select
					id="approval_type"
					name="approval_type"
					required
					class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
				>
					<option value="Any"
						>{$t('Any (Only one person in this position needs to approve)')}</option
					>
					<option value="All">{$t('All (Everyone in this position must approve)')}</option>
				</select>
			</div>

			<div class="text-right">
				<button
					type="submit"
					class="rounded-lg bg-green-600 px-6 py-2 text-white shadow transition duration-200 hover:bg-green-700"
				>
					{$t('Add Step')}
				</button>
			</div>
		</form>
	</div>
</div>
