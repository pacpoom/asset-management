<script lang="ts">
	import { enhance } from '$app/forms';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	let { data } = $props();
	const { products, units, departments } = data; // รับ departments เข้ามา

	let today = $state(new Date().toISOString().split('T')[0]);

	// ตัวแปรสำหรับแผนก
	let department = $state(''); // ค่า string สำหรับส่ง form
	let departmentObject = $state(null); // ค่า object สำหรับ svelte-select

	let description = $state('');

	// 1. เตรียม Options สำหรับสินค้า (เหมือนเดิม)
	let productOptions = $derived(
		products.map((p: any) => ({
			value: p.id,
			label: `${p.sku} : ${p.name}`,
			...p
		}))
	);

	// 2. เตรียม Options สำหรับแผนก (เพิ่มใหม่)
	let departmentOptions = $derived(
		departments.map((d: any) => ({
			value: d.name,
			label: d.name
		}))
	);

	let defaultUnit = units.length > 0 ? units[0].name : 'ชิ้น';

	let items = $state([
		{
			product_object: null,
			product_name: '',
			description: '',
			quantity: 1,
			unit: defaultUnit,
			expected_price: 0,
			total_price: 0
		}
	]);

	let totalAmount = $state(0);

	// ฟังก์ชันจัดการเมื่อเลือกแผนก
	function onDepartmentChange(selection: any) {
		if (selection) {
			departmentObject = selection;
			department = selection.value;
		} else {
			departmentObject = null;
			department = '';
		}
	}

	function calculateTotals() {
		totalAmount = items.reduce((sum, item) => {
			const qty = parseFloat(String(item.quantity || 0));
			const price = parseFloat(String(item.expected_price || 0));
			item.total_price = qty * price;
			return sum + item.total_price;
		}, 0);
		items = items;
	}

	function addItem() {
		items = [
			...items,
			{
				product_object: null,
				product_name: '',
				description: '',
				quantity: 1,
				unit: defaultUnit,
				expected_price: 0,
				total_price: 0
			}
		];
		calculateTotals();
	}

	function removeItem(index: number) {
		if (items.length > 1) {
			items = items.filter((_, i) => i !== index);
			calculateTotals();
		}
	}

	function onProductChange(index: number, selection: any) {
		if (selection) {
			items[index].product_object = selection;
			items[index].product_name = selection.name || selection.label;
			items[index].expected_price = Number(selection.price) || 0;

			if (selection.unit_name) {
				items[index].unit = selection.unit_name;
			}
		} else {
			items[index].product_object = null;
			items[index].product_name = '';
			items[index].expected_price = 0;
		}
		calculateTotals();
	}
</script>

