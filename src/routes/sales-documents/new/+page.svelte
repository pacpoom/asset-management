<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { t, locale } from '$lib/i18n';

	export let data: PageData;
	$: ({ customers, customerContacts, units, jobOrders, prefillData } = data);
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

	let documentType = 'INV';
	let documentDate = new Date().toISOString().split('T')[0];
	let creditTerm: number | null = 0;
	let dueDate = new Date().toISOString().split('T')[0];

	let selectedCustomerObj: any = null;
	let selectedCustomerId: string | number = '';
	
	let selectedContactObj: any = null;
	let selectedContactId: string | number = '';
	
	let selectedJobOrderObj: any = null;
	let selectedJobOrderId: string | number = '';

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

	$: filteredJobOrders = selectedCustomerId
		? jobOrders.filter((jo: any) => jo.customer_id == selectedCustomerId)
		: [];

	$: filteredContacts = selectedCustomerId
		? customerContacts.filter((c: any) => c.customer_id == selectedCustomerId)
		: [];

	// แปลงตัวเลือก Contact ให้เป็นรูปแบบของ svelte-select
	$: contactOptions = filteredContacts.map((c: any) => ({
		value: c.id,
		label: `${c.name} ${c.position ? `(${c.position})` : ''}`
	}));

	// แปลงตัวเลือก Job Order ให้เป็นรูปแบบของ svelte-select
	$: jobOrderOptions = filteredJobOrders.map((job: any) => ({
		value: job.id,
		label: `${job.job_number} | BL: ${job.bl_number !== '-' && job.bl_number ? job.bl_number : 'N/A'}`
	}));

	// Auto-select Object เมื่อมีการกำหนด ID ผ่าน Prefill
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
		if (prefillData) {
			documentType = prefillData.targetType;
			if (prefillData.document.document_number) {
				referenceDoc = `${$locale === 'en' ? 'Ref:' : 'อ้างอิง:'} ${prefillData.document.document_number}`;
			}

			selectedCustomerId = prefillData.document.customer_id || '';
			selectedCustomerObj = customerOptions.find((c: any) => c.value == selectedCustomerId) || null;
			
			selectedContactId = prefillData.document.customer_contact_id || '';

			setTimeout(() => {
				selectedJobOrderId = prefillData.document.job_order_id || '';
				// ให้มันเลือก Dropdown ของ Job Order ให้เราเมื่อโหลดเสร็จ
				if (selectedJobOrderId && jobOrderOptions.length > 0) {
					selectedJobOrderObj = jobOrderOptions.find((j: any) => j.value == selectedJobOrderId) || null;
				}
			}, 150);

			creditTerm = prefillData.document.credit_term || 0;
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

	let showAddProductModal = false;
	let isSavingProduct = false;
	let toastMessage = '';
	let newProduct = {
		sku: '', name: '', description: '', product_type: 'Stock', category_id: null as any,
		unit_id: null as any, purchase_unit_id: null as any, sales_unit_id: null as any,
		purchase_cost: 0, selling_price: 0, quantity_on_hand: 0, reorder_level: 0,
		preferred_vendor_id: null as any, preferred_customer_id: null as any,
		asset_account_id: null as any, income_account_id: null as any, expense_account_id: null as any,
		is_active: true, default_wht_rate: 3
	};

	let vendorSearchText = '';
	let isVendorDropdownOpen = false;
	let customerSearchText = '';
	let isCustomerDropdownOpen = false;
	$: filteredVendors = data.vendors
		? data.vendors.filter((v: any) => v.name.toLowerCase().includes(vendorSearchText.toLowerCase()))
		: [];
	$: filteredCustomers = data.customers
		? data.customers.filter((c: any) =>
				c.name.toLowerCase().includes(customerSearchText.toLowerCase())
			)
		: [];
	let imagePreviewUrl: string | null = null;

	function onFileSelected(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			const file = input.files[0];
			imagePreviewUrl = URL.createObjectURL(file);
		} else {
			imagePreviewUrl = null;
		}
	}
	function showToast(msg: string) {
		toastMessage = msg;
		setTimeout(() => (toastMessage = ''), 3000);
	}
	function closeProductModal() {
		showAddProductModal = false;
		imagePreviewUrl = null;
		vendorSearchText = '';
		customerSearchText = '';
		isVendorDropdownOpen = false;
		isCustomerDropdownOpen = false;
		newProduct = {
			sku: '', name: '', description: '', product_type: 'Service', category_id: null,
			unit_id: null, purchase_unit_id: null, sales_unit_id: null, preferred_vendor_id: null,
			preferred_customer_id: null, purchase_cost: 0, selling_price: 0, quantity_on_hand: 0,
			reorder_level: 0, asset_account_id: null, income_account_id: null, expense_account_id: null,
			is_active: true, default_wht_rate: 3
		};
	}

	$: currentLoc = $locale === 'th' ? 'th-TH' : 'en-US';
	$: formatNumber = (amount: number) =>
		new Intl.NumberFormat(currentLoc, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
</script>

<svelte:head>
	<title>{$t('Create Document Title')}</title>
</svelte:head>

<div class="mx-auto max-w-7xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6">
	<h1 class="mb-6 text-2xl font-bold text-gray-800">
		{#if prefillData && prefillData.document.document_number}
			{$t('Create')} {prefillData.targetType} {$t('from')} {prefillData.document.document_number}
		{:else}
			{$t('Create Document Title')}
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
					<option value="QT">{$t('Quotation (QT)')}</option>
					<option value="BN">{$t('Billing Note (BN)')}</option>
					<option value="INV">{$t('Invoice (INV)')}</option>
					<option value="RE">{$t('Receipt (RE)')}</option>
				</select>
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
					--inputStyles="padding: 2px 0; font-size: 0.875rem;"
					--list="border-radius: 6px; font-size: 0.875rem;"
					--itemIsActive="background: #e0f2fe;"
				/>
				<input type="hidden" name="customer_id" value={selectedCustomerId} required />
			</div>

			<!-- เลือก Contact Person ด้วย Select ค้นหาได้ -->
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
					--inputStyles="padding: 2px 0; font-size: 0.875rem;"
					--list="border-radius: 6px; font-size: 0.875rem;"
					--itemIsActive="background: #e0f2fe;"
				/>
				<input type="hidden" name="customer_contact_id" value={selectedContactId} />
				{#if selectedCustomerId && filteredContacts.length === 0}
					<p class="mt-1 text-xs text-red-500">{$t('No Contact Person found for this customer')}</p>
				{/if}
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

			<!-- เลือก Job Order ด้วย Select ค้นหาได้ -->
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
					--inputStyles="padding: 2px 0; font-size: 0.875rem;"
					--list="border-radius: 6px; font-size: 0.875rem;"
					--itemIsActive="background: #e0f2fe;"
				/>
				<input type="hidden" name="job_order_id" value={selectedJobOrderId} />
				{#if selectedCustomerId && filteredJobOrders.length === 0}
					<p class="mt-1 text-xs text-red-500">{$t('No Job Order found for this customer')}</p>
				{/if}
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
					placeholder={$t('e.g. PO-2023...')}
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
							<th class="w-32 px-4 py-2 text-left font-medium">
								<div class="flex items-center gap-2">
									{$t('Product/Service')}
									<button
										type="button"
										on:click={() => (showAddProductModal = true)}
										class="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200"
										title={$t('Add New Product/Service')}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											viewBox="0 0 20 20"
											fill="currentColor"
											><path
												fill-rule="evenodd"
												d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
												clip-rule="evenodd"
											/></svg
										>
									</button>
								</div>
							</th>
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
										<button type="button" on:click={() => removeItem(index)} class="text-red-500"
											>❌</button
										>
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
						{$t('Sales VAT')} <span class="ml-1 text-xs text-gray-500">(Auto 7%)</span>
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
				href="/sales-documents"
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

{#if toastMessage}
	<div
		class="animate-in fade-in slide-in-from-top-4 fixed top-6 right-6 z-[70] flex items-center gap-3 rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white shadow-xl"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
			><path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
			/></svg
		>
		{toastMessage}
	</div>
{/if}

{#if showAddProductModal}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4 transition-opacity"
	>
		<div class="fixed inset-0" on:click={closeProductModal} role="presentation"></div>
		<div
			class="relative flex max-h-[85vh] w-full max-w-7xl transform flex-col rounded-xl bg-white shadow-2xl transition-all"
		>
			<div
				class="flex flex-shrink-0 items-center justify-between rounded-t-xl border-b bg-gray-50 px-6 py-4"
			>
				<h2 class="text-lg font-bold text-gray-900">{$t('Add New Product/Service')}</h2>
				<button
					type="button"
					on:click={closeProductModal}
					class="text-xl font-bold text-gray-400 hover:text-gray-600">&times;</button
				>
			</div>

			<form
				method="POST"
				action="?/createProduct"
				enctype="multipart/form-data"
				use:enhance={() => {
					isSavingProduct = true;
					return async ({ result, update }) => {
						isSavingProduct = false;
						if (result.type === 'success' && result.data?.product) {
							localProducts = [...localProducts, result.data.product];
							closeProductModal();
							showToast('เพิ่มสินค้าลงระบบเรียบร้อยแล้ว');
						} else if (result.type === 'failure') {
							alert(result.data?.message || 'เกิดข้อผิดพลาด');
						}
						await update({ reset: false });
					};
				}}
				class="flex-1 overflow-y-auto"
			>
				<div class="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
					<div class="space-y-4 lg:col-span-2">
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="sku" class="mb-1 block text-sm font-medium text-gray-700">SKU</label>
								<input
									type="text"
									id="sku"
									value="({$t('Auto-generated by system')})"
									class="w-full rounded-md border-gray-300 bg-gray-100 text-sm text-gray-500"
									readonly
								/>
								<p class="mt-1 text-xs text-gray-500">{$t('Auto-generated by system')}</p>
							</div>
							<div>
								<label for="name" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Product Name')} *</label
								>
								<input
									type="text"
									name="name"
									id="name"
									required
									bind:value={newProduct.name}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
								/>
							</div>
						</div>

						<div>
							<label for="description" class="mb-1 block text-sm font-medium text-gray-700"
								>{$t('Description')}</label
							>
							<textarea
								name="description"
								id="description"
								rows="3"
								bind:value={newProduct.description}
								class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
							></textarea>
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="product_type" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Product Type')} *</label
								>
								<select
									name="product_type"
									id="product_type"
									required
									bind:value={newProduct.product_type}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
								>
									<option value="Stock">Stock</option>
									<option value="NonStock">Non-Stock</option>
									<option value="Service">Service</option>
								</select>
							</div>
							<div>
								<label for="category_id" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Category')}</label
								>
								<select
									name="category_id"
									id="category_id"
									bind:value={newProduct.category_id}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
								>
									<option value={null}>-- None --</option>
									{#each data.categories || [] as category}
										<option value={category.id}>{category.name}</option>
									{/each}
								</select>
							</div>
						</div>

						<fieldset class="rounded-md border border-gray-200 p-4">
							<legend class="px-1 text-sm font-medium text-gray-700">{$t('Units')}</legend>
							<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
								<div>
									<label for="unit_id" class="mb-1 block text-xs font-medium text-gray-700"
										>{$t('Base Unit')} *</label
									>
									<select
										name="unit_id"
										id="unit_id"
										required
										bind:value={newProduct.unit_id}
										class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
									>
										<option value={null} disabled>- {$t('Select Unit')} -</option>
										{#each data.units as unit}
											<option value={unit.id}>{unit.name} ({unit.symbol})</option>
										{/each}
									</select>
								</div>
								<div>
									<label for="purchase_unit_id" class="mb-1 block text-xs font-medium text-gray-700"
										>{$t('Purchase Unit')}</label
									>
									<select
										name="purchase_unit_id"
										id="purchase_unit_id"
										bind:value={newProduct.purchase_unit_id}
										class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
									>
										<option value={null}>-- Same as Base --</option>
										{#each data.units as unit}
											<option value={unit.id}>{unit.name} ({unit.symbol})</option>
										{/each}
									</select>
								</div>
								<div>
									<label for="sales_unit_id" class="mb-1 block text-xs font-medium text-gray-700"
										>{$t('Sales Unit')}</label
									>
									<select
										name="sales_unit_id"
										id="sales_unit_id"
										bind:value={newProduct.sales_unit_id}
										class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
									>
										<option value={null}>-- Same as Base --</option>
										{#each data.units as unit}
											<option value={unit.id}>{unit.name} ({unit.symbol})</option>
										{/each}
									</select>
								</div>
							</div>
						</fieldset>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<div>
								<label for="purchase_cost" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Purchase Cost')}</label
								>
								<input
									type="number"
									step="any"
									name="purchase_cost"
									id="purchase_cost"
									bind:value={newProduct.purchase_cost}
									placeholder="0.00"
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
								/>
							</div>
							<div>
								<label for="selling_price" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Selling Price')}</label
								>
								<input
									type="number"
									step="any"
									name="selling_price"
									id="selling_price"
									bind:value={newProduct.selling_price}
									placeholder="0.00"
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
								/>
							</div>
							<div>
								<label for="default_wht_rate" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('WHT Rate (%)')}</label
								>
								<select
									id="default_wht_rate"
									name="default_wht_rate"
									bind:value={newProduct.default_wht_rate}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
								>
									<option value="0">0%</option>
									<option value="1">1%</option>
									<option value="2">2%</option>
									<option value="3">3%</option>
									<option value="5">5%</option>
								</select>
							</div>
						</div>

						{#if newProduct.product_type === 'Stock'}
							<div class="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
								<div>
									<label for="quantity_on_hand" class="mb-1 block text-sm font-medium text-gray-700"
										>{$t('Quantity on Hand')}</label
									>
									<input
										type="number"
										step="any"
										name="quantity_on_hand"
										id="quantity_on_hand"
										bind:value={newProduct.quantity_on_hand}
										class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
									/>
								</div>
								<div>
									<label for="reorder_level" class="mb-1 block text-sm font-medium text-gray-700"
										>{$t('Reorder Level')}</label
									>
									<input
										type="number"
										step="any"
										name="reorder_level"
										id="reorder_level"
										bind:value={newProduct.reorder_level}
										placeholder="Optional"
										class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
									/>
								</div>
							</div>
						{/if}

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div class="relative">
								<label
									for="preferred_vendor_id"
									class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Preferred Vendor')}</label
								>
								<input
									type="hidden"
									name="preferred_vendor_id"
									value={newProduct.preferred_vendor_id || ''}
								/>
								<input
									type="text"
									placeholder="-- ค้นหา Vendor --"
									bind:value={vendorSearchText}
									on:focus={() => (isVendorDropdownOpen = true)}
									on:blur={() => setTimeout(() => (isVendorDropdownOpen = false), 200)}
									on:input={() => {
										newProduct.preferred_vendor_id = null as any;
										isVendorDropdownOpen = true;
									}}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
								/>
								{#if isVendorDropdownOpen}
									<ul
										class="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg focus:outline-none"
									>
										<li>
											<button
												type="button"
												class="w-full cursor-pointer px-3 py-2 text-left hover:bg-blue-600 hover:text-white"
												on:click={() => {
													newProduct.preferred_vendor_id = null as any;
													vendorSearchText = '';
													isVendorDropdownOpen = false;
												}}>-- None --</button
											>
										</li>
										{#each filteredVendors as vendor (vendor.id)}
											<li>
												<button
													type="button"
													class="w-full cursor-pointer px-3 py-2 text-left hover:bg-blue-600 hover:text-white"
													on:click={() => {
														newProduct.preferred_vendor_id = vendor.id;
														vendorSearchText = vendor.name;
														isVendorDropdownOpen = false;
													}}>{vendor.name}</button
												>
											</li>
										{/each}
									</ul>
								{/if}
							</div>

							<div class="relative">
								<label
									for="preferred_customer_id"
									class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Preferred Customer')}</label
								>
								<input
									type="hidden"
									name="preferred_customer_id"
									value={newProduct.preferred_customer_id || ''}
								/>
								<input
									type="text"
									placeholder="-- ค้นหา Customer --"
									bind:value={customerSearchText}
									on:focus={() => (isCustomerDropdownOpen = true)}
									on:blur={() => setTimeout(() => (isCustomerDropdownOpen = false), 200)}
									on:input={() => {
										newProduct.preferred_customer_id = null as any;
										isCustomerDropdownOpen = true;
									}}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
								/>
								{#if isCustomerDropdownOpen}
									<ul
										class="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg focus:outline-none"
									>
										<li>
											<button
												type="button"
												class="w-full cursor-pointer px-3 py-2 text-left hover:bg-blue-600 hover:text-white"
												on:click={() => {
													newProduct.preferred_customer_id = null as any;
													customerSearchText = '';
													isCustomerDropdownOpen = false;
												}}>-- None --</button
											>
										</li>
										{#each filteredCustomers as customer (customer.id)}
											<li>
												<button
													type="button"
													class="w-full cursor-pointer px-3 py-2 text-left hover:bg-blue-600 hover:text-white"
													on:click={() => {
														newProduct.preferred_customer_id = customer.id;
														customerSearchText = customer.name;
														isCustomerDropdownOpen = false;
													}}>{customer.name}</button
												>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</div>

						<fieldset class="rounded-md border border-gray-200 p-4">
							<legend class="px-1 text-sm font-medium text-gray-700"
								>{$t('Accounting Links')}</legend
							>
							<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
								<div>
									<label for="asset_account_id" class="mb-1 block text-xs font-medium text-gray-700"
										>{$t('Asset Account')} <span class="text-gray-500">(Stock)</span></label
									>
									<select
										name="asset_account_id"
										id="asset_account_id"
										bind:value={newProduct.asset_account_id}
										class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
									>
										<option value={null}>-- None --</option>
										{#each data.accounts || [] as acc}
											<option value={acc.id}>{acc.account_code} - {acc.account_name}</option>
										{/each}
									</select>
								</div>
								<div>
									<label
										for="income_account_id"
										class="mb-1 block text-xs font-medium text-gray-700"
										>{$t('Income Account')} <span class="text-gray-500">(Sales)</span></label
									>
									<select
										name="income_account_id"
										id="income_account_id"
										bind:value={newProduct.income_account_id}
										class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
									>
										<option value={null}>-- None --</option>
										{#each data.accounts || [] as acc}
											<option value={acc.id}>{acc.account_code} - {acc.account_name}</option>
										{/each}
									</select>
								</div>
								<div>
									<label
										for="expense_account_id"
										class="mb-1 block text-xs font-medium text-gray-700"
										>{$t('Expense/COGS Acct')} <span class="text-gray-500">(Purchase)</span></label
									>
									<select
										name="expense_account_id"
										id="expense_account_id"
										bind:value={newProduct.expense_account_id}
										class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500"
									>
										<option value={null}>-- None --</option>
										{#each data.accounts || [] as acc}
											<option value={acc.id}>{acc.account_code} - {acc.account_name}</option>
										{/each}
									</select>
								</div>
							</div>
						</fieldset>

						<div class="flex items-center">
							<input
								type="checkbox"
								name="is_active"
								id="is_active_modal"
								bind:checked={newProduct.is_active}
								class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							<label for="is_active_modal" class="ml-2 block text-sm text-gray-900"
								>{$t('Active (can be sold/purchased)')}</label
							>
						</div>
					</div>

					<div class="space-y-2 lg:col-span-1">
						<label for="image" class="block text-sm font-medium text-gray-700"
							>{$t('Product Image')}</label
						>
						<div
							class="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-gray-50"
						>
							{#if imagePreviewUrl}
								<img
									src={imagePreviewUrl}
									alt="Product preview"
									class="h-full w-full object-contain p-2"
								/>
							{:else}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									class="h-16 w-16 text-gray-300"
									><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle
										cx="9"
										cy="9"
										r="2"
									/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg
								>
							{/if}
						</div>
						<input
							type="file"
							name="image"
							id="image"
							accept="image/png, image/jpeg, image/webp"
							on:change={onFileSelected}
							class="block w-full cursor-pointer text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
						/>
					</div>
				</div>

				<div
					class="sticky bottom-0 flex flex-shrink-0 justify-end gap-3 rounded-b-xl border-t bg-gray-50 p-4"
				>
					<button
						type="button"
						on:click={closeProductModal}
						class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
						>{$t('Cancel')}</button
					>
					<button
						type="submit"
						disabled={isSavingProduct}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-400"
					>
						{isSavingProduct ? $t('Saving...') : $t('Save Asset')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

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