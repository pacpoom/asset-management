<script lang="ts">
	import { t } from '$lib/i18n';
	import { Pie } from 'svelte-chartjs';
	import { Chart as ChartJS, Title, Tooltip, Legend, ArcElement, CategoryScale } from 'chart.js';

	ChartJS.register(Title, Tooltip, Legend, ArcElement, CategoryScale);

	export let data: any;

	$: stats = data.stats;
	$: topDefects = data.topDefects;
	$: recentFailed = data.recentFailed;

	$: chartData = {
		labels: [$t('ผ่าน (OK)'), $t('ไม่ผ่าน (NG)'), $t('รอซ่อม')],
		datasets: [
			{
				data: [stats.passed, stats.failed, stats.pending_rework],
				backgroundColor: ['#22c55e', '#ef4444', '#f97316'],
				borderWidth: 0,
				hoverOffset: 4
			}
		]
	};

	const chartOptions = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { position: 'bottom' as const, labels: { font: { family: "'Sarabun', sans-serif" } } }
		}
	};
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">{$t('PDI Dashboard')}</h1>
		<a
			href="/nc-tracking/dashboard/export"
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
		>
			<span class="material-symbols-outlined text-sm">download</span>
			{$t('Export Report')}
		</a>
	</div>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
		<div
			class="flex items-center gap-4 rounded-xl border border-l-4 border-gray-100 border-l-blue-500 bg-white p-6 shadow-sm transition hover:shadow-md"
		>
			<div class="rounded-lg bg-blue-100 p-3 text-blue-600">
				<span class="material-symbols-outlined md-24">directions_car</span>
			</div>
			<div>
				<p class="text-sm font-medium text-gray-500">{$t('Total Inspections')}</p>
				<h3 class="text-2xl font-bold text-gray-800">{stats.total}</h3>
			</div>
		</div>

		<div
			class="flex items-center gap-4 rounded-xl border border-l-4 border-gray-100 border-l-green-500 bg-white p-6 shadow-sm transition hover:shadow-md"
		>
			<div class="rounded-lg bg-green-100 p-3 text-green-600">
				<span class="material-symbols-outlined md-24">check_circle</span>
			</div>
			<div>
				<p class="text-sm font-medium text-gray-500">{$t('Passed (OK)')}</p>
				<h3 class="text-2xl font-bold text-gray-800">{stats.passed}</h3>
			</div>
		</div>

		<div
			class="flex items-center gap-4 rounded-xl border border-l-4 border-gray-100 border-l-red-500 bg-white p-6 shadow-sm transition hover:shadow-md"
		>
			<div class="rounded-lg bg-red-100 p-3 text-red-600">
				<span class="material-symbols-outlined md-24">cancel</span>
			</div>
			<div>
				<p class="text-sm font-medium text-gray-500">{$t('Failed (NG)')}</p>
				<h3 class="text-2xl font-bold text-gray-800">{stats.failed}</h3>
			</div>
		</div>

		<div
			class="flex items-center gap-4 rounded-xl border border-l-4 border-gray-100 border-l-orange-500 bg-white p-6 shadow-sm transition hover:shadow-md"
		>
			<div class="rounded-lg bg-orange-100 p-3 text-orange-600">
				<span class="material-symbols-outlined md-24">build</span>
			</div>
			<div>
				<p class="text-sm font-medium text-gray-500">{$t('Pending Rework')}</p>
				<h3 class="text-2xl font-bold text-gray-800">{stats.pending_rework}</h3>
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<div class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-1">
			<h2 class="mb-4 text-lg font-bold text-gray-800">{$t('Pass/Fail Ratio')}</h2>
			<div class="relative flex h-64 w-full justify-center">
				<Pie data={chartData} options={chartOptions} />
			</div>
		</div>

		<div class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
			<h2 class="mb-4 text-lg font-bold text-gray-800">{$t('Top Defects')}</h2>
			<div class="mt-6 space-y-5">
				{#each topDefects as defect, i}
					<div>
						<div class="mb-1.5 flex justify-between text-sm">
							<span class="font-medium text-gray-700">{i + 1}. {defect.name}</span>
							<span class="font-semibold text-gray-600">{defect.count} จุด</span>
						</div>
						<div class="h-2.5 w-full rounded-full bg-gray-100 shadow-inner">
							<div
								class="h-2.5 rounded-full bg-red-500"
								style="width: {(defect.count / 20) * 100}%"
							></div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<div class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
		<div class="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 p-6">
			<h2 class="text-lg font-bold text-gray-800">{$t('Recent Failed Inspections')}</h2>
			<a
				href="/nc-tracking"
				class="text-sm font-medium text-blue-600 transition hover:text-blue-800 hover:underline"
				>{$t('View All')} &rarr;</a
			>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full text-left text-sm text-gray-600">
				<thead class="border-b border-gray-200 bg-gray-50 text-gray-700">
					<tr>
						<th class="px-6 py-3.5 font-semibold">{$t('NC No.')}</th>
						<th class="px-6 py-3.5 font-semibold">{$t('Car Model')}</th>
						<th class="px-6 py-3.5 font-semibold">{$t('VIN / Chassis')}</th>
						<th class="px-6 py-3.5 font-semibold">{$t('Inspector')}</th>
						<th class="px-6 py-3.5 font-semibold">{$t('Date')}</th>
						<th class="px-6 py-3.5 text-center font-semibold">{$t('Action')}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100">
					{#each recentFailed as item}
						<tr class="transition duration-150 hover:bg-blue-50/50">
							<td class="px-6 py-4 font-semibold text-blue-600">{item.id}</td>
							<td class="px-6 py-4">{item.model}</td>
							<td class="px-6 py-4 font-mono text-xs text-gray-500">{item.vin}</td>
							<td class="px-6 py-4">
								<span
									class="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700"
								>
									<span class="material-symbols-outlined text-[14px]">person</span>
									{item.inspector}
								</span>
							</td>
							<td class="px-6 py-4 text-gray-500">{item.date}</td>
							<td class="px-6 py-4 text-center">
								<a
									href="/nc-tracking/{item.id}"
									class="inline-block rounded-lg p-1.5 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600"
									title="View Details"
								>
									<span class="material-symbols-outlined block text-xl">visibility</span>
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
