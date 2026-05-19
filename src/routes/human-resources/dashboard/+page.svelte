<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { fade, slide } from 'svelte/transition';

	let { data, form } = $props();

	let departmentSummary = $derived(data.departmentSummary || []);
	let recentLogs = $derived(data.recentLogs || []);

	let stats = $derived({
		total: data.statsData.total_plan || 0,
		present: data.statsData.total_scanned || 0,
		late: data.statsData.late || 0,
		absent: data.statsData.absent || 0
	});

	let isSubmitting = $state(false);

	let scanners = $derived(data.scanners || []);
	let scannerStatus = $state<Record<string, string>>({});

	async function checkScannerStatus(ip: string) {
		scannerStatus[ip] = 'checking...';
		try {
			const res = await fetch(`/api/scanner-status?ip=${ip}`);
			const result = await res.json();
			scannerStatus[ip] = result.online ? 'Online' : 'Offline';
		} catch (e) {
			scannerStatus[ip] = 'Offline';
		}
	}
	$effect(() => {
		if (scanners.length > 0) {
			scanners.forEach((s: any) => {
				if (s.ip_address && !scannerStatus[s.ip_address]) {
					checkScannerStatus(s.ip_address);
				}
			});
		}
	});

	let sectionOptions = $derived([
		{ value: 'All', label: $t('All') },
		...(data.sections || []).map((s: string) => ({ value: s, label: s }))
	]);

	let groupOptions = $derived([
		{ value: 'All', label: $t('All') },
		...(data.groups || []).map((g: string) => ({ value: g, label: g }))
	]);

	let selectedSection = $state(
		data.sectionFilter && data.sectionFilter !== 'All'
			? { value: data.sectionFilter, label: data.sectionFilter }
			: { value: 'All', label: `-- ${$t('All')} (All) --` }
	);

	let selectedGroup = $state(
		data.groupFilter && data.groupFilter !== 'All'
			? { value: data.groupFilter, label: data.groupFilter }
			: { value: 'All', label: `-- ${$t('All')} (All) --` }
	);

	let deptCurrentPage = $state(1);
	let deptPerPage = 6;
	let deptTotalPages = $derived(Math.ceil(departmentSummary.length / deptPerPage) || 1);

	let paginatedDepartments = $derived(
		departmentSummary.slice((deptCurrentPage - 1) * deptPerPage, deptCurrentPage * deptPerPage)
	);

	let logCurrentPage = $state(1);
	let logsPerPage = $state(10);

	let totalLogPages = $derived(Math.ceil(recentLogs.length / logsPerPage) || 1);
	let paginatedLogs = $derived(
		recentLogs.slice((logCurrentPage - 1) * logsPerPage, logCurrentPage * logsPerPage)
	);

	let showSyncModal = $state(false);
	let syncStartDate = $state(data.displayDate || new Date().toISOString().split('T')[0]);
	let syncEndDate = $state(data.displayDate || new Date().toISOString().split('T')[0]);

	let showUnmatchedModal = $state(false);
	let unmatchedScans = $derived(data.unmatchedScans || []);

	// local copy ของ unmatched list — ลบออกทีละ row เมื่อ link สำเร็จโดยไม่ต้อง reload
	let localUnmatched = $state<any[]>([]);
	$effect(() => {
		if (showUnmatchedModal) localUnmatched = [...unmatchedScans];
	});

	let linkSelections = $state<Record<string, string>>({});
	let linkLoading = $state<Record<string, boolean>>({});
	let linkErrors = $state<Record<string, string>>({});

	// ค้นหาใน unmatched list (กรองด้วย raw_emp_id)
	let unmatchedSearch = $state('');
	let filteredUnmatched = $derived(
		unmatchedSearch.trim()
			? localUnmatched.filter((r: any) =>
					String(r.raw_emp_id).toLowerCase().includes(unmatchedSearch.trim().toLowerCase())
				)
			: localUnmatched
	);

	// ค้นหาพนักงานต่อแถว (กรองด้วย emp_id / ชื่อ / section)
	let empSearch = $state<Record<string, string>>({});
	function getFilteredEmps(rawEmpId: string): any[] {
		const q = (empSearch[rawEmpId] || '').toLowerCase();
		if (!q) return employeeList as any[];
		return (employeeList as any[]).filter(
			(e: any) =>
				String(e.emp_id).toLowerCase().includes(q) ||
				(e.emp_name || '').toLowerCase().includes(q) ||
				(e.section || '').toLowerCase().includes(q)
		);
	}

	// สร้าง optgroup จาก employeeList จัดกลุ่มตาม section
	let employeeList = $derived(data.employeeList || []);
	let empBySection = $derived<Record<string, any[]>>(
		employeeList.reduce(
			(acc: Record<string, any[]>, emp: any) => {
				const s = emp.section || '-';
				if (!acc[s]) acc[s] = [];
				acc[s].push(emp);
				return acc;
			},
			{} as Record<string, any[]>
		)
	);

	async function doLink(rawEmpId: string) {
		const empId = linkSelections[rawEmpId];
		if (!empId) return;
		linkLoading[rawEmpId] = true;
		linkErrors[rawEmpId] = '';
		try {
			const fd = new FormData();
			fd.set('raw_emp_id', rawEmpId);
			fd.set('emp_id', empId);
			const res = await fetch('?/linkEmployee', { method: 'POST', body: fd });
			const result = await res.json();
			if (result.type === 'success') {
				localUnmatched = localUnmatched.filter((r: any) => r.raw_emp_id !== rawEmpId);
			} else {
				linkErrors[rawEmpId] = result.data?.message || 'เกิดข้อผิดพลาด';
			}
		} catch {
			linkErrors[rawEmpId] = 'Network error';
		} finally {
			linkLoading[rawEmpId] = false;
		}
	}
