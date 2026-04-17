<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	let { data, form } = $props();

	let summary = $derived(data.summary || []);
	let employeeList = $derived(data.employeeList || []);
	let isSubmitting = $state(false);

	let statusOptions = $derived([
		{ value: 'Present', label: `✅ ${$t('มาปกติ')} (Present)` },
		{ value: 'Late', label: `⚠️ ${$t('มาสาย')} (Late)` },
		{ value: 'Leave Morning', label: `🌤️ ${$t('ลาครึ่งวันเช้า')}` },
		{ value: 'Leave Afternoon', label: `🌥️ ${$t('ลาครึ่งวันบ่าย')}` },
		{ value: 'Leave Full Day', label: `📅 ${$t('ลาเต็มวัน')}` },
		{ value: 'Absent', label: `❌ ${$t('ขาดงาน')} (Absent)` }
	]);

	let sectionOptions = $derived([
		{ value: 'All', label: `-- ${$t('ทุกแผนก')} (All Sections) --` },
		...(data.sections || []).map((s: string) => ({ value: s, label: s }))
	]);
	let groupOptions = $derived([
		{ value: 'All', label: `-- ${$t('ทุกกลุ่ม')} (All Groups) --` },
		...(data.groups || []).map((g: string) => ({ value: g, label: g }))
	]);

	let selectedSection = $state(
		data.filterSection && data.filterSection !== 'All'
			? { value: data.filterSection, label: data.filterSection }
			: { value: 'All', label: `-- ${$t('ทุกแผนก')} (All Sections) --` }
	);

	let selectedGroup = $state(
		data.filterGroup && data.filterGroup !== 'All'
			? { value: data.filterGroup, label: data.filterGroup }
			: { value: 'All', label: `-- ${$t('ทุกกลุ่ม')} (All Groups) --` }
	);

	// 🌟 1. ระบบค้นหา Dropdown สำหรับ "สรุปยอดกำลังพล"
	let summarySearch: any = $state(null);
	let summaryOptions = $derived(
		summary.map((s: any) => ({
			value: s.section + (s.emp_group || ''),
			label: `${s.section} ${s.emp_group && s.emp_group !== '-' ? `(${s.emp_group})` : ''}`
		}))
	);
	let filteredSummary = $derived(
		!summarySearch
			? summary
			: summary.filter((s: any) => s.section + (s.emp_group || '') === summarySearch.value)
	);

	// 🌟 2. ระบบค้นหา Dropdown สำหรับ "รายชื่อพนักงาน"
	let empSearch: any = $state(null);
	let empSearchOptions = $derived(
		employeeList.map((e: any) => ({
			value: e.emp_id,
			label: `${e.emp_id} : ${e.emp_name}`
		}))
	);
	let filteredEmpList = $derived(
		!empSearch ? employeeList : employeeList.filter((e: any) => e.emp_id === empSearch.value)
	);

	// 🌟 Pagination (ผูกกับข้อมูลที่ถูก Filter แล้ว)
	let sumCurrentPage = $state(1);
	let sumPerPage = $state(10);
	let sumTotalPages = $derived(Math.ceil(filteredSummary.length / sumPerPage) || 1);
	let validSumPage = $derived(Math.min(sumCurrentPage, sumTotalPages) || 1);
	let paginatedSummary = $derived(
		filteredSummary.slice((validSumPage - 1) * sumPerPage, validSumPage * sumPerPage)
	);

	let empCurrentPage = $state(1);
	let empPerPage = $state(10);
	let empTotalPages = $derived(Math.ceil(filteredEmpList.length / empPerPage) || 1);
	let validEmpPage = $derived(Math.min(empCurrentPage, empTotalPages) || 1);
</script>

<svelte:head>
	<title>{$t('Daily Attendance Verification')}</title>
