<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	export let data: PageData;
	$: ({ document, existingItems, existingAttachments, vendors, products, units, deliveryAddresses } = data);

	$: productOptions = products.map((p: any) => ({
		value: p.id,
		label: `${p.sku} - ${p.name}`,
		product: p
	}));

	interface DocumentItem {
		product_object: any;
		product_id: number | null;
		description: string;
		quantity: number;
		unit_id: number | null;
		unit_price: number;
		line_total: number;
		wht_rate: number;
	}

	let documentDate = '';
	let dueDate = '';
	let creditTerm: number | null = 0;
	let items: DocumentItem[] = [];
	let discountAmount = 0;
	let vatRate = 7;
	let selectedVendorId = data.document?.vendor_id ? String(data.document.vendor_id) : '';
	let selectedDeliveryAddressId = data.document?.delivery_address_id ? String(data.document.delivery_address_id) : '';

	function getDocTypeName(type: string) {
		switch (type) {
			case 'PR': return 'ใบเสนอซื้อ (PR)';
			case 'PO': return 'ใบสั่งซื้อ (PO)';
			case 'GR': return 'ใบรับของ (GR)';
			case 'AP': return 'บันทึกตั้งหนี้ (AP)';
			case 'PV': return 'ใบสำคัญจ่าย (PV)';
			default: return type;
		}
	}

	$: if (document) {
		documentDate = new Date(document.document_date).toISOString().split('T')[0];
		dueDate = document.due_date ? new Date(document.due_date).toISOString().split('T')[0] : '';
		creditTerm = document.credit_term !== null ? Number(document.credit_term) : 0;
		discountAmount = parseFloat(document.discount_amount || '0');
		vatRate = parseFloat(document.vat_rate || '7');
	}

	$: if (existingItems && items.length === 0) {
		items = existingItems.map((item: any) => {
			const foundProduct = products.find((p: any) => p.id == item.product_id);
			const productObj = foundProduct
				? { value: foundProduct.id, label: `${foundProduct.sku} - ${foundProduct.name}`, product: foundProduct }
				: null;

			return {
				product_object: productObj,
				product_id: item.product_id ? Number(item.product_id) : null,
				description: item.description,
				quantity: parseFloat(item.quantity || '0'),
				unit_id: item.unit_id ? Number(item.unit_id) : null,
				unit_price: parseFloat(item.unit_price || '0'),
				line_total: parseFloat(item.line_total || '0'),
				wht_rate: parseFloat(item.wht_rate || '0')
			};
		});
	}

	$: subtotal = items.reduce((sum, item) => sum + (item.line_total || 0), 0);
	$: totalAfterDiscount = Math.max(0, subtotal - discountAmount);
	$: vatAmount = (totalAfterDiscount * vatRate) / 100;
	$: whtAmount = items.reduce((sum, item) => sum + (item.line_total || 0) * (item.wht_rate / 100), 0);
	$: grandTotal = totalAfterDiscount + vatAmount - whtAmount;
	$: itemsJson = JSON.stringify(items);

	function addItem() {
		items = [...items, { product_object: null, product_id: null, description: '', quantity: 1, unit_id: null, unit_price: 0, line_total: 0, wht_rate: 0 }];
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
			items[index].wht_rate = parseFloat(product.default_wht_rate) || 0;
		} else {
			items[index].product_id = null;
			items[index].description = '';
			items[index].unit_price = 0;
			items[index].unit_id = null;
			items[index].wht_rate = 0;
		}
		updateLineTotal(index);
		items = items;
	}

	function calculateDueDate() {
		if (documentDate && creditTerm !== null && creditTerm !== undefined) {
			const d = new Date(documentDate);
			d.setDate(d.getDate() + Number(creditTerm));
			dueDate = d.toISOString().split('T')[0];
		}
	}

	let isSaving = false;
</script>

<svelte:head>
	<title>แก้ไข {getDocTypeName(document?.document_type)} {document?.document_number}</title>
</svelte:head>

