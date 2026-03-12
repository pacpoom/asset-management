<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { t, locale } from '$lib/i18n';

	export let data: PageData;
	$: ({ document, existingItems, existingAttachments, customers, products, units, jobOrders } =
		data);

	$: productOptions = products.map((p: any) => ({
		value: p.id,
		label: p.name, // 🌟 แสดงแค่ชื่อสินค้า
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
		is_vat: boolean;
	}

	let documentDate = '';
	let dueDate = '';
	let creditTerm: number | null = 0;
	let selectedJobOrderId: string | number = '';
	let items: DocumentItem[] = [];
	let discountAmount = 0;
	let vatRate = 7;
	let selectedCustomerId = data.document?.customer_id ? String(data.document.customer_id) : '';

	$: formatCurrency = (val: number) => {
		return new Intl.NumberFormat($locale === 'th' ? 'th-TH' : 'en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(val || 0);
	};

	$: if (document) {
		documentDate = new Date(document.document_date).toISOString().split('T')[0];
		dueDate = document.due_date ? new Date(document.due_date).toISOString().split('T')[0] : '';
		creditTerm = document.credit_term !== null ? Number(document.credit_term) : 0;
		selectedJobOrderId = document.job_order_id || '';
		discountAmount = parseFloat(document.discount_amount || '0');
		vatRate = parseFloat(document.vat_rate || '7');
	}

	$: filteredJobOrders = selectedCustomerId
		? jobOrders.filter((jo: any) => jo.customer_id == selectedCustomerId)
		: [];

	$: if (existingItems && items.length === 0) {
		items = existingItems.map((item: any) => {
			const foundProduct = products.find((p: any) => p.id == item.product_id);
			const productObj = foundProduct
				? {
						value: foundProduct.id,
						label: foundProduct.name, // 🌟 แสดงแค่ชื่อสินค้า
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
				wht_rate: parseFloat(item.wht_rate || '0'),
				is_vat: item.is_vat !== undefined ? !!item.is_vat : true
			};
		});
	}

	$: subtotal = items.reduce((sum, item) => sum + (item.line_total || 0), 0);
	
	// 🌟 คำนวณยอดที่คิด VAT (เฉพาะรายการที่เลือก VAT 7%)
	$: subtotalVatable = items.reduce((sum, item) => sum + (item.is_vat ? (item.line_total || 0) : 0), 0);
	
	// 🌟 คำนวณสัดส่วนส่วนลดสำหรับยอดที่คิด VAT
	$: vatableRatio = subtotal > 0 ? (subtotalVatable / subtotal) : 0;
	$: vatableAfterDiscount = Math.max(0, subtotalVatable - (discountAmount * vatableRatio));
	
	$: totalAfterDiscount = Math.max(0, subtotal - discountAmount);
	$: vatAmount = (vatableAfterDiscount * vatRate) / 100;

	$: whtAmount = items.reduce((sum, item) => {
		const itemWht = (item.line_total || 0) * (item.wht_rate / 100);
		return sum + itemWht;
	}, 0);

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
				line_total: 0,
				wht_rate: 0,
				is_vat: true
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
			items[index].is_vat = true;
		} else {
			items[index].product_id = null;
			items[index].description = '';
			items[index].unit_price = 0;
			items[index].unit_id = null;
			items[index].wht_rate = 0;
			items[index].is_vat = true;
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
	<title>{$t('Edit')} {$t('DocType_' + document?.document_type)} {document?.document_number}</title>
</svelte:head>

<div class="mx-auto mb-10 max-w-7xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">
			{$t('Edit')}
			{$t('DocType_' + document?.document_type)}:
			<span class="text-blue-600">{document?.document_number}</span>
		</h1>
		<span class="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
			{$t('Status: ')}
			{$t('Status_' + document?.status) || document?.status}
		</span>
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
				<label for="document_type_display" class="mb-1 block text-sm font-medium text-gray-500"
					>{$t('Document Type (Cannot be changed)')}</label
				>
				<input
					type="text"
					id="document_type_display"
					value={$t('DocType_' + document?.document_type)}
					disabled
					class="w-full rounded-md border-gray-300 bg-gray-100 text-gray-500 shadow-sm"
				/>
			</div>

			<div>
				<label for="customer_id" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Customer')} <span class="text-red-500">*</span></label
				>
				<select
					id="customer_id"
					name="customer_id"
					bind:value={selectedCustomerId}
					on:change={() => {
						selectedJobOrderId = '';
					}}
					required
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				>
					<option value="">{$t('Select Customer')}</option>
					{#each customers as customer}
						<option value={String(customer.id)}>{customer.name}</option>
					{/each}
				</select>
			</div>

			<div class="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-3">
				<div>
					<label for="document_date" class="mb-1 block text-sm font-medium text-gray-700"
						>{$t('Document Date')} <span class="text-red-500">*</span></label
					>
					<input
						type="date"
						id="document_date"
						name="document_date"
						bind:value={documentDate}
						on:change={calculateDueDate}
						required
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="credit_term" class="mb-1 block text-sm font-medium text-gray-700"
						>{$t('Credit Term (Days)')}</label
					>
					<select
						id="credit_term"
						name="credit_term"
						bind:value={creditTerm}
						on:change={calculateDueDate}
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500"
					>
						<option value={0}>0 {$t('Days')} ({$t('Cash')})</option>
						<option value={30}>30 {$t('Days')}</option>
						<option value={45}>45 {$t('Days')}</option>
						<option value={60}>60 {$t('Days')}</option>
						<option value={90}>90 {$t('Days')}</option>
					</select>
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
				</div>
			</div>

			<div>
				<label for="job_order_id" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Reference Job Order')}</label
				>
				<select
					id="job_order_id"
					name="job_order_id"
					bind:value={selectedJobOrderId}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
					disabled={!selectedCustomerId || filteredJobOrders.length === 0}
				>
					<option value="">{$t('Select Job Order')}</option>
					{#each filteredJobOrders as job}
						<option value={job.id}>
							{job.job_number} | BL: {job.bl_number !== '-' && job.bl_number
								? job.bl_number
								: 'N/A'}
						</option>
					{/each}
				</select>
				{#if selectedCustomerId && filteredJobOrders.length === 0}
					<p class="mt-1 text-xs text-red-500">{$t('No Job Order found for this customer')}</p>
				{:else if !selectedCustomerId}
					<p class="mt-1 text-xs text-gray-500">
						{$t('Please select a customer first to view Job Orders')}
					</p>
				{/if}
			</div>

			<div>
				<label for="reference_doc" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Other Reference (PO/Ref)')}</label
				>
				<input
					type="text"
					id="reference_doc"
					name="reference_doc"
					value={document?.reference_doc || ''}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				/>
			</div>
		</div>

		<div class="mb-6">
			<h3 class="mb-2 text-lg font-medium text-gray-800">{$t('Products/Items')}</h3>
			<div class="overflow-x-auto rounded-lg border">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50 text-xs text-gray-500 uppercase">
						<tr>
							<th class="w-40 px-4 py-3 text-left font-medium">{$t('Product/Service')}</th>
							<th class="px-4 py-3 text-left font-bold">{$t('Description')}</th>
							<th class="w-24 px-3 py-3 text-right">{$t('Quantity')}</th>
							<th class="w-24 px-3 py-3 text-center">{$t('Unit')}</th>
							<th class="w-28 px-3 py-3 text-right">{$t('Unit Price')}</th>
							<th class="w-24 px-3 py-3 text-center text-blue-600">{$t('VAT')}</th>
							<th class="w-24 px-3 py-3 text-center text-red-600">{$t('WHT')}</th>
							<th class="w-32 px-3 py-3 text-right">{$t('Total')}</th>
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
										placeholder={$t('-- Search/Select --')}
										floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
										container={browser ? document.body : null}
										--inputStyles="padding: 2px 0; font-size: 0.875rem;"
										--list="border-radius: 6px; font-size: 0.875rem;"
										--itemIsActive="background: #e0f2fe;"
										--valueStyles="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
									/>
								</td>
								<td class="px-3 py-2">
									<input
										type="text"
										bind:value={item.description}
										class="w-full overflow-hidden rounded-md border-gray-300 text-sm text-ellipsis whitespace-nowrap"
										required
										title={item.description}
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
									<select
										bind:value={item.unit_id}
										class="w-full rounded-md border-gray-300 py-1.5 pl-2 text-sm focus:border-blue-500"
									>
										<option value={null}>-</option>
										{#each units as u}<option value={u.id}>{u.symbol}</option>{/each}
									</select>
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
										bind:value={item.is_vat}
										class="w-full rounded-md border-blue-200 bg-blue-50 py-1.5 text-center text-sm font-bold text-blue-700"
									>
										<option value={true}>VAT 7%</option>
										<option value={false}>Non-VAT</option>
									</select>
								</td>
								<td class="px-3 py-2">
									<select
										bind:value={item.wht_rate}
										class="w-full rounded-md border-red-200 bg-red-50 py-1.5 text-center text-sm font-bold text-red-700"
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
										{formatCurrency(item.line_total)}
									</div>
								</td>
								<td class="px-3 py-2 text-center">
									{#if items.length > 1}
										<button
											type="button"
											on:click={() => removeItem(index)}
											class="text-red-500 hover:text-red-700"
											title={$t('Delete')}>❌</button
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
				class="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800">{$t('Add Item')}</button
			>
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
						value={document?.notes || ''}
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
										class="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50"
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
							class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700"
						/>
					</div>
				</div>
			</div>

			<div
				class="h-fit w-full space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-inner md:w-1/3"
			>
				<div class="flex justify-between text-sm">
					<span class="text-gray-600">{$t('Subtotal')}</span><span class="font-medium"
						>{formatCurrency(subtotal)}</span
					>
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
					<span class="text-gray-600">{$t('After Discount')}</span><span class="font-medium"
						>{formatCurrency(totalAfterDiscount)}</span
					>
				</div>
				<div class="mt-2 flex items-center justify-between text-sm">
					<span class="text-gray-600">
						VAT
						<select
							name="vat_rate"
							bind:value={vatRate}
							class="ml-2 w-20 rounded-md border-gray-300 py-1 pr-8 pl-3 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
					<span class="font-medium">{$t('Total WHT')}</span><span class="font-bold"
						>-{formatCurrency(whtAmount)}</span
					>
					<input type="hidden" name="wht_amount" value={whtAmount} />
					<input type="hidden" name="wht_rate" value={0} />
				</div>
				<div class="flex justify-between pt-2 text-lg font-black text-gray-900">
					<span>{$t('Grand Total')}</span><span class="text-blue-700"
						>{formatCurrency(grandTotal)}</span
					>
				</div>
			</div>
		</div>

		<input type="hidden" name="items_json" value={itemsJson} />
		<input type="hidden" name="subtotal" value={subtotal} />
		<input type="hidden" name="total_after_discount" value={totalAfterDiscount} />
		<input type="hidden" name="total_amount" value={grandTotal} />

		<div class="flex justify-end gap-3 border-t border-gray-200 pt-6">
			<a
				href="/sales-documents/{document?.id}"
				class="rounded-md border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
				>{$t('Cancel')}</a
			>
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
</style>