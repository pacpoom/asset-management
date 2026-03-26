<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t, locale } from '$lib/i18n';

	export let data: any;

	$: columns = data.columns || [];
	$: pivotData = data.pivotData || [];
	$: filters = data.filters || { startDate: '', endDate: '', viewBy: 'category' };

	let startDate = '';
	let endDate = '';
	let viewBy = 'category';

	// Sync state
	$: {
		startDate = filters.startDate;
		endDate = filters.endDate;
		viewBy = filters.viewBy;
	}

	function applyFilter() {
		const url = new URL($page.url);
		if (startDate) url.searchParams.set('startDate', startDate);
		if (endDate) url.searchParams.set('endDate', endDate);
		if (viewBy) url.searchParams.set('viewBy', viewBy);
		goto(url.toString(), { keepFocus: true, noScroll: true });
	}

	// ฟอร์แมตตัวเลข
	const formatAmt = (num: number) => {
		if (!num || num === 0) return '-';
		return num.toLocaleString($locale === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	};

	const formatDate = (isoString: string) => {
		return new Date(isoString).toLocaleDateString($locale === 'th' ? 'th-TH' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	};

	// คำนวณผลรวมรวมด้านล่างสุดของตาราง (Grand Total)
	$: colTotals = columns.map((col: any) => {
		return pivotData.reduce((sum: number, job: any) => sum + (job.expenses[col.id] || 0), 0);
	});
	
	$: grandTotal = pivotData.reduce((sum: number, job: any) => sum + job.total, 0);
</script>

<svelte:head>
	<title>{$t('Job Expense Summary')}</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mb-6 flex flex-col justify-between gap-4 border-b border-gray-200 pb-4 lg:flex-row lg:items-end">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">{$t('Job Expense Summary (Pivot)')}</h1>
			<p class="text-sm text-gray-500">{$t('Summary report of expenses by category or item (based on job opening date)')}</p>
		</div>

		<div class="flex flex-wrap items-end gap-3">
			<div>
				<label for="viewBy" class="mb-1 block text-xs font-semibold text-gray-600">{$t('View By')}</label>
				<select id="viewBy" bind:value={viewBy} onchange={applyFilter} class="rounded-lg border-gray-300 py-2 px-3 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white">
					<option value="category">{$t('Category')}</option>
					<option value="item">{$t('Item')}</option>
				</select>
			</div>
			<div>
				<label for="start" class="mb-1 block text-xs font-semibold text-gray-600">{$t('From Date')}</label>
				<input type="date" id="start" bind:value={startDate} class="rounded-lg border-gray-300 py-2 px-3 text-sm focus:border-blue-500 focus:ring-blue-500" />
			</div>
			<div>
				<label for="end" class="mb-1 block text-xs font-semibold text-gray-600">{$t('To Date')}</label>
				<input type="date" id="end" bind:value={endDate} class="rounded-lg border-gray-300 py-2 px-3 text-sm focus:border-blue-500 focus:ring-blue-500" />
			</div>
			
			<div class="flex gap-2">
				<button onclick={applyFilter} class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow transition-colors">
					{$t('Search')}
				</button>

				<a
					href={`/freight-forwarder/job-expenses/export-excel?startDate=${startDate}&endDate=${endDate}&viewBy=${viewBy}&locale=${$locale}`}
					target="_blank"
					class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white shadow transition-colors hover:bg-green-700"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
					{$t('Export Excel')}
				</a>
			</div>
		</div>
	</div>

	<div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
		<div class="overflow-x-auto max-w-[calc(100vw-3rem)]">
			<table class="min-w-full divide-y divide-gray-200 text-sm whitespace-nowrap">
				<thead class="bg-gray-100 text-gray-700">
					<tr>
						<th class="sticky left-0 bg-gray-100 px-4 py-3 text-left font-semibold border-r border-gray-200 z-10 min-w-[120px]">{$t('Job No.')}</th>
						<th class="px-4 py-3 text-left font-semibold border-r border-gray-200 min-w-[100px]">{$t('Date')}</th>
						<th class="px-4 py-3 text-left font-semibold border-r border-gray-200 min-w-[200px] max-w-[250px]">{$t('Customer')}</th>
						
						{#each columns as col}
							<th class="px-4 py-3 text-right font-semibold text-xs text-gray-600 border-r border-gray-200 min-w-[120px]" title={col.name}>
								{col.name}
							</th>
						{/each}
						
						<th class="sticky right-0 bg-blue-50 px-4 py-3 text-right font-bold text-blue-800 border-l border-gray-200 z-10 min-w-[120px]">{$t('Total Expense')}</th>
					</tr>
				</thead>

				<tbody class="divide-y divide-gray-200 bg-white">
					{#each pivotData as job}
						<tr class="hover:bg-blue-50/50 transition-colors">
							<td class="sticky left-0 bg-white px-4 py-3 font-bold text-blue-600 border-r border-gray-200 z-10">
								<a href="/freight-forwarder/job-orders/{job.job_id}" class="hover:underline">{job.job_number}</a>
							</td>
							<td class="px-4 py-3 text-gray-600 border-r border-gray-200">{formatDate(job.job_date)}</td>
							<td class="px-4 py-3 text-gray-800 border-r border-gray-200 truncate max-w-[250px]" title={job.customer}>{job.customer}</td>

							{#each columns as col}
								<td class="px-4 py-3 text-right font-mono text-gray-600 border-r border-gray-100">
									{formatAmt(job.expenses[col.id])}
								</td>
							{/each}

							<td class="sticky right-0 bg-blue-50/50 px-4 py-3 text-right font-mono font-bold text-red-600 border-l border-gray-200 z-10">
								{formatAmt(job.total)}
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan={columns.length + 4} class="px-6 py-12 text-center text-gray-500">
								{$t('No expense data found for the selected period')}
							</td>
						</tr>
					{/each}
				</tbody>

				{#if pivotData.length > 0}
				<tfoot class="bg-gray-100 font-bold border-t-2 border-gray-300">
					<tr>
						<td class="sticky left-0 bg-gray-100 px-4 py-3 text-right border-r border-gray-200 z-10" colspan="3">{$t('Grand Total:')}</td>
						
						{#each colTotals as colTotal}
							<td class="px-4 py-3 text-right font-mono text-gray-800 border-r border-gray-200">
								{formatAmt(colTotal)}
							</td>
						{/each}

						<td class="sticky right-0 bg-blue-100 px-4 py-3 text-right font-mono text-red-700 text-lg border-l border-gray-200 z-10">
							{formatAmt(grandTotal)}
						</td>
					</tr>
				</tfoot>
				{/if}
			</table>
		</div>
	</div>
</div>

<style>
	th.sticky.left-0, td.sticky.left-0 {
		box-shadow: inset -2px 0 4px -2px rgba(0,0,0,0.1);
	}
	th.sticky.right-0, td.sticky.right-0 {
		box-shadow: inset 2px 0 4px -2px rgba(0,0,0,0.1);
	}
    tr:hover td.sticky.left-0 {
        background-color: #f8fafc;
    }
</style>