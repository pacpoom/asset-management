<script lang="ts">
	import { enhance } from '$app/forms';
	let isSaving = false;
	let type = 'PV';

	// ตัวแปรสำหรับคำนวณ
	let subtotal = 0;
	let vatRate = 0; // 0 หรือ 7
	let whtRate = 0; // 0, 1, 3, 5 etc.

	// คำนวณอัตโนมัติ (Reactive Statement)
	$: vatAmount = subtotal * (vatRate / 100);
	$: whtAmount = subtotal * (whtRate / 100);
	// สูตร: ยอดรวม = (ยอดก่อนภาษี + VAT) - หัก ณ ที่จ่าย
	$: totalAmount = subtotal + vatAmount - whtAmount;
</script>

<div class="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
	<h1 class="mb-6 text-2xl font-bold text-gray-800">สร้างใบสำคัญรับ-จ่าย</h1>

	<form
		method="POST"
		action="?/create"
		use:enhance={() => {
			isSaving = true;
			return async ({ update }) => {
				await update();
				isSaving = false;
			};
		}}
	>
		<div class="mb-6">
			<span class="mb-2 block text-sm font-medium text-gray-700">ประเภทเอกสาร</span>
			<div class="flex gap-4">
				<label
					class="flex cursor-pointer items-center gap-2 rounded-lg border p-3 {type === 'RV'
						? 'border-green-500 bg-green-50'
						: ''}"
				>
					<input type="radio" name="voucher_type" value="RV" bind:group={type} />
					<span class="font-bold text-green-700">ใบสำคัญรับ (RV)</span>
				</label>
				<label
					class="flex cursor-pointer items-center gap-2 rounded-lg border p-3 {type === 'PV'
						? 'border-red-500 bg-red-50'
						: ''}"
				>
					<input type="radio" name="voucher_type" value="PV" bind:group={type} />
					<span class="font-bold text-red-700">ใบสำคัญจ่าย (PV)</span>
				</label>
			</div>
		</div>

		<div class="mb-4 grid grid-cols-2 gap-4">
			<div>
				<label for="voucher_date" class="mb-1 block text-sm font-medium text-gray-700">วันที่</label
				>
				<input
					id="voucher_date"
					type="date"
					name="voucher_date"
					required
					class="w-full rounded-md border-gray-300"
					value={new Date().toISOString().split('T')[0]}
				/>
			</div>
			<div>
				<label for="contact_name" class="mb-1 block text-sm font-medium text-gray-700">
					{type === 'RV' ? 'รับเงินจาก (Payer)' : 'จ่ายให้แก่ (Payee)'}
				</label>
				<input
					id="contact_name"
					type="text"
					name="contact_name"
					required
					class="w-full rounded-md border-gray-300"
					placeholder="ระบุชื่อ..."
				/>
			</div>
		</div>

		<div class="mb-4">
			<label for="description" class="mb-1 block text-sm font-medium text-gray-700"
				>รายละเอียด</label
			>
			<textarea
				id="description"
				name="description"
				rows="3"
				class="w-full rounded-md border-gray-300"
				placeholder="รายละเอียด..."
			></textarea>
		</div>

		<div class="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
			<div class="mb-3">
				<label for="subtotal" class="mb-1 block text-sm font-medium text-gray-700"
					>ยอดเงิน (Subtotal)</label
				>
				<input
					id="subtotal"
					type="number"
					step="0.01"
					name="subtotal"
					bind:value={subtotal}
					class="w-full rounded-md border-gray-300 text-right"
					placeholder="0.00"
				/>
			</div>

			<div class="mb-3 grid grid-cols-2 gap-4">
				<div>
					<label for="vat_rate" class="mb-1 block text-sm font-medium text-gray-700">VAT (%)</label>
					<select
						id="vat_rate"
						name="vat_rate"
						bind:value={vatRate}
						class="w-full rounded-md border-gray-300"
					>
						<option value={0}>ไม่มี VAT (0%)</option>
						<option value={7}>VAT 7%</option>
					</select>
				</div>
				<div>
					<label for="wht_rate" class="mb-1 block text-sm font-medium text-gray-700"
						>หัก ณ ที่จ่าย (%)</label
					>
					<input
						id="wht_rate"
						type="number"
						step="0.01"
						name="wht_rate"
						bind:value={whtRate}
						class="w-full rounded-md border-gray-300 text-right"
						placeholder="0"
					/>
				</div>
			</div>

			<input type="hidden" name="vat_amount" value={vatAmount.toFixed(2)} />
			<input type="hidden" name="wht_amount" value={whtAmount.toFixed(2)} />
			<input type="hidden" name="total_amount" value={totalAmount.toFixed(2)} />

			<div class="border-t border-gray-300 pt-3">
				<div class="mb-1 flex justify-between text-sm">
					<span>VAT ({vatRate}%)</span>
					<span>{vatAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
				</div>
				<div class="mb-2 flex justify-between text-sm text-red-600">
					<span>หัก ณ ที่จ่าย ({whtRate}%)</span>
					<span>- {whtAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
				</div>
				<div class="flex items-center justify-between text-lg font-bold">
					<span>ยอดสุทธิ ({type === 'RV' ? 'รายรับ' : 'รายจ่าย'})</span>
					<span class="text-blue-600"
						>{totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span
					>
				</div>
			</div>
		</div>

		<div class="flex justify-end gap-3">
			<a
				href="/payments"
				class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700">ยกเลิก</a
			>
			<button
				type="submit"
				disabled={isSaving}
				class="rounded-md bg-blue-600 px-6 py-2 text-sm text-white hover:bg-blue-700"
			>
				{isSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
			</button>
		</div>
	</form>
</div>
