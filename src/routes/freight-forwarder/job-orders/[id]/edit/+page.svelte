<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	export let data;
	let job = data.job;

	let currentRunningNumber = job.job_number
		? job.job_number.slice(-4)
		: String(job.id).padStart(4, '0');

	let customerOptions = data.customers.map((c: any) => ({
		value: c.id,
		label: c.company_name ? `${c.company_name} (${c.name})` : c.name,
		address: c.address
	}));

	let allContracts = data.contracts || [];

	let selectedCustomer = customerOptions.find((c: any) => c.value == job.customer_id) || null;

	let initialContract = allContracts.find((c: any) => c.id == job.contract_id);
	let selectedContract = initialContract
		? {
				value: initialContract.id,
				label: `${initialContract.contract_number} (${initialContract.title})`
			}
		: null;

	$: filteredContracts = selectedCustomer
		? allContracts
				.filter((c: any) => c.customer_id == selectedCustomer.value)
				.map((c: any) => ({ value: c.id, label: `${c.contract_number} (${c.title})` }))
		: [];

	let vendorOptions = (data.vendors || []).map((v: any) => ({
		value: v.id,
		label: v.company_name ? `${v.company_name} (${v.name})` : v.name,
		address: v.address
	}));
	let allVendorContracts = data.vendorContracts || [];

	// ดึงค่าเดิมของ Vendor มาโชว์
	let selectedVendor = vendorOptions.find((v: any) => v.value == job.vendor_id) || null;

	let initialVendorContract = allVendorContracts.find((c: any) => c.id == job.vendor_contract_id);
	let selectedVendorContract = initialVendorContract
		? {
				value: initialVendorContract.id,
				label: `${initialVendorContract.contract_number} (${initialVendorContract.title})`,
				amount: initialVendorContract.contract_value
			}
		: null;

	$: filteredVendorContracts = selectedVendor
		? allVendorContracts
				.filter((c: any) => c.vendor_id == selectedVendor.value)
				.map((c: any) => ({
					value: c.id,
					label: `${c.contract_number} (${c.title})`,
					amount: c.contract_value
				}))
		: [];

	function handleVendorContractChange(e: CustomEvent) {
		const detail = e.detail;
	}

	let jobTypeOptions = [
		{ value: 'SI', label: 'SI (Sea Import)' },
		{ value: 'SE', label: 'SE (Sea Export)' },
		{ value: 'AI', label: 'AI (Air Import)' },
		{ value: 'AF', label: 'AF (Air Freight)' },
		{ value: 'SP', label: 'SP (Special Project)' }
	];
	let selectedJobType = jobTypeOptions.find((o) => o.value === job.job_type) || null;
	let linerOptions = data.liners.map((l: any) => ({
		value: l.name,
		label: l.code ? `${l.name} (${l.code})` : l.name
	}));
	let selectedLiner = linerOptions.find((l: any) => l.value === job.liner_name) || null;
	let isSaving = false;

	let jobDate = job.job_date
		? new Date(job.job_date).toISOString().split('T')[0]
		: new Date().toISOString().split('T')[0];

	$: parsedDate = jobDate ? new Date(jobDate) : new Date();
	$: yy = String(parsedDate.getFullYear()).slice(-2);
	$: mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
	$: jobCodeVal = selectedJobType?.value || job.job_type || '___';

	$: previewJobNumber = `${jobCodeVal}${yy}${mm}${currentRunningNumber}`;

	$: activeCurrencies =
		data?.currencies && data.currencies.length > 0
			? data.currencies
			: [{ code: 'THB' }, { code: 'USD' }];

	let selectedCurrency = job.currency || 'THB';
	let jobAmount: number | string = job.amount || '';

	let salesDocOptions = (data.salesDocs || []).map((doc: any) => ({
		value: doc.document_number,
		label: doc.document_number,
		amount: doc.total_amount
	}));

	let selectedSalesDoc = job.invoice_no
		? job.invoice_no
				.split(',')
				.map((inv: string) => salesDocOptions.find((opt: any) => opt.value === inv.trim()))
				.filter(Boolean)
		: null;

	function handleInvoiceChange(e: CustomEvent) {
		const detail = e.detail;
	}
</script>

