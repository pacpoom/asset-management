<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	export let data: PageData;
	$: ({ vendors, units, prefillData } = data);
	
	let localProducts = data.products || [];
	let localAddresses = data.deliveryAddresses || [];

	$: vendorOptions = vendors.map((v: any) => ({
		value: v.id,
		label: v.name,
		vendor: v
	}));

	$: productOptions = localProducts.map((p: any) => ({
		value: p.id,
		label: `${p.sku} - ${p.name}`,
		product: p
	}));

	let documentType = 'PO';
	let documentDate = new Date().toISOString().split('T')[0];
	let creditTerm: number | null = 0;
	let dueDate = new Date().toISOString().split('T')[0];

	let selectedVendorObj: any = null;
	let selectedVendorId: string | number = '';
	
	let selectedDeliveryAddressId: string | number = '';

	let referenceDoc = '';
	let notes = '';
	let discountAmount = 0;
	let vatRate = 7;

	let items: any[] = [
		{
			product_object: null,
			product_id: null,
			description: '',
			quantity: 1,
			unit_id: null,
			unit_price: 0,
			line_total: 0,
			wht_rate: 0
		}
	];

	onMount(() => {
		if (prefillData) {
			documentType = prefillData.targetType;
			referenceDoc = `อ้างอิง: ${prefillData.document.document_number}`; 
			selectedVendorId = prefillData.document.vendor_id;
			selectedVendorObj = vendorOptions.find((v: any) => v.value == selectedVendorId) || null;
            
			if (prefillData.document.delivery_address_id) {
				selectedDeliveryAddressId = prefillData.document.delivery_address_id;
			}

            creditTerm = prefillData.document.credit_term;
            discountAmount = parseFloat(prefillData.document.discount_amount || '0');
            vatRate = parseFloat(prefillData.document.vat_rate || '7');

			if (prefillData.items && prefillData.items.length > 0) {
				items = prefillData.items.map((item: any) => {
					const productObj = productOptions.find((p: any) => p.value == item.product_id) || null;
					return {
						product_object: productObj,
						product_id: item.product_id,
						description: item.description,
						quantity: parseFloat(item.quantity || 1),
						unit_id: item.unit_id,
						unit_price: parseFloat(item.unit_price || 0),
						line_total: parseFloat(item.line_total || 0),
						wht_rate: parseFloat(item.wht_rate || 0)
					};
				});
			}

            calculateDueDate();
		}
	});

	function calculateDueDate() {
		if (documentDate && creditTerm !== null && creditTerm !== undefined) {
			const d = new Date(documentDate);
			d.setDate(d.getDate() + Number(creditTerm));
			dueDate = d.toISOString().split('T')[0];
		}
	}

	function onVendorChange(selected: any) {
		selectedVendorObj = selected;
		selectedVendorId = selected ? selected.value : '';
	}

	$: subtotal = items.reduce((sum, item) => sum + (item.line_total || 0), 0);
	$: totalAfterDiscount = Math.max(0, subtotal - discountAmount);
	$: vatAmount = (totalAfterDiscount * vatRate) / 100;
	$: whtAmount = items.reduce(
		(sum, item) => sum + (item.line_total || 0) * (item.wht_rate / 100),
		0
	);
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

	// -- Address Management Modal State --
	let showAddressModal = false;
	let addressModalMode: 'list' | 'form' = 'list';
	let isSavingAddress = false;
	let isDeletingAddressId: number | null = null;
	
	let addressFormData = { id: null as number | null, name: '', address_line: '', contact_name: '', contact_phone: '' };
	let toastMessage = '';

	function showToast(msg: string) {
		toastMessage = msg;
		setTimeout(() => (toastMessage = ''), 3000);
	}

	function openAddressModal() {
		showAddressModal = true;
		addressModalMode = 'list';
	}

	function closeAddressModal() {
		showAddressModal = false;
		addressModalMode = 'list';
		resetAddressForm();
	}

	function resetAddressForm() {
		addressFormData = { id: null, name: '', address_line: '', contact_name: '', contact_phone: '' };
	}

	function startAddAddress() {
		resetAddressForm();
		addressModalMode = 'form';
	}

	function startEditAddress(address: any) {
		addressFormData = { ...address };
		addressModalMode = 'form';
	}

	function selectAddress(id: number) {
		selectedDeliveryAddressId = id;
		closeAddressModal();
	}

</script>