<div class="mx-auto mb-10 max-w-7xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">
			แก้ไข {getDocTypeName(document?.document_type)}:
			<span class="text-indigo-600">{document?.document_number}</span>
		</h1>
		<span class="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">สถานะ: {document?.status}</span>
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
				<label for="document_type_display" class="mb-1 block text-sm font-medium text-gray-500">ประเภทเอกสาร (ไม่สามารถเปลี่ยนได้)</label>
				<input type="text" id="document_type_display" value={getDocTypeName(document?.document_type)} disabled class="w-full rounded-md border-gray-300 bg-gray-100 text-gray-500 shadow-sm" />
			</div>

			<div>
				<label for="vendor_id" class="mb-1 block text-sm font-medium text-gray-700">ผู้จำหน่าย (Vendor) <span class="text-red-500">*</span></label>
				<select id="vendor_id" name="vendor_id" bind:value={selectedVendorId} required class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
					<option value="">-- เลือกผู้จำหน่าย --</option>
					{#each vendors as vendor}<option value={String(vendor.id)}>{vendor.name}</option>{/each}
				</select>
			</div>

			<div class="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-3">
				<div>
					<label for="document_date" class="mb-1 block text-sm font-medium text-gray-700">วันที่เอกสาร <span class="text-red-500">*</span></label>
					<input type="date" id="document_date" name="document_date" bind:value={documentDate} on:change={calculateDueDate} required class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500" />
				</div>
				<div>
					<label for="credit_term" class="mb-1 block text-sm font-medium text-gray-700">เครดิตเทอม (วัน)</label>
					<select id="credit_term" name="credit_term" bind:value={creditTerm} on:change={calculateDueDate} class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500">
						<option value={0}>0 วัน (เงินสด)</option><option value={30}>30 วัน</option><option value={45}>45 วัน</option><option value={60}>60 วัน</option><option value={90}>90 วัน</option>
					</select>
				</div>
				<div>
					<label for="due_date" class="mb-1 block text-sm font-medium text-gray-700">ครบกำหนดชำระ</label>
					<input type="date" id="due_date" name="due_date" bind:value={dueDate} class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500" />
				</div>
			</div>

			<div class="md:col-span-1">
				<label for="delivery_address_id" class="mb-1 block text-sm font-medium text-gray-700">สถานที่จัดส่ง (Shipping Address)</label>
				<select
					id="delivery_address_id"
					name="delivery_address_id"
					bind:value={selectedDeliveryAddressId}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500"
				>
					<option value="">-- ไม่ระบุ --</option>
					{#each deliveryAddresses as address}
						<option value={address.id}>{address.name} {address.contact_name ? `(${address.contact_name})` : ''}</option>
					{/each}
				</select>
			</div>

			<div class="md:col-span-1">
				<label for="reference_doc" class="mb-1 block text-sm font-medium text-gray-700">เอกสารอ้างอิงของ Supplier</label>
				<input type="text" id="reference_doc" name="reference_doc" value={document?.reference_doc || ''} class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500" />
			</div>
		</div>

		<div class="mb-6">
			<h3 class="mb-2 text-lg font-medium text-gray-800">รายการสั่งซื้อ/รับบริการ</h3>
			<div class="overflow-x-auto rounded-lg border">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50 text-xs text-gray-500 uppercase">
						<tr>
							<th class="w-40 px-4 py-3 text-left font-medium">รหัสสินค้า/บริการ</th>
							<th class="px-4 py-3 text-left font-bold">รายละเอียด</th>
							<th class="w-24 px-3 py-3 text-right">จำนวน</th>
							<th class="w-24 px-3 py-3 text-center">หน่วย</th>
							<th class="w-28 px-3 py-3 text-right">ต้นทุน/หน่วย</th>
							<th class="w-24 px-3 py-3 text-center text-red-600">หัก ณ ที่จ่าย</th>
							<th class="w-32 px-3 py-3 text-right">รวม</th>
							<th class="w-10 px-3 py-3"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each items as item, index}
							<tr>
								<td class="w-40 px-3 py-2" style="min-width: 200px; max-width: 250px;">
									<Select
										items={productOptions}
										value={item.product_object}
										on:change={(e) => onProductChange(index, e.detail)}
										on:clear={() => onProductChange(index, null)}
										placeholder="ค้นหา..."
										floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
										container={browser ? document.body : null}
										--inputStyles="padding: 2px 0; font-size: 0.875rem;"
										--list="border-radius: 6px; font-size: 0.875rem;"
										--itemIsActive="background: #e0e7ff;"
										--valueStyles="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
									/>
								</td>
								<td class="px-3 py-2">
									<input type="text" bind:value={item.description} class="w-full overflow-hidden rounded-md border-gray-300 text-sm text-ellipsis whitespace-nowrap" required title={item.description} />
								</td>
								<td class="px-3 py-2">
									<input type="number" bind:value={item.quantity} on:input={() => updateLineTotal(index)} min="1" class="w-full rounded-md border-gray-300 text-right text-sm" required />
								</td>
								<td class="px-3 py-2">
									<select bind:value={item.unit_id} class="w-full rounded-md border-gray-300 py-1.5 pl-2 text-sm focus:border-indigo-500">
										<option value={null}>-</option>{#each units as u}<option value={u.id}>{u.symbol}</option>{/each}
									</select>
								</td>
								<td class="px-3 py-2">
									<input type="number" step="0.01" bind:value={item.unit_price} on:input={() => updateLineTotal(index)} class="w-full rounded-md border-gray-300 text-right text-sm" required />
								</td>
								<td class="px-3 py-2">
									<select bind:value={item.wht_rate} class="w-full rounded-md border-red-200 bg-red-50 py-1.5 text-center text-sm font-bold text-red-700">
										<option value={0}>0%</option><option value={1}>1%</option><option value={2}>2%</option><option value={3}>3%</option><option value={5}>5%</option>
									</select>
								</td>
								<td class="px-3 py-2 text-right">
									<div class="font-bold text-gray-900">{item.line_total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
								</td>
								<td class="px-3 py-2 text-center">
									{#if items.length > 1}<button type="button" on:click={() => removeItem(index)} class="text-red-500 hover:text-red-700" title="ลบรายการ">❌</button>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<button type="button" on:click={addItem} class="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-800">+ เพิ่มรายการ</button>
		</div>

		<div class="mb-6 flex flex-col gap-6 md:flex-row">
			<div class="w-full space-y-4 md:w-2/3">
				<div>
					<label for="notes" class="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ</label>
					<textarea id="notes" name="notes" rows="3" value={document?.notes || ''} class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500"></textarea>
				</div>

				<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
					<h4 class="mb-2 text-sm font-medium text-gray-900">ไฟล์แนบที่มีอยู่</h4>
					{#if existingAttachments.length === 0}
						<p class="text-sm text-gray-500">ไม่มีไฟล์แนบ</p>
					{:else}
						<ul class="space-y-2">
							{#each existingAttachments as file}
								<li class="flex items-center justify-between rounded border bg-white p-2 text-sm shadow-sm">
									<a href={file.url} target="_blank" rel="noopener noreferrer" class="max-w-[200px] truncate text-indigo-600 hover:underline">{file.file_original_name}</a>
									<button type="submit" formaction="?/deleteAttachment" name="attachment_id" value={file.id} class="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50">ลบ</button>
								</li>
							{/each}
						</ul>
					{/if}
					<div class="mt-4">
						<label for="attachments" class="mb-1 block text-sm font-medium text-gray-700">เพิ่มไฟล์แนบใหม่</label>
						<input type="file" id="attachments" name="attachments" multiple class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700" />
					</div>
				</div>
			</div>

			<div class="h-fit w-full space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-inner md:w-1/3">
				<div class="flex justify-between text-sm"><span class="text-gray-600">รวมเป็นเงิน</span><span class="font-medium">{subtotal.toFixed(2)}</span></div>
				<div class="flex items-center justify-between text-sm"><span class="text-gray-600">ส่วนลดรับ</span><input type="number" name="discount_amount" bind:value={discountAmount} min="0" class="w-24 rounded-md border-gray-300 py-1 text-right text-sm shadow-sm" /></div>
				<div class="flex justify-between border-t border-gray-200 pt-2 text-sm"><span class="text-gray-600">หลังหักส่วนลด</span><span class="font-medium">{totalAfterDiscount.toFixed(2)}</span></div>
				<div class="mt-2 flex items-center justify-between text-sm">
					<span class="text-gray-600">VAT ซื้อ <select name="vat_rate" bind:value={vatRate} class="ml-2 w-20 rounded-md border-gray-300 py-1 pr-8 pl-3 text-sm shadow-sm focus:border-indigo-500"><option value={0}>0%</option><option value={7}>7%</option></select></span>
					<span class="font-medium text-green-600">+{vatAmount.toFixed(2)}</span>
					<input type="hidden" name="vat_amount" value={vatAmount} />
				</div>
				<div class="flex items-center justify-between border-b border-gray-200 pb-2 text-sm text-red-600"><span class="font-medium">หัก ณ ที่จ่ายรวม (Total WHT)</span><span class="font-bold">-{whtAmount.toFixed(2)}</span>
					<input type="hidden" name="wht_amount" value={whtAmount} /><input type="hidden" name="wht_rate" value={0} />
				</div>
				<div class="flex justify-between pt-2 text-lg font-black text-gray-900"><span>ยอดสุทธิต้องชำระ</span><span class="text-indigo-700">{grandTotal.toFixed(2)}</span></div>
			</div>
		</div>

		<input type="hidden" name="items_json" value={itemsJson} />
		<input type="hidden" name="subtotal" value={subtotal} />
		<input type="hidden" name="total_after_discount" value={totalAfterDiscount} />
		<input type="hidden" name="total_amount" value={grandTotal} />

		<div class="flex justify-end gap-3 border-t border-gray-200 pt-6">
			<a href="/purchase-documents/{document?.id}" class="rounded-md border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">ยกเลิก</a>
			<button type="submit" disabled={isSaving} class="flex items-center rounded-md bg-indigo-600 px-8 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">
				{#if isSaving}กำลังบันทึก...{:else}บันทึกการแก้ไข{/if}
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