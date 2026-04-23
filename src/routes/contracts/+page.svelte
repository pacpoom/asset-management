<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { t, locale } from '$lib/i18n';
	import { formatOptionalDateTime } from '$lib/formatDateTime';

	// --- Types ---
	type Customer = { id: number; name: string };
	type ContractType = { id: number; name: string };
	type User = { id: number; username: string; email: string | null };
	type ContractDocument = {
		id: number;
		name: string;
		system_name: string;
		version: number;
		uploaded_at: string | Date;
	};
	type Contract = {
		id?: number;
		title: string;
		contract_number: string | null;
		customer_id: number | null;
		owner_user_id: number | null;
		renewal_notify_emails?: string | null;
		contract_type_id: number | null;
		start_date: string | Date | null;
		end_date: string | Date | null;
		contract_value: number | null;
		status: string;
		notice_datetime?: string | null;
		customer_name?: string;
		type_name?: string;
		documents: ContractDocument[];
	};

	// --- Props & State ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let contracts = $state<Contract[]>(data.contracts || []);
	let customers = $state<Customer[]>(data.customers || []);
	let users = $state<User[]>(data.users || []);
	let contractTypes = $state<ContractType[]>(data.contractTypes || []);

	let modalElement = $state<HTMLDialogElement | null>(null);
	let isEditing = $state(false);
	let isLoading = $state(false);
	let formError = $state<string | null>(null);
	let contractToDelete = $state<Contract | null>(null);
	let isDeleting = $state(false);

	const customerOptions = $derived(
		customers.map((c: Customer) => ({ value: c.id, label: c.name }))
	);
	const contractTypeOptions = $derived(
		contractTypes.map((ct: ContractType) => ({ value: ct.id, label: ct.name }))
	);
	const renewalEmailOptions = $derived(
		users
			.filter((u) => u.email?.trim())
			.map((u) => ({ email: u.email as string, label: `${u.username} (${u.email})` }))
	);

	let selectedCustomerObj = $state<any>(null);
	let selectedContractTypeObj = $state<any>(null);
	let selectedRenewalNotifyEmails = $state<string[]>([]);
	let renewalEmailSearch = $state('');
	let showRenewalEmailDropdown = $state(false);
	let contractValueDisplay = $state('');

	// --- Handlers สำหรับ Select ---
	function handleCustomerChange(event: any) {
		const selected = event?.detail || null;
		selectedCustomerObj = selected;
		currentContract.customer_id = selected ? selected.value : null;
	}

	function handleContractTypeChange(event: any) {
		const selected = event?.detail || null;
		selectedContractTypeObj = selected;
		currentContract.contract_type_id = selected ? selected.value : null;
	}

	// --- Contract Form State ---
	const createEmptyContract = (): Contract => ({
		title: '',
		contract_number: '',
		customer_id: null,
		contract_type_id: null,
		status: 'Draft',
		start_date: new Date().toISOString().split('T')[0],
		end_date: '',
		contract_value: null,
		owner_user_id: null,
		renewal_notify_emails: '',
		documents: []
	});
	let currentContract = $state<Contract>(createEmptyContract());
	let fileInput = $state<HTMLInputElement | null>(null);

	// Filters
	let filterStatus = $state('');
	let filterCustomer = $state('');
	let filterSearch = $state('');

	const filteredContracts = $derived.by(() => {
		let filtered = contracts;
		if (filterStatus) filtered = filtered.filter((c) => c.status === filterStatus);
		if (filterCustomer)
			filtered = filtered.filter((c) => c.customer_id === parseInt(filterCustomer));
		if (filterSearch) {
			const lowerSearch = filterSearch.toLowerCase();
			filtered = filtered.filter(
				(c) =>
					c.title.toLowerCase().includes(lowerSearch) ||
					c.contract_number?.toLowerCase().includes(lowerSearch) ||
					c.customer_name?.toLowerCase().includes(lowerSearch)
			);
		}
		return filtered;
	});

	const filteredRenewalEmailOptions = $derived.by(() => {
		const q = renewalEmailSearch.trim().toLowerCase();
		const matched = renewalEmailOptions.filter((opt) => {
			if (selectedRenewalNotifyEmails.includes(opt.email)) return false;
			if (!q) return true;
			return opt.label.toLowerCase().includes(q) || opt.email.toLowerCase().includes(q);
		});
		return matched.slice(0, q ? 80 : 25);
	});

	function addRenewalNotifyEmail(email: string) {
		if (!email || selectedRenewalNotifyEmails.includes(email)) return;
		selectedRenewalNotifyEmails = [...selectedRenewalNotifyEmails, email];
		renewalEmailSearch = '';
		showRenewalEmailDropdown = true;
	}

	function removeRenewalNotifyEmail(email: string) {
		selectedRenewalNotifyEmails = selectedRenewalNotifyEmails.filter((e) => e !== email);
		showRenewalEmailDropdown = true;
	}

	function formatContractValueDisplay(raw: string): string {
		const cleaned = String(raw || '').replace(/,/g, '').trim();
		if (!cleaned) return '';
		const [intPartRaw, decPartRaw] = cleaned.split('.');
		const intPart = (intPartRaw || '').replace(/[^\d]/g, '');
		const decPart = (decPartRaw || '').replace(/[^\d]/g, '');
		if (!intPart && !decPart) return '';
		const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		return decPartRaw !== undefined ? `${intFormatted || '0'}.${decPart}` : intFormatted;
	}

	function setContractValueFromDisplay(raw: string) {
		const normalized = String(raw || '').replace(/,/g, '').trim();
		if (!normalized) {
			currentContract.contract_value = null;
			contractValueDisplay = '';
			return;
		}
		const num = Number(normalized);
		if (Number.isFinite(num)) {
			currentContract.contract_value = num;
			contractValueDisplay = formatContractValueDisplay(normalized);
		}
	}

	function clickOutside(node: HTMLElement, callback: () => void) {
		const handleClick = (event: MouseEvent) => {
			if (node && !node.contains(event.target as Node) && !event.defaultPrevented) callback();
		};
		document.addEventListener('mousedown', handleClick, true);
		return {
			destroy() {
				document.removeEventListener('mousedown', handleClick, true);
			}
		};
	}

	// --- Modal Functions ---
	function openAddModal() {
		isEditing = false;
		currentContract = createEmptyContract();
		selectedCustomerObj = null;
		selectedContractTypeObj = null;
		selectedRenewalNotifyEmails = [];
		renewalEmailSearch = '';
		showRenewalEmailDropdown = false;
		contractValueDisplay = '';
		formError = null;
		if (fileInput) fileInput.value = '';
		modalElement?.showModal();
	}

	function openEditModal(contract: Contract) {
		isEditing = true;
		currentContract = {
			...contract,
			start_date: contract.start_date
				? new Date(contract.start_date).toISOString().split('T')[0]
				: '',
			end_date: contract.end_date ? new Date(contract.end_date).toISOString().split('T')[0] : ''
		};
		selectedCustomerObj = customerOptions.find((opt: any) => opt.value === contract.customer_id);
		selectedContractTypeObj = contractTypeOptions.find(
			(opt: any) => opt.value === contract.contract_type_id
		);
		const renewalEmails = String(contract.renewal_notify_emails || '')
			.split(/[;,]/g)
			.map((v) => v.trim())
			.filter(Boolean);
		selectedRenewalNotifyEmails = renewalEmails;
		renewalEmailSearch = '';
		showRenewalEmailDropdown = false;
		contractValueDisplay = formatContractValueDisplay(String(contract.contract_value ?? ''));

		formError = null;
		if (fileInput) fileInput.value = '';
		modalElement?.showModal();
	}

	function openEditModalById(contractId: number) {
		const contract = contracts.find((item) => item.id === contractId);
		if (!contract) return;
		openEditModal(contract);
	}

	function closeModal() {
		modalElement?.close();
	}

	function formatDate(isoString: string | Date | null | undefined): string {
		if (!isoString) return '-';
		try {
			return new Date(isoString).toLocaleDateString($locale === 'th' ? 'th-TH' : 'en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		} catch (e) {
			return '-';
		}
	}

	const Icon = {
		plus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>`,
		edit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 1 10 6H4.75A.25.25 0 0 0 4.5 6.25v10.5c0 .138.112.25.25.25h10.5A.25.25 0 0 0 15.5 16V9a.75.75 0 0 1 1.5 0v7A1.75 1.75 0 0 1 15.25 17.75H4.75A1.75 1.75 0 0 1 3 16V5.75Z" /></svg>`,
		delete: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.566 19h4.868a2.75 2.75 0 0 0 2.71-2.529l.841-10.518.149.022a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75a1.25 1.25 0 0 0-1.25-1.25h-2.5A1.25 1.25 0 0 0 7.5 3.75v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.84 0a.75.75 0 0 1-1.5-.06l-.3 7.5a.75.75 0 1 1 1.5.06l.3-7.5Z" clip-rule="evenodd" /></svg>`,
		search: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd" /></svg>`,
		download: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v5.19L7.47 8.22a.75.75 0 0 0-1.06 1.06l3.25 3.25a.75.75 0 0 0 1.06 0l3.25-3.25a.75.75 0 1 0-1.06-1.06l-1.78 1.78V4.75Z" /><path d="M4.5 14.5a.75.75 0 0 1 .75-.75h10a.75.75 0 0 1 0 1.5h-10a.75.75 0 0 1-.75-.75Zm-2 2.5a.75.75 0 0 1 .75-.75H16.5a.75.75 0 0 1 0 1.5H3.25a.75.75 0 0 1-.75-.75Z" /></svg>`
	};

	$effect(() => {
		if (data.contracts) {
			contracts = data.contracts;
		}
	});
</script>

<svelte:head><title>{$t('Contract Management')}</title></svelte:head>

<div class="min-h-screen bg-gray-50 p-6 font-sans">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-3xl font-bold text-gray-800">{$t('Contract Management')}</h1>
		<button
			onclick={openAddModal}
			class="flex transform items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white shadow-md transition duration-300 hover:bg-blue-700"
			aria-label={$t('Add New Contract')}
		>
			{@html Icon.plus}<span>{$t('Add New Contract')}</span>
		</button>
	</div>

	<div class="mb-6 grid grid-cols-1 gap-4 rounded-lg bg-white p-4 shadow md:grid-cols-3">
		<div class="relative">
			<label for="search" class="mb-1 block text-sm font-medium text-gray-700">{$t('Search')}</label
			>
			<input
				type="text"
				id="search"
				bind:value={filterSearch}
				placeholder={$t('Search title, number, or customer...')}
				class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 focus:ring-blue-500"
			/>
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pt-6 pl-3">
				{@html Icon.search}
			</div>
		</div>
		<div>
			<label for="filterStatus" class="mb-1 block text-sm font-medium text-gray-700"
				>{$t('Status')}</label
			>
			<select
				id="filterStatus"
				bind:value={filterStatus}
				class="w-full rounded-lg border border-gray-300 p-2 shadow-sm focus:ring-blue-500"
			>
				<option value="">{$t('-- All Statuses --')}</option>
				<option value="Draft">{$t('Status_Draft') || 'Draft'}</option>
				<option value="Active">{$t('Status_Active') || 'Active'}</option>
				<option value="Expired">{$t('Status_Expired') || 'Expired'}</option>
				<option value="Terminated">{$t('Status_Terminated') || 'Terminated'}</option>
			</select>
		</div>
		<div>
			<label for="filterCustomer" class="mb-1 block text-sm font-medium text-gray-700"
				>{$t('Customer')}</label
			>
			<select
				id="filterCustomer"
				bind:value={filterCustomer}
				class="w-full rounded-lg border border-gray-300 p-2 shadow-sm focus:ring-blue-500"
			>
				<option value="">{$t('-- All Customers --')}</option>
				{#each customers as customer (customer.id)}<option value={customer.id}
						>{customer.name}</option
					>{/each}
			</select>
		</div>
	</div>

	<div class="overflow-x-auto rounded-lg bg-white shadow-lg">
		<table class="min-w-full divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-100">
				<tr>
					<th class="px-6 py-3 text-left font-bold text-gray-600 uppercase"
						>{$t('Contract Title')}</th
					>
					<th class="px-6 py-3 text-left font-bold text-gray-600 uppercase">{$t('Customer')}</th>
					<th class="px-6 py-3 text-left font-bold text-gray-600 uppercase">{$t('Status')}</th>
					<th class="px-6 py-3 text-left font-bold text-gray-600 uppercase">{$t('Start Date')}</th>
					<th class="px-6 py-3 text-left font-bold text-gray-600 uppercase">{$t('End Date')}</th>
					<th class="px-6 py-3 text-left font-bold text-gray-600 uppercase">Notice sent (GMT+7)</th>
					<th class="px-6 py-3 text-center font-bold text-gray-600 uppercase">{$t('Docs')}</th>
					<th class="px-6 py-3 text-center font-bold text-gray-600 uppercase">{$t('Actions')}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#each filteredContracts as contract (`${contract.id}-${contract.contract_number || ''}`)}
					<tr class="transition-colors hover:bg-gray-50">
						<td class="px-6 py-4"
							><div class="font-medium text-gray-900">{contract.title}</div>
							<div class="text-xs text-gray-500">{contract.contract_number}</div></td
						>
						<td class="px-6 py-4">{contract.customer_name ?? '-'}</td>
						<td class="px-6 py-4"
							><span
								class="inline-flex rounded-full px-3 py-1 text-xs leading-5 font-semibold {contract.status ===
								'Draft'
									? 'bg-yellow-100 text-yellow-800'
									: 'bg-green-100 text-green-800'}"
								>{$t('Status_' + contract.status) || contract.status}</span
							></td
						>
						<td class="px-6 py-4 text-nowrap">{formatDate(contract.start_date)}</td>
						<td class="px-6 py-4 text-nowrap">{formatDate(contract.end_date)}</td>
						<td class="px-6 py-4 text-nowrap font-mono">{formatOptionalDateTime(contract.notice_datetime)}</td>
						<td class="px-6 py-4 text-center">{contract.documents?.length || 0}</td>
						<td class="px-6 py-4 text-center">
							<div class="flex items-center justify-center gap-2">
								<button
									onclick={() => openEditModalById(contract.id)}
									class="text-blue-600 hover:text-blue-900"
									aria-label={$t('Edit Contract')}>{@html Icon.edit}</button
								>
								<button
									onclick={() => (contractToDelete = contract)}
									class="text-red-600 hover:text-red-900"
									aria-label={$t('Delete')}
								>
									{@html Icon.delete}
								</button>
							</div>
						</td>
					</tr>
				{:else}<tr
						><td colspan="8" class="py-12 text-center text-gray-500"
							>{$t('No contract data found...')}</td
						></tr
					>{/each}
			</tbody>
		</table>
	</div>
</div>

<dialog
	bind:this={modalElement}
	class="w-full max-w-4xl rounded-lg p-0 shadow-2xl backdrop:bg-black/50"
>
	<form
		method="POST"
		enctype="multipart/form-data"
		action={isEditing ? '?/update' : '?/create'}
		use:enhance={() => {
			isLoading = true;
			formError = null;
			return async ({ update, result }) => {
				await update({ reset: false });
				isLoading = false;

				if (result.type === 'success') {
					closeModal();
				} else if (result.type === 'failure') {
					formError = result.data?.error as string;
				}
			};
		}}
		class="p-6"
	>
		<h2 class="mb-6 text-2xl font-bold text-gray-800">
			{isEditing ? $t('Edit Contract') : $t('Add New Contract')}
		</h2>
		{#if formError}<div
				class="mb-4 rounded-lg border border-red-400 bg-red-100 px-4 py-3 text-red-700"
				transition:slide
			>
				<strong>{$t('Error:')}</strong>
				{formError}
			</div>{/if}
		{#if isEditing}<input type="hidden" name="id" value={currentContract.id} />{/if}

		<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
			<div class="space-y-4 lg:col-span-2">
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div>
						<label for="title" class="text-sm font-medium text-gray-700"
							>{$t('Contract Title *')}</label
						><input
							type="text"
							id="title"
							name="title"
							bind:value={currentContract.title}
							required
							class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:ring-blue-500"
						/>
					</div>
					<div>
						<label for="contract_number" class="text-sm font-medium text-gray-700"
							>{$t('Contract Number')}</label
						><input
							type="text"
							id="contract_number"
							name="contract_number"
							bind:value={currentContract.contract_number}
							class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:ring-blue-500"
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div>
						<span class="mb-1 block text-sm font-medium text-gray-700">{$t('Customer *')}</span>
						<input type="hidden" name="customer_id" value={currentContract.customer_id} />
						<Select
							items={customerOptions}
							value={selectedCustomerObj}
							on:change={handleCustomerChange}
							on:clear={() => handleCustomerChange(null)}
							placeholder={$t('-- Search/Select Customer --')}
							container={browser ? document.body : null}
						/>
					</div>
					<div>
						<span class="mb-1 block text-sm font-medium text-gray-700">{$t('Contract Type *')}</span
						>
						<input type="hidden" name="contract_type_id" value={currentContract.contract_type_id} />
						<Select
							items={contractTypeOptions}
							value={selectedContractTypeObj}
							on:change={handleContractTypeChange}
							on:clear={() => handleContractTypeChange(null)}
							placeholder={$t('-- Search/Select Type --')}
							container={browser ? document.body : null}
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div>
						<label for="status" class="text-sm font-medium text-gray-700">{$t('Status')} *</label
						><select
							id="status"
							name="status"
							bind:value={currentContract.status}
							required
							class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:ring-blue-500"
						>
							<option value="Draft">{$t('Status_Draft') || 'Draft'}</option>
							<option value="Active">{$t('Status_Active') || 'Active'}</option>
							<option value="Expired">{$t('Status_Expired') || 'Expired'}</option>
							<option value="Terminated">{$t('Status_Terminated') || 'Terminated'}</option>
						</select>
					</div>
					<div>
						<label for="contract_value" class="text-sm font-medium text-gray-700"
							>{$t('Contract Value (Baht)')}</label
						><input
							type="text"
							id="contract_value"
							inputmode="decimal"
							value={contractValueDisplay}
							oninput={(e) => setContractValueFromDisplay((e.currentTarget as HTMLInputElement).value)}
							class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:ring-blue-500"
						/>
						<input type="hidden" name="contract_value" value={currentContract.contract_value ?? ''} />
					</div>
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div>
						<label for="start_date" class="text-sm font-medium text-gray-700"
							>{$t('Start Date')}</label
						><input
							type="date"
							id="start_date"
							name="start_date"
							bind:value={currentContract.start_date}
							class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:ring-blue-500"
						/>
					</div>
					<div>
						<label for="end_date" class="text-sm font-medium text-gray-700">{$t('End Date')}</label
						><input
							type="date"
							id="end_date"
							name="end_date"
							bind:value={currentContract.end_date}
							class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:ring-blue-500"
						/>
					</div>
				</div>

				<input type="hidden" name="owner_user_id" value="" />

				<div>
					<label for="renewal_notify_emails" class="text-sm font-medium text-gray-700">
						Renewal Notice Emails (per contract)
					</label>
					<div class="relative" use:clickOutside={() => (showRenewalEmailDropdown = false)}>
						<div class="mt-1 rounded-lg border border-gray-300 bg-white p-2">
							<div class="mb-2 flex flex-wrap gap-2">
								{#each selectedRenewalNotifyEmails as email (email)}
									<button
										type="button"
										onclick={() => removeRenewalNotifyEmail(email)}
										class="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
									>
										<span>{email}</span>
										<span aria-hidden="true">x</span>
									</button>
								{/each}
							</div>
							<input
								id="renewal_notify_emails"
								type="text"
								bind:value={renewalEmailSearch}
								onfocus={() => (showRenewalEmailDropdown = true)}
								oninput={() => (showRenewalEmailDropdown = true)}
								onkeydown={() => (showRenewalEmailDropdown = true)}
								placeholder={$t('-- Search/Select renewal notice emails --')}
								class="w-full border-0 p-0 text-sm focus:ring-0"
							/>
						</div>
						{#if showRenewalEmailDropdown}
							<ul
								class="absolute z-[10000] mt-1 max-h-52 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
							>
								{#if filteredRenewalEmailOptions.length === 0}
									<li class="px-3 py-2 text-gray-500">No emails found</li>
								{:else}
									{#each filteredRenewalEmailOptions as opt (opt.email)}
										<li>
											<button
												type="button"
												class="w-full px-3 py-2 text-left hover:bg-blue-50"
												onclick={() => addRenewalNotifyEmail(opt.email)}
											>
												{opt.label}
											</button>
										</li>
									{/each}
								{/if}
							</ul>
						{/if}
					</div>
					{#each selectedRenewalNotifyEmails as email (email)}
						<input type="hidden" name="renewal_notify_emails" value={email} />
					{/each}
					<p class="mt-1 text-xs text-gray-500">ค้นหา, เลือกหลายคน และกด x เพื่อลบได้</p>
				</div>

				<div class="pt-2">
					<label for="contractFiles" class="text-sm font-medium text-gray-700"
						>{$t('Contract Documents')}
						{#if !isEditing}<span class="text-red-500">*</span>{/if}</label
					><input
						type="file"
						id="contractFiles"
						name="contractFiles"
						multiple
						accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png"
						class="mt-1 block w-full text-sm text-gray-500 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
					/>
				</div>
			</div>

			<div class="max-h-96 overflow-y-auto rounded-lg border bg-gray-50 p-4 lg:col-span-1">
				<h3 class="mb-3 text-lg font-semibold text-gray-700">
					{$t('Attachments')} ({currentContract.documents.length})
				</h3>
				{#if currentContract.documents.length > 0}
					<ul class="space-y-3">
						{#each currentContract.documents as doc (doc.id)}<li
								class="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 text-sm"
							>
								<div class="mr-2 truncate">
									<div class="truncate font-medium text-gray-800">{doc.name}</div>
									<div class="text-xs text-gray-500">
										{$t('Version:')}
										{doc.version} |
										{formatDate(doc.uploaded_at)}
									</div>
								</div>
								<a
									href="/uploads/contracts/{doc.system_name}"
									target="_blank"
									download={doc.name}
									class="rounded-full p-1 text-green-600 transition hover:bg-green-50 hover:text-green-800"
									aria-label={$t('Download file')}>{@html Icon.download}</a
								>
							</li>{/each}
					</ul>
				{:else}<p class="text-sm text-gray-500 italic">{$t('No documents uploaded yet.')}</p>{/if}
			</div>
		</div>

		<div class="mt-8 flex justify-end gap-4 border-t border-gray-200 pt-4">
			<button
				type="button"
				onclick={closeModal}
				class="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 transition hover:bg-gray-300"
				>{$t('Cancel')}</button
			>
			<button
				type="submit"
				disabled={isLoading}
				class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white shadow-md transition hover:bg-blue-700 disabled:bg-gray-400"
			>
				{#if isLoading}<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
					></div>
					<span>{$t('Saving...')}</span>{:else}{@html Icon.plus}<span
						>{isEditing ? $t('Save Changes') : $t('Create Contract')}</span
					>{/if}
			</button>
		</div>
	</form>
</dialog>

{#if contractToDelete}
	<div
		transition:fade
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl transition-all">
			<h3 class="text-lg font-bold text-gray-900">{$t('Confirm Delete Contract')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				{$t('Are you sure you want to delete contract')} "<strong>{contractToDelete.title}</strong
				>"?<br />
				<span class="text-xs text-red-500"
					>{$t(
						'This action will delete all contract data and attachments. This cannot be undone.'
					)}</span
				>
			</p>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					isDeleting = true;
					return async ({ update, result }) => {
						await update(); // โหลดข้อมูลใหม่
						isDeleting = false;

						if (result.type === 'success') {
							contractToDelete = null; // ปิด Modal เมื่อสำเร็จ
						}
					};
				}}
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="id" value={contractToDelete.id} />
				<button
					type="button"
					onclick={() => (contractToDelete = null)}
					class="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
					disabled={isDeleting}
				>
					{$t('Cancel')}
				</button>
				<button
					type="submit"
					class="rounded bg-red-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-red-700 disabled:bg-red-300"
					disabled={isDeleting}
				>
					{#if isDeleting}{$t('Deleting...')}{:else}{$t('Delete Data')}{/if}
				</button>
			</form>
		</div>
	</div>
{/if}

<style>
	dialog.max-w-4xl {
		margin: 4rem auto 0;
		overflow-y: auto;
		max-height: calc(100vh - 8rem);
	}
	:global(div.svelte-select) {
		min-height: 38px;
		border: 1px solid #d1d5db !important;
		border-radius: 0.375rem !important;
		margin-top: 0.25rem;
	}
	:global(div.svelte-select .list) {
		border-radius: 0.375rem;
		border-color: #d1d5db;
		z-index: 9999 !important;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}
</style>
