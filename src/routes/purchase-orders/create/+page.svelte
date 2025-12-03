<script lang="ts">
	import { enhance } from '$app/forms';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	export let data: {
		vendors: Array<{ id: number; name: string; company_name?: string | null }>;
		products: Array<{
			id: number;
			sku: string;
			name: string;
			purchase_cost: number;
			unit_id: number | null;
			unit_name: string | null;
		}>;
		units: Array<{ id: number; name: string; symbol: string | null }>;
		nextPONumber: string;
		fromPR: any;
		prItems: any[];
	};

	// --- [แก้ไข 1] เพิ่ม Interface เพื่อกำหนด Type ให้ชัดเจน ---
	interface POItem {
		product_object: any; // ยอมรับทั้ง Object จาก svelte-select และ null
		product_name: string;
		description: string;
		quantity: number;
		unit: string;
		unit_price: number;
		discount: number;
		total_price: number;
	}

	let today = new Date().toISOString().split('T')[0];
	let contact_person = '';
	let delivery_date = '';
	let payment_term = '';

	let remarks = data.fromPR ? `อ้างอิงใบขอซื้อเลขที่ (Ref PR): ${data.fromPR.pr_number}` : '';

	let defaultUnit = data.units.length > 0 ? data.units[0].name : 'ชิ้น';

	$: productOptions = data.products.map((p) => ({
		value: p.id,
		label: `${p.sku} : ${p.name}`,
		...p
	}));

	// --- [แก้ไข 2] กำกับ Type : POItem[] ให้ตัวแปร items ---
	let items: POItem[] =
		data.prItems && data.prItems.length > 0
			? data.prItems.map((i) => {
					const foundProduct = data.products.find((p) => p.name === i.product_name);

					const productObj = foundProduct
						? {
								value: foundProduct.id,
								label: `${foundProduct.sku} : ${foundProduct.name}`,
								...foundProduct
							}
						: { value: i.product_name, label: i.product_name };

					return {
						product_object: productObj,
						product_name: i.product_name,
						description: '',
						quantity: parseFloat(String(i.quantity || 1)),
						unit: i.unit || defaultUnit,
						unit_price: parseFloat(String(i.unit_price || 0)),
						discount: 0,
						total_price: parseFloat(String(i.total_price || 0))
					};
				})
			: [
					{
						product_name: '',
						product_object: null, // ตรงนี้ที่เป็น null จะไม่ error แล้วเพราะ interface รองรับ any
						description: '',
						quantity: 1,
						unit: defaultUnit,
						unit_price: 0,
						discount: 0,
						total_price: 0
					}
				];

	let subtotal = 0;
	let discountGlobal = 0;
	let vatRate = 7;
	let whtRate = 0;
	let vatAmount = 0;
	let whtAmount = 0;
	let totalAmount = 0;

	function onProductChange(index: number, selection: any) {
		if (selection) {
			items[index].product_object = selection;
			items[index].product_name = selection.name || selection.label;
			items[index].unit_price = Number(selection.purchase_cost) || 0;

			if (selection.unit_name) {
				items[index].unit = selection.unit_name;
			}
		} else {
			items[index].product_object = null;
			items[index].product_name = '';
			items[index].unit_price = 0;
		}
		calculateTotals();
	}

	function calculateTotals() {
		subtotal = items.reduce((sum, item) => {
			const lineTotal = item.quantity * item.unit_price - (item.discount || 0);
			item.total_price = lineTotal > 0 ? lineTotal : 0;
			return sum + item.total_price;
		}, 0);

		const afterDiscount = subtotal - discountGlobal;
		const baseAmount = afterDiscount > 0 ? afterDiscount : 0;

		vatAmount = (baseAmount * vatRate) / 100;
		whtAmount = (baseAmount * whtRate) / 100;
		totalAmount = baseAmount + vatAmount - whtAmount;

		items = items;
	}

	function addItem() {
		items = [
			...items,
			{
				product_name: '',
				product_object: null,
				description: '',
				quantity: 1,
				unit: defaultUnit,
				unit_price: 0,
				discount: 0,
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

	calculateTotals();
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
				d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
			/>
		</svg>
		สร้างใบสั่งซื้อใหม่ (New PO)
	</h1>

	<form method="POST" action="?/create" use:enhance class="space-y-6">
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="space-y-4">
				<div>
					<label for="po_number" class="block text-sm font-medium text-gray-700"
						>เลขที่เอกสาร (PO No.)</label
					>
					<input
						type="text"
						id="po_number"
						name="po_number"
						value={data.nextPONumber}
						readonly
						class="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm"
					/>
				</div>
				<div>
					<label for="vendor_id" class="block text-sm font-medium text-gray-700"
						>ผู้ขาย (Vendor) <span class="text-red-500">*</span></label
					>
					<select
						id="vendor_id"
						name="vendor_id"
						required
						class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					>
						<option value="">-- เลือกผู้ขาย --</option>
						{#each data.vendors as vendor}
							<option value={vendor.id}
								>{vendor.name} {vendor.company_name ? `(${vendor.company_name})` : ''}</option
							>
						{/each}
					</select>
				</div>
				<div>
					<label for="contact_person" class="block text-sm font-medium text-gray-700"
						>ผู้ติดต่อ (Contact Person)</label
					>
					<input
						type="text"
						id="contact_person"
						name="contact_person"
						bind:value={contact_person}
						class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
			</div>

			<div class="space-y-4">
				<div>
					<label for="date" class="block text-sm font-medium text-gray-700"
						>วันที่สั่งซื้อ (Date) <span class="text-red-500">*</span></label
					>
					<input
						type="date"
						id="date"
						name="date"
						bind:value={today}
						required
						class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="delivery_date" class="block text-sm font-medium text-gray-700"
						>วันที่กำหนดส่ง (Delivery Date)</label
					>
					<input
						type="date"
						id="delivery_date"
						name="delivery_date"
						bind:value={delivery_date}
						class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="payment_term" class="block text-sm font-medium text-gray-700"
						>เงื่อนไขการชำระเงิน (Payment Term)</label
					>
					<input
						type="text"
						id="payment_term"
						name="payment_term"
						bind:value={payment_term}
						placeholder="เช่น 30 วัน, เงินสด"
						class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
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
						<th class="w-28 px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"
							>ส่วนลด</th
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
									on:input={calculateTotals}
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
										{#each data.units as u}
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
									type="number"
									step="0.01"
									bind:value={item.unit_price}
									on:input={calculateTotals}
									class="w-full rounded-md border-gray-300 text-right text-sm focus:border-blue-500 focus:ring-blue-500"
									required
								/>
							</td>
							<td class="px-3 py-2">
								<input
									type="number"
									step="0.01"
									bind:value={item.discount}
									on:input={calculateTotals}
									class="w-full rounded-md border-gray-300 text-right text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</td>
							<td class="px-3 py-2 text-right font-medium text-gray-900">
								{item.total_price.toLocaleString('en-US', {
									minimumFractionDigits: 2,
									maximumFractionDigits: 2
								})}
							</td>
							<td class="px-3 py-2 text-center">
								{#if items.length > 1}
									<button
										type="button"
										on:click={() => removeItem(index)}
										class="text-red-500 hover:text-red-700"
										aria-label="ลบรายการสินค้า"
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
					on:click={addItem}
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

		<div class="mt-8 grid grid-cols-1 gap-8 border-t pt-6 md:grid-cols-2">
			<div>
				<label for="remarks" class="block text-sm font-medium text-gray-700"
					>หมายเหตุ (Remarks)</label
				>
				<textarea
					id="remarks"
					name="remarks"
					bind:value={remarks}
					rows="4"
					class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				></textarea>
			</div>
			<div class="space-y-3 rounded-lg bg-gray-50 p-4">
				<div class="flex justify-between text-sm">
					<span class="text-gray-600">รวมเป็นเงิน (Subtotal)</span>
					<span class="font-medium"
						>{subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span
					>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-sm text-gray-600">ส่วนลดท้ายบิล (Discount)</span>
					<input
						aria-label="ส่วนลดท้ายบิล"
						type="number"
						step="0.01"
						bind:value={discountGlobal}
						on:input={calculateTotals}
						class="w-32 rounded-md border-gray-300 p-1 text-right text-sm shadow-sm"
					/>
				</div>

				<div class="flex items-center justify-between">
					<span class="text-sm text-gray-600">ภาษีมูลค่าเพิ่ม (VAT)</span>
					<div class="flex items-center gap-2">
						<select
							bind:value={vatRate}
							on:change={calculateTotals}
							class="w-32 cursor-pointer rounded-md border-gray-300 p-1 text-center text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
						>
							<option value={0}>ไม่มี VAT (0%)</option>
							<option value={7}>VAT 7%</option>
						</select>
						<span class="w-24 text-right font-medium"
							>{vatAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span
						>
					</div>
				</div>

				<div class="flex items-center justify-between">
					<span class="text-sm text-gray-600">หัก ณ ที่จ่าย (WHT)</span>
					<div class="flex items-center gap-2">
						<select
							bind:value={whtRate}
							on:change={calculateTotals}
							class="w-32 cursor-pointer rounded-md border-gray-300 p-1 text-center text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
						>
							<option value={0}>ไม่หัก (0%)</option>
							<option value={1}>1% (ขนส่ง)</option>
							<option value={3}>3% (บริการ)</option>
							<option value={5}>5% (ค่าเช่า)</option>
						</select>
						<span class="w-24 text-right font-medium text-red-600"
							>-{whtAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span
						>
					</div>
				</div>

				<div class="flex items-center justify-between border-t border-gray-300 pt-3">
					<span class="text-lg font-bold text-gray-800">ยอดรวมสุทธิ (Total)</span>
					<span class="text-xl font-bold text-blue-700"
						>{totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span
					>
				</div>
			</div>
		</div>

		<input type="hidden" name="items_json" value={JSON.stringify(items)} />

		{#if data.fromPR}
			<input type="hidden" name="from_pr_id" value={data.fromPR.id} />
		{/if}

		<input type="hidden" name="subtotal" value={subtotal} />
		<input type="hidden" name="discount" value={discountGlobal} />
		<input type="hidden" name="vat_rate" value={vatRate} />
		<input type="hidden" name="vat_amount" value={vatAmount} />
		<input type="hidden" name="wht_rate" value={whtRate} />
		<input type="hidden" name="wht_amount" value={whtAmount} />
		<input type="hidden" name="total_amount" value={totalAmount} />

		<div class="mt-6 flex justify-end gap-4">
			<a
				href="/purchase-orders"
				class="rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
				>ยกเลิก</a
			>
			<button
				type="submit"
				class="rounded-md border border-transparent bg-blue-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
				>บันทึกใบสั่งซื้อ (Save)</button
			>
		</div>
	</form>
</div>
