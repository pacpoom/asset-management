<script lang="ts">
	import { t } from '$lib/i18n';
	import type { PageData } from './$types';

	const { data } = $props<{ data: PageData }>();

	// ── Filter form state ─────────────────────────────────────────────────────
	let dateFrom = $state(data.filters.dateFrom);
	let dateTo   = $state(data.filters.dateTo);
	let status   = $state(data.filters.status);
	let search   = $state(data.filters.search);

	// ── Expand / collapse each advance group ─────────────────────────────────
	let expanded = $state<Set<number>>(new Set(data.report.map((a: any) => a.id)));

	function toggleExpand(id: number) {
		if (expanded.has(id)) expanded.delete(id);
		else expanded.add(id);
		expanded = new Set(expanded); // trigger reactivity
	}
	function expandAll()   { expanded = new Set(data.report.map((a: any) => a.id)); }
	function collapseAll() { expanded = new Set(); }

	// ── Helpers ───────────────────────────────────────────────────────────────
	function fmtDate(d: string) {
		if (!d) return '-';
		return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
	}
	function fmtCurrency(n: number) {
		return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}
	function statusClass(s: string) {
		switch (s) {
			case 'Approved':  return 'bg-green-100 text-green-800';
			case 'Rejected':  return 'bg-red-100 text-red-800';
			case 'Completed': return 'bg-blue-100 text-blue-800';
			default:          return 'bg-yellow-100 text-yellow-800';
		}
	}
	function statusLabel(s: string) {
		switch (s) {
			case 'Approved':  return $t('adv.status_approved');
			case 'Rejected':  return $t('adv.status_rejected');
			case 'Completed': return $t('adv.status_completed');
			default:          return $t('adv.status_pending');
		}
	}

	function buildUrl(overrides: Record<string, string | number> = {}) {
		const p = new URLSearchParams();
		const base: Record<string, string> = {
			date_from: dateFrom, date_to: dateTo, status, search,
			page: String(data.currentPage)
		};
		for (const [k, v] of Object.entries({ ...base, ...overrides })) {
			if (v && v !== '') p.set(k, String(v));
		}
		return `?${p.toString()}`;
	}

	function buildExportUrl() {
		const p = new URLSearchParams();
		if (dateFrom) p.set('date_from', dateFrom);
		if (dateTo)   p.set('date_to',   dateTo);
		if (status)   p.set('status',    status);
		if (search)   p.set('search',    search);
		return `/advance-expense/report/export?${p.toString()}`;
	}
</script>

<svelte:head>
	<title>Advance Expense Report | Core Business</title>
</svelte:head>

