<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { formatDarNoDisplay } from '$lib/darNoFormat';
	import { formatOptionalDateTime } from '$lib/formatDateTime';
	import { t } from '$lib/i18n';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();
	type Document = PageData['documents'][0];

	/** Master list + latest DAR row — prefer in-flight DAR step for the status column */
	function documentWorkflowDisplay(doc: Document) {
		const d = doc.latest_dar_status;
		if (d === 'submitted') return 'Issuer submitted';
		if (d === 'reviewed') return 'Mgr reviewed';
		if (d === 'approved') return 'VP approved';
		if (d === 'rejected') return 'Rejected';
		if (d === 'registered') return 'QMR controlled';
		const m = String(doc.status || '').toLowerCase();
		if (m === 'draft') return 'Temp';
		if (m === 'active') return 'Approved';
		if (m === 'inactive') return 'Inactive';
		if (m === 'obsolete') return 'Obsolete';
		if (m === 'superseded') return 'Superseded';
		return doc.status || '—';
	}

	function workflowBadgeClass(doc: Document) {
		const d = doc.latest_dar_status;
		if (d === 'submitted') return 'bg-amber-100 text-amber-900 border-amber-200';
		if (d === 'reviewed') return 'bg-yellow-100 text-yellow-900 border-yellow-200';
		if (d === 'approved') return 'bg-green-100 text-green-900 border-green-200';
		if (d === 'rejected') return 'bg-red-100 text-red-800 border-red-200';
		if (d === 'registered') return 'bg-blue-100 text-blue-900 border-blue-200';
		const m = String(doc.status || '').toLowerCase();
		if (m === 'active') return 'bg-green-100 text-green-700 border-green-200';
		if (m === 'draft') return 'bg-slate-100 text-slate-800 border-slate-200';
		if (m === 'inactive') return 'bg-gray-100 text-gray-700 border-gray-200';
		return 'bg-slate-100 text-slate-700 border-slate-200';
	}

	function auditActionLabel(action: string | null | undefined): string {
		const a = String(action || '').trim().toLowerCase();
		if (a === 'dar_registered_qmr') return 'QMR controlled';
		return String(action || '-');
	}

	function auditActionClass(action: string | null | undefined): string {
		const a = String(action || '').trim().toLowerCase();
		if (a === 'dar_registered_qmr') {
			return 'rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-semibold text-blue-700';
		}
		return 'text-gray-700';
	}

	function formatAuditTime(value: string | null | undefined): string {
		return formatOptionalDateTime(value);
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">{$t('IsoDocs Control')}</h1>
			<p class="mt-1 text-sm text-gray-500">ISO document list, workflow, and audit log</p>
		</div>
	</div>

	{#if data.scopeNotice}
		<div class="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-900">
			{data.scopeNotice}
		</div>
	{/if}

	{#if form?.message}
		<div
			class="rounded-lg border px-4 py-3 text-sm {form.success
				? 'border-green-200 bg-green-50 text-green-700'
				: 'border-red-200 bg-red-50 text-red-700'}"
		>
			{form.message}
		</div>
	{/if}

	{#if data.showDebug}
		<div class="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
			<div class="flex items-center justify-between gap-3">
				<h2 class="text-sm font-semibold text-indigo-800">Auth Debug (IsoDocs)</h2>
				<span class="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
					Role: {data.debugAuth.role || 'unknown'}
				</span>
			</div>
			<div class="mt-2 flex flex-wrap gap-1">
				{#if data.debugAuth.permissions.length === 0}
					<span class="text-xs text-indigo-700">No permissions</span>
				{:else}
					{#each data.debugAuth.permissions as permission}
						<span class="rounded border border-indigo-200 bg-white px-2 py-0.5 text-xs text-indigo-700">
							{permission}
						</span>
					{/each}
				{/if}
			</div>
		</div>
	{/if}

	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<form method="GET" class="grid grid-cols-1 gap-3 md:grid-cols-4">
			<div class="md:col-span-2">
				<label for="search_query" class="mb-1 block text-xs font-semibold tracking-wide text-gray-500 uppercase">Search</label>
				<input
					id="search_query"
					type="text"
					name="search"
					value={data.filters.search}
					placeholder="Search doc no, title, description"
					class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
			</div>

			<div>
				<label for="doc_status" class="mb-1 block text-xs font-semibold tracking-wide text-gray-500 uppercase">Status</label>
				<select
					id="doc_status"
					name="status"
					class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
				>
					<option value="">All statuses</option>
					<optgroup label="Master list">
						<option value="draft" selected={data.filters.status === 'draft'}>Temp (draft)</option>
						<option value="active" selected={data.filters.status === 'active'}>Approved (active)</option>
						<option value="inactive" selected={data.filters.status === 'inactive'}>Inactive</option>
						<option value="obsolete" selected={data.filters.status === 'obsolete'}>Obsolete</option>
						<option value="superseded" selected={data.filters.status === 'superseded'}>Superseded</option>
					</optgroup>
					<optgroup label="DAR workflow (latest per doc)">
						<option value="dar_submitted" selected={data.filters.status === 'dar_submitted'}>Issuer submitted</option>
						<option value="dar_reviewed" selected={data.filters.status === 'dar_reviewed'}>Mgr reviewed</option>
						<option value="dar_approved" selected={data.filters.status === 'dar_approved'}>VP approved</option>
						<option value="dar_registered" selected={data.filters.status === 'dar_registered'}>QMR controlled</option>
						<option value="dar_rejected" selected={data.filters.status === 'dar_rejected'}>DAR rejected</option>
					</optgroup>
				</select>
			</div>

			<div class="flex items-end gap-2">
				<button
					type="submit"
					class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
				>
					Filter
				</button>
				<a
					href="/isodocs-control"
					class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
				>
					Reset
				</a>
			</div>
		</form>
	</div>

	<!-- Status Summary Cards -->
	<div class="grid grid-cols-2 gap-3 md:grid-cols-6">
		<div class="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
			<div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Issuer Submitted</div>
			<div class="mt-1 text-2xl font-bold text-gray-700">
				{data.statusSummary?.issuerSubmitted ?? 0}
			</div>
		</div>
		<div class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 shadow-sm">
			<div class="text-xs font-semibold uppercase tracking-wide text-yellow-700">Mgr Reviewed</div>
			<div class="mt-1 text-2xl font-bold text-yellow-800">
				{data.statusSummary?.mgrReviewed ?? 0}
			</div>
		</div>
		<div class="rounded-lg border border-green-200 bg-green-50 p-3 shadow-sm">
				<div class="text-xs font-semibold uppercase tracking-wide text-green-700">VP Approved</div>
			<div class="mt-1 text-2xl font-bold text-green-800">
					{data.statusSummary?.vpApproved ?? 0}
			</div>
		</div>
		<div class="rounded-lg border border-blue-200 bg-blue-50 p-3 shadow-sm">
			<div class="text-xs font-semibold uppercase tracking-wide text-blue-700">QMR Controlled</div>
			<div class="mt-1 text-2xl font-bold text-blue-800">
				{data.statusSummary?.qmrControlled ?? 0}
			</div>
		</div>
		<div class="rounded-lg border border-red-200 bg-red-50 p-3 shadow-sm">
			<div class="text-xs font-semibold uppercase tracking-wide text-red-700">Reject</div>
			<div class="mt-1 text-2xl font-bold text-red-800">
				{data.statusSummary?.reject ?? 0}
			</div>
		</div>
		<div class="rounded-lg border border-slate-300 bg-slate-50 p-3 shadow-sm">
			<div class="text-xs font-semibold uppercase tracking-wide text-slate-700">Cancel</div>
			<div class="mt-1 text-2xl font-bold text-slate-800">
				{data.statusSummary?.cancel ?? 0}
			</div>
		</div>
	</div>

	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<div class="mb-3 flex flex-wrap items-end justify-between gap-3">
			<h2 class="text-lg font-semibold text-gray-800">Audit Log</h2>
			<form method="GET" class="flex w-full flex-wrap items-end justify-end gap-2 lg:w-auto">
				<input type="hidden" name="search" value={data.filters.search} />
				<input type="hidden" name="status" value={data.filters.status} />
				<div>
					<label for="audit_search" class="mb-1 block text-xs font-semibold text-gray-500">Search</label>
					<input
						id="audit_search"
						type="text"
						name="audit_search"
						value={data.filters.auditSearch}
						placeholder="Search..."
						class="w-52 rounded border border-gray-300 px-2 py-1 text-sm lg:w-64"
					/>
				</div>
				<div>
					<label for="audit_limit" class="mb-1 block text-xs font-semibold text-gray-500">Display limit</label>
					<select id="audit_limit" name="audit_limit" class="min-w-[76px] rounded border border-gray-300 px-2 pr-7 py-1 text-sm">
						<option value="10" selected={data.filters.auditLimit === 10}>10</option>
						<option value="20" selected={data.filters.auditLimit === 20}>20</option>
						<option value="50" selected={data.filters.auditLimit === 50}>50</option>
						<option value="100" selected={data.filters.auditLimit === 100}>100</option>
						<option value="200" selected={data.filters.auditLimit === 200}>200</option>
					</select>
				</div>
				<button type="submit" class="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Search</button>
				<a
					href={`/isodocs-control/audit-log-export?audit_search=${encodeURIComponent(data.filters.auditSearch || '')}&audit_limit=${encodeURIComponent(String(data.filters.auditLimit || 20))}`}
					class="rounded border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100"
				>
					Download Excel
				</a>
			</form>
		</div>
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Time</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">User</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Action</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Iso_Section (BB)</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Document Type</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Document Name</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Document Ref</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Remark</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100 bg-white">
					{#if data.auditLogs.length === 0}
						<tr>
							<td colspan="8" class="px-3 py-6 text-center text-gray-500">No audit logs yet.</td>
						</tr>
					{:else}
						{#each data.auditLogs as log}
							<tr>
								<td class="px-3 py-2 text-gray-600">{formatAuditTime(log.created_at)}</td>
								<td class="px-3 py-2 text-gray-700">{log.user_name || '-'}</td>
								<td class="px-3 py-2">
									<span class={auditActionClass(log.action)}>{auditActionLabel(log.action)}</span>
								</td>
								<td class="px-3 py-2 text-gray-700">{log.department_name || '-'}</td>
								<td class="px-3 py-2 text-gray-700">{log.document_type || '-'}</td>
								<td class="px-3 py-2 text-gray-700">{log.document_name || '-'}</td>
								<td class="px-3 py-2 text-gray-700">{formatDarNoDisplay(log.doc_no)} - {log.doc_title}</td>
								<td class="max-w-xl px-3 py-2 text-gray-600 break-words">{log.remark || '-'}</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
