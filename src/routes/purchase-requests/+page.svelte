<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	export let data;

	let searchInput = data.searchQuery;
	let searchTimeout: NodeJS.Timeout;

	function handleSearch() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			const url = new URL($page.url);
			url.searchParams.set('search', searchInput);
			url.searchParams.set('page', '1');
			goto(url, { keepFocus: true });
		}, 500);
	}

	const formatCurrency = (amount: number) =>
		new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
	const formatDate = (dateStr: string) =>
		!dateStr
			? '-'
			: new Date(dateStr).toLocaleDateString('th-TH', {
					year: 'numeric',
					month: 'short',
					day: 'numeric'
				});

	const getStatusClass = (status: string) => {
		switch (status) {
			case 'PENDING':
				return 'bg-yellow-100 text-yellow-800';
			case 'APPROVED':
				return 'bg-green-100 text-green-800';
			case 'REJECTED':
				return 'bg-red-100 text-red-800';
			case 'PO_CREATED':
				return 'bg-blue-100 text-blue-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	};
	// --- ส่วนจัดการ Modal ลบ ---
	let showDeleteModal = false;
	let deleteId: number | null = null;
	let deletePrNumber = '';
	let isDeleting = false;

	function openDeleteModal(pr: any) {
		deleteId = pr.id;
		deletePrNumber = pr.pr_number;
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
		deleteId = null;
		deletePrNumber = '';
	}
</script>

<svelte:head>
	<title>ใบขอซื้อ (Purchase Requests)</title>
</svelte:head>

<div class="mb-6 flex items-center justify-between">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">ใบขอซื้อ (Purchase Requests)</h1>
		<p class="mt-1 text-sm text-gray-500">รายการขออนุมัติจัดซื้อสินค้าภายในองค์กร</p>
	</div>
	<a
		href="/purchase-requests/create"
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="1.5"
			stroke="currentColor"
			class="h-5 w-5"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
		</svg>
		สร้างใบขอซื้อ
	</a>
</div>

<div
	class="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-3"
>
	<div class="relative md:col-span-1">
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<svg
				class="h-4 w-4 text-gray-400"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
			>
				<path
					fill-rule="evenodd"
					d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
					clip-rule="evenodd"
				/>
			</svg>
		</div>
		<input
			type="search"
			bind:value={searchInput}
			on:input={handleSearch}
			placeholder="ค้นหาเลขที่เอกสาร, แผนก..."
			class="w-full rounded-lg border-gray-300 py-2 pr-4 pl-10 text-sm focus:border-blue-500 focus:ring-blue-500"
		/>
	</div>
</div>

<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">เลขที่เอกสาร</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">วันที่</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">ผู้ขอ (Requester)</th>
					<th class="px-4 py-3 text-left font-semibold text-gray-600">แผนก</th>
					<th class="px-4 py-3 text-right font-semibold text-gray-600">ยอดรวม</th>
					<th class="px-4 py-3 text-center font-semibold text-gray-600">สถานะ</th>
					<th class="px-4 py-3 text-center font-semibold text-gray-600">จัดการ</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#each data.purchaseRequests as pr}
					<tr class="transition-colors hover:bg-gray-50">
						<td class="px-4 py-3 font-medium text-blue-600">
							<a href="/purchase-requests/{pr.id}">{pr.pr_number}</a>
						</td>
						<td class="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(pr.request_date)}</td>
						<td class="px-4 py-3 text-gray-900">{pr.requester_name || '-'}</td>
						<td class="px-4 py-3 text-gray-600">{pr.department || '-'}</td>
						<td class="px-4 py-3 text-right font-semibold text-gray-900"
							>{formatCurrency(Number(pr.total_amount))}</td
						>
						<td class="px-4 py-3 text-center">
							<span
								class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusClass(
									pr.status
								)}"
							>
								{pr.status}
							</span>
						</td>
						<td class="px-4 py-3 text-center">
							<div class="flex justify-center gap-2">
								<a
									href="/purchase-requests/{pr.id}"
									class="p-1 text-gray-400 transition-colors hover:text-blue-600"
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
									href="/purchase-requests/generate-pdf?id={pr.id}"
									target="_blank"
									class="p-1 text-gray-400 transition-colors hover:text-purple-600"
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

								{#if pr.status === 'PENDING'}
									<a
										href="/purchase-requests/{pr.id}/edit"
										class="p-1 text-gray-400 transition-colors hover:text-yellow-600"
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
								{:else}
									<span class="cursor-not-allowed p-1 text-gray-200">
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
									</span>
								{/if}

								{#if pr.status === 'PENDING' || pr.status === 'REJECTED' || pr.status === 'APPROVED'}
									<button
										type="button"
										on:click={() => openDeleteModal(pr)}
										class="p-1 text-gray-400 transition-colors hover:text-red-600"
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
								{:else}
									<span class="cursor-not-allowed p-1 text-gray-200">
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
									</span>
								{/if}
							</div>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="7" class="py-8 text-center text-gray-500">ไม่พบรายการใบขอซื้อ</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

{#if data.totalPages > 1}
	<div
		class="mt-4 flex items-center justify-between rounded-lg border-t border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-6"
	>
		<div class="flex flex-1 justify-between sm:hidden">
			<a
				href="?page={data.currentPage - 1}"
				class="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
				>Previous</a
			>
			<a
				href="?page={data.currentPage + 1}"
				class="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
				>Next</a
			>
		</div>
		<div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
			<div>
				<p class="text-sm text-gray-700">
					แสดงหน้า <span class="font-medium">{data.currentPage}</span> จาก
					<span class="font-medium">{data.totalPages}</span>
				</p>
			</div>
			<div>
				<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
					<a
						href="?page={data.currentPage - 1}"
						class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus:z-20 focus:outline-offset-0 {data.currentPage ===
						1
							? 'pointer-events-none opacity-50'
							: ''}"
					>
						<span class="sr-only">Previous</span>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
							<path
								fill-rule="evenodd"
								d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
								clip-rule="evenodd"
							/>
						</svg>
					</a>
					<a
						href="?page={data.currentPage + 1}"
						class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus:z-20 focus:outline-offset-0 {data.currentPage ===
						data.totalPages
							? 'pointer-events-none opacity-50'
							: ''}"
					>
						<span class="sr-only">Next</span>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
							<path
								fill-rule="evenodd"
								d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
								clip-rule="evenodd"
							/>
						</svg>
					</a>
				</nav>
			</div>
		</div>
	</div>
{/if}

{#if showDeleteModal}
	<div
		class="bg-opacity-75 fixed inset-0 z-50 flex items-center justify-center bg-gray-500 p-4 transition-opacity"
	>
		<div
			class="w-full max-w-lg transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all"
		>
			<h3 class="mb-2 text-lg leading-6 font-medium text-gray-900">ยืนยันการลบ</h3>
			<p class="text-sm text-gray-500">
				คุณแน่ใจหรือไม่ที่จะลบใบขอซื้อ <strong>{deletePrNumber}</strong>? <br />
				การกระทำนี้ไม่สามารถเรียกคืนได้
			</p>
			<div class="mt-6 flex justify-end gap-3">
				<button
					type="button"
					on:click={closeDeleteModal}
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
							closeDeleteModal();
						};
					}}
				>
					<input type="hidden" name="id" value={deleteId} />
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
