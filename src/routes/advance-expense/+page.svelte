<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { t } from '$lib/i18n';
	import type { PageData, ActionData } from './$types';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let showCreateModal = $state(false);
	let showDeleteConfirm = $state(false);
	let deleteTarget = $state<{ id: number; number: string } | null>(null);
	let showStatusModal = $state(false);
	let statusTarget = $state<{ id: number; number: string; status: string } | null>(null);
	let isSubmitting = $state(false);

	$effect(() => {
		if (form) {
			if ((form as any).success) {
				toast.success((form as any).message || $t('adv.save'));
				showCreateModal = false;
				showDeleteConfirm = false;
				showStatusModal = false;
			} else if ((form as any).message) {
				toast.error((form as any).message);
			}
			isSubmitting = false;
		}
	});

	function statusColor(status: string) {
		switch (status) {
			case 'Approved': return 'bg-green-100 text-green-800';
			case 'Rejected': return 'bg-red-100 text-red-800';
			case 'Completed': return 'bg-blue-100 text-blue-800';
			default: return 'bg-yellow-100 text-yellow-800';
		}
	}

	function statusLabel(status: string) {
		switch (status) {
			case 'Approved': return $t('adv.status_approved');
			case 'Rejected': return $t('adv.status_rejected');
			case 'Completed': return $t('adv.status_completed');
			default: return $t('adv.status_pending');
		}
	}

	function formatCurrency(n: number) {
		return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	function formatDate(d: string) {
		if (!d) return '-';
		return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	const todayStr = new Date().toISOString().split('T')[0];

	function buildUrl(p: number) {
		const params = new URLSearchParams();
		if (data.searchQuery) params.set('search', data.searchQuery);
		if (data.filterStatus) params.set('status', data.filterStatus);
		params.set('page', String(p));
		return `?${params.toString()}`;
	}
</script>

<svelte:head>
	<title>{$t('adv.page_title')} | Core Business</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">{$t('adv.page_title')}</h1>
			<p class="text-sm text-gray-500">{$t('adv.page_desc')}</p>
		</div>
		<button
			type="button"
			onclick={() => (showCreateModal = true)}
			class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
		>
			<span class="material-symbols-outlined text-base">add</span>
			{$t('adv.create_new')}
		</button>
	</div>

	<!-- Search + Filter -->
	<form method="GET" class="flex flex-col gap-3 sm:flex-row">
		<input
			type="text"
			name="search"
			value={data.searchQuery}
			placeholder={$t('adv.search_placeholder')}
			class="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
		/>
		<select name="status" class="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none">
			<option value="">{$t('adv.all_status')}</option>
			<option value="Pending"   selected={data.filterStatus === 'Pending'}>{$t('adv.status_pending')}</option>
			<option value="Approved"  selected={data.filterStatus === 'Approved'}>{$t('adv.status_approved')}</option>
			<option value="Rejected"  selected={data.filterStatus === 'Rejected'}>{$t('adv.status_rejected')}</option>
			<option value="Completed" selected={data.filterStatus === 'Completed'}>{$t('adv.status_completed')}</option>
		</select>
		<button type="submit" class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
			{$t('adv.search')}
		</button>
		{#if data.searchQuery || data.filterStatus}
			<a href="/advance-expense" class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
				{$t('adv.clear')}
			</a>
		{/if}
	</form>

	<!-- Table -->
	<div class="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('adv.doc_number')}</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('adv.doc_date')}</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('adv.title')}</th>
					<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('adv.advance_amount')}</th>
					<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('adv.used_amount')}</th>
					<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('adv.balance')}</th>
					<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Status')}</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('adv.created_by')}</th>
					<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('adv.actions')}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-100">
				{#each data.applications as app}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3">
							<a href="/advance-expense/{app.id}" class="font-mono text-blue-600 hover:underline">
								{app.document_number}
							</a>
						</td>
						<td class="px-4 py-3 text-gray-600">{formatDate(app.document_date)}</td>
						<td class="px-4 py-3 font-medium text-gray-900">{app.application_title}</td>
						<td class="px-4 py-3 text-right font-mono text-gray-900">{formatCurrency(app.amount)}</td>
						<td class="px-4 py-3 text-right font-mono text-orange-600">{formatCurrency(app.total_spent)}</td>
						<td class="px-4 py-3 text-right font-mono font-semibold {app.balance < 0 ? 'text-red-600' : 'text-green-700'}">
							{formatCurrency(app.balance)}
						</td>
						<td class="px-4 py-3 text-center">
							<span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold {statusColor(app.status)}">
								{statusLabel(app.status)}
							</span>
						</td>
						<td class="px-4 py-3 text-gray-600">{app.creator_name || '-'}</td>
						<td class="px-4 py-3">
							<div class="flex items-center justify-center gap-1">
								<a href="/advance-expense/{app.id}"
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
									title={$t('adv.view_detail') || 'View'}>
									<span class="material-symbols-outlined text-lg">visibility</span>
								</a>
								<a href="/advance-expense/{app.id}/print" target="_blank"
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-green-600"
									title={$t('adv.print_doc')}>
									<span class="material-symbols-outlined text-lg">print</span>
								</a>
								<button type="button"
									onclick={() => { statusTarget = { id: app.id, number: app.document_number, status: app.status }; showStatusModal = true; }}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-yellow-600"
									title={$t('adv.change_status_title')}>
									<span class="material-symbols-outlined text-lg">edit_note</span>
								</button>
								<button type="button"
									onclick={() => { deleteTarget = { id: app.id, number: app.document_number }; showDeleteConfirm = true; }}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
									title={$t('adv.delete')}>
									<span class="material-symbols-outlined text-lg">delete</span>
								</button>
							</div>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="9" class="px-4 py-12 text-center text-gray-400">
							<span class="material-symbols-outlined mb-2 block text-4xl">receipt_long</span>
							{$t('adv.no_records')}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Pagination -->
	{#if data.totalPages > 1}
		<div class="flex items-center justify-between">
			<p class="text-sm text-gray-500">{data.total} {$t('adv.no_records') ? '' : 'records'}</p>
			<div class="flex gap-1">
				{#if data.currentPage > 1}
					<a href={buildUrl(data.currentPage - 1)} class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">‹</a>
				{/if}
				{#each Array.from({ length: data.totalPages }, (_, i) => i + 1) as p}
					{#if p === data.currentPage}
						<span class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white">{p}</span>
					{:else if Math.abs(p - data.currentPage) <= 2 || p === 1 || p === data.totalPages}
						<a href={buildUrl(p)} class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">{p}</a>
					{:else if Math.abs(p - data.currentPage) === 3}
						<span class="px-1 py-1.5 text-gray-400">...</span>
					{/if}
				{/each}
				{#if data.currentPage < data.totalPages}
					<a href={buildUrl(data.currentPage + 1)} class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">›</a>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Create Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<h2 class="text-base font-bold text-gray-900">{$t('adv.create_modal_title')}</h2>
				<button onclick={() => (showCreateModal = false)} class="rounded-lg p-1 hover:bg-gray-100">
					<span class="material-symbols-outlined text-xl">close</span>
				</button>
			</div>
			<form method="POST" action="?/create"
				use:enhance={() => { isSubmitting = true; return async ({ update }) => { await update(); }; }}
				class="space-y-3 p-5">
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="mb-1 block text-xs font-medium text-gray-700">
							{$t('adv.document_date')} <span class="text-red-500">*</span>
						</label>
						<input type="date" name="document_date" value={todayStr} required
							class="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
					</div>
					<div>
						<label class="mb-1 block text-xs font-medium text-gray-700">
							{$t('adv.amount_thb')} <span class="text-red-500">*</span>
						</label>
						<input type="number" name="amount" min="0.01" step="0.01" placeholder="0.00" required
							class="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
					</div>
				</div>
				<div>
					<label class="mb-1 block text-xs font-medium text-gray-700">
						{$t('adv.application_title')} <span class="text-red-500">*</span>
					</label>
					<input type="text" name="application_title" placeholder={$t('adv.application_placeholder')} required
						class="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
				</div>
				<div>
					<label class="mb-1 block text-xs font-medium text-gray-700">
						{$t('adv.bank')} <span class="text-red-500">*</span>
					</label>
					<select name="bank_id" required
						class="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
						<option value="">{$t('adv.select_bank')}</option>
						{#each data.banks as bank}
							<option value={bank.id}>{bank.name}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="mb-1 block text-xs font-medium text-gray-700">
						{$t('adv.reason')} <span class="text-red-500">*</span>
					</label>
					<textarea name="reason" rows="2" required placeholder={$t('adv.reason_placeholder')}
						class="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"></textarea>
				</div>
				<div>
					<label class="mb-1 block text-xs font-medium text-gray-700">{$t('adv.remark')}</label>
					<textarea name="remark" rows="1" placeholder={$t('adv.remark_placeholder')}
						class="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"></textarea>
				</div>
				<div class="flex justify-end gap-3 pt-1">
					<button type="button" onclick={() => (showCreateModal = false)}
						class="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
						{$t('adv.cancel')}
					</button>
					<button type="submit" disabled={isSubmitting}
						class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
						{#if isSubmitting}
							<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
							{$t('adv.saving')}
						{:else}
							{$t('adv.save')}
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Status Modal -->
{#if showStatusModal && statusTarget}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">{$t('adv.change_status_title')}</h2>
				<button onclick={() => (showStatusModal = false)} class="rounded-lg p-1 hover:bg-gray-100">
					<span class="material-symbols-outlined">close</span>
				</button>
			</div>
			<form method="POST" action="?/updateStatus"
				use:enhance={() => { isSubmitting = true; return async ({ update }) => { await update(); }; }}
				class="space-y-4 p-6">
				<input type="hidden" name="id" value={statusTarget.id} />
				<p class="text-sm text-gray-600">{$t('adv.document_label')}: <strong>{statusTarget.number}</strong></p>
				<div>
					<label class="mb-1 block text-sm font-medium text-gray-700">{$t('Status')}</label>
					<select name="status" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
						<option value="Pending"   selected={statusTarget.status === 'Pending'}>{$t('adv.status_pending')}</option>
						<option value="Approved"  selected={statusTarget.status === 'Approved'}>{$t('adv.status_approved')}</option>
						<option value="Rejected"  selected={statusTarget.status === 'Rejected'}>{$t('adv.status_rejected')}</option>
						<option value="Completed" selected={statusTarget.status === 'Completed'}>{$t('adv.status_completed')}</option>
					</select>
				</div>
				<div class="flex justify-end gap-3">
					<button type="button" onclick={() => (showStatusModal = false)}
						class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
						{$t('adv.cancel')}
					</button>
					<button type="submit" disabled={isSubmitting}
						class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
						{$t('adv.save')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Confirm -->
{#if showDeleteConfirm && deleteTarget}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
			<div class="mb-4 flex items-center gap-3 text-red-600">
				<span class="material-symbols-outlined text-3xl">warning</span>
				<h2 class="text-lg font-bold">{$t('adv.confirm_delete_title')}</h2>
			</div>
			<p class="mb-6 text-sm text-gray-600">
				{$t('adv.confirm_delete_doc').replace('{0}', deleteTarget.number)}
			</p>
			<div class="flex justify-end gap-3">
				<button onclick={() => (showDeleteConfirm = false)}
					class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
					{$t('adv.cancel')}
				</button>
				<form method="POST" action="?/delete"
					use:enhance={() => { isSubmitting = true; return async ({ update }) => { await update(); }; }}>
					<input type="hidden" name="id" value={deleteTarget.id} />
					<button type="submit" class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
						{$t('adv.delete')}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
