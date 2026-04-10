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
		{ value: 'Present', label: `${$t('มาปกติ')} (Present)` },
		{ value: 'Late', label: `${$t('มาสาย')} (Late)` },
		{ value: 'Leave Morning', label: `${$t('ลาครึ่งวันเช้า')}` },
		{ value: 'Leave Afternoon', label: `${$t('ลาครึ่งวันบ่าย')}` },
		{ value: 'Leave Full Day', label: `${$t('ลาเต็มวัน')}` },
		{ value: 'Absent', label: `${$t('ขาดงาน')} (Absent)` }
	]);

	let sectionOptions = $derived([
		{ value: 'All', label: '-- ทุกแผนก (All Sections) --' },
		...(data.sections || []).map((s: string) => ({ value: s, label: s }))
	]);
	let groupOptions = $derived([
		{ value: 'All', label: '-- ทุกกลุ่ม (All Groups) --' },
		...(data.groups || []).map((g: string) => ({ value: g, label: g }))
	]);

	let selectedSection = $state(
		data.filterSection && data.filterSection !== 'All'
			? { value: data.filterSection, label: data.filterSection }
			: { value: 'All', label: '-- ทุกแผนก (All Sections) --' }
	);

	let selectedGroup = $state(
		data.filterGroup && data.filterGroup !== 'All'
			? { value: data.filterGroup, label: data.filterGroup }
			: { value: 'All', label: '-- ทุกกลุ่ม (All Groups) --' }
	);

	let sumCurrentPage = $state(1);
	let sumPerPage = $state(10);
	let sumTotalPages = $derived(Math.ceil(summary.length / sumPerPage) || 1);
	let paginatedSummary = $derived(
		summary.slice((sumCurrentPage - 1) * sumPerPage, sumCurrentPage * sumPerPage)
	);

	let empCurrentPage = $state(1);
	let empPerPage = $state(10);
	let empTotalPages = $derived(Math.ceil(employeeList.length / empPerPage) || 1);
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

	{#if form?.message}
		<span
			class="rounded-lg px-4 py-2 text-sm font-semibold {form.success
				? 'bg-green-100 text-green-700'
				: 'bg-red-100 text-red-700'}"
		>
			{form.message}
		</span>
	{/if}
</div>

