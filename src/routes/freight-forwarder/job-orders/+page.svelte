<!-- eslint-disable svelte/no-navigation-without-resolve -->
<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	// นำเข้า locale มาเพื่อส่งไปตอนกด Export
	import { t, locale } from '$lib/i18n';

	export let data;

	$: jobs = data.job_orders || [];
	$: containerAlerts = data.containerAlerts || [];
	$: isEn = $locale === 'en';
	// รับค่า Date filter มาจาก Server
	$: pagination = data.pagination || {
		total: 0,
		page: 1,
		limit: 10,
		search: '',
		startDate: '',
		endDate: ''
	};

	let showDeleteModal = false;
	let jobToDeleteId: number | null = null;
	let jobToDeleteName: string = '';
	let isDeleting = false;

	let searchQuery = '';
	let itemsPerPage = 10;
	let currentPage = 1;
	let startDate = '';
	let endDate = '';

	// Sync ค่า State กับ Pagination
	$: {
		searchQuery = pagination.search || '';
		itemsPerPage = pagination.limit || 10;
		currentPage = pagination.page || 1;
		startDate = pagination.startDate || '';
		endDate = pagination.endDate || '';
	}

	$: totalPages = Math.ceil(pagination.total / itemsPerPage);

	function updateData() {
		const url = new URL($page.url);
		url.searchParams.set('page', currentPage.toString());
		url.searchParams.set('limit', itemsPerPage.toString());

		if (searchQuery) {
			url.searchParams.set('search', searchQuery);
		} else {
			url.searchParams.delete('search');
		}

		if (startDate) {
			url.searchParams.set('startDate', startDate);
		} else {
			url.searchParams.delete('startDate');
		}

		if (endDate) {
			url.searchParams.set('endDate', endDate);
		} else {
			url.searchParams.delete('endDate');
		}

		goto(url.toString(), { keepFocus: true, noScroll: true });
	}

	let searchTimeout: ReturnType<typeof setTimeout>;
	function onSearchInput() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			currentPage = 1;
			updateData();
		}, 400);
	}

	function onDateChange() {
		currentPage = 1;
		updateData();
	}

	function onLimitChange() {
		currentPage = 1;
		updateData();
	}

	function prevPage() {
		if (currentPage > 1) {
			currentPage--;
			updateData();
		}
	}

	function nextPage() {
		if (currentPage < totalPages) {
			currentPage++;
			updateData();
		}
	}

	function getStatusClass(status: string) {
		switch (status) {
			case 'Pending':
				return 'bg-blue-100 text-blue-800';
			case 'In Progress':
				return 'bg-yellow-100 text-yellow-800';
			case 'Completed':
				return 'bg-green-100 text-green-800';
			case 'Cancelled':
				return 'bg-red-100 text-red-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	function formatJobNumber(type: string, dateStr: string, id: number) {
		if (!type || !dateStr || !id) return `JOB-${id}`;
		const d = new Date(dateStr);
		const yy = String(d.getFullYear()).slice(-2);
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const paddedId = String(id).padStart(4, '0');
		return `${type}${yy}${mm}${paddedId}`;
	}

	function confirmDelete(job: Record<string, unknown>) {
		jobToDeleteId = job.id as number;
		jobToDeleteName =
			(job.job_number as string) ||
			formatJobNumber(job.job_type as string, job.job_date as string, job.id as number);
		showDeleteModal = true;
	}

	function closeModal() {
		showDeleteModal = false;
		jobToDeleteId = null;
		jobToDeleteName = '';
		isDeleting = false;
	}

	// ── Multi-select / Bulk status change ──────────────────────────────
	let selectedIds = new Set<number>();
	let showBulkStatusModal = false;
	let bulkNewStatus = '';
	let isBulkUpdating = false;

	$: allSelected = jobs.length > 0 && jobs.every((j: { id: number }) => selectedIds.has(j.id));
	$: someSelected = selectedIds.size > 0 && !allSelected;

	// clear selection เมื่อข้อมูลในหน้าเปลี่ยน (pagination / search)
	$: {
		void jobs;
		selectedIds = new Set();
	}

	function toggleSelectAll() {
		if (allSelected) {
			selectedIds = new Set();
		} else {
			selectedIds = new Set(jobs.map((j: { id: number }) => j.id));
		}
	}

	function toggleSelect(id: number) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	function clearBulkSelection() {
		selectedIds = new Set();
		showBulkStatusModal = false;
		bulkNewStatus = '';
	}

	// Svelte action: set indeterminate property on checkbox
	function setIndeterminate(node: HTMLInputElement, value: boolean) {
		node.indeterminate = value;
		return { update(v: boolean) { node.indeterminate = v; } };
	}
</script>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">{$t('Job Orders')}</h1>
			<p class="text-sm text-gray-500">{$t('Manage Freight Forwarder Jobs')}</p>
		</div>

		<div class="flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:items-center">
			<!-- Date Filters -->
			<div class="flex w-full flex-col items-center gap-2 sm:flex-row lg:w-auto">
				<div class="relative w-full sm:w-auto">
					<input
						type="date"
						bind:value={startDate}
						onchange={onDateChange}
						class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
						title={$t('Start Date')}
					/>
				</div>
				<span class="hidden text-gray-400 sm:inline">-</span>
				<div class="relative w-full sm:w-auto">
					<input
						type="date"
						bind:value={endDate}
						onchange={onDateChange}
						class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
						title={$t('End Date')}
					/>
				</div>
			</div>

			<!-- Search -->
			<div class="relative w-full lg:w-64">
				<input
					type="text"
					bind:value={searchQuery}
					oninput={onSearchInput}
					placeholder={$t('Search Job, Customer, Vendor...')}
					class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-9 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
				/>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="absolute top-2.5 left-3 h-4 w-4 text-gray-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/>
				</svg>
			</div>

			<!-- Buttons -->
			<div class="flex w-full gap-2 sm:w-auto">
				<!-- พ่วงค่า locale เข้าไปที่ URL สำหรับ Export ด้วย -->
				<a
					href={`/freight-forwarder/job-orders/export-excel?search=${encodeURIComponent(searchQuery)}&startDate=${startDate}&endDate=${endDate}&locale=${$locale}`}
					target="_blank"
					class="flex flex-1 flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white shadow transition-colors hover:bg-green-700 sm:w-auto sm:flex-none"
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
					<span class="hidden sm:inline">{$t('Export')}</span>
				</a>

				<a
					href="/freight-forwarder/job-orders/create"
					class="flex flex-1 flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow transition-colors hover:bg-blue-700 sm:w-auto sm:flex-none"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						class="h-5 w-5"
					>
						<path
							d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"
						/>
					</svg>
					<span class="hidden sm:inline">{$t('New Job')}</span>
					<span class="sm:hidden">{$t('New')}</span>
				</a>
			</div>
		</div>
	</div>

	<!-- ============================================ -->
	<!-- CONTAINER CHECKOUT ALERT SECTION             -->
	<!-- ============================================ -->
	{#if containerAlerts.length > 0}
		<div class="mb-5 overflow-hidden rounded-xl border border-red-200 bg-white shadow-sm">
			<div class="flex items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-3">
				<svg class="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
				</svg>
				<span class="font-bold text-red-700">
						{$t('Container Alert Header')} ({containerAlerts.length} {$t('items')})
					</span>
			</div>
			<div class="divide-y divide-gray-100">
				{#each containerAlerts as alert}
					{@const hasDays = alert.demurrage_days != null || alert.storage_days != null || alert.detention_days != null}
					{@const daysOD = Number(alert.days_overdue_demurrage)}
					{@const daysOS = Number(alert.days_overdue_storage)}
					{@const daysODet = Number(alert.days_overdue_detention)}
					{@const daysSince = Number(alert.days_since_eta)}
					{@const worstOverdue = hasDays
						? Math.max(
								alert.days_overdue_demurrage != null ? daysOD : -999,
								alert.days_overdue_storage != null ? daysOS : -999,
								alert.days_overdue_detention != null ? daysODet : -999
							)
						: daysSince}
					{@const isOverdue = worstOverdue > 0}
					{@const isCritical = worstOverdue === 0}
					<div class="flex items-start gap-4 px-4 py-3 hover:bg-gray-50">
						<div class="flex-shrink-0 pt-0.5">
							{#if isOverdue}
								<span class="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
									{$t('ff.overdue_label')} {worstOverdue}{$t('ff.day')}
								</span>
							{:else if isCritical}
								<span class="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-700">
									{$t('Due today!')}
								</span>
							{:else}
								<span class="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-bold text-yellow-700">
									{isEn ? `${Math.abs(worstOverdue)}d remaining` : `อีก ${Math.abs(worstOverdue)} วัน`}
								</span>
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
								<a href="/freight-forwarder/job-orders/{alert.id}" class="font-bold text-blue-600 hover:underline">
									{alert.job_number || `JOB-${alert.id}`}
								</a>
								<span class="text-sm text-gray-500">{alert.customer_name || '-'}</span>
								<span class="text-xs text-gray-400">
									{$t('Container Pending Label')}
									<strong class="text-amber-600">{alert.pending_count}</strong>
									{$t('Container Unit')}
									| ETA: {new Date(alert.eta).toLocaleDateString(isEn ? 'en-US' : 'th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
								</span>
							</div>
							<!-- Per-type deadline badges -->
							{#if hasDays}
								<div class="mt-1 flex flex-wrap gap-2">
									{#if alert.demurrage_days != null}
										{@const d = daysOD}
										<span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold {d > 0 ? 'bg-red-100 text-red-700' : d === 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}">
											{$t('ff.demurrage_label')}: {alert.demurrage_days}{$t('ff.day')}
											{#if d > 0}— {$t('ff.overdue_label')} {d}{$t('ff.day')}!
											{:else if d === 0}— {$t('Due today!')}
											{:else}— {isEn ? `${Math.abs(d)}d left` : `เหลือ ${Math.abs(d)} วัน`}{/if}
										</span>
									{/if}
									{#if alert.storage_days != null}
										{@const d = daysOS}
										<span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold {d > 0 ? 'bg-red-100 text-red-700' : d === 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}">
											{$t('ff.storage_label')}: {alert.storage_days}{$t('ff.day')}
											{#if d > 0}— {$t('ff.overdue_label')} {d}{$t('ff.day')}!
											{:else if d === 0}— {$t('Due today!')}
											{:else}— {isEn ? `${Math.abs(d)}d left` : `เหลือ ${Math.abs(d)} วัน`}{/if}
										</span>
									{/if}
									{#if alert.detention_days != null}
										{@const d = daysODet}
										<span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold {d > 0 ? 'bg-red-100 text-red-700' : d === 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}">
											{$t('ff.detention_label')}: {alert.detention_days}{$t('ff.day')}
											{#if d > 0}— {$t('ff.overdue_label')} {d}{$t('ff.day')}!
											{:else if d === 0}— {$t('Due today!')}
											{:else}— {isEn ? `${Math.abs(d)}d left` : `เหลือ ${Math.abs(d)} วัน`}{/if}
										</span>
									{/if}
								</div>
							{:else}
								<span class="text-xs text-gray-400">
									{#if daysSince > 0}
										{isEn ? `ETA overdue ${daysSince}d` : `เกิน ETA ${daysSince} วัน`}
									{:else if daysSince === 0}
										{$t('ETA today')}
									{:else}
										{isEn ? `ETA in ${Math.abs(daysSince)}d` : `ETA อีก ${Math.abs(daysSince)} วัน`}
									{/if}
								</span>
							{/if}
						</div>
						<a href="/freight-forwarder/job-orders/{alert.id}"
							class="flex-shrink-0 rounded-lg {isOverdue ? 'bg-red-600' : isCritical ? 'bg-orange-500' : 'bg-yellow-500'} px-3 py-1 text-xs font-semibold text-white hover:opacity-80">
							{isEn ? 'Checkout →' : 'Checkout →'}
						</a>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50 text-gray-700">
					<tr>
						<th class="w-10 px-3 py-3 text-center">
							<input
								type="checkbox"
								checked={allSelected}
								use:setIndeterminate={someSelected}
								onchange={toggleSelectAll}
								class="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
								title="เลือกทั้งหมด"
							/>
						</th>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase"
							>{$t('Job No. / Date')}</th
						>
						<th
							class="px-6 py-3 text-left text-xs font-semibold tracking-wider whitespace-nowrap uppercase"
							>{$t('Type / Service')}</th
						>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase"
							>{$t('Customer / Vendor')}</th
						>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase"
							>{$t('Shipment Info')}</th
						>
						<th
							class="px-6 py-3 text-center text-xs font-semibold tracking-wider whitespace-nowrap uppercase"
							>{$t('Status')}</th
						>
						<th
							class="px-6 py-3 text-right text-xs font-semibold tracking-wider whitespace-nowrap uppercase"
							>{$t('Amount')}</th
						>
						<th class="px-6 py-3 text-center text-xs font-semibold tracking-wider uppercase"
							>{$t('Action')}</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#each jobs as job (job.id)}
						<tr class="hover:bg-gray-50 {selectedIds.has(job.id) ? 'bg-blue-50' : ''}">
							<td class="px-3 py-4 text-center align-top">
								<input
									type="checkbox"
									checked={selectedIds.has(job.id)}
									onchange={() => toggleSelect(job.id)}
									class="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
								/>
							</td>
							<td class="px-6 py-4 align-top">
								<a
									href="/freight-forwarder/job-orders/{job.id}"
									class="font-bold text-blue-600 hover:underline"
								>
									{job.job_number || formatJobNumber(job.job_type, job.job_date, job.id)}
								</a>
								<div class="mt-0.5 text-xs text-gray-500">
									{new Date(job.job_date).toLocaleDateString($locale === 'th' ? 'th-TH' : 'en-US')}
								</div>
								{#if job.created_by_name}
									<div
										class="mt-1 flex items-center text-[11px] text-gray-500"
										title={$t('Created By')}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="mr-1 h-3 w-3 text-gray-400"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
											/>
										</svg>
										<span class="max-w-[120px] truncate">{job.created_by_name}</span>
									</div>
								{/if}
							</td>

							<td class="px-6 py-4 align-top">
								<div class="flex flex-col items-start gap-1.5">
									<span class="rounded bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700">
										{job.job_type}
									</span>
									{#if job.service_type}
										<span
											class="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-blue-700 uppercase"
										>
											{job.service_type}
										</span>
									{/if}
								</div>
							</td>

							<td class="px-6 py-4 align-top">
								<div class="mb-2">
									<div class="mb-0.5 text-[10px] font-bold tracking-wider text-blue-500 uppercase">
										{$t('Customer')}
									</div>
									<div class="leading-tight font-medium text-gray-900">
										{job.company_name || job.customer_name || $t('Not specified')}
									</div>
									{#if job.company_name && job.customer_name}
										<div
											class="mt-0.5 max-w-[180px] truncate text-[11px] text-gray-500"
											title="{job.customer_name} {job.customer_phone
												? 'Tel: ' + job.customer_phone
												: ''}"
										>
											{$t('Contact:')}
											{job.customer_name}
											{#if job.customer_phone}
												<span class="block text-gray-400">{$t('Tel:')} {job.customer_phone}</span>
											{/if}
										</div>
									{/if}
								</div>

								{#if job.vendor_id}
									<div class="border-t border-gray-100 pt-2">
										<div
											class="mb-0.5 text-[10px] font-bold tracking-wider text-gray-400 uppercase"
										>
											{$t('Vendor')}
										</div>
										<div class="leading-tight font-medium text-gray-900">
											{job.vendor_company_name || job.vendor_name || $t('Not specified')}
										</div>
										{#if job.vendor_company_name && job.vendor_name}
											<div
												class="mt-0.5 max-w-[180px] truncate text-[11px] text-gray-500"
												title="{job.vendor_name} {job.vendor_phone
													? 'Tel: ' + job.vendor_phone
													: ''}"
											>
												{$t('Contact:')}
												{job.vendor_name}
												{#if job.vendor_phone}
													<span class="block text-gray-400">{$t('Tel:')} {job.vendor_phone}</span>
												{/if}
											</div>
										{/if}
									</div>
								{/if}
							</td>

							<td class="px-6 py-4 align-top">
								<div>
									<span class="text-xs text-gray-400">B/L:</span>
									<span class="font-mono font-bold text-gray-800">{job.bl_number}</span>
								</div>
								<div class="mt-1 text-xs text-gray-500">{job.liner_name || '-'}</div>
							</td>

							<td class="px-6 py-4 text-center align-top">
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap {getStatusClass(
										job.job_status
									)}"
								>
									{$t('Status_' + job.job_status) || job.job_status}
								</span>
							</td>

							<td class="px-6 py-4 text-right align-top whitespace-nowrap">
								<div class="font-mono font-bold text-gray-800">
									{Number(job.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
								</div>
								<div class="mt-0.5 text-[10px] text-gray-500">{job.currency}</div>
							</td>

							<td class="px-4 py-4 text-center align-top">
								<div class="mt-1 flex justify-center gap-2">
									<a
										href="/freight-forwarder/job-orders/{job.id}"
										class="text-gray-400 transition-colors hover:text-blue-600"
										title={$t('View Details')}
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

									<!-- <a
										href="/freight-forwarder/job-orders/generate-pdf?id={job.id}"
										target="_blank"
										rel="noopener noreferrer"
										class="text-gray-400 transition-colors hover:text-green-600"
										title={$t('Print PDF')}
									> -->
									<a
										href="/freight-forwarder/job-orders/generate-pdf?id={job.id}&locale={$locale}"
										target="_blank"
										rel="noopener noreferrer"
										class="text-gray-400 transition-colors hover:text-green-600"
										title={$t('Print PDF')}
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
										href="/freight-forwarder/job-orders/{job.id}/edit"
										class="text-gray-400 transition-colors hover:text-yellow-600"
										title={$t('Edit')}
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
										onclick={() => confirmDelete(job)}
										class="text-gray-400 transition-colors hover:text-red-600"
										title={$t('Delete')}
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
					{#if jobs.length === 0}
						<tr>
							<td colspan="8" class="py-12 text-center text-gray-500">
								<div class="flex flex-col items-center justify-center">
									<svg
										class="mb-3 h-10 w-10 text-gray-300"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									<span>{$t('No Job Orders found or search did not match any data')}</span>
								</div>
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>

		{#if pagination.total > 0}
			<div
				class="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-6"
			>
				<div class="flex flex-1 flex-col items-center justify-between gap-4 sm:flex-row">
					<div class="flex items-center gap-3">
						<span class="text-sm text-gray-700">
							{$t('Showing')}
							<span class="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span>
							{$t('to')}
							<span class="font-medium"
								>{Math.min(currentPage * itemsPerPage, pagination.total)}</span
							>
							{$t('of')} <span class="font-medium">{pagination.total}</span>
							{$t('entries')}
						</span>
						<select
							bind:value={itemsPerPage}
							onchange={onLimitChange}
							class="rounded-md border border-gray-300 bg-white py-1.5 pr-8 pl-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
						>
							<option value={10}>10 / {$t('Page')}</option>
							<option value={30}>30 / {$t('Page')}</option>
							<option value={50}>50 / {$t('Page')}</option>
							<option value={200}>200 / {$t('Page')}</option>
						</select>
					</div>
					<div>
						<nav
							class="isolate inline-flex -space-x-px rounded-md shadow-sm"
							aria-label="Pagination"
						>
							<button
								onclick={prevPage}
								disabled={currentPage === 1}
								class="relative inline-flex items-center rounded-l-md px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-100 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:hover:bg-white"
							>
								{$t('Previous')}
							</button>
							<span
								class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 ring-inset focus:outline-offset-0"
							>
								{$t('Page')}
								{currentPage} / {totalPages}
							</span>
							<button
								onclick={nextPage}
								disabled={currentPage === totalPages || totalPages === 0}
								class="relative inline-flex items-center rounded-r-md px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-100 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:hover:bg-white"
							>
								{$t('Next')}
							</button>
						</nav>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- =============================== -->
<!-- BULK ACTION FLOATING BAR        -->
<!-- =============================== -->
{#if selectedIds.size > 0}
	<div class="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
		<div class="flex items-center gap-3 rounded-2xl border border-blue-200 bg-white px-5 py-3 shadow-2xl ring-1 ring-blue-100">
			<!-- Count badge -->
			<span class="flex items-center gap-1.5 text-sm font-semibold text-blue-800">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
					<path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
					<path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
				</svg>
				เลือกแล้ว {selectedIds.size} รายการ
			</span>

			<div class="h-5 w-px bg-gray-200"></div>

			<!-- Status picker -->
			<select
				bind:value={bulkNewStatus}
				class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
			>
				<option value="">-- เลือก Status ใหม่ --</option>
				<option value="Pending">Pending</option>
				<option value="In Progress">In Progress</option>
				<option value="Completed">Completed</option>
				<option value="Cancelled">Cancelled</option>
			</select>

			<!-- Apply button -->
			<button
				type="button"
				onclick={() => { if (bulkNewStatus) showBulkStatusModal = true; }}
				disabled={!bulkNewStatus}
				class="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
			>
				เปลี่ยน Status
			</button>

			<!-- Clear -->
			<button
				type="button"
				onclick={clearBulkSelection}
				class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100"
				title="ยกเลิกการเลือก"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
				</svg>
			</button>
		</div>
	</div>
{/if}

{#if showDeleteModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity"
	>
		<div
			class="animate-in fade-in zoom-in-95 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl duration-200"
		>
			<div class="p-6">
				<div class="flex items-start gap-4">
					<div
						class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:h-10 sm:w-10"
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
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
					</div>
					<div class="mt-1 text-left sm:mt-0">
						<h3 class="text-lg leading-6 font-bold text-gray-900">{$t('Confirm Delete')}</h3>
						<div class="mt-2">
							<p class="text-sm text-gray-500">
								{$t('Are you sure you want to delete job')}
								<span class="font-bold text-gray-800">{jobToDeleteName}</span>
								?
								<br />{$t('This action')}
								<span class="font-semibold text-red-600">{$t('cannot be undone')}</span>
							</p>
						</div>
					</div>
				</div>
			</div>

			<div class="flex justify-end gap-3 bg-gray-50 px-6 py-4 sm:flex-row">
				<button
					type="button"
					class="mt-3 inline-flex w-full justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 sm:mt-0 sm:w-auto"
					onclick={closeModal}
					disabled={isDeleting}
				>
					{$t('Cancel')}
				</button>

				<form
					method="POST"
					action="?/delete"
					use:enhance={() => {
						isDeleting = true;
						return async ({ update }) => {
							await update();
							closeModal();
						};
					}}
					class="m-0 flex w-full sm:w-auto"
				>
					<input type="hidden" name="id" value={jobToDeleteId} />
					<button
						type="submit"
						class="inline-flex w-full justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-500 disabled:opacity-50 sm:w-auto"
						disabled={isDeleting}
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
							{$t('Deleting...')}
						{:else}
							{$t('Confirm Delete')}
						{/if}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- =============================== -->
<!-- BULK STATUS CONFIRM MODAL       -->
<!-- =============================== -->
{#if showBulkStatusModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
		<div class="animate-in fade-in zoom-in-95 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl duration-200">
			<div class="p-6">
				<div class="flex items-start gap-4">
					<div class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
						<svg class="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
						</svg>
					</div>
					<div class="mt-1">
						<h3 class="text-lg font-bold leading-6 text-gray-900">ยืนยันการเปลี่ยน Status</h3>
						<p class="mt-2 text-sm text-gray-600">
							ต้องการเปลี่ยน Status ของ
							<strong class="text-gray-900">{selectedIds.size} รายการ</strong>
							เป็น
						</p>
						<p class="mt-1">
							<span class="inline-flex items-center rounded-full px-3 py-0.5 text-sm font-semibold {getStatusClass(bulkNewStatus)}">
								{bulkNewStatus}
							</span>
						</p>
						<p class="mt-2 text-xs text-gray-400">การดำเนินการนี้จะอัปเดต {selectedIds.size} Job Orders พร้อมกัน</p>
					</div>
				</div>
			</div>

			<div class="flex justify-end gap-3 bg-gray-50 px-6 py-4">
				<button
					type="button"
					class="inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50"
					onclick={() => (showBulkStatusModal = false)}
					disabled={isBulkUpdating}
				>
					ยกเลิก
				</button>

				<form
					method="POST"
					action="?/bulkUpdateStatus"
					use:enhance={() => {
						isBulkUpdating = true;
						return async ({ update }) => {
							await update();
							clearBulkSelection();
							isBulkUpdating = false;
						};
					}}
					class="m-0"
				>
					{#each [...selectedIds] as id}
						<input type="hidden" name="ids[]" value={id} />
					{/each}
					<input type="hidden" name="status" value={bulkNewStatus} />

					<button
						type="submit"
						disabled={isBulkUpdating}
						class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
					>
						{#if isBulkUpdating}
							<svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							กำลังอัปเดต...
						{:else}
							ยืนยัน เปลี่ยน {selectedIds.size} รายการ
						{/if}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
