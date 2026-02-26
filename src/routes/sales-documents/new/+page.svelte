<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	export let data: PageData;
	$: ({ customers, products, units, jobOrders } = data);

	// แมปข้อมูลลูกค้าสำหรับ Svelte-select
	$: customerOptions = customers.map((c: any) => ({
		value: c.id, 
		label: c.name, 
		customer: c
	}));

	$: productOptions = products.map((p: any) => ({
		value: p.id, label: `${p.sku} - ${p.name}`, product: p
	}));

	let documentType = 'INV';
	let documentDate = new Date().toISOString().split('T')[0];
	let creditTerm: number | null = 0;
	let dueDate = new Date().toISOString().split('T')[0]; // Default ให้เท่ากับวันเอกสารถ้าเทอมเป็น 0
	
	let selectedCustomerObj: any = null;
	let selectedCustomerId: string | number = '';
	let selectedJobOrderId: string | number = '';

	let referenceDoc = '';
	let notes = '';
	let discountAmount = 0;
	let vatRate = 7;

	let items: any[] = [{
		product_object: null, product_id: null, description: '', quantity: 1,
		unit_id: null, unit_price: 0, line_total: 0, wht_rate: 0
	}];

	// กรอง Job Order ตามลูกค้าที่เลือก
	$: filteredJobOrders = selectedCustomerId ? jobOrders.filter((jo: any) => jo.customer_id == selectedCustomerId) : [];

	// คำนวณวันครบกำหนดชำระเงินเมื่อวันที่หรือเครดิตเทอมเปลี่ยน
	function calculateDueDate() {
		if (documentDate && creditTerm !== null && creditTerm !== undefined) {
			const d = new Date(documentDate);
			d.setDate(d.getDate() + Number(creditTerm));
			dueDate = d.toISOString().split('T')[0];
		}
	}

	function onCustomerChange(selected: any) {
		selectedCustomerObj = selected;
		selectedCustomerId = selected ? selected.value : '';
		selectedJobOrderId = ''; // รีเซ็ต Job Order ทิ้งเมื่อเปลี่ยนลูกค้า
	}

	$: subtotal = items.reduce((sum, item) => sum + (item.line_total || 0), 0);
	$: totalAfterDiscount = Math.max(0, subtotal - discountAmount);
	$: vatAmount = (totalAfterDiscount * vatRate) / 100;
	$: whtAmount = items.reduce((sum, item) => sum + ((item.line_total || 0) * (item.wht_rate / 100)), 0);
	$: grandTotal = totalAfterDiscount + vatAmount - whtAmount;
	$: itemsJson = JSON.stringify(items);

	function addItem() {
		items = [...items, { product_object: null, product_id: null, description: '', quantity: 1, unit_id: null, unit_price: 0, line_total: 0, wht_rate: 0 }];
	}

	function removeItem(index: number) {
		items = items.filter((_, i) => i !== index);
	}

	function updateLineTotal(index: number) {
		items[index].line_total = (items[index].quantity || 0) * (items[index].unit_price || 0);
	}

	function onProductChange(index: number, selected: any) {
		items[index].product_object = selected;
		if (selected) {
			const product = selected.product;
			items[index].product_id = product.id;
			items[index].description = product.name;
			items[index].unit_price = parseFloat(product.price) || 0;
			items[index].unit_id = product.unit_id;
			items[index].wht_rate = parseFloat(product.default_wht_rate) || 0;
		} else {
			items[index].product_id = null;
			items[index].description = '';
			items[index].unit_price = 0;
			items[index].unit_id = null;
			items[index].wht_rate = 0;
		}
		updateLineTotal(index);
		items = items;
	}

	let isSaving = false;
</script>

