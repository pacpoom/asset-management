<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { t } from '$lib/i18n';

	export let data;

	interface Customer {
		id: number;
		name: string;
		company_name: string | null;
		address: string | null;
	}

	interface Contract {
		id: number;
		customer_id: number;
		contract_number: string;
		title: string;
	}

	interface Liner {
		name: string;
		code: string | null;
	}

	interface Vendor {
		id: number;
		name: string;
		company_name: string | null;
		address: string | null;
	}

	interface VendorContract {
		id: number;
		vendor_id: number;
		contract_number: string;
		title: string;
		contract_value: number;
	}

	interface Currency {
		code: string;
		name?: string;
		symbol?: string;
	}

	interface SelectOption {
		value: string | number;
		label: string;
		address?: string | null;
		amount?: number;
	}

	$: customerOptions = data.customers.map((c: Customer) => ({
		value: c.id,
		label: c.company_name ? `${c.company_name} (${c.name})` : c.name,
		address: c.address
	}));
	$: allContracts = data.contracts || [];
	$: filteredContracts = selectedCustomer
		? allContracts
				.filter((c: Contract) => c.customer_id == selectedCustomer?.value)
				.map((c: Contract) => ({ value: c.id, label: `${c.contract_number} (${c.title})` }))
		: [];

	$: linerOptions = data.liners.map((l: Liner) => ({
		value: l.name,
		label: l.code ? `${l.name} (${l.code})` : l.name
	}));

	let selectedLiner: SelectOption | null = null;

	let jobAmount: number | string = '';

	let isSaving = false;
	let selectedCustomer: SelectOption | null = null;
	let selectedContract: SelectOption | null = null;
	
	let jobDate = new Date().toISOString().split('T')[0];
	let expireDate = '';
	let isExpireDateManual = false;

	// คำนวณ Expire Date ให้เป็น 1 เดือนหลังจาก Job Date อัตโนมัติ (หากผู้ใช้ยังไม่ได้เลือกเปลี่ยนเอง)
	$: if (jobDate && !isExpireDateManual) {
		const [year, month, day] = jobDate.split('-').map(Number);
		// Date(year, monthIndex, day) โดยที่ monthIndex เริ่มจาก 0
		// การใช้ month (1-12) ปกติใส่เข้าไปเป็นค่าเดือน จะถือเป็นการบวกไป 1 เดือนพอดี
		const nextMonthDate = new Date(year, month, day);
		
		const yyyy = nextMonthDate.getFullYear();
		const mm = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
		const dd = String(nextMonthDate.getDate()).padStart(2, '0');
		
		expireDate = `${yyyy}-${mm}-${dd}`;
	}

	type JobTypeOption = { value: string; label: string };

	let jobTypeOptions: JobTypeOption[] = [
		{ value: 'SI', label: 'SI (Sea Import)' },
		{ value: 'SE', label: 'SE (Sea Export)' },
		{ value: 'AI', label: 'AI (Air Import)' },
		{ value: 'AF', label: 'AF (Air Freight)' },
		{ value: 'SP', label: 'SP (Special Project)' }
	];

	let selectedJobType: JobTypeOption = jobTypeOptions[0];
	$: padding = data?.paddingLength ?? 4;
	$: nextSeqNum = data?.nextSequence ?? 1;

	$: activeCurrencies = (
		data?.currencies && data.currencies.length > 0
			? data.currencies
			: [{ code: 'THB' }, { code: 'USD' }, { code: 'CNY' }]
	) as Currency[];

	let selectedCurrency = 'THB';
	$: parsedDate = jobDate ? new Date(jobDate) : new Date();
	$: yy = String(parsedDate.getFullYear()).slice(-2);
	$: mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
	$: jobCodeVal = selectedJobType?.value || 'SI';
	$: nextNumPadded = String(nextSeqNum).padStart(padding, '0');
	$: previewJobNumber = `${jobCodeVal}${yy}${mm}${nextNumPadded}`;

	let serviceTypeOptions = [
		{ value: 'Import', label: 'Import' },
		{ value: 'Export', label: 'Export' },
		{ value: 'Cross-Trade', label: 'Cross-Trade' }
	];

	let isManageModalOpen = false;
	let manageModalType: 'jobCode' | 'serviceType' | null = null;
	let manageValue = '';
	let manageLabel = '';
	let editingIndex: number | null = null;

	let toastMessage = '';
	let toastType: 'success' | 'error' = 'success';
	let showDeleteConfirm = false;
	let deleteTargetIndex: number | null = null;

	function showToast(message: string, type: 'success' | 'error' = 'success') {
		toastMessage = message;
		toastType = type;
		setTimeout(() => {
			toastMessage = '';
		}, 3000);
	}

	function openManageModal(type: 'jobCode' | 'serviceType') {
		manageModalType = type;
		isManageModalOpen = true;
		resetManageForm();
	}

	function closeManageModal() {
		isManageModalOpen = false;
		manageModalType = null;
	}

	function resetManageForm() {
		manageValue = '';
		manageLabel = '';
		editingIndex = null;
	}

	function saveManageOption() {
		if (!manageLabel) {
			showToast($t('Please specify a Label to continue'), 'error');
			return;
		}

		const valueToSave = manageValue || manageLabel;

		if (manageModalType === 'jobCode') {
			if (editingIndex !== null) {
				jobTypeOptions[editingIndex] = { value: valueToSave, label: manageLabel };
			} else {
				jobTypeOptions = [...jobTypeOptions, { value: valueToSave, label: manageLabel }];
			}
		} else if (manageModalType === 'serviceType') {
			if (editingIndex !== null) {
				serviceTypeOptions[editingIndex] = { value: valueToSave, label: manageLabel };
			} else {
				serviceTypeOptions = [...serviceTypeOptions, { value: valueToSave, label: manageLabel }];
			}
		}

		const successMsg =
			editingIndex !== null ? $t('Data updated successfully') : $t('Added to system successfully');

		resetManageForm();
		showToast(successMsg, 'success');
	}

	function editManageOption(index: number) {
		editingIndex = index;
		const targetArray = manageModalType === 'jobCode' ? jobTypeOptions : serviceTypeOptions;
		manageValue = targetArray[index].value;
		manageLabel = targetArray[index].label;
	}

	function confirmDeleteOption(index: number) {
		deleteTargetIndex = index;
		showDeleteConfirm = true;
	}

	function cancelDeleteOption() {
		showDeleteConfirm = false;
		deleteTargetIndex = null;
	}

	function executeDeleteOption() {
		if (deleteTargetIndex === null) return;

		if (manageModalType === 'jobCode') {
			jobTypeOptions = jobTypeOptions.filter((_, i) => i !== deleteTargetIndex);
		} else if (manageModalType === 'serviceType') {
			serviceTypeOptions = serviceTypeOptions.filter((_, i) => i !== deleteTargetIndex);
		}

		showDeleteConfirm = false;
		deleteTargetIndex = null;
		showToast($t('Option deleted successfully'), 'success');
	}

	$: vendorOptions = (data.vendors || []).map((v: Vendor) => ({
		value: v.id,
		label: v.company_name ? `${v.company_name} (${v.name})` : v.name,
		address: v.address
	}));

	let allVendorContracts = data.vendorContracts || [];
	let selectedVendor: SelectOption | null = null;
	let selectedVendorContract: SelectOption | null = null;

	$: filteredVendorContracts = selectedVendor
		? allVendorContracts
				.filter((c: VendorContract) => c.vendor_id == selectedVendor?.value)
				.map((c: VendorContract) => ({
					value: c.id,
					label: `${c.contract_number} (${c.title})`,
					amount: c.contract_value
				}))
		: [];
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
{#if toastMessage}
	<div
		class="animate-in fade-in slide-in-from-top-4 fixed top-6 right-6 z-[70] flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold shadow-xl {toastType ===
		'success'
			? 'bg-green-600 text-white'
			: 'bg-red-500 text-white'}"
	>
		{#if toastType === 'success'}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		{:else}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		{/if}
		{toastMessage}
	</div>
{/if}

<div class="min-h-screen bg-gray-100 p-6 pb-20">
	<div class="mx-auto mb-6 flex max-w-7xl items-center justify-between">
		<div class="flex items-center gap-4">
			<a
				href="/freight-forwarder/job-orders"
				title={$t('Back')}
				aria-label="Back to Job Orders"
				class="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm transition-colors hover:bg-blue-50 hover:text-blue-600"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					class="h-5 w-5"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
					/></svg
				>
			</a>
			<div>
				<div class="flex items-center gap-2">
					<h1 class="text-xl font-bold text-gray-800">{$t('New Job Order')}</h1>
					<span
						class="rounded border border-blue-200 bg-blue-100 px-2 py-0.5 text-sm font-bold tracking-wider text-blue-700 shadow-sm"
					>
						{previewJobNumber}
					</span>
				</div>
				<p class="text-xs text-gray-500">{$t('Create New Job')}</p>
			</div>
		</div>
		<div class="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
			STATUS: PENDING
		</div>
	</div>

	<div
		class="mx-auto max-w-7xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
	>
		<div class="h-1.5 w-full bg-blue-600"></div>

		<form
			method="POST"
			action="?/create"
			enctype="multipart/form-data"
			use:enhance={() => {
				isSaving = true;

				return async ({ update, result }) => {
					await update();
					isSaving = false;
					if (result.type === 'success') {
						goto('/freight-forwarder/job-orders');
					}
				};
			}}
		>
			<div class="divide-y divide-gray-100">
				<div class="grid grid-cols-1 gap-8 p-8 lg:grid-cols-2">
					<!-- คอลัมน์ซ้าย: ข้อมูลลูกค้าและผู้จำหน่าย -->
					<div class="space-y-6">
						<div class="rounded-lg border border-blue-100 bg-blue-50/30 p-4">
							<h2 class="mb-4 text-xs font-bold tracking-wider text-blue-800 uppercase">
								{$t('Customer Information')}
							</h2>
							<div class="space-y-4">
								<div>
									<div class="mb-1.5 block text-sm font-semibold text-gray-700">
										{$t('Customer')} <span class="text-red-500">*</span>
									</div>
									<Select
										items={customerOptions}
										bind:value={selectedCustomer}
										placeholder={$t('Search customer...')}
										container={browser ? document.body : null}
										class="svelte-select-custom"
									/>
									<input
										type="hidden"
										name="customer_id"
										value={selectedCustomer?.value || ''}
										required
									/>
								</div>

								{#if selectedCustomer}
									<div
										class="animate-in fade-in slide-in-from-top-1 rounded-lg border border-gray-100 bg-white p-3 text-sm text-gray-600 shadow-sm"
									>
										<p class="font-bold text-gray-800">{selectedCustomer.label}</p>
										<p class="mt-1 text-xs">{selectedCustomer.address || '-'}</p>
									</div>
								{/if}

								<div>
									<div class="mb-1.5 block text-sm font-semibold text-gray-700">
										{$t('Contract')} ({$t('Optional')})
									</div>
									<Select
										items={filteredContracts}
										bind:value={selectedContract}
										placeholder={selectedCustomer ? $t('Select contract') : '-'}
										disabled={!selectedCustomer}
										container={browser ? document.body : null}
										class="svelte-select-custom"
									/>
									<input type="hidden" name="contract_id" value={selectedContract?.value || ''} />
								</div>
							</div>
						</div>

						<div class="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
							<h2 class="mb-4 text-xs font-bold tracking-wider text-gray-600 uppercase">
								{$t('Vendor Information')}
								<span class="font-normal text-gray-400 normal-case">({$t('Optional')})</span>
							</h2>
							<div class="space-y-4">
								<div>
									<div class="mb-1.5 block text-sm font-semibold text-gray-700">
										{$t('Vendor')}
									</div>
									<Select
										items={vendorOptions}
										bind:value={selectedVendor}
										placeholder={$t('Search vendor (if any)...')}
										container={browser ? document.body : null}
										class="svelte-select-custom"
									/>
									<input type="hidden" name="vendor_id" value={selectedVendor?.value || ''} />
								</div>

								{#if selectedVendor}
									<div
										class="animate-in fade-in slide-in-from-top-1 rounded-lg border border-gray-100 bg-white p-3 text-sm text-gray-600 shadow-sm"
									>
										<p class="font-bold text-gray-800">{selectedVendor.label}</p>
										<p class="mt-1 text-xs">{selectedVendor.address || '-'}</p>
									</div>
								{/if}

								<div>
									<div class="mb-1.5 block text-sm font-semibold text-gray-700">
										{$t('Vendor Contract')}
									</div>
									<Select
										items={filteredVendorContracts}
										bind:value={selectedVendorContract}
										placeholder={selectedVendor ? $t('Select vendor contract') : '-'}
										disabled={!selectedVendor}
										container={browser ? document.body : null}
										class="svelte-select-custom"
									/>
									<input
										type="hidden"
										name="vendor_contract_id"
										value={selectedVendorContract?.value || ''}
									/>
								</div>
							</div>
						</div>
					</div>

					<!-- คอลัมน์ขวา: ข้อมูลประเภทและสถานะของ Job -->
					<div class="space-y-5 rounded-lg border border-gray-100 bg-gray-50/50 p-5">
						<h2 class="text-xs font-bold tracking-wider text-gray-400 uppercase">
							{$t('Job Details')}
						</h2>

						<div class="grid grid-cols-2 gap-4">
							<div>
								<label for="job_date" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Job Date')}</label
								>
								<input
									id="job_date"
									type="date"
									name="job_date"
									bind:value={jobDate}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
								/>
							</div>
							<div>
								<label for="expire_date" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Expire Date')}</label
								>
								<input
									id="expire_date"
									type="date"
									name="expire_date"
									bind:value={expireDate}
									on:change={() => (isExpireDateManual = true)}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
								/>
							</div>
						</div>

						<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
							<div>
								<div class="mb-1.5 block text-sm font-semibold text-gray-700">
									{$t('Job Code')} <span class="text-red-500">*</span>
								</div>
								<div class="flex items-start gap-2">
									<div class="min-w-0 flex-grow">
										<Select
											items={jobTypeOptions}
											bind:value={selectedJobType}
											placeholder={$t('Select...')}
											container={browser ? document.body : null}
											class="svelte-select-custom"
											clearable={false}
										/>
										<input
											type="hidden"
											name="job_type"
											value={selectedJobType?.value || ''}
											required
										/>
									</div>
									<button
										type="button"
										on:click={() => openManageModal('jobCode')}
										class="flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none"
										title={$t('Manage Job Code options')}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
											/>
										</svg>
									</button>
								</div>
							</div>

							<div>
								<label for="service_type" class="mb-1.5 block text-sm font-semibold text-gray-700">
									{$t('Service Type')} <span class="text-red-500">*</span>
								</label>
								<div class="flex items-start gap-2">
									<select
										id="service_type"
										name="service_type"
										class="w-full flex-grow rounded-md border-gray-300 font-medium text-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
										required
									>
										{#each serviceTypeOptions as option (option.value)}
											<option value={option.value}>{option.label}</option>
										{/each}
									</select>
									<button
										type="button"
										on:click={() => openManageModal('serviceType')}
										class="flex h-[38px] w-10 flex-shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none"
										title={$t('Manage Service Type options')}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
											/>
										</svg>
									</button>
								</div>
							</div>
						</div>

						<div>
							<label for="remarks" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Remark')}</label
							>
							<textarea
								id="remarks"
								name="remarks"
								rows="2"
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
								placeholder={$t('Enter remark...')}
							></textarea>
						</div>
					</div>
				</div>

				<div class="p-8 border-t border-gray-100">
					<h2 class="mb-4 border-b pb-2 text-sm font-bold tracking-wider text-gray-600 uppercase">
						{$t('Shipment Information')}
					</h2>
					<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
						
						<!-- แถวที่ 1: BL, MBL, Booking No. -->
						<div>
							<label for="bl_number" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
								>{$t('HBL Number')} <span class="text-red-500">*</span></label
							>
							<input id="bl_number" type="text" name="bl_number" placeholder="HBL-XXXXXXX" class="w-full rounded-md border-gray-300 p-2 font-mono text-sm font-bold uppercase focus:border-blue-500 focus:ring-blue-500" required />
						</div>
						<div>
							<label for="mbl" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
								>{$t('MB/L')}</label
							>
							<input id="mbl" type="text" name="mbl" placeholder="MBL-XXXXXXX" class="w-full rounded-md border-gray-300 p-2 font-mono text-sm font-bold uppercase focus:border-blue-500 focus:ring-blue-500" />
						</div>
						<div>
							<label for="booking_no" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
								>{$t('Booking No.')}</label
							>
							<input id="booking_no" type="text" name="booking_no" placeholder="BKG-XXXXXXX" class="w-full rounded-md border-gray-300 p-2 font-mono text-sm font-bold uppercase focus:border-blue-500 focus:ring-blue-500" />
						</div>

						<!-- แถวที่ 2: Invoice, CCL, Location (General) -->
						<div>
							<label for="invoice_no" class="mb-1 block text-xs font-bold text-gray-500 uppercase">
								{$t('Customer Invoice')}
							</label>
							<input type="text" id="invoice_no" name="invoice_no" placeholder={$t('e.g. INV-001, INV-002')} class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
						</div>
						<div>
							<label for="ccl" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
								>{$t('Declaration No.')}</label
							>
							<input id="ccl" type="text" name="ccl" placeholder={$t('Enter CCL info')} class="w-full rounded-md border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500" />
						</div>
						<div>
							<label for="location" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
								>{$t('Location')}</label
							>
							<input id="location" type="text" name="location" placeholder={$t('General Location')} class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
						</div>

						<!-- แถวที่ 3: ETD, ETA, Liner -->
						<div>
							<label for="etd" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
								>{$t('ETD (Date)')}</label
							>
							<input id="etd" type="date" name="etd" class="w-full rounded-md border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500" />
						</div>
						<div>
							<label for="eta" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
								>{$t('ETA (Date)')}</label
							>
							<input id="eta" type="date" name="eta" class="w-full rounded-md border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500" />
						</div>
						<div>
							<div class="mb-1 block text-xs font-bold text-gray-500 uppercase">
								{$t('Liner / Carrier')}
							</div>
							<Select items={linerOptions} bind:value={selectedLiner} placeholder={$t('Search or select liner...')} container={browser ? document.body : null} class="svelte-select-custom" />
							<input type="hidden" name="liner_name" value={selectedLiner?.value || ''} />
						</div>

						<!-- แถวที่ 4: Vessel, Feeder, Port of Loading -->
						<div>
							<label for="vessel" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
								>{$t('Vessel')}</label
							>
							<input id="vessel" type="text" name="vessel" placeholder={$t('Vessel Name')} class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
						</div>
						<div>
							<label for="feeder" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
								>{$t('Feeder')}</label
							>
							<input id="feeder" type="text" name="feeder" placeholder={$t('Feeder Name')} class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
						</div>
						<div>
							<label for="port_of_loading" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
								>{$t('Port of Loading')}</label
							>
							<input id="port_of_loading" type="text" name="port_of_loading" placeholder={$t('POL')} class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
						</div>

						<!-- แถวที่ 5: Port of Discharge และ Quantity/Weight/Volume Group -->
						<div>
							<label for="port_of_discharge" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
								>{$t('Port of Discharge')}</label
							>
							<input id="port_of_discharge" type="text" name="port_of_discharge" placeholder={$t('POD')} class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
						</div>

						<div class="col-span-1 md:col-span-2">
							<div class="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
								<div>
									<label for="quantity" class="mb-1 block text-xs font-bold text-gray-500 uppercase">{$t('Quantity & Unit')}</label>
									<div class="flex gap-2">
										<input id="quantity" type="number" name="quantity" min="0" placeholder="0" class="w-full rounded-md border-gray-300 p-2 text-right text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500" />
										<select name="unit_id" class="w-full rounded-md border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white">
											<option value="">{$t('Unit')}</option>
											{#each data.units as unit (unit.id)}
												<option value={unit.id}>{unit.name} ({unit.symbol})</option>
											{/each}
										</select>
									</div>
								</div>
								<div>
									<label for="weight" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
										>{$t('Weight')}</label
									>
									<input id="weight" type="number" name="weight" step="0.01" min="0" placeholder="0.00" class="w-full rounded-md border-gray-300 p-2 text-right text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white" />
								</div>
								<div>
									<label for="kgs_volume" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
										>{$t('KGS. Volume')}</label
									>
									<input id="kgs_volume" type="number" name="kgs_volume" step="0.01" min="0" placeholder="0.00" class="w-full rounded-md border-gray-300 p-2 text-right text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white" />
								</div>
							</div>
						</div>

						<!-- แถวที่ 6: Attachments -->
						<div class="col-span-1 mt-2 md:col-span-3">
							<label for="attachments" class="mb-1 block text-sm font-semibold text-gray-700">
								{$t('Attachments')}
							</label>
							<div
								class="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 transition-colors hover:bg-gray-100"
							>
								<input
									type="file"
									name="attachments"
									id="attachments"
									multiple
									class="block w-full cursor-pointer text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-200"
								/>
								<p class="mt-2 text-xs text-gray-500">
									{$t(
										'* You can upload multiple files (e.g., B/L, Commercial Invoice, Packing List)'
									)}
								</p>
							</div>
						</div>
					</div>
				</div>

				<div
					class="flex flex-col items-center justify-end gap-4 border-t border-gray-200 bg-gray-50 p-6 md:flex-row"
				>
					<div class="flex items-center gap-3">
						<label for="amount" class="text-sm font-semibold text-gray-700"
							>{$t('Initial Amount:')}</label
						>

						<div
							class="flex rounded-md border border-gray-300 bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
						>
							<select
								name="currency"
								id="currency"
								bind:value={selectedCurrency}
								class="w-24 border-0 bg-transparent py-2 pr-8 pl-3 text-sm font-medium text-gray-700 outline-none focus:ring-0"
							>
								{#each activeCurrencies as curr (curr.code)}
									<option value={curr.code} class="text-gray-900">
										{curr.code}
									</option>
								{/each}
							</select>

							<div class="w-px bg-gray-300"></div>

							<input
								type="number"
								name="amount"
								step="0.01"
								bind:value={jobAmount}
								placeholder="0.00"
								class="w-32 border-0 bg-transparent px-3 py-2 text-right text-sm font-bold text-blue-700 outline-none focus:ring-0"
							/>
						</div>
					</div>
				</div>

				<div
					class="flex items-center justify-end gap-3 border-t border-gray-200 bg-white px-8 py-5"
				>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a
						href="/freight-forwarder/job-orders"
						class="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-red-700"
					>
						{$t('Cancel')}
					</a>
					<button
						type="submit"
						disabled={isSaving}
						class="flex items-center gap-2 rounded-lg bg-blue-600 px-8 py-2.5 text-sm font-bold text-white shadow transition-all hover:bg-blue-700 disabled:opacity-70"
					>
						{#if isSaving}
							<svg
								class="mr-2 -ml-1 h-4 w-4 animate-spin text-white"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								><circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle><path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path></svg
							>
							{$t('Saving...')}
						{:else}
							{$t('Create Job')}
						{/if}
					</button>
				</div>
			</div>
		</form>
	</div>
</div>

{#if isManageModalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
		<div class="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b px-5 py-4">
				<h3 class="font-bold text-gray-800">
					{$t('Manage Options')}
					{manageModalType === 'jobCode' ? 'Job Code' : 'Service Type'}
				</h3>
				<button
					on:click={closeManageModal}
					class="text-gray-400 hover:text-gray-600 focus:outline-none"
					aria-label={$t('Close Modal')}
					title={$t('Close Modal')}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<div class="p-5">
				<div class="mb-6 rounded-lg border bg-gray-50 p-4">
					<h4 class="mb-3 text-sm font-semibold text-gray-600">
						{editingIndex !== null ? $t('Edit Option') : $t('Add New Option')}
					</h4>
					<div class="mb-3 grid grid-cols-2 gap-3">
						<div>
							<label for="manage_value" class="mb-1 block text-xs font-medium text-gray-500"
								>{$t('Value (e.g. SI)')}</label
							>
							<input
								id="manage_value"
								type="text"
								bind:value={manageValue}
								class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								placeholder="Value..."
							/>
						</div>
						<div>
							<label for="manage_label" class="mb-1 block text-xs font-medium text-gray-500"
								>{$t('Label (e.g. Sea Import)')}</label
							>
							<input
								id="manage_label"
								type="text"
								bind:value={manageLabel}
								class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								placeholder="Label..."
								on:keydown={(e) => e.key === 'Enter' && saveManageOption()}
							/>
						</div>
					</div>
					<div class="flex gap-2">
						<button
							on:click={saveManageOption}
							class="flex-1 rounded-md bg-blue-600 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
						>
							{editingIndex !== null ? $t('Save Changes') : $t('Add to System')}
						</button>
						{#if editingIndex !== null}
							<button
								on:click={resetManageForm}
								class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
							>
								{$t('Cancel')}
							</button>
						{/if}
					</div>
				</div>

				<h4 class="mb-2 text-sm font-semibold text-gray-700">{$t('Current Options')}</h4>
				<div class="max-h-60 overflow-y-auto rounded-lg border border-gray-200">
					<ul class="divide-y divide-gray-100">
						{#each manageModalType === 'jobCode' ? jobTypeOptions : serviceTypeOptions as option, index (option.value)}
							<li class="flex items-center justify-between p-3 hover:bg-gray-50">
								<div>
									<span class="text-sm font-semibold text-gray-800">{option.label}</span>
									<span class="ml-2 text-xs text-gray-500">[{option.value}]</span>
								</div>
								<div class="flex items-center gap-2">
									<button
										on:click={() => editManageOption(index)}
										class="text-gray-400 hover:text-blue-600 focus:outline-none"
										aria-label={$t('Edit Option')}
										title={$t('Edit')}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
											/>
										</svg>
									</button>
									<button
										on:click={() => confirmDeleteOption(index)}
										class="text-gray-400 hover:text-red-600 focus:outline-none"
										aria-label={$t('Delete Option')}
										title={$t('Delete')}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
											/>
										</svg>
									</button>
								</div>
							</li>
						{/each}
						{#if (manageModalType === 'jobCode' && jobTypeOptions.length === 0) || (manageModalType === 'serviceType' && serviceTypeOptions.length === 0)}
							<li class="p-4 text-center text-sm text-gray-500">{$t('No data available')}</li>
						{/if}
					</ul>
				</div>
			</div>
			<div class="border-t bg-gray-50 px-5 py-3 text-right">
				<button
					on:click={closeManageModal}
					class="rounded-md bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
				>
					{$t('Close Modal')}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if showDeleteConfirm}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
	>
		<div class="animate-in fade-in zoom-in-95 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
			<div class="mb-4 flex items-center justify-center">
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 text-red-600"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
				</div>
			</div>
			<h3 class="mb-2 text-center text-lg font-bold text-gray-900">
				{$t('Confirm Delete Option')}
			</h3>
			<p class="mb-6 text-center text-sm text-gray-500">
				{$t('Are you sure you want to delete this option?')} <br />
				<span class="font-semibold text-red-600">{$t('This action cannot be undone')}</span>
			</p>

			<div class="flex justify-center gap-3">
				<button
					on:click={cancelDeleteOption}
					class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
				>
					{$t('Cancel')}
				</button>
				<button
					on:click={executeDeleteOption}
					class="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500"
				>
					{$t('Delete')}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(div.svelte-select) {
		border-color: #d1d5db !important;
		border-radius: 0.375rem !important;
		min-height: 38px !important;
		background-color: white !important;
	}
	:global(div.svelte-select input) {
		font-size: 0.875rem !important;
	}
</style>