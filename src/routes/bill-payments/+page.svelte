<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
    import { invalidateAll } from '$app/navigation';
    import Select from 'svelte-select'; // Import svelte-select
    import { browser } from '$app/environment'; // <-- 1. เพิ่มการ import นี้

	// --- Types ---
    type Vendor = PageData['vendors'][0];
    type Unit = PageData['units'][0];
    type VendorContract = PageData['contracts'][0];
    type Product = PageData['products'][0];

    // Line item state type
    interface BillPaymentItem {
        id: string;
        product_id: number | null;
        description: string;
        quantity: number;
        unit_id: number | null;
        unit_price: number;
        line_total: number;
    }

	// --- Props & State (Svelte 5 Runes) ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

    // Form fields
    let vendor_id = $state<number | undefined>(undefined);
    let vendor_contract_id = $state<number | undefined>(undefined);
    let payment_date = $state(new Date().toISOString().split('T')[0]);
    let payment_reference = $state('');
    let notes = $state('');
    let items = $state<BillPaymentItem[]>([]);
    let attachments = $state<FileList | null>(null);

    // Calculation State
    let discountAmount = $state(0);
    let calculateWithholdingTax = $state(false);
    let withholdingTaxRate = $state(7);

    // UI state
    let isSaving = $state(false);
    let globalMessage = $state<{ text: string, type: 'success' | 'error' } | null>(null);
    let messageTimeout: NodeJS.Timeout;

    // --- Derived Calculations ---
    const subTotal = $derived(items.reduce((sum, item) => sum + item.line_total, 0));
    const totalAfterDiscount = $derived(subTotal - (discountAmount || 0));
    const withholdingTaxAmount = $derived(
        calculateWithholdingTax
            ? parseFloat((totalAfterDiscount * (withholdingTaxRate / 100)).toFixed(2))
            : 0
    );
    // FIX: Changed 'withholdingTaxTaxAmount' to 'withholdingTaxAmount'
    const grandTotal = $derived(totalAfterDiscount - withholdingTaxAmount);

    // --- Derived Contracts ---
    const filteredContracts = $derived(
        vendor_id ? data.contracts.filter(c => c.vendor_id === vendor_id) : []
    );

    // Format products for svelte-select
    const productOptions = $derived(
        data.products.map(p => ({
            value: p.id,
            label: `${p.sku} - ${p.name}`
        }))
    );

	// --- Functions ---
    function showGlobalMessage(text: string, type: 'success' | 'error', duration = 5000) {
        clearTimeout(messageTimeout);
        globalMessage = { text, type };
        messageTimeout = setTimeout(() => { globalMessage = null; }, duration);
    }

    function addLineItem() {
        items = [
            ...items,
            {
                id: crypto.randomUUID(),
                product_id: null,
                description: '',
                quantity: 1,
                unit_id: null,
                unit_price: 0,
                line_total: 0
            }
        ];
    }

    function removeLineItem(idToRemove: string) {
        items = items.filter(item => item.id !== idToRemove);
    }

    function updateLineTotal(item: BillPaymentItem) {
        item.line_total = (item.quantity || 0) * (item.unit_price || 0);
        items = [...items];
    }

    // --- UPDATED: Function to auto-fill details when product changes ---
    function onProductSelect(item: BillPaymentItem, selectedOption: { value: number, label: string } | null) {
        // This function is now triggered by on:select or on:clear
        // The 'selectedOption' is the event.detail (or null if cleared)

        if (!selectedOption) {
            // This happens if the user clears the selection
            item.product_id = null; // bind:value should do this, but we'll be safe
            item.description = '';
            item.unit_id = null;
            item.unit_price = 0;
            updateLineTotal(item);
            return;
        }

        const selectedProduct = data.products.find(p => p.id === selectedOption.value);
        
        if (selectedProduct) {
            // item.product_id = selectedProduct.id; // bind:value handles this
            item.description = selectedProduct.name; // Auto-fill description
            item.unit_id = selectedProduct.unit_id; // Auto-fill base unit
            item.unit_price = selectedProduct.purchase_cost ?? 0; // Auto-fill price from purchase cost
            updateLineTotal(item); // Recalculate total
        } else {
             // This shouldn't happen if selectedOption exists, but good to have
             item.description = '';
             item.unit_id = null;
             item.unit_price = 0;
             updateLineTotal(item);
        }
    }

    // --- Function to reset contract when vendor changes ---
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
        attachments = null;
        const fileInput = document.getElementById('attachments') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
    }

	// --- Reactive Effects ---
	$effect.pre(() => {
        // Handle savePayment results
        if (form?.action === 'savePayment') {
            if (form.success) {
                showGlobalMessage(form.message as string, 'success');
                resetForm();
            } else if (form.message) {
                 showGlobalMessage(form.message as string, 'error');
            }
             form.action = undefined;
        }
	});

