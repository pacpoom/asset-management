<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	let { data, form }: { data: any; form: any } = $props();

	let logs = $derived(data.logs || []);
	let stats = $derived(data.stats || { total_days: 0, total_late_mins: 0, total_ot_hours: 0 });

	let months = $derived([
		{ value: '01', label: $t('มกราคม') },
		{ value: '02', label: $t('กุมภาพันธ์') },
		{ value: '03', label: $t('มีนาคม') },
		{ value: '04', label: $t('เมษายน') },
		{ value: '05', label: $t('พฤษภาคม') },
		{ value: '06', label: $t('มิถุนายน') },
		{ value: '07', label: $t('กรกฎาคม') },
		{ value: '08', label: $t('สิงหาคม') },
		{ value: '09', label: $t('กันยายน') },
		{ value: '10', label: $t('ตุลาคม') },
		{ value: '11', label: $t('พฤศจิกายน') },
		{ value: '12', label: $t('ธันวาคม') }
	]);

	let empOptions = $derived([
		{ value: 'All', label: `-- ${$t('พนักงานทั้งหมด')} --` },
		...(data.employees || []).map((e: any) => ({
			value: e.emp_id,
			label: `${e.emp_id} : ${e.emp_name}`
		}))
	]);

	let initialEmpLabel = `-- ${$t('พนักงานทั้งหมด')} --`;
	if (data.empFilter && data.empFilter !== 'All') {
		const found = (data.employees || []).find((e: any) => e.emp_id === data.empFilter);
		if (found) {
			initialEmpLabel = `${found.emp_id} : ${found.emp_name}`;
		}
	}

	let selectedEmp = $state({
		value: data.empFilter || 'All',
		label: initialEmpLabel
	});

	let currentPage = $state(1);
	let itemsPerPage = $state(20);
	let totalPages = $derived(Math.ceil(logs.length / itemsPerPage) || 1);

	let paginatedLogs = $derived(
		logs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
	);
</script>

<svelte:head>
	<title>{$t('Attendance Records')}</title>
