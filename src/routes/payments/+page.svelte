<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	export let data: PageData;
	$: ({ vouchers, currentType } = data);

	// --- ส่วนจัดการ Modal ลบ (เพิ่มใหม่) ---
	let isDeleteModalOpen = false;
	let itemToDelete: any = null;
	let isDeleting = false;

	function openDeleteModal(item: any) {
		itemToDelete = item;
		isDeleteModalOpen = true;
	}

	function closeDeleteModal() {
		isDeleteModalOpen = false;
		itemToDelete = null;
	}
	// ------------------------------------

	function setType(type: string) {
		const params = new URLSearchParams(window.location.search);
		params.set('type', type);
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	const formatCurrency = (amount: number) =>
		new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);

	const formatDate = (dateStr: string) =>
		new Date(dateStr).toLocaleDateString('th-TH', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
</script>

<svelte:head>
	<title>รายการรับ-จ่าย (Vouchers)</title>
</svelte:head>

<div class="mb-6 flex items-center justify-between">
	<h1 class="text-2xl font-bold text-gray-800">ใบสำคัญรับ-จ่าย (Vouchers)</h1>
	<a
		href="/payments/new"
		class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
	>
		+ สร้างใบสำคัญ
	</a>
</div>

<div class="mb-6 border-b border-gray-200">
	<nav class="-mb-px flex space-x-8">
		<button
			on:click={() => setType('ALL')}
			class="border-b-2 px-1 pb-4 text-sm font-medium whitespace-nowrap {currentType === 'ALL'
				? 'border-blue-500 text-blue-600'
				: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
		>
			ทั้งหมด
		</button>
		<button
			on:click={() => setType('RV')}
			class="border-b-2 px-1 pb-4 text-sm font-medium whitespace-nowrap {currentType === 'RV'
				? 'border-green-500 text-green-600'
				: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
		>
			ใบสำคัญรับ (RV)
		</button>
		<button
			on:click={() => setType('PV')}
			class="border-b-2 px-1 pb-4 text-sm font-medium whitespace-nowrap {currentType === 'PV'
				? 'border-red-500 text-red-600'
				: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
		>
			ใบสำคัญจ่าย (PV)
		</button>
	</nav>
</div>

<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">วันที่</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">เลขที่เอกสาร</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">ประเภท</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">คู่ค้า/ผู้ติดต่อ</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">รายละเอียด</th>
				<th class="px-4 py-3 text-right font-semibold text-gray-600">จำนวนเงิน</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">จัดการ</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#each vouchers as v}
				<tr class="transition-colors hover:bg-gray-50">
					<td class="px-4 py-3 text-gray-600">{formatDate(v.voucher_date)}</td>
					<td class="px-4 py-3 font-medium text-blue-600">
						<a href="/payments/{v.id}">{v.voucher_number}</a>
					</td>
					<td class="px-4 py-3">
						<span
							class="rounded-full px-2 py-0.5 text-xs font-medium {v.voucher_type === 'RV'
								? 'bg-green-100 text-green-800'
								: 'bg-red-100 text-red-800'}"
						>
							{v.voucher_type === 'RV' ? 'รับ (RV)' : 'จ่าย (PV)'}
						</span>
					</td>
					<td class="px-4 py-3 text-gray-900">{v.contact_name || '-'}</td>
					<td class="max-w-xs truncate px-4 py-3 text-gray-500">{v.description || '-'}</td>
					<td class="px-4 py-3 text-right font-medium text-gray-900">
						{formatCurrency(Number(v.total_amount))}
					</td>
					<td class="px-4 py-3 text-center">
						<div class="flex justify-center gap-2">
							<a
								href="/payments/{v.id}"
								class="text-gray-400 transition-colors hover:text-blue-600"
								title="ดูรายละเอียด"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="h-5 w-5"
								>
									<path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
									<path
										fill-rule="evenodd"
										d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 8.142 1.987 10.336 5.404.347.526.347 1.186 0 1.712C18.142 14.013 14.257 16 10 16c-4.257 0-8.142-1.987-10.336-5.404zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
										clip-rule="evenodd"
									/>
								</svg>
							</a>

							<a
								href="/payments/generate-pdf?id={v.id}"
								target="_blank"
								rel="noopener noreferrer"
								class="text-gray-400 transition-colors hover:text-gray-600"
								title="พิมพ์ PDF"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="h-5 w-5"
								>
									<path
										fill-rule="evenodd"
										d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z"
										clip-rule="evenodd"
									/>
								</svg>
							</a>

							<a
								href="/payments/{v.id}/edit"
								class="text-gray-400 transition-colors hover:text-yellow-600"
								title="แก้ไข"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="h-5 w-5"
								>
									<path
										d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
									/>
								</svg>
							</a>

							<button
								type="button"
								on:click={() => openDeleteModal(v)}
								class="text-gray-400 transition-colors hover:text-red-600"
								title="ลบ"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="h-5 w-5"
								>
									<path
										fill-rule="evenodd"
										d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
										clip-rule="evenodd"
									/>
								</svg>
							</button>
						</div>
					</td>
				</tr>
			{/each}
			{#if vouchers.length === 0}
				<tr>
					<td colspan="7" class="py-8 text-center text-gray-500">ไม่พบข้อมูล</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>

{#if isDeleteModalOpen}
	<div
		class="bg-opacity-75 fixed inset-0 z-50 flex items-center justify-center bg-gray-500 p-4 transition-opacity"
	>
		<div
			class="w-full transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all sm:max-w-lg"
		>
			<h3 class="mb-2 text-lg leading-6 font-medium text-gray-900">ยืนยันการลบ</h3>
			<p class="text-sm text-gray-500">
				คุณแน่ใจหรือไม่ที่จะลบเอกสารเลขที่ <strong>{itemToDelete?.voucher_number}</strong>?
				<br />การกระทำนี้ไม่สามารถย้อนกลับได้
			</p>
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
					<input type="hidden" name="id" value={itemToDelete?.id} />
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
