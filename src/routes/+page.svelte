<script module lang="ts">
	declare let Chart: any;
</script>

<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';

	const { data } = $props<{ data: PageData }>();

	let categoryChartCanvas = $state<HTMLCanvasElement>();
	let locationChartCanvas = $state<HTMLCanvasElement>();

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
			'#3b82f6',
			'#10b981',
			'#f97316',
			'#ef4444',
			'#8b5cf6',
			'#ec4899',
			'#f59e0b',
			'#6b7280'
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
						precision: 0
					}
				}
			}
		};

		// แก้ไข: ระบุ type (c: any) เพื่อแก้ปัญหา Parameter implicitly has an 'any' type
		if (categoryChartCanvas && data.assetsByCategory?.length > 0) {
			new Chart(categoryChartCanvas, {
				type: 'doughnut',
				data: {
					labels: data.assetsByCategory.map((c: any) => c.name),
					datasets: [
						{
							label: 'Assets',
							data: data.assetsByCategory.map((c: any) => c.count),
							backgroundColor: chartColors,
							borderColor: '#ffffff',
							borderWidth: 2
						}
					]
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

		// แก้ไข: ระบุ type (l: any) เพื่อแก้ปัญหา Parameter implicitly has an 'any' type
		if (locationChartCanvas && data.assetsByLocation?.length > 0) {
			new Chart(locationChartCanvas, {
				type: 'bar',
				data: {
					labels: data.assetsByLocation.map((l: any) => l.name),
					datasets: [
						{
							label: 'จำนวนสินทรัพย์',
							data: data.assetsByLocation.map((l: any) => l.count),
							backgroundColor: chartColors[0] + '80',
							borderColor: chartColors[0],
							borderWidth: 1
						}
					]
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
	<title>Dashboard - Core Business</title>
</svelte:head>

<div class="space-y-8">
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
		<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
			<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
				<div class="p-5">
					<div class="flex items-center">
						<div class="flex-shrink-0">
							<div
								class="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									class="h-6 w-6"
									><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path
										d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"
									/></svg
								>
							</div>
						</div>
						<div class="ml-5 w-0 flex-1">
							<dl>
								<dt class="truncate text-sm font-medium text-gray-500">สินทรัพย์ทั้งหมด</dt>
								<dd class="text-3xl font-bold text-gray-900">
									{data.totalAssets ?? 0}
								</dd>
							</dl>
						</div>
					</div>
				</div>
			</div>
			<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
				<div class="p-5">
					<div class="flex items-center">
						<div class="flex-shrink-0">
							<div
								class="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 text-green-600"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									class="h-6 w-6"
									><line x1="12" x2="12" y1="2" y2="22" /><path
										d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
									/></svg
								>
							</div>
						</div>
						<div class="ml-5 w-0 flex-1">
							<dl>
								<dt class="truncate text-sm font-medium text-gray-500">ผู้ขาย (Vendors)</dt>
								<dd class="text-3xl font-bold text-gray-900">
									{data.totalVendors ?? 0}
								</dd>
							</dl>
						</div>
					</div>
				</div>
			</div>
			<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
				<div class="p-5">
					<div class="flex items-center">
						<div class="flex-shrink-0">
							<div
								class="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100 text-yellow-600"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									class="h-6 w-6"
									><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle
										cx="8.5"
										cy="7"
										r="4"
									/><line x1="20" x2="20" y1="8" y2="14" /><line
										x1="23"
										x2="17"
										y1="11"
										y2="11"
									/></svg
								>
							</div>
						</div>
						<div class="ml-5 w-0 flex-1">
							<dl>
								<dt class="truncate text-sm font-medium text-gray-500">ผู้ใช้งาน</dt>
								<dd class="text-3xl font-bold text-gray-900">
									{data.totalUsers ?? 0}
								</dd>
							</dl>
						</div>
					</div>
				</div>
			</div>
			<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
				<div class="p-5">
					<div class="flex items-center">
						<div class="flex-shrink-0">
							<div
								class="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100 text-red-600"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									class="h-6 w-6"
									><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline
										points="14 2 14 8 20 8"
									/><line x1="16" y1="13" x2="8" y2="13" /><line
										x1="16"
										y1="17"
										x2="8"
										y2="17"
									/><polyline points="10 9 9 9 8 9" /></svg
								>
							</div>
						</div>
						<div class="ml-5 w-0 flex-1">
							<dl>
								<dt class="truncate text-sm font-medium text-gray-500">PR รออนุมัติ</dt>
								<dd class="text-3xl font-bold text-gray-900">
									{data.pendingPRs ?? 0}
								</dd>
							</dl>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
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
	{/if}
</div>
