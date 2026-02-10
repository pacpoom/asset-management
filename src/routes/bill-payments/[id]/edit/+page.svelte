<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let isSaving = $state(false);

	// --- 1. Define Interface ---
	interface BillPaymentItem {
		id: string;
		product_object: any;
		product_id: number | null;
		description: string;
		quantity: number;
		unit_id: number | null;
		unit_price: number;
		line_total: number;
	}

	// --- Initialize Data ---
	const payment = data.payment;

	// Header Fields
	let vendor_id = $state(payment.vendor_id);
	let vendor_contract_id = $state(payment.vendor_contract_id);
	let payment_date = $state(new Date(payment.payment_date).toISOString().split('T')[0]);
	let payment_reference = $state(payment.payment_reference || '');
	let notes = $state(payment.notes || '');

	// Calculation Fields
	let discountAmount = $state(Number(payment.discount_amount));
	let vat_selection = $state(Number(payment.vat_rate));
	let calculateWHT = $state(Number(payment.withholding_tax_rate) > 0);
	let wht_selection = $state(Number(payment.withholding_tax_rate));

	// Items Data
	let initialItems: BillPaymentItem[] = (data.items || []).map((item: any) => {
		const prod = (data.products || []).find((p: any) => p.id === item.product_id);
		return {
			id: crypto.randomUUID(),
			product_id: item.product_id,
			product_object: prod
				? { value: prod.id, label: `${prod.sku} - ${prod.name}`, product: prod }
				: null,
			description: item.description || '',
			quantity: Number(item.quantity),
			unit_id: item.unit_id,
			unit_price: Number(item.unit_price),
			line_total: Number(item.line_total)
		};
	});

	if (initialItems.length === 0) {
		initialItems.push({
			id: crypto.randomUUID(),
			product_object: null,
			product_id: null,
			description: '',
			quantity: 1,
			unit_id: null,
			unit_price: 0,
			line_total: 0
		});
	}

	let items = $state<BillPaymentItem[]>(initialItems);
	let newAttachments = $state<FileList | null>(null);

	// --- Derived & Helpers ---
	const subTotal = $derived(
		items.reduce((sum: number, item: BillPaymentItem) => sum + item.line_total, 0)
	);
	const totalAfterDiscount = $derived(subTotal - (discountAmount || 0));
	const vatAmount = $derived(vat_selection > 0 ? (totalAfterDiscount * vat_selection) / 100 : 0);
	const withholdingTaxAmount = $derived(
		wht_selection > 0 ? (totalAfterDiscount * wht_selection) / 100 : 0
	);
	const grandTotal = $derived(totalAfterDiscount + vatAmount - withholdingTaxAmount);

	const filteredContracts = $derived(
		vendor_id ? (data.contracts || []).filter((c: any) => c.vendor_id == vendor_id) : []
	);

	const productOptions = $derived(
		(data.products || []).map((p: any) => ({
			value: p.id,
			label: `${p.sku} - ${p.name}`,
			product: p
		}))
	);

	function formatCurrency(val: number) {
		return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(val);
	}

	function onVendorChange() {
		vendor_contract_id = null;
	}

	function updateLineTotal(item: BillPaymentItem) {
		item.line_total = (item.quantity || 0) * (item.unit_price || 0);
		items = [...items];
	}

	function onProductSelectChange(item: BillPaymentItem) {
		if (!item.product_object) {
			item.product_id = null;
			item.description = '';
			item.unit_id = null;
			item.unit_price = 0;
		} else {
			const p = item.product_object.product;
			item.product_id = p.id;
			item.description = p.name;
			item.unit_id = p.unit_id;
			item.unit_price = p.purchase_cost ?? 0;
		}
		updateLineTotal(item);
	}

	function addLineItem() {
		items = [
			...items,
			{
				id: crypto.randomUUID(),
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

	function removeLineItem(id: string) {
		items = items.filter((i) => i.id !== id);
	}

	async function deleteAttachment(attachmentId: number) {
		if (!confirm('ต้องการลบไฟล์แนบนี้ใช่หรือไม่?')) return;

		const formData = new FormData();
		formData.append('attachment_id', attachmentId.toString());

		const response = await fetch('?/deleteAttachment', {
			method: 'POST',
			body: formData
		});

		if (response.ok) {
			await invalidateAll();
		} else {
			alert('เกิดข้อผิดพลาดในการลบไฟล์');
		}
	}
</script>

<div class="container mx-auto max-w-7xl p-6">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">แก้ไขรายการจ่ายเงิน #{payment.id}</h1>
		<a href="/bill-payments" class="text-sm text-gray-500 hover:underline">กลับหน้ารายการ</a>
	</div>

	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
		<form
			method="POST"
			action="?/updatePayment"
			enctype="multipart/form-data"
			use:enhance={({ formData }) => {
				isSaving = true;
				formData.set('itemsJson', JSON.stringify(items));
				formData.set('calculateWithholdingTax', (wht_selection > 0).toString());
				return async ({ update }) => {
					await update();
					isSaving = false;
				};
			}}
		>
			<div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-4">
				<div>
					<label for="vendor_id" class="mb-1 block text-sm font-medium text-gray-700"
						>Vendor <span class="text-red-500">*</span></label
					>
					<select
						id="vendor_id"
						name="vendor_id"
						bind:value={vendor_id}
						onchange={onVendorChange}
						required
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500"
					>
						<option value={null}>-- เลือก Vendor --</option>
						{#each data.vendors as v}<option value={v.id}>{v.name}</option>{/each}
					</select>
				</div>
				<div>
					<label for="vendor_contract_id" class="mb-1 block text-sm font-medium text-gray-700"
						>สัญญา (Contract)</label
					>
					<select
						id="vendor_contract_id"
						name="vendor_contract_id"
						bind:value={vendor_contract_id}
						disabled={!vendor_id}
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500"
					>
						<option value={null}>-- ไม่ระบุ --</option>
						{#each filteredContracts as c}<option value={c.id}
								>{c.contract_number ? c.contract_number + ' - ' : ''}{c.title}</option
							>{/each}
					</select>
				</div>
				<div>
					<label for="payment_date" class="mb-1 block text-sm font-medium text-gray-700"
						>วันที่จ่าย <span class="text-red-500">*</span></label
					>
					<input
						id="payment_date"
						type="date"
						name="payment_date"
						bind:value={payment_date}
						required
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500"
					/>
				</div>
				<div>
					<label for="payment_reference" class="mb-1 block text-sm font-medium text-gray-700"
						>Reference</label
					>
					<input
						id="payment_reference"
						type="text"
						name="payment_reference"
						bind:value={payment_reference}
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500"
					/>
				</div>
			</div>

			<div class="mb-6 overflow-hidden rounded-lg border border-gray-200">
				<table class="min-w-full divide-y divide-gray-200 text-sm">
					<thead class="bg-gray-50">
						<tr>
							<th class="w-[15%] px-4 py-2 text-left font-semibold text-gray-600">สินค้า/บริการ</th>

							<th class="px-4 py-2 text-center font-semibold text-gray-600">รายละเอียด</th>

							<th class="w-[120px] px-4 py-2 text-center font-semibold text-gray-600">จำนวน</th>

							<th class="w-[140px] px-4 py-2 text-center font-semibold text-gray-600">หน่วย</th>

							<th class="w-[150px] px-4 py-2 text-center font-semibold text-gray-600">ราคา/หน่วย</th
							>

							<th class="w-[150px] px-4 py-2 text-center font-semibold text-gray-600">รวม</th>

							<th class="w-10 px-4 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each items as item (item.id)}
							<tr class="align-top">
								<td class="px-4 py-2">
									<Select
										items={productOptions}
										bind:value={item.product_object}
										on:change={() => onProductSelectChange(item)}
										on:clear={() => {
											item.product_object = null;
											onProductSelectChange(item);
										}}
										placeholder="ค้นหา..."
										--inputStyles="padding: 2px;"
									/>
								</td>
								<td class="px-4 py-2">
									<input
										type="text"
										bind:value={item.description}
										class="w-full rounded border-gray-300 text-center text-sm"
									/>
								</td>
								<td class="px-4 py-2">
									<input
										type="number"
										bind:value={item.quantity}
										oninput={() => updateLineTotal(item)}
										min="0"
										class="w-full rounded border-gray-300 text-center text-sm"
									/>
								</td>
								<td class="px-4 py-2">
									<select
										bind:value={item.unit_id}
										class="w-full rounded border-gray-300 text-center text-sm"
									>
										<option value={null}>-</option>
										{#each data.units as u}<option value={u.id}>{u.symbol}</option>{/each}
									</select>
								</td>
								<td class="px-4 py-2">
									<input
										type="number"
										bind:value={item.unit_price}
										oninput={() => updateLineTotal(item)}
										min="0"
										class="w-full rounded border-gray-300 text-center text-sm"
									/>
								</td>
								<td class="px-4 py-2 text-center font-medium">{formatCurrency(item.line_total)}</td>
								<td class="px-4 py-2 text-center">
									<button
										type="button"
										onclick={() => removeLineItem(item.id)}
										class="text-red-500 hover:text-red-700">ลบ</button
									>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<div class="bg-gray-50 p-2">
					<button
						type="button"
						onclick={addLineItem}
						class="text-sm font-medium text-blue-600 hover:text-blue-800">+ เพิ่มรายการ</button
					>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
				<div>
					<label for="notes" class="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ</label>
					<textarea
						id="notes"
						name="notes"
						rows="4"
						bind:value={notes}
						class="w-full rounded-md border-gray-300 shadow-sm"
					></textarea>

					<div class="mt-4">
						<label for="new_attachments" class="mb-1 block text-sm font-medium text-gray-700"
							>แนบไฟล์เพิ่ม</label
						>
						<input
							id="new_attachments"
							type="file"
							name="new_attachments"
							multiple
							bind:files={newAttachments}
							class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
						/>

						{#if data.attachments.length > 0}
							<div class="mt-3 space-y-2">
								<p class="text-sm font-semibold text-gray-600">ไฟล์แนบเดิม:</p>
								{#each data.attachments as file}
									<div class="flex items-center justify-between rounded bg-gray-50 p-2 text-sm">
										<span class="truncate">{file.file_original_name}</span>
										<button
											type="button"
											onclick={() => deleteAttachment(file.id)}
											class="font-medium text-red-500 hover:text-red-700"
										>
											ลบ
										</button>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<div class="space-y-3 text-sm">
					<div class="flex justify-between">
						<span class="text-gray-600">รวมเป็นเงิน</span>
						<span class="font-semibold">{formatCurrency(subTotal)}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-gray-600">ส่วนลด</span>
						<input
							type="number"
							name="discountAmount"
							bind:value={discountAmount}
							class="w-32 rounded border-gray-300 text-right text-sm"
						/>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-600">หลังหักส่วนลด</span>
						<span class="font-semibold">{formatCurrency(totalAfterDiscount)}</span>
					</div>

					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<span class="text-gray-600">VAT</span>
							<select
								name="vatRate"
								bind:value={vat_selection}
								class="h-7 rounded border-gray-300 py-0 text-sm"
							>
								<option value={0}>0%</option>
								<option value={7}>7%</option>
							</select>
						</div>
						<span>{formatCurrency(vatAmount)}</span>
					</div>

					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<span class="text-gray-600">หัก ณ ที่จ่าย</span>
							<select
								name="withholdingTaxRate"
								bind:value={wht_selection}
								class="h-7 rounded border-gray-300 py-0 text-sm"
							>
								<option value={0}>ไม่หัก</option>
								<option value={1}>1%</option>
								<option value={3}>3%</option>
							</select>
						</div>
						<span class="text-red-600">-{formatCurrency(withholdingTaxAmount)}</span>
					</div>

					<div class="flex justify-between border-t pt-2 text-lg font-bold text-blue-700">
						<span>ยอดรวมทั้งสิ้น</span>
						<span>{formatCurrency(grandTotal)}</span>
					</div>
				</div>
			</div>

			<div class="mt-8 flex justify-end gap-3 border-t pt-4">
				<a
					href="/bill-payments"
					class="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300">ยกเลิก</a
				>
				<button
					type="submit"
					disabled={isSaving}
					class="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
				>
					{isSaving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	:global(div.svelte-select) {
		min-height: 32px;
		border: 1px solid #d1d5db !important;
		border-radius: 0.375rem !important;
	}
</style>
