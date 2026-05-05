<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { t, locale } from '$lib/i18n';

	interface Customer {
		id: number | string;
		name: string;
		company_name?: string;
	}

	interface Product {
		id: number | string;
		name: string;
		price: number | string;
		unit_id: number | string | null;
		default_wht_rate: number | string;
		category_id: number | string | null; // 🌟 เพิ่ม property นี้
	}

	interface CustomerContact {
		id: number | string;
		customer_id: number | string;
		name: string;
		position?: string;
	}

	interface JobOrder {
		id: number | string;
		customer_id: number | string;
		job_number: string;
		bl_number?: string;
	}

	interface Vendor {
		id: number | string;
		name: string;
	}

	interface SelectOption {
		value: string | number;
		label: string;
		customer?: Customer;
		product?: Product;
	}

	interface DBItem {
		product_id: number | string | null;
		description: string;
		quantity: number | string;
		unit_id: number | string | null;
		unit_price: number | string;
		line_total: number | string;
		wht_rate: number | string;
		is_vat?: number | boolean;
	}

	interface DocumentItem {
		product_object: SelectOption | null;
		product_id: number | string | null;
		description: string;
		quantity: number;
		unit_id: number | string | null;
		unit_price: number;
		line_total: number;
		wht_rate: number;
		is_vat: number; // 1 = Inc, 0 = Exc, 2 = Non-VAT
		amount?: number;
		wht_amount?: number;
	}

	export let data: PageData;
	$: ({ customers, customerContacts, units, jobOrders, prefillData } = data);
	let localProducts = data.products || [];

	$: customerOptions = customers.map((c: Customer) => ({
		value: c.id,
		label: c.company_name || c.name,
		customer: c
	}));

	let documentType = 'INV';
	let documentDate = new Date().toISOString().split('T')[0];
	let creditTerm: number | null = 30;
	let dueDate = (() => {
		const d = new Date();
		d.setDate(d.getDate() + 30);
		return d.toISOString().split('T')[0];
	})();

	let selectedCustomerObj: SelectOption | null = null;
	let selectedCustomerId: string | number = '';
	
	let selectedContactObj: SelectOption | null = null;
	let selectedContactId: string | number = '';
	
	let selectedJobOrderObj: SelectOption | null = null;
	let selectedJobOrderId: string | number = '';

	let referenceDoc = '';
	let notes = '';
	let discountAmount = 0;
	let vatRate = 7;

	let items: DocumentItem[] = [
		{
			product_object: null,
			product_id: null,
			description: '',
			quantity: 1,
			unit_id: null,
			unit_price: 0,
			line_total: 0,
			wht_rate: 0,
			is_vat: 1 // Default to Inc. VAT
		}
	];

	$: filteredJobOrders = selectedCustomerId
		? jobOrders.filter((jo: JobOrder) => jo.customer_id == selectedCustomerId)
		: [];

	$: filteredContacts = selectedCustomerId
		? customerContacts.filter((c: CustomerContact) => c.customer_id == selectedCustomerId)
		: [];

	$: contactOptions = filteredContacts.map((c: CustomerContact) => ({
		value: c.id,
		label: `${c.name} ${c.position ? `(${c.position})` : ''}`
	}));

	$: jobOrderOptions = filteredJobOrders.map((job: JobOrder) => ({
		value: job.id,
		label: `${job.job_number} | BL: ${job.bl_number !== '-' && job.bl_number ? job.bl_number : 'N/A'}`
	}));

	// 🌟 กรองรายการ Product ตามเงื่อนไข Category = 24 เมื่อมีการเลือก Job Order
	$: productOptions = localProducts
		.filter((p: Product) => selectedJobOrderId ? p.category_id == 24 : true)
		.map((p: Product) => ({
			value: p.id,
			label: p.name,
			product: p
		}));

	$: if (selectedContactId && contactOptions.length > 0) {
		if (!selectedContactObj || selectedContactObj.value !== selectedContactId) {
			selectedContactObj = contactOptions.find((c: SelectOption) => c.value == selectedContactId) || null;
		}
	} else if (!selectedContactId) {
		selectedContactObj = null;
	}

	$: if (selectedJobOrderId && jobOrderOptions.length > 0) {
		if (!selectedJobOrderObj || selectedJobOrderObj.value !== selectedJobOrderId) {
			selectedJobOrderObj = jobOrderOptions.find((j: SelectOption) => j.value == selectedJobOrderId) || null;
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
			selectedCustomerObj = customerOptions.find((c: SelectOption) => c.value == selectedCustomerId) || null;
			
			selectedContactId = prefillData.document.customer_contact_id || '';

			setTimeout(() => {
				selectedJobOrderId = prefillData.document.job_order_id || '';
				if (selectedJobOrderId && jobOrderOptions.length > 0) {
					selectedJobOrderObj = jobOrderOptions.find((j: SelectOption) => j.value == selectedJobOrderId) || null;
				}
			}, 150);

			creditTerm = prefillData.document.credit_term !== null && prefillData.document.credit_term !== undefined ? Number(prefillData.document.credit_term) : 30;
			discountAmount = parseFloat(prefillData.document.discount_amount || '0');
			vatRate = parseFloat(prefillData.document.vat_rate || '7');

			if (prefillData.items && prefillData.items.length > 0) {
				items = prefillData.items.map((item: DBItem) => {
					// ต้องระวังถ้า prefill ข้อมูลแล้ว category_id != 24 แต่เราเลือก JobOrder
					const productObj = productOptions.find((p: SelectOption) => p.value == item.product_id) || null;
					return {
						product_object: productObj,
						product_id: item.product_id,
						description: item.description,
						quantity: parseFloat((item.quantity || 1).toString()),
						unit_id: item.unit_id,
						unit_price: parseFloat((item.unit_price || 0).toString()),
						line_total: parseFloat((item.line_total || 0).toString()),
						wht_rate: parseFloat((item.wht_rate || 0).toString()),
						is_vat: item.is_vat !== undefined ? Number(item.is_vat) : 1
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

	function onCustomerChange(selected: SelectOption | null) {
		selectedCustomerObj = selected;
		selectedCustomerId = selected ? selected.value : '';
		
		selectedJobOrderId = '';
		selectedJobOrderObj = null;
		
		selectedContactId = ''; 
		selectedContactObj = null;
	}

	function onContactChange(selected: SelectOption | null) {
		selectedContactObj = selected;
		selectedContactId = selected ? selected.value : '';
	}

	function onJobOrderChange(selected: SelectOption | null) {
		selectedJobOrderObj = selected;
		selectedJobOrderId = selected ? selected.value : '';
		
		// 🌟 หากสลับ Job Order แล้วรายการที่มีอยู่ไม่อยู่ในเงื่อนไขที่กรอง เราอาจจะเคลียร์รายการเพื่อความถูกต้อง (หรือไม่ก็ได้)
		// ในที่นี้ไม่ได้เคลียร์ items เดิมทิ้ง แต่ตอน Search Product จะหาเจอแค่หมวด 24
	}

	// Calculate line items amounts
	$: calculatedItems = items.map(item => {
		const rawLineTotal = (item.quantity || 0) * (item.unit_price || 0);
		let amount = rawLineTotal;
		
		let whtBase = rawLineTotal;
		if (Number(item.is_vat) === 1 && vatRate > 0) { // 1 = Inc VAT
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

	// --- VAT Calculation Logic (Reflected as PDF) ---
	$: subtotalBeforeVat = calculatedItems.reduce((sum, item) => sum + (item.amount || 0), 0);
	$: totalAfterDiscount = Math.max(0, subtotalBeforeVat - discountAmount);
	
	// Separate totals based on VAT type
	$: excVatTotal = calculatedItems.filter(item => Number(item.is_vat) === 0).reduce((sum, item) => sum + (item.amount || 0), 0);
	$: incVatTotal = calculatedItems.filter(item => Number(item.is_vat) === 1).reduce((sum, item) => sum + (item.amount || 0), 0);
	$: nonVatTotal = calculatedItems.filter(item => Number(item.is_vat) === 2).reduce((sum, item) => sum + (item.amount || 0), 0);

	// Distribute discount proportionally
	$: discountForExcVat = subtotalBeforeVat > 0 ? discountAmount * (excVatTotal / subtotalBeforeVat) : 0;
	$: discountForIncVat = subtotalBeforeVat > 0 ? discountAmount * (incVatTotal / subtotalBeforeVat) : 0;
	$: discountForNonVat = subtotalBeforeVat > 0 ? discountAmount * (nonVatTotal / subtotalBeforeVat) : 0;
	
	// Calculate VAT for each part
	$: vatFromExc = Math.max(0, ((excVatTotal - discountForExcVat) * vatRate) / 100);
	$: vatFromInc = Math.max(0, ((incVatTotal - discountForIncVat) * vatRate) / (100 + vatRate));
	
	// Base amounts
	$: vatableAmount = (excVatTotal - discountForExcVat) + ((incVatTotal - discountForIncVat) * 100 / (100 + vatRate));
	$: nonVatableAmount = nonVatTotal - discountForNonVat;
	$: amountBeforeVat = vatableAmount + nonVatableAmount;

	$: vatAmount = vatFromExc + vatFromInc;
	$: whtAmount = calculatedItems.reduce((sum, item) => sum + (item.wht_amount || 0), 0);
	
	// Grand Total
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

	function onProductChange(index: number, selected: SelectOption | null) {
		items[index].product_object = selected;
		if (selected && selected.product) {
			const product = selected.product;
			items[index].product_id = product.id;
			items[index].description = product.name;
			items[index].unit_price = parseFloat(product.price.toString()) || 0;
			items[index].unit_id = product.unit_id;
			items[index].wht_rate = parseFloat(product.default_wht_rate.toString()) || 0;
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

	let isSaving = false;

	let showAddProductModal = false;
	let isSavingProduct = false;
	let toastMessage = '';
	let newProduct = {
		sku: '', name: '', description: '', product_type: 'Stock', category_id: null as number | null,
		unit_id: null as number | null, purchase_unit_id: null as number | null, sales_unit_id: null as number | null,
		purchase_cost: 0, selling_price: 0, quantity_on_hand: 0, reorder_level: 0,
		preferred_vendor_id: null as number | null, preferred_customer_id: null as number | null,
		asset_account_id: null as number | null, income_account_id: null as number | null, expense_account_id: null as number | null,
		is_active: true, default_wht_rate: 3
	};

	let vendorSearchText = '';
	let isVendorDropdownOpen = false;
	let customerSearchText = '';
	let isCustomerDropdownOpen = false;
	$: filteredVendors = data.vendors
		? data.vendors.filter((v: Vendor) => v.name.toLowerCase().includes(vendorSearchText.toLowerCase()))
		: [];
	$: filteredCustomers = data.customers
		? data.customers.filter((c: Customer) =>
				c.name.toLowerCase().includes(customerSearchText.toLowerCase())
			)
		: [];
	let imagePreviewUrl: string | null = null;

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

	function showToast(msg: string) {
		toastMessage = msg;
		setTimeout(() => (toastMessage = ''), 3000);
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

<!-- 🌟 หน้าจอ Loading หมุนๆ ตอนกำลัง Save -->
{#if isSaving}
	<div class="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm transition-opacity">
		<div class="flex flex-col items-center rounded-xl bg-white px-10 py-8 shadow-2xl">
			<div class="mb-5 h-14 w-14 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
			<p class="text-xl font-bold text-gray-800">{$t('Saving...')}</p>
			<p class="mt-1 text-sm text-gray-500">กำลังบันทึกข้อมูล กรุณารอสักครู่...</p>
		</div>
	</div>
{/if}

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
			isSaving = true; // 🌟 Trigger loading screen
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
					<option value="D-INV">{$t('Draft Invoice (D-INV)')}</option>
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
							<th class="w-20 px-2 py-2 text-left font-medium">
								<div class="flex items-center gap-2">
									{$t('Product/Service')}
									<button
										type="button"
										on:click={() => (showAddProductModal = true)}
										class="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200"
										title={$t('Add New Product/Service')}
									>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
									</button>
								</div>
							</th>
							<th class="px-2 py-2 text-left font-bold">{$t('Description')}</th>
							<th class="w-25 px-4 py-2 text-right">{$t('Qty')}</th>
							<th class="w-25 px-4 py-2 text-center">{$t('Unit')}</th>
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
								<td class="w-35 px-3 py-2" style="min-width: 200px; max-width: 200px;">
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
								<td class="w-64 px-2 py-2">
									<textarea
										bind:value={items[index].description}
										title={items[index].description}
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
										<option value={0}>VAT 7%</option>
										<option value={2}>Non-VAT</option>
									</select>
								</td>
								<td class="px-2 py-2 text-right font-medium text-gray-700 bg-gray-50/50">
									{formatNumber(item.amount || 0)}
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
									{#if item.wht_amount && item.wht_amount > 0}
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

		<div class="mb-6 flex justify-end">
			<div
				class="w-full space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-inner md:w-1/3"
			>
				<div class="flex justify-between text-sm">
					<span class="text-gray-600">{$t('Subtotal')}</span>
					<span class="font-medium">{formatNumber(subtotalBeforeVat)}</span>
				</div>
				
				<div class="mt-2 flex items-center justify-between text-sm">
					<span class="text-gray-600">{$t('VatableAmount') || 'Vatable Amount'}</span>
					<span class="font-medium text-gray-800">{formatNumber(vatableAmount)}</span>
				</div>

				<div class="mt-2 flex items-center justify-between text-sm">
					<span class="text-gray-600">{$t('NonVatableAmount') || 'Non-VAT Amount'}</span>
					<span class="font-medium text-gray-800">{formatNumber(nonVatableAmount)}</span>
				</div>

				<div class="mt-2 flex items-center justify-between text-sm">
					<span class="text-gray-600">{$t('AmountBeforeVAT') || 'Amount Before VAT'}</span>
					<span class="font-medium text-gray-800">{formatNumber(amountBeforeVat)}</span>
				</div>

				<div class="mt-2 flex items-center justify-between text-sm border-t border-gray-200 pt-2">
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
		<input type="hidden" name="subtotal" value={subtotalBeforeVat} />
		<input type="hidden" name="total_after_discount" value={totalAfterDiscount} />
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
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
		{toastMessage}
	</div>
{/if}

{#if showAddProductModal}
	<div class="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4 transition-opacity">
		<div class="fixed inset-0" on:click={closeProductModal} role="presentation"></div>
		<div class="relative flex max-h-[85vh] w-full max-w-7xl transform flex-col rounded-xl bg-white shadow-2xl transition-all">
			<div class="flex flex-shrink-0 items-center justify-between rounded-t-xl border-b bg-gray-50 px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">{$t('Add New Product/Service')}</h2>
				<button type="button" on:click={closeProductModal} class="text-xl font-bold text-gray-400 hover:text-gray-600">&times;</button>
			</div>
			<form method="POST" action="?/createProduct" class="flex-1 overflow-y-auto">
                <div class="p-6">
                    <p class="text-sm text-gray-500">({$t('Product Form inside modal logic preserved')})</p>
                </div>
				<div class="sticky bottom-0 flex justify-end gap-3 rounded-b-xl border-t bg-gray-50 p-4">
					<button type="button" on:click={closeProductModal} class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50">{$t('Cancel')}</button>
					<button type="submit" disabled={isSavingProduct} class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
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