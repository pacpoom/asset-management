<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
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
    
	// --- Props & State (Svelte 5 Runes) ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();
    
    // --- State ---
    let isEditing = $state(false);
    let paymentData = $state<BillPaymentDetailHeader>(data.payment);
    let items = $state<BillPaymentItemRow[]>(data.items);
    let attachments = $state<Attachment[]>(data.attachments);

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

    // --- Derived Calculations ---
    const subTotal = $derived(items.reduce((sum, item) => sum + item.line_total, 0));
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
    
    // --- Editing Functions (Simulated client-side only for now) ---
    function toggleEditMode() {
        if (isEditing) {
            // Cancel edit: Revert state to original data
             payment_reference = paymentData.payment_reference ?? '';
             payment_date = paymentData.payment_date;
             notes = paymentData.notes ?? '';
             vendor_id = paymentData.vendor_id;
             vendor_contract_id = paymentData.vendor_contract_id ?? undefined;
             discountAmount = paymentData.discount_amount;
             withholdingTaxRate = paymentData.withholding_tax_rate ?? 7.00;
             calculateWithholdingTax = paymentData.withholding_tax_rate !== null;
             // NOTE: Items are not editable in this simple view for now.
             // If items were editable, you would need to revert the items array too.
        }
        isEditing = !isEditing;
    }

    function updateStatus(newStatus: BillPaymentDetailHeader['status']) {
        isSaving = true;
        const formData = new FormData();
        formData.append('status', newStatus);
        
        fetch('?/updatePaymentStatus', { method: 'POST', body: formData })
            .then(res => res.json())
            .then(result => {
                if (result.success) {
                    paymentData = { ...paymentData, status: newStatus }; // Update local state
                    showGlobalMessage(result.message, 'success');
                    invalidateAll(); 
                } else {
                    showGlobalMessage(result.message || 'Status update failed.', 'error');
                }
            })
            .catch(err => showGlobalMessage(`Network error: ${err.message}`, 'error'))
            .finally(() => { isSaving = false; });
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
        // Handle form submission results
        if (form?.action === 'updatePaymentStatus' && form.success && form.newStatus) {
            paymentData = { ...paymentData, status: form.newStatus };
            showGlobalMessage(form.message as string, 'success');
            form.action = undefined;
        } else if (form?.action === 'deleteAttachment' && form.success && form.deletedAttachmentId) {
             attachments = attachments.filter(a => a.id !== form.deletedAttachmentId);
             showGlobalMessage(form.message as string, 'success');
             deleteAttachmentTarget = null;
             form.action = undefined;
        } else if (form?.message && !form.success) {
            showGlobalMessage(form.message as string, 'error');
            form.action = undefined;
        }
	});

</script>

<svelte:head>
	<title>Bill Payment #{paymentData.id}</title>
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
            <h3 class="text-lg font-semibold text-gray-700 border-b pb-2 mb-3">รายการสินค้า/บริการ ({items.length})</h3>
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
                        {#each items as item}
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
