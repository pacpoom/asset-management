<script module lang="ts">
	declare let Chart: any;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t, locale } from '$lib/i18n';

	export let data;
	let { financialStats, jobTypeStats, serviceTypeStats, topCustomers, monthlyTrend, filters } =
		data;

	let selectedMonth = '';

	// Sync state
	$: {
		selectedMonth = filters.month;
	}

	let jobTypeChartCanvas: HTMLCanvasElement;
	let trendChartCanvas: HTMLCanvasElement;

	function applyFilter() {
		const url = new URL($page.url);
		if (selectedMonth) {
			url.searchParams.set('month', selectedMonth);
		} else {
			url.searchParams.delete('month');
		}
		goto(url.toString(), { keepFocus: true, noScroll: true });
	}

	onMount(() => {
		if (typeof Chart === 'undefined') return;

		new Chart(jobTypeChartCanvas, {
			type: 'doughnut',
			data: {
				labels: jobTypeStats.map((d: any) => d.job_type),
				datasets: [
					{
						data: jobTypeStats.map((d: any) => d.count),
						backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
						borderWidth: 0
					}
				]
			},
			options: {
				responsive: true,
				plugins: {
					legend: { position: 'right' }
				}
			}
		});

		new Chart(trendChartCanvas, {
			type: 'bar',
			data: {
				labels: monthlyTrend.map((d: any) => {
					const [y, m] = d.month_year.split('-');
					return `${m}/${y}`;
				}),
				datasets: [
					{
						label: $t('Number of Jobs'),
						data: monthlyTrend.map((d: any) => d.count),
						backgroundColor: '#3b82f6',
						borderRadius: 4
					}
				]
			},
			options: {
				responsive: true,
				scales: {
					y: { beginAtZero: true }
				}
			}
		});
	});
</script>

