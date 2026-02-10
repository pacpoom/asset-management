<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { ActionData, PageData } from './$types';

	interface Company {
		name: string;
		logo_path: string | null;
		address_line_1: string | null;
		address_line_2: string | null;
		city: string | null;
		state_province: string | null;
		postal_code: string | null;
		country: string | null;
		phone: string | null;
		email: string | null;
		website: string | null;
		tax_id: string | null;
	}

	interface BillingItem {
		item_name: string;
		description?: string;
		quantity: number;
		unit_price: number;
		amount: number;
	}

	type BillingNoteHeader = PageData['billingNote'];

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let billingNote = $state<BillingNoteHeader>(data.billingNote);
	let items = $state<BillingItem[]>(data.items);
	let companyData = $state<Company>(data.company);

	let isSaving = $state(false);
	let updateStatusForm: HTMLFormElement;
	let statusToUpdate = $state('');

	$effect(() => {
		billingNote = data.billingNote;
		items = data.items;
		companyData = data.company;
	});

	const formatCurrency = (amount: number | null | undefined) => {
		if (amount === null || amount === undefined) return '-';
		return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
	};

	const formatDate = (dateStr: string | null | undefined) => {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString('th-TH', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	};

	function getStatusClass(status: string) {
		const statusMap: Record<string, string> = {
			Draft: 'bg-gray-100 text-gray-800',
			Sent: 'bg-blue-100 text-blue-800',
			Paid: 'bg-green-100 text-green-800',
			Void: 'bg-gray-300 text-gray-600'
		};
		return statusMap[status] || 'bg-gray-100 text-gray-800';
	}

	async function updateStatus(e: Event) {
		const newStatus = (e.currentTarget as HTMLSelectElement).value;
		if (!newStatus) return;
		statusToUpdate = newStatus;
		isSaving = true;
		await tick();
		if (updateStatusForm) {
			updateStatusForm.requestSubmit();
		}
	}
</script>

<svelte:head>
	<title>ใบวางบิล {billingNote.billing_note_number}</title>
</svelte:head>

<form
	method="POST"
	action="?/updateStatus"
	use:enhance={() => {
		return async ({ update }) => {
			await update();
			isSaving = false;
		};
	}}
	class="hidden"
	bind:this={updateStatusForm}
>
	<input type="hidden" name="status" bind:value={statusToUpdate} />
</form>

<div
	class="mb-6 flex flex-col items-start justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center"
>
	<div class="flex items-center">
		<a href="/billing-notes" class="mr-3 text-gray-500 hover:text-gray-800" title="Back to list">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-6 w-6"><path d="m15 18-6-6 6-6"></path></svg
			>
		</a>
		<div>
			<h1 class="text-2xl font-bold text-gray-800">ใบวางบิล #{billingNote.billing_note_number}</h1>
			<p class="mt-1 text-sm text-gray-500">
				Customer: <span class="font-medium text-gray-700">{billingNote.customer_name}</span>
			</p>
		</div>
	</div>

	<div class="flex flex-shrink-0 items-center gap-2">
		<span
			class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold {getStatusClass(
				billingNote.status
			)}"
		>
			{billingNote.status}
		</span>

		{#if billingNote.status !== 'Draft'}
			<a
				href="/billing-notes/generate-pdf?id={billingNote.id}"
				target="_blank"
				class="inline-flex items-center justify-center rounded-lg bg-gray-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-600 disabled:opacity-50"
			>
				<span>พิมพ์ PDF</span>
			</a>
		{/if}

		<a
			href="/billing-notes/{billingNote.id}/edit"
			class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
		>
			Edit
		</a>

		<div class="relative">
			<select
				id="status-change-select"
				onchange={updateStatus}
				disabled={isSaving}
				class="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-yellow-600 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
			>
				<option value="" disabled selected>Change Status</option>
				{#each data.availableStatuses as status}
					{#if status !== billingNote.status}
						<option value={status} class="bg-white text-gray-800">{status}</option>
					{/if}
				{/each}
			</select>
		</div>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white p-6 shadow-sm">
	<div class="flex flex-col justify-between gap-4 border-b pb-4 md:flex-row">
		<div>
			{#if companyData}
				{#if companyData.logo_path}
					<img
						src={companyData.logo_path}
						alt={companyData.name || 'Company Logo'}
						class="mb-2 h-16 max-w-xs object-contain"
					/>
				{:else if companyData.name}
					<h2 class="text-2xl font-bold text-gray-800">{companyData.name}</h2>
				{/if}

				<div class="mt-2 space-y-0.5 text-sm text-gray-500">
					{#if companyData.address_line_1}<p>{companyData.address_line_1}</p>{/if}
					{#if companyData.address_line_2}<p>{companyData.address_line_2}</p>{/if}
					<p>
						{companyData.city || ''}
						{companyData.state_province || ''}
						{companyData.postal_code || ''}
					</p>
					<p>{companyData.country || ''}</p>

					{#if companyData.phone}<p class="mt-1">
							<span class="font-semibold">Tel:</span>
							{companyData.phone}
						</p>{/if}
					{#if companyData.email}<p>
							<span class="font-semibold">Email:</span>
							{companyData.email}
						</p>{/if}

					<p class="mt-1">
						<span class="font-semibold text-gray-700">Tax ID:</span>
						{companyData.tax_id || '-'}
					</p>
				</div>
			{:else}
				<p class="text-sm text-red-500">ไม่พบข้อมูลบริษัท</p>
			{/if}
		</div>

		<div class="text-left md:text-right">
			<h1 class="text-2xl font-bold text-gray-800 uppercase">ใบวางบิล</h1>
			<p class="text-sm text-gray-500">Billing Note</p>

			<div class="mt-4 space-y-1">
				<div class="text-sm">
					<span class="font-semibold text-gray-600">เลขที่ / No.:</span>
					<span class="font-medium text-gray-800">#{billingNote.billing_note_number}</span>
				</div>
				<div class="text-sm">
					<span class="font-semibold text-gray-600">วันที่ / Date:</span>
					<span class="font-medium text-gray-800">{formatDate(billingNote.billing_date)}</span>
				</div>
				<div class="text-sm">
					<span class="font-semibold text-gray-600">ครบกำหนด / Due:</span>
					<span class="font-medium text-red-600">{formatDate(billingNote.due_date)}</span>
				</div>
			</div>
		</div>
	</div>

	<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
		<div class="md:col-span-2">
			<h3 class="text-sm font-semibold text-gray-500 uppercase">ลูกค้า (Customer)</h3>
			<p class="font-semibold text-gray-800">{billingNote.customer_name}</p>

			<p class="text-sm whitespace-pre-wrap text-gray-600">
				{billingNote.customer_address || '-'}
			</p>

			<p class="mt-1 text-sm">
				<span class="font-semibold text-gray-700">Tax ID:</span>
				{billingNote.customer_tax_id || '-'}
			</p>
		</div>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white shadow-sm">
	<h3 class="mb-3 border-b p-4 pb-2 text-lg font-semibold text-gray-700">
		รายการวางบิล ({items.length})
	</h3>
	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-50">
				<tr>
					<th class="w-12 px-3 py-2 text-center font-medium text-gray-500">ลำดับ</th>
					<th class="px-3 py-2 text-left font-medium text-gray-500">รายการ (Description)</th>
					<th class="px-3 py-2 text-center font-medium text-gray-500">จำนวน (Qty)</th>
					<th class="px-3 py-2 text-right font-medium text-gray-500">ราคา/หน่วย</th>
					<th class="px-3 py-2 text-right font-medium text-gray-500">รวมเงิน</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#each items as item, i}
					<tr>
						<td class="px-3 py-2 text-center text-gray-500">{i + 1}</td>
						<td class="px-3 py-2 font-medium text-gray-900"
							>{item.description || item.item_name || '-'}</td
						>
						<td class="px-3 py-2 text-center text-gray-700">{item.quantity}</td>
						<td class="px-3 py-2 text-right text-gray-700">{formatCurrency(item.unit_price)}</td>
						<td class="px-3 py-2 text-right font-medium text-gray-800"
							>{formatCurrency(item.amount)}</td
						>
					</tr>
				{/each}
			</tbody>
			<tfoot class="bg-gray-50 text-sm">
				<tr>
					<td colspan="4" class="px-3 py-2 text-right font-medium text-gray-700"
						>รวมเป็นเงิน (Subtotal):</td
					>
					<td class="px-3 py-2 text-right font-medium text-gray-900">
						{formatCurrency(billingNote.subtotal)}
					</td>
				</tr>

				{#if Number(billingNote.discount_amount) > 0}
					<tr>
						<td colspan="4" class="px-3 py-2 text-right font-medium text-gray-700">
							ส่วนลด (Discount):
						</td>
						<td class="px-3 py-2 text-right font-medium text-red-600">
							-{formatCurrency(billingNote.discount_amount)}
						</td>
					</tr>
					<tr>
						<td colspan="4" class="px-3 py-2 text-right font-medium text-gray-700">
							ราคาหลังหักส่วนลด (After Discount):
						</td>
						<td class="px-3 py-2 text-right font-medium text-gray-900">
							{formatCurrency((billingNote.subtotal || 0) - (billingNote.discount_amount || 0))}
						</td>
					</tr>
				{/if}

				{#if Number(billingNote.vat_rate) > 0}
					<tr>
						<td colspan="4" class="px-3 py-2 text-right font-medium text-gray-700">
							ภาษีมูลค่าเพิ่ม {billingNote.vat_rate}% (VAT):
						</td>
						<td class="px-3 py-2 text-right font-medium text-gray-900">
							{formatCurrency(billingNote.vat_amount)}
						</td>
					</tr>
				{/if}

				{#if Number(billingNote.withholding_tax_rate) > 0}
					<tr>
						<td colspan="4" class="px-3 py-2 text-right font-medium text-gray-700">
							หัก ณ ที่จ่าย {billingNote.withholding_tax_rate}% (WHT):
						</td>
						<td class="px-3 py-2 text-right font-medium text-red-600">
							-{formatCurrency(billingNote.withholding_tax_amount)}
						</td>
					</tr>
				{/if}

				<tr class="border-t-2 border-gray-200">
					<td colspan="4" class="px-3 py-3 text-right font-bold text-gray-800">
						ยอดรวมทั้งสิ้น (Grand Total):
					</td>
					<td class="px-3 py-3 text-right text-lg font-bold text-blue-700">
						{formatCurrency(billingNote.total_amount)}
					</td>
				</tr>
			</tfoot>
		</table>
	</div>
</div>

<div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-12">
	<div class="md:col-span-8">
		<div class="h-full rounded-lg border bg-white p-4 shadow-sm">
			<h3 class="mb-3 border-b pb-2 text-lg font-semibold text-gray-700">หมายเหตุ (Notes)</h3>
			<p class="text-sm whitespace-pre-wrap text-gray-600">{billingNote.notes || '-'}</p>
		</div>
	</div>
</div>
