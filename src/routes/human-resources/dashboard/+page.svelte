<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	let { data, form } = $props();

	let departmentSummary = $derived(data.departmentSummary || []);
	let recentLogs = $derived(data.recentLogs || []);

	let stats = $derived({
		total: data.statsData.total_scanned || 0,
		present: data.statsData.on_time || 0,
		late: data.statsData.late || 0,
		absent: data.statsData.absent || 0
	});

	let isSubmitting = $state(false);

	let sectionOptions = $derived([
		{ value: 'All', label: '-- All --' },
		...(data.sections || []).map((s: string) => ({ value: s, label: s }))
	]);
	let groupOptions = $derived([
		{ value: 'All', label: '-- All --' },
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
			action="?/importScannerLog"
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
				class="flex cursor-pointer items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-100 {isSubmitting
					? 'cursor-not-allowed opacity-50'
					: ''}"
			>
				<span class="material-symbols-outlined text-[18px]">fingerprint</span>
				{$t('ดึงข้อมูลสแกนนิ้ว (CSV)')}
				<input
					type="file"
					name="file"
					accept=".csv, .txt"
					class="hidden"
					disabled={isSubmitting}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				/>
			</label>
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
		<p class="text-sm font-medium text-gray-500">{$t('Work Today')}</p>
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
									class="rounded-full px-2.5 py-1 text-xs font-semibold {log.status === 'Present'
										? 'bg-green-100 text-green-700'
										: log.status === 'Late'
											? 'bg-orange-100 text-orange-700'
											: 'bg-red-100 text-red-700'}"
								>
									{log.status === 'Present' ? 'ปกติ' : log.status === 'Late' ? 'สาย' : 'ขาด'}
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
							<span>{$t('แสดงหน้าละ')}:</span>
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
							{$t('แสดง')} <span class="font-medium">{(logCurrentPage - 1) * logsPerPage + 1}</span>
							{$t('ถึง')}
							<span class="font-medium"
								>{Math.min(logCurrentPage * logsPerPage, recentLogs.length)}</span
							>
							{$t('จากทั้งหมด')}
							<span class="font-medium">{recentLogs.length}</span>
							{$t('รายการ')}
						</p>
					</div>
					<div>
						<nav
							class="isolate inline-flex -space-x-px rounded-md shadow-sm"
							aria-label="Pagination"
						>
							<button
								aria-label="ก่อนหน้า"
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
								aria-label="ถัดไป"
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

<style>
	:global(div.svelte-select) {
		border-color: #d1d5db !important;
		border-radius: 0.5rem !important;
		min-height: 38px !important;
		background-color: white !important;
		font-size: 0.875rem !important;
	}
</style>
