<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
    import { invalidateAll, goto } from '$app/navigation';
    import Select from 'svelte-select'; 
    import { browser } from '$app/environment'; 
    // --- NEW: PaymentDetailModal is NO LONGER needed here ---

	// --- Types (Exported for use in the separate component) ---
    export type Vendor = PageData['vendors'][0];
    export type Unit = PageData['units'][0];
    export type VendorContract = PageData['contracts'][0];
    export type Product = PageData['products'][0];
    export type PaymentHeader = PageData['payments'][0];
    
    // *** MODIFIED: Added product_object for select binding ***
    export interface BillPaymentItem {
        id: string;
        product_object: { value: number, label: string, product: Product } | null; // For svelte-select
        product_id: number | null; // For server submission
        description: string;
        quantity: number;
        unit_id: number | null;
        unit_price: number;
        line_total: number;
    }


	// --- Props & State (Svelte 5 Runes) ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

    // --- List/Filter State ---
    let searchQuery = $state(data.searchQuery ?? '');
    let filterVendor = $state(data.filters?.vendor ?? '');
    let filterStatus = $state(data.filters?.status ?? '');
    
    // *** === THIS IS THE FIX === ***
    // We use $derived instead of $state.
    // This ensures 'payments' will always reflect the current 'data.payments' prop.
    // When invalidateAll() runs, 'data' updates, and $derived recalculates 'payments'.
    const payments = $derived(data.payments || []);
    // *** === END OF FIX === ***

    // --- New Payment Form Fields (Moved to a New Modal) ---
    let isCreateModalOpen = $state(false);
    let vendor_id = $state<number | undefined>(undefined);
    let vendor_contract_id = $state<number | undefined>(undefined);
    let payment_date = $state(new Date().toISOString().split('T')[0]);
    let payment_reference = $state('');
    let notes = $state('');
    let items = $state<BillPaymentItem[]>([]);
    // *** FIX 2: Correct initialization to null to avoid ReferenceError ***
    let attachments = $state<FileList | null>(null); 
    let discountAmount = $state(0);
    let calculateWithholdingTax = $state(false);
    let withholdingTaxRate = $state(7);

    // --- Detail/Action State ---
    // Removed isDetailModalOpen, detailData, detailLoading, isStatusChanging
    let paymentToDelete = $state<PaymentHeader | null>(null);
    let isDeleting = $state(false);

    // UI state
    let isSaving = $state(false);
    let globalMessage = $state<{ text: string, type: 'success' | 'error' } | null>(null);
    let messageTimeout: NodeJS.Timeout;


    // *** FIX 3: DECLARE showGlobalMessage function in the root script scope ***
    function showGlobalMessage(text: string, type: 'success' | 'error', duration = 5000) {
        clearTimeout(messageTimeout);
        globalMessage = { text, type };
        messageTimeout = setTimeout(() => { globalMessage = null; }, duration);
    }
    // *** END FIX 3 ***


    // --- Derived Calculations ---
    const subTotal = $derived(items.reduce((sum, item) => sum + item.line_total, 0));
    const totalAfterDiscount = $derived(subTotal - (discountAmount || 0));
    const withholdingTaxAmount = $derived(
        calculateWithholdingTax
            ? parseFloat((totalAfterDiscount * (withholdingTaxRate / 100)).toFixed(2))
            : 0
    );
    const grandTotal = $derived(totalAfterDiscount - withholdingTaxAmount);

    // --- Derived Contracts ---
    const filteredContracts = $derived(
        vendor_id ? data.contracts.filter(c => c.vendor_id === vendor_id) : []
    );

    // Format products for svelte-select
    // *******************************************************************
    // ** การแก้ไข: จำกัดรายการสินค้าใน Dropdown ให้แสดง 3 รายการแรกเท่านั้น **
    // *******************************************************************
    const productOptions = $derived(
        data.products.map(p => ({
            value: p.id,
            // *** FIX 4: Correct the product name display in Select options ***
            label: `${p.sku} - ${p.name}`, 
            product: p // Keep original product data in option
        }))
    );
    
    // --- Pagination Logic ---
    const paginationRange = $derived(() => {
        if (!data.totalPages || data.totalPages <= 1) return [];
		const delta = 1; const left = data.currentPage - delta; const right = data.currentPage + delta + 1;
		const range: number[] = []; const rangeWithDots: (number | string)[] = []; let l: number | undefined;
		for (let i = 1; i <= data.totalPages; i++) { if (i == 1 || i == data.totalPages || (i >= left && i < right)) { range.push(i); } }
		for (const i of range) { if (l) { if (i - l === 2) { rangeWithDots.push(l + 1); } else if (i - l !== 1) { rangeWithDots.push('...'); } } rangeWithDots.push(i); l = i; }
		return rangeWithDots;
	});
	function getPageUrl(pageNum: number) { 
        const params = new URLSearchParams();
        params.set('page', pageNum.toString());
        if (searchQuery) params.set('search', searchQuery);
        if (filterVendor) params.set('vendor', filterVendor);
        if (filterStatus) params.set('status', filterStatus);
        return `/bill-payments?${params.toString()}`;
    }
    function applyFilters() {
         goto(getPageUrl(1)); // Reset to page 1 on filter change
    }

	// --- General Functions ---
    function formatCurrency(value: number | null | undefined, currency: string = 'THB') {
        if (value === null || value === undefined) return '-';
        return new Intl.NumberFormat('th-TH', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }
    function formatDateTime(isoString: string | null | undefined): string {
		if (!isoString) return 'N/A';
		try { return new Date(isoString).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short'}); } catch { return "Invalid Date"; }
	}
    function formatDateOnly(isoString: string | null | undefined): string {
        if (!isoString) return '-';
        try { return new Date(isoString).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return "Invalid Date"; }
    }
    function getStatusClass(status: PaymentHeader['status']) {
        return {
            'Draft': 'bg-gray-100 text-gray-800',
            'Submitted': 'bg-blue-100 text-blue-800',
            'Paid': 'bg-green-100 text-green-800',
            'Void': 'bg-red-100 text-red-800'
        }[status] || 'bg-yellow-100 text-yellow-800';
    }
     function getFileIcon(fileName: string): string {
        const ext = fileName?.split('.').pop()?.toLowerCase() || '';
        if (['pdf'].includes(ext)) return '📄';
        if (['doc', 'docx'].includes(ext)) return '📝';
        if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
        return '📎';
    }

    // --- Form/Modal Functions ---
    function closeCreateModal() { isCreateModalOpen = false; }
    
    // *** MODIFIED: Add product_object: null ***
    function addLineItem() {
        items = [
            ...items,
            { id: crypto.randomUUID(), product_object: null, product_id: null, description: '', quantity: 1, unit_id: null, unit_price: 0, line_total: 0 }
        ];
    }

    function removeLineItem(idToRemove: string) {
        items = items.filter(item => item.id !== idToRemove);
    }

    function updateLineTotal(item: BillPaymentItem) {
        item.line_total = (item.quantity || 0) * (item.unit_price || 0);
        items = [...items]; // Trigger reactivity
    }

    // *** REVISED FUNCTION: Renamed and logic updated for bind:value ***
    // This function now reacts to the *change* event, which fires *after* bind:value updates item.product_object
    function onProductSelectChange(item: BillPaymentItem) { 
        const selectedOption = item.product_object; // Get value from the bound object
        
        if (!selectedOption) {
            item.product_id = null; // Set ID to null
            item.description = '';
            item.unit_id = null;
            item.unit_price = 0;
        } else {
            const selectedProduct = selectedOption.product;
            if (selectedProduct) {
                item.product_id = selectedOption.value; // Set the ID
                item.description = selectedProduct.name;
                item.unit_id = selectedProduct.unit_id;
                item.unit_price = selectedProduct.purchase_cost ?? 0;
            }
        }
        updateLineTotal(item); 
    }


    function onVendorChange() {
        vendor_contract_id = undefined;
    }
    
    function resetForm() {
        vendor_id = undefined;
        vendor_contract_id = undefined;
        payment_date = new Date().toISOString().split('T')[0];
        payment_reference = '';
        notes = '';
        items = [];
        discountAmount = 0;
        calculateWithholdingTax = false;
        withholdingTaxRate = 7;
        attachments = null;
        const fileInput = document.getElementById('attachments_modal') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
    }
    
    // --- Detail Modal Functions (Removed internal logic) ---
    // openDetailModal and related detail states are REMOVED 
    // in favor of direct navigation to /bill-payments/[id]
    

	// --- Reactive Effects for Form ---
	$effect.pre(() => {
        // Handle savePayment results
        if (form?.action === 'savePayment') {
            if (form.success) {
                showGlobalMessage(form.message as string, 'success');
                resetForm();
                isCreateModalOpen = false;
                // *** MODIFIED: Force redirect to reload data ***
                goto('/bill-payments', { invalidateAll: true });
            } else if (form.message) {
                 showGlobalMessage(form.message as string, 'error');
            }
             form.action = undefined;
        }
        
        // Handle deletePayment results
        if (form?.action === 'deletePayment') {
            if (form.success) {
                showGlobalMessage(form.message as string, 'success');
                // *** FIX: Invalidate and ensure the modal is closed ***
                paymentToDelete = null; // Close modal
                invalidateAll(); 
            } else if (form.message) {
                showGlobalMessage(form.message as string, 'error');
                // Do not close modal on error, show the error inside the modal
            }
            // form.action = undefined; // Consuming form.action is done by enhance function/SvelteKit
        }
	});

</script>

<svelte:head>
	<title>รายการจ่ายเงิน (Bill Payments)</title>
    <!-- CSS for svelte-select -->
    <link rel="stylesheet" href="https://unpkg.com/svelte-select@latest/dist/stylesheet.css">
</svelte:head>

<!-- Global Notifications -->
{#if globalMessage}
    <div
        transition:fade
        class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 font-semibold text-sm shadow-xl {globalMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}"
    >
        {globalMessage.text}
    </div>
{/if}

<!-- Main Header -->
<div class="mb-6 flex justify-between items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">รายการจ่ายเงิน (Bill Payments)</h1>
		<p class="mt-1 text-sm text-gray-500">บันทึกการชำระเงินให้แก่ผู้จัดจำหน่าย/ซัพพลายเออร์</p>
	</div>
    <button onclick={() => { isCreateModalOpen = true; addLineItem(); }} class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        สร้างรายการใหม่
    </button>
</div>

<!-- Filters -->
<div class="mb-4 grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
    <div class="relative">
        <label for="search" class="sr-only">Search</label>
        <input type="search" id="search" bind:value={searchQuery} placeholder="ค้นหาเลขที่อ้างอิง หรือ Vendor..." class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm" onchange={applyFilters}/>
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
             <svg class="h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" /></svg>
        </div>
    </div>
    <div>
        <label for="filterVendor" class="sr-only">Vendor</label>
        <select id="filterVendor" bind:value={filterVendor} onchange={applyFilters} class="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm">
            <option value="">-- ทุก Vendor --</option>
            {#each data.vendors as vendor (vendor.id)}<option value={vendor.id}>{vendor.name}</option>{/each}
        </select>
    </div>
    <div>
        <label for="filterStatus" class="sr-only">Status</label>
        <select id="filterStatus" bind:value={filterStatus} onchange={applyFilters} class="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm">
            <option value="">-- ทุกสถานะ --</option>
             {#each data.availableStatuses as status}<option value={status}>{status}</option>{/each}
        </select>
    </div>
    <div class="flex items-center">
         <button type="button" onclick={applyFilters} class="w-full px-4 py-2 bg-blue-500 text-white rounded-lg shadow-sm hover:bg-blue-600 transition text-sm">Apply Filters</button>
    </div>
</div>

<!-- Payments Table -->
<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
                <th class="px-4 py-3 text-left font-semibold text-gray-600">ID</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Reference</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Vendor</th>
                <th class="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
				<th class="px-4 py-3 text-right font-semibold text-gray-600">Amount</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                <th class="px-4 py-3 text-left font-semibold text-gray-600">Prepared By</th>
                <th class="px-4 py-3 text-center font-semibold text-gray-600">Docs</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if payments.length === 0}
				<tr>
					<td colspan="10" class="py-12 text-center text-gray-500">
						ไม่พบรายการจ่ายเงิน
					</td>
				</tr>
			{:else}
				{#each payments as payment (payment.id)}
					<tr class="hover:bg-gray-50">
                        <td class="px-4 py-3 font-mono text-xs text-gray-700">#{payment.id}</td>
						<td class="px-4 py-3 font-medium text-gray-900">{payment.payment_reference ?? '-'}</td>
                        <td class="px-4 py-3 text-gray-600">{payment.vendor_name}</td>
						<td class="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDateOnly(payment.payment_date)}</td>
						<td class="px-4 py-3 text-right font-semibold text-green-700">{formatCurrency(payment.total_amount)}</td>
						<td class="px-4 py-3">
                            <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getStatusClass(payment.status)}">
                                {payment.status}
                            </span>
                        </td>
                        <td class="px-4 py-3 text-gray-600">{payment.prepared_by_user_name}</td>
                        <td class="px-4 py-3 text-center text-gray-500">{payment.attachment_count}</td>
						<td class="px-4 py-3 whitespace-nowrap">
							<div class="flex items-center gap-2">
                                <a href="/bill-payments/{payment.id}" class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600" aria-label="View Details" title="View Details">
									<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
								</a>
                                <!-- TODO: Add Edit functionality -->
								<button onclick={() => (paymentToDelete = payment)} class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600" aria-label="Delete payment" title="Delete Payment">
									<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
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


<!-- MODAL: Create New Bill Payment -->
{#if isCreateModalOpen}
	<div 
        transition:slide 
        class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-4 md:pt-8"
    >
		<div class="fixed inset-0" onclick={closeCreateModal} role="presentation"></div>
		<div class="relative w-full max-w-7xl transform rounded-xl bg-white shadow-2xl transition-all max-h-[95vh] flex flex-col">
			<div class="border-b px-6 py-4 flex-shrink-0">
				<h2 class="text-lg font-bold text-gray-900">บันทึกรายการจ่ายเงินใหม่</h2>
			</div>

            <!-- Form -->
            <form
                method="POST"
                action="?/savePayment"
                enctype="multipart/form-data"
                use:enhance={({ formData }) => {
                    isSaving = true;
                    globalMessage = null;

                    // Prepare JSON data for line items
                    formData.set('itemsJson', JSON.stringify(
                        items.map(item => ({
                            // *** REVISED LOGIC: Send item.product_id (the number) ***
                            product_id: item.product_id,
                            description: item.description,
                            quantity: item.quantity,
                            unit_id: item.unit_id,
                            unit_price: item.unit_price,
                            line_total: item.line_total,
                        }))
                    ));
                    formData.set('discountAmount', (discountAmount || 0).toString());
                    formData.set('calculateWithholdingTax', (calculateWithholdingTax || false).toString());
                    formData.set('withholdingTaxRate', withholdingTaxRate.toString()); // Pass the rate

                    return async ({ update }) => {
                        await update({ reset: false });
                        isSaving = false;
                    };
                }}
                class="flex-1 overflow-y-auto"
            >
                 <div class="space-y-6 p-6">
                    <!-- Header Section -->
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label for="vendor_id_modal" class="block text-sm font-medium text-gray-700 mb-1">ผู้จัดจำหน่าย (Vendor) <span class="text-red-500">*</span></label>
                            <select id="vendor_id_modal" name="vendor_id" bind:value={vendor_id} required onchange={onVendorChange} class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                                <option value={undefined} disabled>-- เลือก Vendor --</option>
                                {#each data.vendors as vendor (vendor.id)}
                                    <option value={vendor.id}>{vendor.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div>
                            <label for="vendor_contract_id_modal" class="block text-sm font-medium text-gray-700 mb-1">สัญญา (Contract)</label>
                            <select
                                id="vendor_contract_id_modal"
                                name="vendor_contract_id"
                                bind:value={vendor_contract_id}
                                class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                disabled={!vendor_id || filteredContracts.length === 0}
                            >
                                <option value={undefined}>-- ไม่ผูกกับสัญญา --</option>
                                {#each filteredContracts as contract (contract.id)}
                                    <option value={contract.id}>{contract.contract_number ? `${contract.contract_number} - ` : ''}{contract.title}</option>
                                {/each}
                            </select>
                        </div>
                        <div>
                            <label for="payment_date_modal" class="block text-sm font-medium text-gray-700 mb-1">วันที่จ่ายเงิน <span class="text-red-500">*</span></label>
                            <input type="date" id="payment_date_modal" name="payment_date" bind:value={payment_date} required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
                        </div>
                         <div>
                            <label for="payment_reference_modal" class="block text-sm font-medium text-gray-700 mb-1">เลขที่อ้างอิง (ถ้ามี)</label>
                            <input type="text" id="payment_reference_modal" name="payment_reference" bind:value={payment_reference} class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="e.g., Check #123" />
                        </div>
                    </div>
                    
                    <!-- Line Items Section -->
                    <div>
                        <h3 class="text-md font-semibold text-gray-800 mb-2">รายการจ่าย</h3>
                        <div class="overflow-x-auto rounded border border-gray-200">
                            <table class="min-w-full divide-y divide-gray-200 text-sm">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-3 py-2 text-left font-medium text-gray-500 w-10">#</th>
                                        <!-- *** MODIFIED WIDTH: w-[25%] *** -->
                                        <th class="px-3 py-2 text-left font-semibold text-gray-400 w-[25%]">สินค้า/บริการ (Product) <span class="text-red-500">*</span></th>
                                        <!-- *** MODIFIED WIDTH: min-w-[250px] *** -->
                                        <th class="px-3 py-2 text-left font-semibold text-gray-600 min-w-[250px]">รายละเอียด</th>
                                        <th class="px-3 py-2 text-right font-semibold text-gray-600 w-[100px]">จำนวน <span class="text-red-500"></span></th>
                                        <th class="px-3 py-2 text-left font-semibold text-gray-600 w-[130px]">หน่วย</th>
                                        <th class="px-3 py-2 text-right font-semibold text-gray-600 w-[120px]">ราคา/หน่วย <span class="text-red-500"></span></th>
                                        <th class="px-3 py-2 text-right font-semibold text-gray-600 w-[120px]">ราคารวม</th>
                                        <th class="px-3 py-2 text-center font-semibold text-gray-600 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-200 bg-white">
                                    {#if items.length === 0}
                                        <tr><td colspan="8" class="py-4 text-center text-gray-500 italic">-- กด "เพิ่มรายการ" เพื่อเริ่มต้น --</td></tr>
                                    {/if}
                                    {#each items as item, index (item.id)}
                                        <tr class="hover:bg-gray-50 align-top">
                                            <td class="px-3 py-2 text-gray-500">{index + 1}</td>
                                            <td class="px-3 py-2">
                                                <!-- *** REVISED: Use bind:value and on:change *** -->
                                                <Select
                                                    items={productOptions}
                                                    bind:value={item.product_object}
                                                    on:change={() => onProductSelectChange(item)}
                                                    on:clear={() => {
                                                        item.product_object = null; // Manually clear for bind:value
                                                        onProductSelectChange(item);
                                                    }}
                                                    placeholder="-- ค้นหา/เลือกสินค้า --"
                                                    required
                                                    listPlacement="bottom"
                                                    container={browser ? document.body : null} 
                                                    --inputStyles="padding: 2px 0;"
                                                    --itemIsActive="background: #e0f2fe;"
                                                    --list="border-radius: 6px;"
                                                >
                                                </Select>
                                            </td>
                                            <td class="px-3 py-2">
                                                <input type="text" bind:value={item.description} placeholder="รายละเอียดเพิ่มเติม..." class="w-full rounded-md border-gray-300 text-sm py-1" />
                                            </td>
                                            <td class="px-3 py-2">
                                                <input type="number" step="any" min="0" bind:value={item.quantity} oninput={() => updateLineTotal(item)} class="w-full rounded-md border-gray-300 text-sm text-right py-1" />
                                            </td>
                                            <td class="px-3 py-2">
                                                 <select bind:value={item.unit_id} class="w-full rounded-md border-gray-300 text-sm py-1">
                                                    <option value={null}>-- N/A --</option>
                                                    {#each data.units as unit (unit.id)}
                                                        <option value={unit.id}>{unit.symbol}</option>
                                                    {/each}
                                                </select>
                                            </td>
                                            <td class="px-3 py-2">
                                                <input type="number" step="any" min="0" bind:value={item.unit_price} oninput={() => updateLineTotal(item)} class="w-full rounded-md border-gray-300 text-sm text-right py-1" />
                                            </td>
                                            <td class="px-3 py-2 text-right text-gray-700 font-medium">
                                                {item.line_total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td class="px-3 py-2 text-center">
                                                <button type="button" onclick={() => removeLineItem(item.id)} class="text-red-500 hover:text-red-700 p-1" title="Remove Item">
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.566 19h4.868a2.75 2.75 0 0 0 2.71-2.529l.841-10.518.149.022a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75a1.25 1.25 0 0 0-1.25-1.25h-2.5A1.25 1.25 0 0 0 7.5 3.75v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.84 0a.75.75 0 0 1-1.5-.06l-.3 7.5a.75.75 0 1 1 1.5.06l-.3-7-5Z" clip-rule="evenodd" /></svg>
                                                </button>
                                            </td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                        <button type="button" onclick={addLineItem} class="mt-2 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium py-1 px-2 rounded hover:bg-blue-50">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>
            เพิ่มรายการ
        </button>
                    </div>

                    <!-- Totals Summary & Notes -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Left Column: Totals -->
                        <div>
                            <div class="w-full space-y-2 text-sm">
                                <div class="flex justify-between items-center">
                                    <span class="font-medium text-gray-600">รวมเป็นเงิน (Subtotal):</span>
                                    <span class="font-semibold text-gray-800 text-base">{formatCurrency(subTotal)}</span>
                                </div>
                                <div class="flex justify-between items-center gap-4">
                                    <label for="discountAmount_modal" class="font-medium text-gray-600">ส่วนลด (Discount):</label>
                                    <input type="number" id="discountAmount_modal" bind:value={discountAmount} step="any" min="0" oninput={() => { if (discountAmount < 0) discountAmount = 0; }} class="w-36 rounded-md border-gray-300 text-sm text-right py-1 shadow-sm" placeholder="0.00"/>
                                </div>
                                <div class="flex justify-between items-center border-t pt-2">
                                    <span class="font-medium text-gray-600">ราคาหลังหักส่วนลด:</span>
                                    <span class="font-semibold text-gray-800 text-base">{formatCurrency(totalAfterDiscount)}</span>
                                </div>
                                <div class="flex justify-between items-center gap-4">
                                    <div class="flex items-center">
                                        <input type="checkbox" id="calculateWithholdingTax_modal" bind:checked={calculateWithholdingTax} class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                                        <label for="calculateWithholdingTax_modal" class="ml-2 font-medium text-gray-600">
                                            หักภาษี ณ ที่จ่าย ({withholdingTaxRate}%)
                                        </label>
                                    </div>
                                    <span class="font-semibold text-red-600 text-base">- {formatCurrency(withholdingTaxAmount)}</span>
                                </div>
                                <div class="flex justify-between items-center border-t-2 border-gray-300 pt-2 mt-2">
                                    <span class="font-bold text-gray-900 text-base">จำนวนเงินรวมทั้งสิ้น:</span>
                                    <span class="font-bold text-blue-700 text-xl">{formatCurrency(grandTotal)}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Right Column: Notes & Attachments -->
                        <div>
                            <label for="notes_modal" class="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ (Notes)</label>
                            <textarea id="notes_modal" name="notes" rows="4" bind:value={notes} class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"></textarea>
                            
                            <label for="attachments_modal" class="block text-sm font-medium text-gray-700 mb-1 mt-4">แนบไฟล์ (Attachments)</label>
                            <input
                                type="file"
                                id="attachments_modal"
                                name="attachments"
                                multiple
                                bind:files={attachments}
                                class="block w-full text-sm text-gray-500 border border-gray-300 rounded-md shadow-sm cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-l-md file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </div>

                     {#if form?.message && !form.success && form.action === 'savePayment'}
                        <div class="rounded-md bg-red-50 p-3 text-sm text-red-600"><p><strong>Error:</strong> {form.message}</p></div>
                    {/if}
                </div>

                <div class="flex justify-end gap-3 border-t bg-gray-50 p-4 flex-shrink-0 sticky bottom-0">
                    <button type="button" onclick={() => { resetForm(); closeCreateModal(); }} class="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition">
                        ยกเลิก
                    </button>
                    <button type="submit" disabled={isSaving || items.length === 0} class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 disabled:bg-blue-300 disabled:cursor-not-allowed">
                        {#if isSaving}
                             <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            กำลังบันทึก...
                        {:else}
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M7.707 10.293a1 1 0 1 0-1.414 1.414l3 3a1 1 0 0 0 1.414 0l3-3a1 1 0 0 0-1.414-1.414L11 11.586V6h5a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V8h-3v3.586L12.293 10.293zM3 4a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm-.707 6.293a1 1 0 0 0 0 1.414L6 15.414V19a1 1 0 1 0 2 0v-3.586L3.707 10.707a1 1 0 0 0-1.414-.414z" /></svg>
                            บันทึกรายการจ่าย
                        {/if}
                    </button>
                </div>
            </form>
		</div>
	</div>
{/if}


<!-- MODAL: Delete Confirmation -->
{#if paymentToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">ยืนยันการลบรายการจ่ายเงิน</h3>
			<p class="mt-2 text-sm text-gray-600">
                คุณแน่ใจหรือไม่ที่จะลบรายการจ่ายเงิน #{paymentToDelete.id} (Ref: {paymentToDelete.payment_reference ?? '-'})?
                <br>การดำเนินการนี้จะลบรายการสินค้าและเอกสารแนบทั้งหมดที่เกี่ยวข้อง
            </p>
            {#if form?.message && !form.success && form.action === 'deletePayment'}
                 <p class="mt-2 text-sm text-red-600"><strong>Error:</strong> {form.message}</p>
            {/if}
			<form method="POST" action="?/deletePayment" 
                use:enhance={() => {
                    isDeleting = true; // Set loading state locally
                    return async ({ update }) => {
                        await update();
                        isDeleting = false; // Clear loading state
                        // The $effect.pre block now handles closing the modal on success
                    };
                }} 
                class="mt-6 flex justify-end gap-3"
            >
				<input type="hidden" name="id" value={paymentToDelete.id} />
				<button type="button" onclick={() => (paymentToDelete = null)} class="rounded-md border bg-white px-4 py-2 text-sm">ยกเลิก</button>
				<button type="submit" disabled={isDeleting} class="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50 disabled:bg-red-400">
                    {#if isDeleting} กำลังลบ... {:else} ลบ {/if}
                </button>
			</form>
		</div>
	</div>
{/if}

<style>
    /* Styles for svelte-select to match the general theme */
    :global(div.svelte-select) {
        min-height: 38px;
    }
     :global(div.svelte-select .input) {
        padding: 2px 0;
        font-size: 0.875rem;
        line-height: 1.25rem;
    }
    :global(div.svelte-select .selection) {
         padding-top: 4px;
         font-size: 0.875rem;
         line-height: 1.25rem;
    }
     :global(div.svelte-select .list) {
        border-radius: 0.375rem;
        border-color: #d1d5db;
        z-index: 9999;
    }
    :global(div.svelte-select .item) {
        font-size: 0.875rem; 
    }
     :global(div.svelte-select .item.isActive) {
        background: #e0f2fe; 
        color: #0c4a6e;
    }
</style>
