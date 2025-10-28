<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation'; // For refreshing data

	// --- Types ---
	type VendorContract = PageData['contracts'][0];
    type VendorContractDocument = VendorContract['documents'][0];
    type Vendor = PageData['vendors'][0];
    type User = PageData['users'][0];
    type ContractType = PageData['contractTypes'][0];

	// --- Props & State ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

    // Use $state for reactive updates to the contracts list
	let contracts = $state<VendorContract[]>(data.contracts || []);

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedContract = $state<Partial<VendorContract> | null>(null);
	let contractToDelete = $state<VendorContract | null>(null);
    let isSavingContract = $state(false);

    // Filters
	let currentSearch = $state(data.searchQuery ?? '');
    let currentStatus = $state(data.filters.status ?? '');
    let currentVendor = $state(data.filters.vendor ?? '');

    // Global Messages
    let globalMessage = $state<{ success: boolean, text: string, type: 'success' | 'error' } | null>(null);
    let messageTimeout: NodeJS.Timeout;

    // Document Handling in Modal
    let documentsForSelectedContract = $state<VendorContractDocument[]>([]);
    let isUploadingDocument = $state(false);
    let uploadError = $state<string | null>(null);
    let documentToDelete = $state<VendorContractDocument | null>(null);
    let isDeletingDocument = $state(false);
    let fileInputRef: HTMLInputElement | null = $state(null);
	let isFileSelected = $state(false); // Track file input state

    // Contract Status Options
    const contractStatuses = ['Draft', 'Active', 'Expired', 'Terminated']; // Example statuses


	// --- Functions ---
	function openModal(mode: 'add' | 'edit', contract: VendorContract | null = null) {
		modalMode = mode;
        globalMessage = null; // Clear global message
        uploadError = null; // Clear upload error
        documentsForSelectedContract = []; // Clear previous docs
        if (fileInputRef) { fileInputRef.value = ''; isFileSelected = false; } // Reset file input

		if (mode === 'edit' && contract) {
			selectedContract = { ...contract }; // Copy for editing
            documentsForSelectedContract = contract.documents ? [...contract.documents] : []; // Load existing docs
		} else {
            // Defaults for a new contract
			selectedContract = {
                title: '',
                vendor_id: undefined, // Ensure it's undefined for required validation
                contract_type_id: null,
                status: 'Draft',
                start_date: new Date().toISOString().split('T')[0], // Default start date
                end_date: null,
                contract_value: null,
                owner_user_id: null,
                renewal_notice_days: 30
            };
		}
	}

	function closeModal() {
		modalMode = null;
		selectedContract = null;
        documentsForSelectedContract = [];
        uploadError = null;
        isFileSelected = false;
	}

    function showGlobalMessage(message: { success: boolean, text: string, type: 'success' | 'error' }, duration: number = 5000) {
        clearTimeout(messageTimeout);
        globalMessage = message;
        messageTimeout = setTimeout(() => { globalMessage = null; }, duration);
    }

    // --- Date & File Formatting ---
    function formatDateTime(isoString: string | Date | null | undefined): string {
		if (!isoString) return 'N/A';
		try {
            return new Date(isoString).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short'});
        } catch { return "Invalid Date"; }
	}
    function formatDate(isoString: string | Date | null | undefined): string {
        if (!isoString) return '-';
        try {
            return new Date(isoString).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
        } catch { return "Invalid Date"; }
    }
     function getFileIcon(fileName: string): string {
        const ext = fileName?.split('.').pop()?.toLowerCase() || '';
        if (['pdf'].includes(ext)) return '📄'; // PDF icon
        if (['doc', 'docx'].includes(ext)) return '📝'; // Word icon
        if (['xls', 'xlsx'].includes(ext)) return '📊'; // Excel icon
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️'; // Image icon
        return '📎'; // Generic attachment icon
    }
     function handleFileChange(event: Event) {
        const input = event.target as HTMLInputElement;
        isFileSelected = (input.files?.length ?? 0) > 0;
        uploadError = null; // Clear error on new selection
    }

    // --- Filtering Logic ---
    function applyFilters() {
        const url = new URL(window.location.href);
        url.searchParams.set('page', '1'); // Reset to page 1 on filter change
        if (currentSearch) url.searchParams.set('search', currentSearch); else url.searchParams.delete('search');
        if (currentStatus) url.searchParams.set('status', currentStatus); else url.searchParams.delete('status');
        if (currentVendor) url.searchParams.set('vendor', currentVendor); else url.searchParams.delete('vendor');
        window.location.href = url.toString(); // Use full page reload for simplicity with server-side filtering
    }


	// --- Reactive Effects ---
	$effect.pre(() => {
        // Handle saveContract results
        if (form?.action === 'saveContract') {
            if (form.success && form.savedContract) {
                const saved = form.savedContract as VendorContract;
                if (modalMode === 'add') {
                    // Add to the beginning of the list (or refetch)
                    contracts = [saved, ...contracts];
                } else if (modalMode === 'edit') {
                    // Update the existing contract in the list
                    contracts = contracts.map(c => c.id === saved.id ? saved : c);
                }
                closeModal();
                showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
                // Invalidate might still be useful if pagination/total count changes
                invalidateAll();
            } else if (form.message) {
                 showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
            }
             form.action = undefined;
        }

        // Handle deleteContract results
        if (form?.action === 'deleteContract') {
            if (form.success && form.deletedId) {
                contracts = contracts.filter(c => c.id !== form.deletedId); // Remove from local state
                showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
                invalidateAll(); // Refresh potentially changed pagination/total
            } else if (form.message) {
                showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
            }
            contractToDelete = null;
            form.action = undefined;
        }

        // --- Document Action Handlers (Update local state in modal) ---
        if (form?.action === 'uploadDocument' && modalMode === 'edit' && selectedContract?.id === form.newDocument?.vendor_contract_id) {
            if (form.success && form.newDocument) {
                documentsForSelectedContract = [form.newDocument as VendorContractDocument, ...documentsForSelectedContract];
                uploadError = null;
                if (fileInputRef) fileInputRef.value = '';
                isFileSelected = false;
            } else if (form.message) {
                uploadError = form.message as string;
            }
            form.action = undefined;
        }

        if (form?.action === 'deleteDocument' && modalMode === 'edit') {
             if (form.success && form.deletedDocumentId) {
                 if (documentsForSelectedContract.some(d => d.id === form.deletedDocumentId)) {
                    documentsForSelectedContract = documentsForSelectedContract.filter(d => d.id !== form.deletedDocumentId);
                 }
                documentToDelete = null;
            } else if (form.message) {
                 showGlobalMessage({ success: false, text: form.message as string, type: 'error' }); // Show globally if delete fails
                 documentToDelete = null;
            }
             form.action = undefined;
        }
	});

    // --- Pagination Logic ---
    const paginationRange = $derived(() => {
		const delta = 1; const left = data.currentPage - delta; const right = data.currentPage + delta + 1;
		const range: number[] = []; const rangeWithDots: (number | string)[] = []; let l: number | undefined;
		for (let i = 1; i <= data.totalPages; i++) { if (i == 1 || i == data.totalPages || (i >= left && i < right)) { range.push(i); } }
		for (const i of range) { if (l) { if (i - l === 2) { rangeWithDots.push(l + 1); } else if (i - l !== 1) { rangeWithDots.push('...'); } } rangeWithDots.push(i); l = i; }
		return rangeWithDots;
	});
	function getPageUrl(pageNum: number) {
        const params = new URLSearchParams();
        params.set('page', pageNum.toString());
        if (data.searchQuery) params.set('search', data.searchQuery);
        if (data.filters.status) params.set('status', data.filters.status);
        if (data.filters.vendor) params.set('vendor', data.filters.vendor);
        return `/vendor-contracts?${params.toString()}`; // Adjust path
    }
