<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { tick } from 'svelte';
	import { invalidateAll, goto } from '$app/navigation';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	type PagePaymentType = PageData['payment'];
	interface BillPaymentDetailHeader extends PagePaymentType {
		vendor_tax_id: string | null;
	}
	type BillPaymentItemRow = PageData['items'][0];
	type Attachment = PageData['attachments'][0];
	type Vendor = PageData['vendors'][0];
	type Unit = PageData['units'][0];
	type Product = PageData['products'][0];
	type VendorContract = PageData['contracts'][0];
	type Company = PageData['company'];

	export interface BillPaymentItem {
		id: string;
		product_object: { value: number; label: string; product: Product } | null;
		product_id: number | null;
		description: string;
		quantity: number;
		unit_id: number | null;
		unit_price: number;
		line_total: number;
		_db_id: number | null;
	}

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let paymentData = $state<BillPaymentDetailHeader>(data.payment);
	let attachments = $state<Attachment[]>(data.attachments);
	let companyData = $state<Company>(data.company);
	let isEditModalOpen = $state(false);
	let modalItems = $state<BillPaymentItem[]>([]);
	let newAttachments = $state<FileList | null>(null);
	let payment_reference = $state('');
	let payment_date = $state(new Date().toISOString().split('T')[0]);
	let notes = $state('');
	let vendor_id = $state<number | undefined>(undefined);
	let vendor_contract_id = $state<number | undefined>(undefined);
	let discountAmount = $state(0);
	let whtRateValue = $state(0);
	let vatRateValue = $state(0);
	const withholdingTaxRate = $derived(whtRateValue === 0 ? 0.0 : whtRateValue);
	const calculateWithholdingTax = $derived(whtRateValue !== 0);
	let isSaving = $state(false);
	let isPrinting = $state(false);
	let globalMessage = $state<{ text: string; type: 'success' | 'error' } | null>(null);
	let messageTimeout: NodeJS.Timeout;
	let deleteAttachmentTarget = $state<Attachment | null>(null);
	let deletePaymentTarget = $state<BillPaymentDetailHeader | null>(null);
	let updateStatusForm: HTMLFormElement;
	let statusToUpdate = $state('');

	const productOptions = $derived(
		data.products.map((p: Product) => ({
			value: p.id,
			label: `${p.sku} - ${p.name}`,
			product: p
		}))
	);

	const subTotal = $derived(
		modalItems.reduce((sum, item: BillPaymentItem) => {
			const lineTotal = parseFloat(item.line_total as unknown as string) || 0;
			return sum + lineTotal;
		}, 0)
	);
	const totalAfterDiscount = $derived(subTotal - (discountAmount || 0));
	const withholdingTaxAmount = $derived(
		calculateWithholdingTax
			? parseFloat((totalAfterDiscount * (withholdingTaxRate / 100)).toFixed(2))
			: 0
	);
	const vatAmount = $derived(parseFloat((totalAfterDiscount * (vatRateValue / 100)).toFixed(2)));
	const grandTotal = $derived(totalAfterDiscount + vatAmount - withholdingTaxAmount);

	$effect(() => {
		if (modalItems && modalItems.length > 0) {
			modalItems.forEach((item) => {
				const quantity = parseFloat(item.quantity as unknown as string) || 0;
				const unitPrice = parseFloat(item.unit_price as unknown as string) || 0;
				item.line_total = quantity * unitPrice;
			});
		}
	});

	const filteredContracts = $derived(
		vendor_id ? data.contracts.filter((c: VendorContract) => c.vendor_id === vendor_id) : []
	);
	const formattedAddress = $derived(
		(() => {
			const address = paymentData.vendor_address || 'No address provided.';
			return address
				.split(/\r?\n/)
				.map((line: string) => line.trim())
				.filter((line: string) => line.length > 0)
				.join('\n');
		})()
	);

	function formatCurrency(value: number | null | undefined, currency: string = 'THB') {
		if (value === null || value === undefined) return '-';
		return new Intl.NumberFormat('th-TH', {
			style: 'currency',
			currency: currency,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(value);
	}

	const formatNumber = (num: number | string | null | undefined): string => {
		if (num === null || num === undefined) return '-';
		const numericValue = typeof num === 'string' ? parseFloat(num) : num;
		if (isNaN(numericValue)) return '0.00';
		return numericValue.toLocaleString('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	};

	function formatDateOnly(isoString: string | null | undefined): string {
		if (!isoString) return '-';
		try {
			return new Date(isoString).toLocaleDateString('th-TH', {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return 'Invalid Date';
		}
	}

	function getStatusClass(status: BillPaymentDetailHeader['status']) {
		const statusMap: Record<string, string> = {
			Draft: 'bg-gray-100 text-gray-800',
			Submitted: 'bg-blue-100 text-blue-800',
			Paid: 'bg-green-100 text-green-800',
			Void: 'bg-red-100 text-red-800',
			Approved: 'bg-teal-100 text-teal-800',
			Rejected: 'bg-orange-100 text-orange-800'
		};
		return statusMap[status] || 'bg-yellow-100 text-yellow-800';
	}

	function getFileIcon(fileName: string): string {
		const ext = fileName?.split('.').pop()?.toLowerCase() || '';
		if (['pdf'].includes(ext)) return '📄';
		if (['doc', 'docx'].includes(ext)) return '📝';
		if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
		if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
		return '📎';
	}

	function showGlobalMessage(text: string, type: 'success' | 'error', duration = 5000) {
		clearTimeout(messageTimeout);
		globalMessage = { text, type };
		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, duration);
	}

	function openEditModal() {
		payment_reference = paymentData.payment_reference ?? '';
		payment_date = paymentData.payment_date.split('T')[0];
		notes = paymentData.notes ?? '';
		vendor_id = paymentData.vendor_id;
		vendor_contract_id = paymentData.vendor_contract_id ?? undefined;
		discountAmount = paymentData.discount_amount;
		whtRateValue = paymentData.withholding_tax_rate ?? 0;
		vatRateValue = paymentData.vat_rate ?? 0;

		modalItems = data.items.map((item: BillPaymentItemRow) => {
			const productOption = productOptions.find(
				(p: { value: number }) => p.value === item.product_id
			);
			return {
				id: item.id.toString(),
				product_object: productOption || null,
				product_id: item.product_id,
				description: item.description || '',
				quantity: item.quantity,
				unit_id: item.unit_id,
				unit_price: item.unit_price,
				line_total: item.line_total,
				_db_id: item.id
			};
		});
		newAttachments = null;
		isEditModalOpen = true;
	}

	function closeEditModal() {
		isEditModalOpen = false;
	}

	function addLineItem() {
		modalItems = [
			...modalItems,
			{
				id: crypto.randomUUID(),
				product_object: null,
				product_id: null,
				description: '',
				quantity: 1,
				unit_id: null,
				unit_price: 0,
				line_total: 0,
				_db_id: null
			}
		];
	}

	function removeLineItem(idToRemove: string) {
		modalItems = modalItems.filter((item) => item.id !== idToRemove);
	}

	function updateLineTotal(item: BillPaymentItem) {
		const quantity = parseFloat(item.quantity as unknown as string) || 0;
		const unitPrice = parseFloat(item.unit_price as unknown as string) || 0;
		item.line_total = quantity * unitPrice;
	}

	function onProductSelectChange(item: BillPaymentItem, selected: any) {
		item.product_object = selected;

		if (!selected) {
			item.product_id = null;
			item.description = '';
			item.unit_id = null;
			item.unit_price = 0;
		} else {
			const selectedProduct = selected.product;
			if (selectedProduct) {
				item.product_id = selected.value;
				item.description = selectedProduct.name;
				item.unit_id = selectedProduct.unit_id;
				item.unit_price = selectedProduct.purchase_cost ?? 0;
			}
		}
		updateLineTotal(item);
	}

	function onVendorChange() {
		vendor_contract_id = undefined;
	}

	async function updateStatus(e: Event) {
		const newStatus = (e.currentTarget as HTMLSelectElement)
			.value as BillPaymentDetailHeader['status'];
		isSaving = true;
		statusToUpdate = newStatus;
		await tick();
		if (updateStatusForm) {
			updateStatusForm.requestSubmit();
		}
	}

	function openDeleteAttachmentModal(attachment: Attachment) {
		deleteAttachmentTarget = attachment;
	}

	function handleAttachmentDeletion() {
		if (!deleteAttachmentTarget) return;
		isSaving = true;
		const formData = new FormData();
		formData.append('attachment_id', deleteAttachmentTarget.id.toString());
		fetch('?/deleteAttachment', { method: 'POST', body: formData })
			.then((res) => res.json())
			.then((result) => {
				if (result.success) {
					showGlobalMessage(result.message, 'success');
					attachments = attachments.filter((a) => a.id !== deleteAttachmentTarget!.id);
					deleteAttachmentTarget = null;
					invalidateAll();
				} else {
					showGlobalMessage(result.message || 'Attachment deletion failed.', 'error');
				}
			})
			.catch((err) => showGlobalMessage(`Network error: ${err.message}`, 'error'))
			.finally(() => {
				isSaving = false;
			});
	}

	async function handlePrintPdf() {
		if (isPrinting) return;
		isPrinting = true;
		console.log('กำลังสั่งพิมพ์ voucher ID:', paymentData.id);
		try {
			const response = await fetch('/bill-payments/generate-pdf', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					id: paymentData.id
				})
			});
			if (!response.ok || response.headers.get('Content-Type') !== 'application/pdf') {
				try {
					const errorData = await response.json();
					console.error('Server failed to generate PDF:', errorData.message);
					alert('Server Error: ' + (errorData.message || response.statusText));
				} catch (jsonError) {
					alert('Server Error: ' + response.statusText);
				}
				return;
			}

			const pdfBlob = await response.blob();
			const pdfUrl = URL.createObjectURL(pdfBlob);
			const link = document.createElement('a');
			link.href = pdfUrl;
			link.setAttribute('download', `bill-payment-${paymentData.id}.pdf`);
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(pdfUrl);
		} catch (error) {
			console.error('Fetch Error:', error);
			if (error instanceof Error) {
				alert('เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + error.message);
			} else {
				alert('เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + String(error));
			}
		} finally {
			isPrinting = false;
		}
	}

	$effect.pre(() => {
		if (form?.action === 'updatePayment') {
			if (form.success) {
				closeEditModal();
				showGlobalMessage(form.message as string, 'success');
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage(form.message as string, 'error');
			}
			form.action = undefined;
		}

		if (form?.action === 'updatePaymentStatus' && form.success && form.newStatus) {
			paymentData = { ...paymentData, status: form.newStatus };
			showGlobalMessage(form.message as string, 'success');
			form.action = undefined;
			isSaving = false;
		} else if (form?.action === 'deleteAttachment' && form.success && form.deletedAttachmentId) {
			attachments = attachments.filter((a) => a.id !== form.deletedAttachmentId);
			showGlobalMessage(form.message as string, 'success');
			deleteAttachmentTarget = null;
			form.action = undefined;
			isSaving = false;
		}
	});

	$effect(() => {
		paymentData = data.payment;
		attachments = data.attachments;
		companyData = data.company;
	});
</script>

<svelte:head>
	<title>Bill Payment #{paymentData.id}</title>
	<link rel="stylesheet" href="https://unpkg.com/svelte-select@latest/dist/stylesheet.css" />
</svelte:head>

<form
	method="POST"
	action="?/updatePaymentStatus"
	use:enhance
	class="hidden"
	bind:this={updateStatusForm}
>
	<input type="hidden" name="status" bind:value={statusToUpdate} />
</form>

{#if globalMessage}
	<div
		transition:fade
		class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 text-sm font-semibold shadow-xl {globalMessage.type ===
		'success'
			? 'bg-green-100 text-green-800'
			: 'bg-red-100 text-red-800'}"
	>
		{globalMessage.text}
	</div>
{/if}

<div
	class="mb-6 flex flex-col items-start justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center"
>
	<div class="flex items-center">
		<a href="/bill-payments" class="mr-3 text-gray-500 hover:text-gray-800" title="Back to list">
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
			<h1 class="text-2xl font-bold text-gray-800">รายละเอียดรายการจ่ายเงิน #{paymentData.id}</h1>
			<p class="mt-1 text-sm text-gray-500">
				Vendor: <span class="font-medium text-gray-700">{paymentData.vendor_name}</span> | Ref: {paymentData.payment_reference ||
					'-'}
			</p>
		</div>
	</div>

	<div class="flex flex-shrink-0 items-center gap-2">
		<span
			class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold {getStatusClass(
				paymentData.status
			)}"
		>
			{paymentData.status}
		</span>

		{#if paymentData.status === 'Submitted'}
			<a
				href="/bill-payments/generate-pdf?id={paymentData.id}"
				target="_blank"
				class="inline-flex items-center justify-center rounded-lg bg-gray-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-600 disabled:opacity-50"
				role="button"
			>
				<span>พิมพ์ PDF (ดาวน์โหลด)</span>
			</a>
		{/if}

		<button
			onclick={openEditModal}
			class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
			disabled={isSaving}
		>
			Edit
		</button>

		<div class="relative">
			<label for="status-change-select" class="sr-only">Change Payment Status</label>
			<select
				id="status-change-select"
				onchange={updateStatus}
				class="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-yellow-600 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
				disabled={isSaving}
			>
				<option value="" disabled selected>Change Status</option>
				{#each data.availableStatuses as status}
					{#if status !== paymentData.status}
						<option value={status} class="bg-white text-gray-800">{status}</option>
					{/if}
				{/each}
			</select>
		</div>

		<button
			onclick={() => (deletePaymentTarget = paymentData)}
			class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 disabled:opacity-50"
			disabled={isSaving}
		>
			Delete
		</button>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white p-6 shadow-sm">
	<div class="flex flex-col justify-between gap-4 border-b pb-4 md:flex-row">
		<div>
			{#if companyData?.logo_path}
				<img
					src={companyData.logo_path}
					alt={companyData?.name || 'Company Logo'}
					class="mb-2 h-16 max-w-xs object-contain"
				/>
			{:else if companyData?.name}
				<h2 class="text-2xl font-bold text-gray-800">{companyData.name}</h2>
			{/if}

			<div class="mt-2 space-y-0.5 text-sm text-gray-500">
				<p>{companyData?.address_line_1 || ''}</p>
				{#if companyData?.address_line_2}
					<p>{companyData.address_line_2}</p>
				{/if}
				<p>
					{companyData?.city || ''}
					{companyData?.state_province || ''}
					{companyData?.postal_code || ''}
				</p>
				<p>{companyData?.country || ''}</p>
				<p>
					<span class="font-semibold text-gray-700">Tax ID:</span>
					{companyData?.tax_id || '-'}
				</p>
			</div>
		</div>

		<div class="text-left md:text-right">
			<h1 class="text-2xl font-bold text-gray-800 uppercase">ใบสำคัญจ่าย</h1>
			<p class="text-sm text-gray-500">Bill Payment Voucher</p>

			<div class="mt-4 space-y-1">
				<div class="text-sm">
					<span class="font-semibold text-gray-600">เลขที่ / No.:</span>
					<span class="font-medium text-gray-800">#{paymentData.id}</span>
				</div>
				<div class="text-sm">
					<span class="font-semibold text-gray-600">วันที่ / Date:</span>
					<span class="font-medium text-gray-800">{formatDateOnly(paymentData.payment_date)}</span>
				</div>
				<div class="text-sm">
					<span class="font-semibold text-gray-600">อ้างอิง / Ref:</span>
					<span class="font-medium text-gray-800">{paymentData.payment_reference || '-'}</span>
				</div>
			</div>
		</div>
	</div>

	<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
		<div class="md:col-span-2">
			<h3 class="text-sm font-semibold text-gray-500 uppercase">ซัพพลายเออร์ (Supplier)</h3>
			<p class="font-semibold text-gray-800">{paymentData.vendor_name}</p>
			<p class="text-sm whitespace-pre-wrap text-gray-600">
				{formattedAddress}
			</p>
			<p class="text-sm">
				<span class="font-semibold text-gray-700">Tax ID:</span>
				{paymentData.vendor_tax_id || '-'}
			</p>
		</div>

		<div class="md:col-span-1">
			<h3 class="text-sm font-semibold text-gray-500 uppercase">ข้อมูลเพิ่มเติม (More Info)</h3>
			<p class="mt-1 text-xs text-gray-600">
				<span class="font-semibold">ผู้เตรียม / Prepared By:</span>
				{paymentData.prepared_by_user_name}
			</p>
			<p class="mt-1 text-xs text-gray-600">
				<span class="font-semibold">สัญญา / Contract:</span>
				{paymentData.vendor_contract_number || '-'}
			</p>
		</div>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white shadow-sm">
	<h3 class="mb-3 border-b p-4 pb-2 text-lg font-semibold text-gray-700">
		รายการสินค้า/บริการ ({data.items.length})
	</h3>
	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-3 py-2 text-left font-medium text-gray-500">Product/Description</th>
					<th class="w-[70px] px-3 py-2 text-right font-medium text-gray-500">Qty</th>
					<th class="w-[100px] px-3 py-2 text-right font-medium text-gray-500">Unit</th>
					<th class="px-3 py-2 text-right font-medium text-gray-500">Price/Unit</th>
					<th class="px-3 py-2 text-right font-medium text-gray-500">Total</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#each data.items as item}
					<tr>
						<td class="px-3 py-2 text-gray-700">
							<span class="font-medium">{item.product_name}</span>
							<span class="block font-mono text-xs text-gray-500">{item.product_sku}</span>
							{#if item.description && item.description !== item.product_name}
								<span class="block text-xs text-gray-600 italic">{item.description}</span>
							{/if}
						</td>
						<td class="px-3 py-2 text-right text-gray-700">{formatNumber(item.quantity)}</td>
						<td class="px-3 py-2 text-right text-gray-600">{item.unit_symbol || '-'}</td>
						<td class="px-3 py-2 text-right text-gray-700">{formatCurrency(item.unit_price)}</td>
						<td class="px-3 py-2 text-right font-medium text-gray-800"
							>{formatCurrency(item.line_total)}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white p-4 shadow-sm">
	<h2 class="border-b pb-2 text-lg font-semibold text-gray-700">Financial Summary</h2>
	<div class="w-full space-y-2 text-sm">
		<div class="flex items-center justify-between">
			<span class="font-medium text-gray-600">Subtotal:</span><span
				class="font-medium text-gray-800">{formatCurrency(paymentData.subtotal)}</span
			>
		</div>
		<div class="flex items-center justify-between">
			<span class="font-medium text-gray-600">Discount:</span><span class="font-medium text-red-600"
				>- {formatCurrency(paymentData.discount_amount)}</span
			>
		</div>
		<div class="flex items-center justify-between border-t pt-1">
			<span class="font-medium text-gray-600">Total After Discount:</span><span
				class="font-medium text-gray-800">{formatCurrency(paymentData.total_after_discount)}</span
			>
		</div>

		<div class="flex items-center justify-between">
			<span class="font-medium text-gray-600">VAT ({paymentData.vat_rate ?? 0}%):</span>
			<span class="font-medium text-gray-800">{formatCurrency(paymentData.vat_amount)}</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="font-medium text-gray-600">WHT ({paymentData.withholding_tax_rate ?? 0}%):</span
			><span class="font-medium text-red-600"
				>- {formatCurrency(paymentData.withholding_tax_amount)}</span
			>
		</div>
		<div class="flex items-center justify-between border-t-2 pt-2">
			<span class="text-base font-bold text-gray-900">Grand Total:</span><span
				class="text-xl font-bold text-blue-700">{formatCurrency(paymentData.total_amount)}</span
			>
		</div>
	</div>
</div>

<div class="mb-6 grid grid-cols-1 gap-6">
	<div class="rounded-lg border bg-white p-4 shadow-sm">
		<h3 class="mb-3 border-b pb-2 text-lg font-semibold text-gray-700">Notes</h3>
		<p class="text-sm whitespace-pre-wrap text-gray-600">{paymentData.notes || 'No notes.'}</p>
	</div>

	<div class="rounded-lg border bg-white p-4 shadow-sm">
		<h3 class="mb-3 border-b pb-2 text-lg font-semibold text-gray-700">
			Attachments ({attachments.length})
		</h3>
		<div class="space-y-2">
			{#if attachments.length === 0}
				<p class="text-sm text-gray-500">No attachments found.</p>
			{:else}
				{#each attachments as attachment (attachment.id)}
					<div class="flex items-center justify-between rounded-md bg-gray-100 p-2 text-sm">
						<div class="flex items-center gap-2 overflow-hidden">
							<span class="flex-shrink-0 text-lg">{getFileIcon(attachment.file_original_name)}</span
							>
							<a
								href={attachment.file_path}
								target="_blank"
								rel="noopener noreferrer"
								class="truncate text-blue-600 hover:underline"
								title={attachment.file_original_name}>{attachment.file_original_name}</a
							>
						</div>
						<button
							onclick={() => openDeleteAttachmentModal(attachment)}
							class="rounded p-1 text-red-500 hover:bg-red-100"
							title="Delete Attachment"
							disabled={isSaving}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
								></path></svg
							>
						</button>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>

{#if isEditModalOpen}
	<div
		transition:slide
		class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-4 md:pt-8"
	>
		<div class="fixed inset-0" onclick={closeEditModal} role="presentation"></div>
		<div
			class="relative flex max-h-[95vh] w-full max-w-7xl transform flex-col rounded-xl bg-white shadow-2xl transition-all"
		>
			<div class="flex-shrink-0 border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">Edit Bill Payment #{paymentData.id}</h2>
			</div>

			<form
				method="POST"
				action="?/updatePayment"
				enctype="multipart/form-data"
				use:enhance={({ formData }) => {
					isSaving = true;
					globalMessage = null;
					formData.set('payment_id', paymentData.id.toString());
					formData.set(
						'itemsJson',
						JSON.stringify(
							modalItems.map((item) => ({
								product_id: item.product_id,
								description: item.description,
								quantity: item.quantity,
								unit_id: item.unit_id,
								unit_price: item.unit_price,
								line_total: item.line_total
							}))
						)
					);
					formData.set('discountAmount', (discountAmount || 0).toString());
					formData.set('withholdingTaxRate', whtRateValue.toString());
					formData.set('calculateWithholdingTax', calculateWithholdingTax.toString());
					formData.set('vatRate', vatRateValue.toString());
					formData.set('vatAmount', vatAmount.toString());

					formData.set('subtotal', subTotal.toString());
					formData.set('total_after_discount', totalAfterDiscount.toString());
					formData.set('withholdingTaxAmount', withholdingTaxAmount.toString());
					formData.set('total_amount', grandTotal.toString());
					return async ({ update }) => {
						await update({ reset: false });
						isSaving = false;
					};
				}}
				class="flex-1 overflow-y-auto"
			>
				<div class="space-y-6 p-6">
					<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
						<div>
							<label for="vendor_id_modal" class="mb-1 block text-sm font-medium text-gray-700"
								>ผู้จัดจำหน่าย (Vendor) <span class="text-red-500">*</span></label
							>
							<select
								id="vendor_id_modal"
								name="vendor_id"
								bind:value={vendor_id}
								required
								onchange={onVendorChange}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							>
								<option value={undefined} disabled>-- เลือก Vendor --</option>
								{#each data.vendors as vendor (vendor.id)}
									<option value={vendor.id}>{vendor.name}</option>
								{/each}
							</select>
						</div>
						<div>
							<label
								for="vendor_contract_id_modal"
								class="mb-1 block text-sm font-medium text-gray-700">สัญญา (Contract)</label
							>
							<select
								id="vendor_contract_id_modal"
								name="vendor_contract_id"
								bind:value={vendor_contract_id}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								disabled={!vendor_id || filteredContracts.length === 0}
							>
								<option value={undefined}>-- ไม่ผูกกับสัญญา --</option>
								{#each filteredContracts as contract (contract.id)}
									<option value={contract.id}
										>{contract.contract_number
											? `${contract.contract_number} - `
											: ''}{contract.title}</option
									>
								{/each}
							</select>
						</div>
						<div>
							<label for="payment_date_modal" class="mb-1 block text-sm font-medium text-gray-700"
								>วันที่จ่ายเงิน <span class="text-red-500">*</span></label
							>
							<input
								type="date"
								id="payment_date_modal"
								name="payment_date"
								bind:value={payment_date}
								required
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>
						<div>
							<label
								for="payment_reference_modal"
								class="mb-1 block text-sm font-medium text-gray-700">เลขที่อ้างอิง (ถ้ามี)</label
							>
							<input
								type="text"
								id="payment_reference_modal"
								name="payment_reference"
								bind:value={payment_reference}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								placeholder="e.g., Check #123"
							/>
						</div>
					</div>

					<div>
						<h3 class="text-md mb-2 font-semibold text-gray-800">รายการจ่าย</h3>
						<div class="overflow-x-auto rounded border border-gray-200">
							<table class="min-w-full divide-y divide-gray-200 text-sm">
								<thead class="bg-gray-50">
									<tr>
										<th class="w-10 px-3 py-2 text-left font-medium text-gray-500">#</th>
										<th class="w-[25%] px-3 py-2 text-left font-semibold text-gray-600"
											>สินค้า/บริการ (Product) <span class="text-red-500">*</span></th
										>
										<th class="min-w-[250px] px-3 py-2 text-left font-semibold text-gray-600"
											>รายละเอียด</th
										>
										<th class="w-[80px] px-3 py-2 text-right font-semibold text-gray-600">
											จำนวน <span class="text-red-500"></span>
										</th>
										<th class="w-[100px] px-3 py-2 text-left font-semibold text-gray-600">หน่วย</th>
										<th class="w-[120px] px-3 py-2 text-right font-semibold text-gray-600">
											ราคา/หน่วย <span class="text-red-500"></span>
										</th>
										<th class="w-[120px] px-3 py-2 text-right font-semibold text-gray-600"
											>ราคารวม</th
										>
										<th class="w-10 px-3 py-2 text-center font-semibold text-gray-600"></th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200 bg-white">
									{#if modalItems.length === 0}
										<tr>
											<td colspan="8" class="py-4 text-center text-gray-500 italic"
												>-- กด "เพิ่มรายการ" เพื่อเริ่มต้น --</td
											>
										</tr>
									{/if}
									{#each modalItems as item, index (item.id)}
										<tr class="align-top hover:bg-gray-50">
											<td class="px-3 py-2 text-gray-500">{index + 1}</td>
											<td class="px-3 py-2">
												<Select
													items={productOptions}
													value={item.product_object}
													label={'label'}
													on:change={(e) => onProductSelectChange(item, e.detail)}
													on:clear={() => onProductSelectChange(item, null)}
													placeholder="-- ค้นหา/เลือกสินค้า --"
													required
													container={browser ? document.body : null}
													floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
													--inputStyles={'padding: 2px 0; font-size: 0.875rem;'}
													--itemIsActive={'background: #e0f2fe;'}
													--list={'border-radius: 6px; font-size: 0.875rem;'}
												></Select>
											</td>
											<td class="px-3 py-2">
												<input
													type="text"
													bind:value={item.description}
													placeholder="รายละเอียดเพิ่มเติม..."
													class="w-full rounded-md border-gray-300 py-1 text-sm"
												/>
											</td>
											<td class="px-3 py-2">
												<input
													type="number"
													step="any"
													min="0"
													bind:value={item.quantity}
													oninput={() => updateLineTotal(item)}
													class="w-full rounded-md border-gray-300 py-1 text-right text-sm"
												/>
											</td>
											<td class="px-3 py-2">
												<label for="item-unit-{item.id}" class="sr-only">Unit</label>
												<select
													id="item-unit-{item.id}"
													bind:value={item.unit_id}
													class="w-full rounded-md border-gray-300 py-1 text-sm"
												>
													<option value={null}>-- N/A --</option>
													{#each data.units as unit (unit.id)}
														<option value={unit.id}>{unit.symbol}</option>
													{/each}
												</select>
											</td>
											<td class="px-3 py-2">
												<input
													type="number"
													step="any"
													min="0"
													bind:value={item.unit_price}
													oninput={() => updateLineTotal(item)}
													class="w-full rounded-md border-gray-300 py-1 text-right text-sm"
												/>
											</td>
											<td class="px-3 py-2 text-right font-medium text-gray-700">
												{item.line_total.toLocaleString('th-TH', {
													minimumFractionDigits: 2,
													maximumFractionDigits: 2
												})}
											</td>
											<td class="px-3 py-2 text-center">
												<button
													type="button"
													onclick={() => removeLineItem(item.id)}
													class="p-1 text-red-500 hover:text-red-700"
													title="Remove Item"
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														viewBox="0 0 20 20"
														fill="currentColor"
														class="h-4 w-4"
														><path
															fill-rule="evenodd"
															d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.566 19h4.868a2.75 2.75 0 0 0 2.71-2.529l.841-10.518.149.022a.75.75 0 0 0 .23-1.482A41.03 
                                                            41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 
											                1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75a1.25 1.25 0 0 0-1.25-1.25h-2.5A1.25 1.25 0 0 0 7.5 3.75v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.84 0a.75.75 0 0 1-1.5-.06l-.3 7.5a.75.75 0 1 1 1.5.06l-.3-7-5Z"
															clip-rule="evenodd"
														></path></svg
													>
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<button
							type="button"
							onclick={addLineItem}
							class="mt-2 flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-800"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="h-4 w-4"
								><path
									d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"
								></path></svg
							>
							เพิ่มรายการ
						</button>
					</div>

					<div class="space-y-6 p-6">
						<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
							<div>
								<div class="w-full space-y-2 text-sm">
									<div class="flex items-center justify-between">
										<span class="font-medium text-gray-600">รวมเป็นเงิน (Subtotal):</span>
										<span
											class="text-base font-semibold
                                        text-gray-800">{formatCurrency(subTotal)}</span
										>
									</div>
									<div class="flex items-center justify-between gap-4">
										<label for="discountAmount_modal" class="font-medium text-gray-600"
											>ส่วนลด (Discount):</label
										>
										<input
											type="number"
											id="discountAmount_modal"
											bind:value={discountAmount}
											step="any"
											min="0"
											oninput={() => {
												if (discountAmount < 0) discountAmount = 0;
											}}
											class="w-36 rounded-md border-gray-300 py-1 text-right text-sm shadow-sm"
											placeholder="0.00"
										/>
									</div>
									<div class="flex items-center justify-between border-t pt-2">
										<span class="font-medium text-gray-600">ราคาหลังหักส่วนลด:</span>
										<span class="text-base font-semibold text-gray-800"
											>{formatCurrency(totalAfterDiscount)}</span
										>
									</div>
									<div class="flex items-center justify-between gap-4">
										<label for="vat_rate_modal" class="font-medium text-gray-600"
											>ภาษีมูลค่าเพิ่ม (VAT):</label
										>
										<select
											id="vat_rate_modal"
											name="vatRate"
											bind:value={vatRateValue}
											class="w-36 rounded-md border-gray-300 py-1 text-center text-sm shadow-sm"
										>
											<option value={0}>ไม่รวม VAT (-)</option>
											<option value={7.0}>7%</option>
										</select>
									</div>
									<div class="flex items-center justify-between gap-4">
										<span class="font-medium text-gray-600">มูลค่า VAT:</span>
										<span class="text-base font-semibold text-gray-800"
											>{formatCurrency(vatAmount)}</span
										>
									</div>
									<div class="flex items-center justify-between gap-4">
										<label for="wht_rate_modal" class="font-medium text-gray-600"
											>หักภาษี ณ ที่จ่าย (WHT):</label
										>
										<select
											id="wht_rate_modal"
											name="withholdingTaxRate"
											bind:value={whtRateValue}
											class="w-36 rounded-md border-gray-300 py-1 text-center text-sm shadow-sm"
										>
											<option value={0}>ไม่หักภาษี (-)</option>
											<option value={1}>1% (บริการ/ค่าจ้าง)</option>
											<option value={3.0}>3% (บริการ/ค่าจ้าง)</option>
										</select>
									</div>
									<div class="flex items-center justify-between gap-4">
										<span class="font-medium text-gray-600">มูลค่าภาษี ณ ที่จ่าย:</span>
										<span class="text-base font-semibold text-red-600"
											>- {formatCurrency(withholdingTaxAmount)}</span
										>
									</div>
									<div
										class="mt-2 flex items-center justify-between border-t-2 border-gray-300 pt-2"
									>
										<span class="text-base font-bold text-gray-900">จำนวนเงินรวมทั้งสิ้น:</span>
										<span class="text-xl font-bold text-blue-700">{formatCurrency(grandTotal)}</span
										>
									</div>
								</div>

								<div>
									<label for="notes_modal" class="mb-1 block text-sm font-medium text-gray-700"
										>หมายเหตุ (Notes)</label
									>
									<textarea
										id="notes_modal"
										name="notes"
										rows="4"
										bind:value={notes}
										class="w-full rounded-md border-gray-300
                                        shadow-sm focus:border-blue-500 focus:ring-blue-500"
									></textarea>

									<div class="mt-4 mb-1 block text-sm font-medium text-gray-700">
										ไฟล์แนบที่มีอยู่
									</div>
									<div class="mb-2 space-y-2">
										{#if attachments.length === 0}
											<p class="text-sm text-gray-500">No attachments found.</p>
										{:else}
											{#each attachments as attachment (attachment.id)}
												<div
													class="flex items-center justify-between rounded-md bg-gray-100 p-2 text-sm"
												>
													<div class="flex items-center gap-2 overflow-hidden">
														<span class="flex-shrink-0 text-lg"
															>{getFileIcon(attachment.file_original_name)}</span
														>
														<a
															href={attachment.file_path}
															target="_blank"
															rel="noopener noreferrer"
															class="truncate text-blue-600 hover:underline"
															title={attachment.file_original_name}
															>{attachment.file_original_name}</a
														>
													</div>
													<button
														type="button"
														onclick={() => openDeleteAttachmentModal(attachment)}
														class="rounded p-1 text-red-500 hover:bg-red-100"
														title="Delete Attachment"
														disabled={isSaving}
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															width="16"
															height="16"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="2"
															><path d="M3 6h18"></path><path
																d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
															></path></svg
														>
													</button>
												</div>
											{/each}
										{/if}
									</div>

									<label
										for="attachments_modal"
										class="mt-4 mb-1 block text-sm font-medium text-gray-700"
										>แนบไฟล์ใหม่ (Add New)</label
									>
									<input
										type="file"
										id="attachments_modal"
										name="attachments"
										multiple
										bind:files={newAttachments}
										class="block w-full cursor-pointer rounded-md border border-gray-300 text-sm text-gray-500 shadow-sm file:mr-4 file:rounded-l-md file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
									/>
								</div>
							</div>

							<div>
								{#if form?.message && !form.success && form.action === 'updatePayment'}
									<div class="rounded-md bg-red-50 p-3 text-sm text-red-600">
										<p><strong>Error:</strong> {form.message}</p>
									</div>
								{/if}
							</div>
						</div>
					</div>

					<div class="sticky bottom-0 flex flex-shrink-0 justify-end gap-3 border-t bg-gray-50 p-4">
						<button
							type="button"
							onclick={closeEditModal}
							class="flex-none rounded-lg bg-gray-200 px-4 py-2 text-gray-800 transition hover:bg-gray-300"
						>
							ยกเลิก
						</button>
						<button
							type="submit"
							disabled={isSaving || modalItems.length === 0}
							class="flex flex-none items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
						>
							{#if isSaving}
								<svg
									class="mr-2 -ml-1 h-4 w-4 animate-spin text-white"
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									><circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
									></circle><path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									></path></svg
								>
								กำลังบันทึก...
							{:else}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="h-4 w-4"
									><path
										d="M7.75 3.333a.75.75 0 0 1 .454 1.353l-3.25 1.764a.75.75 0 0 1-.708-1.3l3.25-1.764a.75.75 0 0 1 .708-.053Z"
										clip-rule="evenodd"
									></path>
									<path
										fill-rule="evenodd"
										d="M15.5 3.5h-11a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2ZM12 9a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 1 0v-1a.5.5 0 0 0-.5-.5Zm-5.5 1.5c0-.276.224-.5.5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 
                                        0 0 1-.5-.5Z"
										clip-rule="evenodd"
									></path></svg
								>
								Save Changes
							{/if}
						</button>
					</div>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if deletePaymentTarget}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">ยืนยันการลบรายการจ่ายเงิน</h3>
			<p class="mt-2 text-sm text-gray-600">
				คุณแน่ใจหรือไม่ที่จะลบรายการจ่ายเงิน #{deletePaymentTarget.id} (Ref: {deletePaymentTarget.payment_reference ??
					'-'})?
				<br />การดำเนินการนี้จะลบรายการสินค้าและเอกสารแนบทั้งหมดที่เกี่ยวข้อง
			</p>
			<form method="POST" action="?/deletePayment" use:enhance class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="id" value={deletePaymentTarget.id} />
				<button
					type="button"
					onclick={() => (deletePaymentTarget = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm">ยกเลิก</button
				>
				<button
					type="submit"
					disabled={isSaving}
					class="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:bg-red-400"
				>
					{#if isSaving}
						Deleting...
					{:else}
						ลบรายการ
					{/if}
				</button>
			</form>
		</div>
	</div>
{/if}

{#if deleteAttachmentTarget}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">ยืนยันการลบเอกสารแนบ</h3>
			<p class="mt-2 text-sm text-gray-600">
				คุณแน่ใจหรือไม่ที่จะลบเอกสารแนบ "<strong>{deleteAttachmentTarget.file_original_name}</strong
				>"? การดำเนินการนี้ไม่สามารถย้อนกลับได้
			</p>
			<form
				method="POST"
				action="?/deleteAttachment"
				use:enhance
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="attachment_id" value={deleteAttachmentTarget.id} />
				<button
					type="button"
					onclick={() => (deleteAttachmentTarget = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm"
					disabled={isSaving}>ยกเลิก</button
				>
				<button
					type="submit"
					class="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
					disabled={isSaving}
				>
					{#if isSaving}
						Deleting...
					{:else}
						ลบเอกสาร
					{/if}
				</button>
			</form>
		</div>
	</div>
{/if}

<style>
	:global(div.svelte-select) {
		min-height: 38px;
		border: 1px solid #d1d5db !important; /* Force border color */
		border-radius: 0.375rem !important;
	}
	:global(div.svelte-select .input) {
		padding: 2px 0;
		font-size: 0.875rem;
		line-height: 1.25rem;
	}
	:global(div.svelte-select .selection) {
		padding-top: 4px;
		font-size: 0.875rem;
		line-height: 1.25rem;
	}
	:global(div.svelte-select .list) {
		border-radius: 0.375rem;
		border-color: #d1d5db;
		z-index: 9999 !important; /* Force z-index to stay on top */
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}
	:global(div.svelte-select .item) {
		font-size: 0.875rem;
	}
	:global(div.svelte-select .item.isActive) {
		background: #e0f2fe;
		color: #0c4a6e;
	}
</style>
