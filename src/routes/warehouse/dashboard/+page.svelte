<script lang="ts">
	import type { PageData } from './$types';
	import { t, locale } from '$lib/i18n';

	const { data } = $props<{ data: PageData }>();

	// --- Helper Functions ---
	function formatQuantity(value: number | null | undefined) {
		if (value === null || value === undefined) return '0';
		return new Intl.NumberFormat($locale === 'th' ? 'th-TH' : 'en-US', {
			style: 'decimal',
			minimumFractionDigits: 0,
			maximumFractionDigits: 2
		}).format(value);
	}

	function formatDateTimeStr(dateStr: string | null | undefined) {
		if (!dateStr) return '-';
		const dateObj = new Date(dateStr);
		return dateObj.toLocaleString($locale === 'th' ? 'th-TH' : 'en-GB', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getTypeBadgeClass(type: string) {
		switch (type) {
			case 'INBOUND_RECEIVE':
				return 'bg-green-100 text-green-800';
			case 'STOCK_ADD':
				return 'bg-blue-100 text-blue-800';
			case 'STOCK_EDIT':
				return 'bg-orange-100 text-orange-800';
			case 'STOCK_DELETE':
				return 'bg-red-100 text-red-800';
			case 'PUT_AWAY':
				return 'bg-purple-100 text-purple-800';
			case 'OUTBOUND_ISSUE':
				return 'bg-red-100 text-red-800 border border-red-200'; // เพิ่มสีสำหรับรายการตัดออก
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	function getTypeLabel(type: string) {
		switch (type) {
			case 'INBOUND_RECEIVE':
				return 'Receive';
			case 'STOCK_ADD':
				return 'Add';
			case 'STOCK_EDIT':
				return 'Edit';
			case 'STOCK_DELETE':
				return 'Delete';
			case 'PUT_AWAY':
				return 'Put-Away';
			case 'OUTBOUND_ISSUE':
				return 'Issue (จ่ายออก)'; // เพิ่ม Label ให้รายการตัดออก
			default:
				return type;
		}
	}

	// Calculate Location Usage Percentage
	const locationUsagePercent =
		data.stats.totalLocations > 0
			? Math.round((data.stats.occupiedLocations / data.stats.totalLocations) * 100)
			: 0;
</script>

<svelte:head>
	<title>{$t('Dashboard Overview')}</title>
</svelte:head>

<!-- Header -->
<div class="mb-6">
	<h1 class="text-2xl font-bold text-gray-800">{$t('Dashboard')}</h1>
	<p class="mt-1 text-sm text-gray-500">
		{$t('ภาพรวมระบบคลังสินค้า สถานะสต็อกและรายการเคลื่อนไหว')}
	</p>
</div>

<!-- Key Metrics Cards -->
<div class="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
	<!-- Total Stock -->
	<div class="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
		<div
			class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
				/>
			</svg>
		</div>
		<div>
			<p class="text-sm font-medium text-gray-500">{$t('Total Stock Qty')}</p>
			<p class="text-2xl font-bold text-gray-900">{formatQuantity(data.stats.totalStockQty)}</p>
		</div>
	</div>

	<!-- Unique Items -->
	<div class="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
		<div
			class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
				/>
			</svg>
		</div>
		<div>
			<p class="text-sm font-medium text-gray-500">{$t('Active Items')}</p>
			<p class="text-2xl font-bold text-gray-900">{formatQuantity(data.stats.totalUniqueItems)}</p>
		</div>
	</div>

	<!-- Location Usage -->
	<div class="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
		<div
			class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
				/>
			</svg>
		</div>
		<div>
			<p class="text-sm font-medium text-gray-500">{$t('Occupied Locations')}</p>
			<p class="text-2xl font-bold text-gray-900">
				{formatQuantity(data.stats.occupiedLocations)}
				<span class="text-sm font-normal text-gray-500"
					>/ {formatQuantity(data.stats.totalLocations)}</span
				>
			</p>
		</div>
	</div>

	<!-- Today's Transactions -->
	<div class="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
		<div
			class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
				/>
			</svg>
		</div>
		<div>
			<p class="text-sm font-medium text-gray-500">{$t("Today's Transactions")}</p>
			<p class="text-2xl font-bold text-gray-900">{formatQuantity(data.stats.todayTransactions)}</p>
		</div>
	</div>
</div>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
	<!-- LEFT COLUMN: Transactions -->
	<div class="flex flex-col gap-6 lg:col-span-2">
		<!-- Recent Transactions -->
		<div
			class="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
		>
			<div
				class="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-4"
			>
				<h2 class="text-lg font-bold text-gray-800">{$t('Recent Transactions')}</h2>
				<a
					href="/warehouse/transaction"
					class="text-sm font-medium text-blue-600 hover:text-blue-800">{$t('View All &rarr;')}</a
				>
			</div>
			<div class="flex-1 overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200 text-sm">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left font-semibold text-gray-600">{$t('Date / Time')}</th>
							<th class="px-6 py-3 text-left font-semibold text-gray-600">{$t('Type')}</th>
							<th class="px-6 py-3 text-left font-semibold text-gray-600">{$t('Item')}</th>
							<th class="px-6 py-3 text-left font-semibold text-gray-600">{$t('Location')}</th>
							<th class="px-6 py-3 text-right font-semibold text-gray-600">{$t('Qty')}</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100 bg-white">
						{#if data.recentTransactions.length === 0}
							<tr>
								<td colspan="5" class="py-8 text-center text-gray-500"
									>{$t('No recent transactions')}</td
								>
							</tr>
						{:else}
							{#each data.recentTransactions as tx (tx.id)}
								<tr class="hover:bg-gray-50">
									<td class="px-6 py-3 text-xs whitespace-nowrap text-gray-500"
										>{formatDateTimeStr(tx.created_at)}</td
									>
									<td class="px-6 py-3 whitespace-nowrap">
										<span
											class="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase {getTypeBadgeClass(
												tx.transaction_type
											)}"
										>
											{getTypeLabel(tx.transaction_type)}
										</span>
									</td>
									<td class="px-6 py-3">
										<div class="font-mono text-xs font-semibold text-blue-700">{tx.item_code}</div>
										<div class="max-w-[150px] truncate text-[11px] text-gray-500">
											{tx.item_name}
										</div>
									</td>
									<td class="px-6 py-3 font-mono text-xs text-gray-700"
										>{tx.location_code || '-'}</td
									>
									<td
										class="px-6 py-3 text-right font-bold {tx.qty_change > 0
											? 'text-green-600'
											: tx.qty_change < 0
												? 'text-red-600'
												: 'text-gray-500'}"
									>
										{tx.qty_change > 0 ? '+' : ''}{formatQuantity(tx.qty_change)}
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	</div>

	<!-- RIGHT COLUMN: Location & Stock Status -->
	<div class="flex flex-col gap-6">
		<!-- Location Capacity Progress -->
		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
			<h2 class="mb-4 text-lg font-bold text-gray-800">{$t('Location Usage Status')}</h2>

			<div class="mb-2 flex items-end justify-between">
				<span class="text-sm font-medium text-gray-700">{$t('Capacity Utilization')}</span>
				<span class="text-xl font-bold text-gray-900">{locationUsagePercent}%</span>
			</div>

			<div class="mb-6 flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
				<div
					class="h-3 rounded-full transition-all duration-1000 {locationUsagePercent > 90
						? 'bg-red-500'
						: locationUsagePercent > 75
							? 'bg-orange-500'
							: 'bg-green-500'}"
					style="width: {locationUsagePercent}%"
				></div>
			</div>

			<div class="grid grid-cols-2 gap-4 text-center">
				<div class="rounded-lg border border-gray-100 bg-gray-50 p-3">
					<p class="mb-1 text-xs font-medium text-gray-500">{$t('Empty')}</p>
					<p class="text-lg font-bold text-green-600">
						{formatQuantity(data.stats.emptyLocations)}
					</p>
				</div>
				<div class="rounded-lg border border-gray-100 bg-gray-50 p-3">
					<p class="mb-1 text-xs font-medium text-gray-500">{$t('Occupied')}</p>
					<p class="text-lg font-bold text-blue-600">
						{formatQuantity(data.stats.occupiedLocations)}
					</p>
				</div>
			</div>
		</div>

		<!-- Top Stocks -->
		<div class="flex-1 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
			<h2 class="mb-4 text-lg font-bold text-gray-800">{$t('Highest Stock Items')}</h2>

			{#if data.topStocks.length === 0}
				<p class="py-4 text-center text-sm text-gray-500">{$t('No stock available')}</p>
			{:else}
				<div class="flex flex-col gap-4">
					{#each data.topStocks as item}
						<div
							class="flex items-center justify-between border-b border-gray-50 pb-3 last:border-0 last:pb-0"
						>
							<div class="flex flex-col">
								<span class="font-mono text-sm font-semibold text-gray-800">{item.item_code}</span>
								<span class="max-w-[180px] truncate text-xs text-gray-500" title={item.item_name}
									>{item.item_name}</span
								>
							</div>
							<span class="rounded bg-blue-50 px-2 py-1 text-sm font-bold text-blue-700">
								{formatQuantity(item.total_qty)}
							</span>
						</div>
					{/each}
				</div>
			{/if}

			<div class="mt-4 border-t border-gray-100 pt-4 text-center">
				<a href="/warehouse/inventory" class="text-xs font-semibold text-blue-600 hover:underline"
					>{$t('View Complete Inventory &rarr')}</a
				>
			</div>
		</div>
	</div>
</div>
