<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	export let data: PageData;
	$: ({ customers, products, units, prefilledData } = data);

	// Options สำหรับ Select
	$: productOptions = products.map((p: any) => ({
		value: p.id,
		label: `${p.sku} - ${p.name}`,
		product: p
	}));

	interface InvoiceItem {
		product_object: any;
		product_id: number | null;
		description: string;
		quantity: number;
		unit_id: number | null;
		unit_price: number;
		line_total: number;
	}

	let invoiceDate = new Date().toISOString().split('T')[0];
	let dueDate = '';

	//ค่าเริ่มต้น product_object
	let items: InvoiceItem[] = [
		{
			product_object: null,
			product_id: null,
			description: '',
			quantity: 1,
			unit_id: null,
			unit_price: 0,
			line_total: 0
		}
	];

	let selectedCustomerId: string | number = '';
	let referenceDoc = '';
	let notes = '';
	let discountAmount = 0;
	let vatRate = 7;
	let whtRate = 0;

	//กันลูป
	let lastProcessedRef = '';

	$: if (prefilledData) {
		if (prefilledData.reference_doc && prefilledData.reference_doc !== lastProcessedRef) {
			lastProcessedRef = prefilledData.reference_doc;
			// อัปเดตลูกค้า
			if (prefilledData.customer_id != null) {
				const targetId = Number(prefilledData.customer_id);
				const foundCustomer = customers.find((c: any) => c.id == targetId);
				if (foundCustomer) {
					selectedCustomerId = foundCustomer.id;
				}
			}

			//อัปเดตข้อมูลทั่วไป
			referenceDoc = prefilledData.reference_doc || '';
			notes = prefilledData.notes || '';
			//อัปเดตตัวเลข
			discountAmount = parseFloat(prefilledData.discount_amount || '0');
			vatRate = parseFloat(prefilledData.vat_rate || '7');
			whtRate = parseFloat(prefilledData.withholding_tax_rate || '0');

			//อัปเดตรายการสินค้า
			if (prefilledData.items && prefilledData.items.length > 0) {
				items = prefilledData.items.map((i: any) => {
					const foundProduct = products.find((p: any) => p.id == i.product_id);
					const productObj = foundProduct
						? {
								value: foundProduct.id,
								label: `${foundProduct.sku} - ${foundProduct.name}`,
								product: foundProduct
							}
						: null;

					return {
						product_object: productObj,
						product_id: i.product_id ? Number(i.product_id) : null,
						description: i.description,
						quantity: parseFloat(i.quantity || '0'),
						unit_id: i.unit_id ? Number(i.unit_id) : null,
						unit_price: parseFloat(i.unit_price || '0'),
						line_total: parseFloat(i.line_total || '0')
					};
				});
			}
		}
	}

	$: subtotal = items.reduce((sum, item) => sum + (item.line_total || 0), 0);
	$: totalAfterDiscount = Math.max(0, subtotal - discountAmount);
	$: vatAmount = (totalAfterDiscount * vatRate) / 100;
	$: whtAmount = (totalAfterDiscount * whtRate) / 100;
	$: grandTotal = totalAfterDiscount + vatAmount - whtAmount;
	$: itemsJson = JSON.stringify(items);

	function addItem() {
		items = [
			...items,
			{
				product_object: null,
				product_id: null,
				description: '',
				quantity: 1,
				unit_id: null,
				unit_price: 0,
				line_total: 0
			}
		];
	}

	function removeItem(index: number) {
		items = items.filter((_, i) => i !== index);
	}

	function updateLineTotal(index: number) {
		items[index].line_total = (items[index].quantity || 0) * (items[index].unit_price || 0);
	}

	function onProductChange(index: number, selected: any) {
		items[index].product_object = selected;

		if (selected) {
			const product = selected.product;
			items[index].product_id = product.id;
			items[index].description = product.name;
			items[index].unit_price = parseFloat(product.price) || 0;
			items[index].unit_id = product.unit_id;
		} else {
			items[index].product_id = null;
			items[index].description = '';
			items[index].unit_price = 0;
			items[index].unit_id = null;
		}

		updateLineTotal(index);
		items = items;
	}

	function setCreditTerm(days: number) {
		const date = new Date(invoiceDate);
		date.setDate(date.getDate() + days);
		dueDate = date.toISOString().split('T')[0];
	}

	let isSaving = false;
