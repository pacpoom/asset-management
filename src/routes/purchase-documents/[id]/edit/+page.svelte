<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, SubmitFunction } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { t, locale } from '$lib/i18n';

	interface Vendor {
		id: number | string;
		name: string;
	}

	interface Product {
		id: number | string;
		name: string;
		purchase_cost: number | string;
		unit_id: number | string | null;
		default_wht_rate: number | string;
	}

	interface VendorContact {
		id: number | string;
		vendor_id: number | string;
		name: string;
		position?: string;
	}

	interface JobOrder {
		id: number | string;
		job_number: string;
		bl_number?: string;
		vendor_id?: number | string;
	}

	interface DeliveryAddress {
		id: number | string;
		name: string;
		address_line: string;
		contact_name?: string;
		contact_phone?: string;
	}

	interface SelectOption {
		value: string | number;
		label: string;
		vendor?: Vendor;
		product?: Product;
	}

	interface DBItem {
		id?: number | string;
		product_id: number | string | null;
		description: string;
		quantity: number | string;
		unit_id: number | string | null;
		unit_price: number | string;
		line_total: number | string;
		wht_rate: number | string;
		vat_type?: number | string;
	}

	interface DocumentItem {
		id?: number | string;
		product_object: SelectOption | null;
		product_id: number | string | null;
		description: string;
		quantity: number;
		unit_id: number | string | null;
		unit_price: number;
		line_total: number;
		wht_rate: number;
		vat_type: number; // 1 = Inc, 2 = Exc, 3 = Non-VAT
		amount?: number;
		wht_amount?: number;
	}

	export let data: PageData;
	$: ({ document: doc, existingItems: initialItems, vendors, vendorContacts, units, jobOrders } = data);
	
	let localProducts = data.products || [];

	// --- Address Management State ---
	let localDeliveryAddresses: DeliveryAddress[] = data.deliveryAddresses || [];
	let isAddressModalOpen = false;
	let addressMode: 'list' | 'form' = 'list';
	let editingAddressId: string | number | null = null;
	let addrForm = { name: '', address_line: '', contact_name: '', contact_phone: '' };
	let isSubmittingAddr = false;

	$: vendorOptions = vendors.map((v: Vendor) => ({
		value: v.id,
		label: v.name,
		vendor: v
	}));

	$: productOptions = localProducts.map((p: Product) => ({
		value: p.id,
		label: p.name,
		product: p
	}));

	// อัปเดต Dropdown อัตโนมัติเมื่อมีการเพิ่ม/ลบ
	$: deliveryOptions = localDeliveryAddresses.map((d: DeliveryAddress) => ({
		value: d.id,
		label: d.name
	}));

	let documentType = 'PO';
	let documentDate = new Date().toISOString().split('T')[0];
	let creditTerm: number | null = 30;
	let dueDate = '';
	let deliveryDate = '';

	let selectedVendorObj: SelectOption | null = null;
	let selectedVendorId: string | number = '';

	let selectedContactObj: SelectOption | null = null;
	let selectedContactId: string | number = '';

	let selectedJobOrderObj: SelectOption | null = null;
	let selectedJobOrderId: string | number = '';

	let selectedDeliveryObj: SelectOption | null = null;
	let selectedDeliveryId: string | number = '';

	let referenceDoc = '';
	let notes = '';
	let discountAmount = 0;
	let vatRate = 7;

	let items: DocumentItem[] = [];

	function safeDate(val: any) {
		if (!val) return '';
		try {
			return new Date(val).toISOString().split('T')[0];
		} catch (e) {
			return String(val).split('T')[0] || '';
		}
	}

	let isInitialized = false;
	
	$: if (doc && !isInitialized) {
		documentType = doc.document_type || 'PO';
		documentDate = safeDate(doc.document_date) || new Date().toISOString().split('T')[0];
		deliveryDate = safeDate(doc.delivery_date);
		referenceDoc = doc.reference_doc || '';
		notes = doc.notes || '';
		discountAmount = parseFloat((doc.discount_amount || 0).toString());
		vatRate = parseFloat((doc.vat_rate || 7).toString());

		selectedVendorId = doc.vendor_id || '';
		selectedVendorObj = vendorOptions.find((v: SelectOption) => v.value == selectedVendorId) || null;

		selectedContactId = doc.vendor_contact_id || '';
		
		selectedDeliveryId = doc.delivery_address_id || '';
		selectedDeliveryObj = deliveryOptions.find((d: SelectOption) => d.value == selectedDeliveryId) || null;

		selectedJobOrderId = doc.job_id || '';

		creditTerm = doc.credit_term !== null && doc.credit_term !== undefined ? Number(doc.credit_term) : 30;
		if (doc.due_date) {
			dueDate = safeDate(doc.due_date);
		} else {
			calculateDueDate();
		}

		if (initialItems && initialItems.length > 0) {
			items = initialItems.map((item: DBItem) => {
				const productObj = productOptions.find((p: SelectOption) => p.value == item.product_id) || null;
				return {
					id: item.id,
					product_object: productObj,
					product_id: item.product_id,
					description: item.description || '',
					quantity: parseFloat((item.quantity !== undefined && item.quantity !== null ? item.quantity : 1).toString()),
					unit_id: item.unit_id,
					unit_price: parseFloat((item.unit_price || 0).toString()),
					line_total: parseFloat((item.line_total || 0).toString()),
					wht_rate: parseFloat((item.wht_rate || 0).toString()),
					vat_type: item.vat_type !== undefined && item.vat_type !== null ? Number(item.vat_type) : 1
				};
			});
		} else {
			addItem(); 
		}

		isInitialized = true;
	}

	// --- Address Modal Functions ---
	function openAddressModal() {
		isAddressModalOpen = true;
		addressMode = 'list';
	}

	function closeAddressModal() {
		isAddressModalOpen = false;
	}

	function openAddressForm(addr: DeliveryAddress | null = null) {
		addressMode = 'form';
		if (addr) {
			editingAddressId = addr.id;
			addrForm = { ...addr, contact_name: addr.contact_name || '', contact_phone: addr.contact_phone || '' };
		} else {
			editingAddressId = null;
			addrForm = { name: '', address_line: '', contact_name: '', contact_phone: '' };
		}
	}

	const handleSaveAddress: SubmitFunction = () => {
		isSubmittingAddr = true;
		return async ({ result }) => {
			isSubmittingAddr = false;
			if (result.type === 'success' && result.data) {
				const updatedAddr = result.data.address;
				if (editingAddressId) {
					localDeliveryAddresses = localDeliveryAddresses.map(a => a.id === updatedAddr.id ? updatedAddr : a);
				} else {
					localDeliveryAddresses = [...localDeliveryAddresses, updatedAddr];
				}
				selectedDeliveryId = updatedAddr.id;
				selectedDeliveryObj = { value: updatedAddr.id, label: updatedAddr.name };
				addressMode = 'list';
			} else if (result.type === 'failure') {
				alert(result.data?.message || 'เกิดข้อผิดพลาดในการบันทึกที่อยู่');
			}
		};
	};

	const handleDeleteAddress: SubmitFunction = () => {
		return async ({ result }) => {
			if (result.type === 'success' && result.data) {
				const deletedId = result.data.deletedId;
				localDeliveryAddresses = localDeliveryAddresses.filter(a => a.id !== deletedId);
				if (selectedDeliveryId == deletedId) {
					selectedDeliveryId = '';
					selectedDeliveryObj = null;
				}
			} else if (result.type === 'failure') {
				alert(result.data?.message || 'เกิดข้อผิดพลาดในการลบที่อยู่');
			}
		};
	};


	$: filteredJobOrders = selectedVendorId
		? (jobOrders || []).filter((job: JobOrder) => job.vendor_id == selectedVendorId)
		: [];

	$: filteredContacts = selectedVendorId
		? vendorContacts.filter((c: VendorContact) => c.vendor_id == selectedVendorId)
		: [];

	$: contactOptions = filteredContacts.map((c: VendorContact) => ({
		value: c.id,
		label: `${c.name} ${c.position ? `(${c.position})` : ''}`
	}));

	$: jobOrderOptions = filteredJobOrders.map((job: JobOrder) => ({
		value: job.id,
		label: `${job.job_number} | BL: ${job.bl_number !== '-' && job.bl_number ? job.bl_number : 'N/A'}`
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

	function calculateDueDate() {
		if (documentDate && creditTerm !== null && creditTerm !== undefined) {
			const d = new Date(documentDate);
			d.setDate(d.getDate() + Number(creditTerm));
			dueDate = d.toISOString().split('T')[0];
		}
	}

	function onVendorChange(selected: SelectOption | null) {
		selectedVendorObj = selected;
		selectedVendorId = selected ? selected.value : '';

		selectedContactId = '';
		selectedContactObj = null;

		selectedJobOrderId = '';
		selectedJobOrderObj = null;
	}

	function onContactChange(selected: SelectOption | null) {
		selectedContactObj = selected;
		selectedContactId = selected ? selected.value : '';
	}

	function onJobOrderChange(selected: SelectOption | null) {
		selectedJobOrderObj = selected;
		selectedJobOrderId = selected ? selected.value : '';
	}

	function onDeliveryChange(selected: SelectOption | null) {
		selectedDeliveryObj = selected;
		selectedDeliveryId = selected ? selected.value : '';
	}

	// Calculate line items amounts
	$: calculatedItems = items.map((item) => {
		const rawLineTotal = (item.quantity || 0) * (item.unit_price || 0);
		let amount = rawLineTotal;

		let whtBase = rawLineTotal;
		if (Number(item.vat_type) === 1 && vatRate > 0) {
			whtBase = (rawLineTotal * 100) / (100 + vatRate);
		}

		const whtAmt = whtBase * (item.wht_rate / 100);

		return {
			...item,
			line_total: rawLineTotal,
			amount: amount,
			wht_amount: whtAmt
		};
	});

	$: subtotalBeforeVat = calculatedItems.reduce((sum, item) => sum + (item.amount || 0), 0);
	$: totalAfterDiscount = Math.max(0, subtotalBeforeVat - discountAmount);

	$: excVatTotal = calculatedItems
		.filter((item) => Number(item.vat_type) === 2)
		.reduce((sum, item) => sum + (item.amount || 0), 0);
	$: incVatTotal = calculatedItems
		.filter((item) => Number(item.vat_type) === 1)
		.reduce((sum, item) => sum + (item.amount || 0), 0);
	$: nonVatTotal = calculatedItems
		.filter((item) => Number(item.vat_type) === 3)
		.reduce((sum, item) => sum + (item.amount || 0), 0);

	$: discountForExcVat = subtotalBeforeVat > 0 ? discountAmount * (excVatTotal / subtotalBeforeVat) : 0;
	$: discountForIncVat = subtotalBeforeVat > 0 ? discountAmount * (incVatTotal / subtotalBeforeVat) : 0;
	$: discountForNonVat = subtotalBeforeVat > 0 ? discountAmount * (nonVatTotal / subtotalBeforeVat) : 0;

	$: vatFromExc = Math.max(0, ((excVatTotal - discountForExcVat) * vatRate) / 100);
	$: vatFromInc = Math.max(0, ((incVatTotal - discountForIncVat) * vatRate) / (100 + vatRate));

	$: vatableAmount =
		excVatTotal - discountForExcVat + ((incVatTotal - discountForIncVat) * 100) / (100 + vatRate);
	$: nonVatableAmount = nonVatTotal - discountForNonVat;
	$: amountBeforeVat = vatableAmount + nonVatableAmount;

	$: vatAmount = vatFromExc + vatFromInc;
	$: whtAmount = calculatedItems.reduce((sum, item) => sum + (item.wht_amount || 0), 0);

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
				vat_type: 1
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
			items[index].unit_price = parseFloat(product.purchase_cost?.toString() || '0') || 0;
			items[index].unit_id = product.unit_id;
			items[index].wht_rate = parseFloat(product.default_wht_rate?.toString() || '0') || 0;
			items[index].vat_type = 1; // Default Inc.
		} else {
			items[index].product_id = null;
			items[index].description = '';
			items[index].unit_price = 0;
			items[index].unit_id = null;
			items[index].wht_rate = 0;
			items[index].vat_type = 1;
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
	<title>{$t('Edit')} {doc?.document_number || 'Purchase Document'}</title>
</svelte:head>

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
		{$t('Edit')} {doc?.document_number || 'Purchase Document'}
	</h1>

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
		<input type="hidden" name="id" value={doc?.id} />

		<div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="relative z-[60]">
				<label for="document_type" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Document Type')} <span class="text-red-500">*</span></label
				>
				<select
					id="document_type"
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

			<div class="relative z-40">
				<label for="vendor_contact_id" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Contact Person')}</label
				>
				<Select
					id="vendor_contact_id"
					items={contactOptions}
					value={selectedContactObj}
					on:change={(e) => onContactChange(e.detail)}
					on:clear={() => onContactChange(null)}
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

			<div class="relative z-35">
				<div class="mb-1 flex items-center justify-between">
					<label for="delivery_address_id" class="block text-sm font-medium text-gray-700">
						{$t('Ship To (Delivery Address)')}
					</label>
					<button type="button" on:click={openAddressModal} class="text-xs font-semibold text-blue-600 hover:text-blue-800 underline">
						+ {$t('Manage Address')}
					</button>
				</div>
				<Select
					id="delivery_address_id"
					items={deliveryOptions}
					value={selectedDeliveryObj}
					on:change={(e) => onDeliveryChange(e.detail)}
					on:clear={() => onDeliveryChange(null)}
					placeholder={$t('-- Select Delivery Address --')}
					container={browser ? document.body : null}
					--inputStyles="padding: 2px 0; font-size: 0.875rem;"
					--list="border-radius: 6px; font-size: 0.875rem;"
					--itemIsActive="background: #e0f2fe;"
				/>
				<input type="hidden" name="delivery_address_id" value={selectedDeliveryId} />
			</div>

			<div class="relative z-30 grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-4">
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
						<option value={15}>{$t('15 Days')}</option>
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
				<div>
					<label for="delivery_date" class="mb-1 block text-sm font-medium text-gray-700"
						>{$t('Delivery Date')}</label
					>
					<input
						type="date"
						id="delivery_date"
						name="delivery_date"
						bind:value={deliveryDate}
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500"
					/>
				</div>
			</div>

			<div class="relative z-20">
				<label for="job_id" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Reference Job Order')}</label
				>
				<Select
					id="job_id"
					items={jobOrderOptions}
					value={selectedJobOrderObj}
					on:change={(e) => onJobOrderChange(e.detail)}
					on:clear={() => onJobOrderChange(null)}
					placeholder={$t('-- Select Job Order --')}
					container={browser ? document.body : null}
					disabled={!selectedVendorId || filteredJobOrders.length === 0}
					--inputStyles="padding: 2px 0; font-size: 0.875rem;"
					--list="border-radius: 6px; font-size: 0.875rem;"
					--itemIsActive="background: #e0f2fe;"
				/>
				<input type="hidden" name="job_id" value={selectedJobOrderId} />
				{#if selectedVendorId && filteredJobOrders.length === 0}
					<p class="mt-1 text-xs text-red-500">{$t('No Job Order found for this vendor')}</p>
				{/if}
			</div>

			<div class="relative z-10">
				<label for="reference_doc" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Other Reference (Quotation/Ref)')}</label
				>
				<input
					type="text"
					id="reference_doc"
					name="reference_doc"
					bind:value={referenceDoc}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500"
					placeholder={$t('e.g. QT-2023...')}
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
					<thead class="bg-gray-50 text-xs uppercase text-gray-500">
						<tr>
							<th class="w-20 px-2 py-2 text-left font-medium">{$t('Product/Service')}</th>
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
										class="min-h-[38px] w-full resize-y rounded-md border-gray-300 text-sm"
										required
									></textarea>
								</td>
								<td class="w-5 px-2 py-2">
									<input
										type="number"
										bind:value={items[index].quantity}
										on:input={() => updateLineTotal(index)}
										min="1"
										class="w-full rounded-md border-gray-300 px-2 text-right text-sm"
										required
									/>
								</td>
								<td class="w-5 px-2 py-2">
									<select
										bind:value={items[index].unit_id}
										class="w-full rounded-md border-gray-300 px-2 py-1.5 text-center text-sm"
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
										class="w-full rounded-md border-gray-300 px-2 text-right text-sm"
										required
									/>
								</td>
								<td class="px-1 py-2 align-middle text-center">
									<select
										bind:value={items[index].vat_type}
										class="w-full rounded-md border-gray-300 px-1 py-1.5 text-center text-xs font-medium focus:border-blue-500 focus:ring-blue-500 {items[
											index
										].vat_type === 1
											? 'bg-blue-50 text-blue-600'
											: items[index].vat_type === 2
												? 'bg-orange-50 text-orange-600'
												: 'bg-gray-50 text-gray-600'}"
									>
										<option value={1}>Inc. VAT</option>
										<option value={2}>VAT 7%</option>
										<option value={3}>Non-VAT</option>
									</select>
								</td>
								<td class="bg-gray-50/50 px-2 py-2 text-right font-medium text-gray-700">
									{formatNumber(item.amount || 0)}
								</td>
								<td class="px-2 py-2">
									<select
										bind:value={items[index].wht_rate}
										class="w-full rounded-md border-red-200 bg-red-50 px-1 py-1.5 text-center text-sm font-bold text-red-700"
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
										<button
											type="button"
											aria-label="Remove item"
											on:click={() => removeItem(index)}
											class="rounded p-1 text-red-500 hover:bg-red-50"
											>❌</button
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
				class="mt-3 flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg
				>
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

				<div class="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 text-sm">
					<span class="text-gray-600">
						{$t('Purchase VAT')}
						<select
							id="vat_rate"
							name="vat_rate"
							bind:value={vatRate}
							class="ml-2 w-20 rounded-md border-gray-300 py-1 pl-3 pr-8 text-sm shadow-sm focus:border-blue-500"
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
				href="/purchase-documents"
				class="rounded-md border bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
				>{$t('Cancel')}</a
			>
			<button
				type="submit"
				disabled={isSaving}
				class="rounded-md bg-blue-600 px-6 py-2 text-sm text-white hover:bg-blue-700"
			>
				{isSaving ? $t('Saving...') : $t('Update Document')}
			</button>
		</div>
	</form>
</div>

<!-- ================= ADDRESS MANAGEMENT MODAL ================= -->
{#if isAddressModalOpen}
<div class="fixed inset-0 z-[99999] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm transition-opacity p-4">
	<div class="w-full max-w-2xl rounded-xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
		<div class="flex items-center justify-between border-b px-6 py-4 bg-gray-50">
			<h3 class="text-lg font-bold text-gray-800">
				{addressMode === 'list' ? $t('Manage Delivery Addresses') : (editingAddressId ? $t('Edit Address') : $t('Add New Address'))}
			</h3>
			<button type="button" aria-label="Close" on:click={closeAddressModal} class="text-gray-400 hover:text-gray-600 transition-colors p-1">
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
			</button>
		</div>

		<div class="p-6 overflow-y-auto flex-1">
			{#if addressMode === 'list'}
				<div class="mb-4 flex justify-end">
					<button type="button" on:click={() => openAddressForm()} class="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm">
						+ {$t('Add New')}
					</button>
				</div>
				<div class="space-y-3">
					{#if localDeliveryAddresses.length === 0}
						<div class="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-300">
							<p class="text-sm text-gray-500">{$t('No addresses found. Please add a new delivery address.')}</p>
						</div>
					{:else}
						{#each localDeliveryAddresses as addr}
							<div class="flex items-start justify-between rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-all">
								<div class="flex-1 pr-4">
									<p class="font-bold text-gray-800 text-base">{addr.name}</p>
									<p class="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{addr.address_line}</p>
									{#if addr.contact_name || addr.contact_phone}
										<p class="text-sm text-gray-500 mt-2 flex items-center gap-2">
											<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>
											{addr.contact_name || '-'} {addr.contact_phone ? `(${addr.contact_phone})` : ''}
										</p>
									{/if}
								</div>
								<div class="flex flex-col gap-2 ml-4 shrink-0">
									<button type="button" on:click={() => openAddressForm(addr)} class="text-blue-600 hover:text-blue-800 text-xs font-medium px-3 py-1.5 border border-blue-200 bg-blue-50 rounded hover:bg-blue-100 transition-colors w-full text-center">{$t('Edit')}</button>
									<form method="POST" action="?/deleteAddress" use:enhance={handleDeleteAddress}>
										<input type="hidden" name="id" value={addr.id} />
										<button type="submit" class="text-red-600 hover:text-red-800 text-xs font-medium px-3 py-1.5 border border-red-200 bg-red-50 rounded hover:bg-red-100 transition-colors w-full text-center" on:click={(e) => { if(!confirm($t('Are you sure you want to delete this address?'))) e.preventDefault(); }}>{$t('Delete')}</button>
									</form>
								</div>
							</div>
						{/each}
					{/if}
				</div>
			{:else}
				<form method="POST" action={editingAddressId ? '?/updateAddress' : '?/createAddress'} use:enhance={handleSaveAddress}>
					{#if editingAddressId}
						<input type="hidden" name="id" value={editingAddressId} />
					{/if}
					<div class="space-y-4">
						<div>
							<label for="addr_name" class="block text-sm font-medium text-gray-700 mb-1">{$t('Location Name')} <span class="text-red-500">*</span></label>
							<input type="text" id="addr_name" name="name" bind:value={addrForm.name} required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="e.g. สำนักงานใหญ่, คลังสินค้า A" />
						</div>
						<div>
							<label for="addr_address_line" class="block text-sm font-medium text-gray-700 mb-1">{$t('Full Address')} <span class="text-red-500">*</span></label>
							<textarea id="addr_address_line" name="address_line" bind:value={addrForm.address_line} required rows="3" class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"></textarea>
						</div>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label for="addr_contact_name" class="block text-sm font-medium text-gray-700 mb-1">{$t('Contact Person')}</label>
								<input type="text" id="addr_contact_name" name="contact_name" bind:value={addrForm.contact_name} class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
							</div>
							<div>
								<label for="addr_contact_phone" class="block text-sm font-medium text-gray-700 mb-1">{$t('Phone Number')}</label>
								<input type="text" id="addr_contact_phone" name="contact_phone" bind:value={addrForm.contact_phone} class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
							</div>
						</div>
					</div>
					<div class="mt-8 flex justify-end gap-3 border-t pt-4">
						<button type="button" on:click={() => addressMode = 'list'} class="rounded-md border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none">{$t('Cancel')}</button>
						<button type="submit" disabled={isSubmittingAddr} class="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none disabled:opacity-50">
							{isSubmittingAddr ? $t('Saving...') : $t('Save Address')}
						</button>
					</div>
				</form>
			{/if}
		</div>
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