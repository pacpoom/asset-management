<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	export let data: PageData;
	$: ({ voucher } = data);

	// --- จัดการ Modal ลบ ---
	let isDeleteModalOpen = false;
	let isDeleting = false;

	function openDeleteModal() {
		isDeleteModalOpen = true;
	}

	function closeDeleteModal() {
		isDeleteModalOpen = false;
	}
	// ---------------------

	const formatDate = (d: string | Date) =>
		new Date(d).toLocaleDateString('th-TH', { dateStyle: 'long' });

	const formatCurrency = (n: number) =>
		new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);
</script>

<svelte:head>
	<title>{voucher.voucher_number} - รายละเอียด</title>
</svelte:head>

<div class="mx-auto max-w-4xl">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<div class="flex items-center gap-3">
				<h1 class="text-2xl font-bold text-gray-800">{voucher.voucher_number}</h1>
				<span
					class="rounded-full px-3 py-1 text-sm font-bold {voucher.voucher_type === 'RV'
						? 'bg-green-100 text-green-800'
						: 'bg-red-100 text-red-800'}"
				>
					{voucher.voucher_type === 'RV' ? 'ใบสำคัญรับ (RV)' : 'ใบสำคัญจ่าย (PV)'}
				</span>
			</div>
			<p class="text-gray-500">วันที่: {formatDate(voucher.voucher_date)}</p>
		</div>
		<div class="flex gap-2">
			<a
				href="/payments"
				class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50"
			>
				ย้อนกลับ
			</a>

			<a
				href="/payments/generate-pdf?id={voucher.id}"
				target="_blank"
				class="rounded-lg bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
			>
				พิมพ์ PDF
			</a>

			<a
				href="/payments/{voucher.id}/edit"
				class="rounded-lg bg-yellow-500 px-4 py-2 text-white hover:bg-yellow-600"
			>
				แก้ไข
			</a>

			<button
				type="button"
				on:click={openDeleteModal}
				class="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
			>
				ลบ
			</button>
		</div>
	</div>

	<div class="rounded-lg border bg-white p-6 shadow-sm">
		<div class="mb-6 grid grid-cols-2 gap-6">
			<div>
				<p class="text-sm font-medium text-gray-500">
					{voucher.voucher_type === 'RV' ? 'รับเงินจาก (Payer)' : 'จ่ายให้แก่ (Payee)'}
				</p>
				<p class="text-lg font-medium text-gray-900">{voucher.contact_name}</p>
			</div>
			<div class="text-right">
				<p class="text-sm font-medium text-gray-500">วันที่เอกสาร</p>
				<p class="text-lg font-medium text-gray-900">{formatDate(voucher.voucher_date)}</p>
			</div>
		</div>

		<div class="mb-6">
			<p class="text-sm font-medium text-gray-500">รายละเอียด</p>
			<div
				class="mt-1 rounded-lg border border-gray-100 bg-gray-50 p-4 whitespace-pre-line text-gray-700"
			>
				{voucher.description || '-'}
			</div>
		</div>

		<div class="border-t pt-4">
			<div class="flex justify-end">
				<div class="w-full sm:w-1/2 lg:w-1/3">
					<div class="flex justify-between py-1 text-sm">
						<span class="text-gray-600">ยอดรวม (Subtotal)</span>
						<span class="font-medium text-gray-900">{formatCurrency(Number(voucher.subtotal))}</span
						>
					</div>
					{#if Number(voucher.vat_amount) > 0}
						<div class="flex justify-between py-1 text-sm">
							<span class="text-gray-600">VAT ({Number(voucher.vat_rate)}%)</span>
							<span class="font-medium text-gray-900"
								>{formatCurrency(Number(voucher.vat_amount))}</span
							>
						</div>
					{/if}
					{#if Number(voucher.wht_amount) > 0}
						<div class="flex justify-between py-1 text-sm text-red-600">
							<span>หัก ณ ที่จ่าย ({Number(voucher.wht_rate)}%)</span>
							<span>- {formatCurrency(Number(voucher.wht_amount))}</span>
						</div>
					{/if}
					<div class="mt-2 flex justify-between border-t border-gray-200 pt-2 text-lg font-bold">
						<span class="text-gray-800">ยอดสุทธิ</span>
						<span class={voucher.voucher_type === 'RV' ? 'text-green-600' : 'text-red-600'}>
							{formatCurrency(Number(voucher.total_amount))}
						</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

{#if isDeleteModalOpen}
	<div
		class="bg-opacity-75 fixed inset-0 z-50 flex items-center justify-center bg-gray-500 p-4 transition-opacity"
	>
		<div
			class="w-full transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all sm:max-w-lg"
		>
			<div class="flex items-start gap-4">
				<div
					class="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10"
				>
					<svg
						class="h-6 w-6 text-red-600"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
						/>
					</svg>
				</div>
				<div class="mt-3 text-center sm:mt-0 sm:text-left">
					<h3 class="text-lg leading-6 font-medium text-gray-900">ยืนยันการลบ</h3>
					<div class="mt-2">
						<p class="text-sm text-gray-500">
							คุณแน่ใจหรือไม่ที่จะลบเอกสารเลขที่ <strong>{voucher.voucher_number}</strong>?
							<br />การกระทำนี้ไม่สามารถย้อนกลับได้
						</p>
					</div>
				</div>
			</div>
			<div class="mt-6 flex justify-end gap-3">
				<button
					type="button"
					on:click={closeDeleteModal}
					class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
							closeDeleteModal();
						};
					}}
				>
					<button
						type="submit"
						disabled={isDeleting}
						class="flex items-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
					>
						{#if isDeleting}
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
