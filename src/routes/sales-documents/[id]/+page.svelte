<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { ActionData, PageData } from './$types';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let document = $state(data.document);
	let items = $state(data.items);
	let attachments = $state(data.attachments);
	let companyData = $state(data.company);

	let isSaving = $state(false);
	let updateStatusForm: HTMLFormElement;
	let statusToUpdate = $state('');

	$effect(() => {
		document = data.document;
		items = data.items;
		attachments = data.attachments;
		companyData = data.company;
	});

    function getDocTypeName(type: string) {
		switch (type) {
			case 'QT': return 'ใบเสนอราคา';
			case 'BN': return 'ใบวางบิล';
			case 'INV': return 'ใบแจ้งหนี้';
			case 'RE': return 'ใบเสร็จรับเงิน';
			default: return type;
		}
	}

    function getDocTypeEnName(type: string) {
		switch (type) {
			case 'QT': return 'QUOTATION';
			case 'BN': return 'BILLING NOTE';
			case 'INV': return 'INVOICE';
			case 'RE': return 'RECEIPT';
			default: return 'DOCUMENT';
		}
	}

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
		if (['pdf'].includes(ext)) return '📄';
		if (['doc', 'docx'].includes(ext)) return '📝';
		if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
		if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
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
	<title>{getDocTypeName(document.document_type)} {document.document_number}</title>
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

