<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { t, locale } from '$lib/i18n';

	export let data: PageData;
	$: ({
		document,
		existingItems,
		existingAttachments,
		vendors,
		vendorContacts,
		vendorContractsData,
		products,
		units,
		jobOrders,
		deliveryAddresses
	} = data);

	let localAddresses = data.deliveryAddresses || [];
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

	interface DocumentItem {
		product_object: any;
		product_id: number | null;
		description: string;
		quantity: number;
		unit_id: number | null;
		unit_price: number;
		line_total: number;
		wht_rate: number;
		vat_type: number; 
	}

	let documentDate = '';
	let dueDate = '';
	let deliveryDate = '';
	let creditTerm: number | null = 0;
	let items: DocumentItem[] = [];
	let discountAmount = 0;
	let vatRate = 7;
	let referenceDoc = '';

	let selectedVendorObj: any = null;
	let selectedVendorId: string | number = '';

	let selectedContactObj: any = null;
	let selectedContactId: string | number = '';

	let selectedContractObj: any = null;
	let selectedContractId: string | number = '';

	let selectedDeliveryAddressId: string | number = '';

	let selectedJobObj: any = null;
	let selectedJobId: string | number = '';

	$: filteredContacts = selectedVendorId
		? vendorContacts?.filter((c: any) => c.vendor_id == selectedVendorId) || []
		: [];

	$: contactOptions = filteredContacts.map((c: any) => ({
		value: c.id,
		label: `${c.name} ${c.position ? `(${c.position})` : ''}`
	}));

	$: filteredContracts = selectedVendorId 
		? (vendorContractsData || []).filter((c: any) => c.vendor_id == selectedVendorId)
		: [];
		
	$: contractOptionsList = filteredContracts.map((c: any) => ({
		value: c.id,
		label: `${c.title} ${c.contract_number ? `(${c.contract_number})` : ''}`
	}));

	$: availableJobOrders = selectedVendorId 
		? (jobOrders || []).filter((j: any) => j.vendor_id == selectedVendorId)
		: [];

	$: jobOrderOptions = availableJobOrders.map((j: any) => ({
		value: j.id,
		label: `${j.job_number} | BL: ${j.bl_number !== '-' && j.bl_number ? j.bl_number : 'N/A'}`,
		job: j
	}));

	$: currentLoc = $locale === 'th' ? 'th-TH' : 'en-US';
	$: formatNumber = (amount: number) =>
		new Intl.NumberFormat(currentLoc, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount || 0);

	let initializedDocId: number | null = null;
	$: if (document && document.id !== initializedDocId) {
		initializedDocId = document.id;
		documentDate = new Date(document.document_date).toISOString().split('T')[0];
		dueDate = document.due_date ? new Date(document.due_date).toISOString().split('T')[0] : '';
		deliveryDate = document.delivery_date ? new Date(document.delivery_date).toISOString().split('T')[0] : '';
		creditTerm = document.credit_term !== null ? Number(document.credit_term) : 0;
		discountAmount = parseFloat(document.discount_amount || '0');
		vatRate = parseFloat(document.vat_rate || '7');
		referenceDoc = document.reference_doc || '';
		
		selectedVendorId = document.vendor_id;
		selectedVendorObj = vendorOptions.find((v: any) => v.value == selectedVendorId) || null;

		selectedDeliveryAddressId = document.delivery_address_id || '';

		selectedContactId = document.vendor_contact_id || '';
		if (selectedContactId && vendorContacts) {
			const foundContact = vendorContacts.find((c: any) => c.id == selectedContactId);
			if (foundContact) {
				selectedContactObj = {
					value: foundContact.id,
					label: `${foundContact.name} ${foundContact.position ? `(${foundContact.position})` : ''}`
				};
			}
		}

		selectedContractId = document.contract_id || '';
		if (selectedContractId && vendorContractsData) {
			const foundContract = vendorContractsData.find((c: any) => c.id == selectedContractId);
			if (foundContract) {
				selectedContractObj = {
					value: foundContract.id,
					label: `${foundContract.title} ${foundContract.contract_number ? `(${foundContract.contract_number})` : ''}`
				};
			}
		}

		if (document.job_id) {
			selectedJobId = document.job_id;
			const foundJob = jobOrders.find((j: any) => j.id == document.job_id);
			if (foundJob) {
				selectedJobObj = {
					value: foundJob.id,
					label: `${foundJob.job_number} | BL: ${foundJob.bl_number !== '-' && foundJob.bl_number ? foundJob.bl_number : 'N/A'}`,
					job: foundJob
				};
			}
		} else {
			selectedJobId = '';
			selectedJobObj = null;
		}
	}

	$: if (selectedContactId && contactOptions.length > 0) {
		if (!selectedContactObj || selectedContactObj.value !== selectedContactId) {
			selectedContactObj = contactOptions.find((c: any) => c.value == selectedContactId) || null;
		}
	} else if (!selectedContactId) {
		selectedContactObj = null;
	}

	$: if (selectedContractId && contractOptionsList.length > 0) {
		if (!selectedContractObj || selectedContractObj.value !== selectedContractId) {
			selectedContractObj = contractOptionsList.find((c: any) => c.value == selectedContractId) || null;
		}
	} else if (!selectedContractId) {
		selectedContractObj = null;
	}

	let initializedItemsDocId: number | null = null;
	$: if (existingItems && document && document.id !== initializedItemsDocId) {
		initializedItemsDocId = document.id;
		items = existingItems.map((item: any) => {
			const foundProduct = products.find((p: any) => p.id == item.product_id);
			const productObj = foundProduct
				? {
						value: foundProduct.id,
						label: foundProduct.name,
						product: foundProduct
					}
				: null;

			const resolvedVatType = item.vat_type !== undefined 
				? Number(item.vat_type) 
				: (item.is_vat ? 2 : 3);

			return {
				product_object: productObj,
				product_id: item.product_id ? Number(item.product_id) : null,
				description: item.description,
				quantity: parseFloat(item.quantity || '0'),
				unit_id: item.unit_id ? Number(item.unit_id) : null,
				unit_price: parseFloat(item.unit_price || '0'),
				line_total: parseFloat(item.line_total || '0'),
				wht_rate: parseFloat(item.wht_rate || '0'),
				vat_type: resolvedVatType
			};
		});
	}

	$: subtotal = items.reduce((sum, item) => sum + (item.line_total || 0), 0);
	$: discountRatio = subtotal > 0 ? (discountAmount / subtotal) : 0;
	$: totalAfterDiscount = Math.max(0, subtotal - discountAmount);

	$: addedVat = items.reduce((sum, item) => {
		if (Number(item.vat_type) === 2) { 
			const discountedLineTotal = (item.line_total || 0) * (1 - discountRatio);
			return sum + (discountedLineTotal * vatRate / 100);
		}
		return sum;
	}, 0);

	$: extractedVat = items.reduce((sum, item) => {
		if (Number(item.vat_type) === 1) { 
			const discountedLineTotal = (item.line_total || 0) * (1 - discountRatio);
			return sum + (discountedLineTotal - (discountedLineTotal * 100 / (100 + vatRate)));
		}
		return sum;
	}, 0);

	$: vatAmount = addedVat + extractedVat;
	
	$: whtAmount = items.reduce((sum, item) => {
		const rate = item.wht_rate || 0;
		if (rate === 0) return sum;

		const discountedLineTotal = (item.line_total || 0) * (1 - discountRatio);
		let baseAmountForWht = discountedLineTotal;
		
		if (Number(item.vat_type) === 1) {
			baseAmountForWht = discountedLineTotal * 100 / (100 + vatRate);
		}
		return sum + (baseAmountForWht * rate / 100);
	}, 0);

	$: grandTotal = totalAfterDiscount + addedVat - whtAmount;
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
				vat_type: 2
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
			items[index].unit_id = product.unit_id ? Number(product.unit_id) : null;
			items[index].wht_rate = parseFloat(product.default_wht_rate) || 0;
			items[index].vat_type = 2; 
		} else {
			items[index].product_id = null;
			items[index].description = '';
			items[index].unit_price = 0;
			items[index].unit_id = null;
			items[index].wht_rate = 0;
			items[index].vat_type = 2;
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

	function onVendorChange(selected: any) {
		selectedVendorObj = selected;
		selectedVendorId = selected ? selected.value : '';
		
		selectedContactId = ''; 
		selectedContactObj = null;
		selectedContractId = '';
		selectedContractObj = null;
		selectedJobId = '';
		selectedJobObj = null;
	}

	function onJobChange(selected: any) {
		selectedJobObj = selected;
		selectedJobId = selected ? selected.value : '';
	}

	let isSaving = false;

	let showAddressModal = false;
	let addressModalMode: 'list' | 'form' = 'list';
	let isSavingAddress = false;
	let isDeletingAddressId: number | null = null;
	let toastMessage = '';

	let addressFormData = {
		id: null as number | null,
		name: '',
		address_line: '',
		contact_name: '',
		contact_phone: ''
	};

	function showToast(msg: string) {
		toastMessage = msg;
		setTimeout(() => (toastMessage = ''), 3000);
	}

	function openAddressModal() {
		showAddressModal = true;
		addressModalMode = 'list';
	}

	function closeAddressModal() {
		showAddressModal = false;
		addressModalMode = 'list';
		resetAddressForm();
	}

	function resetAddressForm() {
		addressFormData = { id: null, name: '', address_line: '', contact_name: '', contact_phone: '' };
	}

	function startAddAddress() {
		resetAddressForm();
		addressModalMode = 'form';
	}

	function startEditAddress(address: any) {
		addressFormData = { ...address };
		addressModalMode = 'form';
	}

	function selectAddress(id: number) {
		selectedDeliveryAddressId = id;
		closeAddressModal();
	}
</script>

<svelte:head>
	<title>{$t('Edit')} {$t('DocType_' + document?.document_type)} {document?.document_number}</title>
</svelte:head>

<div class="mx-auto max-w-7xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6 mb-10">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">
			{$t('Edit')}
			{$t('DocType_' + document?.document_type)}:
			<span class="text-indigo-600">{document?.document_number}</span>
		</h1>
		<span class="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
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
		<!-- 🌟 หัวเอกสาร (Header Form) ดึงกลับมาครบถ้วนเหมือนหน้า Create แล้ว -->
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
					class="w-full rounded-md border-gray-300 bg-gray-100 text-lg font-semibold text-gray-500 shadow-sm"
				/>
			</div>

			<div class="relative z-[50]">
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
			<div class="relative z-[45]">
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

			<!-- Vendor Contract -->
			<div class="relative z-[42]">
				<label for="contract_id" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Vendor Contract')}</label
				>
				<Select
					items={contractOptionsList}
					value={selectedContractObj}
					on:change={(e) => {
						selectedContractObj = e.detail;
						selectedContractId = e.detail ? e.detail.value : '';
					}}
					on:clear={() => {
						selectedContractObj = null;
						selectedContractId = '';
					}}
					placeholder={$t('-- Select Contract --')}
					container={browser ? document.body : null}
					disabled={!selectedVendorId || filteredContracts.length === 0}
					--inputStyles="padding: 2px 0; font-size: 0.875rem;"
					--list="border-radius: 6px; font-size: 0.875rem;"
					--itemIsActive="background: #e0f2fe;"
				/>
				<input type="hidden" name="contract_id" value={selectedContractId} />
			</div>

			<!-- Job Order -->
			<div class="relative z-[40]">
				<label for="job_id" class="mb-1 block text-sm font-medium text-gray-700">
					{$t('Reference Job Order')}
				</label>
				<Select
					id="job_id"
					items={jobOrderOptions}
					value={selectedJobObj}
					on:change={(e) => onJobChange(e.detail)}
					on:clear={() => onJobChange(null)}
					placeholder={$t('-- Select Job Order --')}
					container={browser ? document.body : null}
					--inputStyles="padding: 2px 0; font-size: 0.875rem;"
					--list="border-radius: 6px; font-size: 0.875rem;"
					--itemIsActive="background: #e0f2fe;"
				/>
				<input type="hidden" name="job_id" value={selectedJobId} />
			</div>

			<!-- Delivery Address -->
			<div class="relative z-[20] md:col-span-1">
				<div class="mb-1 flex items-center justify-between">
					<label for="delivery_address_id" class="block text-sm font-medium text-gray-700"
						>{$t('Delivery Address')}</label
					>
					<button
						type="button"
						on:click={openAddressModal}
						class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 focus:outline-none"
					>
						{$t('+ Manage Addresses')}
					</button>
				</div>
				<select
					id="delivery_address_id"
					name="delivery_address_id"
					bind:value={selectedDeliveryAddressId}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500"
				>
					<option value="">{$t('Not specified')}</option>
					{#each localAddresses as address}
						<option value={address.id}
							>{address.name} {address.contact_name ? `(${address.contact_name})` : ''}</option
						>
					{/each}
				</select>
			</div>

			<!-- Dates Setup -->
			<div class="relative z-[30] grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-4">
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
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500"
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
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500"
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
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500"
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
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500"
					/>
				</div>
			</div>

			<div class="relative z-[20] md:col-span-1">
				<label for="reference_doc" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Other Reference (PO/Ref)')}</label
				>
				<input
					type="text"
					id="reference_doc"
					name="reference_doc"
					bind:value={referenceDoc}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500"
					placeholder={$t('e.g. PR-2023...')}
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
										bind:value={item.vat_type}
										class="w-full rounded-md border-blue-200 bg-blue-50 py-1.5 text-center text-sm font-bold text-blue-700"
									>
										<option value={1}>Inc Vat</option>
										<option value={2}>Exc Vat</option>
										<option value={3}>Non Vat</option>
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
										<button type="button" on:click={() => removeItem(index)} class="text-red-500 hover:text-red-700">❌</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<button type="button" on:click={addItem} class="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
				>{$t('Add Item')}</button
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
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500"
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
										class="max-w-[200px] truncate text-indigo-600 hover:underline"
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
							class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700"
						/>
					</div>
				</div>
			</div>

			<div
				class="h-fit w-full space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-inner md:w-1/3"
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
						{$t('VAT')} <span class="ml-1 text-xs text-gray-500">(Auto 7%)</span>
					</span>
					<span class="font-medium text-green-600">+{formatNumber(vatAmount)}</span>
					<input type="hidden" name="vat_rate" value={vatRate} />
					<input type="hidden" name="vat_amount" value={vatAmount} />
				</div>
				<div
					class="flex items-center justify-between border-b border-gray-200 pb-2 text-sm text-red-600"
				>
					<span class="font-medium">{$t('Total WHT')}</span><span class="font-bold"
						>-{formatNumber(whtAmount)}</span
					>
					<input type="hidden" name="wht_amount" value={whtAmount} />
				</div>
				<div class="flex justify-between pt-2 text-lg font-black text-gray-900">
					<span>{$t('Grand Total')}</span><span class="text-indigo-700"
						>{formatNumber(grandTotal)}</span
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
				href="/purchase-documents/{document?.id}"
				class="rounded-md border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
				>{$t('Cancel')}</a
			>
			<button
				type="submit"
				disabled={isSaving}
				class="flex items-center rounded-md bg-indigo-600 px-8 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
			>
				{#if isSaving}{$t('Saving...')}{:else}{$t('Save Changes')}{/if}
			</button>
		</div>
	</form>
</div>

<!-- Modal Manage Delivery Addresses -->
{#if showAddressModal}
	<div class="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4 transition-opacity">
		<div class="fixed inset-0" on:click={closeAddressModal} role="presentation"></div>
		<div class="relative flex max-h-[90vh] w-full max-w-2xl transform flex-col overflow-hidden rounded-xl bg-white shadow-2xl transition-all">
			<div class="flex flex-shrink-0 items-center justify-between border-b bg-gray-50 px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{addressModalMode === 'list' ? $t('Select or Manage Delivery Address') : addressFormData.id ? $t('Edit Delivery Address') : $t('Add New Delivery Address')}
				</h2>
				<button type="button" on:click={closeAddressModal} class="text-xl font-bold text-gray-400 hover:text-gray-600">&times;</button>
			</div>

			<div class="flex-1 overflow-y-auto p-6">
				{#if addressModalMode === 'list'}
					<div class="mb-4 flex justify-end">
						<button type="button" on:click={startAddAddress} class="rounded-md bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-100">{$t('+ Add New Address')}</button>
					</div>

					{#if localAddresses.length === 0}
						<div class="rounded-lg border border-dashed py-8 text-center text-gray-500">{$t('No delivery address found')}</div>
					{:else}
						<div class="space-y-3">
							{#each localAddresses as addr}
								<div class="flex items-start justify-between rounded-lg border border-gray-200 p-4 transition-colors hover:border-indigo-300 hover:bg-indigo-50/30">
									<div class="flex-1 pr-4">
										<h4 class="font-bold text-gray-900">{addr.name}</h4>
										<p class="mt-1 text-sm whitespace-pre-wrap text-gray-600">{addr.address_line}</p>
										<div class="mt-2 text-xs text-gray-500">
											{#if addr.contact_name}<span class="mr-3">{$t('Contact:')} <span class="font-semibold">{addr.contact_name}</span></span>{/if}
											{#if addr.contact_phone}<span>{$t('Tel:')} <span class="font-semibold">{addr.contact_phone}</span></span>{/if}
										</div>
									</div>
									<div class="flex shrink-0 flex-col gap-2 border-l pl-4">
										<button type="button" on:click={() => selectAddress(addr.id)} class="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">{$t('Select')}</button>
										<button type="button" on:click={() => startEditAddress(addr)} class="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">{$t('Edit')}</button>

										<form method="POST" action="?/deleteAddress" use:enhance={() => {
												isDeletingAddressId = addr.id;
												return async ({ result, update }) => {
													isDeletingAddressId = null;
													if (result.type === 'success') {
														const actionData = result.data as Record<string, any>;
														if (actionData && actionData.deletedId) {
															localAddresses = localAddresses.filter((a: any) => a.id !== actionData.deletedId);
															if (selectedDeliveryAddressId == actionData.deletedId) selectedDeliveryAddressId = '';
															showToast($t('Address deleted successfully'));
														}
													}
													await update({ reset: false });
												};
											}}>
											<input type="hidden" name="id" value={addr.id} />
											<button type="submit" disabled={isDeletingAddressId === addr.id} class="w-full rounded border border-red-200 px-3 py-1.5 text-center text-xs font-semibold text-red-600 hover:border-red-300 hover:bg-red-50 disabled:opacity-50">
												{isDeletingAddressId === addr.id ? '...' : $t('Delete')}
											</button>
										</form>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{:else}
					<form method="POST" action={addressFormData.id ? '?/updateAddress' : '?/createAddress'} use:enhance={() => {
							isSavingAddress = true;
							return async ({ result, update }) => {
								isSavingAddress = false;
								if (result.type === 'success') {
									const actionData = result.data as Record<string, any>;
									if (actionData && actionData.address) {
										const savedAddress = actionData.address as any;
										if (addressFormData.id) {
											const idx = localAddresses.findIndex((a: any) => a.id === savedAddress.id);
											if (idx !== -1) localAddresses[idx] = savedAddress;
											showToast($t('Address updated successfully'));
										} else {
											localAddresses = [...localAddresses, savedAddress];
											selectedDeliveryAddressId = savedAddress.id;
											showToast($t('Address added successfully'));
										}
										addressModalMode = 'list';
									}
								} else if (result.type === 'failure') {
									const actionData = result.data as Record<string, any>;
									alert(actionData?.message || $t('Error'));
								}
								await update({ reset: false });
							};
						}}>
						{#if addressFormData.id}<input type="hidden" name="id" value={addressFormData.id} />{/if}

						<div class="space-y-4">
							<div>
								<label for="addr_name" class="block text-sm font-medium text-gray-700">{$t('Location Name')} <span class="text-red-500">*</span></label>
								<input type="text" name="name" id="addr_name" bind:value={addressFormData.name} placeholder={$t('e.g. HQ, Warehouse A')} required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
							</div>
							<div>
								<label for="addr_line" class="block text-sm font-medium text-gray-700">{$t('Address Details')} <span class="text-red-500">*</span></label>
								<textarea name="address_line" id="addr_line" rows="3" bind:value={addressFormData.address_line} placeholder={$t('Address Format Placeholder')} required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"></textarea>
							</div>
							<div class="grid grid-cols-2 gap-4">
								<div>
									<label for="contact_name" class="block text-sm font-medium text-gray-700">{$t('Receiver Contact Name')}</label>
									<input type="text" name="contact_name" id="contact_name" bind:value={addressFormData.contact_name} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
								</div>
								<div>
									<label for="contact_phone" class="block text-sm font-medium text-gray-700">{$t('Phone Number')}</label>
									<input type="text" name="contact_phone" id="contact_phone" bind:value={addressFormData.contact_phone} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
								</div>
							</div>
						</div>

						<div class="mt-6 flex justify-end gap-3 border-t pt-4">
							<button type="button" on:click={() => (addressModalMode = 'list')} class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50">{$t('Back')}</button>
							<button type="submit" disabled={isSavingAddress} class="rounded-md bg-indigo-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">
								{isSavingAddress ? $t('Saving...') : addressFormData.id ? $t('Save Changes') : $t('Add Address')}
							</button>
						</div>
					</form>
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if toastMessage}
	<div class="animate-in fade-in slide-in-from-top-4 fixed top-6 right-6 z-[200] flex items-center gap-3 rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white shadow-xl">
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
		{toastMessage}
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
	:global(.selectContainer) {
		overflow: visible !important;
	}
</style>