<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { t, locale } from '$lib/i18n';

	export let data: PageData;
	$: ({ customers, products, units, prefilledData } = data);

	$: customerOptions = (customers || []).map((c: any) => ({
		value: c.id,
		label: c.company_name ? `${c.company_name} (${c.name})` : c.name
	}));

	$: productOptions = (products || []).map((p: any) => ({
		value: p.id,
		label: `${p.sku} - ${p.name}`,
		product: p
	}));

	interface ReceiptItem {
		id: string;
		product_object: any;
		product_id: number | null;
		description: string;
		quantity: number;
		unit_id: number | null;
		unit_price: number;
		wht_rate: number;
		line_total: number;
	}

	let receiptDate = new Date().toISOString().split('T')[0];

	let items: ReceiptItem[] = [
		{
			id: crypto.randomUUID(),
			product_object: null,
			product_id: null,
			description: '',
			quantity: 1,
			unit_id: null,
			unit_price: 0,
			wht_rate: 0,
			line_total: 0
		}
	];
	let selectedCustomer: any = null;
	let referenceDoc = '';
	let notes = '';
	let discountAmount = 0;
	let vatRate = 7;

	let lastProcessedRef = '';

	$: if (prefilledData) {
		if (prefilledData.reference_doc && prefilledData.reference_doc !== lastProcessedRef) {
			lastProcessedRef = prefilledData.reference_doc;
			if (prefilledData.customer_id != null) {
				const targetId = Number(prefilledData.customer_id);
				const foundCustomer = customers.find((c: any) => c.id == targetId);
				if (foundCustomer) {
					selectedCustomer = customerOptions.find((c: any) => c.value === foundCustomer.id) || null;
				}
			}

			referenceDoc = prefilledData.reference_doc || '';
			notes = prefilledData.notes || '';
			discountAmount = parseFloat(prefilledData.discount_amount || '0');
			vatRate = parseFloat(prefilledData.vat_rate || '7');
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
						id: crypto.randomUUID(),
						product_object: productObj,
						product_id: i.product_id ? Number(i.product_id) : null,
						description: i.description,
						quantity: parseFloat(i.quantity || '0'),
						unit_id: i.unit_id ? Number(i.unit_id) : null,
						unit_price: parseFloat(i.unit_price || '0'),
						wht_rate: parseFloat(i.wht_rate || '0'),
						line_total: parseFloat(i.line_total || '0')
					};
				});
			}
		}
	}

	$: subtotal = items.reduce((sum: number, item: ReceiptItem) => sum + (item.line_total || 0), 0);
	$: totalAfterDiscount = Math.max(0, subtotal - discountAmount);
	$: vatAmount = (totalAfterDiscount * vatRate) / 100;
	$: totalWhtAmount = items.reduce(
		(sum: number, item: ReceiptItem) => sum + ((item.line_total || 0) * (item.wht_rate || 0)) / 100,
		0
	);
	$: grandTotal = totalAfterDiscount + vatAmount - totalWhtAmount;
	$: itemsJson = JSON.stringify(items);

	// 🌟 ปรับรูปแบบตัวเลขให้เปลี่ยนตามภาษาที่เลือก
	$: currentLoc = $locale === 'th' ? 'th-TH' : $locale === 'zh' ? 'zh-CN' : 'en-US';

	function formatCurrency(val: number) {
		return new Intl.NumberFormat(currentLoc, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(val || 0);
	}

	function addItem() {
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
				wht_rate: 0,
				line_total: 0
			}
		];
	}

	function removeItem(id: string) {
		items = items.filter((i) => i.id !== id);
	}

	function updateLineTotal(index: number) {
		items[index].line_total = (items[index].quantity || 0) * (items[index].unit_price || 0);
	}

	function onProductChange(index: number, selected: any) {
		items[index].product_object = selected;
		if (selected && selected.product) {
			const product = selected.product;
			items[index].product_id = product.id;
			items[index].description = product.name;
			items[index].unit_price = parseFloat(product.price) || 0;
			items[index].unit_id = product.unit_id;
			items[index].wht_rate = 0;
		} else {
			items[index].product_id = null;
			items[index].description = '';
			items[index].unit_price = 0;
			items[index].unit_id = null;
			items[index].wht_rate = 0;
		}

		updateLineTotal(index);
		items = [...items];
	}

	let isSaving = false;
</script>

<svelte:head>
	<title>{$t('Create Receipt Title')}</title>
</svelte:head>

<div
	class="mx-auto mb-10 max-w-7xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6"
