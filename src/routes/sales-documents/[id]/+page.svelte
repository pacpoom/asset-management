<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { ActionData, PageData } from './$types';
	import { t, locale } from '$lib/i18n';

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

	// --- Extracted VAT logic to calculate vatAmt and vatFromInc cleanly ---
	let vatBreakdown = $derived.by(() => {
		if (!document || !items) return { vatAmt: 0, vatFromInc: 0 };
		const vatRate = Number(document.vat_rate || 0);
		const discountAmount = Number(document.discount_amount || 0);

		let subtotal = 0;
		let excVatTotal = 0;
		let incVatTotal = 0;

		for (const item of items) {
			const amount = Number(item.line_total || 0);
			subtotal += amount;
			if (Number(item.is_vat) === 1) { // 1 = Inc. VAT
				incVatTotal += amount;
			} else if (Number(item.is_vat) === 0) { // 0 = Exc. VAT
				excVatTotal += amount;
			}
            // 2 = Non-VAT, ignored for VAT totals
		}

		const discountForExcVat = subtotal > 0 ? discountAmount * (excVatTotal / subtotal) : 0;
		const discountForIncVat = subtotal > 0 ? discountAmount * (incVatTotal / subtotal) : 0;

		const vatFromExc = Math.max(0, ((excVatTotal - discountForExcVat) * vatRate) / 100);
		const vatFromInc = Math.max(0, ((incVatTotal - discountForIncVat) * vatRate) / (100 + vatRate));

		let vatAmt = vatFromExc + vatFromInc;
		if (vatAmt === 0 && Number(document.vat_amount || 0) > 0) {
			vatAmt = Number(document.vat_amount || 0);
		}
		return { vatAmt, vatFromInc };
	});

	let displayVatAmount = $derived(vatBreakdown.vatAmt);
	let amountBeforeVat = $derived(Number(document?.total_after_discount || 0) - vatBreakdown.vatFromInc);

	let displayWhtAmount = $derived.by(() => {
		if (!document || !items) return 0;
		const vatRate = Number(document.vat_rate || 0);
		let calculatedWhtAmt = 0;

		for (const item of items) {
			const rawLineTotal = Number(item.line_total || 0);
			const rate = Number(item.wht_rate || 0);
			if (rate > 0) {
				let whtBase = rawLineTotal;
				if (Number(item.is_vat) === 1 && vatRate > 0) { // Inc VAT
					whtBase = rawLineTotal * 100 / (100 + vatRate);
				}
				calculatedWhtAmt += whtBase * (rate / 100);
			}
		}
		return calculatedWhtAmt > 0 ? calculatedWhtAmt : Number(document.wht_amount || document.withholding_tax_amount || 0);
	});

	const formatCurrency = (amount: number | null | undefined) => {
		if (amount === null || amount === undefined) return '-';
		return new Intl.NumberFormat($locale === 'th' ? 'th-TH' : 'en-US', {
			style: 'currency',
			currency: 'THB'
		}).format(amount);
	};

	const formatDate = (dateStr: string | null | undefined) => {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString($locale === 'th' ? 'th-TH' : 'en-US', {
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
	<title>{$t('DocType_' + document.document_type)} {document.document_number}</title>
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
		<a
			href="/sales-documents"
			class="mr-3 text-gray-500 hover:text-gray-800"
			title={$t('Back to list')}
		>
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
			<h1 class="text-2xl font-bold text-gray-800">
				{$t('DocType_' + document.document_type)} #{document.document_number}
			</h1>
			<p class="mt-1 text-sm text-gray-500">
				{$t('Customer')}: <span class="font-medium text-gray-700">{document.customer_name}</span> |
				{$t('Reference')}: {document.reference_doc || '-'}
			</p>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<span
			class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold {getStatusClass(
				document.status
			)}"
		>
			{$t('Status_' + document.status) || document.status}
		</span>

		{#if document.document_type === 'QT'}
			<a
				href="/sales-documents/new?source_id={document.id}&target_type=INV"
				class="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-600"
			>
				{$t('Create Invoice (INV)')}
			</a>
		{:else if document.document_type === 'INV'}
			<a
				href="/sales-documents/new?source_id={document.id}&target_type=BN"
				class="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-orange-600"
			>
				{$t('Create Billing Note (BN)')}
			</a>
			<a
				href="/sales-documents/new?source_id={document.id}&target_type=RE"
				class="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-600"
			>
				{$t('Issue Receipt (RE)')}
			</a>
		{:else if document.document_type === 'BN'}
			<a
				href="/sales-documents/new?source_id={document.id}&target_type=RE"
				class="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-600"
			>
				{$t('Issue Receipt (RE)')}
			</a>
		{/if}

		<a
			href="/sales-documents/generate-pdf?id={document.id}&lang={$locale}"
			target="_blank"
			class="inline-flex items-center justify-center rounded-lg bg-gray-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-600 disabled:opacity-50"
		>
			<span>{$t('Print PDF')}</span>
		</a>

		<a
			href="/sales-documents/{document.id}/edit"
			class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
		>
			{$t('Edit')}
		</a>

		<div class="relative">
			<select
				id="status-change-select"
				onchange={updateStatus}
				disabled={isSaving}
				class="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-yellow-600 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
			>
				<option value="" disabled selected>{$t('Change Status')}</option>
				{#each data.availableStatuses as status}
					{#if status !== document.status}
						<option value={status} class="bg-white text-gray-800"
							>{$t('Status_' + status) || status}</option
						>
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
					<p class="mt-1">
						<span class="font-semibold text-gray-700">Tax ID:</span>
						{companyData.tax_id || '-'}
					</p>
				</div>
			{:else}
				<p class="text-sm text-red-500">{$t('Company data not found')}</p>
			{/if}
		</div>

		<div class="text-left md:text-right">
			<h1 class="text-2xl font-bold text-gray-800 uppercase">
				{$t('DocType_' + document.document_type)}
			</h1>

			<div class="mt-4 space-y-1">
				<div class="text-sm">
					<span class="font-semibold text-gray-600">{$t('Document No.')}:</span>
					<span class="font-medium text-gray-800">#{document.document_number}</span>
				</div>
				<div class="text-sm">
					<span class="font-semibold text-gray-600">{$t('Date')}:</span>
					<span class="font-medium text-gray-800">{formatDate(document.document_date)}</span>
				</div>
				<div class="text-sm">
					<span class="font-semibold text-gray-600">{$t('Credit Term')}:</span>
					<span class="font-medium text-gray-800">
						{document.credit_term && document.credit_term > 0
							? `${document.credit_term} ${$t('Days')}`
							: $t('Cash')}
					</span>
				</div>
				{#if document.job_order_id}
					<div class="text-sm">
						<span class="font-semibold text-gray-600">{$t('Job Order')}:</span>
						<span class="font-medium text-gray-800">
							{document.job_number}
						</span>
					</div>
				{/if}
				<div class="text-sm">
					<span class="font-semibold text-gray-600">{$t('Reference')}:</span>
					<span class="font-medium text-gray-800">{document.reference_doc || '-'}</span>
				</div>
			</div>
		</div>
	</div>

	<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
		<div class="md:col-span-2">
			<h3 class="text-sm font-semibold text-gray-500 uppercase">{$t('Customer')}</h3>
			<p class="font-semibold text-gray-800">{document.customer_name}</p>
			<p class="text-sm whitespace-pre-wrap text-gray-600">{document.customer_address || '-'}</p>
			<p class="mt-1 text-sm">
				<span class="font-semibold text-gray-700">Tax ID:</span>
				{document.customer_tax_id || '-'}
			</p>
		</div>

		<div class="md:col-span-1">
			<h3 class="text-sm font-semibold text-gray-500 uppercase">{$t('More Info')}</h3>
			<p class="mt-1 text-xs text-gray-600">
				<span class="font-semibold">{$t('Prepared By')}:</span>
				{document.created_by_name}
			</p>
			{#if document.due_date}
				<div class="mt-2">
					<span class="text-xs font-semibold tracking-wider text-red-600 uppercase"
						>{$t('Due Date')}</span
					>
					<p class="font-bold text-red-700">{formatDate(document.due_date)}</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white shadow-sm">
	<h3 class="mb-3 border-b p-4 pb-2 text-lg font-semibold text-gray-700">
		{$t('Products/Items')} ({items.length})
	</h3>
	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-4 py-4 text-left font-semibold text-gray-600"
						>{$t('Product/Description')}</th
					>
					<th class="w-24 px-4 py-4 text-center font-semibold text-gray-600">{$t('Qty')}</th>
					<th class="w-24 px-4 py-4 text-center font-semibold text-gray-600">{$t('Unit')}</th>
					<th class="w-32 px-4 py-4 text-right font-semibold text-gray-600">{$t('Unit Price')}</th>
					<th class="w-24 px-4 py-4 text-center font-semibold text-blue-600">VAT Status</th>
					<th class="w-32 px-4 py-4 text-right font-semibold text-gray-600">{$t('Amount') || 'Amount'}</th>
					<th class="w-24 px-4 py-4 text-center font-semibold text-red-600">WHT</th>
					<th class="w-40 px-4 py-4 text-right font-semibold text-gray-600">{$t('Total')}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#each items as item}
					{@const amount = item.line_total}
					{@const whtBase = Number(item.is_vat) === 1 ? item.line_total * 100 / (100 + Number(document.vat_rate || 7)) : item.line_total}
					<tr class="transition-colors hover:bg-gray-50">
						<td class="px-4 py-4 text-gray-700"
							><div class="font-medium text-gray-900">{item.description}</div></td
						>
						<td class="px-4 py-4 text-center text-gray-700">{item.quantity}</td>
						<td class="px-4 py-4 text-center text-gray-600">{item.unit_symbol || '-'}</td>
						<td class="px-4 py-4 text-right text-gray-700">{formatCurrency(item.unit_price)}</td>
						<td class="px-4 py-4 text-center font-bold">
                            {#if Number(item.is_vat) === 1}
                                <span class="text-blue-600">Inc.</span>
                            {:else if Number(item.is_vat) === 0}
                                <span class="text-orange-600">Exc.</span>
                            {:else}
                                <span class="text-gray-500">None</span>
                            {/if}
						</td>
						<td class="px-4 py-4 text-right text-gray-700 font-medium">
							{formatCurrency(amount)}
						</td>
						<td class="px-4 py-4 text-center font-bold text-red-600">
							{parseFloat(item.wht_rate || '0') > 0 ? `${parseFloat(item.wht_rate)}%` : '-'}
						</td>
						<td class="px-4 py-4 text-right">
							<div class="font-bold text-gray-900">{formatCurrency(item.line_total)}</div>
							{#if parseFloat(item.wht_rate || '0') > 0}
								<div class="mt-0.5 text-[10px] text-red-500 font-medium">
									(-{formatCurrency((whtBase * parseFloat(item.wht_rate)) / 100)})
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
	<h2 class="border-b pb-2 text-lg font-semibold text-gray-700">{$t('Financial Summary')}</h2>
	<div class="mt-3 w-full space-y-2 text-sm">
		<div class="flex items-center justify-between">
			<span class="font-medium text-gray-600">{$t('Subtotal')}:</span>
			<span class="font-medium text-gray-800">{formatCurrency(document.subtotal)}</span>
		</div>

		<!-- Amount Before VAT Added Here -->
		<div class="mt-1 flex items-center justify-between">
			<span class="font-medium text-gray-600">{$t('Amount Before VAT') || 'Amount Before VAT'}:</span>
			<span class="font-medium text-gray-800">{formatCurrency(amountBeforeVat)}</span>
		</div>

		<div class="mt-1 flex items-center justify-between">
			<span class="font-medium text-gray-600">VAT ({Number(document.vat_rate ?? 0)}%):</span>
			<span class="font-medium text-gray-800">{formatCurrency(displayVatAmount)}</span>
		</div>

		{#if displayWhtAmount > 0}
			{@const activeWhtRates = [
				...new Set(
					items.map((i: any) => parseFloat(i.wht_rate || '0')).filter((r: number) => r > 0)
				)
			]}
			<div class="flex items-center justify-between">
				<span class="font-medium text-gray-600"
					>{$t('Total WHT')} ({activeWhtRates.length > 0
						? activeWhtRates.join('%, ') + '%'
						: 'Total'}):</span
				>
				<span class="font-medium text-red-600"
					>- {formatCurrency(displayWhtAmount)}</span
				>
			</div>
		{/if}

		<div class="mt-2 flex items-center justify-between border-t-2 pt-2">
			<span class="text-base font-bold text-gray-900">{$t('Grand Total')}:</span>
			<span class="text-xl font-bold text-blue-700">{formatCurrency(document.total_amount)}</span>
		</div>
	</div>
</div>

<div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
	<div class="h-full rounded-lg border bg-white p-4 shadow-sm">
		<h3 class="mb-3 border-b pb-2 text-lg font-semibold text-gray-700">{$t('Notes')}</h3>
		<p class="text-sm whitespace-pre-wrap text-gray-600">{document.notes || $t('No notes.')}</p>
	</div>

	<div class="h-full rounded-lg border bg-white p-4 shadow-sm">
		<h3 class="mb-3 border-b pb-2 text-lg font-semibold text-gray-700">
			{$t('Attachments')} ({attachments.length})
		</h3>
		<div class="space-y-2">
			{#if attachments.length === 0}
				<p class="text-sm text-gray-500">{$t('No attachments found.')}</p>
			{:else}
				{#each attachments as attachment (attachment.id)}
					<div class="flex items-center justify-between rounded-md bg-gray-100 p-2 text-sm">
						<div class="flex items-center gap-2 overflow-hidden">
							<span class="flex-shrink-0 text-lg">{getFileIcon(attachment.file_original_name)}</span
							>
							<a
								href={attachment.url}
								target="_blank"
								rel="noopener noreferrer"
								class="truncate text-blue-600 hover:underline"
								title={attachment.file_original_name}>{attachment.file_original_name}</a
							>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>