<svelte:head>
	<title>{$t('Performance Reports')}</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">{$t('Performance Reports')}</h1>
			<p class="text-sm text-gray-500">{$t('Performance and Sales Summary Report')}</p>
		</div>

		<div class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
			<label for="month" class="text-sm font-medium text-gray-600">{$t('Month')}:</label>
			<input
				id="month"
				type="month"
				bind:value={selectedMonth}
				class="rounded-md border-gray-300 py-1.5 px-3 text-sm focus:border-blue-500 focus:ring-blue-500"
			/>
			<button
				onclick={applyFilter}
				class="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
			>
				{$t('Search')}
			</button>
		</div>
	</div>

	{#each financialStats as stat}
		<div
			class="relative mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
		>
			<div
				class="absolute top-0 left-0 h-full w-1.5"
				class:bg-blue-500={stat.currency === 'THB'}
				class:bg-green-500={stat.currency === 'USD'}
				class:bg-orange-500={stat.currency === 'EUR'}
			></div>

			<div
				class="mb-4 flex flex-col justify-between border-b border-gray-100 pb-3 pl-3 sm:flex-row sm:items-center"
			>
				<h2 class="flex items-center gap-2 text-lg font-bold text-gray-800">
					{$t('Financial Overview')}
					<span
						class="rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-sm font-bold text-gray-700"
						>{stat.currency}</span
					>
				</h2>
				<div class="mt-1 text-sm text-gray-500 sm:mt-0">
					{$t('From total')} <span class="font-bold text-gray-900">{stat.job_count}</span>
					{$t('Jobs')}
				</div>
			</div>

			<div class="grid grid-cols-1 gap-4 pl-3 md:grid-cols-3">
				<div class="rounded-xl border border-green-100 bg-green-50/50 p-5">
					<div class="flex items-center justify-between">
						<div class="text-sm font-semibold text-gray-500">{$t('Total Revenue')}</div>
						<svg
							class="h-5 w-5 text-green-500"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/></svg
						>
					</div>
					<div class="mt-2 text-2xl font-bold text-green-600">
						{Number(stat.total_revenue).toLocaleString($locale === 'th' ? 'th-TH' : 'en-US', {
							minimumFractionDigits: 2
						})}
					</div>
				</div>

				<div class="rounded-xl border border-red-100 bg-red-50/50 p-5">
					<div class="flex items-center justify-between">
						<div class="text-sm font-semibold text-gray-500">{$t('Total Expenses')}</div>
						<svg class="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
							/></svg
						>
					</div>
					<div class="mt-2 text-2xl font-bold text-red-500">
						{Number(stat.total_expense).toLocaleString($locale === 'th' ? 'th-TH' : 'en-US', {
							minimumFractionDigits: 2
						})}
					</div>
				</div>

				<div
					class="rounded-xl {stat.total_revenue - stat.total_expense >= 0
						? 'border-blue-100 bg-blue-50/50'
						: 'border-orange-100 bg-orange-50/50'} border p-5"
				>
					<div class="flex items-center justify-between">
						<div class="text-sm font-semibold text-gray-600">{$t('Net Profit')}</div>
						<svg
							class="h-5 w-5 {stat.total_revenue - stat.total_expense >= 0
								? 'text-blue-500'
								: 'text-orange-500'}"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
							/></svg
						>
					</div>
					<div
						class="mt-2 text-2xl font-bold {stat.total_revenue - stat.total_expense >= 0
							? 'text-blue-600'
							: 'text-orange-600'}"
					>
						{Number(stat.total_revenue - stat.total_expense).toLocaleString(
							$locale === 'th' ? 'th-TH' : 'en-US',
							{ minimumFractionDigits: 2 }
						)}
					</div>
				</div>
			</div>
		</div>
	{/each}

	{#if financialStats.length === 0}
		<div
			class="mb-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-500"
		>
			{$t('No financial data found for the selected period')}
		</div>
	{/if}

	<div class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
			<h3 class="mb-4 text-lg font-bold text-gray-800">{$t('Job Type Proportion')}</h3>
			<div class="relative flex h-64 w-full justify-center">
				{#if jobTypeStats.length > 0}
					<canvas bind:this={jobTypeChartCanvas}></canvas>
				{:else}
					<div class="flex items-center text-gray-400">{$t('No data')}</div>
				{/if}
			</div>
			<div class="mt-6 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
				{#each serviceTypeStats as service}
					<div class="text-center">
						<div class="text-xs text-gray-500 uppercase">{service.service_type}</div>
						<div class="text-xl font-bold text-gray-800">{service.count}</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
			<h3 class="mb-4 text-lg font-bold text-gray-800">{$t('6-Month Job Trend')}</h3>
			<div class="relative h-72 w-full">
				<canvas bind:this={trendChartCanvas}></canvas>
			</div>
		</div>
	</div>

	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-100 px-6 py-4">
			<h3 class="text-lg font-bold text-gray-800">
				{$t('Top 5 Customers (in selected period)')}
			</h3>
		</div>
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50 text-gray-700">
					<tr>
						<th class="px-6 py-3 text-left font-semibold uppercase">{$t('Customer Name')}</th>
						<th class="px-6 py-3 text-center font-semibold uppercase">{$t('Job Count')}</th>
						<th class="px-6 py-3 text-right font-semibold uppercase">{$t('Total Revenue')}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#each topCustomers as customer, i}
						<tr class="hover:bg-gray-50">
							<td class="px-6 py-4">
								<div class="flex items-center gap-3">
									<div
										class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700"
									>
										{i + 1}
									</div>
									<span class="font-bold text-gray-800">{customer.company_name}</span>
								</div>
							</td>
							<td class="px-6 py-4 text-center">
								<span
									class="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800"
								>
									{customer.job_count}
									{$t('Jobs')}
								</span>
							</td>
							<td class="px-6 py-4 text-right font-mono font-bold text-green-600">
								{Number(customer.total_amount).toLocaleString(
									$locale === 'th' ? 'th-TH' : 'en-US',
									{ minimumFractionDigits: 2 }
								)}
								<span class="text-xs text-gray-500">{customer.currency}</span>
							</td>
						</tr>
					{/each}
					{#if topCustomers.length === 0}
						<tr
							><td colspan="3" class="py-8 text-center text-gray-400">{$t('No data found')}</td></tr
						>
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>