</svelte:head>

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('ตรวจสอบเวลาทำงาน (Leader Verification)')}</h1>
		<p class="mt-1 text-sm text-gray-500">
			{$t('ตรวจสอบสถานะ และกำหนดกะทำงาน (เช้า/ดึก) ให้ลูกน้องในแผนก')}
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		{#if form?.message}
			<span
				class="rounded-lg px-4 py-2 text-sm font-semibold {form.success
					? 'bg-green-100 text-green-700'
					: 'bg-red-100 text-red-700'}"
			>
				{form.message}
			</span>
		{/if}

		<a
			href="/human-resources/attendance-verification/export?date={data.displayDate}&section={data.filterSection}&group={data.filterGroup}"
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
	</div>
</div>

<div class="relative z-[60] mb-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
	<form method="GET" class="flex flex-wrap items-end gap-4">
		<div>
			<label for="dateFilter" class="mb-1 block text-sm font-medium text-gray-700"
				>{$t('เลือกวันที่ (Date)')}</label
			>
			<input
				type="date"
				id="dateFilter"
				name="date"
				value={data.displayDate}
				onchange={(e) => e.currentTarget.form?.submit()}
				class="w-44 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
			/>
		</div>

		<div class="w-64">
			<div class="mb-1 block text-sm font-medium text-gray-700">{$t('แผนก (Section)')}</div>
			<Select
				items={sectionOptions}
				bind:value={selectedSection}
				container={browser ? document.body : null}
				class="svelte-select-custom"
			/>
			<input type="hidden" name="section" value={selectedSection?.value || 'All'} />
		</div>

		<div class="w-64">
			<div class="mb-1 block text-sm font-medium text-gray-700">{$t('กลุ่มงาน (Group)')}</div>
			<Select
				items={groupOptions}
				bind:value={selectedGroup}
				container={browser ? document.body : null}
				class="svelte-select-custom"
			/>
			<input type="hidden" name="group" value={selectedGroup?.value || 'All'} />
		</div>

		<button
			id="searchBtn"
			type="submit"
			class="rounded-lg bg-gray-800 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
		>
			<span class="material-symbols-outlined mr-1 align-middle text-[18px]">search</span>
			{$t('ค้นหา')}
		</button>
	</form>
</div>

<div
	class="relative z-50 mb-6 flex flex-col overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm"
