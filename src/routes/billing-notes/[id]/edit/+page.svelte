<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	export let data: PageData;
	// ❌ ลบ availableInvoices ออก เพราะเราไม่ได้ใช้แล้ว
	$: ({ billingNote, customers } = data);

	let billingDate = '';
	let dueDate = '';
	let notes = '';
	let totalAmount = 0; // ✅ เพิ่มตัวแปรสำหรับรับค่ายอดเงิน

	// Initialize Data
	$: if (billingNote) {
		billingDate = new Date(billingNote.billing_date).toISOString().split('T')[0];
		dueDate = billingNote.due_date
			? new Date(billingNote.due_date).toISOString().split('T')[0]
			: '';
		notes = billingNote.notes || '';
		// ✅ ดึงยอดเงินเดิมมาแสดง
		totalAmount = parseFloat(billingNote.total_amount || '0');
	}

	let isSaving = false;
</script>

<svelte:head>
	<title>แก้ไขใบวางบิล {billingNote?.billing_note_number}</title>
</svelte:head>

<div class="mx-auto mb-10 max-w-4xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">
			แก้ไขใบวางบิล: {billingNote?.billing_note_number}
		</h1>
		<span class="text-sm text-gray-500">สถานะ: {billingNote?.status}</span>
	</div>

	<form
		method="POST"
		action="?/update"
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
				<label for="customer_id" class="mb-1 block text-sm font-medium text-gray-700"
					>ลูกค้า (แก้ไขไม่ได้)</label
				>
				<select
					id="customer_id"
					class="w-full cursor-not-allowed rounded-md border-gray-300 bg-gray-100 text-gray-500 shadow-sm"
					disabled
				>
					{#each customers as customer}
						<option value={customer.id} selected={customer.id === billingNote.customer_id}
							>{customer.name}</option
						>
					{/each}
				</select>
				<input type="hidden" name="customer_id" value={billingNote.customer_id} />
			</div>
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="billing_date" class="mb-1 block text-sm font-medium text-gray-700"
						>วันที่วางบิล <span class="text-red-500">*</span></label
					>
					<input
						type="date"
						id="billing_date"
						name="billing_date"
						bind:value={billingDate}
						required
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="due_date" class="mb-1 block text-sm font-medium text-gray-700"
						>ครบกำหนดชำระ</label
					>
					<input
						type="date"
						id="due_date"
						name="due_date"
						bind:value={dueDate}
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
			</div>
		</div>

		<div class="mb-6">
			<label for="total_amount" class="mb-1 block text-sm font-medium text-gray-700">
				ยอดเงินรวม (Total Amount) <span class="text-red-500">*</span>
			</label>
			<div class="relative mt-1 rounded-md shadow-sm">
				<input
					type="number"
					id="total_amount"
					name="total_amount"
					bind:value={totalAmount}
					required
					min="0"
					step="0.01"
					class="block w-full rounded-md border-gray-300 pr-12 pl-4 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
					placeholder="0.00"
				/>
				<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
					<span class="text-gray-500 sm:text-sm">THB</span>
				</div>
			</div>
		</div>

		<div class="mb-6">
			<label for="notes" class="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ</label>
			<textarea
				id="notes"
				name="notes"
				bind:value={notes}
				rows="3"
				class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
			></textarea>
		</div>

		<div class="flex justify-end gap-3">
			<a
				href="/billing-notes/{billingNote?.id}"
				class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
			>
				ยกเลิก
			</a>
			<button
				type="submit"
				class="flex items-center rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
				disabled={isSaving || totalAmount <= 0}
			>
				{#if isSaving}
					กำลังบันทึก...
				{:else}
					บันทึกการแก้ไข
				{/if}
			</button>
		</div>
	</form>
</div>
