<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { t, locale } from '$lib/i18n';

	export let data: PageData;
	$: ({ invoice, existingItems, existingAttachments, customers, products, units } = data);

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
		wht_rate: number;
	}

	let invoiceDate = '';
	let dueDate = '';
	let items: InvoiceItem[] = [];
	let discountAmount = 0;
	let vatRate = 7;
	let selectedCustomerId = data.invoice?.customer_id ? String(data.invoice.customer_id) : '';

	$: if (invoice) {
		invoiceDate = new Date(invoice.invoice_date).toISOString().split('T')[0];
		dueDate = invoice.due_date ? new Date(invoice.due_date).toISOString().split('T')[0] : '';
		discountAmount = parseFloat(invoice.discount_amount || '0');
		vatRate = parseFloat(invoice.vat_rate || '7');
	}

	$: if (existingItems && items.length === 0) {
		items = existingItems.map((item: any) => {
			const foundProduct = products.find((p: any) => p.id == item.product_id);
			const productObj = foundProduct
				? {
						value: foundProduct.id,
						label: `${foundProduct.sku} - ${foundProduct.name}`,
						product: foundProduct
					}
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

	$: whtAmount = items.reduce((sum, item) => {
		const itemWht = (item.line_total || 0) * (item.wht_rate / 100);
		return sum + itemWht;
	}, 0);

	$: grandTotal = totalAfterDiscount + vatAmount - whtAmount;
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
				product_object: null,
				product_id: null,
				description: '',
				quantity: 1,
				unit_id: null,
				unit_price: 0,
				line_total: 0,
				wht_rate: 0
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

	function setCreditTerm(days: number) {
		const date = new Date(invoiceDate);
		date.setDate(date.getDate() + days);
		dueDate = date.toISOString().split('T')[0];
	}

	let isSaving = false;
</script>

<svelte:head>
	<title>{$t('Edit Invoice: ')} {invoice?.invoice_number}</title>
</svelte:head>

<div class="mx-auto mb-10 max-w-7xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">
			{$t('Edit Invoice: ')}
			{invoice?.invoice_number}
		</h1>
		<span class="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700"
			>{$t('Status: ')} {$t('Status_' + invoice?.status)}</span
		>
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
					>{$t('Customer')} <span class="text-red-500">*</span></label
				>
				<select
					id="customer_id"
					name="customer_id"
					bind:value={selectedCustomerId}
					required
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				>
					<option value="">{$t('Select Customer')}</option>
					{#each customers as customer}
						<option value={String(customer.id)}>{customer.name}</option>
					{/each}
				</select>
			</div>
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="invoice_date" class="mb-1 block text-sm font-medium text-gray-700"
						>{$t('Document Date')} <span class="text-red-500">*</span></label
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
						>{$t('Due Date')}</label
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
							class="hover:text-blue-600 hover:underline">{$t('7 Days')}</button
						>
						<button
							type="button"
							on:click={() => setCreditTerm(30)}
							class="hover:text-blue-600 hover:underline">{$t('30 Days')}</button
						>
					</div>
				</div>
			</div>
			<div>
				<label for="reference_doc" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Reference Document')}</label
				>
				<input
					type="text"
					id="reference_doc"
					name="reference_doc"
					value={invoice?.reference_doc || ''}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				/>
			</div>
		</div>

		<div class="mb-6">
			<h3 class="mb-2 text-lg font-medium text-gray-800">{$t('Products/Items')}</h3>
			<div class="overflow-x-visible rounded-lg border">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="w-40 px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase"
								>{$t('Product')}</th
							>
							<th class="w-40 px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase"
								>{$t('Description')}</th
							>
							<th class="w-25 px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase"
								>{$t('Quantity')}</th
							>
							<th class="w-24 px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase"
								>{$t('Unit')}</th
							>
							<th class="w-28 px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase"
								>{$t('Unit Price')}</th
							>
							<th
								class="w-30 px-3 py-2 text-center text-xs font-medium text-gray-500 text-red-600 uppercase"
								>WHT</th
							>
							<th class="w-28 px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase"
								>{$t('Total')}</th
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
										placeholder={$t('-- Search/Select --')}
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

								<td class="px-3 py-2">
									<select
										bind:value={item.wht_rate}
										class="w-full rounded-md border-red-200 bg-red-50 py-1.5 text-center text-sm font-bold text-red-700 focus:border-red-500 focus:ring-red-500"
									>
										<option value={0}>0%</option>
										<option value={1}>1%</option>
										<option value={2}>2%</option>
										<option value={3}>3%</option>
										<option value={5}>5%</option>
									</select>
								</td>

								<td class="px-3 py-2 text-right">
									<div class="font-bold text-gray-900">
										{formatCurrency(item.line_total - (item.line_total * item.wht_rate) / 100)}
									</div>
									{#if item.wht_rate > 0}
										<div class="mt-0.5 text-[10px] font-normal text-red-500">
											(-{formatCurrency((item.line_total * item.wht_rate) / 100)})
										</div>
									{/if}
								</td>
								<td class="px-3 py-2 text-center">
									{#if items.length > 1}
										<button
											type="button"
											on:click={() => removeItem(index)}
											class="text-red-500 hover:text-red-700"
											title={$t('Delete')}
										>
											<span class="material-symbols-outlined text-[20px]">delete</span>
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
				{$t('Add Item')}
			</button>
		</div>

		<div class="mb-6 flex flex-col gap-6 md:flex-row">
			<div class="w-full space-y-4 md:w-2/3">
				<div>
					<label for="notes" class="mb-1 block text-sm font-medium text-gray-700"
						>{$t('Notes')}</label
					>
					<textarea
						id="notes"
						name="notes"
						rows="3"
						value={invoice?.notes || ''}
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					></textarea>
				</div>

				<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
					<h4 class="mb-2 text-sm font-medium text-gray-900">{$t('Existing Attachments')}</h4>
					{#if existingAttachments.length === 0}
						<p class="text-sm text-gray-500">{$t('No attachments')}</p>
					{:else}
						<ul class="space-y-2">
							{#each existingAttachments as file}
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
										class="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
										>{$t('Delete')}</button
									>
								</li>
							{/each}
						</ul>
					{/if}
					<div class="mt-4">
						<label for="attachments" class="mb-1 block text-sm font-medium text-gray-700"
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

			<div
				class="h-fit w-full space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-inner md:w-1/3"
			>
				<div class="flex justify-between text-sm">
					<span class="text-gray-600">{$t('Subtotal')}</span>
					<span class="font-medium">{formatCurrency(subtotal)}</span>
				</div>
				<div class="flex items-center justify-between text-sm">
					<span class="text-gray-600">{$t('Discount')}</span>
					<input
						type="number"
						name="discount_amount"
						bind:value={discountAmount}
						min="0"
						class="w-24 rounded-md border-gray-300 py-1 text-right text-sm shadow-sm"
					/>
				</div>
				<div class="flex justify-between border-t border-gray-200 pt-2 text-sm">
					<span class="text-gray-600">{$t('After Discount')}</span>
					<span class="font-medium">{formatCurrency(totalAfterDiscount)}</span>
				</div>
				<div class="mt-2 flex items-center justify-between text-sm">
					<span class="text-gray-600">
						VAT
						<select
							name="vat_rate"
							bind:value={vatRate}
							class="ml-2 h-7 cursor-pointer rounded-md border-gray-300 bg-white py-0 pr-7 pl-2 text-center text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
						>
							<option value={0}>0%</option>
							<option value={7}>7%</option>
						</select>
					</span>
					<span class="font-medium text-green-600">+{formatCurrency(vatAmount)}</span>
					<input type="hidden" name="vat_amount" value={vatAmount} />
				</div>

				<div
					class="flex items-center justify-between border-b border-gray-200 pb-2 text-sm text-red-600"
				>
					<span class="font-medium">{$t('Total WHT')}</span>
					<span class="font-bold">-{formatCurrency(whtAmount)}</span>

					<input type="hidden" name="wht_amount" value={whtAmount} />
					<input type="hidden" name="wht_rate" value={0} />
				</div>

				<div class="flex justify-between pt-2 text-lg font-black text-gray-900">
					<span>{$t('Grand Total')}</span>
					<span class="text-blue-700">{formatCurrency(grandTotal)}</span>
				</div>
			</div>
		</div>

		<input type="hidden" name="items_json" value={itemsJson} />
		<input type="hidden" name="subtotal" value={subtotal} />
		<input type="hidden" name="total_after_discount" value={totalAfterDiscount} />
		<input type="hidden" name="total_amount" value={grandTotal} />

		<div class="flex justify-end gap-3 border-t border-gray-200 pt-6">
			<a
				href="/invoices/{invoice?.id}"
				class="rounded-md border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
			>
				{$t('Cancel')}
			</a>
			<button
				type="submit"
				disabled={isSaving}
				class="flex items-center rounded-md bg-blue-600 px-8 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
			>
				{#if isSaving}
					{$t('Saving...')}
				{:else}
					{$t('Save Changes')}
				{/if}
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
	:global(.selectContainer) {
		overflow: visible !important;
	}
</style>
