<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	export let data: PageData;
	$: ({ quotation, existingItems, existingAttachments, customers, products, units } = data);

	// กำหนดค่าเริ่มต้น
	let quotationDate = '';
	let validUntil = '';
	let items: any[] = [];
	let discountAmount = 0;
	let vatRate = 7;
	let whtRate = 0;
	let selectedCustomerId: string | number = '';

	$: if (quotation) {
		// แก้บั๊กชื่อลูกค้า: ค้นหาใน list ก่อน
		if (quotation.customer_id != null) {
			const targetId = Number(quotation.customer_id);
			const foundCustomer = customers.find((c: any) => c.id == targetId);
			if (foundCustomer) {
				selectedCustomerId = foundCustomer.id;
			}
		}

		// แปลงวันที่และตัวเลข
		quotationDate = new Date(quotation.quotation_date).toISOString().split('T')[0];
		validUntil = quotation.valid_until
			? new Date(quotation.valid_until).toISOString().split('T')[0]
			: '';
		discountAmount = parseFloat(quotation.discount_amount || '0');
		vatRate = parseFloat(quotation.vat_rate || '7');
		whtRate = parseFloat(quotation.withholding_tax_rate || '0');
	}

	// ดึงรายการสินค้าเดิม
	$: if (existingItems && items.length === 0) {
		items = existingItems.map((item: any) => ({
			product_id: item.product_id ? Number(item.product_id) : null,
			description: item.description,
			quantity: parseFloat(item.quantity),
			unit_id: item.unit_id ? Number(item.unit_id) : null,
			unit_price: parseFloat(item.unit_price),
			line_total: parseFloat(item.line_total)
		}));
	}

	// คำนวณเงิน
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
	function onProductChange(index: number) {
		const pId = items[index].product_id;
		const product = products.find((p: any) => p.id == pId);
		if (product) {
			items[index].description = product.name;
			items[index].unit_price = parseFloat(product.price) || 0;
			items[index].unit_id = product.unit_id;
			updateLineTotal(index);
		}
	}

	function setValidDays(days: number) {
		const date = new Date(quotationDate);
		date.setDate(date.getDate() + days);
		validUntil = date.toISOString().split('T')[0];
	}

	let isSaving = false;
</script>

<svelte:head>
	<title>แก้ไขใบเสนอราคา {quotation?.quotation_number}</title>
</svelte:head>