</script>

<svelte:head>
	<title>สร้างรายการจ่ายเงิน (Bill Payment)</title>
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
<div class="mb-6">
	<h1 class="text-2xl font-bold text-gray-800">สร้างรายการจ่ายเงิน (New Bill Payment)</h1>
	<p class="mt-1 text-sm text-gray-500">บันทึกการชำระเงินให้แก่ผู้จัดจำหน่าย/ซัพพลายเออร์</p>
</div>

<!-- Bill Payment Form -->
<form
    method="POST"
    action="?/savePayment"
    enctype="multipart/form-data"
    use:enhance={({ formData }) => {
        isSaving = true;
        globalMessage = null;

        // FIX: Explicitly extract the integer ID from product_id before stringifying
        formData.set('itemsJson', JSON.stringify(
            items.map(({ id, product_id, ...rest }) => ({
                ...rest,
                // Ensure product_id is treated as a number. 
                // If it's the full svelte-select object, we extract the value property.
                // If it's already a number (which it should be after initial selection), it stays a number.
                product_id: typeof product_id === 'object' && product_id !== null && 'value' in product_id
                    ? product_id.value
                    : product_id
            }))
        ));
        formData.set('discountAmount', (discountAmount || 0).toString());
        formData.set('calculateWithholdingTax', (calculateWithholdingTax || false).toString());

        return async ({ update }) => {
            await update({ reset: false });
            isSaving = false;
        };
    }}
    class="space-y-6 bg-white p-6 rounded-lg shadow-md border border-gray-200"
