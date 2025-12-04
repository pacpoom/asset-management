<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	export let data: PageData;
	// ตัวแปร State
	let pr = data.pr;
	let items = data.items;
	let companyData = data.company;

	// Modal Logic
	let showDeleteModal = false;
	let isDeleting = false;

	// Reactive update
	$: pr = data.pr;
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
			PENDING: 'bg-yellow-100 text-yellow-800',
			APPROVED: 'bg-green-100 text-green-800',
			REJECTED: 'bg-red-100 text-red-800',
			PO_CREATED: 'bg-blue-100 text-blue-800'
		};
		return statusMap[status] || 'bg-gray-100 text-gray-800';
	}
</script>

<svelte:head>
	<title>ใบขอซื้อ {pr.pr_number}</title>
</svelte:head>

<div
	class="mb-6 flex flex-col items-start justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center"
>
	<div class="flex items-center">
		<a
			href="/purchase-requests"
			class="mr-3 text-gray-500 hover:text-gray-800"
			title="กลับหน้ารายการ"
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
			<h1 class="text-2xl font-bold text-gray-800">ใบขอซื้อ #{pr.pr_number}</h1>
			<p class="mt-1 text-sm text-gray-500">
				Requester: <span class="font-medium text-gray-700">{pr.requester_name}</span> | Date: {formatDate(
					pr.request_date
				)}
			</p>
		</div>
	</div>

	<div class="flex flex-shrink-0 items-center gap-2">
		<span
			class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold {getStatusClass(
				pr.status
			)}"
		>
			{pr.status}
		</span>

		<a
			href="/purchase-requests/generate-pdf?id={pr.id}"
			target="_blank"
			class="inline-flex items-center justify-center rounded-lg bg-gray-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-600"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-1 h-4 w-4"
				viewBox="0 0 20 20"
				fill="currentColor"
			>
				<path
					fill-rule="evenodd"
					d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z"
					clip-rule="evenodd"
				/>
			</svg>
			พิมพ์ PDF
		</a>

		{#if pr.status === 'PENDING'}
			<form method="POST" action="?/updateStatus" use:enhance>
				<input type="hidden" name="status" value="APPROVED" />
				<button
					type="submit"
					class="inline-flex items-center justify-center rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-1 h-4 w-4"
						viewBox="0 0 20 20"
						fill="currentColor"
						><path
							fill-rule="evenodd"
							d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
							clip-rule="evenodd"
						/></svg
					>
					APPROVE
				</button>
			</form>

			<form method="POST" action="?/updateStatus" use:enhance>
				<input type="hidden" name="status" value="REJECTED" />
				<button
					type="submit"
					class="inline-flex items-center justify-center rounded-lg bg-red-100 px-3 py-1.5 text-sm font-semibold text-red-700 shadow-sm transition-colors hover:bg-red-200"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-1 h-4 w-4"
						viewBox="0 0 20 20"
						fill="currentColor"
						><path
							fill-rule="evenodd"
							d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
							clip-rule="evenodd"
						/></svg
					>
					REJECT
				</button>
			</form>

			<a
				href="/purchase-requests/{pr.id}/edit"
				class="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
			>
				Edit
			</a>
		{/if}

		{#if pr.status === 'APPROVED'}
			<a
				href="/purchase-orders/create?from_pr_id={pr.id}"
				class="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
			>
				สร้างใบสั่งซื้อ (PO)
			</a>
		{/if}

		{#if pr.status === 'PENDING' || pr.status === 'REJECTED' || pr.status === 'APPROVED'}
			<button
				type="button"
				on:click={() => (showDeleteModal = true)}
				class="inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 focus:outline-none"
			>
				Delete
			</button>
		{/if}
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
			<h1 class="text-2xl font-bold text-gray-800 uppercase">ใบขอซื้อ</h1>
			<p class="text-sm text-gray-500">Purchase Request</p>

			<div class="mt-4 space-y-1">
				<div class="text-sm">
					<span class="font-semibold text-gray-600">เลขที่ / No.:</span>
					<span class="font-medium text-gray-800">#{pr.pr_number}</span>
				</div>
				<div class="text-sm">
					<span class="font-semibold text-gray-600">วันที่ / Date:</span>
					<span class="font-medium text-gray-800">{formatDate(pr.request_date)}</span>
				</div>
			</div>
		</div>
	</div>

	<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
		<div>
			<h3 class="text-sm font-semibold text-gray-500 uppercase">ผู้ขอซื้อ (Requester)</h3>
			<p class="font-semibold text-gray-800">{pr.requester_name}</p>
			{#if pr.department}
				<p class="text-sm text-gray-600">แผนก: {pr.department}</p>
			{/if}
			{#if pr.requester_email}
				<p class="text-sm text-gray-600">Email: {pr.requester_email}</p>
			{/if}
		</div>

		<div>
			<h3 class="text-sm font-semibold text-gray-500 uppercase">
				รายละเอียดเพิ่มเติม (Description)
			</h3>
			<p
				class="min-h-[60px] rounded-md border border-gray-100 bg-gray-50 p-2 text-sm whitespace-pre-wrap text-gray-700"
			>
				{pr.description || '-'}
			</p>
		</div>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white shadow-sm">
	<h3 class="mb-3 border-b p-4 pb-2 text-lg font-semibold text-gray-700">
		รายการสินค้าที่ขอซื้อ ({items.length})
	</h3>
	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-4 py-3 text-left font-medium text-gray-500">รายการสินค้า (Item)</th>
					<th class="w-[100px] px-4 py-3 text-right font-medium text-gray-500">จำนวน</th>
					<th class="w-[100px] px-4 py-3 text-center font-medium text-gray-500">หน่วย</th>
					<th class="w-32 px-4 py-3 text-right font-medium text-gray-500">ราคาประเมิน/หน่วย</th>
					<th class="w-32 px-4 py-3 text-right font-medium text-gray-500">รวมเป็นเงิน</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#each items as item}
					<tr>
						<td class="px-4 py-3 font-medium text-gray-700">{item.product_name}</td>
						<td class="px-4 py-3 text-right text-gray-700">{item.quantity}</td>
						<td class="px-4 py-3 text-center text-gray-600">{item.unit || '-'}</td>
						<td class="px-4 py-3 text-right text-gray-700">{formatCurrency(item.expected_price)}</td
						>
						<td class="px-4 py-3 text-right font-bold text-gray-800"
							>{formatCurrency(item.total_price)}</td
						>
					</tr>
				{/each}
			</tbody>
			<tfoot class="bg-gray-50">
				<tr>
					<td colspan="4" class="px-4 py-3 text-right font-bold text-gray-700"
						>ยอดรวมประมาณการ (Total Estimate)</td
					>
					<td class="px-4 py-3 text-right text-lg font-bold text-blue-700"
						>{formatCurrency(pr.total_amount)}</td
					>
				</tr>
			</tfoot>
		</table>
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
				คุณแน่ใจหรือไม่ที่จะลบใบขอซื้อ <strong>{pr.pr_number}</strong>?
				<br />
				การกระทำนี้ไม่สามารถเรียกคืนได้
			</p>
			<div class="mt-6 flex justify-end gap-3">
				<button
					type="button"
					on:click={() => (showDeleteModal = false)}
					class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
					>ยกเลิก</button
				>
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
