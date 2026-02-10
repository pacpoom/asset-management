<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll, goto } from '$app/navigation';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	// --- Types ---
	export type Customer = PageData['customers'][0];
	export type Product = PageData['products'][0];
	export type Unit = PageData['units'][0];
	export type BillingNoteHeader = PageData['billingNotes'][0];

	export interface BillingNoteItem {
		id: string;
		product_object: { value: number; label: string; product: Product } | null;
		product_id: number | null;
		description: string;
		quantity: number;
		unit_id: number | null;
		unit_price: number;
		amount: number;
	}

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let searchQuery = $state(data.searchQuery ?? '');
	let filterCustomer = $state(data.filters?.customer ?? '');
	let filterStatus = $state(data.filters?.status ?? '');
	const billingNotes = $derived(data.billingNotes || []);

	let isCreateModalOpen = $state(false);
	let isSaving = $state(false);

	// Form Data
	let customer_id = $state<number | undefined>(undefined);
	let billing_date = $state(new Date().toISOString().split('T')[0]);
	let due_date = $state('');
	let notes = $state('');
	let items = $state<BillingNoteItem[]>([]);
	let attachments = $state<FileList | null>(null);

	// Calculations
	let discountAmount = $state(0);
	let vatRate = $state(7);
	let whtRate = $state(0);

	let noteToDelete = $state<BillingNoteHeader | null>(null);
	let isDeleting = $state(false);
	let globalMessage = $state<{ text: string; type: 'success' | 'error' } | null>(null);
	let messageTimeout: NodeJS.Timeout;

	function showGlobalMessage(text: string, type: 'success' | 'error', duration = 5000) {
		clearTimeout(messageTimeout);
		globalMessage = { text, type };
		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, duration);
	}

	// --- Logic คำนวณเงิน ---
	const subTotal = $derived(items.reduce((sum, item) => sum + (item.amount || 0), 0));
	const totalAfterDiscount = $derived(Math.max(0, subTotal - (discountAmount || 0)));
	const vatAmount = $derived(vatRate > 0 ? (totalAfterDiscount * vatRate) / 100 : 0);
	const whtAmount = $derived(whtRate > 0 ? (totalAfterDiscount * whtRate) / 100 : 0);
	const grandTotal = $derived(totalAfterDiscount + vatAmount - whtAmount);

	// --- Options ---
	const customerOptions = $derived(
		(data.customers || []).map((c: any) => ({
			value: c.id,
			label: c.name,
			customer: c
		}))
	);

	const productOptions = $derived(
		(data.products || []).map((p: any) => ({
			value: p.id,
			label: `${p.sku ? p.sku + ' - ' : ''}${p.name}`,
			product: p
		}))
	);

	// Pagination
	const paginationRange = $derived(() => {
		if (!data.totalPages || data.totalPages <= 1) return [];
		const delta = 1;
		const left = data.currentPage - delta;
		const right = data.currentPage + delta + 1;
		const range: number[] = [];
		const rangeWithDots: (number | string)[] = [];
		let l: number | undefined;
		for (let i = 1; i <= data.totalPages; i++)
			if (i == 1 || i == data.totalPages || (i >= left && i < right)) range.push(i);
		for (const i of range) {
			if (l) {
				if (i - l === 2) rangeWithDots.push(l + 1);
				else if (i - l !== 1) rangeWithDots.push('...');
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
		if (filterCustomer) params.set('customer', filterCustomer);
		if (filterStatus) params.set('status', filterStatus);
		return `/billing-notes?${params.toString()}`;
	}
	function applyFilters() {
		goto(getPageUrl(1));
	}

	function formatCurrency(val: number) {
		return new Intl.NumberFormat('th-TH', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(val || 0);
	}
	function formatDateOnly(iso: string) {
		if (!iso) return '-';
		try {
			return new Date(iso).toLocaleDateString('th-TH', {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return '-';
		}
	}
	function getStatusClass(s: string) {
		const m: any = {
			Draft: 'bg-gray-100 text-gray-800',
			Sent: 'bg-blue-100 text-blue-800',
			Paid: 'bg-green-100 text-green-800',
			Void: 'bg-red-100 text-red-800'
		};
		return m[s] || 'bg-yellow-100 text-yellow-800';
	}

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
				amount: 0
			}
		];
	}

	function removeLineItem(id: string) {
		items = items.filter((i) => i.id !== id);
	}

	function onProductChange(item: BillingNoteItem) {
		const selected = item.product_object;
		if (selected && selected.product) {
			item.product_id = selected.product.id;
			item.description = selected.product.name;
			item.unit_id = selected.product.unit_id;
			item.unit_price = Number(selected.product.selling_price) || 0;
		} else {
			item.product_id = null;
		}
		updateLineTotal(item);
	}

	function updateLineTotal(item: BillingNoteItem) {
		item.amount = (item.quantity || 0) * (item.unit_price || 0);
		items = [...items];
	}

	function resetForm() {
		customer_id = undefined;
		billing_date = new Date().toISOString().split('T')[0];
		due_date = '';
		notes = '';
		items = [];
		attachments = null;
		discountAmount = 0;
		vatRate = 7;
		whtRate = 0;
		const fi = document.getElementById('attachments_modal') as HTMLInputElement;
		if (fi) fi.value = '';
		addLineItem();
	}

	$effect.pre(() => {
		if (form?.action === 'create') {
			if (form.success) {
				showGlobalMessage(form.message as string, 'success');
				resetForm();
				isCreateModalOpen = false;
				goto('/billing-notes', { invalidateAll: true });
			} else if (form.message) {
				showGlobalMessage(form.message as string, 'error');
			}
			form.action = undefined;
		}
		if (form?.action === 'delete') {
			if (form.success) {
				showGlobalMessage(form.message as string, 'success');
				noteToDelete = null;
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage(form.message as string, 'error');
			}
		}
	});
</script>

<svelte:head
	><title>Billing Notes (ใบวางบิล)</title><link
		rel="stylesheet"
		href="https://unpkg.com/svelte-select@latest/dist/stylesheet.css"
	/></svelte:head
>

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
		<h1 class="text-2xl font-bold text-gray-800">Billing Notes (ใบวางบิล)</h1>
		<p class="mt-1 text-sm text-gray-500">จัดการเอกสารใบวางบิล</p>
	</div>
	<button
		onclick={() => {
			isCreateModalOpen = true;
			resetForm();
		}}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			class="h-4 w-4"
			><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg
		>สร้างใบวางบิลใหม่
	</button>
</div>

<div
	class="mb-4 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-4"
>
	<div class="relative">
		<input
			type="search"
			bind:value={searchQuery}
			placeholder="ค้นหาเลขที่, ลูกค้า..."
			class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 text-sm focus:border-blue-500 focus:ring-blue-500"
			onchange={applyFilters}
		/>
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<svg class="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"
				><path
					fill-rule="evenodd"
					d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
					clip-rule="evenodd"
				/></svg
			>
		</div>
	</div>
	<div>
		<select
			bind:value={filterCustomer}
			onchange={applyFilters}
			class="w-full rounded-lg border border-gray-300 p-2 text-sm shadow-sm"
			><option value="">-- ทุกลูกค้า --</option>{#each data.customers || [] as c}<option
					value={c.id}>{c.name}</option
				>{/each}</select
		>
	</div>
	<div>
		<select
			bind:value={filterStatus}
			onchange={applyFilters}
			class="w-full rounded-lg border border-gray-300 p-2 text-sm shadow-sm"
			><option value="">-- ทุกสถานะ --</option><option value="Draft">Draft</option><option
				value="Sent">Sent</option
			><option value="Paid">Paid</option><option value="Void">Void</option></select
		>
	</div>
	<div class="flex items-center">
		<button
			type="button"
			onclick={applyFilters}
			class="w-full rounded-lg bg-blue-500 px-4 py-2 text-sm text-white shadow-sm hover:bg-blue-600"
			>Apply Filters</button
		>
	</div>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50"
			><tr
				><th class="px-4 py-3 text-center">ID</th><th class="px-4 py-3 text-center">เลขที่เอกสาร</th
				><th class="px-4 py-3 text-center">ลูกค้า</th><th class="px-4 py-3 text-center">วันที่</th
				><th class="px-4 py-3 text-right">ยอดสุทธิ</th><th class="px-4 py-3 text-center">สถานะ</th
				><th class="px-4 py-3 text-center">Actions</th></tr
			></thead
		>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if billingNotes.length === 0}<tr
					><td colspan="7" class="py-12 text-center text-gray-500"> ไม่พบรายการใบวางบิล </td></tr
				>{:else}
				{#each billingNotes as note}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 text-center text-gray-700">#{note.id}</td><td
							class="px-4 py-3 text-center font-medium">{note.billing_note_number}</td
						><td class="px-4 py-3 text-center">{note.customer_name}</td><td
							class="px-4 py-3 text-center">{formatDateOnly(note.billing_date)}</td
						><td class="px-4 py-3 text-right font-semibold text-green-700"
							>{formatCurrency(note.total_amount)}</td
						>
						<td class="px-4 py-3 text-center"
							><span
								class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {getStatusClass(
									note.status
								)}">{note.status}</span
							></td
						>

						<td class="px-4 py-3 text-center">
							<div class="flex justify-center gap-2">
								<a
									href="/billing-notes/{note.id}"
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
									aria-label="ดูรายละเอียด"
									title="ดูรายละเอียด"
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
									href="/billing-notes/generate-pdf?id={note.id}"
									target="_blank"
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-purple-600"
									aria-label="พิมพ์"
									title="พิมพ์"
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
										><path
											d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
										/><path d="M6 14h12v8H6z" /></svg
									>
								</a>

								<a
									href="/billing-notes/{note.id}/edit"
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-orange-600"
									aria-label="แก้ไข"
									title="แก้ไข"
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
										><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg
									>
								</a>

								<button
									onclick={() => (noteToDelete = note)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
									aria-label="ลบ"
									title="ลบ"
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
		<div><p class="text-sm text-gray-700">Page {data.currentPage} of {data.totalPages}</p></div>
		<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm">
			<a
				href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'}
				class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage ===
				1
					? 'pointer-events-none opacity-50'
					: ''}">&lt;</a
			>{#each paginationRange() as pageNum}{#if typeof pageNum === 'string'}<span
						class="px-4 py-2 text-sm text-gray-700 ring-1 ring-gray-300">...</span
					>{:else}<a
						href={getPageUrl(pageNum)}
						class="px-4 py-2 text-sm font-semibold {pageNum === data.currentPage
							? 'bg-blue-600 text-white'
							: 'text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50'}">{pageNum}</a
					>{/if}{/each}<a
				href={data.currentPage < data.totalPages ? getPageUrl(data.currentPage + 1) : '#'}
				class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage ===
				data.totalPages
					? 'pointer-events-none opacity-50'
					: ''}">&gt;</a
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
				<h2 class="text-lg font-bold text-gray-900">สร้างใบวางบิลใหม่</h2>
			</div>
			<form
				method="POST"
				action="?/create"
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
								amount: item.amount
							}))
						)
					);
					formData.set('subtotal', subTotal.toString());
					formData.set('discount_amount', discountAmount.toString());
					formData.set('vat_rate', vatRate.toString());
					formData.set('vat_amount', vatAmount.toString());
					formData.set('withholding_tax_rate', whtRate.toString());
					formData.set('withholding_tax_amount', whtAmount.toString());
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
						<div class="md:col-span-2">
							<label for="customer_select" class="mb-1 block text-sm font-medium text-gray-700"
								>ลูกค้า <span class="text-red-500">*</span></label
							>
							<Select
								id="customer_select"
								items={customerOptions}
								bind:value={customer_id}
								placeholder="-- ค้นหา/เลือกลูกค้า --"
								class="w-full"
								required
								container={browser ? document.body : null}
							/>
							<input type="hidden" name="customer_id" value={customer_id} />
						</div>
						<div>
							<label for="billing_date" class="mb-1 block text-sm font-medium text-gray-700"
								>วันที่วางบิล <span class="text-red-500">*</span></label
							>
							<input
								id="billing_date"
								type="date"
								name="billing_date"
								bind:value={billing_date}
								required
								class="w-full rounded-md border-gray-300 shadow-sm"
							/>
						</div>
						<div>
							<label for="due_date" class="mb-1 block text-sm font-medium text-gray-700"
								>วันครบกำหนด</label
							>
							<input
								id="due_date"
								type="date"
								name="due_date"
								bind:value={due_date}
								class="w-full rounded-md border-gray-300 shadow-sm"
							/>
						</div>
					</div>
					<div>
						<h3 class="text-md mb-2 font-semibold text-gray-800">รายการสินค้า (วางบิล)</h3>
						<div class="overflow-x-auto rounded border border-gray-200">
							<table class="min-w-full divide-y divide-gray-200 text-sm">
								<thead class="bg-gray-50">
									<tr>
										<th class="w-10 px-3 py-2 text-center text-gray-500">#</th>
										<th class="w-[25%] px-3 py-2 text-left font-semibold text-gray-600"
											>สินค้า/บริการ</th
										>
										<th class="w-[20%] px-3 py-2 text-left font-semibold text-gray-600"
											>รายละเอียด</th
										>
										<th class="w-24 px-3 py-2 text-center font-semibold text-gray-600">จำนวน</th>
										<th class="w-28 px-3 py-2 text-center font-semibold text-gray-600">หน่วย</th>
										<th class="w-32 px-3 py-2 text-center font-semibold text-gray-600"
											>ราคา/หน่วย</th
										>
										<th class="w-32 px-3 py-2 text-center font-semibold text-gray-600">รวมเงิน</th>
										<th class="w-10 px-3 py-2"></th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200 bg-white">
									{#if items.length === 0}<tr
											><td colspan="8" class="py-4 text-center text-gray-500 italic"
												>-- กด "เพิ่มรายการ" เพื่อเริ่ม --</td
											></tr
										>{/if}
									{#each items as item, index (item.id)}
										<tr class="align-top hover:bg-gray-50"
											><td class="px-3 py-2 pt-3 text-center">{index + 1}</td>
											<td class="px-3 py-2">
												<Select
													items={productOptions}
													bind:value={item.product_object}
													on:change={() => onProductChange(item)}
													placeholder="สินค้า..."
													container={browser ? document.body : null}
													floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
												/>
											</td>
											<td class="px-3 py-2"
												><input
													type="text"
													bind:value={item.description}
													class="w-full rounded-md border-gray-300 py-1 text-sm"
												/></td
											>
											<td class="px-3 py-2"
												><input
													type="number"
													bind:value={item.quantity}
													oninput={() => updateLineTotal(item)}
													min="0"
													class="w-full rounded-md border-gray-300 py-1 text-center text-sm"
												/></td
											>
											<td class="px-3 py-2"
												><select
													bind:value={item.unit_id}
													class="w-full rounded-md border-gray-300 py-1 text-center text-sm"
													><option value={null}>-</option>{#each data.units || [] as u}<option
															value={u.id}>{u.name}</option
														>{/each}</select
												></td
											>
											<td class="px-3 py-2"
												><input
													type="number"
													bind:value={item.unit_price}
													oninput={() => updateLineTotal(item)}
													min="0"
													step="0.01"
													class="w-full rounded-md border-gray-300 py-1 text-center text-sm"
												/></td
											>
											<td class="px-3 py-2 pt-3 text-center font-medium"
												>{formatCurrency(item.amount)}</td
											>
											<td class="px-3 py-2 pt-2 text-center"
												><button
													type="button"
													onclick={() => removeLineItem(item.id)}
													class="text-red-500 hover:text-red-700">✕</button
												></td
											>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<button
							type="button"
							onclick={addLineItem}
							class="mt-2 flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50"
							>+ เพิ่มรายการ</button
						>
					</div>
					<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
						<div>
							<label for="notes" class="mb-1 block text-sm font-medium text-gray-700"
								>หมายเหตุ</label
							>
							<textarea
								id="notes"
								name="notes"
								bind:value={notes}
								rows="4"
								class="w-full rounded-md border-gray-300 shadow-sm"
							></textarea>

							<label
								for="attachments_modal"
								class="mt-4 mb-1 block text-sm font-medium text-gray-700">แนบไฟล์</label
							>
							<input
								type="file"
								id="attachments_modal"
								name="attachments"
								multiple
								bind:files={attachments}
								class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-blue-700 hover:file:bg-blue-100"
							/>
						</div>
						<div class="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
							<div class="flex justify-between text-sm">
								<span class="font-medium">รวมเป็นเงิน:</span><span>{formatCurrency(subTotal)}</span>
							</div>
							<div class="flex items-center justify-between gap-2 text-sm">
								<label for="discount_amount">ส่วนลด:</label>
								<div class="flex items-center gap-2">
									<input
										id="discount_amount"
										type="number"
										bind:value={discountAmount}
										min="0"
										step="0.01"
										class="w-24 rounded-md border-gray-300 py-1 text-right text-sm"
									/>
									<span class="w-20 text-right text-red-600">-{formatCurrency(discountAmount)}</span
									>
								</div>
							</div>
							<div class="flex justify-between border-t border-dashed pt-2 text-sm">
								<span class="font-medium">ราคาหลังหักส่วนลด:</span><span
									>{formatCurrency(totalAfterDiscount)}</span
								>
							</div>
							<div class="flex items-center justify-between gap-2 text-sm">
								<div class="flex items-center gap-2">
									<span>VAT:</span><select
										bind:value={vatRate}
										class="h-7 rounded-md border-gray-300 py-0 text-sm"
										><option value={0}>0%</option><option value={7}>7%</option></select
									>
								</div>
								<span>+{formatCurrency(vatAmount)}</span>
							</div>
							<div class="flex items-center justify-between gap-2 text-sm">
								<div class="flex items-center gap-2">
									<span>WHT:</span><select
										bind:value={whtRate}
										class="h-7 rounded-md border-gray-300 py-0 text-sm"
										><option value={0}>ไม่หัก</option><option value={1}>1%</option><option value={3}
											>3%</option
										><option value={5}>5%</option></select
									>
								</div>
								<span class="text-red-600">-{formatCurrency(whtAmount)}</span>
							</div>
							<div class="mt-2 flex items-center justify-between border-t-2 border-gray-300 pt-2">
								<span class="text-base font-bold">ยอดรวมทั้งสิ้น:</span><span
									class="text-xl font-bold text-blue-700">{formatCurrency(grandTotal)}</span
								>
							</div>
						</div>
					</div>
					{#if form?.message && !form.success}<div
							class="rounded-md bg-red-50 p-3 text-sm text-red-600"
						>
							<strong>Error:</strong>
							{form.message}
						</div>{/if}
				</div>
				<div class="sticky bottom-0 flex justify-end gap-3 border-t bg-gray-50 p-4">
					<button
						type="button"
						onclick={() => {
							resetForm();
							closeCreateModal();
						}}
						class="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300">ยกเลิก</button
					><button
						type="submit"
						disabled={isSaving || items.length === 0}
						class="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
						>{#if isSaving}กำลังบันทึก...{:else}บันทึกใบวางบิล{/if}</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if noteToDelete}<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">ยืนยันการลบ</h3>
			<p class="mt-2 text-sm text-gray-600">ลบใบวางบิล #{noteToDelete.billing_note_number}?</p>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					isDeleting = true;
					return async ({ update }) => {
						await update();
						isDeleting = false;
					};
				}}
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="id" value={noteToDelete.id} /><button
					type="button"
					onclick={() => (noteToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm">ยกเลิก</button
				><button
					type="submit"
					disabled={isDeleting}
					class="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:bg-red-400">ลบ</button
				>
			</form>
		</div>
	</div>{/if}

<style>
	:global(div.svelte-select) {
		min-height: 38px;
	}
	:global(div.svelte-select .input) {
		padding: 2px 0;
		font-size: 0.875rem;
	}
	:global(div.svelte-select .selection) {
		padding-top: 4px;
		font-size: 0.875rem;
	}
	:global(div.svelte-select .list) {
		border-radius: 0.375rem;
		border-color: #d1d5db;
		z-index: 9999 !important;
		top: 100% !important;
		bottom: auto !important;
		max-height: 200px;
		overflow-y: auto;
	}
	:global(div.svelte-select .item) {
		font-size: 0.875rem;
	}
	:global(div.svelte-select .item.isActive) {
		background: #e0f2fe;
		color: #0c4a6e;
	}
	:global(.selectContainer) {
		overflow: visible !important;
	}
</style>