>
    <!-- Header Section -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 border-b pb-4">
        <div>
            <label for="vendor_id" class="block text-sm font-medium text-gray-700 mb-1">ผู้จัดจำหน่าย (Vendor) <span class="text-red-500">*</span></label>
            <select id="vendor_id" name="vendor_id" bind:value={vendor_id} required onchange={onVendorChange} class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                <option value={undefined} disabled>-- เลือก Vendor --</option>
                {#each data.vendors as vendor (vendor.id)}
                    <option value={vendor.id}>{vendor.name}</option>
                {/each}
            </select>
        </div>
        <div>
            <label for="vendor_contract_id" class="block text-sm font-medium text-gray-700 mb-1">สัญญา (Contract)</label>
            <select
                id="vendor_contract_id"
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
            <label for="payment_date" class="block text-sm font-medium text-gray-700 mb-1">วันที่จ่ายเงิน <span class="text-red-500">*</span></label>
            <input type="date" id="payment_date" name="payment_date" bind:value={payment_date} required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
        </div>
         <div>
            <label for="payment_reference" class="block text-sm font-medium text-gray-700 mb-1">เลขที่อ้างอิง (ถ้ามี)</label>
            <input type="text" id="payment_reference" name="payment_reference" bind:value={payment_reference} class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="e.g., Check #123" />
        </div>
         <div class="md:col-span-4">
             <label for="prepared_by" class="block text-sm font-medium text-gray-700 mb-1">ผู้จัดเตรียม</label>
             <input type="text" id="prepared_by" value={data.currentUser?.full_name ?? data.currentUser?.email ?? 'N/A'} readonly class="w-full rounded-md border-gray-300 bg-gray-100 shadow-sm" />
        </div>
    </div>

    <!-- Line Items Section -->
    <div>
        <h2 class="text-lg font-semibold text-gray-800 mb-2">รายการจ่าย</h2>
        <div class="overflow-x-auto rounded border border-gray-200">
            <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-3 py-2 text-left font-medium text-gray-500 w-10">#</th>
                        <th class="px-3 py-2 text-left font-medium text-gray-500 min-w-[200px] w-2/5">สินค้า/บริการ (Product) <span class="text-red-500">*</span></th>
                        <th class="px-3 py-2 text-left font-medium text-gray-500 min-w-[150px] w-1/5">รายละเอียด (Description)</th>
                        <th class="px-3 py-2 text-right font-medium text-gray-500 w-[80px]">จำนวน <span class="text-red-500">*</span></th>
                        <th class="px-3 py-2 text-left font-medium text-gray-500 w-[100px]">หน่วย</th>
                        <th class="px-3 py-2 text-right font-medium text-gray-500 w-[120px]">ราคา/หน่วย <span class="text-red-500">*</span></th>
                        <th class="px-3 py-2 text-right font-medium text-gray-500 w-[120px]">ราคารวม</th>
                        <th class="px-3 py-2 text-center font-medium text-gray-500 w-10"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 bg-white">
                    {#if items.length === 0}
                        <tr><td colspan="8" class="py-6 text-center text-gray-500 italic">-- ยังไม่มีรายการ --</td></tr>
                    {/if}
                    {#each items as item, index (item.id)}
                        <tr class="hover:bg-gray-50 align-top">
                            <td class="px-3 py-2 text-gray-500">{index + 1}</td>
                            <td class="px-3 py-2">
                                <!-- UPDATED: Using on:select and on:clear (These are custom component events and should remain 'on:') -->
                                <Select
                                    items={productOptions}
                                    bind:value={item.product_id}
                                    on:select={(e) => onProductSelect(item, e.detail)}
                                    on:clear={() => onProductSelect(item, null)}
                                    placeholder="-- ค้นหา/เลือกสินค้า --"
                                    required
                                    listPlacement="bottom"
                                    container={browser ? document.body : null} <!-- 2. เพิ่ม attribute นี้ -->
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
                                <!-- Fix: on:input -> oninput (Line 298) -->
                                <input type="number" step="any" min="0.0001" required bind:value={item.quantity} oninput={() => updateLineTotal(item)} class="w-full rounded-md border-gray-300 text-sm text-right py-1" />
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
                                <!-- Fix: on:input -> oninput (Line 309) -->
                                <input type="number" step="any" min="0" required bind:value={item.unit_price} oninput={() => updateLineTotal(item)} class="w-full rounded-md border-gray-300 text-sm text-right py-1" />
                            </td>
                            <td class="px-3 py-2 text-right text-gray-700 font-medium">
                                {item.line_total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td class="px-3 py-2 text-center">
                                <!-- Fix: on:click -> onclick (Line 315) -->
                                <button type="button" onclick={() => removeLineItem(item.id)} class="text-red-500 hover:text-red-700 p-1" title="Remove Item">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.566 19h4.868a2.75 2.75 0 0 0 2.71-2.529l.841-10.518.149.022a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75a1.25 1.25 0 0 0-1.25-1.25h-2.5A1.25 1.25 0 0 0 7.5 3.75v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.84 0a.75.75 0 0 1-1.5-.06l-.3 7.5a.75.75 0 1 1 1.5.06l.3-7.5Z" clip-rule="evenodd" /></svg>
                                </button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        <!-- Fix: on:click -> onclick (Line 324) -->
        <button type="button" onclick={addLineItem} class="mt-2 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium py-1 px-2 rounded hover:bg-blue-50">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>
            เพิ่มรายการ
        </button>
    </div>

    <!-- Totals Summary Section -->
    <div class="flex justify-end mt-2">
        <div class="w-full md:w-2/3 lg:w-1/2 xl:w-2/5 space-y-2 text-sm">
            <!-- Subtotal -->
            <div class="flex justify-between items-center">
                <span class="font-medium text-gray-600">รวมเป็นเงิน (Subtotal):</span>
                <span class="font-semibold text-gray-800 text-base">
                    {subTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>
            <!-- Discount -->
            <div class="flex justify-between items-center gap-4">
                <label for="discountAmount" class="font-medium text-gray-600">ส่วนลด (Discount):</label>
                <input
                    type="number"
                    id="discountAmount"
                    bind:value={discountAmount}
                    step="any"
                    min="0"
                    oninput={() => { if (discountAmount < 0) discountAmount = 0; }}
                    class="w-36 rounded-md border-gray-300 text-sm text-right py-1 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="0.00"
                />
            </div>
            <!-- Total After Discount -->
            <div class="flex justify-between items-center border-t pt-2">
                <span class="font-medium text-gray-600">ราคาหลังหักส่วนลด:</span>
                <span class="font-semibold text-gray-800 text-base">
                    {totalAfterDiscount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>
            <!-- Withholding Tax -->
            <div class="flex justify-between items-center gap-4">
                <div class="flex items-center">
                    <input
                        type="checkbox"
                        id="calculateWithholdingTax"
                        bind:checked={calculateWithholdingTax}
                        class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label for="calculateWithholdingTax" class="ml-2 font-medium text-gray-600">
                        หักภาษี ณ ที่จ่าย ({withholdingTaxRate}%)
                    </label>
                </div>
                <span class="font-semibold text-red-600 text-base">
                    - {withholdingTaxAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>
            <!-- Grand Total -->
            <div class="flex justify-between items-center border-t-2 border-gray-300 pt-2 mt-2">
                <span class="font-bold text-gray-900 text-base">จำนวนเงินรวมทั้งสิ้น (Grand Total):</span>
                <span class="font-bold text-blue-700 text-xl">
                    {grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>
        </div>
    </div>

    <!-- Notes & Attachments -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
        <div>
            <label for="notes" class="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ (Notes)</label>
            <textarea id="notes" name="notes" rows="4" bind:value={notes} class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"></textarea>
        </div>
        <div>
            <label for="attachments" class="block text-sm font-medium text-gray-700 mb-1">แนบไฟล์ (Attachments)</label>
            <input
                type="file"
                id="attachments"
                name="attachments"
                multiple
                bind:files={attachments}
                class="block w-full text-sm text-gray-500 border border-gray-300 rounded-md shadow-sm cursor-pointer
                       file:mr-4 file:py-2 file:px-4 file:rounded-l-md file:border-0
                       file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700
                       hover:file:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
             <p class="mt-1 text-xs text-gray-500">สามารถเลือกได้หลายไฟล์</p>
        </div>
    </div>

    <!-- Form Actions -->
    <div class="flex justify-end gap-3 pt-4 border-t">
        <!-- Fix: on:click -> onclick (Line 413) -->
        <button type="button" onclick={resetForm} class="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition">
            ยกเลิก/ล้างฟอร์ม
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

<style>
    /* Add any specific styles here if needed */
    select:required:invalid {
        color: gray;
    }
    option[value=""][disabled] {
        display: none;
    }
    option {
        color: black;
    }

    /* Style svelte-select to match */
    :global(div.svelte-select) {
        min-height: 38px; /* Match tailwind input height */
    }
     :global(div.svelte-select .input) {
        padding: 2px 0; /* Adjust vertical padding */
        font-size: 0.875rem; /* Match text-sm */
        line-height: 1.25rem;
    }
    :global(div.svelte-select .selection) {
         padding-top: 4px;
         font-size: 0.875rem; /* Match text-sm */
         line-height: 1.25rem;
    }
     :global(div.svelte-select .list) {
        border-radius: 0.375rem; /* Match rounded-md */
        border-color: #d1d5db; /* Match border-gray-300 */
        z-index: 50; /* Ensure it appears on top */
    }
    :global(div.svelte-select .item) {
        font-size: 0.875rem; /* Match text-sm */
    }
     :global(div.svelte-select .item.isActive) {
        background: #e0f2fe; /* Light blue for active item */
        color: #0c4a6e; /* Darker blue text */
    }
</style>