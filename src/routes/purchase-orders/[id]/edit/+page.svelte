<script lang="ts">
	import { enhance } from '$app/forms';
	import Select from 'svelte-select'; // นำเข้า Select Component
	import { browser } from '$app/environment'; // ใช้สำหรับ container ของ Select

	export let data: {
		po: any;
		items: any[];
		vendors: any[];
		products: any[];
		units: any[];
	};

	const { po, vendors } = data;

	// แปลงวันที่สำหรับ input type="date"
	let date = po.po_date ? new Date(po.po_date).toISOString().split('T')[0] : '';
	let delivery_date = po.delivery_date
		? new Date(po.delivery_date).toISOString().split('T')[0]
		: '';

	// ตัวแปร Form Header
	let po_number = po.po_number;
	let vendor_id = po.vendor_id;
	let contact_person = po.contact_person;
	let payment_term = po.payment_term;
	let remarks = po.remarks;

	// 1. เตรียม Options สำหรับ svelte-select จากรายการสินค้าทั้งหมด
	$: productOptions = data.products.map((p) => ({
		value: p.id,
		label: `${p.sku} : ${p.name}`, // รูปแบบที่โชว์ใน Dropdown
		...p // เก็บข้อมูลอื่นๆ เช่น ราคา หน่วย ไว้ใช้ตอนเลือก
	}));

	// 2. Map รายการสินค้าเดิม (items) ให้เข้ากับโครงสร้างของ svelte-select
	let items = data.items.map((i: any) => {
		// ค้นหาสินค้าใน Master Data เพื่อสร้าง Object สำหรับ Select (เพื่อให้ Dropdown โชว์ค่าเริ่มต้นถูกต้อง)
		const foundProduct = data.products.find((p) => p.name === i.product_name);

		// ถ้าเจอสินค้า ให้ใช้ format ของ svelte-select ถ้าไม่เจอ (เช่น เป็นสินค้าที่พิมเอง หรือถูกลบ) ให้สร้าง Object หลอกๆ ขึ้นมา
		const productObj = foundProduct
			? {
					value: foundProduct.id,
					label: `${foundProduct.sku} : ${foundProduct.name}`,
					...foundProduct
				}
			: i.product_name
				? { value: i.product_name, label: i.product_name }
				: null;

		return {
			product_object: productObj, // ตัวแปรสำหรับ bind กับ <Select>
			product_name: i.product_name,
			description: i.description || '',
			quantity: parseFloat(String(i.quantity || 1)),
			unit: i.unit,
			unit_price: parseFloat(String(i.unit_price || 0)),
			discount: parseFloat(String(i.discount || 0)),
			total_price: parseFloat(String(i.total_price || 0))
		};
	});

	// ถ้าไม่มีรายการเลย ให้เริ่มด้วยแถวว่าง 1 แถว
	if (items.length === 0) {
		items = [
			{
				product_name: '',
				product_object: null,
				description: '',
				quantity: 1,
				unit: 'ชิ้น',
				unit_price: 0,
				discount: 0,
				total_price: 0
			}
		];
	}

	// ตัวแปรคำนวณเงิน
	let subtotal = 0;
	let discountGlobal = parseFloat(String(po.discount || 0));
	let vatRate = parseFloat(String(po.vat_rate || 7));
	let whtRate = parseFloat(String(po.wht_rate || 0));
	let vatAmount = 0;
	let whtAmount = 0;
	let totalAmount = 0;

	// ฟังก์ชันเมื่อเลือกสินค้าจาก Dropdown
	function onProductChange(index: number, selection: any) {
		if (selection) {
			items[index].product_object = selection;
			items[index].product_name = selection.name || selection.label;

			// ถ้าเป็นการเปลี่ยนสินค้าใหม่ ดึงราคาล่าสุดมาใส่ (หรือจะใช้ราคาเดิมก็ได้ แต่ปกติเปลี่ยนของ = ราคาเปลี่ยน)
			items[index].unit_price = Number(selection.purchase_cost) || 0;

			// Auto-fill หน่วย
			if (selection.unit_name) {
				items[index].unit = selection.unit_name;
			}
		} else {
			// กรณีเคลียร์ค่า
			items[index].product_object = null;
			items[index].product_name = '';
			items[index].unit_price = 0;
		}
		calculateTotals();
	}

	// ฟังก์ชันคำนวณเงินรวม
	function calculateTotals() {
		let tempGrossTotal = 0;
		let tempTotalDiscount = 0;

		items = items.map((item) => {
			const qty = parseFloat(String(item.quantity || 0));
			const price = parseFloat(String(item.unit_price || 0));
			const disc = parseFloat(String(item.discount || 0));

			const lineTotal = qty * price - disc;
			item.total_price = lineTotal > 0 ? lineTotal : 0;

			tempGrossTotal += qty * price;
			tempTotalDiscount += disc;

			return item;
		});

		subtotal = tempGrossTotal;
		discountGlobal = tempTotalDiscount;

		const afterDiscount = subtotal - discountGlobal;
		const baseAmount = afterDiscount > 0 ? afterDiscount : 0;

		vatAmount = (baseAmount * vatRate) / 100;
		whtAmount = (baseAmount * whtRate) / 100;
		totalAmount = baseAmount + vatAmount - whtAmount;
	}

	function addItem() {
		items = [
			...items,
			{
				product_name: '',
				product_object: null,
				description: '',
				quantity: 1,
				unit: 'ชิ้น', // หรือค่า defaultUnit จาก data ถ้ามี
				unit_price: 0,
				discount: 0,
				total_price: 0
			}
		];
		calculateTotals();
	}

	function removeItem(index: number) {
		if (items.length > 1) {
			items = items.filter((_: any, i: number) => i !== index);
			calculateTotals();
		}
	}

	// คำนวณครั้งแรกตอนโหลดหน้า
	calculateTotals();
