<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll, goto } from '$app/navigation';
	import { t, locale } from '$lib/i18n';
	import { toYmdDateInputBangkok } from '$lib/bangkokCalendarDate';
	import { formatOptionalDateTime } from '$lib/formatDateTime';

	type VendorContract = PageData['contracts'][0];
	type VendorContractDocument = VendorContract['documents'][0];
	type Vendor = PageData['vendors'][0];
	type User = PageData['users'][0];
	type ContractType = PageData['contractTypes'][0];

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let contracts = $state<VendorContract[]>(data.contracts || []);

	$effect(() => {
		contracts = data.contracts || [];
	});

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedContract = $state<Partial<VendorContract> | null>(null);
	let contractToDelete = $state<VendorContract | null>(null);
	let isSavingContract = $state(false);

	let currentSearch = $state(data.searchQuery ?? '');
	let currentStatus = $state(data.filters.status ?? '');
	let currentVendor = $state(data.filters.vendor ?? '');

	let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(
		null
	);
	let messageTimeout: NodeJS.Timeout;

	let documentsForSelectedContract = $state<VendorContractDocument[]>([]);
	let isUploadingDocument = $state(false);
	let uploadError = $state<string | null>(null);
	let documentToDelete = $state<VendorContractDocument | null>(null);
	let isDeletingDocument = $state(false);

	let fileInputRef: HTMLInputElement | null = $state(null);
	let isFileSelected = $state(false);

	// --- Custom Searchable Select State ---
	let vendorSearch = $state('');
	let showVendorDropdown = $state(false);
	let showRenewalEmailDropdown = $state(false);
	let selectedRenewalNotifyEmails = $state<string[]>([]);
	let renewalEmailSearch = $state('');
	let contractValueDisplay = $state('');
	const renewalEmailOptions = $derived(
		data.users
			.filter((u) => u.email?.trim())
			.map((u) => ({ email: u.email as string, label: `${u.full_name} (${u.email})` }))
	);

	function vendorOptionLabel(v: Vendor): string {
		const company = v.company_name?.trim();
		const contact = v.name?.trim();
		if (company && contact) return `${company} (${contact})`;
		return company || contact || '';
	}

	let filteredVendors = $derived.by(() => {
		const q = vendorSearch.trim().toLowerCase();
		if (!q) return data.vendors;
		return data.vendors.filter((v) => {
			const hay = [v.company_name, v.name].filter(Boolean).join(' ').toLowerCase();
			return hay.includes(q);
		});
	});

	let filteredRenewalEmailOptions = $derived.by(() => {
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
		if (!selectedContract) return;
		if (!normalized) {
			selectedContract.contract_value = null as any;
			contractValueDisplay = '';
			return;
		}
		const num = Number(normalized);
		if (Number.isFinite(num)) {
			selectedContract.contract_value = num as any;
			contractValueDisplay = formatContractValueDisplay(normalized);
		}
	}

	const contractStatuses = ['Draft', 'Active', 'Expired', 'Terminated'];

	// --- Click Outside Action ---
	function clickOutside(node: HTMLElement, callback: () => void) {
		const handleClick = (event: MouseEvent) => {
			if (node && !node.contains(event.target as Node) && !event.defaultPrevented) {
				callback();
			}
		};
		document.addEventListener('mousedown', handleClick, true);
		return {
			destroy() {
				document.removeEventListener('mousedown', handleClick, true);
			}
		};
	}

	function openModal(mode: 'add' | 'edit', contract: VendorContract | null = null) {
		modalMode = mode;
		globalMessage = null;
		uploadError = null;
		documentsForSelectedContract = [];
		showVendorDropdown = false;
		showRenewalEmailDropdown = false;

		if (fileInputRef) {
			fileInputRef.value = '';
			isFileSelected = false;
		}

		if (mode === 'edit' && contract) {
			selectedContract = { ...contract };

			selectedContract.vendor_id = selectedContract.vendor_id ?? ('' as any);
			selectedContract.contract_type_id = selectedContract.contract_type_id ?? ('' as any);
			selectedContract.start_date = toYmdDateInputBangkok(
				contract.start_date as string | Date | null | undefined
			);
			selectedContract.end_date = toYmdDateInputBangkok(
				contract.end_date as string | Date | null | undefined
			);

			// Initial search text for dropdowns
			const vMatch = data.vendors.find((v) => v.id === contract.vendor_id);
			vendorSearch = vMatch ? vendorOptionLabel(vMatch) : contract.vendor_name || '';
			const renewalEmails = String(contract.renewal_notify_emails || '')
				.split(/[;,]/g)
				.map((v) => v.trim())
				.filter(Boolean);
			selectedRenewalNotifyEmails = renewalEmails;
			renewalEmailSearch = '';
			contractValueDisplay = formatContractValueDisplay(String(contract.contract_value ?? ''));

			documentsForSelectedContract = contract.documents ? [...contract.documents] : [];
		} else {
			selectedContract = {
				title: '',
				vendor_id: '' as any,
				contract_type_id: '' as any,
				status: 'Draft',
				start_date: toYmdDateInputBangkok(new Date()),
				end_date: '',
				contract_value: null,
				renewal_notice_days: 30
			} as Partial<VendorContract>;
			vendorSearch = '';
			selectedRenewalNotifyEmails = [];
			renewalEmailSearch = '';
			contractValueDisplay = '';
		}
	}

	function closeModal() {
		modalMode = null;
		selectedContract = null;
		documentsForSelectedContract = [];
		uploadError = null;
		isFileSelected = false;
	}

	function showGlobalMessage(
		message: { success: boolean; text: string; type: 'success' | 'error' },
		duration: number = 5000
	) {
		clearTimeout(messageTimeout);
		globalMessage = message;
		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, duration);
	}

	function formatDate(isoString: string | Date | null | undefined): string {
		if (!isoString) return '-';
		try {
			return new Date(isoString).toLocaleDateString($locale === 'th' ? 'th-TH' : 'en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return 'Invalid Date';
		}
	}

	function getFileIcon(fileName: string): string {
		const ext = fileName?.split('.').pop()?.toLowerCase() || '';
		if (['pdf'].includes(ext)) return '📄';
		if (['doc', 'docx'].includes(ext)) return '📝';
		if (['xls', 'xlsx'].includes(ext)) return '📊';
		if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
		return '📁';
	}

	function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const files = input.files;
		const MAX_SIZE = 5 * 1024 * 1024; // 5MB Limit

		if (files) {
			for (let i = 0; i < files.length; i++) {
				if (files[i].size > MAX_SIZE) {
					alert($t(`File size exceeds 5MB limit: ${files[i].name}`));
					input.value = '';
					isFileSelected = false;
					uploadError = 'File size exceeds limit';
					return;
				}
			}
		}

		isFileSelected = (files?.length ?? 0) > 0;
		uploadError = null;
	}

	function applyFilters() {
		const url = new URL(window.location.href);
		url.searchParams.set('page', '1');
		if (currentSearch) url.searchParams.set('search', currentSearch);
		else url.searchParams.delete('search');
		if (currentStatus) url.searchParams.set('status', currentStatus);
		else url.searchParams.delete('status');
		if (currentVendor) url.searchParams.set('vendor', currentVendor);
		else url.searchParams.delete('vendor');
		goto(url.toString(), { keepFocus: true });
	}

	// --- Reactive Effects (saveContract handled in use:enhance to avoid await update() hanging) ---
	$effect.pre(() => {
		if (form?.action === 'deleteContract') {
			if (form.success && form.deletedId) {
				contracts = contracts.filter((c) => c.id !== form.deletedId);
				showGlobalMessage({
					success: true,
					text: (form.message as string) ?? 'Success',
					type: 'success'
				});
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage({
					success: false,
					text: (form.message as string) ?? 'Error',
					type: 'error'
				});
			}
			contractToDelete = null;
			(form as any).action = undefined;
		}

		if (
			form?.action === 'uploadDocument' &&
			modalMode === 'edit' &&
			selectedContract?.id === form.newDocument?.vendor_contract_id
		) {
			if (form.success && form.newDocument) {
				documentsForSelectedContract = [
					form.newDocument as VendorContractDocument,
					...documentsForSelectedContract
				];
				uploadError = null;
				if (fileInputRef) fileInputRef.value = '';
				isFileSelected = false;
			} else if (form.message) {
				uploadError = form.message as string;
			}
			(form as any).action = undefined;
		}

		if (form?.action === 'deleteDocument' && modalMode === 'edit') {
			if (form.success && form.deletedDocumentId) {
				if (documentsForSelectedContract.some((d) => d.id === form.deletedDocumentId)) {
					documentsForSelectedContract = documentsForSelectedContract.filter(
						(d) => d.id !== form.deletedDocumentId
					);
				}
				documentToDelete = null;
			} else if (form.message) {
				showGlobalMessage({
					success: false,
					text: (form.message as string) ?? 'Error',
					type: 'error'
				});
				documentToDelete = null;
			}
			(form as any).action = undefined;
		}
	});

	const paginationRange = $derived.by(() => {
		const delta = 1;
		const left = data.currentPage - delta;
		const right = data.currentPage + delta + 1;
		const range: number[] = [];
		const rangeWithDots: (number | string)[] = [];
		let l: number | undefined;
		for (let i = 1; i <= data.totalPages; i++) {
			if (i == 1 || i == data.totalPages || (i >= left && i < right)) {
				range.push(i);
			}
		}
		for (const i of range) {
			if (l) {
				if (i - l === 2) {
					rangeWithDots.push(l + 1);
				} else if (i - l !== 1) {
					rangeWithDots.push('...');
				}
			}
			rangeWithDots.push(i);
			l = i;
		}
		return rangeWithDots;
	});

	function getPageUrl(pageNum: number | string) {
		const params = new URLSearchParams();
		params.set('page', pageNum.toString());
		if (data.searchQuery) params.set('search', data.searchQuery);
		if (data.filters.status) params.set('status', data.filters.status);
		if (data.filters.vendor) params.set('vendor', data.filters.vendor);
		return `/vendor-contracts?${params.toString()}`;
	}