</script>

<svelte:head>
	<title>{$t('HR Dashboard')}</title>
</svelte:head>

{#if isSubmitting}
	<div
		class="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm transition-all duration-300"
	>
		<div
			class="h-14 w-14 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"
		></div>
		<h3 class="mt-5 text-xl font-bold text-gray-800">{$t('กำลังประมวลผลข้อมูล...')}</h3>
		<p class="mt-2 text-sm font-medium text-gray-500">
			{$t('กรุณารอสักครู่ ห้ามปิดหรือรีเฟรชหน้าจอนี้')}
		</p>
	</div>
{/if}

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<h1 class="text-2xl font-bold text-gray-800">{$t('HR Dashboard')}</h1>

	<div class="flex flex-wrap items-center gap-3">
		{#if form?.message}
			<span
				class="text-sm font-semibold {form.success
					? 'text-green-600'
					: 'text-red-600'} rounded border border-gray-100 bg-white px-3 py-1 shadow-sm"
			>
				{form.message}
			</span>
		{/if}

		<a
			href="/human-resources/dashboard/export"
			data-sveltekit-reload
			class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
		>
			<span class="material-symbols-outlined text-[18px]">download</span>
			{$t('Export')}
		</a>

		<form
			method="POST"
			action="?/importExcel"
			enctype="multipart/form-data"
			use:enhance={() => {
				isSubmitting = true;

				return async ({ update }) => {
					await update();
					isSubmitting = false;
				};
			}}
			class="flex"
		>
			<label
				class="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 {isSubmitting
					? 'cursor-not-allowed opacity-50'
					: ''}"
			>
				<span class="material-symbols-outlined text-[18px]">upload</span>
				{$t('Import')}
				<input
					type="file"
					name="file"
					accept=".xlsx, .xls"
					class="hidden"
					disabled={isSubmitting}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				/>
			</label>
		</form>

		<form
			method="POST"
			action="?/syncZKTeco"
			use:enhance={() => {
				isSubmitting = true;

				return async ({ update }) => {
					await update();
					isSubmitting = false;
				};
			}}
			class="flex"
		>
			<button
				type="button"
				onclick={() => (showSyncModal = true)}
				disabled={isSubmitting}
				class="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
			>
				<span class="material-symbols-outlined text-[18px]">cell_wifi</span>
				{$t('ซิงค์ข้อมูล(ZKTeco)')}
			</button>
		</form>
	</div>
