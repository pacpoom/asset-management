<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { formatDarNoDisplay } from '$lib/darNoFormat';
	import { t } from '$lib/i18n';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();
	type Document = PageData['documents'][0];

	function statusBadgeClass(status: string) {
		switch (status) {
			case 'active':
			case 'approved':
			case 'original_controlled':
				return 'bg-green-100 text-green-700 border-green-200';
			case 'pending':
				return 'bg-amber-100 text-amber-700 border-amber-200';
			case 'rejected':
				return 'bg-red-100 text-red-700 border-red-200';
			case 'distribution_controlled':
				return 'bg-blue-100 text-blue-700 border-blue-200';
			case 'distribution_uncontrolled':
				return 'bg-indigo-100 text-indigo-700 border-indigo-200';
			case 'cancelled':
				return 'bg-gray-100 text-gray-700 border-gray-200';
			default:
				return 'bg-slate-100 text-slate-700 border-slate-200';
		}
	}

	function statusLabel(status: string) {
		if (status === 'original_controlled' || status === 'active') return 'Approved';
		return status.replaceAll('_', ' ');
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">{$t('IsoDocs Control')}</h1>
			<p class="mt-1 text-sm text-gray-500">ISO document list, workflow, and audit log</p>
		</div>
	</div>

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
					<option value="">All</option>
					<option value="active" selected={data.filters.status === 'active'}>Approved</option>
					<option value="draft" selected={data.filters.status === 'draft'}>Draft</option>
					<option value="obsolete" selected={data.filters.status === 'obsolete'}>Obsolete</option>
					<option value="superseded" selected={data.filters.status === 'superseded'}>Superseded</option>
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
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-gray-800">Documents</h2>
			<div class="text-xs text-gray-500">
				Latest {data.documents.length} items from Document Master List
			</div>
		</div>

		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Doc No</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Title</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Version</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Effective Date</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Status</th>
						<th class="px-3 py-2 text-left font-semibold text-gray-600">Updated At</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100 bg-white">
					{#if data.documents.length === 0}
						<tr>
							<td colspan="6" class="px-3 py-6 text-center text-gray-500">No documents found.</td>
						</tr>
					{:else}
						{#each data.documents as doc}
							<tr>
								<td class="px-3 py-2 font-semibold text-gray-700">{doc.doc_no}</td>
								<td class="px-3 py-2">{doc.title}</td>
								<td class="px-3 py-2">{doc.version}</td>
								<td class="px-3 py-2 text-gray-600">{doc.effective_date ? new Date(doc.effective_date).toLocaleDateString() : '-'}</td>
								<td class="px-3 py-2">
									<span class="rounded-full border px-2 py-0.5 text-xs font-semibold capitalize {statusBadgeClass(doc.status)}">
										{statusLabel(doc.status)}
									</span>
								</td>
								<td class="px-3 py-2 text-gray-600">{new Date(doc.updated_at).toLocaleString()}</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
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
						<option value="20" selected={data.filters.auditLimit === 20}>20</option>
						<option value="50" selected={data.filters.auditLimit === 50}>50</option>
						<option value="100" selected={data.filters.auditLimit === 100}>100</option>
						<option value="200" selected={data.filters.auditLimit === 200}>200</option>
					</select>
				</div>
				<button type="submit" class="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Search</button>
				<a
					href={`/isodocs-control/audit-log-export?audit_search=${encodeURIComponent(data.filters.auditSearch || '')}&audit_limit=${encodeURIComponent(String(data.filters.auditLimit || 50))}`}
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
								<td class="px-3 py-2 text-gray-600">{new Date(log.created_at).toLocaleString()}</td>
								<td class="px-3 py-2 text-gray-700">{log.user_name || '-'}</td>
								<td class="px-3 py-2 text-gray-700">{log.action}</td>
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