</script>

<svelte:head>
	<title>Vendor Contract Management</title>
</svelte:head>

<!-- Global Notifications -->
{#if globalMessage}
    <div transition:fade class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 font-semibold text-sm shadow-xl {globalMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
        {globalMessage.text}
    </div>
{/if}

<!-- Main Header -->
<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">Vendor Contract Management</h1>
		<p class="mt-1 text-sm text-gray-500">จัดการสัญญาสำหรับซัพพลายเออร์ / ผู้จัดจำหน่าย</p>
	</div>
	<button onclick={() => openModal('add')} class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
		เพิ่มสัญญา Vendor ใหม่
	</button>
</div>

<!-- Filters -->
<div class="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
    <div class="relative">
        <label for="search" class="sr-only">Search</label>
        <input type="search" id="search" bind:value={currentSearch} onchange={applyFilters} placeholder="ค้นหาชื่อ, เลขที่, Vendor..." class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"/>
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" /></svg>
        </div>
    </div>
    <div>
        <label for="filterStatus" class="sr-only">Status</label>
        <select id="filterStatus" bind:value={currentStatus} onchange={applyFilters} class="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm">
            <option value="">-- ทุกสถานะ --</option>
            {#each contractStatuses as status}<option value={status}>{status}</option>{/each}
        </select>
    </div>
     <div>
        <label for="filterVendor" class="sr-only">Vendor</label>
        <select id="filterVendor" bind:value={currentVendor} onchange={applyFilters} class="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm">
            <option value="">-- ทุก Vendor --</option>
            {#each data.vendors as vendor (vendor.id)}<option value={vendor.id}>{vendor.name}</option>{/each}
        </select>
    </div>
</div>

<!-- Contracts Table -->
<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Title</th>
                <th class="px-4 py-3 text-left font-semibold text-gray-600">Vendor</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Start Date</th>
                <th class="px-4 py-3 text-left font-semibold text-gray-600">End Date</th>
                <th class="px-4 py-3 text-center font-semibold text-gray-600">Docs</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if contracts.length === 0}
				<tr>
					<td colspan="8" class="py-12 text-center text-gray-500">
						{#if data.searchQuery || data.filters.status || data.filters.vendor}
                            ไม่พบสัญญา Vendor ตามเงื่อนไขที่กำหนด
                        {:else}
                            ไม่พบข้อมูลสัญญา Vendor
                        {/if}
					</td>
				</tr>
			{:else}
				{#each contracts as contract (contract.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 font-medium text-gray-900 max-w-xs truncate" title={contract.title}>
                            {contract.title}
                            {#if contract.contract_number}
                                <span class="block text-xs text-gray-500 font-mono">{contract.contract_number}</span>
                            {/if}
                        </td>
                        <td class="px-4 py-3 text-gray-600">{contract.vendor_name ?? 'N/A'}</td>
						<td class="px-4 py-3 text-gray-600">{contract.type_name ?? 'N/A'}</td>
						<td class="px-4 py-3">
                            <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                                {contract.status === 'Active' ? 'bg-green-100 text-green-800' :
                                 contract.status === 'Expired' || contract.status === 'Terminated' ? 'bg-red-100 text-red-800' :
                                 contract.status === 'Draft' ? 'bg-gray-100 text-gray-800' :
                                 'bg-yellow-100 text-yellow-800'}">
                                {contract.status}
                            </span>
                        </td>
						<td class="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(contract.start_date)}</td>
                        <td class="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(contract.end_date)}</td>
                        <td class="px-4 py-3 text-center text-gray-500">
                            {contract.documents?.length || 0}
                        </td>
						<td class="px-4 py-3 whitespace-nowrap">
							<div class="flex items-center gap-2">
								<button onclick={() => openModal('edit', contract)} class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600" aria-label="Edit contract">
									<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
								</button>
								<button onclick={() => (contractToDelete = contract)} class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600" aria-label="Delete contract">
									<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
								</button>
							</div>
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

<!-- Pagination Controls -->
{#if data.totalPages > 1}
	<div class="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
		<div><p class="text-sm text-gray-700">Page <span class="font-medium">{data.currentPage}</span> of <span class="font-medium">{data.totalPages}</span></p></div>
		<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
			<a href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'} class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 {data.currentPage === 1 ? 'pointer-events-none opacity-50' : ''}" aria-disabled={data.currentPage === 1}><span class="sr-only">Previous</span><svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" /></svg></a>
			{#each paginationRange as pageNum}
				{#if typeof pageNum === 'string'}<span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300">...</span>
				{:else}<a href={getPageUrl(pageNum)} class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum === data.currentPage ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600' : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'}" aria-current={pageNum === data.currentPage ? 'page' : undefined}>{pageNum}</a>{/if}
			{/each}
			<a href={data.currentPage < data.totalPages ? getPageUrl(data.currentPage + 1) : '#'} class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 {data.currentPage === data.totalPages ? 'pointer-events-none opacity-50' : ''}" aria-disabled={data.currentPage === data.totalPages}><span class="sr-only">Next</span><svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" /></svg></a>
		</nav>
	</div>
{/if}


<!-- Add/Edit Vendor Contract Modal -->
{#if modalMode && selectedContract}
	<div transition:slide class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8 md:pt-16">
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div class="relative w-full max-w-4xl transform rounded-xl bg-white shadow-2xl transition-all max-h-[90vh] flex flex-col">
			<div class="border-b px-6 py-4 flex-shrink-0">
				<h2 class="text-lg font-bold text-gray-900">{modalMode === 'add' ? 'เพิ่มสัญญา Vendor ใหม่' : 'แก้ไขสัญญา Vendor'}</h2>
			</div>

            <!-- Contract Details Form -->
			<form method="POST" action="?/saveContract" enctype="multipart/form-data" use:enhance={() => { isSavingContract = true; return async ({ update }) => { await update(); isSavingContract = false; }; }} class="flex-1 overflow-y-auto">
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
                    <!-- Column 1: Core Info -->
                    <div class="lg:col-span-2 space-y-4">
                        {#if modalMode === 'edit'}<input type="hidden" name="id" value={selectedContract.id} />{/if}

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div><label for="title" class="mb-1 block text-sm font-medium">Title *</label><input type="text" name="title" id="title" required bind:value={selectedContract.title} class="w-full rounded-md border-gray-300 text-sm"/></div>
                            <div><label for="contract_number" class="mb-1 block text-sm font-medium">Contract Number</label><input type="text" name="contract_number" id="contract_number" bind:value={selectedContract.contract_number} class="w-full rounded-md border-gray-300 text-sm"/></div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                             <div><label for="vendor_id" class="mb-1 block text-sm font-medium">Vendor *</label><select name="vendor_id" id="vendor_id" required bind:value={selectedContract.vendor_id} class="w-full rounded-md border-gray-300 text-sm"><option value={undefined} disabled>-- Select Vendor --</option>{#each data.vendors as vendor (vendor.id)}<option value={vendor.id}>{vendor.name}</option>{/each}</select></div>
                             <div><label for="contract_type_id" class="mb-1 block text-sm font-medium">Contract Type</label><select name="contract_type_id" id="contract_type_id" bind:value={selectedContract.contract_type_id} class="w-full rounded-md border-gray-300 text-sm"><option value={null}>-- None --</option>{#each data.contractTypes as type (type.id)}<option value={type.id}>{type.name}</option>{/each}</select></div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div><label for="status" class="mb-1 block text-sm font-medium">Status *</label><select name="status" id="status" required bind:value={selectedContract.status} class="w-full rounded-md border-gray-300 text-sm">{#each contractStatuses as status}<option value={status}>{status}</option>{/each}</select></div>
                            <div><label for="contract_value" class="mb-1 block text-sm font-medium">Contract Value (Baht)</label><input type="number" step="0.01" name="contract_value" id="contract_value" bind:value={selectedContract.contract_value} class="w-full rounded-md border-gray-300 text-sm"/></div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div><label for="start_date" class="mb-1 block text-sm font-medium">Start Date</label><input type="date" name="start_date" id="start_date" bind:value={selectedContract.start_date} class="w-full rounded-md border-gray-300 text-sm"/></div>
                            <div><label for="end_date" class="mb-1 block text-sm font-medium">End Date</label><input type="date" name="end_date" id="end_date" bind:value={selectedContract.end_date} class="w-full rounded-md border-gray-300 text-sm"/></div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div><label for="owner_user_id" class="mb-1 block text-sm font-medium">Owner (Internal)</label><select name="owner_user_id" id="owner_user_id" bind:value={selectedContract.owner_user_id} class="w-full rounded-md border-gray-300 text-sm"><option value={null}>-- None --</option>{#each data.users as user (user.id)}<option value={user.id}>{user.full_name}</option>{/each}</select></div>
                            <div><label for="renewal_notice_days" class="mb-1 block text-sm font-medium">Renewal Notice (Days)</label><input type="number" name="renewal_notice_days" id="renewal_notice_days" bind:value={selectedContract.renewal_notice_days} class="w-full rounded-md border-gray-300 text-sm"/></div>
                        </div>

                         <!-- File Upload Input -->
                        <div>
                            <label for="contractFiles" class="mb-1 block text-sm font-medium">
                                Upload Document(s)
                                {#if modalMode === 'add'} <span class="text-red-500">*</span> {:else} <span class="text-xs text-gray-500">(Optional: Add new version/file)</span> {/if}
                            </label>
                            <input
                                type="file"
                                name="contractFiles"
                                id="contractFiles"
                                multiple
                                required={modalMode === 'add'}
                                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
                                class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                            />
                        </div>

                        {#if form?.message && !form.success && form.action === 'saveContract'}
                            <div class="rounded-md bg-red-50 p-3 text-sm text-red-600"><p><strong>Error:</strong> {form.message}</p></div>
                        {/if}
                    </div>

                    <!-- Column 2: Document List -->
                    <div class="lg:col-span-1 space-y-3 border-l lg:pl-6 max-h-96 overflow-y-auto">
                        <h3 class="text-md font-semibold text-gray-700 sticky top-0 bg-white pb-2">
                            Uploaded Documents ({documentsForSelectedContract.length})
                        </h3>
                        {#if documentsForSelectedContract.length === 0}
                            <p class="text-sm text-gray-500 italic">No documents uploaded yet.</p>
                        {:else}
                            {#each documentsForSelectedContract as doc (doc.id)}
                                <div class="flex items-center justify-between rounded-md bg-gray-50 p-2 hover:bg-gray-100">
                                    <div class="flex items-center gap-2 overflow-hidden">
                                        <span class="text-lg flex-shrink-0">{getFileIcon(doc.file_original_name)}</span>
                                        <div class="truncate">
                                            <a href={doc.file_path} target="_blank" rel="noopener noreferrer" class="truncate text-sm text-blue-600 hover:underline" title={doc.file_original_name}>{doc.file_original_name}</a>
                                            <span class="block text-xs text-gray-400">v{doc.version} | {formatDateTime(doc.uploaded_at)}</span>
                                        </div>
                                    </div>
                                    <button type="button" onclick={() => (documentToDelete = doc)} class="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600 flex-shrink-0 ml-2" title="Delete this document" disabled={isDeletingDocument}>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                                    </button>
                                </div>
                            {/each}
                        {/if}
                         <!-- Placeholder for Upload Additional Doc Form if needed later -->
                        {#if modalMode === 'edit'}
                         <!-- Can add a separate form here action="?/uploadDocument" if needed -->
                        {/if}
                    </div>
				</div>

                <!-- Sticky Footer -->
                <div class="flex justify-end gap-3 border-t bg-gray-50 p-4 mt-auto flex-shrink-0 sticky bottom-0">
					<button type="button" onclick={closeModal} class="rounded-md border bg-white px-4 py-2 text-sm">Cancel</button>
					<button type="submit" disabled={isSavingContract} class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:bg-blue-400">
						{#if isSavingContract} Saving... {:else} Save Contract {/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Contract Confirmation Modal -->
{#if contractToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">ยืนยันการลบสัญญา</h3>
			<p class="mt-2 text-sm text-gray-600">คุณแน่ใจหรือไม่ที่จะลบสัญญา "<strong>{contractToDelete.title}</strong>"? เอกสารแนบทั้งหมดจะถูกลบไปด้วย ไม่สามารถย้อนกลับได้</p>
            {#if form?.message && !form.success && form.action === 'deleteContract'} <p class="mt-2 text-sm text-red-600"><strong>Error:</strong> {form.message}</p> {/if}
			<form method="POST" action="?/deleteContract" use:enhance class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="id" value={contractToDelete.id} />
				<button type="button" onclick={() => (contractToDelete = null)} class="rounded-md border bg-white px-4 py-2 text-sm">Cancel</button>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white">Delete</button>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Document Confirmation Modal -->
{#if documentToDelete}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="alertdialog">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">ยืนยันการลบเอกสาร</h3>
			<p class="mt-2 text-sm text-gray-600">คุณแน่ใจหรือไม่ที่จะลบเอกสาร "<strong>{documentToDelete.file_original_name}</strong>" (v{documentToDelete.version})?</p>
            {#if form?.message && !form.success && form.action === 'deleteDocument'} <p class="mt-2 text-sm text-red-600"><strong>Error:</strong> {form.message}</p> {/if}
			<form method="POST" action="?/deleteDocument" use:enhance={() => { isDeletingDocument = true; return async ({ update }) => { await update(); isDeletingDocument = false; }; }} class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="document_id" value={documentToDelete.id} />
				<button type="button" onclick={() => (documentToDelete = null)} class="rounded-md border bg-white px-4 py-2 text-sm" disabled={isDeletingDocument}>Cancel</button>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={isDeletingDocument}>
                    {#if isDeletingDocument} Deleting... {:else} Delete {/if}
                </button>
			</form>
		</div>
	</div>
{/if}

<style>
    .max-h-96 { max-height: 24rem; } /* For document list scroll */
</style>