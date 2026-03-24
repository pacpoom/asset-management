<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { t, locale } from '$lib/i18n';

	export let data: PageData;
	$: ({ vendors, vendorContacts, units, jobOrders, prefillData } = data);
	let localProducts = data.products || [];

	$: vendorOptions = vendors.map((v: any) => ({
		value: v.id,
		label: v.name,
		vendor: v
	}));

	$: productOptions = localProducts.map((p: any) => ({
		value: p.id,
		label: p.name,
		product: p
	}));

	let documentType = 'PO';
	let documentDate = new Date().toISOString().split('T')[0];
	let creditTerm: number | null = 0;
	let dueDate = new Date().toISOString().split('T')[0];

	let selectedVendorObj: any = null;
	let selectedVendorId: string | number = '';
	
	let selectedContactObj: any = null;
	let selectedContactId: string | number = '';

	let selectedJobObj: any = null;
	let selectedJobId: string | number = '';

	let referenceDoc = '';
	let notes = '';
	let discountAmount = 0;
	let vatRate = 7;

	let items: any[] = [
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

	$: filteredContacts = selectedVendorId
		? vendorContacts?.filter((c: any) => c.vendor_id == selectedVendorId) || []
		: [];

	$: contactOptions = filteredContacts.map((c: any) => ({
		value: c.id,
		label: `${c.name} ${c.position ? `(${c.position})` : ''}`
	}));

	// 🌟 กรอง Job Order ให้แสดงเฉพาะของ Vendor ที่เลือก
	$: availableJobOrders = selectedVendorId 
		? (jobOrders || []).filter((j: any) => j.vendor_id == selectedVendorId)
		: [];
		
	$: jobOrderOptions = availableJobOrders.map((j: any) => ({
		value: j.id,
		label: `${j.job_number} | BL: ${j.bl_number !== '-' && j.bl_number ? j.bl_number : 'N/A'}`
	}));

	$: if (selectedContactId && contactOptions.length > 0) {
		if (!selectedContactObj || selectedContactObj.value !== selectedContactId) {
			selectedContactObj = contactOptions.find((c: any) => c.value == selectedContactId) || null;
		}
	} else if (!selectedContactId) {
		selectedContactObj = null;
	}

	onMount(() => {
		if (prefillData) {
			documentType = prefillData.targetType;
			referenceDoc = `${$locale === 'en' ? 'Ref:' : 'อ้างอิง:'} ${prefillData.document.document_number}`;

			selectedVendorId = prefillData.document.vendor_id;
			selectedVendorObj = vendorOptions.find((v: any) => v.value == selectedVendorId) || null;
			
			selectedContactId = prefillData.document.vendor_contact_id || '';

			setTimeout(() => {
				selectedJobId = prefillData.document.job_id || '';
				selectedJobObj = jobOrderOptions.find((j: any) => j.value == selectedJobId) || null;
			}, 50);

			creditTerm = prefillData.document.credit_term;
			discountAmount = parseFloat(prefillData.document.discount_amount || '0');
			vatRate = parseFloat(prefillData.document.vat_rate || '7');

			if (prefillData.items && prefillData.items.length > 0) {
				items = prefillData.items.map((item: any) => {
					const productObj = productOptions.find((p: any) => p.value == item.product_id) || null;
					return {
						product_object: productObj,
						product_id: item.product_id,
						description: item.description,
						quantity: parseFloat(item.quantity || 1),
						unit_id: item.unit_id,
						unit_price: parseFloat(item.unit_price || 0),
						line_total: parseFloat(item.line_total || 0),
						wht_rate: parseFloat(item.wht_rate || 0),
						is_vat: item.is_vat !== undefined ? !!item.is_vat : true
					};
				});
			}
			calculateDueDate();
		}
	});

	function calculateDueDate() {
		if (documentDate && creditTerm !== null && creditTerm !== undefined) {
			const d = new Date(documentDate);
			d.setDate(d.getDate() + Number(creditTerm));
			dueDate = d.toISOString().split('T')[0];
		}
	}

	function onVendorChange(selected: any) {
		selectedVendorObj = selected;
		selectedVendorId = selected ? selected.value : '';
		
		// 🌟 เคลียร์ค่า Contact และ Job Order เมื่อเปลี่ยน Vendor
		selectedContactId = ''; 
		selectedContactObj = null;

		selectedJobId = '';
		selectedJobObj = null;
	}

	$: subtotal = items.reduce((sum, item) => sum + (item.line_total || 0), 0);
	$: subtotalVatable = items.reduce((sum, item) => sum + (item.is_vat ? (item.line_total || 0) : 0), 0);
	$: vatableRatio = subtotal > 0 ? (subtotalVatable / subtotal) : 0;
	$: vatableAfterDiscount = Math.max(0, subtotalVatable - (discountAmount * vatableRatio));
	
	$: totalAfterDiscount = Math.max(0, subtotal - discountAmount);
	$: vatAmount = (vatableAfterDiscount * vatRate) / 100;
	
	$: whtAmount = items.reduce(
		(sum, item) => sum + (item.line_total || 0) * (item.wht_rate / 100),
		0
	);
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

	let isSaving = false;
	$: currentLoc = $locale === 'th' ? 'th-TH' : 'en-US';
	$: formatNumber = (amount: number) =>
		new Intl.NumberFormat(currentLoc, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
</script>

<svelte:head>
	<title>{$t('Create Purchase Document')}</title>
</svelte:head>

<div class="mx-auto max-w-7xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6">
	<h1 class="mb-6 text-2xl font-bold text-gray-800">
		{#if prefillData}
			{$t('Create')} {prefillData.targetType} {$t('from')} {prefillData.document.document_number}
		{:else}
			{$t('Create Purchase Document')}
		{/if}
	</h1>

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
			<div class="relative z-[60]">
				<label for="document_type" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Document Type')} <span class="text-red-500">*</span></label
				>
				<select
					name="document_type"
					bind:value={documentType}
					required
					class="w-full rounded-md border-gray-300 bg-blue-50 text-lg font-semibold text-blue-800 shadow-sm focus:border-blue-500"
				>
					<option value="PR">{$t('Purchase Request (PR)')}</option>
					<option value="PO">{$t('Purchase Order (PO)')}</option>
					<option value="GR">{$t('Goods Receipt (GR)')}</option>
					<option value="AP">{$t('Account Payable (AP)')}</option>
					<option value="PV">{$t('Payment Voucher (PV)')}</option>
				</select>
			</div>

			<div class="relative z-50">
				<label for="vendor_id" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Vendor Name')} <span class="text-red-500">*</span></label
				>
				<Select
					id="vendor_id"
					items={vendorOptions}
					value={selectedVendorObj}
					on:change={(e) => onVendorChange(e.detail)}
					on:clear={() => onVendorChange(null)}
					placeholder={$t('Type to search vendor...')}
					container={browser ? document.body : null}
					--inputStyles="padding: 2px 0; font-size: 0.875rem;"
					--list="border-radius: 6px; font-size: 0.875rem;"
					--itemIsActive="background: #e0f2fe;"
				/>
				<input type="hidden" name="vendor_id" value={selectedVendorId} required />
			</div>

			<!-- Contact Person -->
			<div class="relative z-40">
				<label for="vendor_contact_id" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Contact Person')}</label
				>
				<Select
					items={contactOptions}
					value={selectedContactObj}
					on:change={(e) => {
						selectedContactObj = e.detail;
						selectedContactId = e.detail ? e.detail.value : '';
					}}
					on:clear={() => {
						selectedContactObj = null;
						selectedContactId = '';
					}}
					placeholder={$t('-- Select Contact --')}
					container={browser ? document.body : null}
					disabled={!selectedVendorId || filteredContacts.length === 0}
					--inputStyles="padding: 2px 0; font-size: 0.875rem;"
					--list="border-radius: 6px; font-size: 0.875rem;"
					--itemIsActive="background: #e0f2fe;"
				/>
				<input type="hidden" name="vendor_contact_id" value={selectedContactId} />
				{#if selectedVendorId && filteredContacts.length === 0}
					<p class="mt-1 text-xs text-red-500">{$t('No Contact Person found for this vendor')}</p>
				{/if}
			</div>

			<!-- Job Order -->
			<div class="relative z-30">
				<label for="job_id" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Reference Job Order')}</label
				>
				<Select
					items={jobOrderOptions}
					value={selectedJobObj}
					on:change={(e) => {
						selectedJobObj = e.detail;
						selectedJobId = e.detail ? e.detail.value : '';
					}}
					on:clear={() => {
						selectedJobObj = null;
						selectedJobId = '';
					}}
					placeholder={$t('-- Select Job Order --')}
					container={browser ? document.body : null}
					--inputStyles="padding: 2px 0; font-size: 0.875rem;"
					--list="border-radius: 6px; font-size: 0.875rem;"
					--itemIsActive="background: #e0f2fe;"
				/>
				<input type="hidden" name="job_id" value={selectedJobId} />
			</div>

			<div class="relative z-20 grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-3">
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

			<div class="relative z-10 md:col-span-2">
				<label for="reference_doc" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Other Reference (PO/Ref)')}</label
				>
				<input
					type="text"
					id="reference_doc"
					name="reference_doc"
					bind:value={referenceDoc}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500"
					placeholder={$t('e.g. PR-2023...')}
				/>
			</div>

			<div class="md:col-span-2">
				<label for="attachments" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Attachments')}</label
				>
				<input
					type="file"
					id="attachments"
					name="attachments"
					multiple
					class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-4 file:py-2"
				/>
			</div>
		</div>

		<div class="mb-6">
			<h3 class="mb-2 text-lg font-medium text-gray-800">{$t('Products/Items')}</h3>
			<div class="relative z-0 overflow-x-visible rounded-lg border">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50 text-xs text-gray-500 uppercase">
						<tr>
							<th class="w-32 px-4 py-2 text-left font-medium">{$t('Product/Service')}</th>
							<th class="px-2 py-2 text-left font-bold">{$t('Description')}</th>
							<th class="w-28 px-3 py-2 text-right">{$t('Quantity')}</th>
							<th class="w-32 px-3 py-2 text-center">{$t('Unit')}</th>
							<th class="w-32 px-3 py-2 text-right">{$t('Unit Price')}</th>
							<th class="w-32 px-3 py-2 text-center text-blue-600">{$t('VAT')}</th>
							<th class="w-28 px-3 py-2 text-center text-red-600">{$t('WHT')}</th>
							<th class="w-32 px-3 py-2 text-right">{$t('Total')}</th>
							<th class="w-10 px-3 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each items as item, index}
							<tr>
								<td class="w-20 px-4 py-2" style="min-width: 200px; max-width: 250px;">
									<Select
										items={productOptions}
										value={item.product_object}
										on:change={(e) => onProductChange(index, e.detail)}
										on:clear={() => onProductChange(index, null)}
										placeholder={$t('Search...')}
										floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
										container={browser ? document.body : null}
										--inputStyles="padding: 2px 0; font-size: 0.875rem;"
										--list="border-radius: 6px; font-size: 0.875rem;"
										--itemIsActive="background: #e0f2fe;"
										--valueStyles="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
									/>
								</td>
								<td class="w-80 px-2 py-2">
									<textarea
										bind:value={item.description}
										title={item.description}
										rows="2"
										class="w-full rounded-md border-gray-300 text-sm min-h-[38px] resize-y"
										required
									></textarea>
								</td>
								<td class="w-5 px-2 py-2">
									<input
										type="number"
										bind:value={item.quantity}
										on:input={() => updateLineTotal(index)}
										min="1"
										class="w-full rounded-md border-gray-300 text-right text-sm"
										required
									/>
								</td>
								<td class="w-5 px-2 py-2">
									<select
										bind:value={item.unit_id}
										class="w-full rounded-md border-gray-300 py-1.5 text-center text-sm"
									>
										<option value={null}>-</option>
										{#each units as u}<option value={u.id}>{u.symbol}</option>{/each}
									</select>
								</td>
								<td class="w-5 px-2 py-2">
									<input
										type="number"
										step="0.01"
										bind:value={item.unit_price}
										on:input={() => updateLineTotal(index)}
										class="w-full rounded-md border-gray-300 text-right text-sm"
										required
									/>
								</td>
								<td class="w-15 px-1 py-1">
									<select
										bind:value={item.is_vat}
										class="w-full rounded-md border-blue-200 bg-blue-50 py-1.5 text-center text-sm font-bold text-blue-700"
									>
										<option value={true}>VAT 7%</option>
										<option value={false}>-</option>
									</select>
								</td>
								<td class="px-2 py-2">
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
								<td class="px-2 py-2 text-right font-bold text-gray-900">
									{formatNumber(item.line_total)}
								</td>
								<td class="px-2 py-2 text-center">
									{#if items.length > 1}
										<button type="button" on:click={() => removeItem(index)} class="text-red-500">❌</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<button type="button" on:click={addItem} class="mt-2 text-sm font-medium text-blue-600"
				>{$t('Add Item')}</button
			>
		</div>

		<div class="mb-6 flex justify-end">
			<div
				class="w-full space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-inner md:w-1/3"
			>
				<div class="flex justify-between text-sm">
					<span class="text-gray-600">{$t('Subtotal')}</span><span class="font-medium"
						>{formatNumber(subtotal)}</span
					>
				</div>
				<div class="flex items-center justify-between text-sm">
					<span class="text-gray-600">{$t('Discount')}</span><input
						type="number"
						name="discount_amount"
						bind:value={discountAmount}
						min="0"
						class="w-24 rounded-md border-gray-300 py-1 text-right text-sm"
					/>
				</div>
				<div class="flex justify-between border-t pt-2 text-sm">
					<span class="text-gray-600">{$t('After Discount')}</span><span class="font-medium"
						>{formatNumber(totalAfterDiscount)}</span
					>
				</div>
				<div class="mt-2 flex items-center justify-between text-sm">
					<span class="text-gray-600">
						{$t('VAT')} <span class="ml-1 text-xs text-gray-500">(Auto 7%)</span>
					</span>
					<span class="font-medium text-green-600">+{formatNumber(vatAmount)}</span>
					<input type="hidden" name="vat_rate" value={vatRate} />
					<input type="hidden" name="vat_amount" value={vatAmount} />
				</div>
				<div class="flex justify-between border-b pb-2 text-sm text-red-600">
					<span class="font-medium">{$t('Total WHT')}</span><span class="font-bold"
						>-{formatNumber(whtAmount)}</span
					>
				</div>
				<div class="flex justify-between pt-2 text-lg font-black text-gray-900">
					<span>{$t('Grand Total')}</span><span class="text-blue-700"
						>{formatNumber(grandTotal)}</span
					>
				</div>
			</div>
		</div>

		<input type="hidden" name="items_json" value={itemsJson} />
		<input type="hidden" name="subtotal" value={subtotal} />
		<input type="hidden" name="total_after_discount" value={totalAfterDiscount} />
		<input type="hidden" name="vat_amount" value={vatAmount} />
		<input type="hidden" name="wht_amount" value={whtAmount} />
		<input type="hidden" name="total_amount" value={grandTotal} />

		<div class="mb-6">
			<label for="notes" class="mb-1 block text-sm font-medium">{$t('Notes')}</label>
			<textarea
				id="notes"
				name="notes"
				rows="2"
				bind:value={notes}
				class="w-full rounded-md border-gray-300"
			></textarea>
		</div>

		<div class="flex justify-end gap-3">
			<a
				href="/purchase-documents"
				class="rounded-md border bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
				>{$t('Cancel')}</a
			>
			<button
				type="submit"
				disabled={isSaving}
				class="rounded-md bg-blue-600 px-6 py-2 text-sm text-white hover:bg-blue-700"
			>
				{isSaving ? $t('Saving...') : $t('Save Document')}
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