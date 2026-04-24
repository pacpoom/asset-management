<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let { data, form } = $props();
	let plans = $derived(data.plans || []);
	let deletingId = $state<number | null>(null);

	// สถานะ Modals
	let showPrintModal = $state(false);
	let showImportModal = $state(false);
	let todayDate = new Date().toISOString().split('T')[0];

	// 🌟 ตัวแปรสำหรับ Delete Modal
	let showDeleteModal = $state(false);
	let planToDelete = $state<any>(null);

	function formatPlanType(type: string) {
		if (!type) return { label: '-', class: '' };
		const low = type.toLowerCase();
		if (low === 'all') return { label: 'All', class: 'bg-blue-50 text-blue-700 border-blue-100' };
		if (low === 'pull')
			return { label: 'Pull', class: 'bg-purple-50 text-purple-700 border-purple-100' };
		return { label: type, class: 'bg-gray-50 text-gray-700 border-gray-200' };
	}

	function getStatusClass(status: number) {
		if (status === 1) return 'bg-gray-100 text-gray-800 border-gray-200';
		if (status === 2) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
		if (status === 3) return 'bg-green-100 text-green-800 border-green-200';
		return 'bg-gray-100 text-gray-500 border-gray-200';
	}

	function changeLimit(newLimit: string) {
		const url = new URL($page.url);
		url.searchParams.set('limit', newLimit);
		url.searchParams.set('page', '1');
		goto(url.toString());
	}

	function getPageUrl(pageNum: number) {
		const url = new URL($page.url);
		url.searchParams.set('page', pageNum.toString());
		return url.toString();
	}

	let startItem = $derived(
		data.pagination.totalItems === 0 ? 0 : (data.pagination.page - 1) * data.pagination.limit + 1
	);
	let endItem = $derived(
		Math.min(data.pagination.page * data.pagination.limit, data.pagination.totalItems)
	);

	let paginationRange = $derived(
		(() => {
			const current = data.pagination.page;
			const total = data.pagination.totalPages;
			const delta = 1;
			const range = [];
			const rangeWithDots = [];
			let l: number | undefined;
			for (let i = 1; i <= total; i++) {
				if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) range.push(i);
			}
			for (let i of range) {
				if (l) {
					if (i - l === 2) rangeWithDots.push(l + 1);
					else if (i - l !== 1) rangeWithDots.push('...');
				}
				rangeWithDots.push(i);
				l = i;
			}
			return rangeWithDots;
		})()
	);

	// 🌟 ฟังก์ชันเปิด Modal ยืนยันการลบ
	function openDeleteModal(plan: any) {
		planToDelete = plan;
		showDeleteModal = true;
	}
</script>

<svelte:head>
	<title>{$t('Containers Pulling')}</title>
</svelte:head>

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Containers Pulling')}</h1>
		<p class="mt-1 text-sm text-gray-500">
			{$t('Management of container pulling operations and plans')}
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<button
			type="button"
			aria-label={$t('Print Report')}
			onclick={() => (showPrintModal = true)}
			class="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600"
		>
			<span class="material-symbols-outlined text-[18px]" aria-hidden="true">print</span>
			{$t('Print Report')}
		</button>

		<button
			type="button"
			aria-label={$t('Import')}
			onclick={() => (showImportModal = true)}
			class="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
		>
			<span class="material-symbols-outlined text-[18px]" aria-hidden="true">upload_file</span>
			{$t('Import')}
		</button>

		<a
			href="/warehouse/containers-pulling/export{$page.url.search}"
			target="_blank"
			aria-label={$t('Export')}
			class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
		>
			<span class="material-symbols-outlined text-[18px]" aria-hidden="true">download</span>
			{$t('Export')}
		</a>

		<a
			href="/warehouse/containers-pulling/create"
			aria-label={$t('New Plan')}
			class="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-700"
		>
			<span class="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
			{$t('New Plan')}
		</a>
	</div>
</div>

