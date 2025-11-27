<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	export let data: PageData;
	$: ({ customers } = data);

	let billingDate = new Date().toISOString().split('T')[0];
	let dueDate = '';
	let selectedCustomerId: string | number = '';
	let notes = '';
	let totalAmount = 0;

	let isSaving = false;
</script>

<svelte:head>
	<title>สร้างใบวางบิลใหม่</title>
</svelte:head>

<div class="mx-auto max-w-4xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
	<h1 class="mb-6 text-2xl font-bold text-gray-800">สร้างใบวางบิล (New Billing Note)</h1>

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
		<div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
			<div>
				<label for="customer_id" class="mb-1 block text-sm font-medium text-gray-700"
					>ลูกค้า <span class="text-red-500">*</span></label
				>
				<select
					id="customer_id"
					name="customer_id"
					bind:value={selectedCustomerId}
					required
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				>
					<option value="">-- เลือกลูกค้า --</option>
					{#each customers as customer}
						<option value={customer.id}>{customer.name}</option>
					{/each}
				</select>
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
				ยอดเงินรวมที่วางบิล (Total Amount) <span class="text-red-500">*</span>
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
			<p class="mt-1 text-xs text-gray-500">ระบุยอดเงินรวมที่ต้องการเรียกเก็บในใบวางบิลฉบับนี้</p>
		</div>

		<div class="mb-6">
			<label for="notes" class="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ</label>
			<textarea
				id="notes"
				name="notes"
				bind:value={notes}
				rows="3"
				class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				placeholder="เช่น รายละเอียดเลขที่ใบแจ้งหนี้ที่นำมาวางบิล"
			></textarea>
		</div>

		<div class="flex justify-end gap-3">
			<a
				href="/billing-notes"
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
					บันทึกใบวางบิล
				{/if}
			</button>
		</div>
	</form>
</div>
