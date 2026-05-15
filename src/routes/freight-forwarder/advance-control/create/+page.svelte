<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { t } from '$lib/i18n';

	export let data;

	interface Bank {
		id: number;
		bank_code: string;
		bank_name: string;
		account_number: string;
		account_name: string;
		branch: string | null;
	}

	interface SelectOption {
		value: string | number;
		label: string;
		account_info?: string;
	}

	// แปลงข้อมูล Master Bank สำหรับ svelte-select
	$: bankOptions = (data.banks || []).map((b: Bank) => ({
		value: b.id,
		label: `[${b.bank_code || '-'}] ${b.bank_name}`,
		account_info: `A/C: ${b.account_number} (${b.account_name})`
	}));

	let isSaving = false;
	let selectedBank: SelectOption | null = null;
	
	let documentDate = new Date().toISOString().split('T')[0];
	let amount: number | string = '';

	// คำนวณเลขที่เอกสารเพื่อแสดงตัวอย่าง (Preview Document Number)
	$: padding = data?.paddingLength ?? 4;
	$: nextSeqNum = data?.nextSequence ?? 1;
	$: parsedDate = documentDate ? new Date(documentDate) : new Date();
	$: yy = String(parsedDate.getFullYear()).slice(-2);
	$: mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
	$: nextNumPadded = String(nextSeqNum).padStart(padding, '0');
	$: previewDocNumber = `ADV-${yy}${mm}${nextNumPadded}`;

	// ==========================================
	// จัดการสถานะ Modal สำหรับ Bank
	// ==========================================
	let isManageModalOpen = false;
	let bankActionType = 'add';
	let bankForm: HTMLFormElement;
	
	let editingIndex: number | null = null;
	let manageBankId: number | null = null;
	let manageBankCode = '';
	let manageBankName = '';
	let manageAccNo = '';
	let manageAccName = '';
	let manageBranch = '';

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

	function openManageModal() {
		isManageModalOpen = true;
		resetManageForm();
	}

	function closeManageModal() {
		isManageModalOpen = false;
	}

	function resetManageForm() {
		editingIndex = null;
		manageBankId = null;
		manageBankCode = '';
		manageBankName = '';
		manageAccNo = '';
		manageAccName = '';
		manageBranch = '';
		bankActionType = 'add';
	}

	function saveManageOption() {
		if (!manageBankName || !manageAccNo || !manageAccName) {
			showToast($t('กรุณากรอกข้อมูลธนาคารและเลขบัญชีให้ครบถ้วน'), 'error');
			return;
		}
		bankActionType = editingIndex !== null ? 'edit' : 'add';
		setTimeout(() => bankForm.requestSubmit(), 0);
	}

	function editManageOption(index: number) {
		editingIndex = index;
		const bank = data.banks[index] as Bank;
		manageBankId = bank.id;
		manageBankCode = bank.bank_code || '';
		manageBankName = bank.bank_name || '';
		manageAccNo = bank.account_number || '';
		manageAccName = bank.account_name || '';
		manageBranch = bank.branch || '';
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
		bankActionType = 'delete';
		manageBankId = data.banks[deleteTargetIndex].id;
		setTimeout(() => bankForm.requestSubmit(), 0);
		showDeleteConfirm = false;
	}

</script>