<div class="z-50 mb-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
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

		{#if data.user.role === 'admin'}
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
				{$t('ค้นหา')}
			</button>
		{:else}
			<div class="flex flex-col justify-end pb-2">
				<span class="text-sm font-bold text-blue-700">{$t('แผนกของคุณ')}: {data.user.section}</span>
				<input type="hidden" name="section" value={data.user.section} />
			</div>
		{/if}
	</form>
</div>

<div
	class="mb-6 flex flex-col overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm"
>
	<div class="border-b border-gray-100 bg-gray-50 p-4">
		<h2 class="text-lg font-semibold text-gray-800">
			{$t('สรุปยอดกำลังพลประจำวัน')}
			<span class="text-sm font-normal text-gray-500"
				>({new Date(data.displayDate).toLocaleDateString('th-TH')})</span
			>
		</h2>
	</div>
	<div class="flex-1 overflow-x-auto">
		<table class="w-full text-center text-sm text-gray-600">
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
							>{row.section} {row.emp_group ? `(${row.emp_group})` : ''}</td
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
				{#if summary.length === 0}
					<tr
						><td colspan="8" class="px-4 py-8 text-gray-500"
							>{$t('ไม่พบข้อมูล หรือพนักงานในแผนกนี้')}</td
						>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>

	{#if summary.length > 0}
		<div
			class="mt-auto flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3 sm:px-6"
		>
			<div class="flex flex-col gap-4 sm:flex-1 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-wrap items-center gap-4">
					<div class="flex items-center gap-2 text-sm text-gray-700">
						<span>{$t('แสดงหน้าละ')}:</span>
						<select
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
						{$t('แสดง')} <span class="font-medium">{(sumCurrentPage - 1) * sumPerPage + 1}</span>
						{$t('ถึง')}
						<span class="font-medium">{Math.min(sumCurrentPage * sumPerPage, summary.length)}</span>
						{$t('จากทั้งหมด')}
						<span class="font-medium">{summary.length}</span>
						{$t('รายการ')}
					</p>
				</div>
				<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
					<button
						aria-label="ก่อนหน้า"
						onclick={() => sumCurrentPage--}
						disabled={sumCurrentPage === 1}
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
						{sumCurrentPage} / {sumTotalPages}
					</span>
					<button
						aria-label="ถัดไป"
						onclick={() => sumCurrentPage++}
						disabled={sumCurrentPage === sumTotalPages}
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

<div class="flex flex-col overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
	<div class="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-4">
		<h2 class="text-lg font-semibold text-gray-800">
			{$t('รายชื่อพนักงานที่ต้องตรวจสอบ')}
			<span class="ml-2 text-sm font-normal text-gray-500">({employeeList.length} {$t('คน')})</span>
		</h2>
		<button
			type="submit"
			form="verificationForm"
			disabled={isSubmitting || employeeList.length === 0}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
		>
			<span class="material-symbols-outlined text-[18px]">fact_check</span>
			{isSubmitting ? $t('กำลังบันทึก...') : $t('บันทึกและยืนยันข้อมูล')}
		</button>
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
					alert($t('⚠️ ไม่สามารถบันทึกได้! มีพนักงานที่ยังไม่ได้ระบุสถานะ'));
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
					{#each employeeList as emp, index}
						{@const isVisible =
							index >= (empCurrentPage - 1) * empPerPage && index < empCurrentPage * empPerPage}
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
							<td class="px-4 py-3 font-bold text-gray-800">{emp.emp_group || '-'}</td>
							<td class="px-4 py-3 font-mono">{emp.emp_id}</td>
							<td class="px-4 py-3 font-medium text-gray-900">
								{emp.emp_name}
								<input type="hidden" name="emp_id[]" value={emp.emp_id} />
							</td>

							<td class="px-4 py-2">
								<select
									name="shift[]"
									class="w-full rounded border px-2 py-1.5 text-center text-sm font-bold [text-align-last:center] focus:outline-none {emp.shift_type ===
									'Day'
										? 'border-yellow-300 bg-yellow-50 text-yellow-700'
										: 'border-indigo-300 bg-indigo-50 text-indigo-700'}"
								>
									<option value="Day" selected={emp.shift_type === 'Day'}>{$t('กะเช้า')}</option>
									<option value="Night" selected={emp.shift_type === 'Night'}>{$t('กะดึก')}</option>
								</select>
							</td>

							<td
								class="px-4 py-3 text-center font-mono font-bold {emp.time_in
									? 'text-green-600'
									: 'text-gray-300'}">{emp.time_in || '-'}</td
							>
							<td
								class="px-4 py-3 text-center font-mono font-bold {emp.time_out
									? 'text-purple-600'
									: 'text-gray-300'}">{emp.time_out || '-'}</td
							>

							<td class="px-4 py-2">
								<select name="status[]" class="...">
									{#if needsCheck}
										<option value="Pending" selected hidden>{$t('รอระบุสถานะ...')}</option>
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
									type="text"
									name="remark[]"
									value={emp.remark || ''}
									placeholder={needsCheck
										? $t('ระบุเหตุผลที่ไม่ได้สแกนนิ้ว...')
										: $t('หมายเหตุเพิ่มเติม (ถ้ามี)')}
									class="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
								/>
							</td>

							<td class="px-4 py-2">
								<input
									type="text"
									name="remark[]"
									value={emp.remark || ''}
									placeholder={needsCheck
										? 'ระบุเหตุผลที่ไม่ได้สแกนนิ้ว...'
										: 'หมายเหตุเพิ่มเติม (ถ้ามี)'}
									class="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
								/>
							</td>
						</tr>
					{/each}

					{#if employeeList.length === 0}
						<tr>
							<td colspan="8" class="bg-gray-50 px-4 py-8 text-center text-gray-500">
								{$t('กรุณาเลือก แผนก หรือ กลุ่มงาน เพื่อดูรายชื่อพนักงาน')}
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</form>
	</div>

	{#if employeeList.length > 0}
		<div
			class="mt-auto flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3 sm:px-6"
		>
			<div class="flex flex-col gap-4 sm:flex-1 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-wrap items-center gap-4">
					<div class="flex items-center gap-2 text-sm text-gray-700">
						<span>{$t('แสดงหน้าละ')}:</span>
						<select
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
						{$t('แสดง')} <span class="font-medium">{(empCurrentPage - 1) * empPerPage + 1}</span>
						{$t('ถึง')}
						<span class="font-medium"
							>{Math.min(empCurrentPage * empPerPage, employeeList.length)}</span
						>
						{$t('จากทั้งหมด')}
						<span class="font-medium">{employeeList.length}</span>
						{$t('รายการ')}
					</p>
				</div>
				<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
					<button
						aria-label="ก่อนหน้า"
						onclick={() => empCurrentPage--}
						disabled={empCurrentPage === 1}
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
						{empCurrentPage} / {empTotalPages}
					</span>
					<button
						aria-label="ถัดไป"
						onclick={() => empCurrentPage++}
						disabled={empCurrentPage === empTotalPages}
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