<div class="mb-6 flex flex-col items-start justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
	<div class="flex items-center">
		<a href="/sales-documents" class="mr-3 text-gray-500 hover:text-gray-800" title="กลับหน้ารายการ">
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6"><path d="m15 18-6-6 6-6"></path></svg>
		</a>
		<div>
			<h1 class="text-2xl font-bold text-gray-800">{getDocTypeName(document.document_type)} #{document.document_number}</h1>
			<p class="mt-1 text-sm text-gray-500">
				Customer: <span class="font-medium text-gray-700">{document.customer_name}</span> | Ref: {document.reference_doc || '-'}
			</p>
		</div>
	</div>

	<div class="flex flex-shrink-0 items-center gap-2">
		<span class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold {getStatusClass(document.status)}">
			{document.status}
		</span>

		<a
			href="/sales-documents/generate-pdf?id={document.id}"
			target="_blank"
			class="inline-flex items-center justify-center rounded-lg bg-gray-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-600 disabled:opacity-50"
		>
			<span>พิมพ์ PDF</span>
		</a>

		<a
			href="/sales-documents/{document.id}/edit"
			class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
		>
			แก้ไข
		</a>

		<div class="relative">
			<select
				id="status-change-select"
				onchange={updateStatus}
				disabled={isSaving}
				class="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-yellow-600 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
			>
				<option value="" disabled selected>เปลี่ยนสถานะ</option>
				{#each data.availableStatuses as status}
					{#if status !== document.status}
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
					<img src={companyData.logo_path} alt={companyData.name || 'Company Logo'} class="mb-2 h-16 max-w-xs object-contain" />
				{:else if companyData.name}
					<h2 class="text-2xl font-bold text-gray-800">{companyData.name}</h2>
				{/if}

				<div class="mt-2 space-y-0.5 text-sm text-gray-500">
					{#if companyData.address_line_1}<p>{companyData.address_line_1}</p>{/if}
					{#if companyData.address_line_2}<p>{companyData.address_line_2}</p>{/if}
					<p>{companyData.city || ''} {companyData.state_province || ''} {companyData.postal_code || ''}</p>
					<p>{companyData.country || ''}</p>
					{#if companyData.phone}<p class="mt-1"><span class="font-semibold">Tel:</span> {companyData.phone}</p>{/if}
					{#if companyData.email}<p><span class="font-semibold">Email:</span> {companyData.email}</p>{/if}
					<p class="mt-1"><span class="font-semibold text-gray-700">Tax ID:</span> {companyData.tax_id || '-'}</p>
				</div>
			{:else}
				<p class="text-sm text-red-500">ไม่พบข้อมูลบริษัท</p>
			{/if}
		</div>

		<div class="text-left md:text-right">
			<h1 class="text-2xl font-bold text-gray-800 uppercase">{getDocTypeName(document.document_type)}</h1>
			<p class="text-sm text-gray-500 font-bold">{getDocTypeEnName(document.document_type)}</p>

			<div class="mt-4 space-y-1">
				<div class="text-sm">
					<span class="font-semibold text-gray-600">เลขที่ / No.:</span>
					<span class="font-medium text-gray-800">#{document.document_number}</span>
				</div>
				<div class="text-sm">
					<span class="font-semibold text-gray-600">วันที่ / Date:</span>
					<span class="font-medium text-gray-800">{formatDate(document.document_date)}</span>
				</div>
				<div class="text-sm">
					<span class="font-semibold text-gray-600">อ้างอิง / Ref:</span>
					<span class="font-medium text-gray-800">{document.reference_doc || '-'}</span>
				</div>
			</div>
		</div>
	</div>

	<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
		<div class="md:col-span-2">
			<h3 class="text-sm font-semibold text-gray-500 uppercase">ลูกค้า (Customer)</h3>
			<p class="font-semibold text-gray-800">{document.customer_name}</p>
			<p class="text-sm whitespace-pre-wrap text-gray-600">{document.customer_address || '-'}</p>
			<p class="mt-1 text-sm">
				<span class="font-semibold text-gray-700">Tax ID:</span> {document.customer_tax_id || '-'}
			</p>
		</div>

		<div class="md:col-span-1">
			<h3 class="text-sm font-semibold text-gray-500 uppercase">ข้อมูลเพิ่มเติม (More Info)</h3>
			<p class="mt-1 text-xs text-gray-600">
				<span class="font-semibold">ผู้เตรียม / Prepared By:</span> {document.created_by_name}
			</p>
			{#if document.due_date}
			<div class="mt-2">
				<span class="text-xs font-semibold tracking-wider text-red-600 uppercase">วันครบกำหนด (Due Date)</span>
				<p class="font-bold text-red-700">{formatDate(document.due_date)}</p>
			</div>
			{/if}
		</div>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white shadow-sm">
	<h3 class="mb-3 border-b p-4 pb-2 text-lg font-semibold text-gray-700">รายการสินค้า/บริการ ({items.length})</h3>
	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-4 py-4 text-left font-semibold text-gray-600">Product/Description</th>
					<th class="w-24 px-4 py-4 text-center font-semibold text-gray-600">Qty</th>
					<th class="w-24 px-4 py-4 text-center font-semibold text-gray-600">Unit</th>
					<th class="w-32 px-4 py-4 text-right font-semibold text-gray-600">Price/Unit</th>
					<th class="w-24 px-4 py-4 text-center font-semibold text-red-600">WHT</th>
					<th class="w-40 px-4 py-4 text-right font-semibold text-gray-600">Total</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#each items as item}
					<tr class="transition-colors hover:bg-gray-50">
						<td class="px-4 py-4 text-gray-700">
							<div class="font-medium text-gray-900">{item.description}</div>
						</td>
						<td class="px-4 py-4 text-center text-gray-700">{item.quantity}</td>
						<td class="px-4 py-4 text-center text-gray-600">{item.unit_symbol || '-'}</td>
						<td class="px-4 py-4 text-right text-gray-700">{formatCurrency(item.unit_price)}</td>
						<td class="px-4 py-4 text-center font-bold text-red-600">
							{parseFloat(item.wht_rate || '0') > 0 ? `${parseFloat(item.wht_rate)}%` : '-'}
						</td>
						<td class="px-4 py-4 text-right">
							<div class="font-medium text-gray-900">{formatCurrency(item.line_total)}</div>
							{#if parseFloat(item.wht_rate || '0') > 0}
								<div class="mt-0.5 text-[10px] text-red-500">
									(-{formatCurrency((item.line_total * parseFloat(item.wht_rate)) / 100)})
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
	<h2 class="border-b pb-2 text-lg font-semibold text-gray-700">Financial Summary</h2>
	<div class="w-full space-y-2 text-sm mt-3">
		<div class="flex items-center justify-between">
			<span class="font-medium text-gray-600">Subtotal:</span>
			<span class="font-medium text-gray-800">{formatCurrency(document.subtotal)}</span>
		</div>

		{#if parseFloat(document.discount_amount) > 0}
			<div class="flex items-center justify-between">
				<span class="font-medium text-gray-600">Discount:</span>
				<span class="font-medium text-red-600">- {formatCurrency(document.discount_amount)}</span>
			</div>
		{/if}

		<div class="flex items-center justify-between border-t pt-2">
			<span class="font-medium text-gray-600">Total After Discount:</span>
			<span class="font-medium text-gray-800">{formatCurrency(document.total_after_discount)}</span>
		</div>

		<div class="flex items-center justify-between mt-1">
			<span class="font-medium text-gray-600">VAT ({Number(document.vat_rate ?? 0)}%):</span>
			<span class="font-medium text-gray-800">{formatCurrency(document.vat_amount)}</span>
		</div>

		{#if parseFloat(document.withholding_tax_amount || document.wht_amount || '0') > 0}
			{@const activeWhtRates = [...new Set(items.map((i: any) => parseFloat(i.wht_rate || '0')).filter((r: number) => r > 0))]}
			<div class="flex items-center justify-between">
				<span class="font-medium text-gray-600">
					WHT ({activeWhtRates.length > 0 ? activeWhtRates.join('%, ') + '%' : 'Total'}):
				</span>
				<span class="font-medium text-red-600">- {formatCurrency(document.withholding_tax_amount || document.wht_amount)}</span>
			</div>
		{/if}

		<div class="flex items-center justify-between border-t-2 pt-2 mt-2">
			<span class="text-base font-bold text-gray-900">Grand Total:</span>
			<span class="text-xl font-bold text-blue-700">{formatCurrency(document.total_amount)}</span>
		</div>
	</div>
</div>

<div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
	<div class="rounded-lg border bg-white p-4 shadow-sm h-full">
		<h3 class="mb-3 border-b pb-2 text-lg font-semibold text-gray-700">Notes</h3>
		<p class="text-sm whitespace-pre-wrap text-gray-600">{document.notes || 'No notes.'}</p>
	</div>

	<div class="rounded-lg border bg-white p-4 shadow-sm h-full">
		<h3 class="mb-3 border-b pb-2 text-lg font-semibold text-gray-700">Attachments ({attachments.length})</h3>
		<div class="space-y-2">
			{#if attachments.length === 0}
				<p class="text-sm text-gray-500">No attachments found.</p>
			{:else}
				{#each attachments as attachment (attachment.id)}
					<div class="flex items-center justify-between rounded-md bg-gray-100 p-2 text-sm">
						<div class="flex items-center gap-2 overflow-hidden">
							<span class="flex-shrink-0 text-lg">{getFileIcon(attachment.file_original_name)}</span>
							<a href={attachment.url} target="_blank" rel="noopener noreferrer" class="truncate text-blue-600 hover:underline" title={attachment.file_original_name}>{attachment.file_original_name}</a>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>