</script>

<div class="mx-auto mt-6 max-w-5xl rounded-lg border border-gray-200 bg-white p-6 shadow-lg">
	<h1 class="mb-6 flex items-center gap-2 text-2xl font-bold text-gray-800">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-8 w-8 text-blue-600"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
			/>
		</svg>
		แก้ไขใบสั่งซื้อ (Edit PO)
	</h1>

	<form method="POST" action="?/update" use:enhance class="space-y-6">
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="space-y-4">
				<div>
					<label for="po_number" class="block text-sm font-medium text-gray-700"
						>เลขที่เอกสาร (PO No.)</label
					>
					<input
						type="text"
						id="po_number"
						name="po_number"
						bind:value={po_number}
						readonly
						class="mt-1 block w-full cursor-not-allowed rounded-md border-gray-300 bg-gray-100 text-gray-500 shadow-sm"
					/>
				</div>
				<div>
					<label for="vendor_id" class="block text-sm font-medium text-gray-700"
						>ผู้ขาย (Vendor) <span class="text-red-500">*</span></label
					>
					<select
						id="vendor_id"
						name="vendor_id"
						bind:value={vendor_id}
						required
						class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					>
						<option value="">-- เลือกผู้ขาย --</option>
						{#each vendors as vendor}
							<option value={vendor.id}
								>{vendor.name} {vendor.company_name ? `(${vendor.company_name})` : ''}</option
							>
						{/each}
					</select>
				</div>
				<div>
					<label for="contact_person" class="block text-sm font-medium text-gray-700"
						>ผู้ติดต่อ (Contact Person)</label
					>
					<input
						type="text"
						id="contact_person"
						name="contact_person"
						bind:value={contact_person}
						class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
			</div>

			<div class="space-y-4">
				<div>
					<label for="date" class="block text-sm font-medium text-gray-700"
						>วันที่สั่งซื้อ (Date) <span class="text-red-500">*</span></label
					>
					<input
						type="date"
						id="date"
						name="date"
						bind:value={date}
						required
						class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="delivery_date" class="block text-sm font-medium text-gray-700"
						>วันที่กำหนดส่ง (Delivery Date)</label
					>
					<input
						type="date"
						id="delivery_date"
						name="delivery_date"
						bind:value={delivery_date}
						class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="payment_term" class="block text-sm font-medium text-gray-700"
						>เงื่อนไขการชำระเงิน (Payment Term)</label
					>
					<input
						type="text"
						id="payment_term"
						name="payment_term"
						bind:value={payment_term}
						placeholder="เช่น 30 วัน, เงินสด"
						class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
			</div>
		</div>

		<hr class="border-gray-200" />

		<div class="overflow-visible pb-24">
			<table class="min-w-full divide-y divide-gray-200">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
							>สินค้า/บริการ</th
						>
						<th class="w-32 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase"
							>รายละเอียด</th
						>
						<th class="w-32 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase"
							>จำนวน</th
						>
						<th class="w-32 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase"
							>หน่วย</th
						>
						<th class="w-32 px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"
							>ราคา/หน่วย</th
						>
						<th class="w-32 px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"
							>รวม</th
						>
						<th class="w-10 px-4 py-3"></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#each items as item, index}
						<tr>
							<td class="px-3 py-2" style="min-width: 250px;">
								<Select
									items={productOptions}
									value={item.product_object}
									on:change={(e) => onProductChange(index, e.detail)}
									on:clear={() => onProductChange(index, null)}
									placeholder="-- ค้นหา/เลือก --"
									floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
									container={browser ? document.body : null}
									--inputStyles="padding: 2px 0; font-size: 0.875rem;"
									--list="border-radius: 6px; font-size: 0.875rem;"
									--itemIsActive="background: #e0f2fe;"
								/>
							</td>

							<td class="px-3 py-2">
								<input
									type="text"
									bind:value={item.description}
									placeholder="รายละเอียดเพิ่มเติม"
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</td>

							<td class="px-3 py-2">
								<input
									type="number"
									bind:value={item.quantity}
									min="1"
									on:input={calculateTotals}
									class="w-full rounded-md border-gray-300 text-right text-sm focus:border-blue-500 focus:ring-blue-500"
									required
								/>
							</td>

							<td class="px-3 py-2">
								<div class="relative">
									<select
										bind:value={item.unit}
										class="h-9 w-full cursor-pointer appearance-none rounded-md border-gray-300 py-0 pr-2 pl-3 text-left text-sm focus:border-blue-500 focus:ring-blue-500"
										style="-webkit-appearance: none; -moz-appearance: none; appearance: none; background-image: none;"
									>
										{#each data.units as u}
											<option value={u.name}>{u.name}</option>
										{/each}
									</select>
									<div
										class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											viewBox="0 0 20 20"
											fill="currentColor"
										>
											<path
												fill-rule="evenodd"
												d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
												clip-rule="evenodd"
											/>
										</svg>
									</div>
								</div>
							</td>

							<td class="px-3 py-2">
								<input
									type="number"
									step="0.01"
									bind:value={item.unit_price}
									on:input={calculateTotals}
									class="w-full rounded-md border-gray-300 text-right text-sm focus:border-blue-500 focus:ring-blue-500"
									required
								/>
							</td>

							<td class="px-3 py-2 text-right font-medium text-gray-700">
								{item.total_price.toLocaleString('en-US', {
									minimumFractionDigits: 2,
									maximumFractionDigits: 2
								})}
							</td>

							<td class="px-3 py-2 text-center">
								{#if items.length > 1}
									<button
										type="button"
										on:click={() => removeItem(index)}
										class="text-red-500 hover:text-red-700"
										aria-label="ลบรายการ"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="h-5 w-5"
										>
											<path
												fill-rule="evenodd"
												d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.566 19h4.868a2.75 2.75 0 002.71-2.529l.841-10.518.149.022a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
												clip-rule="evenodd"
											/>
										</svg>
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>

			<div class="mt-4">
				<button
					type="button"
					on:click={addItem}
					class="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
							clip-rule="evenodd"
						/>
					</svg>
					เพิ่มรายการสินค้า
				</button>
			</div>
		</div>

		<div class="mt-8 grid grid-cols-1 gap-8 border-t pt-6 md:grid-cols-2">
			<div>
				<label for="remarks" class="block text-sm font-medium text-gray-700"
					>หมายเหตุ (Remarks)</label
				>
				<textarea
					id="remarks"
					name="remarks"
					bind:value={remarks}
					rows="4"
					class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				></textarea>
			</div>
			<div class="space-y-3 rounded-lg bg-gray-50 p-4">
				<div class="flex justify-between text-sm">
					<span class="text-gray-600">รวมเป็นเงิน (Subtotal)</span>
					<span class="font-medium"
						>{subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span
					>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-sm text-gray-600">ส่วนลดท้ายบิล (Discount)</span>
					<input
						aria-label="ส่วนลดท้ายบิล"
						type="number"
						step="0.01"
						bind:value={discountGlobal}
						on:input={calculateTotals}
						class="w-32 rounded-md border-gray-300 p-1 text-right text-sm shadow-sm"
					/>
				</div>

				<div class="flex items-center justify-between">
					<span class="text-sm text-gray-600">ภาษีมูลค่าเพิ่ม (VAT)</span>
					<div class="flex items-center gap-2">
						<select
							bind:value={vatRate}
							on:change={calculateTotals}
							class="w-32 cursor-pointer rounded-md border-gray-300 p-1 text-center text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
						>
							<option value={0}>ไม่มี VAT (0%)</option>
							<option value={7}>VAT 7%</option>
						</select>
						<span class="w-24 text-right font-medium"
							>{vatAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span
						>
					</div>
				</div>

				<div class="flex items-center justify-between">
					<span class="text-sm text-gray-600">หัก ณ ที่จ่าย (WHT)</span>
					<div class="flex items-center gap-2">
						<select
							bind:value={whtRate}
							on:change={calculateTotals}
							class="w-32 cursor-pointer rounded-md border-gray-300 p-1 text-center text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
						>
							<option value={0}>ไม่หัก (0%)</option>
							<option value={1}>1% (ขนส่ง)</option>
							<option value={3}>3% (บริการ)</option>
							<option value={5}>5% (ค่าเช่า)</option>
						</select>
						<span class="w-24 text-right font-medium text-red-600"
							>-{whtAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span
						>
					</div>
				</div>

				<div class="flex items-center justify-between border-t border-gray-300 pt-3">
					<span class="text-lg font-bold text-gray-800">ยอดรวมสุทธิ (Total)</span>
					<span class="text-xl font-bold text-blue-700"
						>{totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span
					>
				</div>
			</div>
		</div>

		<input type="hidden" name="items_json" value={JSON.stringify(items)} />
		<input type="hidden" name="subtotal" value={subtotal} />
		<input type="hidden" name="discount" value={discountGlobal} />
		<input type="hidden" name="vat_rate" value={vatRate} />
		<input type="hidden" name="vat_amount" value={vatAmount} />
		<input type="hidden" name="wht_rate" value={whtRate} />
		<input type="hidden" name="wht_amount" value={whtAmount} />
		<input type="hidden" name="total_amount" value={totalAmount} />

		<div class="mt-6 flex justify-end gap-4">
			<a
				href="/purchase-orders/{po.id}"
				class="rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
				>ยกเลิก</a
			>
			<button
				type="submit"
				class="rounded-md border border-transparent bg-blue-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
				>บันทึกการแก้ไข (Update)</button
			>
		</div>
	</form>
</div>