<div class="min-h-screen bg-gray-100 p-6 pb-20">
	<div class="mx-auto mb-6 flex max-w-4xl items-center justify-between">
		<div class="flex items-center gap-4">
			<a
				href="/freight-forwarder/job-orders"
				title="ย้อนกลับ"
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
					<h1 class="text-xl font-bold text-gray-800">Edit Job Order</h1>
					<span
						class="rounded border border-blue-200 bg-blue-100 px-2 py-0.5 text-sm font-bold tracking-wider text-blue-700 shadow-sm"
					>
						{previewJobNumber}
					</span>
				</div>
				<p class="text-xs text-gray-500">แก้ไขข้อมูลงาน</p>
			</div>
		</div>
	</div>

	<div
		class="mx-auto max-w-7xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
	>
		<div class="h-1.5 w-full bg-orange-500"></div>

		<form
			method="POST"
			action="?/update"
			enctype="multipart/form-data"
			use:enhance={() => {
				isSaving = true;
				return async ({ update, result, action }) => {
					await update();
					isSaving = false;

					if (result.type === 'success' && action.search === '?/update') {
						goto('/freight-forwarder/job-orders');
					}
				};
			}}
		>
			<div class="divide-y divide-gray-100">
				<div class="grid grid-cols-1 gap-8 p-8 md:grid-cols-2">
					<div class="space-y-6">
						<!-- Customer Section -->
						<div class="rounded-lg border border-blue-100 bg-blue-50/30 p-4">
							<h2 class="mb-4 text-xs font-bold tracking-wider text-blue-800 uppercase">
								Customer Information
							</h2>
							<div class="space-y-4">
								<div>
									<div class="mb-1.5 block text-sm font-semibold text-gray-700">
										ลูกค้า (Customer) <span class="text-red-500">*</span>
									</div>
									<Select
										items={customerOptions}
										bind:value={selectedCustomer}
										placeholder="ค้นหาลูกค้า..."
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
									<div class="mb-1.5 block text-sm font-semibold text-gray-700">Contract (Optional)</div>
									<Select
										items={filteredContracts}
										bind:value={selectedContract}
										placeholder={selectedCustomer ? 'เลือกสัญญา' : '-'}
										disabled={!selectedCustomer}
										container={browser ? document.body : null}
										class="svelte-select-custom"
									/>
									<input type="hidden" name="contract_id" value={selectedContract?.value || ''} />
								</div>
							</div>
						</div>

						<!-- Vendor Section -->
						<div class="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
							<h2 class="mb-4 text-xs font-bold tracking-wider text-gray-600 uppercase">
								Vendor Information <span class="text-gray-400 font-normal normal-case">(Optional)</span>
							</h2>
							<div class="space-y-4">
								<div>
									<div class="mb-1.5 block text-sm font-semibold text-gray-700">
										ผู้จำหน่าย (Vendor)
									</div>
									<Select
										items={vendorOptions}
										bind:value={selectedVendor}
										placeholder="ค้นหาผู้จำหน่าย (ถ้ามี)..."
										container={browser ? document.body : null}
										class="svelte-select-custom"
									/>
									<input
										type="hidden"
										name="vendor_id"
										value={selectedVendor?.value || ''}
									/>
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
									<div class="mb-1.5 block text-sm font-semibold text-gray-700">Vendor Contract</div>
									<Select
										items={filteredVendorContracts}
										bind:value={selectedVendorContract}
										on:change={handleVendorContractChange}
										placeholder={selectedVendor ? 'เลือกสัญญาผู้จำหน่าย' : '-'}
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

					<div class="space-y-5 rounded-lg border border-gray-100 bg-gray-50/50 p-5">
						<h2 class="text-xs font-bold tracking-wider text-gray-400 uppercase">Job Details</h2>
						<div class="grid grid-cols-2 gap-4">
							<div>
								<label for="job_date" class="mb-1 block text-sm font-semibold text-gray-700"
									>Job Date</label
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
									>Expire Date</label
								>
								<input
									id="expire_date"
									type="date"
									name="expire_date"
									value={job.expire_date
										? new Date(job.expire_date).toISOString().split('T')[0]
										: ''}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
								/>
							</div>
						</div>

						<div>
							<label for="job_status" class="mb-1 block text-sm font-semibold text-gray-700"
								>Status</label
							>
							<select
								id="job_status"
								name="job_status"
								value={job.job_status}
								class="w-full rounded-md border-gray-300 font-bold shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
							>
								<option value="Pending">Pending</option>
								<option value="In Progress">In Progress</option>
								<option value="Completed">Completed</option>
								<option value="Cancelled">Cancelled</option>
							</select>
						</div>

						<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
							<div>
								<div class="mb-1.5 block text-sm font-semibold text-gray-700">
									Job Code <span class="text-red-500">*</span>
								</div>
								<Select
									items={jobTypeOptions}
									bind:value={selectedJobType}
									placeholder="เลือก..."
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

							<div>
								<label for="service_type" class="mb-1.5 block text-sm font-semibold text-gray-700">
									Service Type <span class="text-red-500">*</span>
								</label>
								<select
									id="service_type"
									name="service_type"
									value={job.service_type}
									class="w-full rounded-md border-gray-300 font-medium text-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
									required
								>
									<option value="Import">Import</option>
									<option value="Export">Export</option>
									<option value="Cross-Trade">Cross-Trade</option>
								</select>
							</div>
						</div>

						<div>
							<label for="remarks" class="mb-1 block text-sm font-semibold text-gray-700"
								>Remark</label
							>
							<textarea
								id="remarks"
								name="remarks"
								rows="2"
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
								value={job.remarks || ''}
							></textarea>
						</div>
					</div>
				</div>

				<div class="p-8">
					<h2 class="mb-4 border-b pb-1 text-xs font-bold tracking-wider text-gray-400 uppercase">
						Shipment Information
					</h2>
					<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
						<div>
							<label for="bl_number" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
								>B/L Number <span class="text-red-500">*</span></label
							>
							<input
								id="bl_number"
								type="text"
								name="bl_number"
								value={job.bl_number}
								class="w-full rounded-md border-gray-300 p-2 font-mono font-bold uppercase focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
								required
							/>
						</div>
						<div>
							<div class="mb-1 block text-xs font-bold text-gray-500 uppercase">
								Liner / Carrier
							</div>
							<Select
								items={linerOptions}
								bind:value={selectedLiner}
								placeholder="ค้นหาหรือเลือกสายเรือ..."
								container={browser ? document.body : null}
								class="svelte-select-custom"
							/>
							<input
								type="hidden"
								name="liner_name"
								value={selectedLiner?.value || job.liner_name || ''}
							/>
						</div>
						<div>
							<label for="location" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
								>Port / Location</label
							>
							<input
								id="location"
								type="text"
								name="location"
								value={job.location || ''}
								class="w-full rounded-md border-gray-300 p-2 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
							/>
						</div>
						<div>
							<label for="invoice_no" class="mb-1 block text-xs font-bold text-gray-500 uppercase">
								Customer Invoice
							</label>
							<input
								type="text"
								id="invoice_no"
								name="invoice_no"
								bind:value={job.invoice_no}
								placeholder="เช่น INV-001, INV-002"
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>

						<div class="col-span-1 mt-4 border-t border-gray-100 pt-6 md:col-span-2">
							<label for="attachments" class="mb-3 block text-sm font-bold text-gray-700">
								เอกสารแนบ (Attachments)
							</label>

							{#if data.existingAttachments && data.existingAttachments.length > 0}
								<ul class="mb-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
									{#each data.existingAttachments as file}
										<li
											class="flex items-center justify-between rounded border bg-white p-2 text-sm shadow-sm"
										>
											<a
												href={file.url}
												target="_blank"
												rel="noopener noreferrer"
												class="max-w-[250px] truncate text-blue-600 hover:underline sm:max-w-xs"
											>
												{file.file_original_name}
											</a>
											<button
												type="submit"
												formaction="?/deleteAttachment"
												name="attachment_id"
												value={file.id}
												class="rounded border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
											>
												ลบ
											</button>
										</li>
									{/each}
								</ul>
							{/if}

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
									* สามารถอัปโหลดไฟล์เพิ่มเติมได้ (เช่น B/L, Commercial Invoice)
								</p>
							</div>
						</div>
					</div>
				</div>

				<div class="flex items-center justify-end gap-4 border-t border-gray-200 bg-gray-50 p-6">
					<div class="text-sm font-bold text-gray-600">Initial Amount:</div>

					<div
						class="flex rounded-md border border-gray-300 bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
					>
						<select
							name="currency"
							aria-label="Currency"
							bind:value={selectedCurrency}
							class="w-24 border-0 bg-transparent px-3 py-2 font-bold text-gray-900 focus:ring-0"
						>
							{#each activeCurrencies as curr}
								<option value={curr.code} class="text-gray-900">{curr.code}</option>
							{/each}
						</select>

						<div class="w-px bg-gray-300"></div>

						<input
							type="number"
							step="0.01"
							name="amount"
							aria-label="Amount"
							bind:value={jobAmount}
							class="w-40 border-0 bg-transparent px-3 py-2 text-right text-lg font-bold text-blue-700 outline-none focus:ring-0"
						/>
					</div>
				</div>

				<div class="flex justify-end gap-3 border-t border-gray-200 bg-white px-8 py-5">
					<a
						href="/freight-forwarder/job-orders"
						class="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-red-700"
					>
						Cancel
					</a>
					<button
						type="submit"
						disabled={isSaving}
						class="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-bold text-white shadow transition-all hover:bg-green-700 disabled:opacity-70"
					>
						{isSaving ? 'Saving...' : 'Save Changes'}
					</button>
				</div>
			</div>
		</form>
	</div>
</div>

<style>
	:global(div.svelte-select) {
		border-color: #d1d5db !important;
		border-radius: 0.375rem !important;
		background-color: white !important;
	}
</style>