<div class="mx-auto mb-10 max-w-5xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">แก้ไขใบเสนอราคา: {quotation?.quotation_number}</h1>
		<span class="text-sm text-gray-500">สถานะ: {quotation?.status}</span>
	</div>

	<form
		method="POST"
		action="?/update"
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
					<label for="quotation_date" class="mb-1 block text-sm font-medium text-gray-700"
						>วันที่เอกสาร <span class="text-red-500">*</span></label
					>
					<input
						type="date"
						id="quotation_date"
						name="quotation_date"
						bind:value={quotationDate}
						required
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="valid_until" class="mb-1 block text-sm font-medium text-gray-700"
						>ยืนยันราคาถึง</label
					>
					<input
						type="date"
						id="valid_until"
						name="valid_until"
						bind:value={validUntil}
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
					<div class="mt-1 flex gap-2 text-xs text-gray-500">
						<button
							type="button"
							on:click={() => setValidDays(7)}
							class="hover:text-blue-600 hover:underline">7 วัน</button
						>
						<button
							type="button"
							on:click={() => setValidDays(30)}
							class="hover:text-blue-600 hover:underline">30 วัน</button
						>
					</div>
				</div>
			</div>
			<div>
				<label for="reference_doc" class="mb-1 block text-sm font-medium text-gray-700"
					>เอกสารอ้างอิง</label
				>
				<input
					type="text"
					id="reference_doc"
					name="reference_doc"
					value={quotation?.reference_doc || ''}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				/>
			</div>
		</div>

		<div class="mb-6">
			<h3 class="mb-2 text-lg font-medium text-gray-800">รายการสินค้า</h3>
			<div class="overflow-x-auto rounded-lg border">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="w-1/4 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"
								>สินค้า</th
							>
							<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"
								>รายละเอียด</th
							>
							<th class="w-20 px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase"
								>จำนวน</th
							>
							<th class="w-20 px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase"
								>หน่วย</th
							>
							<th class="w-28 px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase"
								>ราคา/หน่วย</th
							>
							<th class="w-28 px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase"
								>รวม</th
							>
							<th class="w-10 px-3 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each items as item, index}
							<tr>
								<td class="px-3 py-2">
									<select
										bind:value={item.product_id}
										on:change={() => onProductChange(index)}
										class="w-full rounded-md border-gray-300 text-sm"
									>
										<option value={null}>-- เลือก --</option>
										{#each products as p}
											<option value={p.id}>{p.sku} - {p.name}</option>
										{/each}
									</select>
								</td>
								<td class="px-3 py-2"
									><input
										type="text"
										bind:value={item.description}
										class="w-full rounded-md border-gray-300 text-sm"
										required
									/></td
								>
								<td class="px-3 py-2"
									><input
										type="number"
										bind:value={item.quantity}
										on:input={() => updateLineTotal(index)}
										min="1"
										class="w-full rounded-md border-gray-300 text-right text-sm"
										required
									/></td
								>
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
									</div>
								</td>
								<td class="px-3 py-2"
									><input
										type="number"
										step="0.01"
										bind:value={item.unit_price}
										on:input={() => updateLineTotal(index)}
										class="w-full rounded-md border-gray-300 text-right text-sm"
										required
									/></td
								>
								<td class="px-3 py-2 text-right font-medium text-gray-700"
									>{item.line_total.toFixed(2)}</td
								>
								<td class="px-3 py-2 text-center">
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
											><path
												fill-rule="evenodd"
												d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.566 19h4.868a2.75 2.75 0 002.71-2.529l.841-10.518.149.022a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
												clip-rule="evenodd"
											/></svg
										>
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<button
				type="button"
				on:click={addItem}
				class="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800">+ เพิ่มรายการ</button
			>
		</div>

		<div class="mb-6 flex flex-col gap-6 md:flex-row">
			<div class="w-full space-y-4 md:w-2/3">
				<div>
					<label for="notes" class="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ</label>
					<textarea
						id="notes"
						name="notes"
						rows="3"
						value={quotation?.notes || ''}
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					></textarea>
				</div>

				<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
					<h4 class="mb-2 text-sm font-medium text-gray-900">ไฟล์แนบที่มีอยู่</h4>
					{#if existingAttachments.length === 0}
						<p class="text-sm text-gray-500">ไม่มีไฟล์แนบ</p>
					{:else}
						<ul class="space-y-2">
							{#each existingAttachments as file}
								<li class="flex items-center justify-between rounded border bg-white p-2 text-sm">
									<a
										href={file.url}
										target="_blank"
										rel="noopener noreferrer"
										class="max-w-[200px] truncate text-blue-600 hover:underline"
										>{file.file_original_name}</a
									>
									<button
										type="submit"
										formaction="?/deleteAttachment"
										name="attachment_id"
										value={file.id}
										class="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
										>ลบ</button
									>
								</li>
							{/each}
						</ul>
					{/if}
					<div class="mt-4">
						<label for="attachments" class="mb-1 block text-sm font-medium text-gray-700"
							>เพิ่มไฟล์แนบใหม่</label
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
			</div>

			<div class="h-fit w-full space-y-2 rounded-lg bg-gray-50 p-4 md:w-1/3">
				<div class="flex justify-between text-sm">
					<span class="text-gray-600">รวมเป็นเงิน</span>
					<span class="font-medium">{subtotal.toFixed(2)}</span>
				</div>
				<div class="flex items-center justify-between text-sm">
					<span class="text-gray-600">ส่วนลด</span>
					<input
						type="number"
						name="discount_amount"
						bind:value={discountAmount}
						min="0"
						class="w-24 rounded-md border-gray-300 py-1 text-right text-sm"
					/>
				</div>
				<div class="flex items-center justify-between text-sm">
					<span class="text-gray-600"
						>VAT <select
							name="vat_rate"
							bind:value={vatRate}
							class="ml-2 h-7 cursor-pointer rounded-md border-gray-300 bg-white py-0 pr-7 pl-2 text-center text-sm focus:border-blue-500 focus:ring-blue-500"
							><option value={0}>0%</option><option value={7}>7%</option></select
						></span
					>
					<span class="font-medium">{vatAmount.toFixed(2)}</span>
					<input type="hidden" name="vat_amount" value={vatAmount} />
				</div>
				<div class="flex items-center justify-between text-sm text-red-600">
					<span class="flex items-center"
						>WHT <select
							name="wht_rate"
							bind:value={whtRate}
							class="ml-2 h-7 cursor-pointer rounded-md border-red-200 bg-red-50 py-0 pr-7 pl-2 text-center text-sm text-red-700 focus:border-red-500 focus:ring-red-500"
							><option value={0}>0%</option><option value={1}>1%</option><option value={3}
								>3%</option
							><option value={5}>5%</option></select
						></span
					>
					<span>- {whtAmount.toFixed(2)}</span>
					<input type="hidden" name="wht_amount" value={whtAmount} />
				</div>
				<div
					class="flex justify-between border-t border-gray-300 pt-2 text-base font-bold text-gray-900"
				>
					<span>ยอดสุทธิ</span>
					<span class="text-blue-600">{grandTotal.toFixed(2)}</span>
				</div>
			</div>
		</div>

		<input type="hidden" name="items_json" value={itemsJson} />
		<input type="hidden" name="subtotal" value={subtotal} />
		<input type="hidden" name="total_after_discount" value={totalAfterDiscount} />
		<input type="hidden" name="vat_amount" value={vatAmount} />
		<input type="hidden" name="wht_amount" value={whtAmount} />
		<input type="hidden" name="total_amount" value={grandTotal} />

		<div class="flex justify-end gap-3">
			<a
				href="/quotations/{quotation?.id}"
				class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
				>ยกเลิก</a
			>
			<button
				type="submit"
				class="flex items-center rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
				disabled={isSaving}
			>
				{#if isSaving}
					Saving...
				{:else}
					บันทึกการแก้ไข
				{/if}
			</button>
		</div>
	</form>
</div>
