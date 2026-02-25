<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { ActionData, PageData } from './$types';

	// Interface สำหรับข้อมูลบริษัท
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

	type BillingNoteHeader = PageData['billingNote'];
	type BillingNoteItem = PageData['items'][0];
	type Attachment = PageData['attachments'][0];

	// รับค่าจาก Server
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let billingNote = $state<BillingNoteHeader>(data.billingNote);
	let items = $state<BillingNoteItem[]>(data.items);
	let attachments = $state<Attachment[]>(data.attachments);
	let companyData = $state<Company>(data.company);

	let isSaving = $state(false);
	let updateStatusForm: HTMLFormElement;
	let statusToUpdate = $state('');

	$effect(() => {
		billingNote = data.billingNote;
		items = data.items;
		attachments = data.attachments;
		companyData = data.company;
	});

	// --- Helper Functions ---
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
			Overdue: 'bg-red-100 text-red-800',
			Void: 'bg-gray-300 text-gray-600'
		};
		return statusMap[status] || 'bg-gray-100 text-gray-800';
	}

	function getFileIcon(fileName: string): string {
		const ext = fileName?.split('.').pop()?.toLowerCase() || '';
		if (ext === 'pdf') return '📄';
		if (['doc', 'docx'].includes(ext)) return '📝';
		if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
		if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️';
		return '📎';
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

		<a
			href="/billing-notes/generate-pdf?id={billingNote.id}"
			target="_blank"
			class="inline-flex items-center justify-center rounded-lg bg-gray-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-600 disabled:opacity-50"
		>
			<span>พิมพ์ PDF</span>
		</a>

		<a
			href="/billing-notes/{billingNote.id}/edit"
			class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
		>
			Edit
		</a>

		<div class="relative">
			<select
				onchange={updateStatus}
				disabled={isSaving}
				class="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-yellow-600 focus:outline-none disabled:opacity-50"
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
						alt={companyData.name}
						class="mb-2 h-16 max-w-xs object-contain"
					/>
				{:else}
					<h2 class="text-2xl font-bold text-gray-800">{companyData.name}</h2>
				{/if}
				<div class="mt-2 space-y-0.5 text-sm text-gray-500">
					<p>{companyData.address_line_1 || ''}</p>
					<p>
						{companyData.city || ''}
						{companyData.state_province || ''}
						{companyData.postal_code || ''}
					</p>
					<p>
						<span class="font-semibold text-gray-700">Tax ID:</span>
						{companyData.tax_id || '-'}
					</p>
				</div>
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
			</div>
		</div>
	</div>

	<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
		<div class="md:col-span-2">
			<h3 class="text-sm font-semibold text-gray-500 uppercase">ลูกค้า (Customer)</h3>
			<p class="font-semibold text-gray-800">{billingNote.customer_name}</p>
			<p class="text-sm whitespace-pre-wrap text-gray-600">{billingNote.customer_address || '-'}</p>
			<p class="mt-1 text-sm">
				<span class="font-semibold text-gray-700">Tax ID:</span>
				{billingNote.customer_tax_id || '-'}
			</p>
		</div>

		<div class="md:col-span-1">
			<h3 class="text-sm font-semibold text-gray-500 uppercase">ข้อมูลวันครบกำหนด</h3>
			<div class="mt-2">
				<span class="text-xs font-semibold tracking-wider text-red-600 uppercase"
					>วันครบกำหนด (Due Date)</span
				>
				<p class="font-bold text-red-700">{formatDate(billingNote.due_date)}</p>
			</div>
		</div>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white shadow-sm">
	<h3 class="mb-3 border-b p-4 pb-2 text-lg font-semibold text-gray-700">
		รายการสินค้า/บริการ ({items.length})
	</h3>
	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-4 py-2 text-left font-medium text-gray-500">รายละเอียด (Description)</th>
					<th class="w-[80px] px-4 py-2 text-right font-medium text-gray-500">Qty</th>
					<th class="w-[100px] px-4 py-2 text-right font-medium text-gray-500">Unit</th>
					<th class="px-4 py-2 text-right font-medium text-gray-500">Price/Unit</th>
					<th class="px-4 py-2 text-center font-medium text-red-500">WHT</th>
					<th class="px-4 py-2 text-right font-medium text-gray-500">Total</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#each items as item}
					<tr>
						<td class="px-4 py-2 font-medium text-gray-700">{item.description}</td>
						<td class="px-4 py-2 text-right text-gray-700">{item.quantity}</td>
						<td class="px-4 py-2 text-right text-gray-600">{item.unit_symbol || '-'}</td>
						<td class="px-4 py-2 text-right text-gray-700">{formatCurrency(item.unit_price)}</td>
						<td class="px-4 py-2 text-center font-bold text-red-600">
							{parseFloat(item.wht_rate || '0') > 0 ? `${parseFloat(item.wht_rate)}%` : '-'}
						</td>
						<td class="px-4 py-2 text-right">
							<div class="font-medium text-gray-800">{formatCurrency(item.amount)}</div>
							{#if parseFloat(item.wht_rate || '0') > 0}
								<div class="mt-0.5 text-[10px] font-normal text-red-500">
									(-{formatCurrency((item.amount * parseFloat(item.wht_rate)) / 100)})
								</div>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white p-4 shadow-sm">
	<h2 class="border-b pb-2 text-lg font-semibold text-gray-700">สรุปยอดเงิน (Financial Summary)</h2>
	<div class="mt-3 w-full space-y-2 text-sm">
		<div class="flex items-center justify-between">
			<span class="font-medium text-gray-600">Subtotal:</span>
			<span class="font-medium text-gray-800">{formatCurrency(billingNote.subtotal)}</span>
		</div>

		{#if parseFloat(billingNote.discount_amount) > 0}
			<div class="flex items-center justify-between">
				<span class="font-medium text-gray-600">Discount:</span>
				<span class="font-medium text-red-600">- {formatCurrency(billingNote.discount_amount)}</span
				>
			</div>
		{/if}

		<div class="flex items-center justify-between border-t pt-1">
			<span class="font-medium text-gray-600">Total After Discount:</span>
			<span class="font-medium text-gray-800"
				>{formatCurrency(billingNote.subtotal - Number(billingNote.discount_amount || 0))}</span
			>
		</div>

		<div class="flex items-center justify-between">
			<span class="font-medium text-gray-600">VAT ({Number(billingNote.vat_rate ?? 0)}%):</span>
			<span class="font-medium text-gray-800">{formatCurrency(billingNote.vat_amount)}</span>
		</div>

		{#if parseFloat(billingNote.withholding_tax_amount || '0') > 0}
			<div class="flex items-center justify-between">
				<span class="font-medium text-gray-600">หัก ณ ที่จ่ายรวม (Total WHT):</span>
				<span class="font-medium text-red-600"
					>- {formatCurrency(billingNote.withholding_tax_amount)}</span
				>
			</div>
		{/if}

		<div class="flex items-center justify-between border-t-2 pt-2">
			<span class="text-base font-bold text-gray-900">ยอดรวมทั้งสิ้น (Grand Total):</span>
			<span class="text-xl font-bold text-blue-700">{formatCurrency(billingNote.total_amount)}</span
			>
		</div>
	</div>
</div>

<div class="mb-6 grid grid-cols-1 gap-6">
	<div class="rounded-lg border bg-white p-4 shadow-sm">
		<h3 class="mb-3 border-b pb-2 text-lg font-semibold text-gray-700">หมายเหตุ (Notes)</h3>
		<p class="text-sm whitespace-pre-wrap text-gray-600">{billingNote.notes || 'ไม่มีหมายเหตุ'}</p>
	</div>
</div>
