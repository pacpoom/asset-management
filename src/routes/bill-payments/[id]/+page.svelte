<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
    import { tick } from 'svelte';
    import { invalidateAll, goto } from '$app/navigation';
    import Select from 'svelte-select'; 
    import { browser } from '$app/environment';
    
    // Import Types from PageData
    type BillPaymentDetailHeader = PageData['payment'];
    type BillPaymentItemRow = PageData['items'][0];
    type Attachment = PageData['attachments'][0];
    type Vendor = PageData['vendors'][0];
    type Unit = PageData['units'][0];
    type Product = PageData['products'][0];
    type VendorContract = PageData['contracts'][0];

    // --- 1. ADDED: BillPaymentItem interface (copied from +page.svelte) ---
    export interface BillPaymentItem {
        id: string; // This is a client-side ID (from crypto.randomUUID or DB ID)
        product_object: { value: number, label: string, product: Product } | null;
        product_id: number | null;
        description: string;
        quantity: number;
        unit_id: number | null;
        unit_price: number;
        line_total: number;
        _db_id: number | null; // Original DB ID for tracking (or null if new)
    }
    
	// --- Props & State (Svelte 5 Runes) ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();
    
    // --- State ---
    // let isEditing = $state(false); // This is no longer used, we use a modal
    let paymentData = $state<BillPaymentDetailHeader>(data.payment);
    // items and attachments state are now managed inside the modal logic
    let attachments = $state<Attachment[]>(data.attachments);

    // --- 2. ADDED: All state for the Edit Modal ---
    let isEditModalOpen = $state(false);
    let modalItems = $state<BillPaymentItem[]>([]);
    let newAttachments = $state<FileList | null>(null);

    // Editing States (For form inputs)
    let payment_reference = $state(paymentData.payment_reference ?? '');
    let payment_date = $state(paymentData.payment_date);
    let notes = $state(paymentData.notes ?? '');
    let vendor_id = $state(paymentData.vendor_id);
    let vendor_contract_id = $state(paymentData.vendor_contract_id ?? undefined);
    
    // Calculation States (local display)
    let discountAmount = $state(paymentData.discount_amount);
    let calculateWithholdingTax = $state(paymentData.withholding_tax_rate !== null);
    let withholdingTaxRate = $state(paymentData.withholding_tax_rate ?? 7.00);

    let isSaving = $state(false);
    let globalMessage = $state<{ text: string, type: 'success' | 'error' } | null>(null);
    let messageTimeout: NodeJS.Timeout;
    
    let deleteAttachmentTarget = $state<Attachment | null>(null);
    let deletePaymentTarget = $state<BillPaymentDetailHeader | null>(null);

    let updateStatusForm: HTMLFormElement;
    let statusToUpdate = $state('');

    // --- 3. ADDED: productOptions (copied from +page.svelte) ---
    const productOptions = $derived(
        data.products.map(p => ({
            value: p.id,
            label: `${p.sku} - ${p.name}`, 
            product: p
        }))
    );

    // --- 4. MODIFIED: Derived calculations to use modalItems ---
    const subTotal = $derived(modalItems.reduce((sum, item) => sum + item.line_total, 0));
    const totalAfterDiscount = $derived(subTotal - (discountAmount || 0));
    const withholdingTaxAmount = $derived(
        calculateWithholdingTax
            ? parseFloat((totalAfterDiscount * (withholdingTaxRate / 100)).toFixed(2))
            : 0
    );
    const grandTotal = $derived(totalAfterDiscount - withholdingTaxAmount);
    
    const filteredContracts = $derived(
        vendor_id ? data.contracts.filter(c => c.vendor_id === vendor_id) : []
    );
    
    // --- General Functions ---
    function formatCurrency(value: number | null | undefined, currency: string = 'THB') {
        if (value === null || value === undefined) return '-';
        return new Intl.NumberFormat('th-TH', { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    }
    function formatNumber(value: number | null | undefined) {
         if (value === null || value === undefined) return '-';
         return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    function formatDateOnly(isoString: string | null | undefined): string {
        if (!isoString) return '-';
        try { return new Date(isoString).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return "Invalid Date"; }
    }
    function getStatusClass(status: BillPaymentDetailHeader['status']) {
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
    
    function showGlobalMessage(text: string, type: 'success' | 'error', duration = 5000) {
        clearTimeout(messageTimeout);
        globalMessage = { text, type };
        messageTimeout = setTimeout(() => { globalMessage = null; }, duration);
    }
    
    // --- 5. REPLACED toggleEditMode with Modal functions ---
    function openEditModal() {
        // Syncs the main data (paymentData, data.items) into the modal's editable state
        payment_reference = paymentData.payment_reference ?? '';
        payment_date = paymentData.payment_date;
        notes = paymentData.notes ?? '';
        vendor_id = paymentData.vendor_id;
        vendor_contract_id = paymentData.vendor_contract_id ?? undefined;
        discountAmount = paymentData.discount_amount;
        calculateWithholdingTax = paymentData.withholding_tax_rate !== null;
        withholdingTaxRate = paymentData.withholding_tax_rate ?? 7.00;
        
        // Initialize modalItems from data.items
        modalItems = data.items.map(item => {
            const productOption = productOptions.find(p => p.value === item.product_id);
            return {
                id: item.id.toString(), // Use DB ID as the client key
                product_object: productOption || null,
                product_id: item.product_id,
                description: item.description || '',
                quantity: item.quantity,
                unit_id: item.unit_id,
                unit_price: item.unit_price,
                line_total: item.line_total,
                _db_id: item.id
            };
        });

        newAttachments = null;
        isEditModalOpen = true;
    }

    function closeEditModal() {
        isEditModalOpen = false;
        // No need to reset form, openEditModal will always re-populate it.
    }

    // --- 6. ADDED: Item helper functions (copied from +page.svelte) ---
    function addLineItem() {
        modalItems = [
            ...modalItems,
            { id: crypto.randomUUID(), product_object: null, product_id: null, description: '', quantity: 1, unit_id: null, unit_price: 0, line_total: 0, _db_id: null }
        ];
    }

    function removeLineItem(idToRemove: string) {
        modalItems = modalItems.filter(item => item.id !== idToRemove);
    }

    function updateLineTotal(item: BillPaymentItem) {
        item.line_total = (item.quantity || 0) * (item.unit_price || 0);
        modalItems = [...modalItems]; // Trigger reactivity
    }

    function onProductSelectChange(item: BillPaymentItem) { 
        const selectedOption = item.product_object;
        
        if (!selectedOption) {
            item.product_id = null;
            item.description = '';
            item.unit_id = null;
            item.unit_price = 0;
        } else {
            const selectedProduct = selectedOption.product;
            if (selectedProduct) {
                item.product_id = selectedOption.value;
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
    // --- End of copied functions ---

    async function updateStatus(newStatus: BillPaymentDetailHeader['status']) {
        isSaving = true;
        statusToUpdate = newStatus;
        
        await tick(); // Wait for svelte to update the hidden input's value
        
        if (updateStatusForm) {
            updateStatusForm.requestSubmit(); // Programmatically submit the hidden form
        }
        
        // The result will be handled by the $effect.pre block
        // We no longer need the manual fetch()
    }
    
    function openDeleteAttachmentModal(attachment: Attachment) {
        deleteAttachmentTarget = attachment;
    }
    
    function handleAttachmentDeletion() {
        if (!deleteAttachmentTarget) return;
        isSaving = true;
        
        const formData = new FormData();
        formData.append('attachment_id', deleteAttachmentTarget.id.toString());
        
        fetch('?/deleteAttachment', { method: 'POST', body: formData })
            .then(res => res.json())
            .then(result => {
                if (result.success) {
                    showGlobalMessage(result.message, 'success');
                    attachments = attachments.filter(a => a.id !== deleteAttachmentTarget!.id); // Update local state
                    deleteAttachmentTarget = null;
                    invalidateAll(); 
                } else {
                    showGlobalMessage(result.message || 'Attachment deletion failed.', 'error');
                }
            })
            .catch(err => showGlobalMessage(`Network error: ${err.message}`, 'error'))
            .finally(() => { isSaving = false; });
    }
    
    // Note: The main Save/Edit Payment action is skipped for this simple view, 
    // as editing line items is complex and not requested for this dynamic route yet.
    // We only implement Status Change and Attachment/Delete.

	// --- Reactive Effects ---
	$effect.pre(() => {
        // --- 7. ADDED: Handler for updatePayment action ---
        if (form?.action === 'updatePayment') {
            if (form.success) {
                closeEditModal();
                showGlobalMessage(form.message as string, 'success');
                invalidateAll(); // This will re-run load() and refresh all data
            } else if (form.message) {
                // Show error *inside* the modal
                showGlobalMessage(form.message as string, 'error');
            }
            form.action = undefined;
        }

        // Handle form submission results
        if (form?.action === 'updatePaymentStatus' && form.success && form.newStatus) {
            paymentData = { ...paymentData, status: form.newStatus };
            showGlobalMessage(form.message as string, 'success');
            form.action = undefined;
            isSaving = false; // <-- 4. Reset saving state
        } else if (form?.action === 'deleteAttachment' && form.success && form.deletedAttachmentId) {
             attachments = attachments.filter(a => a.id !== form.deletedAttachmentId);
             showGlobalMessage(form.message as string, 'success');
             deleteAttachmentTarget = null;
             form.action = undefined;
             isSaving = false; // <-- 5. Reset saving state
        }
	});

    // --- FIX 2: Add $effect to sync form state with paymentData ---
    $effect(() => {
        // This effect re-syncs the *main display* (paymentData)
        // and *attachments* whenever 'data' prop changes from load()
        paymentData = data.payment;
        attachments = data.attachments;
        
        // This is no longer responsible for all form fields,
        // openEditModal() handles that.
    });

</script>

<svelte:head>
	<title>Bill Payment #{paymentData.id}</title>
    <!-- CSS for svelte-select -->
    <link rel="stylesheet" href="https://unpkg.com/svelte-select@latest/dist/stylesheet.css">
</svelte:head>

<!-- 6. Add the hidden form -->
<form
    method="POST"
    action="?/updatePaymentStatus"
    use:enhance
    class="hidden"
    bind:this={updateStatusForm}
>
    <input type="hidden" name="status" bind:value={statusToUpdate} />
</form>

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
<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center border-b pb-4">
    <div class="flex items-center">
        <a href="/bill-payments" class="text-gray-500 hover:text-gray-800 mr-3" title="Back to list">
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6"><path d="m15 18-6-6 6-6"/></svg>
        </a>
        <div>
            <h1 class="text-2xl font-bold text-gray-800">รายละเอียดรายการจ่ายเงิน #{paymentData.id}</h1>
            <p class="mt-1 text-sm text-gray-500">
                Vendor: <span class="font-medium text-gray-700">{paymentData.vendor_name}</span> | Ref: {paymentData.payment_reference || '-'}
            </p>
        </div>
    </div>
	
    <!-- Action Buttons -->
    <div class="flex items-center gap-2 flex-shrink-0">
        <!-- Status Badge -->
        <span class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold {getStatusClass(paymentData.status)}">
            {paymentData.status}
        </span>
        
        <!-- 8. ADDED: Edit Button -->
        <button onclick={openEditModal} class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50" disabled={isSaving}>
            Edit
        </button>

        <!-- Dropdown for Status Change -->
        <div class="relative">
             <select 
                onchange={(e) => updateStatus(e.currentTarget.value as BillPaymentDetailHeader['status'])}
                class="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 disabled:opacity-50"
                disabled={isSaving}
             >
                <option value="" disabled selected>Change Status</option>
                {#each data.availableStatuses as status}
                    {#if status !== paymentData.status}
                        <option value={status} class="text-gray-800 bg-white">{status}</option>
                    {/if}
                {/each}
            </select>
        </div>

        <button onclick={() => (deletePaymentTarget = paymentData)} class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 disabled:opacity-50" disabled={isSaving}>
            Delete
        </button>
    </div>
</div>

<!-- Details Grid -->
<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Column 1: Core Info & Totals -->
    <div class="lg:col-span-1 space-y-4 rounded-lg border bg-white p-4 shadow-sm">
        <h2 class="text-lg font-semibold text-gray-700 border-b pb-2">Information</h2>
        <div class="space-y-3 text-sm">
            <div><span class="font-medium text-gray-600 block">Payment Date</span><span class="text-gray-800">{formatDateOnly(paymentData.payment_date)}</span></div>
            <div><span class="font-medium text-gray-600 block">Reference</span><span class="text-gray-800">{paymentData.payment_reference || '-'}</span></div>
            <div><span class="font-medium text-gray-600 block">Contract Ref</span><span class="text-gray-800">{paymentData.vendor_contract_number || '-'}</span></div>
            <div><span class="font-medium text-gray-600 block">Prepared By</span><span class="text-gray-800">{paymentData.prepared_by_user_name}</span></div>
        </div>
        
        <h2 class="text-lg font-semibold text-gray-700 border-t pt-4 border-b pb-2">Financial Summary</h2>
        <div class="w-full space-y-2 text-sm">
            <div class="flex justify-between items-center"><span class="font-medium text-gray-600">Subtotal:</span><span class="font-medium text-gray-800">{formatCurrency(paymentData.subtotal)}</span></div>
            <div class="flex justify-between items-center"><span class="font-medium text-gray-600">Discount:</span><span class="font-medium text-red-600">- {formatCurrency(paymentData.discount_amount)}</span></div>
            <div class="flex justify-between items-center border-t pt-1"><span class="font-medium text-gray-600">Total After Discount:</span><span class="font-medium text-gray-800">{formatCurrency(paymentData.total_after_discount)}</span></div>
             <div class="flex justify-between items-center"><span class="font-medium text-gray-600">WHT ({paymentData.withholding_tax_rate ?? 0}%):</span><span class="font-medium text-red-600">- {formatCurrency(paymentData.withholding_tax_amount)}</span></div>
             <div class="flex justify-between items-center border-t-2 pt-2"><span class="font-bold text-gray-900 text-base">Grand Total:</span><span class="font-bold text-blue-700 text-xl">{formatCurrency(paymentData.total_amount)}</span></div>
        </div>
    </div>
    
    <!-- Column 2 & 3: Items, Notes, Attachments -->
    <div class="lg:col-span-2 space-y-6">
        <!-- Items Table -->
        <div class="rounded-lg border bg-white p-4 shadow-sm">
            <h3 class="text-lg font-semibold text-gray-700 border-b pb-2 mb-3">รายการสินค้า/บริการ ({data.items.length})</h3>
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 text-sm">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-3 py-2 text-left font-medium text-gray-500">Product/Description</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500">Qty</th>
                            <th class="px-3 py-2 text-left font-medium text-gray-500">Unit</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500">Price/Unit</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500">Total</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 bg-white">
                        {#each data.items as item}
                        <tr>
                            <td class="px-3 py-2 text-gray-700">
                                <span class="font-medium">{item.product_name}</span> 
                                <span class="text-xs font-mono block text-gray-500">{item.product_sku}</span>
                                {#if item.description && item.description !== item.product_name}
                                    <span class="text-xs text-gray-600 block italic">{item.description}</span>
                                {/if}
                            </td>
                            <td class="px-3 py-2 text-right text-gray-700">{formatNumber(item.quantity)}</td>
                            <td class="px-3 py-2 text-gray-600">{item.unit_symbol || '-'}</td>
                            <td class="px-3 py-2 text-right text-gray-700">{formatCurrency(item.unit_price)}</td>
                            <td class="px-3 py-2 text-right font-medium text-gray-800">{formatCurrency(item.line_total)}</td>
                        </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
        
        <!-- Notes & Attachments -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Notes -->
            <div class="rounded-lg border bg-white p-4 shadow-sm">
                <h3 class="text-lg font-semibold text-gray-700 border-b pb-2 mb-3">Notes</h3>
                <p class="text-sm text-gray-600 whitespace-pre-wrap">{paymentData.notes || 'No notes.'}</p>
            </div>
            
            <!-- Attachments -->
            <div class="rounded-lg border bg-white p-4 shadow-sm">
                <h3 class="text-lg font-semibold text-gray-700 border-b pb-2 mb-3">Attachments ({attachments.length})</h3>
                <div class="space-y-2">
                    {#if attachments.length === 0}
                         <p class="text-sm text-gray-500">No attachments found.</p>
                    {:else}
                        {#each attachments as attachment (attachment.id)}
                            <div class="flex items-center justify-between rounded-md bg-gray-100 p-2 text-sm">
                                <div class="flex items-center gap-2 overflow-hidden">
                                    <span class="text-lg flex-shrink-0">{getFileIcon(attachment.file_original_name)}</span>
                                    <a href={attachment.file_path} target="_blank" rel="noopener noreferrer" class="truncate text-blue-600 hover:underline" title={attachment.file_original_name}>{attachment.file_original_name}</a>
                                </div>
                                <button onclick={() => openDeleteAttachmentModal(attachment)} class="rounded p-1 text-red-500 hover:bg-red-100" title="Delete Attachment" disabled={isSaving}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                                </button>
                            </div>
                        {/each}
                    {/if}
                </div>
            </div>
        </div>
    </div>
</div>

<!-- 9. ADDED: The entire Edit Modal (copied from +page.svelte) -->
{#if isEditModalOpen}
	<div 
        transition:slide 
        class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-4 md:pt-8"
    >
		<div class="fixed inset-0" onclick={closeEditModal} role="presentation"></div>
		<div class="relative w-full max-w-7xl transform rounded-xl bg-white shadow-2xl transition-all max-h-[95vh] flex flex-col">
			<div class="border-b px-6 py-4 flex-shrink-0">
				<h2 class="text-lg font-bold text-gray-900">Edit Bill Payment #{paymentData.id}</h2>
			</div>

            <!-- Form -->
            <form
                method="POST"
                action="?/updatePayment"
                enctype="multipart/form-data"
                use:enhance={({ formData }) => {
                    isSaving = true;
                    globalMessage = null;

                    // Add the payment ID
                    formData.set('payment_id', paymentData.id.toString());

                    // Prepare JSON data for line items
                    formData.set('itemsJson', JSON.stringify(
                        modalItems.map(item => ({
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
                    formData.set('withholdingTaxRate', withholdingTaxRate.toString());

                    return async ({ update }) => {
                        await update({ reset: false });
                        isSaving = false;
                        // Result is handled in $effect.pre
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
                                        <th class="px-3 py-2 text-left font-semibold text-gray-600 w-[25%]">สินค้า/บริการ (Product) <span class="text-red-500">*</span></th>
                                        <th class="px-3 py-2 text-left font-semibold text-gray-600 min-w-[250px]">รายละเอียด</th>
                                        <th class="px-3 py-2 text-right font-semibold text-gray-600 w-[80px]">จำนวน <span class="text-red-500"></span></th>
                                        <th class="px-3 py-2 text-left font-semibold text-gray-600 w-[100px]">หน่วย</th>
                                        <th class="px-3 py-2 text-right font-semibold text-gray-600 w-[120px]">ราคา/หน่วย <span class="text-red-500"></span></th>
                                        <th class="px-3 py-2 text-right font-semibold text-gray-600 w-[120px]">ราคารวม</th>
                                        <th class="px-3 py-2 text-center font-semibold text-gray-600 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-200 bg-white">
                                    {#if modalItems.length === 0}
                                        <tr><td colspan="8" class="py-4 text-center text-gray-500 italic">-- กด "เพิ่มรายการ" เพื่อเริ่มต้น --</td></tr>
                                    {/if}
                                    {#each modalItems as item, index (item.id)}
                                        <tr class="hover:bg-gray-50 align-top">
                                            <td class="px-3 py-2 text-gray-500">{index + 1}</td>
                                            <td class="px-3 py-2">
                                                <Select
                                                    items={productOptions}
                                                    bind:value={item.product_object}
                                                    on:change={() => onProductSelectChange(item)}
                                                    on:clear={() => {
                                                        item.product_object = null;
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
                            
                            <!-- Display Existing Attachments -->
                            <label class="block text-sm font-medium text-gray-700 mb-1 mt-4">ไฟล์แนบที่มีอยู่</label>
                            <div class="space-y-2 mb-2">
                                {#if attachments.length === 0}
                                    <p class="text-sm text-gray-500">No attachments found.</p>
                                {:else}
                                    {#each attachments as attachment (attachment.id)}
                                        <div class="flex items-center justify-between rounded-md bg-gray-100 p-2 text-sm">
                                            <div class="flex items-center gap-2 overflow-hidden">
                                                <span class="text-lg flex-shrink-0">{getFileIcon(attachment.file_original_name)}</span>
                                                <a href={attachment.file_path} target="_blank" rel="noopener noreferrer" class="truncate text-blue-600 hover:underline" title={attachment.file_original_name}>{attachment.file_original_name}</a>
                                            </div>
                                            <button type="button" onclick={() => openDeleteAttachmentModal(attachment)} class="rounded p-1 text-red-500 hover:bg-red-100" title="Delete Attachment" disabled={isSaving}>
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                                            </button>
                                        </div>
                                    {/each}
                                {/if}
                            </div>
                            
                            <label for="attachments_modal" class="block text-sm font-medium text-gray-700 mb-1 mt-4">แนบไฟล์ใหม่ (Add New)</label>
                            <input
                                type="file"
                                id="attachments_modal"
                                name="attachments"
                                multiple
                                bind:files={newAttachments}
                                class="block w-full text-sm text-gray-500 border border-gray-300 rounded-md shadow-sm cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-l-md file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </div>

                     {#if form?.message && !form.success && form.action === 'updatePayment'}
                        <div class="rounded-md bg-red-50 p-3 text-sm text-red-600"><p><strong>Error:</strong> {form.message}</p></div>
                    {/if}
                </div>

                <div class="flex justify-end gap-3 border-t bg-gray-50 p-4 flex-shrink-0 sticky bottom-0">
                    <button type="button" onclick={closeEditModal} class="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition">
                        ยกเลิก
                    </button>
                    <button type="submit" disabled={isSaving || modalItems.length === 0} class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 disabled:bg-blue-300 disabled:cursor-not-allowed">
                        {#if isSaving}
                             <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            กำลังบันทึก...
                        {:else}
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M7.707 10.293a1 1 0 1 0-1.414 1.414l3 3a1 1 0 0 0 1.414 0l3-3a1 1 0 0 0-1.414-1.414L11 11.586V6h5a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V8h-3v3.586L12.293 10.293zM3 4a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm-.707 6.293a1 1 0 0 0 0 1.414L6 15.414V19a1 1 0 1 0 2 0v-3.586L3.707 10.707a1 1 0 0 0-1.414-.414z" /></svg>
                            Save Changes
                        {/if}
                    </button>
                </div>
            </form>
		</div>
	</div>
{/if}


<!-- MODAL: Delete Payment Confirmation -->
{#if deletePaymentTarget}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">ยืนยันการลบรายการจ่ายเงิน</h3>
			<p class="mt-2 text-sm text-gray-600">
                คุณแน่ใจหรือไม่ที่จะลบรายการจ่ายเงิน #{deletePaymentTarget.id} (Ref: {deletePaymentTarget.payment_reference ?? '-'})?
                <br>การดำเนินการนี้จะลบรายการสินค้าและเอกสารแนบทั้งหมดที่เกี่ยวข้อง
            </p>
            <form method="POST" action="?/deletePayment" use:enhance class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="id" value={deletePaymentTarget.id} />
				<button type="button" onclick={() => (deletePaymentTarget = null)} class="rounded-md border bg-white px-4 py-2 text-sm">ยกเลิก</button>
				<button type="submit" disabled={isSaving} class="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:bg-red-400">
                    {#if isSaving} Deleting... {:else} ลบรายการ {/if}
                </button>
			</form>
		</div>
	</div>
{/if}

<!-- MODAL: Delete Attachment Confirmation -->
{#if deleteAttachmentTarget}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="alertdialog">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">ยืนยันการลบเอกสารแนบ</h3>
			<p class="mt-2 text-sm text-gray-600">
				คุณแน่ใจหรือไม่ที่จะลบเอกสารแนบ "<strong>{deleteAttachmentTarget.file_original_name}</strong>"? 
				การดำเนินการนี้ไม่สามารถย้อนกลับได้
			</p>
            <form method="POST" action="?/deleteAttachment" use:enhance class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="attachment_id" value={deleteAttachmentTarget.id} />
				<button type="button" onclick={() => (deleteAttachmentTarget = null)} class="rounded-md border bg-white px-4 py-2 text-sm" disabled={isSaving}>ยกเลิก</button>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed" disabled={isSaving}>
                    {#if isSaving} Deleting... {:else} ลบเอกสาร {/if}
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
        z-index: 9999; /* Ensure dropdown is on top of modal */
    }
    :global(div.svelte-select .item) {
        font-size: 0.875rem; 
    }
     :global(div.svelte-select .item.isActive) {
        background: #e0f2fe; 
        color: #0c4a6e;
    }
</style>