<script lang="ts">
	import type { PageData } from './$types';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	// ปรับมาใช้ Svelte 5 $props
	const { data } = $props<{ data: PageData }>();

	// --- Pagination Logic ($derived) ---
	const currentPage = $derived(data.currentPage);
	const totalPages = $derived(data.totalPages);

	// คำนวณตัวเลขหน้าแบบมี ... (เช่น 1 2 3 ... 10)
	const pages = $derived.by(() => {
		if (totalPages <= 7) {
			return Array.from({ length: totalPages }, (_, i) => i + 1);
		}
		if (currentPage <= 3) {
			return [1, 2, 3, 4, '...', totalPages];
		}
		if (currentPage >= totalPages - 2) {
			return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
		}
		return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
	});

	// ฟังก์ชันสร้าง URL สำหรับเปลี่ยนหน้า
	function getPageUrl(pageNum: number | string) {
		if (pageNum === '...') return '#';
		const url = new URL($page.url);
		url.searchParams.set('page', pageNum.toString());
		return url.toString();
	}

	// ฟังก์ชันเปลี่ยน Limit (บังคับกลับไปหน้า 1)
	function handleLimitChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const url = new URL($page.url);
		url.searchParams.set('limit', target.value);
		url.searchParams.set('page', '1');
		goto(url.toString());
	}
</script>

<svelte:head>
	<title>ค้นหา Sale Order</title>
</svelte:head>