<div class="space-y-5">

	<!-- ── Tab Navigation ──────────────────────────────────────────────────── -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex gap-1">
			<a href="/advance-expense"
				class="inline-flex items-center gap-1.5 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700">
				<span class="material-symbols-outlined text-base">receipt_long</span>
				{$t('adv.page_title')}
			</a>
			<a href="/advance-expense/report"
				class="inline-flex items-center gap-1.5 border-b-2 border-blue-600 px-4 py-2.5 text-sm font-medium text-blue-600">
				<span class="material-symbols-outlined text-base">analytics</span>
				{$t('adv.rpt.tab')}
			</a>
		</nav>
	</div>

	<!-- ── Page Header ─────────────────────────────────────────────────────── -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">{$t('adv.rpt.title')}</h1>
			<p class="text-sm text-gray-500">{$t('adv.rpt.desc')}</p>
		</div>
		<div class="flex gap-2">
			<button type="button" onclick={expandAll}
				class="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
				{$t('adv.rpt.expand_all')}
			</button>
			<button type="button" onclick={collapseAll}
				class="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
				{$t('adv.rpt.collapse_all')}
			</button>
			<a href={buildExportUrl()}
				class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 shadow-sm">
				<span class="material-symbols-outlined text-sm">download</span>
				Export Excel
			</a>
		</div>
	</div>

	<!-- ── Filter Form ──────────────────────────────────────────────────────── -->
	<form method="GET" class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
			<div class="col-span-2 sm:col-span-1">
				<label class="mb-1 block text-xs font-medium text-gray-600">{$t('adv.rpt.date_from')}</label>
				<input type="date" name="date_from" bind:value={dateFrom}
					class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
			</div>
			<div class="col-span-2 sm:col-span-1">
				<label class="mb-1 block text-xs font-medium text-gray-600">{$t('adv.rpt.date_to')}</label>
				<input type="date" name="date_to" bind:value={dateTo}
					class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
			</div>
			<div>
				<label class="mb-1 block text-xs font-medium text-gray-600">{$t('adv.rpt.col_status')}</label>
				<select name="status" bind:value={status}
					class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
					<option value="">{$t('adv.all_status')}</option>
					<option value="Pending">{$t('adv.status_pending')}</option>
					<option value="Approved">{$t('adv.status_approved')}</option>
					<option value="Rejected">{$t('adv.status_rejected')}</option>
					<option value="Completed">{$t('adv.status_completed')}</option>
				</select>
			</div>
			<div class="col-span-2 sm:col-span-1 lg:col-span-1">
				<label class="mb-1 block text-xs font-medium text-gray-600">{$t('adv.search')}</label>
				<input type="text" name="search" bind:value={search} placeholder={$t('adv.rpt.search_ph')}
					class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
			</div>
			<div class="flex items-end gap-2">
				<button type="submit"
					class="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
					{$t('adv.search')}
				</button>
				<a href="/advance-expense/report"
					class="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
					{$t('adv.clear')}
				</a>
			</div>
		</div>
	</form>

	<!-- ── Summary Bar ─────────────────────────────────────────────────────── -->
	<div class="flex items-center justify-between text-sm text-gray-500">
		<span>{$t('adv.rpt.found_pre')} <strong class="text-gray-800">{data.total}</strong> {$t('adv.rpt.found_suf')}</span>
		{#if data.totalPages > 1}
			<span>{$t('adv.rpt.page_label')} {data.currentPage} / {data.totalPages}</span>
		{/if}
	</div>

	<!-- ── Report Table ─────────────────────────────────────────────────────── -->
	{#if data.report.length === 0}
		<div class="rounded-xl border border-gray-200 bg-white py-16 text-center">
			<span class="material-symbols-outlined text-5xl text-gray-300">analytics</span>
			<p class="mt-3 text-gray-500">{$t('adv.rpt.no_data')}</p>
		</div>
	{:else}
		<div class="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
			<table class="min-w-full divide-y divide-gray-200 text-xs">
				<thead class="sticky top-0 z-10 bg-gray-50 text-[11px]">
					<tr>
						<!-- Advance columns -->
						<th class="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-gray-600">{$t('adv.rpt.col_doc_no')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-center font-semibold text-gray-600">{$t('adv.rpt.col_status')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-gray-600">{$t('adv.rpt.col_date')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-gray-600">{$t('adv.bank_label')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-gray-600">{$t('adv.created_by')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-gray-600 max-w-[180px]">{$t('adv.reason')}</th>
						<!-- Item columns -->
						<th class="whitespace-nowrap border-l border-gray-300 px-3 py-2.5 text-left font-semibold text-gray-600">{$t('adv.rpt.col_tx_date')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-gray-600">{$t('adv.rpt.col_product')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-gray-600">{$t('adv.rpt.col_cost_center')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-gray-600">{$t('adv.rpt.col_acct_code')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-gray-600">{$t('adv.rpt.col_sub_acct')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-gray-600">{$t('adv.rpt.col_acct_name')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-gray-600">{$t('adv.rpt.col_acct_name_th')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-center font-semibold text-gray-600">{$t('adv.rpt.col_acct_type')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-center font-semibold text-gray-600">{$t('adv.rpt.col_dr_cr')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-gray-600">{$t('adv.rpt.col_qty')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-gray-600">{$t('adv.rpt.col_price')}</th>
						<th class="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-gray-600">{$t('adv.rpt.col_total')}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100">
					{#each data.report as adv (adv.id)}
						<!-- ── Advance Header Row ─────────────────────────────── -->
						<tr class="cursor-pointer bg-blue-50 hover:bg-blue-100 transition-colors"
							onclick={() => toggleExpand(adv.id)}>
							<td class="whitespace-nowrap px-3 py-2 font-bold text-blue-800">
								<div class="flex items-center gap-1">
									<span class="material-symbols-outlined text-sm text-blue-400">
										{expanded.has(adv.id) ? 'expand_more' : 'chevron_right'}
									</span>
									<a href="/advance-expense/{adv.id}"
										onclick={(e) => e.stopPropagation()}
										class="hover:underline">{adv.document_number}</a>
								</div>
							</td>
							<td class="whitespace-nowrap px-3 py-2 text-center">
								<span class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold {statusClass(adv.status)}">
									{statusLabel(adv.status)}
								</span>
							</td>
							<td class="whitespace-nowrap px-3 py-2 text-gray-700">{fmtDate(adv.document_date)}</td>
							<td class="whitespace-nowrap px-3 py-2 text-gray-700">{adv.bank_name || '-'}</td>
							<td class="whitespace-nowrap px-3 py-2 text-gray-700">{adv.creator_name || '-'}</td>
							<td class="px-3 py-2 text-gray-700 max-w-[180px] truncate" title={adv.reason}>{adv.reason}</td>
							<!-- ยอดรวมเอกสาร colspan -->
							<td colspan="11" class="px-3 py-2 text-right text-[10px] text-blue-500">
								{adv.items.length} {$t('adv.rpt.items_count')} •
								{$t('adv.rpt.budget')} {fmtCurrency(adv.amount)} ฿
							</td>
						</tr>

						<!-- ── Item Rows ──────────────────────────────────────── -->
						{#if expanded.has(adv.id)}
							{#if adv.items.length === 0}
								<tr class="bg-gray-50">
									<td colspan="18" class="px-6 py-3 text-center text-xs text-gray-400 italic">
										— {$t('adv.rpt.no_items')} —
									</td>
								</tr>
							{:else}
								{#each adv.items as item (item.item_id)}
									<tr class="hover:bg-gray-50 transition-colors">
										<!-- Advance columns (blank — already shown in header) -->
										<td colspan="6" class="border-r border-gray-100 px-3 py-2">
											{#if item.job_number}
												<span class="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
													<span class="material-symbols-outlined text-[11px]">work</span>
													{item.job_number}
												</span>
											{/if}
										</td>
										<!-- Item columns -->
										<td class="whitespace-nowrap border-l border-gray-300 px-3 py-2 text-gray-600">
											{fmtDate(item.transaction_date)}
											<span class="ml-1 inline-flex rounded px-1 py-0.5 text-[10px] font-medium
												{item.tx_type === 'expense' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}">
												{item.tx_type === 'expense' ? $t('adv.rpt.tx_expense') : $t('adv.rpt.tx_refund')}
											</span>
										</td>
										<td class="px-3 py-2 font-medium text-gray-800 max-w-[160px]">
											<div class="truncate" title={item.product_name}>{item.product_name}</div>
										</td>
										<td class="whitespace-nowrap px-3 py-2">
											{#if item.cost_center_code}
												<div class="text-[10px] font-semibold text-indigo-700">{item.cost_center_code}</div>
												{#if item.cost_center_name}
													<div class="text-[10px] text-gray-400">{item.cost_center_name}</div>
												{/if}
											{:else}
												<span class="text-gray-300">—</span>
											{/if}
										</td>
										<td class="whitespace-nowrap px-3 py-2">
											{#if item.account_code}
												<span class="font-mono text-[10px] font-semibold text-gray-800">{item.account_code}</span>
											{:else}
												<span class="text-gray-300">—</span>
											{/if}
										</td>
										<td class="whitespace-nowrap px-3 py-2">
											{#if item.sub_account_code && item.sub_account_code !== '0'}
												<span class="font-mono text-[10px] text-gray-600">{item.sub_account_code}</span>
											{:else}
												<span class="text-gray-300">—</span>
											{/if}
										</td>
										<td class="px-3 py-2 max-w-[160px]">
											{#if item.account_name}
												<div class="truncate text-[11px] text-gray-700" title={item.account_name}>{item.account_name}</div>
											{:else}
												<span class="text-gray-300">—</span>
											{/if}
										</td>
										<td class="px-3 py-2 max-w-[160px]">
											{#if item.account_name_th}
												<div class="truncate text-[11px] text-gray-500" title={item.account_name_th}>{item.account_name_th}</div>
											{:else}
												<span class="text-gray-300">—</span>
											{/if}
										</td>
										<td class="whitespace-nowrap px-3 py-2 text-center">
											{#if item.account_type}
												<span class="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium
													{item.account_type === 'Asset' ? 'bg-blue-100 text-blue-700' :
													 item.account_type === 'Liability' ? 'bg-red-100 text-red-700' :
													 item.account_type === 'Revenue' ? 'bg-green-100 text-green-700' :
													 item.account_type === 'Expense' ? 'bg-orange-100 text-orange-700' :
													 'bg-gray-100 text-gray-600'}">
													{item.account_type}
												</span>
											{:else}
												<span class="text-gray-300">—</span>
											{/if}
										</td>
										<td class="whitespace-nowrap px-3 py-2 text-center">
											<span class="inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold
												{item.debit_credit === 'Debit' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}">
												{item.debit_credit === 'Debit' ? 'Dr' : 'Cr'}
											</span>
										</td>
										<td class="whitespace-nowrap px-3 py-2 text-right text-gray-600">{Number(item.qty)}</td>
										<td class="whitespace-nowrap px-3 py-2 text-right text-gray-600">{fmtCurrency(item.price)}</td>
										<td class="whitespace-nowrap px-3 py-2 text-right font-semibold
											{item.tx_type === 'expense' ? 'text-orange-700' : 'text-purple-700'}">
											{fmtCurrency(item.amount)}
										</td>
									</tr>
								{/each}

								<!-- Subtotal row -->
								{@const totalItems = adv.items.reduce((s: number, i: any) =>
									s + (i.tx_type === 'expense' ? Number(i.amount) : -Number(i.amount)), 0)}
								<tr class="border-t border-blue-200 bg-blue-50/60">
									<td colspan="17" class="px-3 py-1.5 text-right text-[11px] text-blue-600">
										{$t('adv.rpt.subtotal')} {adv.document_number}
									</td>
									<td class="px-3 py-1.5 text-right text-[11px] font-bold text-blue-800">
										{fmtCurrency(Math.abs(totalItems))} ฿
									</td>
								</tr>
							{/if}
						{/if}
					{/each}
				</tbody>
			</table>
		</div>

		<!-- ── Pagination ──────────────────────────────────────────────────── -->
		{#if data.totalPages > 1}
			<div class="flex items-center justify-center gap-2">
				{#if data.currentPage > 1}
					<a href={buildUrl({ page: data.currentPage - 1 })}
						class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">{$t('adv.rpt.prev')}</a>
				{/if}
				{#each Array.from({ length: data.totalPages }, (_, i) => i + 1) as p}
					{#if Math.abs(p - data.currentPage) <= 2 || p === 1 || p === data.totalPages}
						<a href={buildUrl({ page: p })}
							class="rounded-lg px-3 py-1.5 text-sm {p === data.currentPage ? 'bg-blue-600 text-white font-semibold' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}">
							{p}
						</a>
					{:else if Math.abs(p - data.currentPage) === 3}
						<span class="px-1 text-gray-400">…</span>
					{/if}
				{/each}
				{#if data.currentPage < data.totalPages}
					<a href={buildUrl({ page: data.currentPage + 1 })}
						class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">{$t('adv.rpt.next')}</a>
				{/if}
			</div>
		{/if}
	{/if}
</div>
