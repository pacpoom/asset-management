<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { t, locale } from '$lib/i18n';

	export let data: PageData;
	$: ({ document, existingItems, existingAttachments, customers, customerContacts, units, jobOrders } = data);
	
	let localProducts = data.products || [];

	$: customerOptions = customers.map((c: any) => ({
		value: c.id,
		label: c.company_name || c.name,
		customer: c
	}));

	$: productOptions = localProducts.map((p: any) => ({
		value: p.id,
		label: p.name,
		product: p
	}));

	let documentDate = '';
	let dueDate = '';
	let creditTerm: number | null = 0;
	
	let selectedCustomerObj: any = null;
	let selectedCustomerId: string | number = '';
	
	let selectedContactObj: any = null;
	let selectedContactId: string | number = '';
	
	let selectedJobOrderObj: any = null;
	let selectedJobOrderId: string | number = '';
	
	let referenceDoc = '';
	let notes = '';

	let items: any[] = [];
	let discountAmount = 0;
	let vatRate = 7;

	$: currentLoc = $locale === 'th' ? 'th-TH' : 'en-US';
	$: formatNumber = (val: number) => {
		return new Intl.NumberFormat(currentLoc, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(val || 0);
	};

	$: filteredJobOrders = selectedCustomerId
		? jobOrders.filter((jo: any) => jo.customer_id == selectedCustomerId)
		: [];

	$: filteredContacts = selectedCustomerId
		? customerContacts.filter((c: any) => c.customer_id == selectedCustomerId)
		: [];

	$: contactOptions = filteredContacts.map((c: any) => ({
		value: c.id,
		label: `${c.name} ${c.position ? `(${c.position})` : ''}`
	}));

	$: jobOrderOptions = filteredJobOrders.map((job: any) => ({
		value: job.id,
		label: `${job.job_number} | BL: ${job.bl_number !== '-' && job.bl_number ? job.bl_number : 'N/A'}`
	}));

	$: if (selectedContactId && contactOptions.length > 0) {
		if (!selectedContactObj || selectedContactObj.value !== selectedContactId) {
			selectedContactObj = contactOptions.find((c: any) => c.value == selectedContactId) || null;
		}
	} else if (!selectedContactId) {
		selectedContactObj = null;
	}

	$: if (selectedJobOrderId && jobOrderOptions.length > 0) {
		if (!selectedJobOrderObj || selectedJobOrderObj.value !== selectedJobOrderId) {
			selectedJobOrderObj = jobOrderOptions.find((j: any) => j.value == selectedJobOrderId) || null;
		}
	} else if (!selectedJobOrderId) {
		selectedJobOrderObj = null;
	}

	onMount(() => {
		if (document) {
			documentDate = new Date(document.document_date).toISOString().split('T')[0];
			dueDate = document.due_date ? new Date(document.due_date).toISOString().split('T')[0] : '';
			creditTerm = document.credit_term !== null ? Number(document.credit_term) : 0;
			
			selectedCustomerId = document.customer_id ? String(document.customer_id) : '';
			selectedCustomerObj = customerOptions.find((c: any) => c.value == selectedCustomerId) || null;
			
			selectedContactId = document.customer_contact_id || '';
			
			setTimeout(() => {
				selectedJobOrderId = document.job_order_id || '';
			}, 50);

			referenceDoc = document.reference_doc || '';
			notes = document.notes || '';
			discountAmount = parseFloat(document.discount_amount || '0');
			vatRate = parseFloat(document.vat_rate || '7');

			if (existingItems && items.length === 0) {
				items = existingItems.map((item: any) => {
					const foundProduct = localProducts.find((p: any) => p.id == item.product_id);
					const productObj = foundProduct
						? { value: foundProduct.id, label: foundProduct.name, product: foundProduct }
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
						is_vat: item.is_vat !== undefined ? Number(item.is_vat) : 1
					};
				});
			}
		}
	});

	function onCustomerChange(selected: any) {
		selectedCustomerObj = selected;
		selectedCustomerId = selected ? selected.value : '';
		
		selectedJobOrderId = '';
		selectedJobOrderObj = null;
		
		selectedContactId = ''; 
		selectedContactObj = null;
	}

	function onContactChange(selected: any) {
		selectedContactObj = selected;
		selectedContactId = selected ? selected.value : '';
	}

	function onJobOrderChange(selected: any) {
		selectedJobOrderObj = selected;
		selectedJobOrderId = selected ? selected.value : '';
	}

	$: calculatedItems = items.map(item => {
		const rawLineTotal = (item.quantity || 0) * (item.unit_price || 0);
		let amount = rawLineTotal;
		
		let whtBase = rawLineTotal;
		if (Number(item.is_vat) === 1 && vatRate > 0) {
			whtBase = rawLineTotal * 100 / (100 + vatRate);
		}
		
		const whtAmt = whtBase * (item.wht_rate / 100);
		
		return {
			...item,
			line_total: rawLineTotal,
			amount: amount,
			wht_amount: whtAmt
		};
	});

	// --- VAT Calculation Logic (3 states) ---
	$: subtotalBeforeVat = calculatedItems.reduce((sum, item) => sum + item.amount, 0);
	$: totalAfterDiscount = Math.max(0, subtotalBeforeVat - discountAmount);
	
	$: excVatTotal = calculatedItems.filter(item => Number(item.is_vat) === 0).reduce((sum, item) => sum + item.amount, 0);
	$: incVatTotal = calculatedItems.filter(item => Number(item.is_vat) === 1).reduce((sum, item) => sum + item.amount, 0);

	$: discountForExcVat = subtotalBeforeVat > 0 ? discountAmount * (excVatTotal / subtotalBeforeVat) : 0;
	$: discountForIncVat = subtotalBeforeVat > 0 ? discountAmount * (incVatTotal / subtotalBeforeVat) : 0;
	
	$: vatFromExc = Math.max(0, ((excVatTotal - discountForExcVat) * vatRate) / 100);
	$: vatFromInc = Math.max(0, ((incVatTotal - discountForIncVat) * vatRate) / (100 + vatRate));
	
	$: vatAmount = vatFromExc + vatFromInc;
	$: whtAmount = calculatedItems.reduce((sum, item) => sum + item.wht_amount, 0);
	
	$: grandTotal = totalAfterDiscount + vatFromExc - whtAmount;
	
	$: itemsJson = JSON.stringify(calculatedItems);

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
				is_vat: 1
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
			items[index].is_vat = 1;
		} else {
			items[index].product_id = null;
			items[index].description = '';
			items[index].unit_price = 0;
			items[index].unit_id = null;
			items[index].wht_rate = 0;
			items[index].is_vat = 1;
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

<div class="mx-auto max-w-7xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6 mb-10">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">
			{$t('Edit')} {$t('DocType_' + document?.document_type)}:
			<span class="text-blue-600">{document?.document_number}</span>
		</h1>
		<span class="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
			{$t('Status: ')} {$t('Status_' + document?.status) || document?.status}
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
            <div class="relative z-[60]">
				<label for="document_type_display" class="mb-1 block text-sm font-medium text-gray-700"
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

			<div class="relative z-50">
				<label for="customer_id" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Company Name')} <span class="text-red-500">*</span></label
				>
				<Select
					id="customer_id"
					items={customerOptions}
					value={selectedCustomerObj}
					on:change={(e) => onCustomerChange(e.detail)}
					on:clear={() => onCustomerChange(null)}
					placeholder={$t('Type to search company...')}
					container={browser ? document.body : null}
				/>
				<input type="hidden" name="customer_id" value={selectedCustomerId} required />
			</div>

			<div class="relative z-40">
				<label for="customer_contact_id" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Contact Person')}</label
				>
				<Select
					items={contactOptions}
					value={selectedContactObj}
					on:change={(e) => onContactChange(e.detail)}
					on:clear={() => onContactChange(null)}
					placeholder={$t('-- Select Contact --')}
					container={browser ? document.body : null}
					disabled={!selectedCustomerId || filteredContacts.length === 0}
				/>
				<input type="hidden" name="customer_contact_id" value={selectedContactId} />
			</div>

			<div class="relative z-30 grid grid-cols-1 gap-4 md:grid-cols-3">
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
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500"
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
						<option value={0}>{$t('0 Days (Cash)')}</option>
						<option value={30}>{$t('30 Days')}</option>
						<option value={45}>{$t('45 Days')}</option>
						<option value={60}>{$t('60 Days')}</option>
						<option value={90}>{$t('90 Days')}</option>
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
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500"
					/>
				</div>
			</div>

			<div class="relative z-20">
				<label for="job_order_id" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Reference Job Order')}</label
				>
				<Select
					items={jobOrderOptions}
					value={selectedJobOrderObj}
					on:change={(e) => onJobOrderChange(e.detail)}
					on:clear={() => onJobOrderChange(null)}
					placeholder={$t('-- Select Job Order --')}
					container={browser ? document.body : null}
					disabled={!selectedCustomerId || filteredJobOrders.length === 0}
				/>
				<input type="hidden" name="job_order_id" value={selectedJobOrderId} />
			</div>

			<div class="relative z-10">
				<label for="reference_doc" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Other Reference (PO/Ref)')}</label
				>
				<input
					type="text"
					id="reference_doc"
					name="reference_doc"
					bind:value={referenceDoc}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500"
				/>
			</div>
		</div>

		<div class="mb-6">
			<h3 class="mb-2 text-lg font-medium text-gray-800">{$t('Products/Items')}</h3>
			<div class="relative z-0 overflow-x-visible rounded-lg border">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50 text-xs text-gray-500 uppercase">
						<tr>
							<th class="w-20 px-3 py-2 text-left font-medium">{$t('Product/Service')}</th>
							<th class="px-2 py-2 text-left font-bold">{$t('Description')}</th>
							<th class="w-25 px-3 py-2 text-right">{$t('Qty')}</th>
							<th class="w-25 px-3 py-2 text-center">{$t('Unit')}</th>
							<th class="w-35 px-3 py-2 text-right">{$t('Unit Price')}</th>
							<th class="w-25 px-2 py-2 text-center text-blue-600">VAT Status</th>
							<th class="w-28 px-3 py-2 text-right text-gray-700">{$t('Amount') || 'Amount'}</th>
							<th class="w-20 px-3 py-2 text-center text-red-600">{$t('WHT')}</th>
							<th class="w-28 px-3 py-2 text-right">{$t('Total')}</th>
							<th class="w-3 px-3 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each calculatedItems as item, index}
							<tr>
								<td class="w-20 px-3 py-2" style="min-width: 150px; max-width: 200px;">
									<Select
										items={productOptions}
										value={item.product_object}
										on:change={(e) => onProductChange(index, e.detail)}
										on:clear={() => onProductChange(index, null)}
										placeholder={$t('Search...')}
										floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
										container={browser ? document.body : null}
									/>
								</td>
								<td class="w-64 px-2 py-2">
									<textarea
										bind:value={items[index].description}
										rows="2"
										class="w-full rounded-md border-gray-300 text-sm min-h-[38px] resize-y"
										required
									></textarea>
								</td>
								<td class="w-5 px-2 py-2">
									<input
										type="number"
										bind:value={items[index].quantity}
										on:input={() => updateLineTotal(index)}
										min="1"
										class="w-full rounded-md border-gray-300 text-right text-sm px-2"
										required
									/>
								</td>
								<td class="w-5 px-2 py-2">
									<select
										bind:value={items[index].unit_id}
										class="w-full rounded-md border-gray-300 py-1.5 px-2 text-center text-sm"
									>
										<option value={null}>-</option>
										{#each units as u}<option value={u.id}>{u.symbol}</option>{/each}
									</select>
								</td>
								<td class="w-5 px-2 py-2">
									<input
										type="number"
										step="0.01"
										bind:value={items[index].unit_price}
										on:input={() => updateLineTotal(index)}
										class="w-full rounded-md border-gray-300 text-right text-sm px-2"
										required
									/>
								</td>
								<td class="px-1 py-2 text-center align-middle">
									<select
										bind:value={items[index].is_vat}
										class="w-full rounded-md border-gray-300 py-1.5 px-1 text-center text-xs font-medium focus:border-blue-500 focus:ring-blue-500 {items[index].is_vat === 1 ? 'text-blue-600 bg-blue-50' : items[index].is_vat === 0 ? 'text-orange-600 bg-orange-50' : 'text-gray-600 bg-gray-50'}"
									>
										<option value={1}>Inc. VAT</option>
										<option value={0}>Exc. VAT</option>
										<option value={2}>Non-VAT</option>
									</select>
								</td>
								<td class="px-2 py-2 text-right font-medium text-gray-700 bg-gray-50/50">
									{formatNumber(item.amount)}
								</td>
								<td class="px-2 py-2">
									<select
										bind:value={items[index].wht_rate}
										class="w-full rounded-md border-red-200 bg-red-50 py-1.5 px-1 text-center text-sm font-bold text-red-700"
									>
										<option value={0}>0%</option>
										<option value={1}>1%</option>
										<option value={2}>2%</option>
										<option value={3}>3%</option>
										<option value={5}>5%</option>
									</select>
								</td>
								<td class="px-2 py-2 text-right">
									<div class="font-bold text-gray-900">{formatNumber(item.line_total)}</div>
									{#if item.wht_amount > 0}
										<div class="mt-0.5 text-[10px] text-red-500">
											(-{formatNumber(item.wht_amount)})
										</div>
									{/if}
								</td>
								<td class="px-2 py-2 text-center">
									{#if items.length > 1}
										<button type="button" on:click={() => removeItem(index)} class="text-red-500 p-1 hover:bg-red-50 rounded">❌</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<button type="button" on:click={addItem} class="mt-3 text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
				{$t('Add Item')}
			</button>
		</div>

		<div class="mb-6 flex flex-col gap-6 md:flex-row">
			<div class="w-full space-y-4 md:w-2/3">
				<div>
					<label for="notes" class="mb-1 block text-sm font-medium">{$t('Notes')}</label>
					<textarea
						id="notes"
						name="notes"
						rows="3"
						bind:value={notes}
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500"
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
							class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2"
						/>
					</div>
				</div>
			</div>

			<div class="h-fit w-full space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-inner md:w-1/3">
				<div class="flex justify-between text-sm">
					<span class="text-gray-600">{$t('Subtotal')}</span>
					<span class="font-medium">{formatNumber(subtotalBeforeVat)}</span>
				</div>
				<div class="flex items-center justify-between text-sm">
					<span class="text-gray-600">{$t('Discount')}</span><input
						type="number"
						name="discount_amount"
						bind:value={discountAmount}
						min="0"
						class="w-24 rounded-md border-gray-300 py-1 text-right text-sm shadow-sm"
					/>
				</div>
				<div class="flex justify-between border-t border-gray-200 pt-2 text-sm">
					<span class="text-gray-600">{$t('After Discount')}</span><span class="font-medium"
						>{formatNumber(totalAfterDiscount)}</span
					>
				</div>
				<div class="mt-2 flex items-center justify-between text-sm">
					<span class="text-gray-600">
						{$t('Sales VAT')} 
						<select
							name="vat_rate"
							bind:value={vatRate}
							class="ml-2 w-20 rounded-md border-gray-300 py-1 pr-8 pl-3 text-sm shadow-sm focus:border-blue-500"
						>
							<option value={0}>0%</option>
							<option value={7}>7%</option>
						</select>
					</span>
					<span class="font-medium text-gray-800">{formatNumber(vatAmount)}</span>
					<input type="hidden" name="vat_amount" value={vatAmount} />
				</div>
				<div class="flex items-center justify-between border-b border-gray-200 pb-2 text-sm text-red-600">
					<span class="font-medium">{$t('Total WHT')}</span><span class="font-bold"
						>-{formatNumber(whtAmount)}</span
					>
					<input type="hidden" name="wht_amount" value={whtAmount} />
					<input type="hidden" name="wht_rate" value={0} />
				</div>
				<div class="flex justify-between pt-2 text-lg font-black text-gray-900">
					<span>{$t('Grand Total')}</span><span class="text-blue-700"
						>{formatNumber(grandTotal)}</span
					>
				</div>
			</div>
		</div>

		<input type="hidden" name="items_json" value={itemsJson} />
		<input type="hidden" name="subtotal" value={subtotalBeforeVat} />
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
				{isSaving ? $t('Saving...') : $t('Save Changes')}
			</button>
		</div>
	</form>
</div>