<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	export let data;

	$: customerOptions = data.customers.map((c: any) => ({
		value: c.id,
		label: c.company_name ? `${c.company_name} (${c.name})` : c.name,
		address: c.address
	}));
	$: allContracts = data.contracts || [];
	$: filteredContracts = selectedCustomer
		? allContracts
				.filter((c: any) => c.customer_id == selectedCustomer.value)
				.map((c: any) => ({ value: c.id, label: `${c.contract_number} (${c.title})` }))
		: [];

	$: linerOptions = data.liners.map((l: any) => ({
		value: l.name,
		label: l.code ? `${l.name} (${l.code})` : l.name
	}));

	let selectedLiner: any = null;

	let isSaving = false;
	let selectedCustomer: any = null;
	let selectedContract: any = null;
	let jobDate = new Date().toISOString().split('T')[0];

	let jobTypeOptions = [
		{ value: 'SI', label: 'SI (Sea Import)' },
		{ value: 'SE', label: 'SE (Sea Export)' },
		{ value: 'AI', label: 'AI (Air Import)' },
		{ value: 'AF', label: 'AF (Air Freight)' },
		{ value: 'SP', label: 'SP (Special Project)' }
	];
	let selectedJobType: any = jobTypeOptions[0];
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
				<h1 class="text-xl font-bold text-gray-800">New Job Order</h1>
				<p class="text-xs text-gray-500">สร้างใบงานใหม่ (Create New Job)</p>
			</div>
		</div>
		<div class="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
			STATUS: PENDING
		</div>
	</div>

	<div
		class="mx-auto max-w-4xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
	>
		<div class="h-1.5 w-full bg-blue-600"></div>

		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				isSaving = true;
				return async ({ update, result }) => {
					await update();
					isSaving = false;
					if (result.type === 'success') goto('/freight-forwarder/job-orders');
				};
			}}
		>
			<div class="divide-y divide-gray-100">
				<div class="grid grid-cols-1 gap-8 p-8 md:grid-cols-2">
					<div class="space-y-5">
						<h2 class="text-xs font-bold tracking-wider text-gray-400 uppercase">
							Customer Information
						</h2>
						<div>
							<div class="mb-1.5 block text-sm font-semibold text-gray-700">
								Customer <span class="text-red-500">*</span>
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
								class="animate-in fade-in slide-in-from-top-1 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600"
							>
								<p class="font-bold text-gray-800">{selectedCustomer.label}</p>
								<p class="mt-1 text-xs">{selectedCustomer.address || '-'}</p>
							</div>
						{/if}

						<div>
							<div class="mb-1.5 block text-sm font-semibold text-gray-700">Contract</div>
							<Select
								items={filteredContracts}
								bind:value={selectedContract}
								placeholder={selectedCustomer ? 'เลือกสัญญา (Optional)' : '-'}
								disabled={!selectedCustomer}
								container={browser ? document.body : null}
							/>
							<input type="hidden" name="contract_id" value={selectedContract?.value || ''} />
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
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
								/>
							</div>
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
								<div class="mb-1.5 block text-sm font-semibold text-gray-700">
									Service Type <span class="text-red-500">*</span>
								</div>
								<div class="flex flex-wrap gap-2">
									<label
										class="flex cursor-pointer items-center gap-1.5 rounded border bg-white px-2.5 py-1.5 shadow-sm hover:bg-blue-50"
									>
										<input
											type="radio"
											name="service_type"
											value="Import"
											checked
											class="text-blue-600 focus:ring-blue-500"
											required
										/>
										<span class="text-xs font-medium">Import</span>
									</label>
									<label
										class="flex cursor-pointer items-center gap-1.5 rounded border bg-white px-2.5 py-1.5 shadow-sm hover:bg-blue-50"
									>
										<input
											type="radio"
											name="service_type"
											value="Export"
											class="text-blue-600 focus:ring-blue-500"
										/>
										<span class="text-xs font-medium">Export</span>
									</label>
									<label
										class="flex cursor-pointer items-center gap-1.5 rounded border bg-white px-2.5 py-1.5 shadow-sm hover:bg-blue-50"
									>
										<input
											type="radio"
											name="service_type"
											value="Cross-Trade"
											class="text-blue-600 focus:ring-blue-500"
										/>
										<span class="text-xs font-medium">Cross</span>
									</label>
								</div>
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
								placeholder="ระบุหมายเหตุ..."
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
								placeholder="HBL-XXXXXXX"
								class="w-full rounded-md border-gray-300 p-2 font-mono text-sm font-bold uppercase focus:border-blue-500 focus:ring-blue-500"
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
							<input type="hidden" name="liner_name" value={selectedLiner?.value || ''} />
						</div>
						<div>
							<label for="location" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
								>Port / Location</label
							>
							<input
								id="location"
								type="text"
								name="location"
								placeholder="Port of Loading / Discharge"
								class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>
						<div>
							<label for="invoice_no" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
								>Customer Invoice</label
							>
							<input
								id="invoice_no"
								type="text"
								name="invoice_no"
								placeholder="INV-XXXXX"
								class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>
					</div>
				</div>

				<div
					class="flex flex-col items-center justify-end gap-4 border-t border-gray-200 bg-gray-50 p-6 md:flex-row"
				>
					<div class="text-sm font-bold text-gray-600">Initial Amount:</div>
					<div class="flex rounded-md shadow-sm">
						<select
							name="currency"
							aria-label="Currency"
							class="rounded-l-md border-gray-300 bg-gray-100 py-2 pr-8 pl-3 text-sm font-bold text-gray-700 focus:border-blue-500 focus:ring-blue-500"
						>
							<option value="THB">THB</option>
							<option value="USD">USD</option>
							<option value="EUR">EUR</option>
						</select>
						<input
							type="number"
							step="0.01"
							name="amount"
							aria-label="Amount"
							placeholder="0.00"
							class="w-40 rounded-r-md border-l-0 border-gray-300 px-3 py-2 text-right font-mono text-lg font-bold text-gray-800 focus:border-blue-500 focus:ring-blue-500"
						/>
					</div>
				</div>

				<div
					class="flex items-center justify-end gap-3 border-t border-gray-200 bg-white px-8 py-5"
				>
					<a
						href="/freight-forwarder/job-orders"
						class="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-red-700"
					>
						Cancel
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
							Saving...
						{:else}
							Create Job
						{/if}
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
		min-height: 38px !important;
		background-color: white !important;
	}
	:global(div.svelte-select input) {
		font-size: 0.875rem !important;
	}
</style>