</script>

<svelte:head>
	<title>สร้างใบแจ้งหนี้ใหม่</title>
</svelte:head>

<div class="mx-auto max-w-5xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
	<h1 class="mb-6 text-2xl font-bold text-gray-800">สร้างใบแจ้งหนี้ (New Invoice)</h1>

	<form
		method="POST"
		action="?/create"
		enctype="multipart/form-data"
		use:enhance={() => {
			isSaving = true;
			return async ({ update }) => {
				await update();
				isSaving = false;
			};
		}}
	>
		<div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
			<div>
				<label for="customer_id" class="mb-1 block text-sm font-medium text-gray-700"
					>ลูกค้า <span class="text-red-500">*</span></label
				>
				<select
					id="customer_id"
					name="customer_id"
					bind:value={selectedCustomerId}
					required
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				>
					<option value="">-- เลือกลูกค้า --</option>
					{#each customers as customer}
						<option value={customer.id}>{customer.name}</option>
					{/each}
				</select>
			</div>
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="invoice_date" class="mb-1 block text-sm font-medium text-gray-700"
						>วันที่เอกสาร <span class="text-red-500">*</span></label
					>
					<input
						type="date"
						id="invoice_date"
						name="invoice_date"
						bind:value={invoiceDate}
						required
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="due_date" class="mb-1 block text-sm font-medium text-gray-700"
						>ครบกำหนดชำระ</label
					>
					<input
						type="date"
						id="due_date"
						name="due_date"
						bind:value={dueDate}
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
					<div class="mt-1 flex gap-2 text-xs text-gray-500">
						<button
							type="button"
							on:click={() => setCreditTerm(7)}
							class="hover:text-blue-600 hover:underline">7 วัน</button
						>
						<button
							type="button"
							on:click={() => setCreditTerm(30)}
							class="hover:text-blue-600 hover:underline">30 วัน</button
						>
					</div>
				</div>
			</div>
			<div>
				<label for="reference_doc" class="mb-1 block text-sm font-medium text-gray-700"
					>เอกสารอ้างอิง (PO)</label
				>
				<input
					type="text"
					id="reference_doc"
					name="reference_doc"
					bind:value={referenceDoc}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					placeholder="เช่น PO-2023..."
				/>
			</div>
			<div>
				<label for="attachments" class="mb-1 block text-sm font-medium text-gray-700">ไฟล์แนบ</label
				>
				<input
					type="file"
					id="attachments"
					name="attachments"
					multiple
					class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
				/>
			</div>
		</div>

		<div class="mb-6">
			<h3 class="mb-2 text-lg font-medium text-gray-800">รายการสินค้า</h3>
			<div class="overflow-x-auto rounded-lg border">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">สินค้า</th
							>
							<th class="w-1/3 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"
								>รายละเอียด</th
							>

							<th
								class="w-24 min-w-[100px] px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase"
								>จำนวน</th
							>
							<th
								class="w-24 min-w-[100px] px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase"
								>หน่วย</th
							>
							<th
								class="w-32 min-w-[120px] px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase"
								>ราคา/หน่วย</th
							>
							<th
								class="w-32 min-w-[120px] px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase"
								>รวม</th
							>

							<th class="w-10 px-3 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each items as item, index}
							<tr>
								<td class="px-3 py-2" style="min-width: 250px;">
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
									/>
								</td>
								<td class="px-3 py-2">
									<input
										type="text"
										bind:value={item.description}
										class="w-full rounded-md border-gray-300 text-sm"
										required
									/>
								</td>
								<td class="px-3 py-2">
									<input
										type="number"
										bind:value={item.quantity}
										on:input={() => updateLineTotal(index)}
										min="1"
										class="w-full rounded-md border-gray-300 text-right text-sm"
										required
									/>
								</td>
								<td class="px-3 py-2">
									<div class="relative">
										<select
											bind:value={item.unit_id}
											class="h-9 w-full cursor-pointer appearance-none rounded-md border-gray-300 py-0 pr-2 pl-3 text-left text-sm focus:border-blue-500 focus:ring-blue-500"
											style="-webkit-appearance: none; -moz-appearance: none; appearance: none; background-image: none;"
										>
											<option value={null}>-</option>
											{#each units as u}
												<option value={u.id}>{u.symbol}</option>
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
										on:input={() => updateLineTotal(index)}
										class="w-full rounded-md border-gray-300 text-right text-sm"
										required
									/>
								</td>
								<td class="px-3 py-2 text-right font-medium text-gray-700">
									{item.line_total.toFixed(2)}
								</td>
								<td class="px-3 py-2 text-center">
									{#if items.length > 1}
										<button
											type="button"
											on:click={() => removeItem(index)}
											class="text-red-500 hover:text-red-700"
											aria-label="ลบรายการ"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 20 20"
												fill="currentColor"
												class="h-5 w-5"
											>
												<path
													fill-rule="evenodd"
													d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.566 19h4.868a2.75 2.75 0 002.71-2.529l.841-10.518.149.022a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
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
			</div>
			<button
				type="button"
				on:click={addItem}
				class="mt-2 flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
			>
				+ เพิ่มรายการ
			</button>
		</div>

		<div class="mb-6 flex justify-end">
			<div class="w-full space-y-2 rounded-lg bg-gray-50 p-4 md:w-1/3">
				<div class="flex justify-between text-sm">
					<span class="text-gray-600">รวมเป็นเงิน (Subtotal)</span>
					<span class="font-medium">{subtotal.toFixed(2)}</span>
				</div>
				<div class="flex items-center justify-between text-sm">
					<span class="text-gray-600">ส่วนลด (Discount)</span>
					<input
						type="number"
						name="discount_amount"
						bind:value={discountAmount}
						min="0"
						class="w-24 rounded-md border-gray-300 py-1 text-right text-sm"
					/>
				</div>
				<div class="flex items-center justify-between text-sm">
					<span class="text-gray-600">
						VAT
						<select
							name="vat_rate"
							bind:value={vatRate}
							class="ml-2 h-7 cursor-pointer rounded-md border-gray-300 bg-white py-0 pr-7 pl-2 text-center text-sm focus:border-blue-500 focus:ring-blue-500"
						>
							<option value={0}>0%</option>
							<option value={7}>7%</option>
						</select>
					</span>
					<span class="font-medium">{vatAmount.toFixed(2)}</span>
					<input type="hidden" name="vat_amount" value={vatAmount} />
				</div>
				<div class="flex items-center justify-between text-sm text-red-600">
					<span class="flex items-center">
						WHT
						<select
							name="wht_rate"
							bind:value={whtRate}
							class="ml-2 h-7 cursor-pointer rounded-md border-red-200 bg-red-50 py-0 pr-7 pl-2 text-center text-sm text-red-700 focus:border-red-500 focus:ring-red-500"
						>
							<option value={0}>0%</option>
							<option value={1}>1%</option>
							<option value={3}>3%</option>
							<option value={5}>5%</option>
						</select>
					</span>
					<span>- {whtAmount.toFixed(2)}</span>
					<input type="hidden" name="wht_amount" value={whtAmount} />
				</div>
				<div
					class="flex justify-between border-t border-gray-300 pt-2 text-base font-bold text-gray-900"
				>
					<span>ยอดสุทธิ (Grand Total)</span>
					<span class="text-blue-600">{grandTotal.toFixed(2)}</span>
				</div>
			</div>
		</div>

		<input type="hidden" name="items_json" value={itemsJson} />
		<input type="hidden" name="subtotal" value={subtotal} />
		<input type="hidden" name="total_after_discount" value={totalAfterDiscount} />
		<input type="hidden" name="total_amount" value={grandTotal} />

		<div class="mb-6">
			<label for="notes" class="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ</label>
			<textarea
				id="notes"
				name="notes"
				rows="3"
				class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
			></textarea>
		</div>

		<div class="flex justify-end gap-3">
			<a
				href="/invoices"
				class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
			>
				ยกเลิก
			</a>
			<button
				type="submit"
				disabled={isSaving}
				class="rounded-md bg-blue-600 px-6 py-2 text-sm text-white hover:bg-blue-700"
			>
				{isSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
			</button>
		</div>
	</form>
</div>

<style>
	:global(div.svelte-select) {
		min-height: 38px;
		border: 1px solid #d1d5db !important;
		border-radius: 0.375rem !important;
	}
	:global(div.svelte-select .input) {
		font-size: 0.875rem;
	}
	:global(div.svelte-select .list) {
		border-radius: 0.375rem;
		border-color: #d1d5db;
		z-index: 9999 !important;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}
</style>