</div>

<div class="relative z-50 mb-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
	<form
		method="GET"
		class="flex flex-wrap items-end gap-4"
		onsubmit={() => {
			deptCurrentPage = 1;

			logCurrentPage = 1;
		}}
	>
		<div class="w-40">
			<label for="dateFilter" class="mb-1 block text-sm font-medium text-gray-700"
				>{$t('Date')}</label
			>
			<input
				type="date"
				id="dateFilter"
				name="date"
				value={data.displayDate}
				class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
			/>
		</div>

		<div class="w-[200px]">
			<div class="mb-1 block text-sm font-medium text-gray-700">{$t('Section')}</div>
			<Select
				items={sectionOptions}
				bind:value={selectedSection}
				container={browser ? document.body : null}
				class="svelte-select-custom"
			/>
			<input type="hidden" name="section" value={selectedSection?.value || 'All'} />
		</div>

		<div class="w-[200px]">
			<div class="mb-1 block text-sm font-medium text-gray-700">{$t('Group')}</div>
			<Select
				items={groupOptions}
				bind:value={selectedGroup}
				container={browser ? document.body : null}
				class="svelte-select-custom"
			/>
			<input type="hidden" name="group" value={selectedGroup?.value || 'All'} />
		</div>

		<div class="w-36">
			<label for="statusFilter" class="mb-1 block text-sm font-medium text-gray-700"
				>{$t('Status')}</label
			>
			<select
				id="statusFilter"
				name="status"
				value={data.statusFilter}
				class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
			>
				<option value="All">{$t('ทั้งหมด')}</option>
				<option value="Present">{$t('มาทำงาน')}</option>
				<option value="Late">{$t('มาสาย')}</option>
				<option value="Absent">{$t('ขาดงาน')}</option>
			</select>
		</div>

		<div class="min-w-[200px] flex-1">
			<label for="searchInput" class="mb-1 block text-sm font-medium text-gray-700"
				>{$t('Search for employee ID/name')}</label
			>
			<input
				id="searchInput"
				type="text"
				name="search"
				value={data.searchQuery}
				placeholder={$t('พิมพ์คำค้นหา...')}
				class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
			/>
		</div>
		<button
			type="submit"
			class="rounded-lg bg-gray-800 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
			><span class="material-symbols-outlined mr-1 align-middle text-[18px]">search</span>
			{$t('Search')}</button
		>
	</form>
</div>

