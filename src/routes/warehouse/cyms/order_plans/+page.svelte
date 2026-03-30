<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	// สมมติว่ามีการใช้ i18n ตามโค้ดตัวอย่างของคุณ
	import { t } from '$lib/i18n';

	const { data } = $props<{ data: PageData }>();

	// State สำหรับค้นหาและแสดงผล
	let searchQuery = $state(data.searchQuery);
	let currentLimit = $state(data.pagination.limit);
	let searchTimer: NodeJS.Timeout;

	// ฟังก์ชันอัปเดต URL เมื่อมีการเปลี่ยนหน้า, limit หรือค้นหา
	function updateFilters(newPage: number, newLimit: number, search: string) {
		const url = new URL($page.url);
		url.searchParams.set('page', newPage.toString());
		url.searchParams.set('limit', newLimit.toString());

		if (search) {
			url.searchParams.set('search', search);
		} else {
			url.searchParams.delete('search');
		}

		goto(url.toString(), { keepFocus: true, noScroll: true });
	}

	// จัดการเมื่อพิมพ์ค้นหา (Debounce)
	function handleSearch() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			updateFilters(1, currentLimit, searchQuery);
		}, 500); // รอ 500ms หลังจากพิมพ์เสร็จค่อยค้นหา
	}

	// จัดการเมื่อเปลี่ยนจำนวนแถวต่อหน้า (10, 50, 200)
	function handleLimitChange() {
		updateFilters(1, currentLimit, searchQuery);
	}

	// Format Date ให้อ่านง่าย
	function formatDate(dateString: string | Date | null) {
		if (!dateString) return '-';
		const date = new Date(dateString);
		return date.toLocaleDateString('en-GB'); // DD/MM/YYYY
	}
</script>

<div class="container mx-auto p-6">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">{$t('Container Order Plan')}</h1>
		<!-- ปุ่มสำหรับเพิ่มข้อมูล (ถ้ามี) -->
		<button class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
			+ {$t('Add New Plan')}
		</button>
	</div>

	<!-- แถบเครื่องมือ: ค้นหา และ เลือกจำนวนแถว -->
	<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="relative w-full max-w-md">
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					></path>
				</svg>
			</div>
			<input
				type="text"
				bind:value={searchQuery}
				oninput={handleSearch}
				placeholder={$t('Search Plan No, Container No, B/L...')}
				class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 pl-10 text-sm focus:border-blue-500 focus:ring-blue-500"
			/>
		</div>

		<div class="flex items-center gap-2">
			<label for="limit" class="text-sm font-medium text-gray-700">{$t('Show')}:</label>
			<select
				id="limit"
				bind:value={currentLimit}
				onchange={handleLimitChange}
				class="rounded border-gray-300 py-1.5 pr-8 pl-3 text-sm focus:border-blue-500 focus:ring-blue-500"
			>
				<option value={10}>10</option>
				<option value={50}>50</option>
				<option value={200}>200</option>
			</select>
			<span class="text-sm text-gray-600">{$t('entries')}</span>
		</div>
	</div>

	<!-- ตารางแสดงข้อมูล -->
	<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
		<table class="w-full text-left text-sm text-gray-500">
			<thead class="bg-gray-50 text-xs text-gray-700 uppercase">
				<tr>
					<th scope="col" class="px-6 py-3">{$t('Plan No')}</th>
					<th scope="col" class="px-6 py-3">{$t('Container No')}</th>
					<th scope="col" class="px-6 py-3">{$t('Size/Agent')}</th>
					<th scope="col" class="px-6 py-3">{$t('Model/Type')}</th>
					<th scope="col" class="px-6 py-3">{$t('House B/L')}</th>
					<th scope="col" class="px-6 py-3">{$t('ETA')}</th>
					<th scope="col" class="px-6 py-3 text-center">{$t('Actions')}</th>
				</tr>
			</thead>
			<tbody>
				{#if data.plans.length === 0}
					<tr>
						<td colspan="7" class="px-6 py-8 text-center text-gray-500">
							{$t('No data found')}
						</td>
					</tr>
				{/if}

				{#each data.plans as plan (plan.id)}
					<tr class="border-b bg-white hover:bg-gray-50">
						<td class="px-6 py-4 font-medium whitespace-nowrap text-gray-900">
							{plan.plan_no}
						</td>
						<td class="px-6 py-4 font-mono text-blue-600">
							{plan.container_no || '-'}
						</td>
						<td class="px-6 py-4">
							<div>{plan.size || '-'}</div>
							<div class="text-xs text-gray-400">{plan.agent || ''}</div>
						</td>
						<td class="px-6 py-4">
							<div>{plan.model || '-'}</div>
							<div class="text-xs text-gray-400">{plan.type || ''}</div>
						</td>
						<td class="px-6 py-4">
							{plan.house_bl || '-'}
						</td>
						<td class="px-6 py-4">
							{formatDate(plan.eta_date)}
						</td>
						<td class="px-6 py-4 text-center">
							<button class="font-medium text-blue-600 hover:underline">{$t('Edit')}</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Pagination Controls -->
	<div class="mt-4 flex items-center justify-between">
		<div class="text-sm text-gray-700">
			{$t('Showing')}
			<span class="font-semibold"
				>{(data.pagination.page - 1) * data.pagination.limit +
					(data.plans.length > 0 ? 1 : 0)}</span
			>
			{$t('to')}
			<span class="font-semibold"
				>{Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)}</span
			>
			{$t('of')}
			<span class="font-semibold">{data.pagination.total}</span>
			{$t('entries')}
		</div>

		<div class="flex space-x-2">
			<button
				disabled={data.pagination.page <= 1}
				onclick={() => updateFilters(data.pagination.page - 1, currentLimit, searchQuery)}
				class="rounded border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-white"
			>
				{$t('Previous')}
			</button>

			<!-- แสดงหน้าปัจจุบัน -->
			<span class="flex items-center px-4 py-1 text-sm font-medium text-gray-700">
				Page {data.pagination.page} of {data.pagination.totalPages || 1}
			</span>

			<button
				disabled={data.pagination.page >= data.pagination.totalPages}
				onclick={() => updateFilters(data.pagination.page + 1, currentLimit, searchQuery)}
				class="rounded border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-white"
			>
				{$t('Next')}
			</button>
		</div>
	</div>
</div>
