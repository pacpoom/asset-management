<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { t, locale } from '$lib/i18n';

	export let data: PageData;
	$: ({ vendors, vendorContacts, units, jobOrders, prefillData, vendorContractsData } = data);
	
	let localProducts = data.products || [];
	let localAddresses = data.deliveryAddresses || [];

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
	let deliveryDate = '';

	let selectedVendorObj: any = null;
	let selectedVendorId: string | number = '';
	
	let selectedContactObj: any = null;
	let selectedContactId: string | number = '';

	let selectedJobObj: any = null;
	let selectedJobId: string | number = '';
	
	let selectedContractObj: any = null;
	let selectedContractId: string | number = '';

	let selectedDeliveryAddressId: string | number = '';

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
			vat_type: 2 // 1=Inc Vat, 2=Exc Vat, 3=Non Vat
		}
	];

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
		
	$: contractOptions = filteredContracts.map((c: any) => ({
		value: c.id,
		label: `${c.title} ${c.contract_number ? `(${c.contract_number})` : ''}`
	}));

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

	$: if (selectedContractId && contractOptions.length > 0) {
		if (!selectedContractObj || selectedContractObj.value !== selectedContractId) {
			selectedContractObj = contractOptions.find((c: any) => c.value == selectedContractId) || null;
		}
	} else if (!selectedContractId) {
		selectedContractObj = null;
	}

	onMount(() => {
		if (prefillData) {
			documentType = prefillData.targetType;
			referenceDoc = `${$locale === 'en' ? 'Ref:' : 'อ้างอิง:'} ${prefillData.document.document_number}`;

			selectedVendorId = prefillData.document.vendor_id;
			selectedVendorObj = vendorOptions.find((v: any) => v.value == selectedVendorId) || null;
			
			selectedContactId = prefillData.document.vendor_contact_id || '';
			selectedContractId = prefillData.document.contract_id || '';
			selectedDeliveryAddressId = prefillData.document.delivery_address_id || '';

			setTimeout(() => {
				selectedJobId = prefillData.document.job_id || '';
				selectedJobObj = jobOrderOptions.find((j: any) => j.value == selectedJobId) || null;
			}, 50);

			creditTerm = prefillData.document.credit_term;
			deliveryDate = prefillData.document.delivery_date ? new Date(prefillData.document.delivery_date).toISOString().split('T')[0] : '';
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
						vat_type: item.vat_type !== undefined ? Number(item.vat_type) : (item.is_vat ? 2 : 3)
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
		
		selectedContactId = ''; 
		selectedContactObj = null;
		selectedJobId = '';
		selectedJobObj = null;
		selectedContractId = '';
		selectedContractObj = null;
	}

	// === ระบบคำนวณภาษี 3 รูปแบบ ===
	$: subtotal = items.reduce((sum, item) => sum + (item.line_total || 0), 0);
	$: discountRatio = subtotal > 0 ? (discountAmount / subtotal) : 0;
	$: totalAfterDiscount = Math.max(0, subtotal - discountAmount);

	// คำนวณ VAT Exc (ภาษีมูลค่าเพิ่มที่ต้องบวกเพิ่มจากยอด)
	$: addedVat = items.reduce((sum, item) => {
		if (Number(item.vat_type) === 2) { // 2 = Exc Vat
			const discountedLineTotal = (item.line_total || 0) * (1 - discountRatio);
			return sum + (discountedLineTotal * vatRate / 100);
		}
		return sum;
	}, 0);

	// คำนวณ VAT Inc (ภาษีมูลค่าเพิ่มที่แฝงอยู่ในยอด ถอดออกมาเพื่อโชว์เฉยๆ)
	$: extractedVat = items.reduce((sum, item) => {
		if (Number(item.vat_type) === 1) { // 1 = Inc Vat
			const discountedLineTotal = (item.line_total || 0) * (1 - discountRatio);
			return sum + (discountedLineTotal - (discountedLineTotal * 100 / (100 + vatRate)));
		}
		return sum;
	}, 0);

	// VAT รวมทั้งเอกสาร (เพื่อไปแสดงผล)
	$: vatAmount = addedVat + extractedVat;
	
	// หัก ณ ที่จ่าย (WHT) ต้องคิดจากยอด "ก่อน VAT" เท่านั้น
	$: whtAmount = items.reduce((sum, item) => {
		const rate = item.wht_rate || 0;
		if (rate === 0) return sum;

		const discountedLineTotal = (item.line_total || 0) * (1 - discountRatio);
		let baseAmountForWht = discountedLineTotal;
		
		if (Number(item.vat_type) === 1) { // ถ้ารวม VAT แล้ว ต้องถอด VAT ออกก่อนคิด WHT
			baseAmountForWht = discountedLineTotal * 100 / (100 + vatRate);
		}
		return sum + (baseAmountForWht * rate / 100);
	}, 0);

	// ยอดสุทธิ = (ยอดรวมหลังหักส่วนลด) + (VAT ที่ต้องบวกเพิ่ม) - หัก ณ ที่จ่าย
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
			items[index].vat_type = 2; // Default Exc Vat
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

	// 🌟 ระบบ Address Management
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

<div class="mx-auto max-w-7xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6 mb-10">
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
					items={contractOptions}
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

			<!-- Delivery Address Dropdown + Button Modal -->
			<div class="relative z-[20] md:col-span-1">
				<div class="mb-1 flex items-center justify-between">
					<label for="delivery_address_id" class="block text-sm font-medium text-gray-700"
						>{$t('Delivery Address')}</label
					>
					<button
						type="button"
						on:click={openAddressModal}
						class="text-xs font-semibold text-blue-600 hover:text-blue-800 focus:outline-none"
					>
						{$t('+ Manage Addresses')}
					</button>
				</div>
				<select
					id="delivery_address_id"
					name="delivery_address_id"
					bind:value={selectedDeliveryAddressId}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500"
				>
					<option value="">{$t('Not specified')}</option>
					{#each localAddresses as address}
						<option value={address.id}
							>{address.name} {address.contact_name ? `(${address.contact_name})` : ''}</option
						>
					{/each}
				</select>
			</div>

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

			<div class="relative z-[20] md:col-span-1">
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
							<th class="w-25 px-4 py-2 text-left font-medium">{$t('Product/Service')}</th>
							<th class="px-2 py-2 text-left font-bold">{$t('Description')}</th>
							<th class="w-30 px-3 py-2 text-right">{$t('Quantity')}</th>
							<th class="w-30 px-3 py-2 text-center">{$t('Unit')}</th>
							<th class="w-35 px-3 py-2 text-right">{$t('Unit Price')}</th>
							<th class="w-35 px-3 py-2 text-center text-blue-600">{$t('VAT')}</th>
							<th class="w-28 px-3 py-2 text-center text-red-600">{$t('WHT')}</th>
							<th class="w-32 px-3 py-2 text-right">{$t('Total')}</th>
							<th class="w-3 px-3 py-2"></th>
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
										rows="2"
										class="w-full rounded-md border-gray-300 text-sm min-h-[38px] resize-y"
										required
									></textarea>
								</td>
								<td class="px-2 py-2">
									<input
										type="number"
										bind:value={item.quantity}
										on:input={() => updateLineTotal(index)}
										min="1"
										class="w-full rounded-md border-gray-300 text-right text-sm"
										required
									/>
								</td>
								<td class="px-2 py-2">
									<select
										bind:value={item.unit_id}
										class="w-full rounded-md border-gray-300 py-1.5 text-center text-sm"
									>
										<option value={null}>-</option>
										{#each units as u}<option value={u.id}>{u.symbol}</option>{/each}
									</select>
								</td>
								<td class="px-2 py-2">
									<input
										type="number"
										step="0.01"
										bind:value={item.unit_price}
										on:input={() => updateLineTotal(index)}
										class="w-full rounded-md border-gray-300 text-right text-sm"
										required
									/>
								</td>
								<td class="px-1 py-1">
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

		<div class="flex justify-end gap-3 border-t border-gray-200 pt-6">
			<a
				href="/purchase-documents"
				class="rounded-md border bg-white px-6 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
				>{$t('Cancel')}</a
			>
			<button
				type="submit"
				disabled={isSaving}
				class="rounded-md bg-blue-600 px-8 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
			>
				{isSaving ? $t('Saving...') : $t('Save Document')}
			</button>
		</div>
	</form>
</div>

<!-- 🌟 Modal Manage Delivery Addresses -->
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
						<button type="button" on:click={startAddAddress} class="rounded-md bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-100">{$t('+ Add New Address')}</button>
					</div>

					{#if localAddresses.length === 0}
						<div class="rounded-lg border border-dashed py-8 text-center text-gray-500">{$t('No delivery address found')}</div>
					{:else}
						<div class="space-y-3">
							{#each localAddresses as addr}
								<div class="flex items-start justify-between rounded-lg border border-gray-200 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/30">
									<div class="flex-1 pr-4">
										<h4 class="font-bold text-gray-900">{addr.name}</h4>
										<p class="mt-1 text-sm whitespace-pre-wrap text-gray-600">{addr.address_line}</p>
										<div class="mt-2 text-xs text-gray-500">
											{#if addr.contact_name}<span class="mr-3">{$t('Contact:')} <span class="font-semibold">{addr.contact_name}</span></span>{/if}
											{#if addr.contact_phone}<span>{$t('Tel:')} <span class="font-semibold">{addr.contact_phone}</span></span>{/if}
										</div>
									</div>
									<div class="flex shrink-0 flex-col gap-2 border-l pl-4">
										<button type="button" on:click={() => selectAddress(addr.id)} class="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">{$t('Select')}</button>
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
								<input type="text" name="name" id="addr_name" bind:value={addressFormData.name} placeholder={$t('e.g. HQ, Warehouse A')} required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
							</div>
							<div>
								<label for="addr_line" class="block text-sm font-medium text-gray-700">{$t('Address Details')} <span class="text-red-500">*</span></label>
								<textarea name="address_line" id="addr_line" rows="3" bind:value={addressFormData.address_line} placeholder={$t('Address Format Placeholder')} required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"></textarea>
							</div>
							<div class="grid grid-cols-2 gap-4">
								<div>
									<label for="contact_name" class="block text-sm font-medium text-gray-700">{$t('Receiver Contact Name')}</label>
									<input type="text" name="contact_name" id="contact_name" bind:value={addressFormData.contact_name} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
								</div>
								<div>
									<label for="contact_phone" class="block text-sm font-medium text-gray-700">{$t('Phone Number')}</label>
									<input type="text" name="contact_phone" id="contact_phone" bind:value={addressFormData.contact_phone} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
								</div>
							</div>
						</div>

						<div class="mt-6 flex justify-end gap-3 border-t pt-4">
							<button type="button" on:click={() => (addressModalMode = 'list')} class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50">{$t('Back')}</button>
							<button type="submit" disabled={isSavingAddress} class="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
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