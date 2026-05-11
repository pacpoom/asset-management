<script lang="ts">
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();
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
		<form method="GET" action="" class="grid grid-cols-1 items-end gap-4 md:grid-cols-5">
			
			<!-- วันที่สร้าง -->
			<div>
				<label for="create_date" class="mb-2 block text-sm font-semibold text-gray-700">Create Date</label>
				<input
					type="date"
					id="create_date"
					name="create_date"
					value={data.query.createDate}
					class="w-full rounded-lg border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:ring-blue-500"
				/>
			</div>

			<!-- Sale Order -->
			<div>
				<label for="sale_order" class="mb-2 block text-sm font-semibold text-gray-700">Sale Order</label>
				<input
					type="text"
					id="sale_order"
					name="sale_order"
					value={data.query.saleOrder}
					placeholder="ระบุ Sale Order..."
					class="w-full rounded-lg border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:ring-blue-500"
				/>
			</div>

			<!-- Delivery No -->
			<div>
				<label for="delivery_no" class="mb-2 block text-sm font-semibold text-gray-700">Delivery No.</label>
				<input
					type="text"
					id="delivery_no"
					name="delivery_no"
					value={data.query.deliveryNo}
					placeholder="ระบุ Delivery No..."
					class="w-full rounded-lg border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:ring-blue-500"
				/>
			</div>

			<!-- Material Number -->
			<div>
				<label for="material_number" class="mb-2 block text-sm font-semibold text-gray-700">Material Number</label>
				<input
					type="text"
					id="material_number"
					name="material_number"
					value={data.query.materialNumber}
					placeholder="ระบุ Material Number..."
					class="w-full rounded-lg border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:ring-blue-500"
				/>
			</div>

			<!-- Paging Limit -->
			<div>
				<label for="limit" class="mb-2 block text-sm font-semibold text-gray-700">แสดงผล (รายการ)</label>
				<select
					id="limit"
					name="limit"
					value={data.query.limit}
					class="w-full rounded-lg border-gray-300 bg-white px-3 py-2.5 focus:border-blue-500 focus:ring-blue-500"
				>
					<option value="10">10</option>
					<option value="20">20</option>
					<option value="50">50</option>
					<option value="200">200</option>
				</select>
			</div>

			<!-- ปุ่มค้นหาและล้างข้อมูล -->
			<div class="col-span-1 mt-2 flex justify-end gap-3 border-t pt-4 md:col-span-5">
				<a 
					href="?" 
					class="rounded-lg bg-gray-100 px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
				>
					ล้างข้อมูล
				</a>
				<button
					type="submit"
					class="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
					ค้นหา
				</button>
			</div>
		</form>
	</div>

	<!-- ส่วนแสดงผล Error -->
	{#if data.error}
		<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
			{data.error}
		</div>
	{/if}

	<!-- ส่วนแสดงผลตารางข้อมูล -->
	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="max-h-[600px] overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="sticky top-0 z-10 bg-gray-50 shadow-sm">
					<tr>
						<th class="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-700">SEQ</th>
						<th class="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-700">Create Date</th>
						<th class="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-700">Sale Order</th>
						<th class="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-700">Delivery No</th>
						<th class="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-700">Material Number</th>
						<th class="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-700">Status</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#if data.searched && data.orders.length > 0}
						{#each data.orders as order (order.SEQ)}
							<tr class="transition-colors hover:bg-blue-50">
								<td class="px-4 py-3 text-gray-500">{order.SEQ}</td>
								<!-- รูปแบบวันที่ (หากใน DB เก็บเป็น 'YYYY-MM-DD' จะแสดงตรงตัว) -->
								<td class="whitespace-nowrap px-4 py-3">{order.Create_date ? new Date(order.Create_date).toLocaleDateString('en-GB') : '-'}</td>
								<td class="whitespace-nowrap px-4 py-3 font-semibold text-blue-700">{order.Sale_order || '-'}</td>
								<td class="whitespace-nowrap px-4 py-3 text-gray-800">{order.Delivery_no || '-'}</td>
								<td class="whitespace-nowrap px-4 py-3 font-mono text-gray-600">{order.Material_number || '-'}</td>
								<td class="px-4 py-3">
									{#if order.Status === 1}
										<span class="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-semibold leading-5 text-green-800">ใช้งานปกติ (1)</span>
									{:else if order.Status === 0}
										<span class="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold leading-5 text-gray-800">รอดำเนินการ (0)</span>
									{:else}
										<span class="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold leading-5 text-blue-800">Status: {order.Status}</span>
									{/if}
								</td>
							</tr>
						{/each}
					{:else if data.searched && data.orders.length === 0}
						<tr>
							<td colspan="6" class="px-4 py-12 text-center text-gray-500">
								<svg class="mx-auto mb-3 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="6" class="px-4 py-12 text-center text-gray-500">
								<svg class="mx-auto mb-3 h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
								</svg>
								กรุณาระบุเงื่อนไขและกดปุ่มค้นหาเพื่อดูข้อมูล
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
		
		{#if data.orders.length > 0}
			<div class="flex justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
				<span>แสดงผลจำนวน <strong>{data.orders.length}</strong> รายการ</span>
				<span>*แสดงผลสูงสุด {data.limit} รายการล่าสุด</span>
			</div>
		{/if}
	</div>
</div>