<div class="mx-auto max-w-7xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
	<h1 class="mb-6 text-2xl font-bold text-gray-800">สร้างเอกสารใหม่ (New Document)</h1>

	<form method="POST" action="?/create" enctype="multipart/form-data" use:enhance={() => { isSaving = true; return async ({ update }) => { await update(); isSaving = false; }; }}>
		<div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
				<label for="document_type" class="mb-1 block text-sm font-medium text-gray-700">ประเภทเอกสาร <span class="text-red-500">*</span></label>
				<select name="document_type" bind:value={documentType} required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 bg-blue-50 text-blue-800 font-semibold text-lg">
					<option value="QT">ใบเสนอราคา (Quotation)</option>
					<option value="BN">ใบวางบิล (Billing Note)</option>
					<option value="INV">ใบแจ้งหนี้ (Invoice)</option>
					<option value="RE">ใบเสร็จรับเงิน (Receipt)</option>
				</select>
			</div>
			
			<div>
				<label for="customer_id" class="mb-1 block text-sm font-medium text-gray-700">ลูกค้า <span class="text-red-500">*</span></label>
				<!-- ใช้ Svelte Select สำหรับค้นหาลูกค้า -->
				<Select
					id="customer_select"
					inputId="customer_id"
					items={customerOptions}
					value={selectedCustomerObj}
					on:change={(e) => onCustomerChange(e.detail)}
					on:clear={() => onCustomerChange(null)}
					placeholder="พิมพ์เพื่อค้นหาลูกค้า..."
					container={browser ? document.body : null}
					--inputStyles="padding: 2px 0; font-size: 0.875rem;"
					--list="border-radius: 6px; font-size: 0.875rem;"
					--itemIsActive="background: #e0f2fe;"
				/>
				<!-- ซ่อน input ไว้เก็บค่าเพื่อส่งฟอร์ม -->
				<input type="hidden" name="customer_id" value={selectedCustomerId} required />
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:col-span-2">
				<div>
					<label for="document_date" class="mb-1 block text-sm font-medium text-gray-700">วันที่เอกสาร <span class="text-red-500">*</span></label>
					<input type="date" id="document_date" name="document_date" bind:value={documentDate} on:change={calculateDueDate} required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500" />
				</div>
				<div>
					<label for="credit_term" class="mb-1 block text-sm font-medium text-gray-700">เครดิตเทอม (วัน)</label>
					<select id="credit_term" name="credit_term" bind:value={creditTerm} on:change={calculateDueDate} class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500">
						<option value={0}>0 วัน (เงินสด)</option>
						<option value={30}>30 วัน</option>
						<option value={45}>45 วัน</option>
						<option value={60}>60 วัน</option>
						<option value={90}>90 วัน</option>
					</select>
				</div>
				<div>
					<label for="due_date" class="mb-1 block text-sm font-medium text-gray-700">ครบกำหนดชำระ</label>
					<input type="date" id="due_date" name="due_date" bind:value={dueDate} class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500" />
				</div>
			</div>

			<div>
				<label for="job_order_id" class="mb-1 block text-sm font-medium text-gray-700">Job Order อ้างอิง</label>
				<select id="job_order_id" name="job_order_id" bind:value={selectedJobOrderId} class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400" disabled={!selectedCustomerId || filteredJobOrders.length === 0}>
					<option value="">-- เลือก Job Order --</option>
					{#each filteredJobOrders as job}
						<option value={job.id}>
							{job.job_type} | BL: {job.bl_number !== '-' ? job.bl_number : 'N/A'} (ID: {job.id})
						</option>
					{/each}
				</select>
				{#if selectedCustomerId && filteredJobOrders.length === 0}
					<p class="text-xs text-red-500 mt-1">ไม่พบ Job Order สำหรับลูกค้ารายนี้</p>
				{:else if !selectedCustomerId}
					<p class="text-xs text-gray-500 mt-1">กรุณาเลือกลูกค้าก่อนเพื่อดู Job Order</p>
				{/if}
			</div>

			<div>
				<label for="reference_doc" class="mb-1 block text-sm font-medium text-gray-700">เอกสารอ้างอิงอื่นๆ (PO/Ref)</label>
				<input type="text" id="reference_doc" name="reference_doc" bind:value={referenceDoc} class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500" placeholder="เช่น PO-2026..." />
			</div>

            <div class="md:col-span-2">
				<label for="attachments" class="mb-1 block text-sm font-medium text-gray-700">ไฟล์แนบ</label>
				<input type="file" id="attachments" name="attachments" multiple class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-4 file:py-2" />
			</div>
		</div>

		<!-- ตารางรายการสินค้า เหมือนเดิม -->
        <div class="mb-6">
			<h3 class="mb-2 text-lg font-medium text-gray-800">รายการสินค้า</h3>
			<div class="overflow-x-auto rounded-lg border">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50 text-xs text-gray-500 uppercase">
						<tr>
							<th class="w-40 px-4 py-2 text-left">สินค้า</th>
							<th class="px-4 py-2 text-left">รายละเอียด</th>
							<th class="w-24 px-3 py-2 text-right">จำนวน</th>
							<th class="w-24 px-3 py-2 text-center">หน่วย</th>
							<th class="w-28 px-3 py-2 text-right">ราคา/หน่วย</th>
							<th class="w-24 px-3 py-2 text-center text-red-600">WHT</th>
							<th class="w-32 px-3 py-2 text-right">รวม</th>
							<th class="w-10 px-3 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each items as item, index}
							<tr>
								<td class="px-2 py-2">
									<Select items={productOptions} value={item.product_object} on:change={(e) => onProductChange(index, e.detail)} on:clear={() => onProductChange(index, null)} placeholder="ค้นหา..." container={browser ? document.body : null} --inputStyles="padding: 2px 0; font-size: 0.875rem;" --list="border-radius: 6px; font-size: 0.875rem;" />
								</td>
								<td class="px-2 py-2"><input type="text" bind:value={item.description} class="w-full rounded-md border-gray-300 text-sm" required /></td>
								<td class="px-2 py-2"><input type="number" bind:value={item.quantity} on:input={() => updateLineTotal(index)} min="1" class="w-full rounded-md border-gray-300 text-right text-sm" required /></td>
								<td class="px-2 py-2">
									<select bind:value={item.unit_id} class="w-full rounded-md border-gray-300 py-1.5 text-sm text-center">
										<option value={null}>-</option>
										{#each units as u}<option value={u.id}>{u.symbol}</option>{/each}
									</select>
								</td>
								<td class="px-2 py-2"><input type="number" step="0.01" bind:value={item.unit_price} on:input={() => updateLineTotal(index)} class="w-full rounded-md border-gray-300 text-right text-sm" required /></td>
								<td class="px-2 py-2">
									<select bind:value={item.wht_rate} class="w-full rounded-md border-red-200 bg-red-50 py-1.5 text-center text-sm font-bold text-red-700">
										<option value={0}>0%</option><option value={1}>1%</option><option value={2}>2%</option><option value={3}>3%</option><option value={5}>5%</option>
									</select>
								</td>
								<td class="px-2 py-2 text-right font-bold text-gray-900">{(item.line_total).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
								<td class="px-2 py-2 text-center">
									{#if items.length > 1}<button type="button" on:click={() => removeItem(index)} class="text-red-500">❌</button>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<button type="button" on:click={addItem} class="mt-2 text-sm font-medium text-blue-600">+ เพิ่มรายการ</button>
		</div>

		<!-- สรุปยอด -->
        <div class="mb-6 flex justify-end">
			<div class="w-full space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-inner md:w-1/3">
				<div class="flex justify-between text-sm"><span class="text-gray-600">รวมเป็นเงิน</span><span class="font-medium">{subtotal.toFixed(2)}</span></div>
				<div class="flex justify-between text-sm items-center"><span class="text-gray-600">ส่วนลด</span><input type="number" name="discount_amount" bind:value={discountAmount} min="0" class="w-24 rounded-md border-gray-300 py-1 text-right text-sm" /></div>
				<div class="flex justify-between border-t pt-2 text-sm"><span class="text-gray-600">หลังหักส่วนลด</span><span class="font-medium">{totalAfterDiscount.toFixed(2)}</span></div>
				<div class="flex justify-between text-sm items-center mt-2">
					<span class="text-gray-600">VAT <select name="vat_rate" bind:value={vatRate} class="ml-1 h-7 rounded-md border-gray-300 text-sm"><option value={0}>0%</option><option value={7}>7%</option></select></span>
					<span class="font-medium text-green-600">+{vatAmount.toFixed(2)}</span>
				</div>
				<div class="flex justify-between border-b pb-2 text-sm text-red-600"><span class="font-medium">หัก ณ ที่จ่าย</span><span class="font-bold">-{whtAmount.toFixed(2)}</span></div>
				<div class="flex justify-between pt-2 text-lg font-black text-gray-900"><span>ยอดสุทธิ</span><span class="text-blue-700">{grandTotal.toFixed(2)}</span></div>
			</div>
		</div>

		<input type="hidden" name="items_json" value={itemsJson} />
		<input type="hidden" name="subtotal" value={subtotal} />
		<input type="hidden" name="total_after_discount" value={totalAfterDiscount} />
        <input type="hidden" name="vat_amount" value={vatAmount} />
        <input type="hidden" name="wht_amount" value={whtAmount} />
		<input type="hidden" name="total_amount" value={grandTotal} />

		<div class="mb-6">
			<label for="notes" class="mb-1 block text-sm font-medium">หมายเหตุ</label>
			<textarea id="notes" name="notes" rows="2" bind:value={notes} class="w-full rounded-md border-gray-300"></textarea>
		</div>

		<div class="flex justify-end gap-3">
			<a href="/sales-documents" class="rounded-md border bg-white px-4 py-2 text-sm">ยกเลิก</a>
			<button type="submit" disabled={isSaving} class="rounded-md bg-blue-600 px-6 py-2 text-sm text-white">{isSaving ? 'บันทึก...' : 'สร้างเอกสาร'}</button>
		</div>
	</form>
</div>

<style>
	:global(div.svelte-select) {
		min-height: 38px;
		border: 1px solid #d1d5db !important;
		border-radius: 0.375rem !important;
	}
	:global(div.svelte-select .input) {
		font-size: 0.875rem;
	}
	:global(div.svelte-select .list) {
		border-radius: 0.375rem;
		border-color: #d1d5db;
		z-index: 9999 !important;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}
</style>