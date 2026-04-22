<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { fade } from 'svelte/transition';
	import type { PageData } from './$types';

	const { data } = $props<{ data: PageData }>();

	// สถานะค้นหา
	let searchTerm = $state('');
	let checkinFrom = $state('');
	let checkinTo = $state('');
	// ใช้สำหรับ “กดปุ่มค้นหา” แล้วค่อยนำไปกรอง
	let appliedSearchTerm = $state('');
	let appliedCheckinFrom = $state('');
	let appliedCheckinTo = $state('');
	let currentPage = $state(1);
	let pageSize = $state(10);

	function getDatePartOnly(dateVal: any) {
		if (!dateVal) return null;
		if (typeof dateVal === 'string') {
			// รองรับทั้ง 'YYYY-MM-DD' และ 'YYYY-MM-DD HH:mm:ss'
			return dateVal.slice(0, 10);
		}
		if (dateVal instanceof Date) {
			return dateVal.toISOString().slice(0, 10);
		}
		try {
			const d = new Date(dateVal);
			if (isNaN(d.getTime())) return null;
			return d.toISOString().slice(0, 10);
		} catch {
			return null;
		}
	}

	// กรองข้อมูลตามคำค้นหา (ค้นหาจาก เลขตู้, เลขแผน, หรือ ตำแหน่งลาน)
	const filteredStocks = $derived(
		data.stocks?.filter((stock: any) => {
			// Filter by container/plan/location
			if (appliedSearchTerm.trim()) {
				const searchStr =
					`${stock.container_no} ${stock.plan_no} ${stock.location_code}`.toLowerCase();
				if (!searchStr.includes(appliedSearchTerm.toLowerCase())) return false;
			}

			// Filter by check-in date period (inclusive)
			const hasFrom = Boolean(appliedCheckinFrom);
			const hasTo = Boolean(appliedCheckinTo);
			if (hasFrom || hasTo) {
				const stockDate = getDatePartOnly(stock.checkin_date);
				if (!stockDate) return false;

				if (hasFrom && stockDate < appliedCheckinFrom) return false;
				if (hasTo && stockDate > appliedCheckinTo) return false;
			}

			return true;
		}) || []
	);

	const totalPages = $derived(Math.max(1, Math.ceil(filteredStocks.length / pageSize)));

	const pagedStocks = $derived(
		filteredStocks.slice((currentPage - 1) * pageSize, currentPage * pageSize)
	);

	const startItem = $derived(filteredStocks.length === 0 ? 0 : (currentPage - 1) * pageSize + 1);
	const endItem = $derived(Math.min(currentPage * pageSize, filteredStocks.length));

	function goToPage(pageNum: number) {
		const tp = totalPages;
		currentPage = Math.min(Math.max(1, pageNum), tp);
	}

	function applySearch() {
		appliedSearchTerm = searchTerm;
		appliedCheckinFrom = checkinFrom;
		appliedCheckinTo = checkinTo;
		currentPage = 1;
	}

	// ฟังก์ชันจัดการแสดงผลสถานะตู้
	function getStatusBadge(status: number) {
		switch (status) {
			case 1:
				return { label: 'Full', classes: 'bg-red-50 text-red-700 border-red-200' };
			case 2:
				return { label: 'Partial', classes: 'bg-orange-50 text-orange-700 border-orange-200' };
			case 3:
				return { label: 'Empty', classes: 'bg-green-50 text-green-700 border-green-200' };
			default:
				return { label: 'Unknown', classes: 'bg-gray-50 text-gray-700 border-gray-200' };
		}
	}

	// ฟังก์ชันจัดรูปแบบวันที่
	function formatDate(dateStr: string) {
		if (!dateStr) return '-';
		const d = new Date(dateStr);
		return d.toLocaleDateString('th-TH', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// จำนวนวันตั้งแต่ check-in จนถึงวันนี้ (นับรวมวัน check-in = 1)
	function calculateStockDays(checkinDateStr: string) {
		if (!checkinDateStr) return '-';
		const d = new Date(checkinDateStr);
		if (isNaN(d.getTime())) return '-';

		const start = new Date(d);
		start.setHours(0, 0, 0, 0);

		const now = new Date();
		now.setHours(0, 0, 0, 0);

		const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
		return Math.max(0, days + 1);
	}
</script>

<svelte:head>
	<title>{$t('Container Stock')}</title>
</svelte:head>

<div class="mx-auto max-w-7xl p-6">
	<!-- Header -->
	<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">{$t('Container Stock')}</h1>
			<p class="mt-1 text-sm text-gray-500">
				{$t('Manage and view containers currently in the yard')}
			</p>
		</div>

		<!-- Search Box & Export -->
		<div class="flex flex-1 flex-col justify-end gap-3 sm:flex-row lg:items-end">
			<div class="relative w-full sm:max-w-xs xl:max-w-sm">
				<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
					<svg
						class="h-5 w-5 text-gray-400"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
							clip-rule="evenodd"
						/>
					</svg>
				</div>
				<input
					type="text"
					bind:value={searchTerm}
					placeholder={$t('Search by Container, Plan, Location...')}
					class="block w-full rounded-lg border border-gray-300 bg-white py-2.5 pr-3 pl-10 text-sm placeholder-gray-500 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
				/>
			</div>

			<div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
				<div class="w-full sm:w-36">
					<label for="checkinFrom" class="mb-1 block text-xs font-medium text-gray-700"
						>{$t('Check-in Date From')}</label
					>
					<input
						id="checkinFrom"
						type="date"
						bind:value={checkinFrom}
						class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
					/>
				</div>
				<div class="w-full sm:w-36">
					<label for="checkinTo" class="mb-1 block text-xs font-medium text-gray-700"
						>{$t('Check-in Date To')}</label
					>
					<input
						id="checkinTo"
						type="date"
						bind:value={checkinTo}
						class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
					/>
				</div>
			</div>

			<!-- Action Buttons: Search & Export -->
			<div class="mt-2 flex items-center gap-2 sm:mt-0">
				<button
					type="button"
					onclick={applySearch}
					class="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold whitespace-nowrap text-white shadow-sm transition-colors hover:bg-blue-700"
				>
					{$t('Search')}
				</button>

				<a
					href={`/warehouse/container_stocks/export?search=${encodeURIComponent(appliedSearchTerm)}&from=${encodeURIComponent(appliedCheckinFrom)}&to=${encodeURIComponent(appliedCheckinTo)}&locale=${$locale}`}
					target="_blank"
					class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-bold whitespace-nowrap text-white shadow-sm transition-colors hover:bg-green-700"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
					{$t('Export')}
				</a>
			</div>
		</div>
	</div>

	<!-- Error Message (ถ้ามี) -->
	{#if data.error}
		<div class="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700 shadow-sm" transition:fade>
			{data.error}
		</div>
	{/if}

	<!-- Table Card -->
	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-left text-sm">
				<thead class="bg-gray-50 text-gray-600">
					<tr>
						<th scope="col" class="px-6 py-4 font-semibold">{$t('Original No.')}</th>
						<th scope="col" class="px-6 py-4 font-semibold">{$t('Current No.')}</th>
						<th scope="col" class="px-6 py-4 font-semibold">{$t('Size')}</th>
						<th scope="col" class="px-6 py-4 font-semibold">{$t('Plan No.')}</th>
						<th scope="col" class="px-6 py-4 font-semibold">{$t('House B/L')}</th>
						<th scope="col" class="px-6 py-4 font-semibold">{$t('Location')}</th>
						<th scope="col" class="px-6 py-4 font-semibold">{$t('Status')}</th>
						<th class="px-4 py-3 text-center whitespace-nowrap">{$t('Check-in Date')}</th>
						<th class="px-4 py-3 text-center whitespace-nowrap">{$t('Stock Days')}</th>
						<th scope="col" class="px-6 py-4 font-semibold">{$t('Remarks')}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#if filteredStocks.length === 0}
						<tr>
							<td colspan="10" class="px-6 py-12 text-center text-gray-500">
								<svg
									class="mx-auto mb-3 h-10 w-10 text-gray-300"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="1.5"
										d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
									/>
								</svg>
								{$t('No containers found in stock')}
							</td>
						</tr>
					{:else}
						{#each pagedStocks as stock}
							{@const badge = getStatusBadge(stock.status)}
							<tr class="transition-colors hover:bg-gray-50">
								<td class="px-6 py-4 font-bold whitespace-nowrap text-gray-900">
									{stock.origin_container_no}
								</td>
								<td class="px-6 py-4 font-bold whitespace-nowrap text-gray-900">
									{stock.container_no}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-gray-600">
									{stock.size || '-'}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-gray-600">
									{stock.plan_no || '-'}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-gray-600">
									{stock.house_bl || '-'}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span
										class="inline-flex rounded bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700"
									>
										{stock.location_code}
									</span>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span
										class="inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold {badge.classes}"
									>
										{$t(badge.label)}
									</span>
								</td>
								<td class="px-6 py-4 text-center whitespace-nowrap text-gray-600">
									{formatDate(stock.checkin_date)}
								</td>
								<td class="px-6 py-4 text-center whitespace-nowrap text-gray-600">
									{calculateStockDays(stock.checkin_date)}
								</td>
								<td
									class="max-w-xs truncate px-6 py-4 text-center text-gray-500"
									title={stock.remarks}
								>
									{stock.remarks || '-'}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<!-- Paging Controls -->
		{#if filteredStocks.length > pageSize}
			<div
				class="flex flex-col gap-3 border-t border-gray-200 bg-white px-6 py-3 sm:flex-row sm:items-center sm:justify-between"
			>
				<div class="flex items-center gap-3">
					<span class="text-sm text-gray-700">{$t('Show')}</span>
					<select
						class="rounded-md border border-gray-300 bg-white py-1 pr-8 pl-3 text-sm"
						value={pageSize.toString()}
						onchange={(e) => {
							pageSize = Number((e.currentTarget as HTMLSelectElement).value);
							currentPage = 1;
						}}
					>
						<option value="10">10</option>
						<option value="50">50</option>
						<option value="200">200</option>
					</select>
					<span class="text-sm text-gray-700">{$t('entries')}</span>
				</div>

				<div class="flex items-center gap-3">
					<span class="text-sm text-gray-600">
						{startItem} - {endItem}
						{$t('from')}
						{filteredStocks.length}
					</span>
					<div class="inline-flex items-center gap-1">
						<button
							class="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
							onclick={() => goToPage(currentPage - 1)}
							disabled={currentPage <= 1}
						>
							{$t('Prev')}
						</button>
						<span class="px-3 text-sm font-medium text-gray-800">
							{currentPage} / {totalPages}
						</span>
						<button
							class="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
							onclick={() => goToPage(currentPage + 1)}
							disabled={currentPage >= totalPages}
						>
							{$t('Next')}
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Summary Footer -->
		<div class="border-t border-gray-200 bg-gray-50 px-6 py-3 text-sm text-gray-600">
			{$t('Total containers:')} <span class="font-bold text-gray-900">{filteredStocks.length}</span>
		</div>
	</div>
</div>
