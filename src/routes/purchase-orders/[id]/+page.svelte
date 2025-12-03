<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { PageData } from './$types';

	// รับข้อมูลจาก Server
	export let data: PageData;

	// ตัวแปร State
	let po = data.po;
	let items = data.items;
	let companyData = data.company;

	let isSaving = false;
	let updateStatusForm: HTMLFormElement;
	let statusToUpdate = '';

	// ตัวแปรสำหรับ Modal ลบ
	let showDeleteModal = false;
	let isDeleting = false;

	// Reactive update
	$: po = data.po;
	$: items = data.items;
	$: companyData = data.company;

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
			DRAFT: 'bg-gray-100 text-gray-800',
			SENT: 'bg-blue-100 text-blue-800',
			PARTIAL: 'bg-yellow-100 text-yellow-800',
			COMPLETED: 'bg-green-100 text-green-800',
			CANCELLED: 'bg-red-100 text-red-800'
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
	<title>ใบสั่งซื้อ {po.po_number}</title>
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
		<a href="/purchase-orders" class="mr-3 text-gray-500 hover:text-gray-800" title="Back to list">
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
			<h1 class="text-2xl font-bold text-gray-800">ใบสั่งซื้อ #{po.po_number}</h1>
			<p class="mt-1 text-sm text-gray-500">
				Vendor: <span class="font-medium text-gray-700">{po.vendor_name}</span> | Created: {formatDate(
					po.created_at
				)}
			</p>
		</div>
	</div>

	<div class="flex flex-shrink-0 items-center gap-2">
		<span
			class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold {getStatusClass(
				po.status
			)}"
		>
			{po.status}
		</span>

		{#if po.status !== 'DRAFT'}
			<a
				href="/purchase-orders/generate-pdf?id={po.id}"
				target="_blank"
				class="inline-flex items-center justify-center rounded-lg bg-gray-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-600 disabled:opacity-50"
			>
				<span>พิมพ์ PDF</span>
			</a>
		{:else}
			<button
				disabled
				class="inline-flex cursor-not-allowed items-center justify-center rounded-lg bg-gray-300 px-3 py-1.5 text-sm font-semibold text-white opacity-50"
				title="ต้องเปลี่ยนสถานะจาก Draft ก่อนพิมพ์"
			>
				<span>พิมพ์ PDF</span>
			</button>
		{/if}

		<a
			href="/purchase-orders/{po.id}/edit"
			class="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
		>
			Edit
		</a>

		<button
			type="button"
			on:click={() => (showDeleteModal = true)}
			class="inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 focus:outline-none"
		>
			Delete
		</button>

		<div class="relative">
			<select
				id="status-change-select"
				on:change={updateStatus}
				disabled={isSaving}
				class="cursor-pointer rounded-lg border-none bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-yellow-600 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
			>
				<option value="" disabled selected>Change Status</option>
				{#each data.availableStatuses as status}
					{#if status !== po.status}
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
				<p class="text-sm text-red-500">ไม่พบข้อมูลบริษัท (กรุณาตั้งค่าที่เมนู Company)</p>
			{/if}
		</div>

		<div class="text-left md:text-right">
			<h1 class="text-2xl font-bold text-gray-800 uppercase">ใบสั่งซื้อ</h1>
			<p class="text-sm text-gray-500">Purchase Order</p>

			<div class="mt-4 space-y-1">
				<div class="text-sm">
					<span class="font-semibold text-gray-600">เลขที่ / No.:</span>
					<span class="font-medium text-gray-800">#{po.po_number}</span>
				</div>
				<div class="text-sm">
					<span class="font-semibold text-gray-600">วันที่ / Date:</span>
					<span class="font-medium text-gray-800">{formatDate(po.po_date)}</span>
				</div>
				<div class="text-sm">
					<span class="font-semibold text-gray-600">ผู้ติดต่อ / Contact:</span>
					<span class="font-medium text-gray-800">{po.contact_person || '-'}</span>
				</div>
			</div>
		</div>
	</div>

	<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
		<div class="md:col-span-2">
			<h3 class="text-sm font-semibold text-gray-500 uppercase">ผู้ขาย (Vendor)</h3>
			<p class="font-semibold text-gray-800">{po.vendor_name}</p>
			<p class="text-sm whitespace-pre-wrap text-gray-600">{po.vendor_address || '-'}</p>
			<p class="mt-1 text-sm">
				<span class="font-semibold text-gray-700">Tax ID:</span>
				{po.vendor_tax_id || '-'}
			</p>
			{#if po.vendor_phone || po.vendor_email}
				<p class="mt-1 text-sm text-gray-600">
					{po.vendor_phone ? `Tel: ${po.vendor_phone}` : ''}
					{po.vendor_email ? `Email: ${po.vendor_email}` : ''}
				</p>
			{/if}
		</div>

		<div class="md:col-span-1">
			<h3 class="text-sm font-semibold text-gray-500 uppercase">ข้อมูลเพิ่มเติม (More Info)</h3>
			<p class="mt-1 text-xs text-gray-600">
				<span class="font-semibold">ผู้ทำรายการ / Prepared By:</span>
				{po.created_by_name || '-'}
			</p>
			<div class="mt-2">
				<span class="text-xs font-semibold tracking-wider text-gray-600 uppercase"
					>เงื่อนไขการชำระเงิน</span
				>
				<p class="text-sm font-medium text-gray-800">{po.payment_term || '-'}</p>
			</div>
			<div class="mt-2">
				<span class="text-xs font-semibold tracking-wider text-red-600 uppercase"
					>กำหนดส่งของ (Delivery Date)</span
				>
				<p class="font-bold text-red-600">{formatDate(po.delivery_date)}</p>
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
					<th class="px-3 py-2 text-left font-medium text-gray-500">Product/Description</th>
					<th class="w-[70px] px-3 py-2 text-right font-medium text-gray-500">Qty</th>
					<th class="w-[100px] px-3 py-2 text-center font-medium text-gray-500">Unit</th>
					<th class="px-3 py-2 text-right font-medium text-gray-500">Price/Unit</th>
					<th class="px-3 py-2 text-right font-medium text-gray-500">Discount</th>
					<th class="px-3 py-2 text-right font-medium text-gray-500">Total</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#each items as item}
					<tr>
						<td class="px-3 py-2 text-gray-700">
							<div class="font-medium">{item.product_name}</div>
							{#if item.description}
								<div class="text-xs text-gray-500">{item.description}</div>
							{/if}
						</td>
						<td class="px-3 py-2 text-right text-gray-700">{item.quantity}</td>
						<td class="px-3 py-2 text-center text-gray-600">{item.unit || '-'}</td>
						<td class="px-3 py-2 text-right text-gray-700">{formatCurrency(item.unit_price)}</td>
						<td class="px-3 py-2 text-right text-gray-600"
							>{item.discount > 0 ? formatCurrency(item.discount) : '-'}</td
						>
						<td class="px-3 py-2 text-right font-medium text-gray-800"
							>{formatCurrency(item.total_price)}</td
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
				class="font-medium text-gray-800">{formatCurrency(po.subtotal)}</span
			>
		</div>

		{#if parseFloat(po.discount) > 0}
			<div class="flex items-center justify-between">
				<span class="font-medium text-gray-600">Discount:</span><span
					class="font-medium text-red-600">- {formatCurrency(po.discount)}</span
				>
			</div>
		{/if}

		{#if parseFloat(po.discount) > 0}
			<div class="flex items-center justify-between border-t pt-1">
				<span class="font-medium text-gray-600">Total After Discount:</span><span
					class="font-medium text-gray-800"
					>{formatCurrency(po.subtotal - Number(po.discount || 0))}</span
				>
			</div>
		{/if}

		<div class="flex items-center justify-between">
			<span class="font-medium text-gray-600">VAT ({po.vat_rate ?? 7}%):</span>
			<span class="font-medium text-gray-800">{formatCurrency(po.vat_amount)}</span>
		</div>

		{#if parseFloat(po.wht_amount) > 0}
			<div class="flex items-center justify-between">
				<span class="font-medium text-gray-600">WHT ({po.wht_rate ?? 0}%):</span><span
					class="font-medium text-red-600">- {formatCurrency(po.wht_amount)}</span
				>
			</div>
		{/if}

		<div class="flex items-center justify-between border-t-2 pt-2">
			<span class="text-base font-bold text-gray-900">Grand Total:</span><span
				class="text-xl font-bold text-blue-700">{formatCurrency(po.total_amount)}</span
			>
		</div>
	</div>
</div>

<div class="mb-6 grid grid-cols-1 gap-6">
	<div class="rounded-lg border bg-white p-4 shadow-sm">
		<h3 class="mb-3 border-b pb-2 text-lg font-semibold text-gray-700">Notes / Remarks</h3>
		<p class="text-sm whitespace-pre-wrap text-gray-600">{po.remarks || 'No notes.'}</p>
	</div>
</div>

{#if showDeleteModal}
	<div
		class="bg-opacity-75 fixed inset-0 z-50 flex items-center justify-center bg-gray-500 p-4 transition-opacity"
	>
		<div
			class="w-full max-w-lg transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all"
		>
			<h3 class="mb-2 text-lg leading-6 font-medium text-gray-900">ยืนยันการลบ</h3>
			<p class="text-sm text-gray-500">
				คุณแน่ใจหรือไม่ที่จะลบใบสั่งซื้อ <strong>{po.po_number}</strong>? <br />
				การกระทำนี้ไม่สามารถเรียกคืนได้
			</p>
			<div class="mt-6 flex justify-end gap-3">
				<button
					type="button"
					on:click={() => (showDeleteModal = false)}
					class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
				>
					ยกเลิก
				</button>
				<form
					method="POST"
					action="?/delete"
					use:enhance={() => {
						isDeleting = true;
						return async ({ update }) => {
							await update();
							isDeleting = false;
							showDeleteModal = false;
						};
					}}
				>
					<button
						type="submit"
						disabled={isDeleting}
						class="flex items-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none disabled:opacity-50"
					>
						{#if isDeleting}
							<svg
								class="mr-2 -ml-1 h-4 w-4 animate-spin text-white"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
							>
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path>
							</svg>
							กำลังลบ...
						{:else}
							ยืนยันการลบ
						{/if}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