>
	<div
		class="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-gray-50 p-4"
	>
		<h2 class="text-lg font-semibold text-gray-800">
			{$t('สรุปยอดพนักงานประจำวัน')}
			<span class="text-sm font-normal text-gray-500"
				>({new Date(data.displayDate).toLocaleDateString('th-TH')})</span
			>
		</h2>

		<div class="w-72">
			<Select
				items={summaryOptions}
				bind:value={summarySearch}
				placeholder={$t('ค้นหา แผนก / กลุ่ม...')}
				container={browser ? document.body : null}
				class="svelte-select-custom"
			/>
		</div>
	</div>
	<div class="flex-1 overflow-x-auto">
		<table class="w-full min-w-[800px] text-center text-sm text-gray-600">
			<thead class="border-b border-gray-100 bg-white text-xs text-gray-700 uppercase">
				<tr>
					<th class="px-4 py-3">Division</th>
					<th class="px-4 py-3">Section / Group</th>
					<th class="px-4 py-3">Total Plan</th>
					<th class="px-4 py-3">Active</th>
					<th class="px-4 py-3 font-bold text-blue-600">Attendance</th>
					<th class="px-4 py-3 font-bold text-orange-500">Leave</th>
					<th class="px-4 py-3 font-bold text-red-600">Absent</th>
					<th class="px-4 py-3 font-bold text-green-600">% Att.</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-50">
				{#each paginatedSummary as row}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 font-medium text-gray-900">{row.division || '-'}</td>
						<td class="px-4 py-3 font-medium text-blue-700"
							>{row.section}
							{row.emp_group && row.emp_group !== '-' ? `(${row.emp_group})` : ''}</td
						>
						<td class="px-4 py-3 font-bold">{row.total_plan}</td>
						<td class="px-4 py-3 font-bold text-gray-800">{row.active_emp}</td>
						<td class="px-4 py-3 font-bold text-blue-600">{row.attendance}</td>
						<td class="px-4 py-3 font-bold text-orange-500">{row.leave_count}</td>
						<td class="px-4 py-3 font-bold text-red-600">{row.absent_count}</td>
						<td class="bg-green-50/50 px-4 py-3 font-black text-green-600">
							{row.percent_att}%
						</td>
					</tr>
				{/each}
				{#if filteredSummary.length === 0}
					<tr
						><td colspan="8" class="px-4 py-8 text-gray-500"
							>{$t('ไม่พบข้อมูล หรือพนักงานในแผนกนี้')}</td
						></tr
					>
				{/if}
			</tbody>
		</table>
	</div>

	{#if filteredSummary.length > 0}
		<div
			class="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3 sm:px-6"
		>
			<div class="flex flex-col gap-4 sm:flex-1 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-wrap items-center gap-4">
					<div class="flex items-center gap-2 text-sm text-gray-700">
						<span>{$t('Show')}:</span>
						<select
							aria-label="Items per page"
							bind:value={sumPerPage}
							onchange={() => (sumCurrentPage = 1)}
							class="w-20 cursor-pointer rounded border border-gray-300 bg-white py-1 pr-8 pl-3 text-sm font-medium focus:border-blue-500 focus:outline-none"
						>
							<option value={10}>10</option>
							<option value={50}>50</option>
							<option value={100}>100</option>
						</select>
					</div>
					<p class="hidden text-sm text-gray-700 md:block">
						{$t('Show')} <span class="font-medium">{(validSumPage - 1) * sumPerPage + 1}</span>
						{$t('to')}
						<span class="font-medium"
							>{Math.min(validSumPage * sumPerPage, filteredSummary.length)}</span
						>
						{$t('From total')}
						<span class="font-medium">{filteredSummary.length}</span>
						{$t('Item')}
					</p>
				</div>
				<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
					<button
						aria-label="ก่อนหน้า"
						onclick={() => (sumCurrentPage = validSumPage - 1)}
						disabled={validSumPage === 1}
						class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50"
					>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"
							><path
								fill-rule="evenodd"
								d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
								clip-rule="evenodd"
							/></svg
						>
					</button>
					<span
						class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 ring-inset"
					>
						{validSumPage} / {sumTotalPages}
					</span>
					<button
						aria-label="ถัดไป"
						onclick={() => (sumCurrentPage = validSumPage + 1)}
						disabled={validSumPage === sumTotalPages}
						class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50"
					>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"
							><path
								fill-rule="evenodd"
								d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
								clip-rule="evenodd"
							/></svg
						>
					</button>
				</nav>
			</div>
		</div>
	{/if}
</div>

<div
	class="relative z-40 flex flex-col overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm"
>
	<div
		class="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-gray-50 p-4"
	>
		<h2 class="text-lg font-semibold text-gray-800">
			{$t('รายชื่อพนักงานที่ต้องตรวจสอบ')}
			<span class="ml-2 text-sm font-normal text-gray-500"
				>({filteredEmpList.length} {$t('คน')})</span
			>
		</h2>

		<div class="flex flex-wrap items-center gap-4">
			<div class="w-72">
				<Select
					items={empSearchOptions}
					bind:value={empSearch}
					placeholder={$t('ค้นหารหัส / ชื่อพนักงาน...')}
					container={browser ? document.body : null}
					class="svelte-select-custom"
				/>
			</div>

			<button
				type="submit"
				form="verificationForm"
				disabled={isSubmitting || filteredEmpList.length === 0}
				class="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
			>
				<span class="material-symbols-outlined text-[18px]">fact_check</span>
				{isSubmitting ? $t('กำลังบันทึก...') : $t('บันทึกและยืนยันข้อมูล')}
			</button>
		</div>
	</div>

	<div class="flex-1 overflow-x-auto">
		<form
			id="verificationForm"
			method="POST"
			action="?/saveVerification"
			use:enhance={({ cancel }) => {
				const selects = document.querySelectorAll('select[name="status[]"]');
				let hasPending = false;
				selects.forEach((s) => {
					if ((s as HTMLSelectElement).value === 'Pending') hasPending = true;
				});

				if (hasPending) {
					alert(
						`⚠️ ${$t('ไม่สามารถบันทึกได้! มีพนักงานที่ยังไม่ได้ระบุสถานะ กรุณาตรวจสอบช่องสีแดงให้ครบถ้วนครับ (กรุณาเช็คในหน้าอื่นๆ ด้วย)')}`
					);
					cancel();
					return;
				}

				isSubmitting = true;
				return async ({ update }) => {
					await update();
					isSubmitting = false;
				};
			}}
		>
			<input type="hidden" name="date" value={data.displayDate} />

			<table class="w-full min-w-[1000px] text-left text-sm text-gray-600">
				<thead
					class="sticky top-0 z-10 border-b border-gray-100 bg-white text-xs text-gray-700 uppercase"
				>
					<tr>
						<th class="px-4 py-3 whitespace-nowrap">{$t('Group')}</th>
						<th class="px-4 py-3 whitespace-nowrap">{$t('รหัสพนักงาน')}</th>
						<th class="px-4 py-3 whitespace-nowrap">{$t('ชื่อ-นามสกุล')}</th>
						<th class="w-36 px-4 py-3 text-center whitespace-nowrap">{$t('กะทำงาน')}</th>
						<th class="px-4 py-3 text-center whitespace-nowrap">{$t('เวลาเข้า')}</th>
						<th class="px-4 py-3 text-center whitespace-nowrap">{$t('เวลาออก')}</th>
						<th class="w-48 px-4 py-3 whitespace-nowrap"
							>{$t('สถานะ (Status)')} <span class="text-red-500">*</span></th
						>
						<th class="w-64 px-4 py-3 whitespace-nowrap">{$t('หมายเหตุ / ประเภทการลา')}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-50">
					{#each filteredEmpList as emp, index}
						{@const isVisible =
							index >= (validEmpPage - 1) * empPerPage && index < validEmpPage * empPerPage}
						{@const hasScan = emp.time_in !== null || emp.time_out !== null}
						{@const needsCheck = !hasScan && emp.status === 'Pending'}

						<tr
							class="transition-colors hover:bg-gray-50 {isVisible ? '' : 'hidden'}
							{needsCheck
								? 'border-l-4 border-l-red-500 bg-red-50/50'
								: hasScan
									? 'border-l-4 border-l-green-400 bg-green-50/20'
									: emp.status.includes('Leave')
										? 'border-l-4 border-l-orange-400 bg-orange-50/30'
										: emp.status === 'Absent'
											? 'border-l-4 border-l-red-500 bg-red-50/30'
											: ''}"
						>
							<td class="px-4 py-3 font-bold whitespace-nowrap text-gray-800"
								>{emp.emp_group || '-'}</td
							>
							<td class="px-4 py-3 font-mono whitespace-nowrap">{emp.emp_id}</td>
							<td class="px-4 py-3 font-medium whitespace-nowrap text-gray-900">
								{emp.emp_name}
								<input type="hidden" name="emp_id[]" value={emp.emp_id} />
							</td>

							<td class="px-4 py-2">
								<select
									aria-label="Shift"
									name="shift[]"
									class="w-full rounded border px-2 py-1.5 text-center text-sm font-bold [text-align-last:center] focus:outline-none
									{emp.shift_type === 'Day'
										? 'border-yellow-300 bg-yellow-50 text-yellow-700'
										: 'border-indigo-300 bg-indigo-50 text-indigo-700'}"
								>
									<option value="Day" selected={emp.shift_type === 'Day'}>{$t('กะเช้า')}</option>
									<option value="Night" selected={emp.shift_type === 'Night'}>{$t('กะดึก')}</option>
								</select>
							</td>

							<td
								class="px-4 py-3 text-center font-mono font-bold whitespace-nowrap {emp.time_in
									? 'text-green-600'
									: 'text-gray-300'}">{emp.time_in || '-'}</td
							>
							<td
								class="px-4 py-3 text-center font-mono font-bold whitespace-nowrap {emp.time_out
									? 'text-purple-600'
									: 'text-gray-300'}">{emp.time_out || '-'}</td
							>

							<td class="px-4 py-2">
								<select
									aria-label="Status"
									name="status[]"
									class="w-full rounded border px-2 py-1.5 text-sm font-medium focus:border-blue-500 focus:outline-none
									{needsCheck
										? 'animate-pulse border-red-400 bg-red-100 text-red-700 ring-1 ring-red-400'
										: emp.status === 'Present' || (hasScan && emp.status === 'Pending')
											? 'border-green-300 bg-green-50 text-green-700'
											: emp.status === 'Late'
												? 'border-yellow-300 bg-yellow-50 text-yellow-700'
												: emp.status.includes('Leave')
													? 'border-orange-300 bg-orange-50 text-orange-700'
													: emp.status === 'Absent'
														? 'border-red-300 bg-red-50 text-red-700'
														: 'border-gray-300 bg-white'}"
								>
									{#if needsCheck}
										<option value="Pending" selected hidden>🔴 {$t('รอระบุสถานะ...')}</option>
									{/if}
									{#each statusOptions as opt}
										<option
											value={opt.value}
											selected={emp.status === opt.value ||
												(hasScan && emp.status === 'Pending' && opt.value === 'Present')}
										>
											{opt.label}
										</option>
									{/each}
								</select>
							</td>

							<td class="px-4 py-2">
								<input
									aria-label="Remark"
									type="text"
									name="remark[]"
									value={emp.remark || ''}
									placeholder={needsCheck
										? $t('ระบุเหตุผลที่ไม่ได้สแกนนิ้ว...')
										: $t('หมายเหตุเพิ่มเติม (ถ้ามี)')}
									class="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
								/>
							</td>
						</tr>
					{/each}

					{#if filteredEmpList.length === 0}
						<tr>
							<td colspan="8" class="bg-gray-50 px-4 py-8 text-center text-gray-500">
								{$t('ไม่พบข้อมูลพนักงานที่ค้นหา')}
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</form>
	</div>

	{#if filteredEmpList.length > 0}
		<div
			class="mt-auto flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3 sm:px-6"
		>
			<div class="flex flex-col gap-4 sm:flex-1 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-wrap items-center gap-4">
					<div class="flex items-center gap-2 text-sm text-gray-700">
						<span>{$t('Show')}:</span>
						<select
							aria-label="Items per page"
							bind:value={empPerPage}
							onchange={() => (empCurrentPage = 1)}
							class="w-20 cursor-pointer rounded border border-gray-300 bg-white py-1 pr-8 pl-3 text-sm font-medium focus:border-blue-500 focus:outline-none"
						>
							<option value={10}>10</option>
							<option value={50}>50</option>
							<option value={100}>100</option>
						</select>
					</div>
					<p class="hidden text-sm text-gray-700 md:block">
						{$t('Show')} <span class="font-medium">{(validEmpPage - 1) * empPerPage + 1}</span>
						{$t('to')}
						<span class="font-medium"
							>{Math.min(validEmpPage * empPerPage, filteredEmpList.length)}</span
						>
						{$t('From total')}
						<span class="font-medium">{filteredEmpList.length}</span>
						{$t('Item')}
					</p>
				</div>
				<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
					<button
						aria-label="ก่อนหน้า"
						onclick={() => (empCurrentPage = validEmpPage - 1)}
						disabled={validEmpPage === 1}
						class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50"
					>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"
							><path
								fill-rule="evenodd"
								d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
								clip-rule="evenodd"
							/></svg
						>
					</button>
					<span
						class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 ring-inset"
					>
						{validEmpPage} / {empTotalPages}
					</span>
					<button
						aria-label="ถัดไป"
						onclick={() => (empCurrentPage = validEmpPage + 1)}
						disabled={validEmpPage === empTotalPages}
						class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50"
					>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"
							><path
								fill-rule="evenodd"
								d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
								clip-rule="evenodd"
							/></svg
						>
					</button>
				</nav>
			</div>
		</div>
	{/if}
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