</svelte:head>

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<h1 class="text-2xl font-bold text-gray-800">{$t('ประวัติการลงเวลา (Attendance)')}</h1>

	<div class="flex flex-wrap items-center gap-3">
		{#if form?.message}
			<span class="text-sm font-semibold {form.success ? 'text-green-600' : 'text-red-600'}">
				{form.message}
			</span>
		{/if}

		<a
			href="/human-resources/attendance/export?month={data.selectedMonth}&year={data.selectedYear}&search={data.searchQuery}"
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
			use:enhance
			class="flex"
		>
			<label
				class="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
			>
				<span class="material-symbols-outlined text-[18px]">upload</span>
				{$t('Import')}
				<input
					type="file"
					name="file"
					accept=".xlsx, .xls"
					class="hidden"
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				/>
			</label>
		</form>
	</div>
</div>

<div class="mb-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
	<form method="GET" class="flex flex-wrap items-end gap-4">
		<div>
			<label for="monthSelect" class="mb-1 block text-sm font-medium text-gray-700"
				>{$t('เดือน')}</label
			>
			<select
				id="monthSelect"
				name="month"
				class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
			>
				{#each months as m}
					<option value={m.value} selected={data.selectedMonth === m.value}>{m.label}</option>
				{/each}
			</select>
		</div>
		<div>
			<label for="yearInput" class="mb-1 block text-sm font-medium text-gray-700"
				>{$t('ปี (ค.ศ.)')}</label
			>
			<input
				id="yearInput"
				type="number"
				name="year"
				value={data.selectedYear}
				class="w-24 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
			/>
		</div>

		<div class="z-50 min-w-[250px] flex-1 sm:flex-none">
			<div class="mb-1 block text-sm font-medium text-gray-700">{$t('เลือกพนักงาน')}</div>
			<Select
				items={empOptions}
				bind:value={selectedEmp}
				placeholder={$t('พิมพ์ค้นหา รหัส หรือ ชื่อพนักงาน...')}
				container={browser ? document.body : null}
				class="svelte-select-custom"
			/>
			<input type="hidden" name="emp_id" value={selectedEmp?.value || 'All'} />
		</div>

		<div class="min-w-[200px] flex-1">
			<label for="searchInput" class="mb-1 block text-sm font-medium text-gray-700"
				>{$t('ค้นหารหัสพนักงาน')}</label
			>
			<input
				id="searchInput"
				type="text"
				name="search"
				value={data.searchQuery}
				placeholder="พิมพ์รหัส แผนก..."
				class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
			/>
		</div>
		<button
			type="submit"
			class="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500"
		>
			<span class="material-symbols-outlined mr-1 align-middle text-[18px]">search</span>
			{$t('ค้นหา')}
		</button>
	</form>
</div>

<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
	<div
		class="rounded-lg border border-l-4 border-gray-100 border-l-blue-500 bg-white p-6 shadow-sm"
	>
		<p class="text-sm font-medium text-gray-500">{$t('จำนวนวันที่มาทำงาน')}</p>
		<p class="mt-2 text-3xl font-bold text-blue-600">
			{stats.total_days} <span class="text-base font-normal text-gray-500">{$t('วัน')}</span>
		</p>
	</div>
	<div
		class="rounded-lg border border-l-4 border-gray-100 border-l-orange-500 bg-white p-6 shadow-sm"
	>
		<p class="text-sm font-medium text-gray-500">{$t('สายสะสม (เดือนนี้)')}</p>
		<p class="mt-2 text-3xl font-bold text-orange-500">
			{stats.total_late_mins} <span class="text-base font-normal text-gray-500">{$t('นาที')}</span>
		</p>
	</div>
	<div
		class="rounded-lg border border-l-4 border-gray-100 border-l-purple-500 bg-white p-6 shadow-sm"
	>
		<p class="text-sm font-medium text-gray-500">{$t('ล่วงเวลา (OT) สะสม')}</p>
		<p class="mt-2 text-3xl font-bold text-purple-600">
			{stats.total_ot_hours} <span class="text-base font-normal text-gray-500">{$t('ชม.')}</span>
		</p>
	</div>
	<div class="rounded-lg border border-gray-100 bg-gray-50 p-6 shadow-sm">
		<p class="text-sm font-medium text-gray-500">{$t('รายการบันทึกทั้งหมด')}</p>
		<p class="mt-2 text-3xl font-bold text-gray-900">
			{logs.length} <span class="text-base font-normal text-gray-500">{$t('รายการ')}</span>
		</p>
	</div>
</div>

<div class="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
	<div class="overflow-x-auto">
		<table class="w-full min-w-[1000px] text-left text-sm text-gray-600">
			<thead class="border-b border-gray-100 bg-gray-50 text-xs text-gray-700 uppercase">
				<tr>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Date')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Emp_ID')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Name')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('(Dis/Sec)')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Section')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Shift')}</th>
					<th class="px-4 py-3 text-center whitespace-nowrap">{$t('Entry time')}</th>
					<th class="px-4 py-3 text-center whitespace-nowrap">{$t('Departure time')}</th>
					<th class="px-4 py-3 text-center font-bold whitespace-nowrap text-blue-600">{$t('OT')}</th
					>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Status')}</th>
				</tr>
			</thead>
			<tbody>
				{#if logs.length === 0}
					<tr>
						<td colspan="10" class="px-4 py-8 text-center text-gray-500"
							>{$t('ไม่พบข้อมูลในระบบ')}</td
						>
					</tr>
				{/if}
				{#each logs as log}
					<tr class="border-b border-gray-50 transition-colors hover:bg-gray-50">
						<td class="px-4 py-3 whitespace-nowrap"
							>{new Date(log.work_date).toLocaleDateString('th-TH')}</td
						>
						<td class="px-4 py-3 font-medium whitespace-nowrap text-gray-900">{log.emp_id}</td>
						<td class="px-4 py-3 whitespace-nowrap">{log.name}</td>
						<td class="px-4 py-3 whitespace-nowrap">{log.dis} / {log.section}</td>
						<td class="px-4 py-3 whitespace-nowrap">{log.position}</td>
						<td class="px-4 py-3 whitespace-nowrap">
							<span
								class="rounded px-2 py-0.5 text-xs font-medium {log.shift_type === 'Day'
									? 'bg-amber-100 text-amber-700'
									: 'bg-indigo-100 text-indigo-700'}"
							>
								{log.shift_type === 'Day' ? $t('เช้า') : $t('ดึก')}
							</span>
						</td>
						<td class="px-4 py-3 text-center font-mono whitespace-nowrap">{log.time_in || '-'}</td>
						<td class="px-4 py-3 text-center font-mono whitespace-nowrap">{log.time_out || '-'}</td>
						<td
							class="px-4 py-3 text-center font-mono font-bold whitespace-nowrap {log.ot_hours > 0
								? 'text-blue-600'
								: 'text-gray-400'}"
						>
							{log.ot_hours > 0 ? log.ot_hours : '-'}
						</td>
						<td class="px-4 py-3 whitespace-nowrap">
							<span
								class="rounded-full px-2.5 py-1 text-xs font-semibold {log.status === 'Present'
									? 'bg-green-100 text-green-700'
									: log.status === 'Late'
										? 'bg-orange-100 text-orange-700'
										: 'bg-red-100 text-red-700'}"
							>
								{log.status === 'Present' && log.is_late === 1
									? $t('สาย')
									: log.status === 'Present'
										? $t('ปกติ')
										: $t('ขาด')}
							</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
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
