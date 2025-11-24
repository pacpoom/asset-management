<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	export let data: PageData;
	$: ({ billingNote, customers, availableInvoices } = data);

	let billingDate = '';
	let dueDate = '';
	let notes = '';
	let selectedInvoiceIds: number[] = [];

	// Initialize Data
	$: if (billingNote) {
		billingDate = new Date(billingNote.billing_date).toISOString().split('T')[0];
		dueDate = billingNote.due_date
			? new Date(billingNote.due_date).toISOString().split('T')[0]
			: '';
		notes = billingNote.notes || '';
	}

	// Initialize Selected Invoices (เฉพาะครั้งแรก)
	let isInit = false;
	$: if (availableInvoices && !isInit) {
		selectedInvoiceIds = availableInvoices
			.filter((inv: any) => inv.is_selected === 1)
			.map((inv: any) => inv.id);
		isInit = true;
	}

	// คำนวณยอดรวม
	$: totalAmount = availableInvoices
		.filter((inv: any) => selectedInvoiceIds.includes(inv.id))
		.reduce((sum: number, inv: any) => sum + parseFloat(inv.total_amount), 0);

	function toggleInvoice(id: number) {
		if (selectedInvoiceIds.includes(id)) {
			selectedInvoiceIds = selectedInvoiceIds.filter((i) => i !== id);
		} else {
			selectedInvoiceIds = [...selectedInvoiceIds, id];
		}
	}

	const formatCurrency = (amount: number) =>
		new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
	const formatDate = (dateStr: string) =>
		new Date(dateStr).toLocaleDateString('th-TH', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});

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
			<h3 class="mb-2 text-lg font-medium text-gray-800">เลือกใบแจ้งหนี้ที่ต้องการวางบิล</h3>

			{#if availableInvoices.length === 0}
				<div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
					ไม่พบรายการใบแจ้งหนี้ที่ค้างจ่าย
				</div>
			{:else}
				<div class="overflow-hidden rounded-lg border">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th class="w-10 px-4 py-3 text-center"> </th>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
									>เลขที่เอกสาร</th
								>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
									>วันที่</th
								>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
									>ครบกำหนด</th
								>
								<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"
									>ยอดเงิน</th
								>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200 bg-white">
							{#each availableInvoices as inv}
								<tr class="cursor-pointer hover:bg-gray-50" on:click={() => toggleInvoice(inv.id)}>
									<td class="px-4 py-3 text-center">
										<input
											type="checkbox"
											checked={selectedInvoiceIds.includes(inv.id)}
											class="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										/>
									</td>
									<td class="px-4 py-3 text-sm font-medium text-blue-600">{inv.invoice_number}</td>
									<td class="px-4 py-3 text-sm text-gray-600">{formatDate(inv.invoice_date)}</td>
									<td class="px-4 py-3 text-sm text-gray-600">{formatDate(inv.due_date)}</td>
									<td class="px-4 py-3 text-right text-sm font-medium text-gray-900"
										>{formatCurrency(inv.total_amount)}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<div class="mb-6 flex justify-end">
			<div class="min-w-[250px] rounded-lg border border-gray-200 bg-gray-50 p-4">
				<div class="flex items-center justify-between text-lg font-bold text-gray-900">
					<span>ยอดรวมทั้งสิ้น</span>
					<span class="text-blue-600">{formatCurrency(totalAmount)}</span>
				</div>
				<div class="mt-1 text-right text-xs text-gray-500">
					เลือก {selectedInvoiceIds.length} รายการ
				</div>
			</div>
		</div>

		<input type="hidden" name="selected_invoices" value={JSON.stringify(selectedInvoiceIds)} />

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
				disabled={isSaving || selectedInvoiceIds.length === 0}
			>
				{#if isSaving}
					Saving...
				{:else}
					บันทึกการแก้ไข
				{/if}
			</button>
		</div>
	</form>
</div>
