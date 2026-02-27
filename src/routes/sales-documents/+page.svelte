<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	export let data: PageData;
	$: ({ documents, currentPage, totalPages, searchQuery, filterStatus, filterType } = data);

	let searchInput = searchQuery;
	let statusInput = filterStatus;
	let typeInput = filterType;
	let searchTimeout: NodeJS.Timeout;

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

	function handleSearch() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => applyFilters(), 500);
	}

	function applyFilters() {
		const params = new URLSearchParams();
		params.set('page', '1');
		if (searchInput) params.set('search', searchInput);
		if (statusInput) params.set('status', statusInput);
		if (typeInput) params.set('type', typeInput);
		goto(`?${params.toString()}`);
	}

	function getStatusClass(status: string) {
		switch (status) {
			case 'Draft':
				return 'bg-gray-100 text-gray-800';
			case 'Sent':
				return 'bg-blue-100 text-blue-800';
			case 'Paid':
				return 'bg-green-100 text-green-800';
			case 'Overdue':
				return 'bg-red-100 text-red-800';
			case 'Void':
				return 'bg-gray-300 text-gray-600';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	function getDocTypeName(type: string) {
		switch (type) {
			case 'QT':
				return 'ใบเสนอราคา';
			case 'BN':
				return 'ใบวางบิล';
			case 'INV':
				return 'ใบแจ้งหนี้';
			case 'RE':
				return 'ใบเสร็จรับเงิน';
			default:
				return type;
		}
	}

	function getDocTypeColor(type: string) {
		switch (type) {
			case 'QT':
				return 'text-purple-600 bg-purple-50';
			case 'BN':
				return 'text-orange-600 bg-orange-50';
			case 'INV':
				return 'text-blue-600 bg-blue-50';
			case 'RE':
				return 'text-green-600 bg-green-50';
			default:
				return 'text-gray-600 bg-gray-50';
		}
	}

	const formatCurrency = (amount: number) =>
		new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
	const formatDate = (dateStr: string) =>
		dateStr
			? new Date(dateStr).toLocaleDateString('th-TH', {
					year: 'numeric',
					month: 'short',
					day: 'numeric'
				})
			: '-';
</script>

<svelte:head>
	<title>เอกสารการขาย (Sales Documents)</title>
</svelte:head>

<div class="mb-6 flex items-center justify-between">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">เอกสารการขาย (Sales Documents)</h1>
		<p class="mt-1 text-sm text-gray-500">จัดการใบเสนอราคา ใบวางบิล ใบแจ้งหนี้ และใบเสร็จ</p>
	</div>
	<a
		href="/sales-documents/new"
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
	>
		+ สร้างเอกสารใหม่
	</a>
</div>

<div
	class="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-4"
>
	<div class="relative md:col-span-2">
		<input
			type="search"
			bind:value={searchInput}
			on:input={handleSearch}
			placeholder="ค้นหาเลขที่เอกสาร หรือ ชื่อลูกค้า..."
			class="w-full rounded-lg border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
		/>
	</div>
	<div>
		<select
			bind:value={typeInput}
			on:change={applyFilters}
			class="w-full rounded-lg border-gray-300 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
		>
			<option value="">-- ทุกประเภทเอกสาร --</option>
			<option value="QT">ใบเสนอราคา (QT)</option>
			<option value="BN">ใบวางบิล (BN)</option>
			<option value="INV">ใบแจ้งหนี้ (INV)</option>
			<option value="RE">ใบเสร็จรับเงิน (RE)</option>
		</select>
	</div>
	<div>
		<select
			bind:value={statusInput}
			on:change={applyFilters}
			class="w-full rounded-lg border-gray-300 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
		>
			<option value="">-- ทุกสถานะ --</option>
			<option value="Draft">Draft (ร่าง)</option>
			<option value="Sent">Sent (ส่งแล้ว)</option>
			<option value="Paid">Paid (ชำระแล้ว)</option>
			<option value="Overdue">Overdue (เกินกำหนด)</option>
			<option value="Void">Void (ยกเลิก)</option>
		</select>
	</div>
</div>

<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">ประเภท</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">เลขที่เอกสาร</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">วันที่</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">ลูกค้า</th>
					<th class="px-4 py-3 text-right font-semibold text-gray-600">ยอดเงินรวม</th>
					<th class="px-4 py-3 text-center font-semibold text-gray-600">สถานะ</th>
					<th class="px-4 py-3 text-center font-semibold text-gray-600">จัดการ</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#if documents.length === 0}
					<tr>
						<td colspan="7" class="py-8 text-center text-gray-500">ไม่พบเอกสาร</td>
					</tr>
				{:else}
					{#each documents as doc}
						<tr class="transition-colors hover:bg-gray-50">
							<td class="px-4 py-3">
								<span
									class="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium {getDocTypeColor(
										doc.document_type
									)} border-current opacity-80"
								>
									{getDocTypeName(doc.document_type)}
								</span>
							</td>
							<td class="px-4 py-3 font-medium text-blue-600">
								<a href="/sales-documents/{doc.id}">{doc.document_number || '(Draft)'}</a>
							</td>
							<td class="px-4 py-3 whitespace-nowrap text-gray-600"
								>{formatDate(doc.document_date)}</td
							>
							<td class="px-4 py-3 font-medium text-gray-900">{doc.customer_name}</td>
							<td class="px-4 py-3 text-right font-semibold text-gray-900"
								>{formatCurrency(doc.total_amount)}</td
							>
							<td class="px-4 py-3 text-center">
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusClass(
										doc.status
									)}"
								>
									{doc.status}
								</span>
							</td>
							<td class="px-4 py-3 text-center">
								<div class="flex justify-center gap-2">
									<a
										href="/sales-documents/{doc.id}"
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

									{#if doc.status !== 'Draft'}
										<a
											href="/sales-documents/generate-pdf?id={doc.id}"
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
									{:else}
										<span
											class="cursor-not-allowed text-gray-200"
											title="ต้องบันทึกเอกสารก่อนพิมพ์"
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
										</span>
									{/if}

									<a
										href="/sales-documents/{doc.id}/edit"
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
										on:click={() => openDeleteModal(doc)}
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
				{/if}
			</tbody>
		</table>
	</div>
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
				คุณแน่ใจหรือไม่ที่จะลบเอกสาร <strong>{itemToDelete?.document_number}</strong>?
			</p>
			<div class="mt-6 flex justify-end gap-3">
				<button
					type="button"
					on:click={closeDeleteModal}
					class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700"
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
							closeDeleteModal();
						};
					}}
				>
					<input type="hidden" name="id" value={itemToDelete?.id} />
					<button
						type="submit"
						disabled={isDeleting}
						class="rounded-md bg-red-600 px-4 py-2 text-sm text-white"
						>{isDeleting ? 'กำลังลบ...' : 'ยืนยันการลบ'}</button
					>
				</form>
			</div>
		</div>
	</div>
{/if}