{#if toastMessage}
	<div class="animate-in fade-in slide-in-from-top-4 fixed top-6 right-6 z-[70] flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold shadow-xl {toastType === 'success' ? 'bg-green-600 text-white' : 'bg-red-500 text-white'}">
		{#if toastType === 'success'}
			<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
		{:else}
			<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
		{/if}
		{toastMessage}
	</div>
{/if}

<div class="min-h-screen bg-gray-100 p-6 pb-20">
	<!-- ส่วน Header ของหน้าจอ -->
	<div class="mx-auto mb-6 flex max-w-5xl items-center justify-between">
		<div class="flex items-center gap-4">
			<a
				href="/freight-forwarder/advance-control"
				title={$t('Back')}
				aria-label="Back to List"
				class="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm transition-colors hover:bg-blue-50 hover:text-blue-600"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-5 w-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
			</a>
			<div>
				<div class="flex items-center gap-2">
					<h1 class="text-xl font-bold text-gray-800">{$t('Create Advance Application')}</h1>
					<span class="rounded border border-blue-200 bg-blue-100 px-2 py-0.5 text-sm font-bold tracking-wider text-blue-700 shadow-sm">
						{previewDocNumber}
					</span>
				</div>
				<p class="text-xs text-gray-500">{$t('Request new advance payment')}</p>
			</div>
		</div>
		<div class="rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-700">
			STATUS: PENDING
		</div>
	</div>

	<!-- ส่วนฟอร์มข้อมูลหลัก -->
	<div class="mx-auto max-w-5xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
		<div class="h-1.5 w-full bg-blue-600"></div>

		<!-- Hidden Form สำหรับจัดการ Master Bank -->
		<form method="POST" action="?/manageBank" bind:this={bankForm} class="hidden" use:enhance={() => {
			return async ({ update, result }) => {
				await update();
				if (result.type === 'success') {
					if (bankActionType === 'delete') {
						showToast($t('Option deleted successfully'), 'success');
						deleteTargetIndex = null;
					} else {
						showToast(editingIndex !== null ? $t('Data updated successfully') : $t('Added to system successfully'), 'success');
						resetManageForm();
					}
				} else {
					showToast($t('Error saving data'), 'error');
				}
			};
		}}>
			<input type="hidden" name="action_type" bind:value={bankActionType} />
			<input type="hidden" name="id" bind:value={manageBankId} />
			<input type="hidden" name="bank_code" bind:value={manageBankCode} />
			<input type="hidden" name="bank_name" bind:value={manageBankName} />
			<input type="hidden" name="account_number" bind:value={manageAccNo} />
			<input type="hidden" name="account_name" bind:value={manageAccName} />
			<input type="hidden" name="branch" bind:value={manageBranch} />
		</form>

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
						goto('/freight-forwarder/advance-control');
					}
				};
			}}
		>
			<div class="divide-y divide-gray-100">
				<div class="grid grid-cols-1 gap-8 p-8 lg:grid-cols-2">
					
					<!-- คอลัมน์ซ้าย: ข้อมูลเอกสารและธนาคาร -->
					<div class="space-y-6">
						<div class="rounded-lg border border-blue-100 bg-blue-50/30 p-5">
							<h2 class="mb-4 text-xs font-bold tracking-wider text-blue-800 uppercase">
								{$t('General Information')}
							</h2>
							<div class="space-y-4">
								<div>
									<label for="document_date" class="mb-1 block text-sm font-semibold text-gray-700">
										{$t('Document Date')} <span class="text-red-500">*</span>
									</label>
									<input 
										id="document_date" 
										type="date" 
										name="document_date" 
										bind:value={documentDate} 
										class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" 
										required 
									/>
								</div>

								<div>
									<label for="application_title" class="mb-1 block text-sm font-semibold text-gray-700">
										{$t('Application Title')} <span class="text-red-500">*</span>
									</label>
									<input 
										id="application_title" 
										type="text" 
										name="application_title" 
										placeholder={$t('e.g. ค่าเดินทางไปพบลูกค้า, ค่าซื้ออุปกรณ์สำนักงาน')} 
										class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" 
										required 
									/>
								</div>

								<div class="pt-2">
									<div class="mb-1.5 block text-sm font-semibold text-gray-700">
										{$t('Bank A/C (Transfer to)')} <span class="text-red-500">*</span>
									</div>
									<div class="flex items-start gap-2">
										<div class="min-w-0 flex-grow">
											<Select
												items={bankOptions}
												bind:value={selectedBank}
												placeholder={$t('Search and select Bank...')}
												container={browser ? document.body : null}
												class="svelte-select-custom"
											/>
											<input type="hidden" name="bank_id" value={selectedBank?.value || ''} required />
										</div>
										<button type="button" onclick={openManageModal} class="flex h-[42px] w-10 flex-shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-blue-600 focus:ring-2 focus:ring-blue-500" title={$t('Manage Banks')}>
											<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
										</button>
									</div>
								</div>

								{#if selectedBank}
									<div class="animate-in fade-in slide-in-from-top-1 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-600 shadow-sm">
										<p class="font-bold text-gray-800">{selectedBank.label}</p>
										<p class="mt-1 text-xs text-blue-600 font-mono font-semibold">{selectedBank.account_info}</p>
									</div>
								{/if}
							</div>
						</div>
					</div>

					<!-- คอลัมน์ขวา: รายละเอียดการขอเบิกและแนบไฟล์ -->
					<div class="space-y-6 rounded-lg border border-gray-100 bg-gray-50/50 p-5">
						<h2 class="text-xs font-bold tracking-wider text-gray-600 uppercase">
							{$t('Advance Details')}
						</h2>

						<div>
							<label for="reason" class="mb-1 block text-sm font-semibold text-gray-700">
								{$t('Reason for Advance')} <span class="text-red-500">*</span>
							</label>
							<textarea 
								id="reason" 
								name="reason" 
								rows="3" 
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" 
								placeholder={$t('Explain why this advance is needed...')}
								required
							></textarea>
						</div>

						<div>
							<label for="remark" class="mb-1 block text-sm font-semibold text-gray-700">
								{$t('Remarks')}
							</label>
							<textarea 
								id="remark" 
								name="remark" 
								rows="2" 
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" 
								placeholder={$t('Additional notes (Optional)')}
							></textarea>
						</div>

						<div class="mt-4">
							<label for="attachments" class="mb-1 block text-sm font-semibold text-gray-700">{$t('Attachments')}</label>
							<div class="rounded-md border border-dashed border-gray-300 bg-white p-4 transition-colors hover:bg-gray-50">
								<input type="file" name="attachments" id="attachments" multiple class="block w-full cursor-pointer text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-200" />
								<p class="mt-2 text-xs text-gray-500">{$t('* Upload quotation, invoice, or supporting documents')}</p>
							</div>
						</div>
					</div>
				</div>

				<!-- ส่วนแสดงยอดเงินรวมด้านล่าง -->
				<div class="flex flex-col items-center justify-end gap-4 bg-gray-50 p-6 md:flex-row">
					<div class="flex items-center gap-3">
						<label for="amount" class="text-sm font-bold text-gray-700 uppercase tracking-wider">
							{$t('Amount (THB)')} <span class="text-red-500">*</span>
						</label>
						<div class="flex rounded-md border border-gray-300 bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
							<input 
								type="number" 
								name="amount" 
								id="amount"
								step="0.01" 
								min="0.01"
								bind:value={amount} 
								placeholder="0.00" 
								class="w-48 border-0 bg-transparent px-4 py-3 text-right text-lg font-bold text-blue-700 outline-none focus:ring-0" 
								required
							/>
						</div>
					</div>
				</div>

				<!-- ปุ่ม Action -->
				<div class="flex items-center justify-end gap-3 border-t border-gray-200 bg-white px-8 py-5">
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href="/freight-forwarder/advance-control" class="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 shadow-sm transition-all hover:bg-gray-50">
						{$t('Cancel')}
					</a>
					<button type="submit" disabled={isSaving} class="flex items-center gap-2 rounded-lg bg-blue-600 px-8 py-2.5 text-sm font-bold text-white shadow transition-all hover:bg-blue-700 disabled:opacity-70">
						{#if isSaving}
							<svg class="mr-2 -ml-1 h-4 w-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
							{$t('Saving...')}
						{:else}
							{$t('Submit Application')}
						{/if}
					</button>
				</div>
			</div>
		</form>
	</div>
</div>

<!-- ======================= -->
<!-- MODAL: MANAGE BANKS     -->
<!-- ======================= -->
{#if isManageModalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
		<div class="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b px-5 py-4">
				<h3 class="font-bold text-gray-800">{$t('Manage Bank Accounts')}</h3>
				<button onclick={closeManageModal} aria-label={$t('Close')} class="text-gray-400 hover:text-gray-600 focus:outline-none">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
				</button>
			</div>

			<div class="p-5">
				<div class="mb-6 rounded-lg border bg-gray-50 p-4">
					<h4 class="mb-3 text-sm font-semibold text-gray-600">
						{editingIndex !== null ? $t('Edit Bank A/C') : $t('Add New Bank A/C')}
					</h4>
					<div class="mb-3 grid grid-cols-2 gap-3">
						<div>
							<label for="manageBankCode" class="mb-1 block text-xs font-medium text-gray-500">{$t('Bank Code')} (e.g. KBANK)</label>
							<input id="manageBankCode" type="text" bind:value={manageBankCode} class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" placeholder="Code..." />
						</div>
						<div>
							<label for="manageBankName" class="mb-1 block text-xs font-medium text-gray-500">{$t('Bank Name')} <span class="text-red-500">*</span></label>
							<input id="manageBankName" type="text" bind:value={manageBankName} class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" placeholder="Name..." />
						</div>
						<div class="col-span-2">
							<label for="manageAccName" class="mb-1 block text-xs font-medium text-gray-500">{$t('Account Name')} <span class="text-red-500">*</span></label>
							<input id="manageAccName" type="text" bind:value={manageAccName} class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" placeholder="Account Name..." />
						</div>
						<div>
							<label for="manageAccNo" class="mb-1 block text-xs font-medium text-gray-500">{$t('Account Number')} <span class="text-red-500">*</span></label>
							<input id="manageAccNo" type="text" bind:value={manageAccNo} class="w-full rounded-md border-gray-300 p-2 text-sm font-mono focus:border-blue-500 focus:ring-blue-500" placeholder="Account No..." />
						</div>
						<div>
							<label for="manageBranch" class="mb-1 block text-xs font-medium text-gray-500">{$t('Branch')}</label>
							<input id="manageBranch" type="text" bind:value={manageBranch} class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" placeholder="Branch..." />
						</div>
					</div>
					<div class="flex gap-2 mt-4">
						<button onclick={saveManageOption} class="flex-1 rounded-md bg-blue-600 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700">
							{editingIndex !== null ? $t('Save Changes') : $t('Add to System')}
						</button>
						{#if editingIndex !== null}
							<button onclick={resetManageForm} class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">{$t('Cancel')}</button>
						{/if}
					</div>
				</div>

				<h4 class="mb-2 text-sm font-semibold text-gray-700">{$t('Current Accounts')}</h4>
				<div class="max-h-60 overflow-y-auto rounded-lg border border-gray-200">
					<ul class="divide-y divide-gray-100">
						{#each data.banks as bank, index (bank.id)}
							<li class="flex items-center justify-between p-3 hover:bg-gray-50">
								<div>
									<div class="text-sm font-semibold text-gray-800">[{bank.bank_code}] {bank.bank_name}</div>
									<div class="mt-0.5 text-xs text-gray-500">
										A/C: <span class="font-mono">{bank.account_number}</span> ({bank.account_name})
									</div>
								</div>
								<div class="flex items-center gap-2">
									<button onclick={() => editManageOption(index)} class="text-gray-400 hover:text-blue-600 focus:outline-none" title={$t('Edit')}>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
									</button>
									<button onclick={() => confirmDeleteOption(index)} class="text-gray-400 hover:text-red-600 focus:outline-none" title={$t('Delete')}>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
									</button>
								</div>
							</li>
						{/each}
						{#if data.banks.length === 0}
							<li class="p-4 text-center text-sm text-gray-500">{$t('No data available')}</li>
						{/if}
					</ul>
				</div>
			</div>
			<div class="border-t bg-gray-50 px-5 py-3 text-right">
				<button onclick={closeManageModal} class="rounded-md bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300">{$t('Close Modal')}</button>
			</div>
		</div>
	</div>
{/if}

{#if showDeleteConfirm}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
		<div class="animate-in fade-in zoom-in-95 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
			<div class="mb-4 flex items-center justify-center">
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
				</div>
			</div>
			<h3 class="mb-2 text-center text-lg font-bold text-gray-900">{$t('Confirm Delete Option')}</h3>
			<p class="mb-6 text-center text-sm text-gray-500">
				{$t('Are you sure you want to delete this option?')} <br />
				<span class="font-semibold text-red-600">{$t('This action cannot be undone')}</span>
			</p>
			<div class="flex justify-center gap-3">
				<button onclick={cancelDeleteOption} class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">{$t('Cancel')}</button>
				<button onclick={executeDeleteOption} class="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500">{$t('Delete')}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* สไตล์สำหรับ svelte-select ให้แสดงผลเข้ากับ Tailwind CSS */
	:global(div.svelte-select) {
		border-color: #d1d5db !important;
		border-radius: 0.375rem !important;
		min-height: 42px !important;
		background-color: white !important;
	}
	:global(div.svelte-select input) {
		font-size: 0.875rem !important;
	}
</style>