>
	<h1 class="mb-6 text-2xl font-bold text-gray-800">
		{$t('Receipts Title')} ({$t('Status_Draft')})
	</h1>

	<form
		method="POST"
		action="?/create"
		enctype="multipart/form-data"
		use:enhance={({ formData }) => {
			isSaving = true;
			formData.set('items_json', itemsJson);
			formData.set('subtotal', subtotal.toString());
			formData.set('discount_amount', discountAmount.toString());
			formData.set('total_after_discount', totalAfterDiscount.toString());
			formData.set('vat_rate', vatRate.toString());
			formData.set('vat_amount', vatAmount.toString());
			formData.set('withholding_tax_amount', totalWhtAmount.toString());
			formData.set('total_amount', grandTotal.toString());
			return async ({ update }) => {
				await update({ reset: false });
				isSaving = false;
			};
		}}
	>
		<div class="relative z-50 mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
			<div>
				<label class="mb-1 block text-sm font-medium text-gray-700">
					<span class="mb-1 block">{$t('Customer')} <span class="text-red-500">*</span></span>
					<Select
						items={customerOptions}
						bind:value={selectedCustomer}
						placeholder={$t('Select Customer')}
						container={browser ? document.body : null}
					/>
				</label>
				<input type="hidden" name="customer_id" value={selectedCustomer?.value ?? ''} />
			</div>
			<div>
				<label for="receipt_date" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Date')} <span class="text-red-500">*</span></label
				>
				<input
					type="date"
					id="receipt_date"
					name="receipt_date"
					bind:value={receiptDate}
					required
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				/>
			</div>
			<div>
				<label for="reference_doc" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Reference Doc (e.g., Billing Note)')}</label
				>
				<input
					type="text"
					id="reference_doc"
					name="reference_doc"
					bind:value={referenceDoc}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					placeholder={$t('e.g. INV-2023...')}
				/>
			</div>
			<div>
				<label for="attachments" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Attachments')}</label
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

		<div class="relative z-10 mb-6">
			<h3 class="mb-2 text-lg font-medium text-gray-800">{$t('Products/Items')}</h3>
			<div class="overflow-x-visible rounded-lg border">
				<table class="min-w-full table-fixed divide-y divide-gray-200 text-sm">
					<thead class="bg-gray-50">
						<tr>
							<th class="w-10 px-3 py-3 text-center font-medium text-gray-500">{$t('No.')}</th>
							<th class="w-[280px] max-w-[280px] px-3 py-3 text-left font-semibold text-gray-600"
								>{$t('Product')}</th
							>
							<th class="w-[220px] max-w-[220px] px-3 py-3 text-left font-semibold text-gray-600"
								>{$t('Description')}</th
							>
							<th class="w-20 px-2 py-3 text-center font-semibold text-gray-600"
								>{$t('Quantity')}</th
							>
							<th class="w-20 px-2 py-3 text-center font-semibold text-gray-600">{$t('Unit')}</th>
							<th class="w-28 px-2 py-3 text-center font-semibold text-gray-600"
								>{$t('Unit Price')}</th
							>
							<th class="w-24 px-2 py-3 text-center font-semibold text-red-600">{$t('WHT')}</th>
							<th class="w-32 px-3 py-3 text-right font-semibold text-gray-600">{$t('Total')}</th>
							<th class="w-10 px-3 py-3"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each items as item, index (item.id)}
							<tr class="align-top hover:bg-gray-50">
								<td class="px-3 py-2 pt-3 text-center">{index + 1}</td>
								<td class="w-[280px] max-w-[280px] px-3 py-2">
									<div class="w-full overflow-hidden">
										<Select
											items={productOptions}
											value={item.product_object}
											on:change={(e: any) => onProductChange(index, e.detail)}
											on:clear={() => onProductChange(index, null)}
											placeholder={$t('-- Search/Select --')}
											floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
											container={browser ? document.body : null}
										/>
									</div>
								</td>
								<td class="w-[220px] max-w-[220px] px-3 py-2">
									<input
										type="text"
										bind:value={item.description}
										class="w-full truncate rounded-md border-gray-300 py-1.5"
										required
									/>
								</td>
								<td class="px-2 py-2">
									<input
										type="number"
										bind:value={item.quantity}
										on:input={() => updateLineTotal(index)}
										min="1"
										class="w-full rounded-md border-gray-300 py-1.5 text-center"
										required
									/>
								</td>
								<td class="px-2 py-2">
									<select
										bind:value={item.unit_id}
										class="w-full rounded-md border-gray-300 py-1.5 text-center text-sm"
									>
										<option value={null}>-</option>
										{#each units as u}
											<option value={u.id}>{u.symbol || u.name}</option>
										{/each}
									</select>
								</td>
								<td class="px-2 py-2">
									<input
										type="number"
										step="0.01"
										bind:value={item.unit_price}
										on:input={() => updateLineTotal(index)}
										class="w-full rounded-md border-gray-300 py-1.5 text-right"
										required
									/>
								</td>
								<td class="px-2 py-2">
									<select
										bind:value={item.wht_rate}
										class="w-full rounded-md border-red-200 bg-red-50 py-1.5 text-center text-sm font-bold text-red-700"
									>
										<option value={0}>0%</option><option value={1}>1%</option><option value={2}
											>2%</option
										><option value={3}>3%</option><option value={5}>5%</option>
									</select>
								</td>
								<td class="px-3 py-2 pt-3 text-right font-medium text-gray-700"
									>{formatCurrency(item.line_total)}</td
								>
								<td class="px-3 py-2 pt-2 text-center">
									{#if items.length > 1}
										<button
											type="button"
											on:click={() => removeItem(item.id)}
											class="text-red-500 hover:text-red-700">✕</button
										>
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
				class="mt-3 text-sm font-medium text-blue-600 hover:text-blue-800"
				>+ {$t('Add Item')}</button
			>
		</div>

		<div class="mb-6 flex flex-col gap-6 border-t border-gray-200 pt-6 md:flex-row">
			<div class="w-full md:w-2/3">
				<label for="notes" class="mb-1 block text-sm font-medium text-gray-700">{$t('Notes')}</label
				>
				<textarea
					id="notes"
					name="notes"
					bind:value={notes}
					rows="4"
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				></textarea>
			</div>
			<div class="w-full space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-5 md:w-1/3">
				<div class="flex justify-between text-sm">
					<span class="text-gray-600">{$t('Total Amount (Subtotal)')}</span>
					<span class="font-medium">{formatCurrency(subtotal)}</span>
				</div>
				<div class="flex items-center justify-between text-sm">
					<span class="text-gray-600">{$t('Discount')}</span>
					<input
						type="number"
						bind:value={discountAmount}
						min="0"
						class="w-24 rounded-md border-gray-300 py-1 text-right text-sm"
					/>
				</div>
				<div class="flex items-center justify-between text-sm">
					<span class="text-gray-600"
						>VAT <select bind:value={vatRate} class="ml-2 h-7 rounded border-gray-300 py-0"
							><option value={0}>0%</option><option value={7}>7%</option></select
						></span
					>
					<span class="font-medium">+{formatCurrency(vatAmount)}</span>
				</div>
				<div
					class="flex items-center justify-between border-t border-dashed pt-2 text-sm font-bold text-red-600"
				>
					<span>{$t('Total WHT')}</span>
					<span>-{formatCurrency(totalWhtAmount)}</span>
				</div>
				<div
					class="flex justify-between border-t-2 border-gray-300 pt-3 text-xl font-black text-blue-700"
				>
					<span>{$t('Grand Total')}</span>
					<span>{formatCurrency(grandTotal)}</span>
				</div>
			</div>
		</div>

		<div class="flex justify-end gap-3 border-t border-gray-200 pt-6">
			<a
				href="/receipts"
				class="rounded-md border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
				>{$t('Cancel')}</a
			>
			<button
				type="submit"
				class="flex items-center rounded-md bg-blue-600 px-8 py-2.5 text-sm font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
				disabled={isSaving}
			>
				{#if isSaving}
					<svg
						class="mr-2 -ml-1 h-4 w-4 animate-spin text-white"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						><circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
						></circle><path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path></svg
					>
					{$t('Saving...')}
				{:else}
					{$t('Save Data')}
				{/if}
			</button>
		</div>
	</form>
</div>

<style>
	:global(div.svelte-select) {
		min-height: 38px;
		max-width: 100% !important;
		width: 100% !important;
		z-index: 50 !important;
		border: 1px solid #d1d5db !important;
		border-radius: 0.375rem !important;
	}
	:global(div.svelte-select .input) {
		font-size: 0.875rem;
	}
	:global(div.svelte-select .selection) {
		text-overflow: ellipsis !important;
		overflow: hidden !important;
		white-space: nowrap !important;
		display: block !important;
		position: absolute;
		left: 10px;
		right: 30px;
	}
	:global(div.svelte-select .list) {
		border-radius: 0.375rem;
		border-color: #d1d5db;
		z-index: 9999 !important;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}
	:global(.selectContainer) {
		overflow: visible !important;
	}
</style>
