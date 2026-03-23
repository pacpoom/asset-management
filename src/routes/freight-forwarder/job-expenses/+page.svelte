<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';

	// กำหนด type เป็น any เพื่อแก้ปัญหา TypeScript error (property does not exist)
	export let data: any;

	$: categories = data.categories || [];
	$: pivotData = data.pivotData || [];
	$: filters = data.filters || { startDate: '', endDate: '' };

	let startDate = '';
	let endDate = '';

	// Sync state
	$: {
		startDate = filters.startDate;
		endDate = filters.endDate;
	}

	function applyFilter() {
		const url = new URL($page.url);
		if (startDate) url.searchParams.set('startDate', startDate);
		if (endDate) url.searchParams.set('endDate', endDate);
		goto(url.toString(), { keepFocus: true, noScroll: true });
	}

	// ฟอร์แมตตัวเลข
	const formatAmt = (num: number) => {
		if (!num || num === 0) return '-';
		return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	};

	const formatDate = (isoString: string) => {
		return new Date(isoString).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
	};

	// คำนวณผลรวมรวมด้านล่างสุดของตาราง (Grand Total)
	$: colTotals = categories.map((cat: any) => {
		return pivotData.reduce((sum: number, job: any) => sum + (job.expenses[cat.id] || 0), 0);
	});
	
	$: grandTotal = pivotData.reduce((sum: number, job: any) => sum + job.total, 0);
</script>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mb-6 flex flex-col justify-between gap-4 border-b border-gray-200 pb-4 lg:flex-row lg:items-end">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">Job Expense Summary (Pivot)</h1>
			<p class="text-sm text-gray-500">รายงานสรุปค่าใช้จ่ายแยกตามหมวดหมู่ (อ้างอิงจากวันที่เปิดงาน)</p>
		</div>

		<div class="flex flex-wrap items-end gap-3">
			<div>
				<label for="start" class="mb-1 block text-xs font-semibold text-gray-600">From Date</label>
				<input type="date" id="start" bind:value={startDate} class="rounded-lg border-gray-300 py-2 px-3 text-sm focus:border-blue-500 focus:ring-blue-500" />
			</div>
			<div>
				<label for="end" class="mb-1 block text-xs font-semibold text-gray-600">To Date</label>
				<input type="date" id="end" bind:value={endDate} class="rounded-lg border-gray-300 py-2 px-3 text-sm focus:border-blue-500 focus:ring-blue-500" />
			</div>
			
			<div class="flex gap-2">
				<button onclick={applyFilter} class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow transition-colors">
					Search
				</button>

				<!-- ปุ่ม Export Excel -->
				<a
					href={`/freight-forwarder/job-expenses/export-excel?startDate=${startDate}&endDate=${endDate}`}
					target="_blank"
					class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white shadow transition-colors hover:bg-green-700"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
					Export Excel
				</a>
			</div>
		</div>
	</div>

	<div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm whitespace-nowrap">
				<thead class="bg-gray-100 text-gray-700">
					<tr>
						<th class="sticky left-0 bg-gray-100 px-4 py-3 text-left font-semibold border-r border-gray-200 z-10 w-40">Job No.</th>
						<th class="px-4 py-3 text-left font-semibold border-r border-gray-200">Date</th>
						<th class="px-4 py-3 text-left font-semibold border-r border-gray-200 min-w-[200px]">Customer</th>
						
						{#each categories as cat}
							<th class="px-4 py-3 text-right font-semibold text-xs text-gray-600 border-r border-gray-200" title={cat.category_name}>
								{cat.category_name}
							</th>
						{/each}
						
						<th class="sticky right-0 bg-blue-50 px-4 py-3 text-right font-bold text-blue-800 border-l border-gray-200 z-10">Total Expense</th>
					</tr>
				</thead>

				<tbody class="divide-y divide-gray-200 bg-white">
					{#each pivotData as job}
						<tr class="hover:bg-blue-50/50 transition-colors">
							<td class="sticky left-0 bg-white px-4 py-3 font-bold text-blue-600 border-r border-gray-200 z-10">
								<a href="/freight-forwarder/job-orders/{job.job_id}" class="hover:underline">{job.job_number}</a>
							</td>
							<td class="px-4 py-3 text-gray-600 border-r border-gray-200">{formatDate(job.job_date)}</td>
							<td class="px-4 py-3 text-gray-800 border-r border-gray-200 truncate max-w-[250px]">{job.customer}</td>

							{#each categories as cat}
								<td class="px-4 py-3 text-right font-mono text-gray-600 border-r border-gray-100">
									{formatAmt(job.expenses[cat.id])}
								</td>
							{/each}

							<td class="sticky right-0 bg-blue-50/50 px-4 py-3 text-right font-mono font-bold text-red-600 border-l border-gray-200 z-10">
								{formatAmt(job.total)}
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan={categories.length + 4} class="px-6 py-12 text-center text-gray-500">
								ไม่พบข้อมูลค่าใช้จ่ายในช่วงเวลาที่กำหนด
							</td>
						</tr>
					{/each}
				</tbody>

				{#if pivotData.length > 0}
				<tfoot class="bg-gray-100 font-bold border-t-2 border-gray-300">
					<tr>
						<td class="sticky left-0 bg-gray-100 px-4 py-3 text-right border-r border-gray-200 z-10" colspan="3">Grand Total :</td>
						
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
	/* เงาสำหรับคอลัมน์ที่ถูก Sticky เพื่อให้ดูมีมิติเวลา Scroll */
	th.sticky.left-0, td.sticky.left-0 {
		box-shadow: inset -2px 0 4px -2px rgba(0,0,0,0.1);
	}
	th.sticky.right-0, td.sticky.right-0 {
		box-shadow: inset 2px 0 4px -2px rgba(0,0,0,0.1);
	}
    /* ให้คอลัมน์แรกที่ Sticky โปร่งแสงใน hover state จะได้เนียนๆ */
    tr:hover td.sticky.left-0 {
        background-color: #f8fafc;
    }
</style>