<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
	<div class="rounded-lg border border-gray-100 bg-white p-6 shadow-sm">
		<p class="text-sm font-medium text-gray-500">{$t('All Employees (Total Plan)')}</p>
		<p class="mt-2 text-3xl font-bold text-gray-900">{stats.total}</p>
	</div>
	<div
		class="rounded-lg border border-l-4 border-gray-100 border-l-green-500 bg-white p-6 shadow-sm"
	>
		<div class="flex items-start justify-between">
			<p class="text-sm font-medium text-gray-500">{$t('Work Today')}</p>
			{#if unmatchedScans.length > 0}
				<button
					onclick={() => (showUnmatchedModal = true)}
					class="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-400/30 transition-colors hover:bg-amber-200"
					title="ZKTeco scans ที่ไม่พบในระบบ"
				>
					<span class="material-symbols-outlined text-[14px]">warning</span>
					{unmatchedScans.length}
					{$t('unmatched')}
				</button>
			{/if}
		</div>
		<p class="mt-2 text-3xl font-bold text-green-600">{stats.present}</p>
	</div>
	<div
		class="rounded-lg border border-l-4 border-gray-100 border-l-orange-500 bg-white p-6 shadow-sm"
	>
		<p class="text-sm font-medium text-gray-500">{$t('Late')}</p>
		<p class="mt-2 text-3xl font-bold text-orange-500">{stats.late}</p>
	</div>
	<div class="rounded-lg border border-l-4 border-gray-100 border-l-red-500 bg-white p-6 shadow-sm">
		<p class="text-sm font-medium text-gray-500">{$t('Absent/Leave')}</p>
		<p class="mt-2 text-3xl font-bold text-red-600">{stats.absent}</p>
	</div>
</div>

<div class="mb-6">
	<h2 class="mb-3 text-lg font-semibold text-gray-800">{$t('สถานะเครื่องสแกนนิ้ว')} (Scanners)</h2>
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each scanners as scanner}
			<div
				class="flex flex-col gap-2 rounded-lg border border-gray-100 bg-white p-4 shadow-sm transition-all hover:shadow-md"
			>
				<div class="flex items-start justify-between">
					<div>
						<p class="text-sm font-bold text-gray-800">{scanner.device_name || 'Scanner'}</p>
						<p class="font-mono text-xs text-gray-500">{scanner.ip_address}</p>
					</div>
					{#if scannerStatus[scanner.ip_address] === 'checking...'}
						<span
							class="animate-pulse rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500"
							>Checking...</span
						>
					{:else if scannerStatus[scanner.ip_address] === 'Online'}
						<span
							class="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-600 ring-1 ring-green-500/20"
						>
							<div class="h-1.5 w-1.5 rounded-full bg-green-500"></div>
							Online
						</span>
					{:else}
						<span
							class="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600 ring-1 ring-red-500/20"
						>
							<div class="h-1.5 w-1.5 rounded-full bg-red-500"></div>
							Offline
						</span>
					{/if}
				</div>
				<div
					class="mt-2 flex items-center justify-between border-t border-gray-50 pt-2 text-xs text-gray-500"
				>
					<span>{$t('Sync ล่าสุด')}:</span>
					<span class="font-medium text-gray-700">
						{#if scanner.last_sync}
							{@const d = new Date(scanner.last_sync)}
							{String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(
								2,
								'0'
							)}/{d.getFullYear()}
							<span class="text-blue-600"
								>{String(d.getHours()).padStart(2, '0')}:{String(d.getMinutes()).padStart(
									2,
									'0'
								)}</span
							>
						{:else}
							<span class="text-gray-300">-</span>
						{/if}
					</span>
				</div>
			</div>
		{/each}
		{#if scanners.length === 0}
			<div
				class="col-span-full rounded-lg border border-gray-100 bg-white py-6 text-center text-sm text-gray-500"
			>
				{$t('ไม่พบข้อมูลเครื่องสแกนในระบบ')}
			</div>
		{/if}
	</div>
</div>

<div class="grid grid-cols-1 gap-6 xl:grid-cols-4">
	<div
		class="flex flex-col overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm xl:col-span-3"
	>
		<div class="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-4">
			<h2 class="text-lg font-semibold text-gray-800">
				{$t('รายการลงเวลาประจำวันที่')}
				{new Date(data.displayDate).toLocaleDateString('th-TH', {
					day: 'numeric',
					month: 'short',
					year: 'numeric'
				})}
				<span class="ml-2 text-sm font-normal text-gray-500"
					>({recentLogs.length} {$t('รายการ')})</span
				>
			</h2>
		</div>
		<div class="flex-1 overflow-x-auto">
			<table class="w-full min-w-[800px] text-left text-sm text-gray-600">
				<thead
					class="sticky top-0 border-b border-gray-100 bg-white text-xs text-gray-700 uppercase"
				>
					<tr>
						<th class="px-4 py-3 whitespace-nowrap">{$t('ID')}</th>
						<th class="px-4 py-3 whitespace-nowrap">{$t('Name')}</th>
						<th class="px-4 py-3 whitespace-nowrap">{$t('Dis.')}</th>
						<th class="px-4 py-3 whitespace-nowrap">{$t('Section')}</th>
						<th class="px-4 py-3 whitespace-nowrap">{$t('Group')}</th>
						<th class="px-4 py-3 whitespace-nowrap">{$t('Position')}</th>
						<th class="px-4 py-3 whitespace-nowrap">{$t('Time In')}</th>
						<th class="px-4 py-3 whitespace-nowrap">{$t('Time Out')}</th>
						<th class="px-4 py-3 whitespace-nowrap">{$t('Status')}</th>
					</tr>
				</thead>
				<tbody>
					{#each paginatedLogs as log}
						<tr class="border-b border-gray-50 transition-colors hover:bg-gray-50">
							<td class="px-4 py-3 font-medium text-gray-900">{log.emp_id}</td>
							<td class="px-4 py-3 whitespace-nowrap">{log.name}</td>
							<td class="px-4 py-3 whitespace-nowrap">{log.dis}</td>
							<td class="px-4 py-3 whitespace-nowrap">{log.section}</td>
							<td class="px-4 py-3 whitespace-nowrap">{log.emp_group}</td>
							<td class="px-4 py-3 whitespace-nowrap">{log.position}</td>
							<td class="px-4 py-3 font-mono font-bold whitespace-nowrap text-green-600"
								>{log.time}</td
							>
							<td
								class="px-4 py-3 font-mono font-bold whitespace-nowrap {log.time_out
									? 'text-purple-600'
									: 'text-gray-400'}">{log.time_out || '-'}</td
							>
							<td class="px-4 py-3">
								<span
									class="rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap {log.status ===
										'Late' || log.is_late == 1
										? 'bg-orange-100 text-orange-700'
										: log.status === 'Present'
											? 'bg-green-100 text-green-700'
											: log.status === 'Pending'
												? 'bg-blue-100 text-blue-700'
												: 'bg-red-100 text-red-700'}"
								>
									{log.status === 'Late' || log.is_late == 1
										? $t('สาย')
										: log.status === 'Present'
											? $t('ปกติ')
											: log.status === 'Pending'
												? $t('Night shift')
												: $t('ขาด')}
								</span>
							</td>
						</tr>
					{/each}
					{#if paginatedLogs.length === 0}
						<tr
							><td colspan="9" class="bg-gray-50/50 px-4 py-8 text-center text-gray-500"
								>{$t('ไม่มีข้อมูลตามเงื่อนไขที่เลือก')}</td
							></tr
						>
					{/if}
				</tbody>
			</table>
		</div>

		{#if recentLogs.length > 0}
			<div
				class="mt-auto flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3 sm:px-6"
			>
				<div class="flex flex-col gap-4 sm:flex-1 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex flex-wrap items-center gap-4">
						<div class="flex items-center gap-2 text-sm text-gray-700">
							<span>{$t('Showing')}:</span>
							<select
								bind:value={logsPerPage}
								onchange={() => (logCurrentPage = 1)}
								class="w-20 cursor-pointer rounded border border-gray-300 bg-white py-1 pr-8 pl-3 text-sm font-medium focus:border-blue-500 focus:outline-none"
							>
								<option value={10}>10</option>
								<option value={20}>20</option>
								<option value={50}>50</option>
								<option value={100}>100</option>
							</select>
						</div>
						<p class="hidden text-sm text-gray-700 md:block">
							{$t('Show')} <span class="font-medium">{(logCurrentPage - 1) * logsPerPage + 1}</span>
							{$t('To')}
							<span class="font-medium"
								>{Math.min(logCurrentPage * logsPerPage, recentLogs.length)}</span
							>
							{$t('From total')}
							<span class="font-medium">{recentLogs.length}</span>
							{$t('Item')}
						</p>
					</div>
					<div>
						<nav
							class="isolate inline-flex -space-x-px rounded-md shadow-sm"
							aria-label="Pagination"
						>
							<button
								aria-label={$t('ก่อนหน้า')}
								onclick={() => logCurrentPage--}
								disabled={logCurrentPage === 1}
								class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50"
							>
								<span class="material-symbols-outlined text-[18px]">chevron_left</span>
							</button>
							<span
								class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 ring-inset"
							>
								{logCurrentPage} / {totalLogPages}
							</span>
							<button
								aria-label={$t('ถัดไป')}
								onclick={() => logCurrentPage++}
								disabled={logCurrentPage === totalLogPages}
								class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50"
							>
								<span class="material-symbols-outlined text-[18px]">chevron_right</span>
							</button>
						</nav>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<div class="flex flex-col rounded-lg border border-gray-100 bg-white shadow-sm xl:col-span-1">
		<div class="border-b border-gray-100 bg-gray-50 p-4">
			<h2 class="text-lg font-semibold text-gray-800">{$t('Summary of totals by dep.')}</h2>
		</div>

		<div class="flex flex-1 flex-col gap-6 p-5">
			{#each paginatedDepartments as dep}
				<div>
					<div class="mb-1.5 flex items-end justify-between">
						<div class="flex flex-col">
							<span class="truncate font-bold text-gray-800" title={dep.section}>{dep.section}</span
							>
							<span class="text-xs font-medium text-gray-500">
								{dep.emp_group !== '-' ? dep.emp_group : $t('ไม่มีกลุ่มงาน')}
							</span>
						</div>
						<span
							class="text-lg font-black {dep.percent_att >= 100
								? 'text-green-600'
								: dep.percent_att >= 80
									? 'text-blue-600'
									: 'text-orange-500'}"
						>
							{dep.percent_att}%
						</span>
					</div>

					<div class="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
						<div
							class="h-full rounded-full transition-all duration-700 {dep.percent_att >= 100
								? 'bg-green-500'
								: dep.percent_att >= 80
									? 'bg-blue-500'
									: 'bg-orange-500'}"
							style="width: {dep.percent_att}%"
						></div>
					</div>

					<div class="mt-1.5 flex justify-between text-xs">
						<span class="font-medium text-gray-500"
							>{$t('มาทำงาน')}:
							<strong class="text-gray-800">{dep.attendance} / {dep.active_emp}</strong></span
						>
						{#if dep.active_emp > dep.attendance}
							<span class="font-medium text-red-500"
								>{$t('ขาดอีก')} {dep.active_emp - dep.attendance} {$t('คน')}</span
							>
						{:else if dep.active_emp === 0}
							<span class="font-medium text-gray-400">{$t('ไม่มีข้อมูล')}</span>
						{:else}
							<span class="font-medium text-green-600">{$t('100%')}</span>
						{/if}
					</div>
				</div>
			{/each}
			{#if departmentSummary.length === 0}
				<div class="py-10 text-center text-sm text-gray-500">
					{$t('ไม่พบข้อมูลของแผนกที่เลือก')}
				</div>
			{/if}

			{#if deptTotalPages > 1}
				<div class="mt-auto flex items-center justify-between border-t border-gray-100 pt-4">
					<button
						class="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-40"
						disabled={deptCurrentPage === 1}
						onclick={() => deptCurrentPage--}>{$t('Previous')}</button
					>
					<span class="text-xs font-medium text-gray-500">{deptCurrentPage} / {deptTotalPages}</span
					>
					<button
						class="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-40"
						disabled={deptCurrentPage === deptTotalPages}
						onclick={() => deptCurrentPage++}>{$t('Next')}</button
					>
				</div>
			{/if}
		</div>
	</div>
</div>

{#if showSyncModal}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div
			transition:slide={{ duration: 200 }}
			class="w-full max-w-md rounded-xl bg-white shadow-2xl"
		>
			<div class="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-6 py-4">
				<span class="material-symbols-outlined text-[24px] text-blue-600">cloud_sync</span>
				<h2 class="text-lg font-bold text-gray-900">{$t('กำหนดช่วงเวลาดึงข้อมูล')}</h2>
			</div>

			<form
				method="POST"
				action="?/syncZKTeco"
				use:enhance={() => {
					isSubmitting = true;
					showSyncModal = false; // ปิด Modal ทันทีที่กดตกลง
					return async ({ update }) => {
						await update();
						isSubmitting = false;
					};
				}}
			>
				<div class="p-6">
					<p class="mb-4 text-sm text-gray-600">
						{$t(
							'ระบบจะทำการเชื่อมต่อเครื่องสแกนเพื่อกวาดข้อมูลเฉพาะในช่วงวันที่คุณระบุเท่านั้น (ยิ่งเลือกหลายวัน ยิ่งใช้เวลาประมวลผลนานขึ้น)'
						)}
					</p>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="start_date" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('ตั้งแต่วันที่')}</label
							>
							<input
								type="date"
								name="start_date"
								bind:value={syncStartDate}
								required
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>
						<div>
							<label for="end_date" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('ถึงวันที่')}</label
							>
							<input
								type="date"
								name="end_date"
								bind:value={syncEndDate}
								required
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>
					</div>
				</div>

				<div class="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
					<button
						type="button"
						onclick={() => (showSyncModal = false)}
						class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
					>
						{$t('Cancel')}
					</button>
					<button
						type="submit"
						class="rounded-md bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
					>
						{$t('เริ่มดึงข้อมูลสแกนนิ้ว')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if showUnmatchedModal}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
	>
		<div
			transition:slide={{ duration: 200 }}
			class="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl"
		>
			<!-- Header -->
			<div
				class="flex flex-shrink-0 items-center justify-between border-b border-amber-100 bg-amber-50 px-6 py-4"
			>
				<div class="flex items-center gap-3">
					<span class="material-symbols-outlined text-[24px] text-amber-600">link_off</span>
					<div>
						<h2 class="text-base font-bold text-gray-900">ZKTeco Unmatched Scans</h2>
						<p class="text-xs text-gray-500">
							{new Date(data.displayDate).toLocaleDateString('th-TH', {
								day: 'numeric',
								month: 'short',
								year: 'numeric'
							})}
							— เหลือ <strong class="text-amber-700">{localUnmatched.length}</strong> รายการที่ยังไม่
							match
						</p>
					</div>
				</div>
				<button
					onclick={() => (showUnmatchedModal = false)}
					class="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
					aria-label="Close"
				>
					<span class="material-symbols-outlined text-[20px]">close</span>
				</button>
			</div>

			<!-- Info banner -->
			<div
				class="flex-shrink-0 border-b border-amber-100 bg-amber-50/50 px-6 py-2.5 text-xs text-amber-800"
			>
				<span class="material-symbols-outlined mr-1 align-middle text-[14px]">info</span>
				เลือกพนักงานในระบบที่ตรงกับ ZKTeco ID แล้วกด <strong>Link</strong> เพื่อผูก
				<code class="font-mono">raw_id</code> — ข้อมูลจะถูกนับใน Work Today หลัง Sync ครั้งถัดไป
			</div>

			<!-- Search bar (กรอง unmatched list) -->
			<div class="flex-shrink-0 border-b border-gray-100 px-5 py-2.5">
				<div class="relative">
					<span
						class="material-symbols-outlined absolute top-1/2 left-2.5 -translate-y-1/2 text-[16px] text-gray-400"
						>search</span
					>
					<input
						type="text"
						bind:value={unmatchedSearch}
						placeholder="ค้นหา ZKTeco ID..."
						class="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pr-4 pl-8 text-sm focus:border-blue-400 focus:bg-white focus:outline-none"
					/>
					{#if unmatchedSearch}
						<button
							onclick={() => (unmatchedSearch = '')}
							class="absolute top-1/2 right-2.5 -translate-y-1/2 text-gray-400 hover:text-gray-600"
							aria-label="Clear"
						>
							<span class="material-symbols-outlined text-[16px]">close</span>
						</button>
					{/if}
				</div>
			</div>

			<!-- Table -->
			<div class="flex-1 overflow-y-auto">
				{#if localUnmatched.length === 0}
					<div class="flex flex-col items-center justify-center gap-2 py-16 text-sm text-gray-500">
						<span class="material-symbols-outlined text-[40px] text-green-400">check_circle</span>
						<p class="font-medium text-green-600">ทุก ID ถูก match เรียบร้อยแล้ว</p>
					</div>
				{:else}
					<table class="w-full text-left text-sm">
						<thead
							class="sticky top-0 border-b border-gray-100 bg-white text-xs font-semibold text-gray-500 uppercase"
						>
							<tr>
								<th class="px-4 py-3 whitespace-nowrap">ZKTeco ID</th>
								<th class="px-4 py-3 text-center whitespace-nowrap">สแกน</th>
								<th class="px-4 py-3 text-center whitespace-nowrap">เข้า</th>
								<th class="px-4 py-3 text-center whitespace-nowrap">ออก</th>
								<th class="px-4 py-3 whitespace-nowrap">เชื่อมกับพนักงาน</th>
								<th class="px-4 py-3 whitespace-nowrap"></th>
							</tr>
						</thead>
						<tbody>
							{#if filteredUnmatched.length === 0 && unmatchedSearch}
								<tr>
									<td colspan="6" class="py-8 text-center text-sm text-gray-400">
										ไม่พบ ZKTeco ID ที่ตรงกับ "<strong>{unmatchedSearch}</strong>"
									</td>
								</tr>
							{/if}
							{#each filteredUnmatched as row (row.raw_emp_id)}
								<tr class="border-b border-gray-50 hover:bg-gray-50/80">
									<!-- ZKTeco ID -->
									<td class="px-4 py-2.5">
										<span class="font-mono font-semibold text-gray-800">{row.raw_emp_id}</span>
									</td>
									<!-- scan count -->
									<td class="px-4 py-2.5 text-center">
										<span
											class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700"
											>{row.scan_count}</span
										>
									</td>
									<!-- first scan -->
									<td class="px-4 py-2.5 text-center font-mono text-xs text-green-700"
										>{row.first_scan}</td
									>
									<!-- last scan -->
									<td class="px-4 py-2.5 text-center font-mono text-xs text-purple-700"
										>{row.last_scan}</td
									>
									<!-- Employee selector with search -->
									<td class="px-4 py-2">
										<div class="flex flex-col gap-1">
											<div class="relative">
												<span
													class="material-symbols-outlined absolute top-1/2 left-2 -translate-y-1/2 text-[13px] text-gray-400"
													>person_search</span
												>
												<input
													type="text"
													placeholder="ค้นหาชื่อ / รหัส / แผนก..."
													bind:value={empSearch[row.raw_emp_id]}
													class="w-full rounded border border-gray-200 bg-gray-50 py-1 pr-2 pl-6 text-xs focus:border-blue-400 focus:bg-white focus:outline-none"
												/>
											</div>
											<select
												bind:value={linkSelections[row.raw_emp_id]}
												class="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
											>
												<option value=""
													>— เลือกพนักงาน ({getFilteredEmps(row.raw_emp_id).length} คน) —</option
												>
												{#each getFilteredEmps(row.raw_emp_id) as emp}
													<option value={emp.emp_id}>
														[{emp.emp_id}] {emp.emp_name} · {emp.section}{emp.raw_id ? ' ✓' : ''}
													</option>
												{/each}
											</select>
										</div>
										{#if linkErrors[row.raw_emp_id]}
											<p class="mt-1 text-[10px] text-red-600">{linkErrors[row.raw_emp_id]}</p>
										{/if}
									</td>
									<!-- Link button -->
									<td class="px-4 py-2 whitespace-nowrap">
										<button
											onclick={() => doLink(row.raw_emp_id)}
											disabled={!linkSelections[row.raw_emp_id] || linkLoading[row.raw_emp_id]}
											class="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
										>
											{#if linkLoading[row.raw_emp_id]}
												<span
													class="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"
												></span>
											{:else}
												<span class="material-symbols-outlined text-[14px]">link</span>
											{/if}
											Link
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>

			<!-- Footer -->
			<div
				class="flex flex-shrink-0 items-center justify-between border-t border-gray-100 bg-gray-50 px-6 py-3"
			>
				<p class="text-xs text-gray-500">
					พนักงานที่มี <strong>✓</strong> หลังชื่อ = มี raw_id แล้ว (จะถูกเขียนทับ)
				</p>
				<button
					onclick={() => (showUnmatchedModal = false)}
					class="rounded-md bg-gray-800 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-700"
				>
					{$t('Close')}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(div.svelte-select) {
		border-color: #d1d5db !important;
		border-radius: 0.5rem !important;
		min-height: 38px !important;
		background-color: white !important;
		font-size: 0.875rem !important;
	}
</style>