</script>

<svelte:head>
	<title>{$t('Vendor Contract Management')}</title>
</svelte:head>

{#if globalMessage}
	<div
		transition:fade
		class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 text-sm font-semibold shadow-xl {globalMessage.type ===
		'success'
			? 'bg-green-100 text-green-800'
			: 'bg-red-100 text-red-800'}"
	>
		{globalMessage.text}
	</div>
{/if}

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Vendor Contract Management')}</h1>
		<p class="mt-1 text-sm text-gray-500">{$t('Manage vendor contracts')}</p>
	</div>
	<button
		onclick={() => openModal('add')}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			class="h-4 w-4"
			><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg
		>
		{$t('Add New Vendor Contract')}
	</button>
</div>

<div
	class="mb-4 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-3"
>
	<div class="relative">
		<label for="search" class="sr-only">Search</label>
		<input
			type="search"
			id="search"
			bind:value={currentSearch}
			onchange={applyFilters}
			placeholder={$t('Search Contract Placeholder')}
			class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 text-sm focus:border-blue-500 focus:ring-blue-500"
		/>
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<svg
				class="h-4 w-4 text-gray-400"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				><path
					fill-rule="evenodd"
					d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
					clip-rule="evenodd"
				/></svg
			>
		</div>
	</div>
	<div>
		<label for="filterStatus" class="sr-only">Status</label>
		<select
			id="filterStatus"
			bind:value={currentStatus}
			onchange={applyFilters}
			class="w-full rounded-lg border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
		>
			<option value="">{$t('-- All Statuses --')}</option>
			{#each contractStatuses as status}<option value={status}
					>{$t('Status_' + status) || status}</option
				>{/each}
		</select>
	</div>
	<div>
		<label for="filterVendor" class="sr-only">Vendor</label>
		<select
			id="filterVendor"
			bind:value={currentVendor}
			onchange={applyFilters}
			class="w-full rounded-lg border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
		>
			<option value="">{$t('-- All Vendors --')}</option>
			{#each data.vendors as vendor (vendor.id)}
				<option value={String(vendor.id)}>{vendorOptionLabel(vendor)}</option>
			{/each}
		</select>
	</div>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Title')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Vendor')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Type')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Status')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Start Date')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('End Date')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Notice sent (GMT+7)</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Registered By')}</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Docs')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Actions')}</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if contracts.length === 0}
				<tr>
					<td colspan="10" class="py-12 text-center text-gray-500">
						{#if data.searchQuery || data.filters.status || data.filters.vendor}
							{$t('No vendor contracts found matching criteria')}
						{:else}
							{$t('No vendor contract data found')}
						{/if}
					</td>
				</tr>
			{:else}
				{#each contracts as contract (contract.id)}
					<tr class="hover:bg-gray-50">
						<td
							class="max-w-xs truncate px-4 py-3 font-medium text-gray-900"
							title={contract.title}
						>
							{contract.title}
							{#if contract.contract_number}
								<span class="block font-mono text-xs text-gray-500">{contract.contract_number}</span
								>
							{/if}
						</td>
						<td class="px-4 py-3 text-gray-600">{contract.vendor_name ?? '-'}</td>
						<td class="px-4 py-3 text-gray-600">{contract.type_name ?? '-'}</td>
						<td class="px-4 py-3">
							<span
								class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                                {contract.status === 'Active'
									? 'bg-green-100 text-green-800'
									: contract.status === 'Expired' || contract.status === 'Terminated'
										? 'bg-red-100 text-red-800'
										: contract.status === 'Draft'
											? 'bg-gray-100 text-gray-800'
											: 'bg-yellow-100 text-yellow-800'}"
							>
								{$t('Status_' + contract.status) || contract.status}
							</span>
						</td>
						<td class="whitespace-nowrap px-4 py-3 text-gray-600"
							>{formatDate(contract.start_date)}</td
						>
						<td class="whitespace-nowrap px-4 py-3 text-gray-600"
							>{formatDate(contract.end_date)}</td
						>
						<td class="whitespace-nowrap px-4 py-3 font-mono text-gray-600"
							>{formatOptionalDateTime(contract.notice_datetime)}</td
						>
						<td class="px-4 py-3 text-gray-600">{contract.owner_name ?? '-'}</td>
						<td class="px-4 py-3 text-center text-gray-500">
							{contract.documents?.length || 0}
						</td>
						<td class="whitespace-nowrap px-4 py-3">
							<div class="flex items-center gap-2">
								<button
									onclick={() => openModal('edit', contract)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
									aria-label={$t('Edit')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
									>
								</button>
								<button
									onclick={() => (contractToDelete = contract)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
									aria-label={$t('Delete')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg
									>
								</button>
							</div>
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

{#if data.totalPages > 1}
	<div class="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
		<div>
			<p class="text-sm text-gray-700">
				{$t('Showing page')} <span class="font-medium">{data.currentPage}</span>
				{$t('of')}
				<span class="font-medium">{data.totalPages}</span>
			</p>
		</div>
		<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
			<a
				href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'}
				onclick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
				class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 {data.currentPage ===
				1
					? 'pointer-events-none opacity-50'
					: ''}"
				aria-disabled={data.currentPage === 1}
				><span class="sr-only">{$t('Previous')}</span><svg
					class="h-5 w-5"
					viewBox="0 0 20 20"
					fill="currentColor"
					><path
						fill-rule="evenodd"
						d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
						clip-rule="evenodd"
					/></svg
				></a
			>
			{#each paginationRange as pageNum}
				{#if typeof pageNum === 'string'}<span
						class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300"
						>...</span
					>
				{:else}<a
						href={getPageUrl(pageNum)}
						onclick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
						class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum ===
						data.currentPage
							? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
							: 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'}"
						aria-current={pageNum === data.currentPage ? 'page' : undefined}>{pageNum}</a
					>{/if}
			{/each}
			<a
				href={data.currentPage < data.totalPages ? getPageUrl(data.currentPage + 1) : '#'}
				onclick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
				class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 {data.currentPage ===
				data.totalPages
					? 'pointer-events-none opacity-50'
					: ''}"
				aria-disabled={data.currentPage === data.totalPages}
				><span class="sr-only">{$t('Next')}</span><svg
					class="h-5 w-5"
					viewBox="0 0 20 20"
					fill="currentColor"
					><path
						fill-rule="evenodd"
						d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
						clip-rule="evenodd"
					/></svg
				></a
			>
		</nav>
	</div>
{/if}

{#if modalMode && selectedContract}
	<div
		transition:slide
		class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8 md:pt-16"
	>
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div
			class="relative flex w-full max-w-4xl transform flex-col rounded-xl bg-white shadow-2xl transition-all max-h-[90vh]"
		>
			<div class="flex-shrink-0 border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? $t('Add New Vendor Contract') : $t('Edit Contract')}
				</h2>
			</div>
			<form
				method="POST"
				action="?/saveContract"
				enctype="multipart/form-data"
				use:enhance={() => {
					isSavingContract = true;
					return async ({ result, update }) => {
						try {
							// reset/invalidateAll: false — default update() triggers invalidateAll and can stall the callback with multipart + modal binds
							await update({ reset: false, invalidateAll: false });
						} finally {
							isSavingContract = false;
						}
						if (result.type === 'success' && result.data) {
							const d = result.data as {
								action?: string;
								success?: boolean;
								message?: string;
								savedContract?: VendorContract;
							};
							if (d.action === 'saveContract' && d.success && d.savedContract) {
								const saved = d.savedContract;
								if (modalMode === 'add') {
									contracts = [saved, ...contracts];
								} else if (modalMode === 'edit') {
									contracts = contracts.map((c) => (c.id === saved.id ? saved : c));
								}
								closeModal();
								showGlobalMessage({
									success: true,
									text: d.message ?? 'Success',
									type: 'success'
								});
								queueMicrotask(() => void invalidateAll());
							} else if (d.action === 'saveContract' && d.message) {
								showGlobalMessage({
									success: false,
									text: d.message,
									type: 'error'
								});
							}
						} else if (result.type === 'failure' && result.data) {
							const d = result.data as { action?: string; message?: string };
							if (d.action === 'saveContract' && d.message) {
								showGlobalMessage({
									success: false,
									text: d.message,
									type: 'error'
								});
							}
						}
					};
				}}
				class="flex-1 overflow-y-auto"
			>
				<div class="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
					<div class="space-y-4 lg:col-span-2">
						{#if modalMode === 'edit'}<input
								type="hidden"
								name="id"
								value={selectedContract.id}
							/>{/if}

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="title" class="mb-1 block text-sm font-medium">{$t('Title')} *</label
								><input
									type="text"
									name="title"
									id="title"
									required
									bind:value={selectedContract.title}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="contract_number" class="mb-1 block text-sm font-medium"
									>{$t('Contract Number')}</label
								><input
									type="text"
									name="contract_number"
									id="contract_number"
									bind:value={selectedContract.contract_number}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<!-- VENDOR SEARCHABLE SELECT -->
							<div class="relative" use:clickOutside={() => (showVendorDropdown = false)}>
								<label for="vendor_search" class="mb-1 block text-sm font-medium"
									>{$t('Vendor')} *</label
								>
								<input type="hidden" name="vendor_id" value={selectedContract.vendor_id} />
								<input
									type="text"
									id="vendor_search"
									autocomplete="off"
									placeholder={$t('-- Search Vendor --')}
									bind:value={vendorSearch}
									onfocus={() => (showVendorDropdown = true)}
									oninput={() => {
										showVendorDropdown = true;
										selectedContract.vendor_id = '' as any;
									}}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
									required={!selectedContract.vendor_id}
								/>
								{#if showVendorDropdown}
									<ul
										class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
									>
										{#if filteredVendors.length === 0}
											<li class="relative select-none py-2 pl-3 pr-9 text-gray-500">
												{$t('No vendors found')}
											</li>
										{:else}
											{#each filteredVendors as vendor (vendor.id)}
												<li class="relative">
													<button
														type="button"
														class="w-full cursor-pointer select-none py-2 pl-3 pr-9 text-left text-gray-900 hover:bg-blue-600 hover:text-white"
														onclick={() => {
															selectedContract.vendor_id = vendor.id as any;
															vendorSearch = vendorOptionLabel(vendor);
															showVendorDropdown = false;
														}}
													>
														<span
															class="block truncate {selectedContract.vendor_id === vendor.id
																? 'font-semibold'
																: 'font-normal'}"
														>
															{vendorOptionLabel(vendor)}
														</span>
													</button>
												</li>
											{/each}
										{/if}
									</ul>
								{/if}
							</div>

							<div>
								<label for="contract_type_id" class="mb-1 block text-sm font-medium"
									>{$t('Contract Type')}</label
								><select
									name="contract_type_id"
									id="contract_type_id"
									bind:value={selectedContract.contract_type_id}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
								>
									<option value="">{$t('-- None --')}</option>
									{#each data.contractTypes as type (type.id)}<option value={type.id}
											>{type.name}</option
										>{/each}
								</select>
							</div>
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="status" class="mb-1 block text-sm font-medium">{$t('Status')} *</label
								><select
									name="status"
									id="status"
									required
									bind:value={selectedContract.status}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
									>{#each contractStatuses as status}<option value={status}
											>{$t('Status_' + status) || status}</option
										>{/each}</select
								>
							</div>
							<div>
								<label for="contract_value" class="mb-1 block text-sm font-medium"
									>{$t('Contract Value (Baht)')}</label
								><input
									type="text"
									id="contract_value"
									inputmode="decimal"
									value={contractValueDisplay}
									oninput={(e) => setContractValueFromDisplay((e.currentTarget as HTMLInputElement).value)}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
								<input type="hidden" name="contract_value" value={selectedContract.contract_value ?? ''} />
							</div>
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="start_date" class="mb-1 block text-sm font-medium"
									>{$t('Start Date')}</label
								><input
									type="date"
									name="start_date"
									id="start_date"
									bind:value={selectedContract.start_date}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="end_date" class="mb-1 block text-sm font-medium">{$t('End Date')}</label
								><input
									type="date"
									name="end_date"
									id="end_date"
									bind:value={selectedContract.end_date}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<input type="hidden" name="owner_user_id" value={selectedContract.owner_user_id ?? ''} />
							<div>
								<label for="renewal_notice_days" class="mb-1 block text-sm font-medium"
									>{$t('Renewal Notice (Days)')}</label
								><input
									type="number"
									name="renewal_notice_days"
									id="renewal_notice_days"
									bind:value={selectedContract.renewal_notice_days}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
						</div>

						<div>
							<label for="contractFiles" class="mb-1 block text-sm font-medium">
								{$t('Upload Document(s)')}
								{#if modalMode === 'add'}
									<span class="text-red-500">*</span>
								{:else}
									<span class="text-xs text-gray-500">{$t('(Optional: Add new version/file)')}</span
									>
								{/if}
							</label>
							<input
								type="file"
								bind:this={fileInputRef}
								onchange={handleFileChange}
								name="contractFiles"
								id="contractFiles"
								multiple
								required={modalMode === 'add'}
								accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
								class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
							/>
						</div>

						<div class="relative" use:clickOutside={() => (showRenewalEmailDropdown = false)}>
							<label for="renewal_notify_emails" class="mb-1 block text-sm font-medium">
								Renewal Notice Emails (per contract)
							</label>
							<div class="rounded-md border border-gray-300 bg-white p-2">
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
							{#each selectedRenewalNotifyEmails as email (email)}
								<input type="hidden" name="renewal_notify_emails" value={email} />
							{/each}
							<p class="mt-1 text-xs text-gray-500">
								ค้นหา, เลือกหลายคน และกด x เพื่อลบได้
							</p>
						</div>

						{#if form?.message && !form.success && form.action === 'saveContract'}
							<div class="rounded-md bg-red-50 p-3 text-sm text-red-600">
								<p><strong>{$t('Error:')}</strong> {form.message}</p>
							</div>
						{/if}
					</div>

					<div class="max-h-96 space-y-3 overflow-y-auto border-l lg:col-span-1 lg:pl-6">
						<h3 class="text-md sticky top-0 bg-white pb-2 font-semibold text-gray-700">
							{$t('Uploaded Documents')} ({documentsForSelectedContract.length})
						</h3>
						{#if documentsForSelectedContract.length === 0}
							<p class="text-sm italic text-gray-500">{$t('No documents uploaded yet.')}</p>
						{:else}
							{#each documentsForSelectedContract as doc (doc.id)}
								<div
									class="flex items-center justify-between rounded-md bg-gray-50 p-2 hover:bg-gray-100"
								>
									<div class="flex items-center gap-2 overflow-hidden">
										<span class="flex-shrink-0 text-lg">{getFileIcon(doc.file_original_name)}</span>
										<div class="truncate">
											<a
												href={doc.file_path}
												target="_blank"
												rel="noopener noreferrer"
												class="truncate text-sm text-blue-600 hover:underline"
												title={doc.file_original_name}>{doc.file_original_name}</a
											>
											<span class="block text-xs text-gray-400"
												>v{doc.version} | {formatOptionalDateTime(doc.uploaded_at)}</span
											>
										</div>
									</div>
									<button
										type="button"
										onclick={() => (documentToDelete = doc)}
										class="ml-2 flex-shrink-0 rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600"
										title={$t('Delete')}
										disabled={isDeletingDocument}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											><path d="M3 6h18" /><path
												d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
											/></svg
										>
									</button>
								</div>
							{/each}
						{/if}
					</div>
				</div>

				<div
					class="sticky bottom-0 mt-auto flex flex-shrink-0 justify-end gap-3 border-t bg-gray-50 p-4"
				>
					<button
						type="button"
						onclick={closeModal}
						class="rounded-md border bg-white px-4 py-2 text-sm">{$t('Cancel')}</button
					>
					<button
						type="submit"
						disabled={isSavingContract || !selectedContract.vendor_id}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:bg-blue-400 disabled:cursor-not-allowed"
					>
						{#if isSavingContract}
							{$t('Saving...')}
						{:else}
							{$t('Save Contract')}
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if contractToDelete}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">{$t('Confirm Delete Contract')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				{$t('Are you sure you want to delete contract')} "<strong>{contractToDelete.title}</strong
				>"?
				<br />{$t('All attachments will be deleted. This cannot be undone.')}
			</p>
			{#if form?.message && !form.success && form.action === 'deleteContract'}
				<p class="mt-2 text-sm text-red-600"><strong>{$t('Error:')}</strong> {form.message}</p>
			{/if}
			<form method="POST" action="?/deleteContract" use:enhance class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="id" value={contractToDelete.id} />
				<button
					type="button"
					onclick={() => (contractToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm">{$t('Cancel')}</button
				>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white"
					>{$t('Delete')}</button
				>
			</form>
		</div>
	</div>
{/if}

{#if documentToDelete}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">{$t('Delete document?')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				{$t('Are you sure you want to delete contract')} "<strong
					>{documentToDelete.file_original_name}</strong
				>" (v{documentToDelete.version})?
			</p>
			{#if form?.message && !form.success && form.action === 'deleteDocument'}
				<p class="mt-2 text-sm text-red-600"><strong>{$t('Error:')}</strong> {form.message}</p>
			{/if}
			<form
				method="POST"
				action="?/deleteDocument"
				use:enhance={() => {
					isDeletingDocument = true;
					return async ({ update }) => {
						await update();
						isDeletingDocument = false;
					};
				}}
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="document_id" value={documentToDelete.id} />
				<button
					type="button"
					onclick={() => (documentToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm"
					disabled={isDeletingDocument}>{$t('Cancel')}</button
				>
				<button
					type="submit"
					class="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
					disabled={isDeletingDocument}
				>
					{#if isDeletingDocument}
						{$t('Deleting...')}
					{:else}
						{$t('Delete')}
					{/if}
				</button>
			</form>
		</div>
	</div>
{/if}

<style>
	.max-h-96 {
		max-height: 24rem;
	}
</style>