<div class="mx-auto max-w-7xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
	<h1 class="mb-6 text-2xl font-bold text-gray-800">
        {#if prefillData}
            สร้าง {prefillData.targetType} จาก {prefillData.document.document_number}
        {:else}
            สร้างเอกสารจัดซื้อ/จ่ายเงินใหม่
        {/if}
    </h1>

	<form
		method="POST"
		action="?/create"
		enctype="multipart/form-data"
		use:enhance={() => {
			isSaving = true;
			return async ({ update }) => {
				await update();
				isSaving = false;
			};
		}}
	>
		<div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
			<div>
				<label for="document_type" class="mb-1 block text-sm font-medium text-gray-700">
					ประเภทเอกสาร <span class="text-red-500">*</span>
				</label>
				<select
					name="document_type"
					bind:value={documentType}
					required
					class="w-full rounded-md border-gray-300 bg-indigo-50 text-lg font-semibold text-indigo-800 shadow-sm focus:border-indigo-500"
				>
					<option value="PR">ใบเสนอซื้อ (PR)</option>
					<option value="PO">ใบสั่งซื้อ (PO)</option>
					<option value="GR">ใบรับของ (GR)</option>
					<option value="AP">บันทึกตั้งหนี้ (AP)</option>
					<option value="PV">ใบสำคัญจ่าย (PV)</option>
				</select>
			</div>

			<div>
				<label for="vendor_id" class="mb-1 block text-sm font-medium text-gray-700">
					ผู้จำหน่าย (Vendor) <span class="text-red-500">*</span>
				</label>
				<Select
					id="vendor_id"
					items={vendorOptions}
					value={selectedVendorObj}
					on:change={(e) => onVendorChange(e.detail)}
					on:clear={() => onVendorChange(null)}
					placeholder="พิมพ์เพื่อค้นหาผู้จำหน่าย..."
					container={browser ? document.body : null}
					--inputStyles="padding: 2px 0; font-size: 0.875rem;"
					--list="border-radius: 6px; font-size: 0.875rem;"
					--itemIsActive="background: #e0e7ff;"
				/>
				<input type="hidden" name="vendor_id" value={selectedVendorId} required />
			</div>

			<div class="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-3">
				<div>
					<label for="document_date" class="mb-1 block text-sm font-medium text-gray-700">วันที่เอกสาร <span class="text-red-500">*</span></label>
					<input type="date" id="document_date" name="document_date" bind:value={documentDate} on:change={calculateDueDate} required class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500" />
				</div>
				<div>
					<label for="credit_term" class="mb-1 block text-sm font-medium text-gray-700">เครดิตเทอม (วัน)</label>
					<select id="credit_term" name="credit_term" bind:value={creditTerm} on:change={calculateDueDate} class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500">
						<option value={0}>0 วัน (เงินสด)</option><option value={30}>30 วัน</option><option value={45}>45 วัน</option><option value={60}>60 วัน</option><option value={90}>90 วัน</option>
					</select>
				</div>
				<div>
					<label for="due_date" class="mb-1 block text-sm font-medium text-gray-700">ครบกำหนดชำระ</label>
					<input type="date" id="due_date" name="due_date" bind:value={dueDate} class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500" />
				</div>
			</div>

			<div class="md:col-span-1">
				<div class="flex items-center justify-between mb-1">
					<label for="delivery_address_id" class="block text-sm font-medium text-gray-700">สถานที่จัดส่ง (Shipping Address)</label>
					<button type="button" on:click={openAddressModal} class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 focus:outline-none">
						+ จัดการที่อยู่จัดส่ง
					</button>
				</div>
				<select
					id="delivery_address_id"
					name="delivery_address_id"
					bind:value={selectedDeliveryAddressId}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500"
				>
					<option value="">-- ไม่ระบุ --</option>
					{#each localAddresses as address}
						<option value={address.id}>{address.name} {address.contact_name ? `(${address.contact_name})` : ''}</option>
					{/each}
				</select>
			</div>

			<div class="md:col-span-1">
				<label for="reference_doc" class="mb-1 block text-sm font-medium text-gray-700">เอกสารอ้างอิงของ Supplier</label>
				<input
					type="text"
					id="reference_doc"
					name="reference_doc"
					bind:value={referenceDoc}
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500"
					placeholder="เช่น QT-Supplier-2026..."
				/>
			</div>

			<div class="md:col-span-2">
				<label for="attachments" class="mb-1 block text-sm font-medium text-gray-700">ไฟล์แนบ (ใบเสนอราคา, รูปถ่ายรับของ ฯลฯ)</label>
				<input type="file" id="attachments" name="attachments" multiple class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-4 file:py-2" />
			</div>
		</div>

		<div class="mb-6">
			<h3 class="mb-2 text-lg font-medium text-gray-800">รายการสั่งซื้อ/รับบริการ</h3>
			<div class="overflow-x-auto rounded-lg border">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50 text-xs text-gray-500 uppercase">
						<tr>
							<th class="w-40 px-4 py-2 text-left font-medium">รหัสสินค้า/บริการ</th>
							<th class="px-4 py-2 text-left font-bold">รายละเอียด</th>
							<th class="w-24 px-3 py-2 text-right">จำนวน</th>
							<th class="w-24 px-3 py-2 text-center">หน่วย</th>
							<th class="w-28 px-3 py-2 text-right">ต้นทุน/หน่วย</th>
							<th class="w-24 px-3 py-2 text-center text-red-600">หัก ณ ที่จ่าย</th>
							<th class="w-32 px-3 py-2 text-right">รวม</th>
							<th class="w-10 px-3 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each items as item, index}
							<tr>
								<td class="w-40 px-2 py-2" style="min-width: 200px; max-width: 250px;">
									<Select
										items={productOptions}
										value={item.product_object}
										on:change={(e) => onProductChange(index, e.detail)}
										on:clear={() => onProductChange(index, null)}
										placeholder="ค้นหา..."
										floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
										container={browser ? document.body : null}
										--inputStyles="padding: 2px 0; font-size: 0.875rem;"
										--list="border-radius: 6px; font-size: 0.875rem;"
										--itemIsActive="background: #e0e7ff;"
										--valueStyles="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
									/>
								</td>
								<td class="px-2 py-2">
									<input type="text" bind:value={item.description} title={item.description} class="w-full overflow-hidden rounded-md border-gray-300 text-sm text-ellipsis whitespace-nowrap" required />
								</td>
								<td class="px-2 py-2">
									<input type="number" bind:value={item.quantity} on:input={() => updateLineTotal(index)} min="1" class="w-full rounded-md border-gray-300 text-right text-sm" required />
								</td>
								<td class="px-2 py-2">
									<select bind:value={item.unit_id} class="w-full rounded-md border-gray-300 py-1.5 text-center text-sm">
										<option value={null}>-</option>
										{#each units as u}<option value={u.id}>{u.symbol}</option>{/each}
									</select>
								</td>
								<td class="px-2 py-2">
									<input type="number" step="0.01" bind:value={item.unit_price} on:input={() => updateLineTotal(index)} class="w-full rounded-md border-gray-300 text-right text-sm" required />
								</td>
								<td class="px-2 py-2">
									<select bind:value={item.wht_rate} class="w-full rounded-md border-red-200 bg-red-50 py-1.5 text-center text-sm font-bold text-red-700">
										<option value={0}>0%</option><option value={1}>1%</option><option value={2}>2%</option><option value={3}>3%</option><option value={5}>5%</option>
									</select>
								</td>
								<td class="px-2 py-2 text-right font-bold text-gray-900">
									{item.line_total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
								</td>
								<td class="px-2 py-2 text-center">
									{#if items.length > 1}
										<button type="button" on:click={() => removeItem(index)} class="text-red-500">❌</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<button type="button" on:click={addItem} class="mt-2 text-sm font-medium text-indigo-600">
				+ เพิ่มรายการ
			</button>
		</div>

		<div class="mb-6 flex justify-end">
			<div class="w-full space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-inner md:w-1/3">
				<div class="flex justify-between text-sm"><span class="text-gray-600">รวมเป็นเงิน</span><span class="font-medium">{subtotal.toFixed(2)}</span></div>
				<div class="flex items-center justify-between text-sm"><span class="text-gray-600">ส่วนลดรับ</span><input type="number" name="discount_amount" bind:value={discountAmount} min="0" class="w-24 rounded-md border-gray-300 py-1 text-right text-sm" /></div>
				<div class="flex justify-between border-t pt-2 text-sm"><span class="text-gray-600">หลังหักส่วนลด</span><span class="font-medium">{totalAfterDiscount.toFixed(2)}</span></div>
				<div class="mt-2 flex items-center justify-between text-sm">
					<span class="text-gray-600">VAT ซื้อ <select name="vat_rate" bind:value={vatRate} class="ml-2 w-20 rounded-md border-gray-300 py-1 pr-8 pl-3 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"><option value={0}>0%</option><option value={7}>7%</option></select></span>
					<span class="font-medium text-green-600">+{vatAmount.toFixed(2)}</span>
					<input type="hidden" name="vat_amount" value={vatAmount} />
				</div>
				<div class="flex justify-between border-b pb-2 text-sm text-red-600"><span class="font-medium">หัก ณ ที่จ่าย (พึงหักผู้ขาย)</span><span class="font-bold">-{whtAmount.toFixed(2)}</span></div>
				<div class="flex justify-between pt-2 text-lg font-black text-gray-900"><span>ยอดสุทธิต้องชำระ</span><span class="text-indigo-700">{grandTotal.toFixed(2)}</span></div>
			</div>
		</div>

		<input type="hidden" name="items_json" value={itemsJson} />
		<input type="hidden" name="subtotal" value={subtotal} />
		<input type="hidden" name="total_after_discount" value={totalAfterDiscount} />
		<input type="hidden" name="vat_amount" value={vatAmount} />
		<input type="hidden" name="wht_amount" value={whtAmount} />
		<input type="hidden" name="total_amount" value={grandTotal} />

		<div class="mb-6">
			<label for="notes" class="mb-1 block text-sm font-medium">หมายเหตุภายใน</label>
			<textarea id="notes" name="notes" rows="2" bind:value={notes} class="w-full rounded-md border-gray-300 focus:border-indigo-500"></textarea>
		</div>

		<div class="flex justify-end gap-3">
			<a href="/purchase-documents" class="rounded-md border bg-white px-4 py-2 text-sm">ยกเลิก</a>
			<button type="submit" disabled={isSaving} class="rounded-md bg-indigo-600 px-6 py-2 text-sm text-white hover:bg-indigo-700">
				{isSaving ? 'บันทึก...' : 'สร้างเอกสารจัดซื้อ'}
			</button>
		</div>
	</form>
</div>

<!-- Modal สำหรับจัดการที่อยู่จัดส่ง (เพิ่ม/แก้ไข/ลบ/เลือก) -->
{#if showAddressModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 transition-opacity">
		<div class="fixed inset-0" on:click={closeAddressModal} role="presentation"></div>
		<div class="relative w-full max-w-2xl transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all flex flex-col max-h-[90vh]">
			
			<div class="flex items-center justify-between border-b bg-gray-50 px-6 py-4 flex-shrink-0">
				<h2 class="text-lg font-bold text-gray-900">
					{addressModalMode === 'list' ? 'เลือกหรือจัดการสถานที่จัดส่ง' : (addressFormData.id ? 'แก้ไขที่อยู่จัดส่ง' : 'เพิ่มที่อยู่จัดส่งใหม่')}
				</h2>
				<button type="button" on:click={closeAddressModal} class="text-xl font-bold text-gray-400 hover:text-gray-600">&times;</button>
			</div>
			
			<div class="flex-1 overflow-y-auto p-6">
				{#if addressModalMode === 'list'}
					<!-- หน้า List แสดงที่อยู่ -->
					<div class="mb-4 flex justify-end">
						<button type="button" on:click={startAddAddress} class="rounded-md bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-100">+ เพิ่มที่อยู่ใหม่</button>
					</div>

					{#if localAddresses.length === 0}
						<div class="rounded-lg border border-dashed py-8 text-center text-gray-500">
							ไม่มีข้อมูลที่อยู่จัดส่ง กรุณาเพิ่มที่อยู่ใหม่
						</div>
					{:else}
						<div class="space-y-3">
							{#each localAddresses as addr}
								<div class="flex items-start justify-between rounded-lg border border-gray-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
									<div class="flex-1 pr-4">
										<h4 class="font-bold text-gray-900">{addr.name}</h4>
										<p class="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{addr.address_line}</p>
										<div class="mt-2 text-xs text-gray-500">
											{#if addr.contact_name} <span class="mr-3">ผู้ติดต่อ: <span class="font-semibold">{addr.contact_name}</span></span> {/if}
											{#if addr.contact_phone} <span>โทร: <span class="font-semibold">{addr.contact_phone}</span></span> {/if}
										</div>
									</div>
									<div class="flex flex-col gap-2 border-l pl-4 shrink-0">
										<button type="button" on:click={() => selectAddress(addr.id)} class="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">เลือกใช้</button>
										<button type="button" on:click={() => startEditAddress(addr)} class="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">แก้ไข</button>
										
										<!-- Form สำหรับลบ -->
										<form method="POST" action="?/deleteAddress" use:enhance={() => {
											isDeletingAddressId = addr.id;
											return async ({ result, update }) => {
												isDeletingAddressId = null;
												if (result.type === 'success' && result.data?.deletedId) {
													localAddresses = localAddresses.filter(a => a.id !== result.data.deletedId);
													if (selectedDeliveryAddressId == result.data.deletedId) {
														selectedDeliveryAddressId = '';
													}
													showToast('ลบที่อยู่สำเร็จ');
												}
												await update({ reset: false });
											};
										}}>
											<input type="hidden" name="id" value={addr.id} />
											<button type="submit" disabled={isDeletingAddressId === addr.id} class="w-full rounded border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 text-center">
												{isDeletingAddressId === addr.id ? '...' : 'ลบ'}
											</button>
										</form>
									</div>
								</div>
							{/each}
						</div>
					{/if}

				{:else}
					<!-- หน้า Form (เพิ่ม/แก้ไข) -->
					<form
						method="POST"
						action={addressFormData.id ? '?/updateAddress' : '?/createAddress'}
						use:enhance={() => {
							isSavingAddress = true;
							return async ({ result, update }) => {
								isSavingAddress = false;
								if (result.type === 'success' && result.data?.address) {
									const savedAddress = result.data.address;
									if (addressFormData.id) {
										// อัพเดทในรายการเดิม
										const idx = localAddresses.findIndex(a => a.id === savedAddress.id);
										if (idx !== -1) localAddresses[idx] = savedAddress;
										showToast('อัพเดทที่อยู่สำเร็จ');
									} else {
										// เพิ่มเข้าไปใหม่ และเลือกให้เลย
										localAddresses = [...localAddresses, savedAddress];
										selectedDeliveryAddressId = savedAddress.id;
										showToast('เพิ่มที่อยู่สำเร็จ');
									}
									// กลับไปหน้ารายการ
									addressModalMode = 'list';
								} else if (result.type === 'failure') {
									alert(result.data?.message || 'เกิดข้อผิดพลาด');
								}
								await update({ reset: false });
							};
						}}
					>
						{#if addressFormData.id}
							<input type="hidden" name="id" value={addressFormData.id} />
						{/if}

						<div class="space-y-4">
							<div>
								<label for="addr_name" class="block text-sm font-medium text-gray-700">ชื่อสถานที่ <span class="text-red-500">*</span></label>
								<input type="text" name="name" id="addr_name" bind:value={addressFormData.name} placeholder="เช่น สำนักงานใหญ่, คลังสินค้า A" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
							</div>
							<div>
								<label for="addr_line" class="block text-sm font-medium text-gray-700">รายละเอียดที่อยู่ <span class="text-red-500">*</span></label>
								<textarea name="address_line" id="addr_line" rows="3" bind:value={addressFormData.address_line} placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"></textarea>
							</div>
							<div class="grid grid-cols-2 gap-4">
								<div>
									<label for="contact_name" class="block text-sm font-medium text-gray-700">ผู้ติดต่อรับของ</label>
									<input type="text" name="contact_name" id="contact_name" bind:value={addressFormData.contact_name} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
								</div>
								<div>
									<label for="contact_phone" class="block text-sm font-medium text-gray-700">เบอร์โทรศัพท์</label>
									<input type="text" name="contact_phone" id="contact_phone" bind:value={addressFormData.contact_phone} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
								</div>
							</div>
						</div>
						
						<div class="mt-6 flex justify-end gap-3 border-t pt-4">
							<button type="button" on:click={() => addressModalMode = 'list'} class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50">ย้อนกลับ</button>
							<button type="submit" disabled={isSavingAddress} class="rounded-md bg-indigo-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">
								{isSavingAddress ? 'กำลังบันทึก...' : (addressFormData.id ? 'บันทึกการแก้ไข' : 'เพิ่มที่อยู่')}
							</button>
						</div>
					</form>
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if toastMessage}
	<div class="animate-in fade-in slide-in-from-top-4 fixed top-6 right-6 z-[70] flex items-center gap-3 rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white shadow-xl">
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
		{toastMessage}
	</div>
{/if}

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