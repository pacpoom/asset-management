<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { DAR_UI_WORKFLOW_LINE } from '$lib/darWorkflowLabels';
	import { invalidateAll } from '$app/navigation';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();
	type Step = PageData['steps'][0];
	type Flow = PageData['flows'][0];

let editingFlowId = $state<number>(0);
let flowName = $state('');
let departmentId = $state<number | ''>('');
let isActive = $state<'1' | '0'>('1');
let issuedUserIds = $state<number[]>([]);
let reviewedUserIds = $state<number[]>([]);
let approvedUserIds = $state<number[]>([]);
let qmrUserIds = $state<number[]>([]);
let issuedSearch = $state('');
let reviewedSearch = $state('');
let approvedSearch = $state('');
let qmrSearch = $state('');

const sortedUsers = $derived(
	[...data.users].sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), undefined, { sensitivity: 'base' }))
);
const issuedUsers = $derived(sortedUsers.filter((u) => String(u.full_name || '').toLowerCase().includes(issuedSearch.toLowerCase().trim())));
const reviewedUsers = $derived(sortedUsers.filter((u) => String(u.full_name || '').toLowerCase().includes(reviewedSearch.toLowerCase().trim())));
const approvedUsers = $derived(sortedUsers.filter((u) => String(u.full_name || '').toLowerCase().includes(approvedSearch.toLowerCase().trim())));
const qmrUsers = $derived(sortedUsers.filter((u) => String(u.full_name || '').toLowerCase().includes(qmrSearch.toLowerCase().trim())));

function parseIds(input: unknown): number[] {
	if (!input) return [];
	if (Array.isArray(input)) {
		return input.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
	}
	try {
		const parsed = JSON.parse(String(input));
		if (!Array.isArray(parsed)) return [];
		return parsed.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
	} catch {
		return [];
	}
}

function getFlowSteps(flowId: number): Step[] {
	return data.steps
		.filter((s: Step) => s.iso_approval_flow_id === flowId)
		.sort((a: Step, b: Step) => a.step_no - b.step_no);
}

function getStepLabel(flowId: number, key: string, fallback: string): string {
	const step = getFlowSteps(flowId).find((s: Step) => s.step_key === key);
	return step?.step_name || fallback;
}

function getSequenceLabel(flowId: number): string {
	const s1 = getStepLabel(flowId, 'issued_by', 'Issued By');
	const s2 = getStepLabel(flowId, 'reviewed_by', 'Reviewed By');
	const s3 = getStepLabel(flowId, 'approved_by', 'Approved By');
	const flow = data.flows.find((f: Flow) => f.id === flowId);
	const steps = getFlowSteps(flowId);
	const issued = steps.find((s: Step) => s.step_key === 'issued_by');
	const reviewed = steps.find((s: Step) => s.step_key === 'reviewed_by');
	const approved = steps.find((s: Step) => s.step_key === 'approved_by');

	const userById = new Map<number, { full_name: string; email: string | null }>();
	for (const u of data.users as any[]) {
		userById.set(Number(u.id), { full_name: String(u.full_name || ''), email: (u.email as string | null) || null });
	}

	function emailsFromIds(ids: number[]): string {
		const emails = ids
			.map((id) => userById.get(id)?.email || '')
			.map((e) => String(e || '').trim())
			.filter(Boolean);
		return emails.length ? emails.join(', ') : '-';
	}

	const issuedEmails = emailsFromIds(parseIds(issued?.approver_user_ids_json));
	const reviewedEmails = emailsFromIds(parseIds(reviewed?.approver_user_ids_json));
	const approvedEmails = emailsFromIds(parseIds(approved?.approver_user_ids_json));
	const qmrEmails = emailsFromIds(parseIds(flow?.qmr_user_ids_json));

	return `${s1} (${issuedEmails}) -> ${s2} (${reviewedEmails}) -> ${s3} (${approvedEmails}) -> QMR (${qmrEmails})`;
}

