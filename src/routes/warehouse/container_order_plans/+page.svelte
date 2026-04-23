<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import { t, locale } from '$lib/i18n';
	import type { PageData } from './$types';

	export let data: PageData;

	// ผูกค่าตัวแปรกับ Search Parameters
	let container_no = data.searchParams.container_no;
	let plan_no = data.searchParams.plan_no;
	let create_date_start = data.searchParams.create_date_start;
	let create_date_end = data.searchParams.create_date_end;
	let pageSize = data.pageSize || 10;

	// ตัวแปรสำหรับจัดการ Modal Packing List
	let showModal = false;
	let selectedContainer = '';
	let modalData: any[] = [];
	let isLoadingModal = false;

	// ตัวแปรสำหรับจัดการ Modal Add/Edit Plan และ Import
	let showAddModal = false;
	let showEditModal = false;
	let isAdding = false;
	let isEditing = false;
	let isImporting = false;
	let deletingId: number | null = null;

	// เก็บข้อมูลของ Plan ที่กำลังจะแก้ไข
	let editData: any = {};

	// ฟังก์ชันเปิด Modal และโหลดข้อมูล
	async function openPackingListModal(cNo: string) {
		if (!cNo || cNo === '-') return;
		selectedContainer = cNo;
		showModal = true;
		isLoadingModal = true;
		modalData = [];

		try {
			const res = await fetch(
				`${$page.url.pathname}/api-packing-list?container_no=${encodeURIComponent(cNo)}`
			);
			if (res.ok) {
				modalData = await res.json();
			} else {
				console.error('Failed to load packing list');
			}
		} catch (error) {
			console.error('Error fetching packing list:', error);
		} finally {
			isLoadingModal = false;
		}
	}

	// ฟังก์ชันสำหรับเปิด Modal แก้ไขข้อมูล
	function openEditModal(item: any) {
		// คัดลอกข้อมูลและแปลงวันที่ให้อยู่ในฟอร์แมต YYYY-MM-DD เพื่อแสดงใน input type="date"
		editData = { ...item };

		if (editData.eta_date) {
			editData.eta_date = new Date(editData.eta_date).toISOString().split('T')[0];
		}
		if (editData.checkin_date) {
			editData.checkin_date = new Date(editData.checkin_date).toISOString().split('T')[0];
		}

		showEditModal = true;
	}

	function closeModal() {
		showModal = false;
		selectedContainer = '';
		modalData = [];
	}

	// ฟังก์ชันค้นหา
	function search() {
		const url = new URL($page.url);

		if (container_no) url.searchParams.set('container_no', container_no);
		else url.searchParams.delete('container_no');

		if (plan_no) url.searchParams.set('plan_no', plan_no);
		else url.searchParams.delete('plan_no');

		if (create_date_start) url.searchParams.set('create_date_start', create_date_start);
		else url.searchParams.delete('create_date_start');

		if (create_date_end) url.searchParams.set('create_date_end', create_date_end);
		else url.searchParams.delete('create_date_end');

		url.searchParams.set('pageSize', pageSize.toString());
		url.searchParams.set('page', '1');
		goto(url.toString(), { keepFocus: true, replaceState: true });
	}

	// ฟังก์ชันล้างค่าค้นหา
	function clearSearch() {
		container_no = '';
		plan_no = '';

		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth();
		const firstDay = new Date(year, month, 1).toLocaleDateString('en-CA');
		const lastDay = new Date(year, month + 1, 0).toLocaleDateString('en-CA');

		create_date_start = firstDay;
		create_date_end = lastDay;

		pageSize = 10;
		search();
	}

	// ฟังก์ชันจัดรูปแบบวันที่เวลา
	function formatDateTime(val: any) {
		if (!val) return '-';
		const d = new Date(val);
		if (isNaN(d.getTime())) return val;
		const pad = (n: number) => n.toString().padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
	}

	// --- Pagination Logic ---
	$: paginationRange = (() => {
		const delta = 1;
		const left = data.page - delta;
		const right = data.page + delta + 1;
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
	})();

	function getPageUrl(pageNum: number) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		params.set('pageSize', pageSize.toString());
		return `${$page.url.pathname}?${params.toString()}`;
	}

	function changeLimit(newLimit: string) {
		pageSize = Number(newLimit);
		const params = new URLSearchParams($page.url.searchParams);
		params.set('pageSize', newLimit);
		params.set('page', '1');
		goto(`${$page.url.pathname}?${params.toString()}`, {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	$: startItem = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
	$: endItem = Math.min(data.page * data.pageSize, data.total);
</script>

<svelte:head>
	<title>{$t('Container Order Plan')}</title>
</svelte:head>

<div class="relative mx-auto min-h-screen max-w-full bg-gray-50 p-6">
	<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
		<h1 class="text-2xl font-bold text-gray-800">{$t('Container Order Plan')}</h1>

		<!-- ส่วนปุ่มจัดการข้อมูล (Add / Import) -->
		<div class="flex flex-wrap items-center gap-2">
			<!-- ฟอร์ม Import Data -->
			<form
				method="POST"
				action="?/import"
				enctype="multipart/form-data"
				use:enhance={() => {
					isImporting = true;
					return async ({ result, update }) => {
						isEditing = false;
						if (result.type === 'success') {
							showEditModal = false;
							alert('แก้ไขข้อมูลเรียบร้อยแล้ว');
							update();
						} else if (result.type === 'failure') {
							const message = (result.data as any)?.message;
							alert(message || 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล');
						}
					};
				}}
			>
				<label
					class="flex cursor-pointer items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-purple-700"
					class:opacity-70={isImporting}
					class:cursor-not-allowed={isImporting}
				>
					{#if isImporting}
						<div class="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
						{$t('Importing...')}
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
							/>
						</svg>
						{$t('Import')}
					{/if}
					<input
						type="file"
						name="file"
						accept=".xlsx,.xls,.csv"
						class="hidden"
						on:change={(e) => {
							if (e?.currentTarget?.files && e.currentTarget.files.length > 0)
								e.currentTarget.form?.requestSubmit();
						}}
						disabled={isImporting}
					/>
				</label>
			</form>

			<!-- ปุ่มเปิด Modal Add Plan -->
			<button
				on:click={() => (showAddModal = true)}
				class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				{$t('Add Plan')}
			</button>
		</div>
	</div>

	<!-- ส่วนของฟอร์มค้นหา -->
	<div class="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
			<div>
				<label for="search-plan-no" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Plan No')}</label
				>
				<input
					id="search-plan-no"
					type="text"
					bind:value={plan_no}
					class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
					placeholder={$t('Search Plan No...')}
				/>
			</div>
			<div>
				<label for="search-container-no" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Container No')}</label
				>
				<input
					id="search-container-no"
					type="text"
					bind:value={container_no}
					class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
					placeholder={$t('Search Container No...')}
				/>
			</div>
			<div>
				<label for="search-date-start" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Create Date (From)')}</label
				>
				<input
					id="search-date-start"
					type="date"
					bind:value={create_date_start}
					class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
				/>
			</div>
			<div>
				<label for="search-date-end" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Create Date (To)')}</label
				>
				<input
					id="search-date-end"
					type="date"
					bind:value={create_date_end}
					class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
				/>
			</div>
		</div>

		<div class="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-4">
			<button
				on:click={clearSearch}
				class="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
			>
				{$t('Clear Filter')}
			</button>

			<button
				on:click={search}
				class="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					fill="currentColor"
					viewBox="0 0 16 16"
				>
					<path
						d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"
					/>
				</svg>
				{$t('Search')}
			</button>

			<a
				href="{$page.url.pathname}/export-template"
				target="_blank"
				class="ml-4 flex items-center gap-2 rounded-lg border border-blue-600 bg-white px-5 py-2 text-sm font-bold text-blue-600 shadow-sm transition-colors hover:bg-blue-50"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
					/>
				</svg>
				{$t('Download Template')}
			</a>

			<a
				href="{$page.url.pathname}/export{$page.url.search
					? $page.url.search + '&'
					: '?'}locale={$locale}"
				target="_blank"
				class="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-green-700"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
					/>
				</svg>
				{$t('Export Excel')}
			</a>
		</div>
	</div>

	<!-- ส่วนของตารางแสดงผล -->
	<div class="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table
				class="min-w-full border-collapse divide-y divide-gray-200 text-left text-sm whitespace-nowrap"
			>
				<thead class="border-b border-gray-200 bg-gray-100 text-gray-700">
					<tr>
						<th class="border-r border-gray-200 px-4 py-3 text-center font-semibold"
							>{$t('Status')}</th
						>
						<th class="border-r border-gray-200 px-4 py-3 font-semibold">{$t('Plan No')}</th>
						<th class="border-r border-gray-200 px-4 py-3 font-semibold">{$t('Container No')}</th>
						<th class="border-r border-gray-200 px-4 py-3 font-semibold">{$t('House B/L')}</th>
						<th class="border-r border-gray-200 px-4 py-3 font-semibold">{$t('Week Lot')}</th>
						<th class="border-r border-gray-200 px-4 py-3 font-semibold">{$t('Vessel')}</th>
						<th class="border-r border-gray-200 px-4 py-3 font-semibold">{$t('Model')}</th>
						<th class="border-r border-gray-200 px-4 py-3 font-semibold">{$t('Type')}</th>
						<th class="border-r border-gray-200 px-4 py-3 font-semibold">{$t('Create Date')}</th>
						<th class="px-4 py-3 text-center font-semibold">{$t('Action')}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					{#each data.data as item}
						<tr class="transition-colors hover:bg-blue-50/50">
							<td class="border-r border-gray-100 px-4 py-3 text-center">
								{#if item.status === 1}
									<span
										class="rounded-md bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700"
										>{$t('Pending')}</span
									>
								{:else if item.status === 2}
									<span class="rounded-md bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700"
										>{$t('Received')}</span
									>
								{:else if item.status === 3}
									<span
										class="rounded-md bg-green-100 px-2 py-1 text-xs font-semibold text-green-700"
										>{$t('Shipped Out')}</span
									>
								{:else if item.status === 4}
									<span class="rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"
										>{$t('Returned')}</span
									>
								{:else}
									<span class="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700"
										>{item.status_label || '-'}</span
									>
								{/if}
							</td>
							<td class="border-r border-gray-100 px-4 py-3 font-medium text-gray-800"
								>{item.plan_no || '-'}</td
							>

							<!-- Container No กดเปิด Modal ได้ -->
							<td class="border-r border-gray-100 px-4 py-3 font-medium">
								{#if item.container_no}
									<button
										on:click={() => openPackingListModal(item.container_no)}
										class="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline focus:outline-none"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
											/>
										</svg>
										{item.container_no}
									</button>
								{:else}
									<span class="text-gray-800">-</span>
								{/if}
							</td>

							<td class="border-r border-gray-100 px-4 py-3 text-gray-800"
								>{item.house_bl || '-'}</td
							>
							<td class="border-r border-gray-100 px-4 py-3 text-center text-gray-800"
								>{item.week_lot || '-'}</td
							>
							<td
								class="max-w-[200px] truncate border-r border-gray-100 px-4 py-3 text-gray-800"
								title={item.vessel}>{item.vessel || '-'}</td
							>
							<td class="border-r border-gray-100 px-4 py-3 text-gray-800">{item.model || '-'}</td>
							<td class="border-r border-gray-100 px-4 py-3 text-gray-800">{item.type || '-'}</td>
							<td class="border-r border-gray-100 px-4 py-3 text-gray-600"
								>{formatDateTime(item.created_at)}</td
							>

							<!-- คอลัมน์ Action แก้ไขและลบข้อมูล -->
							<td class="px-4 py-3 text-center whitespace-nowrap">
								<div class="flex items-center justify-center gap-2">
									<!-- ปุ่มแก้ไข -->
									<button
										on:click={() => openEditModal(item)}
										class="rounded-md bg-blue-50 p-1.5 text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-700"
										title={$t('Edit')}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
											/>
										</svg>
									</button>

									<!-- ปุ่มลบ -->
									{#if item.status === 1}
										<form
											method="POST"
											action="?/delete"
											class="inline"
											use:enhance={(e) => {
												if (!confirm('คุณต้องการลบ Order Plan นี้ใช่หรือไม่?')) {
													e.cancel();
													return;
												}
												deletingId = item.id;
												return async ({ result, update }) => {
													deletingId = null;
													if (result.type === 'success') {
														update();
													} else if (result.type === 'failure') {
														const message = (result.data as any)?.message;
														alert(message || 'เกิดข้อผิดพลาดในการลบข้อมูล');
													}
												};
											}}
										>
											<input type="hidden" name="id" value={item.id} />
											<button
												type="submit"
												disabled={deletingId === item.id}
												class="rounded-md bg-red-50 p-1.5 text-red-500 transition-colors hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
												title={$t('Delete')}
											>
												{#if deletingId === item.id}
													<div
														class="h-4 w-4 animate-spin rounded-full border-b-2 border-red-600"
													></div>
												{:else}
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-4 w-4"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
														/>
													</svg>
												{/if}
											</button>
										</form>
									{:else}
										<button
											type="button"
											class="cursor-not-allowed rounded-md bg-gray-50 p-1.5 text-gray-300"
											title={$t('Cannot delete (Status is not Pending)')}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
												/>
											</svg>
										</button>
									{/if}
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="10" class="px-6 py-12 text-center text-gray-500">
								{$t('No data found matching the search criteria')}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Pagination & Paging Size -->
	{#if data.total > 0}
		<div class="mt-6 flex flex-col items-center justify-between gap-4 pb-6 sm:flex-row">
			<div class="flex items-center gap-4">
				<div class="flex items-center gap-2">
					<span class="text-sm text-gray-700">{$t('Show')}</span>
					<select
						class="rounded-md border border-gray-300 bg-white py-1 pr-8 pl-3 text-sm focus:border-blue-500 focus:ring-blue-500"
						value={data.pageSize.toString()}
						on:change={(e) => changeLimit(e.currentTarget.value)}
					>
						<option value="10">10</option>
						<option value="20">20</option>
						<option value="50">50</option>
						<option value="200">200</option>
					</select>
					<span class="text-sm text-gray-700">{$t('entries')}</span>
				</div>
				{#if data.totalPages > 0}
					<p class="hidden text-sm text-gray-700 sm:block">
						{$t('Showing page')} <span class="font-medium">{data.page}</span>
						{$t('of')} <span class="font-medium">{data.totalPages}</span>
						<span class="ml-1 text-gray-400"
							>({startItem} - {endItem} {$t('from')} {data.total} {$t('entries')})</span
						>
					</p>
				{/if}
			</div>

			{#if data.totalPages > 1}
				<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
					<a
						href={data.page > 1 ? getPageUrl(data.page - 1) : '#'}
						aria-label={$t('Previous')}
						class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.page ===
						1
							? 'pointer-events-none opacity-50'
							: ''}"
					>
						<span class="sr-only">{$t('Previous')}</span>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
								clip-rule="evenodd"
							/>
						</svg>
					</a>

					{#each paginationRange as pageNum}
						{#if typeof pageNum === 'string'}
							<span
								class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 ring-inset"
								>...</span
							>
						{:else}
							<a
								href={getPageUrl(pageNum)}
								class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum ===
								data.page
									? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
									: 'bg-white text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-50'}"
							>
								{pageNum}
							</a>
						{/if}
					{/each}

					<a
						href={data.page < data.totalPages ? getPageUrl(data.page + 1) : '#'}
						aria-label={$t('Next')}
						class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.page ===
						data.totalPages
							? 'pointer-events-none opacity-50'
							: ''}"
					>
						<span class="sr-only">{$t('Next')}</span>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
								clip-rule="evenodd"
							/>
						</svg>
					</a>
				</nav>
			{/if}
		</div>
	{/if}

	<!-- ==================== Modal Packing List ==================== -->
	{#if showModal}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity duration-300"
		>
			<div
				class="animate-fade-in-up flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
			>
				<!-- Modal Header -->
				<div
					class="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-4"
				>
					<h2 class="flex items-center gap-2 text-lg font-bold text-gray-800">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 text-blue-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
							/>
						</svg>
						{$t('Packing List of Container')}:
						<span class="ml-1 text-blue-600">{selectedContainer}</span>
					</h2>
					<button
						on:click={closeModal}
						aria-label={$t('Close')}
						class="rounded-lg p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				<!-- Modal Body -->
				<div class="flex-1 overflow-y-auto bg-white p-6">
					{#if isLoadingModal}
						<div class="flex flex-col items-center justify-center gap-3 py-16">
							<div class="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600"></div>
							<span class="font-medium text-gray-500">{$t('Loading...')}</span>
						</div>
					{:else if modalData.length > 0}
						<div class="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
							<table
								class="min-w-full divide-y divide-gray-200 text-left text-sm whitespace-nowrap"
							>
								<thead class="bg-gray-100 text-gray-700">
									<tr>
										<th class="border-r border-gray-200 px-4 py-3 text-center font-semibold"
											>{$t('Status')}</th
										>
										<th class="border-r border-gray-200 px-4 py-3 font-semibold"
											>{$t('Delivery Order')}</th
										>
										<th class="border-r border-gray-200 px-4 py-3 font-semibold"
											>{$t('Item Number')}</th
										>
										<th class="border-r border-gray-200 px-4 py-3 font-semibold"
											>{$t('Material No')}</th
										>
										<th class="border-r border-gray-200 px-4 py-3 font-semibold"
											>{$t('Case Number')}</th
										>
										<th class="border-r border-gray-200 px-4 py-3 font-semibold">{$t('Box ID')}</th>
										<th class="border-r border-gray-200 px-4 py-3 text-right font-semibold"
											>{$t('Qty')}</th
										>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200 bg-white">
									{#each modalData as row}
										<tr class="transition-colors hover:bg-blue-50/50">
											<td class="border-r border-gray-100 px-4 py-3 text-center">
												{#if row.receive_flg === 1}
													<span
														class="rounded-md bg-green-100 px-2 py-1 text-xs font-semibold text-green-700"
														>{$t('Received')}</span
													>
												{:else}
													<span
														class="rounded-md bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700"
														>{$t('Pending')}</span
													>
												{/if}
											</td>
											<td class="border-r border-gray-100 px-4 py-3 text-gray-800"
												>{row.delivery_order || '-'}</td
											>
											<td class="border-r border-gray-100 px-4 py-3 text-gray-800"
												>{row.item_number || '-'}</td
											>
											<td class="border-r border-gray-100 px-4 py-3 text-gray-800"
												>{row.temp_material || '-'}</td
											>
											<td class="border-r border-gray-100 px-4 py-3 text-gray-800"
												>{row.case_number || '-'}</td
											>
											<td class="border-r border-gray-100 px-4 py-3 text-gray-800"
												>{row.box_id || '-'}</td
											>
											<td
												class="border-r border-gray-100 px-4 py-3 text-right font-medium text-gray-800"
												>{row.quantity ?? '-'}</td
											>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<div class="mt-4 flex justify-end text-sm text-gray-500">
							{$t('Total items')}: <span class="ml-1 font-bold">{modalData.length}</span>
						</div>
					{:else}
						<div
							class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center text-gray-500"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-12 w-12 text-gray-300"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
								/>
							</svg>
							{$t('No packing list data found for this container')}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- ==================== Modal Add Container Plan ==================== -->
	{#if showAddModal}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity duration-300"
		>
			<div
				class="animate-fade-in-up flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
			>
				<div
					class="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-4"
				>
					<h2 class="flex items-center gap-2 text-lg font-bold text-gray-800">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 text-blue-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 4v16m8-8H4"
							/>
						</svg>
						{$t('Add Container Plan')}
					</h2>
					<button
						on:click={() => (showAddModal = false)}
						aria-label={$t('Close')}
						class="rounded-lg p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				<div class="flex-1 overflow-y-auto bg-white p-6">
					<form
						method="POST"
						action="?/create"
						use:enhance={() => {
							isAdding = true;
							return async ({ result, update }) => {
								isAdding = false;
								if (result.type === 'success') {
									showAddModal = false;
									alert('บันทึกข้อมูลเรียบร้อยแล้ว');
									update();
								} else if (result.type === 'failure') {
									const message = (result.data as any)?.message;
									alert(message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
								}
							};
						}}
					>
						<div class="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
							<div>
								<label for="add_container_no" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Container No')} <span class="text-red-500">*</span></label
								>
								<input
									id="add_container_no"
									type="text"
									name="container_no"
									maxlength="255"
									required
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="add_house_bl" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('House B/L')} <span class="text-red-500">*</span></label
								>
								<input
									id="add_house_bl"
									type="text"
									name="house_bl"
									maxlength="255"
									required
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="add_model" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Model')}</label
								>
								<input
									id="add_model"
									type="text"
									name="model"
									maxlength="255"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="add_type" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Type')}</label
								>
								<input
									id="add_type"
									type="text"
									name="type"
									maxlength="255"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="add_eta_date" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('ETA Date')}</label
								>
								<input
									id="add_eta_date"
									type="date"
									name="eta_date"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="add_checkin_date" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Check-in Date')}</label
								>
								<input
									id="add_checkin_date"
									type="date"
									name="checkin_date"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="add_free_time" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Free Time')}</label
								>
								<input
									id="add_free_time"
									type="number"
									name="free_time"
									min="0"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="add_depot" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Depot')}</label
								>
								<input
									id="add_depot"
									type="text"
									name="depot"
									maxlength="255"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="add_week_lot" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Week Lot')}</label
								>
								<input
									id="add_week_lot"
									type="number"
									name="week_lot"
									min="0"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="add_vessel" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Vessel')}</label
								>
								<input
									id="add_vessel"
									type="text"
									name="vessel"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="add_agent" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Agent')}</label
								>
								<input
									id="add_agent"
									type="text"
									name="agent"
									maxlength="255"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label
									for="add_container_owner"
									class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Container Owner')}</label
								>
								<input
									id="add_container_owner"
									type="text"
									name="container_owner"
									maxlength="50"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
						</div>

						<div class="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-5">
							<button
								type="button"
								on:click={() => (showAddModal = false)}
								class="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
							>
								{$t('Cancel')}
							</button>
							<button
								type="submit"
								disabled={isAdding}
								class="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400"
							>
								{#if isAdding}
									<div class="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
									{$t('Saving...')}
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
									</svg>
									{$t('Save')}
								{/if}
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	{/if}

	<!-- ==================== Modal Edit Container Plan ==================== -->
	{#if showEditModal}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity duration-300"
		>
			<div
				class="animate-fade-in-up flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
			>
				<div
					class="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-4"
				>
					<h2 class="flex items-center gap-2 text-lg font-bold text-gray-800">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 text-blue-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
							/>
						</svg>
						{$t('Edit Container Plan')}
					</h2>
					<button
						on:click={() => (showEditModal = false)}
						aria-label={$t('Close')}
						class="rounded-lg p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				<div class="flex-1 overflow-y-auto bg-white p-6">
					<form
						method="POST"
						action="?/update"
						use:enhance={() => {
							isEditing = true;
							return async ({ result, update }) => {
								isImporting = false;
								if (result.type === 'success') {
									alert('นำเข้าข้อมูลสำเร็จ');
									update();
								} else if (result.type === 'failure') {
									const message = (result.data as any)?.message;
									alert(message || 'เกิดข้อผิดพลาดในการนำเข้าข้อมูล');
								}
							};
						}}
					>
						<!-- ส่ง ID ไปด้วยเสมอเพื่อนำไปใช้อัปเดต -->
						<input type="hidden" name="id" value={editData.id} />
						<input type="hidden" name="container_id" value={editData.container_id} />

						<div class="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
							<div>
								<label for="edit_container_no" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Container No')}</label
								>
								<!-- กล่อง Container No เป็น Readonly ป้องกันการแก้ไข -->
								<input
									id="edit_container_no"
									type="text"
									value={editData.container_no}
									readonly
									class="w-full cursor-not-allowed rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-500"
								/>
							</div>
							<div>
								<label for="edit_house_bl" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('House B/L')} <span class="text-red-500">*</span></label
								>
								<input
									id="edit_house_bl"
									type="text"
									name="house_bl"
									value={editData.house_bl || ''}
									maxlength="255"
									required
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="edit_model" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Model')}</label
								>
								<input
									id="edit_model"
									type="text"
									name="model"
									value={editData.model || ''}
									maxlength="255"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="edit_type" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Type')}</label
								>
								<input
									id="edit_type"
									type="text"
									name="type"
									value={editData.type || ''}
									maxlength="255"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="edit_eta_date" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('ETA Date')}</label
								>
								<input
									id="edit_eta_date"
									type="date"
									name="eta_date"
									value={editData.eta_date || ''}
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="edit_checkin_date" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Check-in Date')}</label
								>
								<input
									id="edit_checkin_date"
									type="date"
									name="checkin_date"
									value={editData.checkin_date || ''}
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="edit_free_time" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Free Time')}</label
								>
								<input
									id="edit_free_time"
									type="number"
									name="free_time"
									value={editData.free_time ?? ''}
									min="0"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="edit_depot" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Depot')}</label
								>
								<input
									id="edit_depot"
									type="text"
									name="depot"
									value={editData.depot || ''}
									maxlength="255"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="edit_week_lot" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Week Lot')}</label
								>
								<input
									id="edit_week_lot"
									type="number"
									name="week_lot"
									value={editData.week_lot ?? ''}
									min="0"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="edit_vessel" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Vessel')}</label
								>
								<input
									id="edit_vessel"
									type="text"
									name="vessel"
									value={editData.vessel || ''}
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="edit_agent" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Agent')}</label
								>
								<input
									id="edit_agent"
									type="text"
									name="agent"
									value={editData.agent || ''}
									maxlength="255"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label
									for="edit_container_owner"
									class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('Container Owner')}</label
								>
								<input
									id="edit_container_owner"
									type="text"
									name="container_owner"
									value={editData.container_owner || ''}
									maxlength="50"
									class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
						</div>

						<div class="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-5">
							<button
								type="button"
								on:click={() => (showEditModal = false)}
								class="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
							>
								{$t('Cancel')}
							</button>
							<button
								type="submit"
								disabled={isEditing}
								class="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400"
							>
								{#if isEditing}
									<div class="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
									{$t('Updating...')}
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
									</svg>
									{$t('Update')}
								{/if}
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Add smooth animation for modal entrance */
	@keyframes fadeInUp {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.animate-fade-in-up {
		animation: fadeInUp 0.3s ease-out forwards;
	}
</style>