{#if showPrintModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity"
	>
		<div class="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
			<form
				method="GET"
				action="/warehouse/containers-pulling/report"
				target="_blank"
				onsubmit={() => setTimeout(() => (showPrintModal = false), 100)}
			>
				<div
					class="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-4"
				>
					<h3 class="flex items-center gap-2 text-lg font-bold text-gray-800">
						{$t('Print Pulling Report')}
					</h3>
					<button
						type="button"
						aria-label={$t('Close')}
						onclick={() => (showPrintModal = false)}
						class="text-gray-400 transition-colors hover:text-gray-600"
					>
						<span class="material-symbols-outlined" aria-hidden="true">close</span>
					</button>
				</div>
				<div class="p-6">
					<p class="mb-5 text-sm text-gray-600">
						{$t('Please select a date to generate the report for')}
					</p>

					<div class="mb-4">
						<label for="printDate" class="mb-1.5 block text-sm font-bold text-gray-700"
							>{$t('Date')}</label
						>
						<input
							id="printDate"
							type="date"
							name="pulling_date"
							value={todayDate}
							required
							class="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none"
						/>
					</div>

					<div>
						<label for="printShop" class="mb-1.5 block text-sm font-bold text-gray-700"
							>{$t('Select Shop (Optional)')}</label
						>
						<select
							id="printShop"
							name="shop"
							class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none"
						>
							<option value="">{$t('All Shops')}</option>
							<option value="SKD">SKD</option>
							<option value="MOQ">MOQ</option>
							<option value="KD">KD</option>
							<option value="BA">BA</option>
							<option value="EA">EA</option>
						</select>
					</div>
				</div>
				<div class="flex justify-end gap-3 border-t border-gray-100 bg-gray-50/80 px-6 py-4">
					<button
						type="button"
						onclick={() => (showPrintModal = false)}
						class="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-100"
					>
						{$t('Cancel')}
					</button>
					<button
						type="submit"
						class="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
					>
						<span class="material-symbols-outlined text-[18px]" aria-hidden="true"
							>picture_as_pdf</span
						>
						{$t('Generate PDF')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if showImportModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity"
	>
		<div class="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
			<form
				method="POST"
				action="?/import"
				enctype="multipart/form-data"
				use:enhance={() => {
					return async ({ update }) => {
						showImportModal = false;
						await update();
					};
				}}
			>
				<div
					class="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-4"
				>
					<h3 class="flex items-center gap-2 text-lg font-bold text-gray-800">
						<span class="material-symbols-outlined text-emerald-600" aria-hidden="true"
							>upload_file</span
						>
						{$t('Import Pulling Plans')}
					</h3>
					<button
						type="button"
						aria-label={$t('Close')}
						onclick={() => (showImportModal = false)}
						class="text-gray-400 transition-colors hover:text-gray-600"
					>
						<span class="material-symbols-outlined" aria-hidden="true">close</span>
					</button>
				</div>
				<div class="p-6">
					<p class="mb-2 text-sm text-gray-600">
						{$t('Select an Excel file (.xlsx, .xls) to import.')}
					</p>
					<p class="mb-5 text-sm text-gray-600">
						{$t('Make sure the file follows the')}
						<a
							href="/warehouse/containers-pulling/template"
							target="_blank"
							class="font-bold text-blue-600 underline hover:text-blue-800"
							>{$t('template format')}</a
						>.
					</p>

					<div class="relative">
						<input
							type="file"
							name="import_file"
							accept=".xlsx, .xls"
							required
							class="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-600 transition-colors file:mr-4 file:rounded-md file:border-0 file:bg-emerald-50 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100"
						/>
					</div>
				</div>
				<div class="flex justify-end gap-3 border-t border-gray-100 bg-gray-50/80 px-6 py-4">
					<button
						type="button"
						onclick={() => (showImportModal = false)}
						class="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-100"
					>
						{$t('Cancel')}
					</button>
					<button
						type="submit"
						class="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700"
					>
						<span class="material-symbols-outlined text-[18px]" aria-hidden="true">publish</span>
						{$t('Start Import')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if showDeleteModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity"
	>
		<div class="w-full max-w-sm overflow-hidden rounded-xl bg-white text-center shadow-2xl">
			<div class="p-6">
				<div
					class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100"
				>
					<span class="material-symbols-outlined text-3xl text-red-600">warning</span>
				</div>
				<h3 class="mb-2 text-lg font-bold text-gray-800">{$t('Confirm Deletion?')}</h3>
				<p class="text-sm text-gray-600">
					{$t('Are you sure you want to delete plan')} <br />
					<strong class="text-gray-900">{planToDelete?.pulling_plan_no}</strong>?
				</p>
			</div>
			<div class="flex justify-center gap-3 border-t border-gray-100 bg-gray-50/80 px-6 py-4">
				<button
					type="button"
					onclick={() => {
						showDeleteModal = false;
						planToDelete = null;
					}}
					class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-100"
				>
					{$t('Cancel')}
				</button>
				<form
					method="POST"
					action="?/delete"
					class="w-full"
					use:enhance={() => {
						deletingId = planToDelete.id;
						return async ({ result, update }) => {
							deletingId = null;
							showDeleteModal = false;
							if (result.type === 'success') {
								update();
							} else if (result.type === 'failure') {
								alert((result.data as any)?.message || $t('เกิดข้อผิดพลาด'));
							}
						};
					}}
				>
					<input type="hidden" name="id" value={planToDelete?.id} />
					<button
						type="submit"
						disabled={deletingId === planToDelete?.id}
						class="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50"
					>
						{#if deletingId === planToDelete?.id}
							<div class="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
						{/if}
						{$t('Confirm Delete')}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}

<div class="mb-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
	<form method="GET" class="flex flex-wrap items-end gap-4">
		<input type="hidden" name="limit" value={data.pagination.limit} />
		<div class="w-48">
			<label for="pullingDateFilter" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
				>{$t('Pulling Date')}</label
			>
			<input
				id="pullingDateFilter"
				type="date"
				name="pullingDate"
				value={data.pullingDate}
				class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
			/>
		</div>

		<div class="w-40">
			<label for="statusSelect" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
				>{$t('Status')}</label
			>
			<select
				id="statusSelect"
				name="status"
				value={data.statusFilter}
				class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
				onchange={(e) => e.currentTarget.form?.submit()}
			>
				<option value="All">{$t('All Status')}</option>
				<option value="1">Planned</option>
				<option value="2">In Progress</option>
				<option value="3">Completed</option>
			</select>
		</div>

		<div class="min-w-[200px] flex-1">
			<label for="search" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
				>{$t('Search')}</label
			>
			<input
				id="search"
				type="text"
				name="search"
				value={data.searchQuery}
				placeholder={$t('Search Pulling Plan No or Container No')}
				class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
			/>
		</div>

		<button
			type="submit"
			class="flex items-center rounded-lg bg-gray-800 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
		>
			<span class="material-symbols-outlined mr-1 text-[18px]" aria-hidden="true">search</span>
			{$t('Search')}
		</button>
	</form>
</div>

<div class="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
	<div class="overflow-x-auto">
		<table class="w-full min-w-[1200px] text-left text-sm text-gray-600">
			<thead class="border-b border-gray-100 bg-gray-50 text-xs text-gray-700 uppercase">
				<tr>
					<th class="px-4 py-3">{$t('Pulling Plan No')}</th>
					<th class="px-4 py-3">{$t('Container No')}</th>
					<th class="px-4 py-3">{$t('Model')}</th>
					<th class="px-4 py-3">{$t('Type')}</th>
					<th class="px-4 py-3">{$t('Plan Type')}</th>
					<th class="px-4 py-3">{$t('Shop')}</th>
					<th class="px-4 py-3">{$t('Pulling Date')}</th>
					<th class="px-4 py-3 text-center">{$t('Pulling Order')}</th>
					<th class="px-4 py-3 text-center">{$t('Status')}</th>
					<th class="px-4 py-3 text-center">{$t('Actions')}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-50">
				{#each plans as plan}
					{@const typeInfo = formatPlanType(plan.plan_type)}
					<tr class="transition-colors hover:bg-gray-50">
						<td class="px-4 py-3 font-mono font-bold text-blue-600">{plan.pulling_plan_no}</td>
						<td class="px-4 py-3 font-medium text-gray-900">{plan.container_no || '-'}</td>
						<td class="px-4 py-3 font-medium text-gray-900">{plan.model || '-'}</td>
						<td class="px-4 py-3 font-medium text-gray-900">{plan.op_type || '-'}</td>
						<td class="px-4 py-3"
							><span class="rounded border px-2 py-0.5 text-[11px] font-bold {typeInfo.class}"
								>{typeInfo.label}</span
							></td
						>
						<td class="px-4 py-3 font-medium text-gray-900">{plan.shop || '-'}</td>
						<td class="px-4 py-3 font-medium text-gray-900"
							>{plan.pulling_date
								? new Date(plan.pulling_date).toLocaleDateString('en-GB')
								: '-'}</td
						>
						<td class="px-4 py-3 text-center font-medium text-gray-900"
							>{plan.pulling_order || '-'}</td
						>
						<td class="px-4 py-3 text-center">
							<span
								class="rounded-full border px-3 py-1 text-[11px] font-bold {getStatusClass(
									plan.status
								)}"
							>
								{plan.status === 1 ? 'Planned' : plan.status === 2 ? 'In Progress' : 'Completed'}
							</span>
						</td>
						<td class="px-4 py-3 text-center whitespace-nowrap">
							<div class="flex items-center justify-center gap-2">
								<a
									href="/warehouse/containers-pulling/edit/{plan.id}"
									aria-label={$t('Edit')}
									class="inline-block rounded-md bg-blue-50 p-1.5 text-blue-500 shadow-sm transition-colors hover:bg-blue-100 hover:text-blue-700"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										aria-hidden="true"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
										/></svg
									>
								</a>

								{#if plan.status === 1}
									<button
										type="button"
										aria-label={$t('Delete')}
										onclick={() => openDeleteModal(plan)}
										class="rounded-md bg-red-50 p-1.5 text-red-500 shadow-sm transition-colors hover:bg-red-100 hover:text-red-700"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											aria-hidden="true"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
											/></svg
										>
									</button>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
				{#if plans.length === 0}
					<tr
						><td colspan="10" class="px-4 py-10 text-center text-gray-500">{$t('No data found')}</td
						></tr
					>
				{/if}
			</tbody>
		</table>
	</div>

	{#if data.pagination.totalItems > 0}
		<div class="mt-6 flex flex-col items-center justify-between gap-4 px-6 pb-6 sm:flex-row">
			<div class="flex items-center gap-4">
				<div class="flex items-center gap-2">
					<span class="text-sm text-gray-700">{$t('Show')}</span>
					<select
						class="rounded-md border border-gray-300 bg-white py-1 pr-8 pl-3 text-sm focus:border-blue-500 focus:ring-blue-500"
						value={data.pagination.limit.toString()}
						onchange={(e) => changeLimit(e.currentTarget.value)}
					>
						<option value="10">10</option><option value="20">20</option><option value="50"
							>50</option
						><option value="200">200</option>
					</select>
					<span class="text-sm text-gray-700">{$t('entries')}</span>
				</div>
				<p class="hidden text-sm text-gray-700 sm:block">
					{$t('Showing page')} <span class="font-medium">{data.pagination.page}</span>
					{$t('of')} <span class="font-medium">{data.pagination.totalPages}</span>
					<span class="ml-1 text-gray-400"
						>({startItem} - {endItem}
						{$t('from')}
						{data.pagination.totalItems}
						{$t('entries')})</span
					>
				</p>
			</div>
			{#if data.pagination.totalPages > 1}
				<nav
					class="isolate inline-flex -space-x-px rounded-md shadow-sm"
					aria-label={$t('Pagination')}
				>
					<a
						href={data.pagination.page > 1 ? getPageUrl(data.pagination.page - 1) : '#'}
						aria-label={$t('Previous')}
						class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 hover:bg-gray-50 {data
							.pagination.page === 1
							? 'pointer-events-none opacity-50'
							: ''}"
					>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
							><path
								fill-rule="evenodd"
								d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
								clip-rule="evenodd"
							/></svg
						>
					</a>
					{#each paginationRange as pageNum}
						{#if typeof pageNum === 'string'}
							<span
								class="relative inline-flex items-center bg-white px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300"
								>...</span
							>
						{:else}
							<a
								href={getPageUrl(pageNum)}
								aria-label={`${$t('Page')} ${pageNum}`}
								class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum ===
								data.pagination.page
									? 'z-10 bg-blue-600 text-white'
									: 'bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50'}">{pageNum}</a
							>
						{/if}
					{/each}
					<a
						href={data.pagination.page < data.pagination.totalPages
							? getPageUrl(data.pagination.page + 1)
							: '#'}
						aria-label={$t('Next')}
						class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 hover:bg-gray-50 {data
							.pagination.page === data.pagination.totalPages
							? 'pointer-events-none opacity-50'
							: ''}"
					>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
							><path
								fill-rule="evenodd"
								d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
								clip-rule="evenodd"
							/></svg
						>
					</a>
				</nav>
			{/if}
		</div>
	{/if}
</div>