function resetForm() {
	editingFlowId = 0;
	flowName = '';
	departmentId = '';
	isActive = '1';
	issuedUserIds = [];
	reviewedUserIds = [];
	approvedUserIds = [];
	qmrUserIds = [];
	issuedSearch = '';
	reviewedSearch = '';
	approvedSearch = '';
	qmrSearch = '';
}

function editFlow(flowId: number) {
	const flow = data.flows.find((f: Flow) => f.id === flowId);
	if (!flow) return;
	const steps = getFlowSteps(flowId);
	const issued = steps.find((s: Step) => s.step_key === 'issued_by');
	const reviewed = steps.find((s: Step) => s.step_key === 'reviewed_by');
	const approved = steps.find((s: Step) => s.step_key === 'approved_by');

	editingFlowId = flow.id;
	flowName = flow.name;
	departmentId = flow.department_id;
	isActive = flow.is_active ? '1' : '0';
	issuedUserIds = parseIds(issued?.approver_user_ids_json);
	reviewedUserIds = parseIds(reviewed?.approver_user_ids_json);
	approvedUserIds = parseIds(approved?.approver_user_ids_json);
	qmrUserIds = parseIds(flow.qmr_user_ids_json);
}
</script>

<div class="space-y-4">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">IsoDocs Approval Flow</h1>
		<p class="text-sm text-gray-500">
			Configure 3-stage flow per department with multiple users. Stage transitions also send email; LINE OA
			push is sent when <code class="rounded bg-gray-100 px-1">LINE_CHANNEL_ACCESS_TOKEN</code> is set in
			<code class="rounded bg-gray-100 px-1">.env</code> and each approver has LINE User ID in Users.
		</p>
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
		<h2 class="mb-3 text-lg font-semibold text-gray-800">Create / Update Flow</h2>
		<form
			method="POST"
			action="?/saveFlow"
			use:enhance={() => {
				return async ({ result, update }) => {
					await update();
					if (result.type === 'success' && result.data?.success) {
						invalidateAll();
					}
				};
			}}
			class="grid grid-cols-1 gap-3 md:grid-cols-2"
		>
			<div>
				<label for="name" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Flow Name</label>
				<input type="hidden" name="id" value={editingFlowId || ''} />
				<input id="name" name="name" bind:value={flowName} required class="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Production QMS Flow" />
			</div>

			<div>
				<label for="department_id" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Department</label>
				<select id="department_id" name="department_id" bind:value={departmentId} required class="w-full rounded border border-gray-300 px-3 py-2 text-sm">
					<option value="">-- Select Department --</option>
					{#each data.departments as d}
						<option value={d.id}>{d.name}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="is_active" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Status</label>
				<select id="is_active" name="is_active" bind:value={isActive} class="w-full rounded border border-gray-300 px-3 py-2 text-sm">
					<option value="1">Active</option>
					<option value="0">Inactive</option>
				</select>
			</div>

			<div class="md:col-span-2 grid grid-cols-1 gap-3 lg:grid-cols-3">
				<div class="rounded-lg border border-gray-200 p-3">
					<h3 class="mb-2 text-sm font-semibold text-gray-800">Stage 1: Issued By</h3>
					<label for="issued_search" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Search User</label>
					<input id="issued_search" bind:value={issuedSearch} class="mb-2 w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Search name..." />
					<label for="issued_user_ids" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Users (multiple)</label>
					<select id="issued_user_ids" name="issued_user_ids" bind:value={issuedUserIds} multiple class="h-40 w-full rounded border border-gray-300 px-2 py-1 text-sm">
						{#each issuedUsers as u}
							<option value={u.id}>{u.full_name}</option>
						{/each}
					</select>
				</div>

				<div class="rounded-lg border border-gray-200 p-3">
					<h3 class="mb-2 text-sm font-semibold text-gray-800">Stage 2: Reviewed By</h3>
					<label for="reviewed_search" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Search User</label>
					<input id="reviewed_search" bind:value={reviewedSearch} class="mb-2 w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Search name..." />
					<label for="reviewed_user_ids" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Users (multiple)</label>
					<select id="reviewed_user_ids" name="reviewed_user_ids" bind:value={reviewedUserIds} multiple class="h-40 w-full rounded border border-gray-300 px-2 py-1 text-sm">
						{#each reviewedUsers as u}
							<option value={u.id}>{u.full_name}</option>
						{/each}
					</select>
				</div>

				<div class="rounded-lg border border-gray-200 p-3">
					<h3 class="mb-2 text-sm font-semibold text-gray-800">Stage 3: Approved By</h3>
					<label for="approved_search" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Search User</label>
					<input id="approved_search" bind:value={approvedSearch} class="mb-2 w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Search name..." />
					<label for="approved_user_ids" class="mb-1 block text-xs font-semibold uppercase text-gray-500">Users (multiple)</label>
					<select id="approved_user_ids" name="approved_user_ids" bind:value={approvedUserIds} multiple class="h-40 w-full rounded border border-gray-300 px-2 py-1 text-sm">
						{#each approvedUsers as u}
							<option value={u.id}>{u.full_name}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="md:col-span-2 rounded-lg border border-gray-200 p-3">
				<h3 class="mb-2 text-sm font-semibold text-gray-800">Notify QMR (multiple)</h3>
				<p class="mb-2 text-xs text-gray-500">
					After final approval, the system will email QMR users to notify document status update.
				</p>
				<label for="qmr_user_ids" class="mb-1 block text-xs font-semibold uppercase text-gray-500">
					QMR Users
				</label>
				<input id="qmr_search" bind:value={qmrSearch} class="mb-2 w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Search name..." />
				<select
					id="qmr_user_ids"
					name="qmr_user_ids"
					bind:value={qmrUserIds}
					multiple
					class="h-40 w-full rounded border border-gray-300 px-2 py-1 text-sm"
				>
					{#each qmrUsers as u}
						<option value={u.id}>{u.full_name}</option>
					{/each}
				</select>
			</div>

			<div class="md:col-span-2">
				<div class="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
					DAR List / Roles: {DAR_UI_WORKFLOW_LINE}.
				</div>
			</div>

			<div class="md:col-span-2 flex gap-2">
				<button type="submit" class="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
					{editingFlowId ? 'Update Flow' : 'Save Flow'}
				</button>
				{#if editingFlowId}
					<button type="button" class="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50" onclick={resetForm}>
						Cancel Edit
					</button>
				{/if}
			</div>
		</form>
	</div>

	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<h2 class="mb-3 text-lg font-semibold text-gray-800">Existing Flows</h2>
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Name</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Department</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Email Sequence</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Status</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Steps</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100 bg-white">
					{#if data.flows.length === 0}
						<tr>
							<td colspan="6" class="px-3 py-6 text-center text-gray-500">No approval flows yet.</td>
						</tr>
					{:else}
						{#each data.flows as f}
							<tr>
								<td class="px-3 py-2 font-semibold text-gray-700">{f.name}</td>
								<td class="px-3 py-2">{f.department_name}</td>
								<td class="px-3 py-2 text-xs text-gray-600">{getSequenceLabel(f.id)}</td>
								<td class="px-3 py-2">
									<span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${f.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
										{f.is_active ? 'Active' : 'Inactive'}
									</span>
								</td>
								<td class="px-3 py-2">
									{data.steps.filter((s: Step) => s.iso_approval_flow_id === f.id).length}
								</td>
								<td class="px-3 py-2">
									<div class="flex gap-1">
										<button type="button" class="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100" onclick={() => editFlow(f.id)}>
											Edit
										</button>
										<form method="POST" action="?/deleteFlow" onsubmit={() => confirm('Delete this flow?')}>
											<input type="hidden" name="id" value={f.id} />
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
