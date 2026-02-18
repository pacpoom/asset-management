<script module lang="ts">
	// ประกาศตัวแปร Chart จาก Global Scope (เหมือนหน้า Dashboard หลัก)
	declare let Chart: any;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	export let data;
	let { revenueStats, jobTypeStats, serviceTypeStats, topCustomers, monthlyTrend, filters } = data;

	let startDate = filters.startDate;
	let endDate = filters.endDate;

	// References สำหรับ Canvas
	let jobTypeChartCanvas: HTMLCanvasElement;
	let trendChartCanvas: HTMLCanvasElement;

	// ฟังก์ชันโหลดข้อมูลใหม่เมื่อเปลี่ยนวันที่
	function applyFilter() {
		goto(`?start_date=${startDate}&end_date=${endDate}`);
	}

	onMount(() => {
		if (typeof Chart === 'undefined') return;

		// --- 1. กราฟวงกลม: สัดส่วน Job Type (SI, SE, etc.) ---
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

		// --- 2. กราฟแท่ง: แนวโน้มงานรายเดือน ---
		new Chart(trendChartCanvas, {
			type: 'bar',
			data: {
				labels: monthlyTrend.map((d: any) => {
					const [y, m] = d.month_year.split('-');
					return `${m}/${y}`; // แปลงเป็น MM/YYYY
				}),
				datasets: [
					{
						label: 'จำนวนงาน (Job Orders)',
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

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">Performance Reports</h1>
			<p class="text-sm text-gray-500">รายงานสรุปประสิทธิภาพและยอดขาย (Freight Forwarder)</p>
		</div>

		<div class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
			<input
				type="date"
				bind:value={startDate}
				class="rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
			/>
			<span class="text-gray-400">-</span>
			<input
				type="date"
				bind:value={endDate}
				class="rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
			/>
			<button
				onclick={applyFilter}
				class="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
			>
				ค้นหา
			</button>
		</div>
	</div>

	<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each revenueStats as stat}
			<div
				class="relative overflow-hidden rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
			>
				<dt class="truncate text-sm font-medium text-gray-500">ยอดรวม ({stat.currency})</dt>
				<dd class="mt-2 text-3xl font-bold text-gray-900">
					{Number(stat.total_amount).toLocaleString()}
					<span class="text-sm font-normal text-gray-400">.00</span>
				</dd>
				<div class="mt-1 text-xs text-gray-400">จากทั้งหมด {stat.job_count} งาน</div>
				<div
					class="absolute top-0 right-0 h-2 w-full"
					class:bg-blue-500={stat.currency === 'THB'}
					class:bg-green-500={stat.currency === 'USD'}
					class:bg-orange-500={stat.currency === 'EUR'}
				></div>
			</div>
		{/each}
		{#if revenueStats.length === 0}
			<div
				class="col-span-full rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-gray-500"
			>
				ไม่พบข้อมูลยอดเงินในช่วงเวลาที่เลือก
			</div>
		{/if}
	</div>

	<div class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
			<h3 class="mb-4 text-lg font-bold text-gray-800">สัดส่วนประเภทงาน (Job Type)</h3>
			<div class="relative flex h-64 w-full justify-center">
				{#if jobTypeStats.length > 0}
					<canvas bind:this={jobTypeChartCanvas}></canvas>
				{:else}
					<div class="flex items-center text-gray-400">ไม่มีข้อมูล</div>
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
			<h3 class="mb-4 text-lg font-bold text-gray-800">แนวโน้มงานย้อนหลัง 6 เดือน</h3>
			<div class="relative h-72 w-full">
				<canvas bind:this={trendChartCanvas}></canvas>
			</div>
		</div>
	</div>

	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-100 px-6 py-4">
			<h3 class="text-lg font-bold text-gray-800">
				Top 5 ลูกค้าที่ใช้บริการสูงสุด (ในช่วงเวลาที่เลือก)
			</h3>
		</div>
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50 text-gray-700">
					<tr>
						<th class="px-6 py-3 text-left font-semibold uppercase">Customer Name</th>
						<th class="px-6 py-3 text-center font-semibold uppercase">Job Count</th>
						<th class="px-6 py-3 text-right font-semibold uppercase">Total Amount</th>
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
									{customer.job_count} Jobs
								</span>
							</td>
							<td class="px-6 py-4 text-right font-mono font-bold text-gray-900">
								{Number(customer.total_amount).toLocaleString()}
								<span class="text-xs text-gray-500">{customer.currency}</span>
							</td>
						</tr>
					{/each}
					{#if topCustomers.length === 0}
						<tr><td colspan="3" class="py-8 text-center text-gray-400">ไม่พบข้อมูล</td></tr>
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