<div class="mx-auto mt-6 max-w-5xl rounded-lg border border-gray-200 bg-white p-6 shadow-lg">
	<h1 class="mb-6 flex items-center gap-2 text-2xl font-bold text-gray-800">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-8 w-8 text-blue-600"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
			/>
		</svg>
		สร้างใบขอซื้อ (New PR)
	</h1>

	<form method="POST" action="?/create" use:enhance class="space-y-6">
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="space-y-4">
				<div>
					<label for="pr_number" class="block text-sm font-medium text-gray-700"
						>เลขที่เอกสาร (PR No.)</label
					>
					<input
						type="text"
						id="pr_number"
						name="pr_number"
						value={data.nextPRNumber}
						readonly
						class="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 text-gray-500 shadow-sm"
					/>
				</div>
				<div>
					<label for="requester" class="block text-sm font-medium text-gray-700"
						>ผู้ขอซื้อ (Requester)</label
					>
					<input
						type="text"
						id="requester"
						value={data.user?.full_name || data.user?.email}
						readonly
						class="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 text-gray-500 shadow-sm"
					/>
				</div>

				<div>
					<label for="department" class="block text-sm font-medium text-gray-700"
						>แผนก (Department)</label
					>
					<div class="mt-1">
						<Select
							items={departmentOptions}
							value={departmentObject}
							on:change={(e) => onDepartmentChange(e.detail)}
							on:clear={() => onDepartmentChange(null)}
							placeholder="-- เลือกแผนก --"
							floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
							container={browser ? document.body : null}
							--inputStyles="padding: 6px 0; font-size: 0.875rem;"
							--list="border-radius: 6px; font-size: 0.875rem;"
							--itemIsActive="background: #e0f2fe;"
							--border="1px solid #d1d5db"
							--border-radius="0.375rem"
						/>
						<input type="hidden" name="department" value={department} />
					</div>
				</div>
			</div>

			<div class="space-y-4">
				<div>
					<label for="request_date" class="block text-sm font-medium text-gray-700"
						>วันที่ขอซื้อ (Date) <span class="text-red-500">*</span></label
					>
					<input
						type="date"
						id="request_date"
						name="request_date"
						bind:value={today}
						required
						class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="description" class="block text-sm font-medium text-gray-700"
						>หมายเหตุ / รายละเอียดเพิ่มเติม (Remarks)</label
					>
					<textarea
						id="description"
						name="description"
						bind:value={description}
						rows="4"
						class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					></textarea>
				</div>
			</div>
		</div>

		<hr class="border-gray-200" />

		<div class="overflow-visible pb-24">
			<table class="min-w-full divide-y divide-gray-200">
				<thead class="bg-gray-50">
					<tr>
						<th class="w-80 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
							>สินค้า/บริการ</th
						>
						<th class="w-64 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
							>รายละเอียด</th
						>
						<th class="w-32 px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"
							>จำนวน</th
						>
						<th class="w-32 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase"
							>หน่วย</th
						>
						<th class="w-32 px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"
							>ราคา/หน่วย</th
						>
						<th class="w-32 px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"
							>รวม</th
						>
						<th class="w-10 px-4 py-3"></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#each items as item, index}
						<tr>
							<td class="px-3 py-2" style="width: 320px; max-width: 320px;">
								<Select
									items={productOptions}
									value={item.product_object}
									on:change={(e) => onProductChange(index, e.detail)}
									on:clear={() => onProductChange(index, null)}
									placeholder="-- ค้นหา/เลือก --"
									floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
									container={browser ? document.body : null}
									--inputStyles="padding: 2px 0; font-size: 0.875rem;"
									--list="border-radius: 6px; font-size: 0.875rem;"
									--itemIsActive="background: #e0f2fe;"
									--value-container-overflow="hidden"
									--selected-item-overflow="hidden"
									--selected-item-text-overflow="ellipsis"
									--selected-item-white-space="nowrap"
								/>
							</td>
							<td class="px-3 py-2" style="width: 250px; max-width: 250px;">
								<input
									type="text"
									bind:value={item.description}
									placeholder="รายละเอียดเพิ่มเติม"
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</td>
							<td class="px-3 py-2">
								<input
									type="number"
									bind:value={item.quantity}
									min="1"
									oninput={calculateTotals}
									class="w-full rounded-md border-gray-300 text-right text-sm focus:border-blue-500 focus:ring-blue-500"
									required
								/>
							</td>
							<td class="px-3 py-2">
								<div class="relative">
									<select
										bind:value={item.unit}
										class="h-9 w-full cursor-pointer appearance-none rounded-md border-gray-300 py-0 pr-2 pl-3 text-left text-sm focus:border-blue-500 focus:ring-blue-500"
										style="-webkit-appearance: none; -moz-appearance: none; appearance: none; background-image: none;"
									>
										{#each units as u}
											<option value={u.name}>{u.name}</option>
										{/each}
									</select>
									<div
										class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											viewBox="0 0 20 20"
											fill="currentColor"
										>
											<path
												fill-rule="evenodd"
												d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
												clip-rule="evenodd"
											/>
										</svg>
									</div>
								</div>
							</td>
							<td class="px-3 py-2">
								<input
									aria-label="ราคาประเมิน"
									type="number"
									step="0.01"
									bind:value={item.expected_price}
									oninput={calculateTotals}
									class="w-full rounded-md border-gray-300 text-right text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</td>
							<td class="px-3 py-2 text-right font-medium text-gray-700">
								{item.total_price.toLocaleString('en-US', {
									minimumFractionDigits: 2,
									maximumFractionDigits: 2
								})}
							</td>
							<td class="px-3 py-2 text-center">
								{#if items.length > 1}
									<button
										type="button"
										onclick={() => removeItem(index)}
										class="text-red-600 hover:text-red-900"
										aria-label="ลบรายการ"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-5 w-5"
											viewBox="0 0 20 20"
											fill="currentColor"
										>
											<path
												fill-rule="evenodd"
												d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
												clip-rule="evenodd"
											/>
										</svg>
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<div class="mt-4">
				<button
					type="button"
					onclick={addItem}
					class="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
							clip-rule="evenodd"
						/>
					</svg>
					เพิ่มรายการสินค้า
				</button>
			</div>
		</div>

		<div class="mt-8 flex justify-end border-t pt-6">
			<div class="w-full space-y-3 rounded-lg bg-gray-50 p-4 md:w-1/3">
				<div class="flex items-center justify-between border-gray-300 pt-1">
					<span class="text-lg font-bold text-gray-800">ยอดรวมประมาณการ (Total Est.)</span>
					<span class="text-xl font-bold text-blue-700"
						>{totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span
					>
				</div>
				<p class="mt-1 text-right text-xs text-gray-500">* ราคานี้เป็นเพียงราคาประเมินเบื้องต้น</p>
			</div>
		</div>

		<input type="hidden" name="items_json" value={JSON.stringify(items)} />
		<input type="hidden" name="total_amount" value={totalAmount} />

		<div class="mt-6 flex justify-end gap-4">
			<a
				href="/purchase-requests"
				class="rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
				>ยกเลิก</a
			>
			<button
				type="submit"
				class="rounded-md border border-transparent bg-blue-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
				>สร้างใบขอซื้อ (Create PR)</button
			>
		</div>
	</form>
</div>
