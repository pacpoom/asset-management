<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll, goto } from '$app/navigation';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	// --- Types ---
	export type Vendor = PageData['vendors'][0];
	export type Unit = PageData['units'][0];
	export type VendorContract = PageData['contracts'][0];
	export type Product = PageData['products'][0];
	export type PaymentHeader = PageData['payments'][0];

	export interface BillPaymentItem {
		id: string;
		product_object: { value: number; label: string; product: Product } | null;
		product_id: number | null;
		description: string;
		quantity: number;
		unit_id: number | null;
		unit_price: number;
		line_total: number;
	}

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	// --- List/Filter State ---
	let searchQuery = $state(data.searchQuery ?? '');
	let filterVendor = $state(data.filters?.vendor ?? '');
	let filterStatus = $state(data.filters?.status ?? '');

	const payments = $derived(data.payments || []);

	let isCreateModalOpen = $state(false);
	let vendor_id = $state<number | undefined>(undefined);
	let vendor_contract_id = $state<number | undefined>(undefined);
	let payment_date = $state(new Date().toISOString().split('T')[0]);
	let payment_reference = $state('');
	let notes = $state('');
	let items = $state<BillPaymentItem[]>([]);
	let attachments = $state<FileList | null>(null);
	let discountAmount = $state(0);
	let vat_selection = $state(7);
	let wht_selection = $state(0);

	// --- Detail/Action State ---
	let paymentToDelete = $state<PaymentHeader | null>(null);
	let isDeleting = $state(false);
	// UI state
	let isSaving = $state(false);
	let globalMessage = $state<{ text: string; type: 'success' | 'error' } | null>(null);
	let messageTimeout: NodeJS.Timeout;

	function showGlobalMessage(text: string, type: 'success' | 'error', duration = 5000) {
		clearTimeout(messageTimeout);
		globalMessage = { text, type };
		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, duration);
	}

	// --- Derived Calculations ---
	const subTotal = $derived(items.reduce((sum, item) => sum + item.line_total, 0));
	const totalAfterDiscount = $derived(subTotal - (discountAmount || 0));

	const vatAmount = $derived(
		vat_selection > 0 ? parseFloat((totalAfterDiscount * (vat_selection / 100)).toFixed(2)) : 0
	);
	const withholdingTaxAmount = $derived(
		wht_selection > 0 ? parseFloat((totalAfterDiscount * (wht_selection / 100)).toFixed(2)) : 0
	);
	const grandTotal = $derived(totalAfterDiscount + vatAmount - withholdingTaxAmount);

	// --- Derived Contracts ---
	const filteredContracts = $derived(
		vendor_id ? (data.contracts || []).filter((c: VendorContract) => c.vendor_id == vendor_id) : []
	);
	const productOptions = $derived(
		(data.products || []).map((p: Product) => ({
			value: p.id,
			label: `${p.sku} - ${p.name}`,
			product: p
		}))
	);

	// --- Pagination Logic ---
	const paginationRange = $derived(() => {
		if (!data.totalPages || data.totalPages <= 1) return [];
		const delta = 1;
		const left = data.currentPage - delta;
		const right = data.currentPage + delta + 1;
		const range: number[] = [];
		const rangeWithDots: (number | string)[] = [];
		let l: number | undefined;
		for (let i = 1; i <= data.totalPages; i++) {
			if (i == 1 || i == data.totalPages || (i >= left && i < right)) {
				range.push(i);
			}
		}
		for (const i of range) {
			if (l) {
				if (i - l === 2) {
					rangeWithDots.push(l + 1);
				} else if (i - l !== 1) {
					rangeWithDots.push('...');
				}
			}
			rangeWithDots.push(i);
			l = i;
		}
		return rangeWithDots;
	});
	function getPageUrl(pageNum: number) {
		const params = new URLSearchParams();
		params.set('page', pageNum.toString());
		if (searchQuery) params.set('search', searchQuery);
		if (filterVendor) params.set('vendor', filterVendor);
		if (filterStatus) params.set('status', filterStatus);
		return `/bill-payments?${params.toString()}`;
	}
	function applyFilters() {
		goto(getPageUrl(1));
	}

	// --- General Functions ---
	function formatCurrency(value: number | null | undefined, currency: string = 'THB') {
		if (value === null || value === undefined) return '-';
		return new Intl.NumberFormat('th-TH', {
			style: 'currency',
			currency: currency,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(value);
	}
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

	function getStatusClass(status: PaymentHeader['status']) {
		const statusMap: Record<PaymentHeader['status'], string> = {
			Draft: 'bg-gray-100 text-gray-800',
			Submitted: 'bg-blue-100 text-blue-800',
			Paid: 'bg-green-100 text-green-800',
			Void: 'bg-red-100 text-red-800'
		};
		return statusMap[status] || 'bg-yellow-100 text-yellow-800';
	}

	// --- Form/Modal Functions ---
	function closeCreateModal() {
		isCreateModalOpen = false;
	}

	function addLineItem() {
		items = [
			...items,
			{
				id: crypto.randomUUID(),
				product_object: null,
				product_id: null,
				description: '',
				quantity: 1,
				unit_id: null,
				unit_price: 0,
				line_total: 0
			}
		];
	}

	function removeLineItem(idToRemove: string) {
		items = items.filter((item) => item.id !== idToRemove);
	}

	function updateLineTotal(item: BillPaymentItem) {
		item.line_total = (item.quantity || 0) * (item.unit_price || 0);
		items = [...items];
	}

	function onProductSelectChange(item: BillPaymentItem) {
		const selectedOption = item.product_object;

		if (!selectedOption) {
			item.product_id = null;
			item.description = '';
			item.unit_id = null;
			item.unit_price = 0;
		} else {
			const selectedProduct = selectedOption.product;
			if (selectedProduct) {
				item.product_id = selectedOption.value;
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

	function resetForm() {
		vendor_id = undefined;
		vendor_contract_id = undefined;
		payment_date = new Date().toISOString().split('T')[0];
		payment_reference = '';
		notes = '';
		items = [];
		discountAmount = 0;
		wht_selection = 0;
		attachments = null;
		const fileInput = document.getElementById('attachments_modal') as HTMLInputElement;
		if (fileInput) fileInput.value = '';
	}

	// --- Reactive Effects for Form ---
	$effect.pre(() => {
		if (form?.action === 'savePayment') {
			if (form.success) {
				showGlobalMessage(form.message as string, 'success');
				resetForm();
				isCreateModalOpen = false;
				goto('/bill-payments', { invalidateAll: true });
			} else if (form.message) {
				showGlobalMessage(form.message as string, 'error');
			}
			form.action = undefined;
		}

		if (form?.action === 'deletePayment') {
			if (form.success) {
				showGlobalMessage(form.message as string, 'success');
				paymentToDelete = null;
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage(form.message as string, 'error');
			}
		}
	});
</script>

<svelte:head>
	<title>รายการจ่ายเงิน (Payments)</title>
	<link rel="stylesheet" href="https://unpkg.com/svelte-select@latest/dist/stylesheet.css" />
</svelte:head>

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

<div class="mb-6 flex items-center justify-between">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">รายการจ่ายเงิน (Payments)</h1>
		<p class="mt-1 text-sm text-gray-500">บันทึกการชำระเงินให้แก่ผู้จัดจำหน่าย/ซัพพลายเออร์</p>
	</div>
	<button
		onclick={() => {
			isCreateModalOpen = true;
			addLineItem();
		}}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			class="h-4 w-4"
			><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg
		>
		สร้างรายการใหม่
	</button>
</div>

<div
	class="mb-4 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-4"
>
	<div class="relative">
		<label for="search" class="sr-only">Search</label>
		<input
			type="search"
			id="search"
			bind:value={searchQuery}
			placeholder="ค้นหาเลขที่อ้างอิง หรือ Vendor..."
			class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 text-sm focus:border-blue-500 focus:ring-blue-500"
			onchange={applyFilters}
		/>
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<svg
				class="h-4 w-4 text-gray-400"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				><path
					fill-rule="evenodd"
					d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
					clip-rule="evenodd"
				/></svg
			>
		</div>
	</div>
	<div>
		<label for="filterVendor" class="sr-only">Vendor</label>
		<select
			id="filterVendor"
			bind:value={filterVendor}
			onchange={applyFilters}
			class="w-full rounded-lg border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
		>
			<option value="">-- ทุก Vendor --</option>
			{#each data.vendors as vendor (vendor.id)}<option value={vendor.id}>{vendor.name}</option
				>{/each}
		</select>
	</div>
	<div>
		<label for="filterStatus" class="sr-only">Status</label>
		<select
			id="filterStatus"
			bind:value={filterStatus}
			onchange={applyFilters}
			class="w-full rounded-lg border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
		>
			<option value="">-- ทุกสถานะ --</option>
			{#each data.availableStatuses as status}<option value={status}>{status}</option>{/each}
		</select>
	</div>
	<div class="flex items-center">
		<button
			type="button"
			onclick={applyFilters}
			class="w-full rounded-lg bg-blue-500 px-4 py-2 text-sm text-white shadow-sm transition hover:bg-blue-600"
			>Apply Filters</button
		>
	</div>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">ID</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">Reference</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">Vendor</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">Date</th>
				<th class="px-4 py-3 text-right font-semibold text-gray-600">Amount</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">Prepared By</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">Docs</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">Actions</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if payments.length === 0}
				<tr>
					<td colspan="10" class="py-12 text-center text-gray-500"> ไม่พบรายการจ่ายเงิน </td>
				</tr>
			{:else}
				{#each payments as payment (payment.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 text-center align-middle font-mono text-xs text-gray-700"
							>#{payment.id}</td
						>
						<td class="px-4 py-3 text-center align-middle font-medium text-gray-900"
							>{payment.payment_reference ?? '-'}</td
						>
						<td class="px-4 py-3 text-center align-middle text-gray-600">{payment.vendor_name}</td>
						<td class="px-4 py-3 text-center align-middle whitespace-nowrap text-gray-600"
							>{formatDateOnly(payment.payment_date)}</td
						>

						<td class="px-4 py-3 text-right align-middle font-semibold text-green-700"
							>{formatCurrency(payment.total_amount)}</td
						>

						<td class="px-4 py-3 text-center align-middle">
							<span
								class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getStatusClass(
									payment.status
								)}"
							>
								{payment.status}
							</span>
						</td>
						<td class="px-4 py-3 text-center align-middle text-gray-600"
							>{payment.prepared_by_user_name}</td
						>
						<td class="px-4 py-3 text-center align-middle text-gray-500"
							>{payment.attachment_count}</td
						>
						<td class="px-4 py-3 text-center align-middle whitespace-nowrap">
							<div class="flex items-center justify-center gap-2">
								<a
									href="/bill-payments/{payment.id}"
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
									aria-label="View Details"
									title="View Details"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle
											cx="12"
											cy="12"
											r="3"
										/></svg
									>
								</a>

								<a
									href="/bill-payments/{payment.id}/edit"
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-orange-600"
									aria-label="Edit"
									title="Edit"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
										></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
										></path></svg
									>
								</a>

								<a
									href="/bill-payments/generate-pdf?id={payment.id}"
									target="_blank"
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-purple-600"
									aria-label="Print PDF"
									title="Print PDF"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><polyline points="6 9 6 2 18 2 18 9"></polyline><path
											d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
										></path><rect x="6" y="14" width="12" height="8"></rect></svg
									>
								</a>

								<button
									onclick={() => (paymentToDelete = payment)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
									aria-label="Delete payment"
									title="Delete Payment"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg
									>
								</button>
							</div>
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

{#if data.totalPages > 1}
	<div class="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
		<div>
			<p class="text-sm text-gray-700">
				Page <span class="font-medium">{data.currentPage}</span> of
				<span class="font-medium">{data.totalPages}</span>
			</p>
		</div>
		<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
			<a
				href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'}
				class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage ===
				1
					? 'pointer-events-none opacity-50'
					: ''}"
				aria-disabled={data.currentPage === 1}
				><span class="sr-only">Previous</span><svg
					class="h-5 w-5"
					viewBox="0 0 20 20"
					fill="currentColor"
					><path
						fill-rule="evenodd"
						d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
						clip-rule="evenodd"
					/></svg
				></a
			>
			{#each paginationRange() as pageNum}
				{#if typeof pageNum === 'string'}<span
						class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 ring-inset"
						>...</span
					>
				{:else}<a
						href={getPageUrl(pageNum as number)}
						class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum ===
						data.currentPage
							? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
							: 'text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-50'}"
						aria-current={pageNum === data.currentPage ? 'page' : undefined}>{pageNum}</a
					>{/if}
			{/each}
			<a
				href={data.currentPage < data.totalPages ? getPageUrl(data.currentPage + 1) : '#'}
				class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage ===
				data.totalPages
					? 'pointer-events-none opacity-50'
					: ''}"
				aria-disabled={data.currentPage === data.totalPages}
				><span class="sr-only">Next</span><svg
					class="h-5 w-5"
					viewBox="0 0 20 20"
					fill="currentColor"
					><path
						fill-rule="evenodd"
						d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
						clip-rule="evenodd"
					/></svg
				></a
			>
		</nav>
	</div>
{/if}

{#if isCreateModalOpen}
	<div
		transition:slide
		class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-4 md:pt-8"
	>
		<div class="fixed inset-0" onclick={closeCreateModal} role="presentation"></div>
		<div
			class="relative flex max-h-[95vh] w-full max-w-7xl transform flex-col rounded-xl bg-white shadow-2xl transition-all"
		>
			<div class="flex-shrink-0 border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">บันทึกรายการจ่ายเงินใหม่</h2>
			</div>

			<form
				method="POST"
				action="?/savePayment"
				enctype="multipart/form-data"
				use:enhance={({ formData }) => {
					isSaving = true;
					globalMessage = null;

					formData.set(
						'itemsJson',
						JSON.stringify(
							items.map((item) => ({
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
					formData.set('vatRate', vat_selection.toString());
					const calculateWHT = wht_selection > 0;
					const rate = wht_selection;

					formData.set('calculateWithholdingTax', calculateWHT.toString());
					formData.set('withholdingTaxRate', rate.toString());
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

								{#each data.vendors || [] as vendor (vendor.id)}
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
										<th class="w-10 px-3 py-2 text-left font-medium text-gray-500">ลำดับ</th>
										<th class="w-[25%] px-3 py-2 text-left font-semibold text-gray-400"
											>สินค้า/บริการ (Product) <span class="text-red-500">*</span></th
										>
										<th class="min-w-[250px] px-3 py-2 text-left font-semibold text-gray-600"
											>รายละเอียด</th
										>
										<th class="w-[100px] px-3 py-2 text-right font-semibold text-gray-600"
											>จำนวน <span class="text-red-500"></span></th
										>
										<th class="w-[130px] px-3 py-2 text-left font-semibold text-gray-600">หน่วย</th>
										<th class="w-[120px] px-3 py-2 text-right font-semibold text-gray-600"
											>ราคา/หน่วย <span class="text-red-500"></span></th
										>
										<th class="w-[120px] px-3 py-2 text-right font-semibold text-gray-600"
											>ราคารวม</th
										>
										<th class="w-10 px-3 py-2 text-center font-semibold text-gray-600"></th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200 bg-white">
									{#if items.length === 0}
										<tr
											><td colspan="8" class="py-4 text-center text-gray-500 italic"
												>-- กด "เพิ่มรายการ" เพื่อเริ่มต้น --</td
											></tr
										>
									{/if}
									{#each items as item, index (item.id)}
										<tr class="align-top hover:bg-gray-50">
											<td class="px-3 py-2 text-gray-500">{index + 1}</td>
											<td class="px-3 py-2">
												<Select
													items={productOptions}
													bind:value={item.product_object}
													on:change={() => onProductSelectChange(item)}
													on:clear={() => {
														item.product_object = null;
														onProductSelectChange(item);
													}}
													placeholder="-- ค้นหา/เลือกสินค้า --"
													required
													container={browser ? document.body : null}
													floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
													--inputStyles="padding: 2px 0;"
													--itemIsActive="background: #e0f2fe;"
													--list="border-radius: 6px;"
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
												<select
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
															d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.566 19h4.868a2.75 2.75 0 0 0 2.71-2.529l.841-10.518.149.022a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75a1.25 1.25 0 0 0-1.25-1.25h-2.5A1.25 1.25 0 0 0 7.5 3.75v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.84 0a.75.75 0 0 1-1.5-.06l-.3 7.5a.75.75 0 1 1 1.5.06l-.3-7-5Z"
															clip-rule="evenodd"
														/></svg
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
								/></svg
							>
							เพิ่มรายการ
						</button>
					</div>

					<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
						<div>
							<div class="w-full space-y-2 text-sm">
								<div class="flex items-center justify-between">
									<span class="font-medium text-gray-600">รวมเป็นเงิน (Subtotal):</span>
									<span class="text-base font-semibold text-gray-800"
										>{formatCurrency(subTotal)}</span
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
									<div class="flex items-center">
										<label for="vat_selection_modal" class="font-medium text-gray-600">VAT:</label>
										<select
											id="vat_selection_modal"
											bind:value={vat_selection}
											class="ml-2 w-24 rounded-md border-gray-300 py-1 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
										>
											<option value={0}>0%</option>
											<option value={7}>7%</option>
										</select>
									</div>
									<span class="text-base font-semibold text-gray-800"
										>+ {formatCurrency(vatAmount)}</span
									>
								</div>
								<div class="flex items-center justify-between gap-4">
									<div class="flex items-center">
										<label for="wht_selection_modal" class="font-medium text-gray-600"
											>หักภาษี ณ ที่จ่าย:</label
										>
										<select
											id="wht_selection_modal"
											bind:value={wht_selection}
											class="ml-2 h-7 w-32 cursor-pointer rounded-md border-gray-300 bg-white py-0 pr-7 pl-2 text-center text-sm focus:border-blue-500 focus:ring-blue-500"
										>
											<option value={0}>-- ไม่หัก --</option>
											<option value={1}>หัก 1%</option>
											<option value={3}>หัก 3%</option>
										</select>
									</div>

									<span class="text-base font-semibold text-red-600">
										- {formatCurrency(withholdingTaxAmount)}
									</span>
								</div>
								<div class="mt-2 flex items-center justify-between border-t-2 border-gray-300 pt-2">
									<span class="text-base font-bold text-gray-900">จำนวนเงินรวมทั้งสิ้น:</span>
									<span class="text-xl font-bold text-blue-700">{formatCurrency(grandTotal)}</span>
								</div>
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
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							></textarea>

							<label
								for="attachments_modal"
								class="mt-4 mb-1 block text-sm font-medium text-gray-700"
								>แนบไฟล์ (Attachments)</label
							>
							<input
								type="file"
								id="attachments_modal"
								name="attachments"
								multiple
								bind:files={attachments}
								class="block w-full cursor-pointer rounded-md border border-gray-300 text-sm text-gray-500 shadow-sm file:mr-4 file:rounded-l-md file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
							/>
						</div>
					</div>

					{#if form?.message && !form.success && form.action === 'savePayment'}
						<div class="rounded-md bg-red-50 p-3 text-sm text-red-600">
							<p><strong>Error:</strong> {form.message}</p>
						</div>
					{/if}
				</div>

				<div class="sticky bottom-0 flex flex-shrink-0 justify-end gap-3 border-t bg-gray-50 p-4">
					<button
						type="button"
						onclick={() => {
							resetForm();
							closeCreateModal();
						}}
						class="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 transition hover:bg-gray-300"
					>
						ยกเลิก
					</button>
					<button
						type="submit"
						disabled={isSaving || items.length === 0}
						class="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
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
									d="M7.707 10.293a1 1 0 1 0-1.414 1.414l3 3a1 1 0 0 0 1.414 0l3-3a1 1 0 0 0-1.414-1.414L11 11.586V6h5a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V8h-3v3.586L12.293 10.293zM3 4a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm-.707 6.293a1 1 0 0 0 0 1.414L6 15.414V19a1 1 0 1 0 2 0v-3.586L3.707 10.707a1 1 0 0 0-1.414-.414z"
								/></svg
							>
							บันทึกรายการจ่าย
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if paymentToDelete}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">ยืนยันการลบรายการจ่ายเงิน</h3>
			<p class="mt-2 text-sm text-gray-600">
				คุณแน่ใจหรือไม่ที่จะลบรายการจ่ายเงิน #{paymentToDelete.id} (Ref: {paymentToDelete.payment_reference ??
					'-'})?
				<br />การดำเนินการนี้จะลบรายการสินค้าและเอกสารแนบทั้งหมดที่เกี่ยวข้อง
			</p>
			{#if form?.message && !form.success && form.action === 'deletePayment'}
				<p class="mt-2 text-sm text-red-600"><strong>Error:</strong> {form.message}</p>
			{/if}
			<form
				method="POST"
				action="?/deletePayment"
				use:enhance={() => {
					isDeleting = true;
					return async ({ update }) => {
						await update();
						isDeleting = false;
					};
				}}
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="id" value={paymentToDelete.id} />
				<button
					type="button"
					onclick={() => (paymentToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm">ยกเลิก</button
				>
				<button
					type="submit"
					disabled={isDeleting}
					class="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:bg-red-400 disabled:opacity-50"
				>
					{#if isDeleting}
						กำลังลบ...
					{:else}
						ลบ
					{/if}
				</button>
			</form>
		</div>
	</div>
{/if}

<style>
	:global(div.svelte-select) {
		min-height: 38px;
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
		z-index: 9999 !important;
	}
	:global(div.svelte-select .item) {
		font-size: 0.875rem;
	}
	:global(div.svelte-select .item.isActive) {
		background: #e0f2fe;
		color: #0c4a6e;
	}

	:global(div.svelte-select .list) {
		border-radius: 0.375rem;
		border-color: #d1d5db;
		z-index: 9999 !important;
		max-height: 200px;
		overflow-y: auto;

		top: 100% !important;
		bottom: auto !important;
	}
	:global(.selectContainer) {
		overflow: visible !important;
	}
</style>
