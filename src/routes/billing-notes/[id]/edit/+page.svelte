<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { goto } from '$app/navigation';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	export type Customer = PageData['customers'][0];
	export type Product = PageData['products'][0];
	export type Unit = PageData['units'][0];

	export interface BillingNoteItem {
		id: string;
		product_object: { value: number; label: string; product: Product } | null;
		product_id: number | null;
		description: string;
		quantity: number;
		unit_id: number | null;
		unit_price: number;
		amount: number;
	}

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	const customerOptions = $derived(
		(data.customers || []).map((c: any) => ({
			value: c.id,
			label: c.name,
			customer: c
		}))
	);

	const productOptions = $derived(
		(data.products || []).map((p: any) => ({
			value: p.id,
			label: `${p.sku ? p.sku + ' - ' : ''}${p.name}`,
			product: p
		}))
	);

	const bn = data.billingNote;
	let isSaving = $state(false);

	const initCustomer = (data.customers || []).find((c: any) => c.id == bn.customer_id);
	const initCustomerValue = initCustomer
		? { value: initCustomer.id, label: initCustomer.name, customer: initCustomer }
		: bn.customer_id;

	let customer_id = $state(initCustomerValue);

	let billing_date = $state(new Date(bn.billing_date).toISOString().split('T')[0]);
	let due_date = $state(bn.due_date ? new Date(bn.due_date).toISOString().split('T')[0] : '');
	let notes = $state(bn.notes || '');
	let attachments = $state<FileList | null>(null);

	let tempItems: BillingNoteItem[] = (data.billingNoteItems || []).map((item: any) => {
		const prod = (data.products || []).find((p: any) => p.id === item.product_id);
		return {
			id: crypto.randomUUID(),
			product_id: item.product_id,
			product_object: prod
				? {
						value: prod.id,
						label: `${prod.sku ? prod.sku + ' - ' : ''}${prod.name}`,
						product: prod
					}
				: null,
			description: item.description || '',
			quantity: Number(item.quantity),
			unit_id: item.unit_id,
			unit_price: Number(item.unit_price),
			amount: Number(item.amount)
		};
	});

	// 2. เช็คว่าว่างไหม ถ้าว่างให้ Push ใส่ตัวแปรธรรมดา
	if (tempItems.length === 0) {
		tempItems.push({
			id: crypto.randomUUID(),
			product_object: null,
			product_id: null,
			description: '',
			quantity: 1,
			unit_id: null,
			unit_price: 0,
			amount: 0
		});
	}

	let items = $state<BillingNoteItem[]>(tempItems);

	let discountAmount = $state(Number(bn.discount_amount) || 0);
	let vatRate = $state(Number(bn.vat_rate) || 7);
	let whtRate = $state(Number(bn.withholding_tax_rate) || 0);

	const subTotal = $derived(items.reduce((sum, item) => sum + (item.amount || 0), 0));
	const totalAfterDiscount = $derived(Math.max(0, subTotal - discountAmount));
	const vatAmount = $derived(vatRate > 0 ? (totalAfterDiscount * vatRate) / 100 : 0);
	const whtAmount = $derived(whtRate > 0 ? (totalAfterDiscount * whtRate) / 100 : 0);
	const grandTotal = $derived(totalAfterDiscount + vatAmount - whtAmount);

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
				amount: 0
			}
		];
	}

	function removeLineItem(id: string) {
		items = items.filter((i) => i.id !== id);
	}

	function onProductChange(item: BillingNoteItem) {
		const selected = item.product_object;
		if (selected && selected.product) {
			item.product_id = selected.product.id;
			item.description = selected.product.name;
			item.unit_id = selected.product.unit_id;
			item.unit_price = Number(selected.product.selling_price) || 0;
		} else {
			item.product_id = null;
		}
		updateLineTotal(item);
	}

	function updateLineTotal(item: BillingNoteItem) {
		item.amount = (item.quantity || 0) * (item.unit_price || 0);
		items = [...items];
	}

	function formatCurrency(val: number) {
		return new Intl.NumberFormat('th-TH', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(val || 0);
	}

	const handleSubmit: SubmitFunction = ({ formData }) => {
		isSaving = true;

		const itemsJson = JSON.stringify(
			items.map((item) => ({
				product_id: item.product_id,
				description: item.description,
				quantity: item.quantity,
				unit_id: item.unit_id,
				unit_price: item.unit_price,
				amount: item.amount
			}))
		);
		formData.set('itemsJson', itemsJson);

		formData.set('subtotal', subTotal.toString());
		formData.set('discount_amount', discountAmount.toString());
		formData.set('vat_rate', vatRate.toString());
		formData.set('vat_amount', vatAmount.toString());
		formData.set('withholding_tax_rate', whtRate.toString());
		formData.set('withholding_tax_amount', whtAmount.toString());
		formData.set('total_amount', grandTotal.toString());

		return async ({ update }) => {
			await update();
			isSaving = false;
		};
	};
</script>

<svelte:head>
	<title>แก้ไขใบวางบิล {bn.billing_note_number}</title>
	<link rel="stylesheet" href="https://unpkg.com/svelte-select@latest/dist/stylesheet.css" />
</svelte:head>

<div class="mx-auto max-w-7xl py-6">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">แก้ไขใบวางบิล: {bn.billing_note_number}</h1>
			<p class="text-sm text-gray-500">แก้ไขข้อมูลและรายการสินค้า</p>
		</div>
	</div>

	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<form
			method="POST"
			action="?/update"
			enctype="multipart/form-data"
			use:enhance={handleSubmit}
			class="flex h-full flex-col"
		>
			<div class="space-y-6 p-6">
				<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
					<div class="md:col-span-2">
						<label for="customer_select" class="mb-1 block text-sm font-medium text-gray-700"
							>ลูกค้า <span class="text-red-500">*</span></label
						>
						<Select
							id="customer_select"
							items={customerOptions}
							bind:value={customer_id}
							placeholder="-- ค้นหา/เลือกลูกค้า --"
							class="w-full"
							required
							container={browser ? document.body : null}
						/>
						<input type="hidden" name="customer_id" value={customer_id?.value ?? customer_id} />
					</div>
					<div>
						<label for="billing_date" class="mb-1 block text-sm font-medium text-gray-700"
							>วันที่วางบิล <span class="text-red-500">*</span></label
						>
						<input
							id="billing_date"
							type="date"
							name="billing_date"
							bind:value={billing_date}
							required
							class="w-full rounded-md border-gray-300 shadow-sm"
						/>
					</div>
					<div>
						<label for="due_date" class="mb-1 block text-sm font-medium text-gray-700"
							>วันครบกำหนด</label
						>
						<input
							id="due_date"
							type="date"
							name="due_date"
							bind:value={due_date}
							class="w-full rounded-md border-gray-300 shadow-sm"
						/>
					</div>
				</div>

				<div>
					<h3 class="text-md mb-2 font-semibold text-gray-800">รายการสินค้า (วางบิล)</h3>
					<div class="overflow-x-auto rounded border border-gray-200">
						<table class="min-w-full divide-y divide-gray-200 text-sm">
							<thead class="bg-gray-50">
								<tr>
									<th class="w-10 px-3 py-2 text-center text-gray-500">ลำดับ</th>
									<th class="w-[25%] px-3 py-2 text-left font-semibold text-gray-600"
										>สินค้า/บริการ</th
									>
									<th class="w-[20%] px-3 py-2 text-left font-semibold text-gray-600">รายละเอียด</th
									>
									<th class="w-24 px-3 py-2 text-center font-semibold text-gray-600">จำนวน</th>
									<th class="w-28 px-3 py-2 text-center font-semibold text-gray-600">หน่วย</th>
									<th class="w-32 px-3 py-2 text-center font-semibold text-gray-600">ราคา/หน่วย</th>
									<th class="w-32 px-3 py-2 text-center font-semibold text-gray-600">รวมเงิน</th>
									<th class="w-10 px-3 py-2"></th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each items as item, index (item.id)}
									<tr class="align-top hover:bg-gray-50">
										<td class="px-3 py-2 pt-3 text-center">{index + 1}</td>
										<td class="px-3 py-2">
											<Select
												items={productOptions}
												bind:value={item.product_object}
												on:change={() => onProductChange(item)}
												placeholder="สินค้า..."
												container={browser ? document.body : null}
												floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
											/>
										</td>
										<td class="px-3 py-2"
											><input
												type="text"
												bind:value={item.description}
												class="w-full rounded-md border-gray-300 py-1 text-sm"
											/></td
										>
										<td class="px-3 py-2"
											><input
												type="number"
												bind:value={item.quantity}
												oninput={() => updateLineTotal(item)}
												min="0"
												class="w-full rounded-md border-gray-300 py-1 text-center text-sm"
											/></td
										>
										<td class="px-3 py-2"
											><select
												bind:value={item.unit_id}
												class="w-full rounded-md border-gray-300 py-1 text-center text-sm"
												><option value={null}>-</option>{#each data.units || [] as u}<option
														value={u.id}>{u.name}</option
													>{/each}</select
											></td
										>
										<td class="px-3 py-2"
											><input
												type="number"
												bind:value={item.unit_price}
												oninput={() => updateLineTotal(item)}
												min="0"
												step="0.01"
												class="w-full rounded-md border-gray-300 py-1 text-center text-sm"
											/></td
										>
										<td class="px-3 py-2 pt-3 text-center font-medium"
											>{formatCurrency(item.amount)}</td
										>
										<td class="px-3 py-2 pt-2 text-center"
											><button
												type="button"
												onclick={() => removeLineItem(item.id)}
												class="text-red-500 hover:text-red-700">✕</button
											></td
										>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<button
						type="button"
						onclick={addLineItem}
						class="mt-2 flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50"
						>+ เพิ่มรายการ</button
					>
				</div>

				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					<div>
						<label for="notes" class="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ</label>
						<textarea
							id="notes"
							name="notes"
							bind:value={notes}
							rows="4"
							class="w-full rounded-md border-gray-300 shadow-sm"
						></textarea>

						<label for="attachments_modal" class="mt-4 mb-1 block text-sm font-medium text-gray-700"
							>แนบไฟล์</label
						>
						<input
							type="file"
							id="attachments_modal"
							name="attachments"
							multiple
							bind:files={attachments}
							class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-blue-700 hover:file:bg-blue-100"
						/>
					</div>
					<div class="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
						<div class="flex justify-between text-sm">
							<span class="font-medium">รวมเป็นเงิน:</span><span>{formatCurrency(subTotal)}</span>
						</div>
						<div class="flex items-center justify-between gap-2 text-sm">
							<label for="discount_amount">ส่วนลด:</label>
							<div class="flex items-center gap-2">
								<input
									id="discount_amount"
									type="number"
									bind:value={discountAmount}
									min="0"
									step="0.01"
									class="w-24 rounded-md border-gray-300 py-1 text-right text-sm"
								/>
								<span class="w-20 text-right text-red-600">-{formatCurrency(discountAmount)}</span>
							</div>
						</div>
						<div class="flex justify-between border-t border-dashed pt-2 text-sm">
							<span class="font-medium">ราคาหลังหักส่วนลด:</span><span
								>{formatCurrency(totalAfterDiscount)}</span
							>
						</div>
						<div class="flex items-center justify-between gap-2 text-sm">
							<div class="flex items-center gap-2">
								<span>VAT:</span><select
									bind:value={vatRate}
									class="h-7 rounded-md border-gray-300 py-0 text-sm"
									><option value={0}>0%</option><option value={7}>7%</option></select
								>
							</div>
							<span>+{formatCurrency(vatAmount)}</span>
						</div>
						<div class="flex items-center justify-between gap-2 text-sm">
							<div class="flex items-center gap-2">
								<span>WHT:</span><select
									bind:value={whtRate}
									class="h-7 rounded-md border-gray-300 py-0 text-sm"
									><option value={0}>ไม่หัก</option><option value={1}>1%</option><option value={3}
										>3%</option
									><option value={5}>5%</option></select
								>
							</div>
							<span class="text-red-600">-{formatCurrency(whtAmount)}</span>
						</div>
						<div class="mt-2 flex items-center justify-between border-t-2 border-gray-300 pt-2">
							<span class="text-base font-bold">ยอดรวมทั้งสิ้น:</span><span
								class="text-xl font-bold text-blue-700">{formatCurrency(grandTotal)}</span
							>
						</div>
					</div>
				</div>

				{#if form?.message && !form.success}
					<div class="rounded-md bg-red-50 p-3 text-sm text-red-600">
						<strong>Error:</strong>
						{form.message}
					</div>
				{/if}
			</div>

			<div class="flex justify-end gap-3 border-t bg-gray-50 px-6 py-4">
				<a
					href="/billing-notes"
					class="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300">ยกเลิก</a
				>
				<button
					type="submit"
					disabled={isSaving || items.length === 0}
					class="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
				>
					{#if isSaving}กำลังบันทึก...{:else}บันทึกการแก้ไข{/if}
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	:global(div.svelte-select) {
		min-height: 38px;
	}
	:global(div.svelte-select .input) {
		padding: 2px 0;
		font-size: 0.875rem;
	}
	:global(div.svelte-select .selection) {
		padding-top: 4px;
		font-size: 0.875rem;
	}
	:global(div.svelte-select .list) {
		border-radius: 0.375rem;
		border-color: #d1d5db;
		z-index: 9999 !important;
		top: 100% !important;
		bottom: auto !important;
		max-height: 200px;
		overflow-y: auto;
	}
	:global(div.svelte-select .item) {
		font-size: 0.875rem;
	}
	:global(div.svelte-select .item.isActive) {
		background: #e0f2fe;
		color: #0c4a6e;
	}
	:global(.selectContainer) {
		overflow: visible !important;
	}
</style>