<div class="mx-auto max-w-7xl p-4">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-800">ค้นหาข้อมูล Sale Order</h1>
		<p class="mt-1 text-sm text-gray-500">ระบุเงื่อนไขที่ต้องการค้นหาแล้วกดปุ่ม "ค้นหา"</p>
	</div>

	<!-- ส่วนฟอร์มค้นหา -->
	<div class="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		<form method="GET" action="" class="grid grid-cols-1 items-end gap-4 md:grid-cols-3 lg:grid-cols-6">
			<!-- บังคับให้การค้นหาใหม่เริ่มที่หน้า 1 เสมอ และจำค่า Limit ไว้ -->
			<input type="hidden" name="page" value="1" />
			<input type="hidden" name="limit" value={data.limit} />

			<!-- วันที่สร้าง (เริ่มต้น) -->
			<div>
				<label for="create_date_start" class="mb-2 block text-sm font-semibold text-gray-700">Create Date (Start)</label>
				<input
					type="date"
					id="create_date_start"
					name="create_date_start"
					value={data.query?.createDateStart || ''}
					class="w-full rounded-lg border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
				/>
			</div>

			<!-- วันที่สร้าง (สิ้นสุด) -->
			<div>
				<label for="create_date_end" class="mb-2 block text-sm font-semibold text-gray-700">Create Date (End)</label>
				<input
					type="date"
					id="create_date_end"
					name="create_date_end"
					value={data.query?.createDateEnd || ''}
					class="w-full rounded-lg border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
				/>
			</div>

			<!-- Sale Order -->
			<div>
				<label for="sale_order" class="mb-2 block text-sm font-semibold text-gray-700">Sale Order</label>
				<input
					type="text"
					id="sale_order"
					name="sale_order"
					placeholder="ระบุ Sale Order..."
					value={data.query?.saleOrder || ''}
					class="w-full rounded-lg border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
				/>
			</div>

			<!-- Delivery No -->
			<div>
				<label for="delivery_no" class="mb-2 block text-sm font-semibold text-gray-700">Delivery No.</label>
				<input
					type="text"
					id="delivery_no"
					name="delivery_no"
					placeholder="ระบุ Delivery No..."
					value={data.query?.deliveryNo || ''}
					class="w-full rounded-lg border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
				/>
			</div>

			<!-- Material Number -->
			<div>
				<label for="material_number" class="mb-2 block text-sm font-semibold text-gray-700">Material Number</label>
				<input
					type="text"
					id="material_number"
					name="material_number"
					placeholder="ระบุ Material Number..."
					value={data.query?.materialNumber || ''}
					class="w-full rounded-lg border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
				/>
			</div>

			<!-- Submit Buttons (เหลือแค่ปุ่มค้นหาและล้าง) -->
			<div class="flex items-end gap-3 h-[42px]">
				<button
					type="submit"
					class="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
				>
					ค้นหา
				</button>
				<a
					href="/"
					class="flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
				>
					ล้าง
				</a>
			</div>
		</form>
	</div>

	<!-- ส่วนแสดงผล Error -->
	{#if data.error}
		<div class="mb-6 rounded-lg bg-red-50 p-4 text-red-700 border border-red-200">
			<div class="flex items-center">
				<svg class="mr-3 h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
				</svg>
				<strong>ข้อผิดพลาด:</strong>&nbsp;{data.error}
			</div>
		</div>
	{/if}

	<!-- ส่วนแสดงตารางข้อมูล -->
	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">No.</th>
						<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Sale Order</th>
						<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Delivery No</th>
						<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Customer Code</th>
						<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Customer Name</th>
						<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Material Number</th>
						<th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Planed Qty</th>
						<th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Ship Qty</th>
						<th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Balance</th>
						<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Create Date</th>
						<th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#if data.orders && data.orders.length > 0}
						{#each data.orders as order, index}
							{@const planedQty = Number(order.Planed_quantity) || 0}
							{@const shipQty = Number(order.Ship_Qty) || 0}
							{@const balance = planedQty - shipQty}
							<!-- คำนวณลำดับที่ถูกต้องตามหน้า -->
							{@const rowNumber = (currentPage - 1) * data.limit + index + 1}

							<tr class="hover:bg-gray-50">
								<td class="whitespace-nowrap px-4 py-4 text-sm text-gray-500">{rowNumber}</td>
								<td class="whitespace-nowrap px-4 py-4 text-sm font-medium text-gray-900">{order.Sale_order || '-'}</td>
								<td class="whitespace-nowrap px-4 py-4 text-sm text-gray-900">{order.Delivery_no || '-'}</td>
								<td class="whitespace-nowrap px-4 py-4 text-sm font-medium text-blue-600">{order.Customer_Code || '-'}</td>
								<td class="whitespace-nowrap px-4 py-4 text-sm text-gray-700">{order.customer_name || 'ไม่พบชื่อลูกค้า'}</td>
								<td class="whitespace-nowrap px-4 py-4 text-sm text-gray-900">{order.Material_Number || '-'}</td>
								
								<td class="whitespace-nowrap px-4 py-4 text-sm text-right text-gray-900">{planedQty.toLocaleString()}</td>
								<td class="whitespace-nowrap px-4 py-4 text-sm text-right text-gray-900">{shipQty.toLocaleString()}</td>
								<td class="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold {balance === 0 ? 'text-green-600' : 'text-orange-500'}">
									{balance.toLocaleString()}
								</td>

								<td class="whitespace-nowrap px-4 py-4 text-sm text-gray-500">
									{order.Create_date ? new Date(order.Create_date).toLocaleDateString('th-TH') : '-'}
								</td>
								
								<td class="whitespace-nowrap px-4 py-4 text-sm">
									{#if balance === 0}
										<span class="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-semibold leading-5 text-green-800">Complete</span>
									{:else}
										<span class="inline-flex rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold leading-5 text-yellow-800">Pending</span>
									{/if}
								</td>
							</tr>
						{/each}
					{:else if data.searched && data.orders.length === 0}
						<tr>
							<td colspan="11" class="px-4 py-12 text-center text-gray-500">
								<svg class="mx-auto mb-3 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="11" class="px-4 py-12 text-center text-gray-500">
								<svg class="mx-auto mb-3 h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
								</svg>
								กรุณาระบุเงื่อนไขและกดปุ่มค้นหา
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
		
		<!-- ส่วน Pagination UI ใต้ตาราง (ปรับใหม่ ย้าย Limit มารวม) -->
		{#if data.searched && totalPages > 0}
			<div class="flex flex-col items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:px-6">
				
				<!-- ฝั่งซ้าย: Dropdown Limit และข้อความแสดงจำนวน -->
				<div class="flex items-center gap-3 w-full sm:w-auto">
					<div class="flex items-center gap-2">
						<label for="limit-bottom" class="text-sm font-medium text-gray-700 whitespace-nowrap">แสดง</label>
						<select
							id="limit-bottom"
							name="limit"
							onchange={handleLimitChange}
							class="block w-20 rounded-md border-gray-300 py-1.5 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						>
							<option value="10" selected={data.limit === 10}>10</option>
							<option value="20" selected={data.limit === 20}>20</option>
							<option value="50" selected={data.limit === 50}>50</option>
							<option value="200" selected={data.limit === 200}>200</option>
						</select>
					</div>
					<p class="text-sm text-gray-700 hidden sm:block">
						<span class="mx-1 text-gray-300">|</span>
						แสดง <span class="font-medium">{(currentPage - 1) * data.limit + 1}</span>
						ถึง <span class="font-medium">{Math.min(currentPage * data.limit, data.total)}</span>
						จากทั้งหมด <span class="font-medium">{data.total}</span> รายการ
					</p>
				</div>

				<!-- ฝั่งขวา: ปุ่มเปลี่ยนหน้า -->
				<div class="w-full sm:w-auto flex justify-center sm:justify-end">
					<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
						<!-- ปุ่ม Previous -->
						<a
							href={currentPage > 1 ? getPageUrl(currentPage - 1) : '#'}
							class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 {currentPage === 1 ? 'pointer-events-none opacity-50' : ''}"
						>
							<span class="sr-only">Previous</span>
							<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
								<path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
							</svg>
						</a>

						<!-- ตัวเลขหน้า -->
						{#each pages as p}
							{#if p === '...'}
								<span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300">...</span>
							{:else}
								<a
									href={getPageUrl(p)}
									class="relative inline-flex items-center px-4 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 focus:z-20 focus:outline-offset-0
									{p === currentPage ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600' : 'text-gray-900 hover:bg-gray-50'}"
								>
									{p}
								</a>
							{/if}
						{/each}

						<!-- ปุ่ม Next -->
						<a
							href={currentPage < totalPages ? getPageUrl(currentPage + 1) : '#'}
							class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 {currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}"
						>
							<span class="sr-only">Next</span>
							<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
								<path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
							</svg>
						</a>
					</nav>
				</div>
			</div>
		{/if}
	</div>
</div>