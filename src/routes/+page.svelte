<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';

	// Chart.js will be loaded from a CDN via app.html, so we declare it here.
	declare let Chart: any;

	// FIX: Cannot use `export let` in runes mode — use $props() instead
	const { data } = $props<{ data: PageData }>();

	let categoryChartCanvas: HTMLCanvasElement;
	let locationChartCanvas: HTMLCanvasElement;

	// Helper to format currency
	function formatCurrency(value: number | null | undefined) {
		if (value === null || value === undefined) return '฿0.00';
		return new Intl.NumberFormat('th-TH', {
			style: 'currency',
			currency: 'THB'
		}).format(value);
	}

	// Helper to format dates
	function formatDate(isoString: string) {
        if (!isoString) return '';
		return new Date(isoString).toLocaleDateString('th-TH', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	onMount(() => {
        if (data.error || typeof Chart === 'undefined') return;

		// Chart colors and base config
		const chartColors = [
			'#3b82f6', '#10b981', '#f97316', '#ef4444', '#8b5cf6', '#ec4899', '#f59e0b', '#6b7280'
		];
		const baseChartOptions = {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					position: 'bottom' as const,
					labels: {
						padding: 20,
						boxWidth: 12,
						font: { size: 12 }
					}
				}
			},
			scales: {
				y: {
					beginAtZero: true,
                    ticks: {
                        precision: 0 // Ensure y-axis has whole numbers
                    }
				}
			}
		};

		// 1. Assets by Category Chart (Doughnut)
		if (categoryChartCanvas && data.assetsByCategory?.length > 0) {
			new Chart(categoryChartCanvas, {
				type: 'doughnut',
				data: {
					labels: data.assetsByCategory.map((c) => c.name),
					datasets: [{
						label: 'Assets',
						data: data.assetsByCategory.map((c) => c.count),
						backgroundColor: chartColors,
						borderColor: '#ffffff',
						borderWidth: 2
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							position: 'right' as const,
							labels: {
								padding: 15,
								boxWidth: 12
							}
						}
					}
				}
			});
		}

		// 2. Assets by Location Chart (Bar)
		if (locationChartCanvas && data.assetsByLocation?.length > 0) {
			new Chart(locationChartCanvas, {
				type: 'bar',
				data: {
					labels: data.assetsByLocation.map((l) => l.name),
					datasets: [{
						label: 'จำนวนสินทรัพย์',
						data: data.assetsByLocation.map((l) => l.count),
						backgroundColor: chartColors[0] + '80', // blue with transparency
						borderColor: chartColors[0],
						borderWidth: 1
					}]
				},
				options: {
                    ...baseChartOptions,
                    plugins: { legend: { display: false } }
                }
			});
		}
	});
</script>

<svelte:head>
	<title>Dashboard - Asset Control</title>
</svelte:head>

