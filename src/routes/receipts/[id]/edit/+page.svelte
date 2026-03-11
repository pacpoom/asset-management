<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { t, locale } from '$lib/i18n';

	export let data: PageData;
	$: ({ receipt, receiptItems, attachments, customers, products, units } = data);

	$: customerOptions = (customers || []).map((c: any) => ({
		value: c.id,
		label: c.company_name ? `${c.company_name} (${c.name})` : c.name
	}));

	$: productOptions = (products || []).map((p: any) => ({
		value: p.id,
		label: `${p.sku} - ${p.name}`,
		product: p
	}));

	let selectedCustomer: any = null;
	let receiptDate = '';
	let referenceDoc = '';
	let items: any[] = [];
	let discountAmount = 0;
	let vatRate = 7;
	let notes = '';

	$: if (receipt) {
		selectedCustomer = customerOptions?.find((c: any) => c.value === receipt.customer_id) || null;
		receiptDate = receipt.receipt_date
			? new Date(receipt.receipt_date).toISOString().split('T')[0]
			: '';
		referenceDoc = receipt.reference_doc || '';
		discountAmount = Number(receipt.discount_amount) || 0;
		vatRate = Number(receipt.vat_rate) || 0;
		notes = receipt.notes || '';
	}

	$: if (receiptItems && items.length === 0) {
		items = receiptItems.map((item: any) => {
			const foundProduct = (products || []).find((p: any) => p.id === item.product_id);
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
				product_id: item.product_id,
				description: item.description || '',
				quantity: Number(item.quantity) || 1,
				unit_id: item.unit_id,
				unit_price: Number(item.unit_price) || 0,
				wht_rate: Number(item.wht_rate) || 0,
				line_total: Number(item.line_total) || 0
			};
		});
	}

	$: subtotal = items.reduce((sum: number, item: any) => sum + (Number(item.line_total) || 0), 0);
	$: totalAfterDiscount = Math.max(0, subtotal - discountAmount);
	$: vatAmount = (totalAfterDiscount * vatRate) / 100;
	$: totalWhtAmount = items.reduce(
		(sum: number, item: any) =>
			sum + ((Number(item.line_total) || 0) * (Number(item.wht_rate) || 0)) / 100,
		0
	);
	$: grandTotal = totalAfterDiscount + vatAmount - totalWhtAmount;
	$: itemsJson = JSON.stringify(items);

	$: formatCurrency = (val: number) => {
		return new Intl.NumberFormat($locale === 'th' ? 'th-TH' : 'en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(val || 0);
	};

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

	function removeItem(index: number) {
		items = items.filter((_, i) => i !== index);
	}

	function updateLineTotal(index: number) {
		items[index].line_total = (items[index].quantity || 0) * (items[index].unit_price || 0);
	}

	function onProductSelect(index: number, selected: any) {
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
		items = items;
	}

	let isSaving = false;
</script>

<svelte:head>
	<title>{$t('Edit Receipt: ')} {receipt?.receipt_number}</title>
</svelte:head>

<div
	class="mx-auto mb-10 max-w-7xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6"
>
	<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
		<h1 class="text-2xl font-bold text-gray-800">
			{$t('Edit Receipt: ')} <span class="text-blue-600">{receipt?.receipt_number}</span>
		</h1>
		<span
			class="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800"
		>
			{$t('Status: ')}
			{$t('Status_' + receipt?.status)}
		</span>
	</div>

	<form
		method="POST"
		action="?/update"
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
					>{$t('Receipt Date')} <span class="text-red-500">*</span></label
				>
				<input
					type="date"
					id="receipt_date"
					name="receipt_date"
					bind:value={receiptDate}
					required
					class="w-full rounded-md border-gray-300 shadow-sm"
				/>
			</div>
			<div>
				<label for="reference_doc" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Reference Document')}</label
				>
				<input
					type="text"
					id="reference_doc"
					name="reference_doc"
					bind:value={referenceDoc}
					class="w-full rounded-md border-gray-300 shadow-sm"
				/>
			</div>
			<div>
				<p class="mb-1 block text-sm font-medium text-gray-700">{$t('Existing Attachments')}</p>
				<div class="min-h-[42px] rounded-lg border border-gray-200 bg-gray-50 p-3">
					{#if attachments.length === 0}
						<p class="text-sm text-gray-500">{$t('No attachments')}</p>
					{:else}
						<ul class="space-y-2">
							{#each attachments as file}
								<li
									class="flex items-center justify-between rounded border bg-white p-2 text-sm shadow-sm"
								>
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
										class="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-700"
										>{$t('Delete')}</button
									>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
				<div class="mt-3">
					<label for="attachments" class="mb-1 block text-xs font-medium text-gray-600"
						>{$t('Upload additional files')}</label
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

		<div class="relative z-10 mb-6">
			<h3 class="mb-2 text-lg font-medium text-gray-800">{$t('Products/Items')}</h3>
			<div class="overflow-x-visible rounded-lg border">
				<table class="min-w-full table-fixed divide-y divide-gray-200 text-sm">
					<thead class="bg-gray-50">
						<tr>
							<th class="w-10 px-3 py-3 text-center text-gray-500">{$t('No.')}</th>
							<th class="w-[280px] max-w-[280px] px-3 py-3 text-left font-semibold text-gray-600"
								>{$t('Product')}</th
							>
							<th class="w-[220px] max-w-[220px] px-3 py-3 text-left font-semibold text-gray-600"
								>{$t('Description')}</th
							>
							<th class="w-20 px-2 py-3 text-right font-semibold text-gray-600">{$t('Quantity')}</th
							>
							<th class="w-20 px-2 py-3 text-center font-semibold text-gray-600">{$t('Unit')}</th>
							<th class="w-28 px-2 py-3 text-right font-semibold text-gray-600"
								>{$t('Unit Price')}</th
							>
							<th class="w-24 px-2 py-3 text-center font-semibold text-red-600">WHT</th>
							<th class="w-32 px-3 py-3 text-right font-semibold text-gray-600">{$t('Total')}</th>
							<th class="w-10 px-3 py-3"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each items as item, index (item.id)}
							<tr class="align-top hover:bg-gray-50">
								<td class="px-3 py-2 pt-3 text-center text-gray-500">{index + 1}</td>
								<td class="w-[280px] max-w-[280px] px-3 py-2">
									<div class="w-full overflow-hidden">
										<Select
											items={productOptions}
											value={item.product_object}
											on:change={(e: any) => onProductSelect(index, e.detail)}
											on:clear={() => onProductSelect(index, null)}
											placeholder={$t('-- Search/Select Product --')}
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
											on:click={() => removeItem(index)}
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
				class="mt-3 text-sm font-medium text-blue-600 hover:text-blue-800">{$t('Add Item')}</button
			>
		</div>

		<div class="mb-6 flex flex-col gap-6 border-t border-gray-200 pt-6 md:flex-row">
			<div class="w-full md:w-2/3">
				<label for="notes" class="mb-1 block text-sm font-medium text-gray-700">{$t('Notes')}</label
				>
				<textarea
					id="notes"
					name="notes"
					rows="4"
					bind:value={notes}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				></textarea>
			</div>

			<div class="w-full space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-5 md:w-1/3">
				<div class="flex justify-between text-sm">
					<span class="text-gray-600">{$t('Subtotal')}</span><span class="font-medium"
						>{formatCurrency(subtotal)}</span
					>
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
				href="/receipts/{receipt?.id}"
				class="rounded-md border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
				>{$t('Cancel')}</a
			>
			<button
				type="submit"
				class="flex items-center rounded-md bg-blue-600 px-8 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
				disabled={isSaving}
			>
				{isSaving ? $t('Saving...') : $t('Save Changes')}
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
		z-index: 9999 !important;
	}
	:global(.selectContainer) {
		overflow: visible !important;
	}
</style>