<div class="space-y-8">
	<!-- Header -->
	<div>
		<h1 class="text-3xl font-bold text-gray-800">Dashboard</h1>
		<p class="mt-1 text-gray-500">
            ภาพรวมของระบบจัดการสินทรัพย์
            {#if data.user}, ยินดีต้อนรับคุณ <span class="font-semibold">{data.user.email}</span>!{/if}
        </p>
	</div>

    {#if data.error}
        <div class="rounded-lg bg-red-100 p-4 text-center text-red-700">
            <p><strong>เกิดข้อผิดพลาด:</strong> {data.error}</p>
        </div>
    {:else}
        <!-- Stats Cards Grid -->
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <!-- Total Assets -->
            <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div class="p-5">
                    <div class="flex items-center">
                        <div class="flex-shrink-0">
                            <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-6 w-6"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                            </div>
                        </div>
                        <div class="ml-5 w-0 flex-1">
                            <dl>
                                <dt class="truncate text-sm font-medium text-gray-500">สินทรัพย์ทั้งหมด</dt>
                                <dd class="text-3xl font-bold text-gray-900">{data.summary?.total_assets ?? 0}</dd>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Total Value -->
            <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div class="p-5">
                    <div class="flex items-center">
                        <div class="flex-shrink-0">
                             <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 text-green-600">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-6 w-6"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                            </div>
                        </div>
                        <div class="ml-5 w-0 flex-1">
                            <dl>
                                <dt class="truncate text-sm font-medium text-gray-500">มูลค่ารวม</dt>
                                <dd class="text-3xl font-bold text-gray-900">{formatCurrency(data.summary?.total_value)}</dd>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>
            <!-- In Use -->
            <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div class="p-5">
                    <div class="flex items-center">
                         <div class="flex-shrink-0">
                             <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100 text-yellow-600">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-6 w-6"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                            </div>
                        </div>
                        <div class="ml-5 w-0 flex-1">
                            <dl>
                                <dt class="truncate text-sm font-medium text-gray-500">กำลังใช้งาน</dt>
                                <dd class="text-3xl font-bold text-gray-900">{data.summary?.in_use_count ?? 0}</dd>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>
             <!-- Disposed -->
            <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div class="p-5">
                    <div class="flex items-center">
                         <div class="flex-shrink-0">
                             <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100 text-red-600">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-6 w-6"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </div>
                        </div>
                        <div class="ml-5 w-0 flex-1">
                            <dl>
                                <dt class="truncate text-sm font-medium text-gray-500">จำหน่าย/ทิ้ง</dt>
                                <dd class="text-3xl font-bold text-gray-900">{data.summary?.disposed_count ?? 0}</dd>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Charts Grid -->
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <!-- Assets by Category (Doughnut Chart) -->
            <div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
                <h3 class="text-lg font-semibold text-gray-900">สินทรัพย์ตามหมวดหมู่</h3>
                <div class="mt-4 h-72">
                    {#if data.assetsByCategory?.length > 0}
                        <canvas bind:this={categoryChartCanvas}></canvas>
                    {:else}
                        <div class="flex h-full items-center justify-center text-gray-500">ไม่มีข้อมูล</div>
                    {/if}
                </div>
            </div>

            <!-- Assets by Location (Bar Chart) -->
             <div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-3">
                <h3 class="text-lg font-semibold text-gray-900">สินทรัพย์ตามสถานที่</h3>
                 <div class="mt-4 h-72">
                     {#if data.assetsByLocation?.length > 0}
                        <canvas bind:this={locationChartCanvas}></canvas>
                    {:else}
                        <div class="flex h-full items-center justify-center text-gray-500">ไม่มีข้อมูล</div>
                    {/if}
                </div>
            </div>
        </div>
        
         <!-- Recent Assets & Activities Grid -->
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <!-- Recent Assets -->
            <div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 class="text-lg font-semibold text-gray-900">สินทรัพย์ที่เพิ่มล่าสุด</h3>
                <div class="mt-4">
                     <ul class="divide-y divide-gray-200">
                        {#if data.recentAssets?.length > 0}
                            {#each data.recentAssets as asset (asset.id)}
                                <li class="flex items-center py-3">
                                     <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border bg-gray-100">
                                        {#if asset.image_url}
                                            <img src={asset.image_url} alt={asset.name} class="h-full w-full object-cover" />
                                        {:else}
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5 text-gray-400"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                                        {/if}
                                    </div>
                                    <div class="ml-4 flex-1">
                                        <p class="truncate font-medium text-gray-800">{asset.name}</p>
                                        <p class="text-sm text-gray-500">{asset.asset_tag}</p>
                                    </div>
                                    <div class="text-right text-sm text-gray-500">{formatDate(asset.created_at)}</div>
                                </li>
                            {/each}
                        {:else}
                             <li class="py-4 text-center text-gray-500">ยังไม่มีสินทรัพย์ที่เพิ่มล่าสุด</li>
                        {/if}
                     </ul>
                </div>
            </div>
            <!-- Ongoing Activities -->
            <div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 class="text-lg font-semibold text-gray-900">กิจกรรมการนับที่กำลังดำเนินอยู่</h3>
                <div class="mt-4">
                     <ul class="divide-y divide-gray-200">
                        {#if data.ongoingActivities?.length > 0}
                            {#each data.ongoingActivities as activity (activity.id)}
                                <li class="flex items-center justify-between py-3">
                                    <div>
                                        <p class="font-medium text-gray-800">{activity.name}</p>
                                        <p class="text-sm text-gray-500">เริ่มเมื่อ: {formatDate(activity.start_date)}</p>
                                    </div>
                                    <a href="/counting" class="rounded-lg bg-yellow-100 px-3 py-1.5 text-xs font-semibold text-yellow-800 hover:bg-yellow-200">
                                        ไปที่การนับ
                                    </a>
                                </li>
                            {/each}
                        {:else}
                            <li class="py-4 text-center text-gray-500">ไม่มีกิจกรรมที่กำลังดำเนินอยู่</li>
                        {/if}
                    </ul>
                </div>
            </div>
        </div>
    {/if}
</div>