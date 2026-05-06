<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	let { data, form } = $props();

	let summary = $derived(data.summary || []);
	let employeeList = $derived(data.employeeList || []);
	let isSubmitting = $state(false);
	let showErrorModal = $state(false);

	let statusOptions = $derived([
		{ value: 'Present', label: `${$t('Present')}` },
		{ value: 'Late', label: `${$t('Late')} ` },
		{ value: 'Leave Morning', label: `${$t('half-day leave morning')}` },
		{ value: 'Leave Afternoon', label: `${$t('half-day leave afternoon')}` },
		{ value: 'Leave Full Day', label: `${$t('Leave')}` },
		{ value: 'Absent', label: `${$t('Absent')} ` }
	]);

	let sectionOptions = $derived([
		{ value: 'All', label: `-- ${$t('All Sections')} --` },
		...(data.sections || []).map((s: string) => ({ value: s, label: s }))
	]);
	let groupOptions = $derived([
		{ value: 'All', label: `-- ${$t('All Groups')} --` },
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

	let groupedByDivision = $derived.by(() => {
		const groups: Record<string, any> = {};
		const costPlusGroups = [
			'Parts Reflash',
			'Parts Rework',
			'New Model',
			'KD-MJV',
			'Container Exchange',
			'Maid'
		];

		for (const row of filteredSummary) {
			let cardName = row.division;

			if (
				row.emp_group &&
				(costPlusGroups.includes(row.emp_group) || row.emp_group.includes('Cost Plus'))
			) {
				cardName = 'Cost Plus';
			} else if (!cardName || cardName === '-') {
				cardName = 'ไม่ระบุ Division';
			}

			if (!groups[cardName]) {
				groups[cardName] = { sections: [], totalPlan: 0, totalAtt: 0, percent: 0 };
			}

			groups[cardName].sections.push(row);
			groups[cardName].totalPlan += Number(row.total_plan || 0);
			groups[cardName].totalAtt += Number(row.attendance || 0);
		}

		for (const key in groups) {
			groups[key].percent =
				groups[key].totalPlan > 0
					? Math.round((groups[key].totalAtt / groups[key].totalPlan) * 100)
					: 0;
		}

		const sortedGroups: Record<string, any> = {};
		Object.keys(groups)
			.sort((a, b) => {
				if (a === 'ไม่ระบุ Division' || a === '-') return 1;
				if (b === 'ไม่ระบุ Division' || b === '-') return -1;

				const isAmh = a.toUpperCase().startsWith('MH');
				const isBmh = b.toUpperCase().startsWith('MH');

				if (isAmh && !isBmh) return -1;
				if (!isAmh && isBmh) return 1;

				return a.localeCompare(b);
			})
			.forEach((key) => {
				sortedGroups[key] = groups[key];
			});

		return sortedGroups;
	});

	let ihSummary = $derived.by(() => {
		let cpvPlan = 0,
			cpvAtt = 0;
		let costPlusPlan = 0,
			costPlusAtt = 0;

		for (const [divName, divData] of Object.entries(groupedByDivision)) {
			if (divName === 'Cost Plus') {
				costPlusPlan += divData.totalPlan;
				costPlusAtt += divData.totalAtt;
			} else {
				cpvPlan += divData.totalPlan;
				cpvAtt += divData.totalAtt;
			}
		}

		const calcPercent = (att: number, plan: number) =>
			plan > 0 ? Math.round((att / plan) * 100) : 0;

		return {
			cpv: { plan: cpvPlan, att: cpvAtt, percent: calcPercent(cpvAtt, cpvPlan) },
			costPlus: {
				plan: costPlusPlan,
				att: costPlusAtt,
				percent: calcPercent(costPlusAtt, costPlusPlan)
			},
			total: {
				plan: cpvPlan + costPlusPlan,
				att: cpvAtt + costPlusAtt,
				percent: calcPercent(cpvAtt + costPlusAtt, cpvPlan + costPlusPlan)
			}
		};
	});

	let divPages = $state<Record<string, number>>({});

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
		<h1 class="text-2xl font-bold text-gray-800">{$t('Check employee working')}</h1>
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
				>{$t('Date')}</label
			>
			<input
				type="date"
				id="dateFilter"
				name="date"
				value={data.displayDate}
				class="w-44 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
			/>
		</div>

		<div class="w-64">
			<div class="mb-1 block text-sm font-medium text-gray-700">{$t('Section')}</div>
			<Select
				items={sectionOptions}
				bind:value={selectedSection}
				container={browser ? document.body : null}
				class="svelte-select-custom"
			/>
			<input type="hidden" name="section" value={selectedSection?.value || 'All'} />
		</div>

		<div class="w-64">
			<div class="mb-1 block text-sm font-medium text-gray-700">{$t('Group')}</div>
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
			{$t('Search')}
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

	<div class="bg-gray-50/50 p-5">
		{#if filteredSummary.length === 0}
			<div class="py-8 text-center text-gray-500">
				{$t('ไม่พบข้อมูล หรือพนักงานในแผนกนี้')}
			</div>
		{:else}
			{#if Object.keys(groupedByDivision).length > 0}
				<div class="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
					<div class="border-b border-gray-100 bg-gray-50 px-5 py-4">
						<h3 class="text-lg font-bold text-gray-800">{$t('Summary IH Manpower')}</h3>
					</div>
					<div class="overflow-x-auto">
						<table class="w-full text-left text-sm">
							<thead class="bg-white text-[11px] font-bold tracking-wider text-gray-500 uppercase">
								<tr>
									<th class="border-b border-gray-100 px-5 py-3">{$t('Division')}</th>
									<th class="border-b border-gray-100 px-5 py-3 text-center"
										>{$t('Plan (Active)')}</th
									>
									<th class="border-b border-gray-100 px-5 py-3 text-center">{$t('Attendances')}</th
									>
									<th class="border-b border-gray-100 px-5 py-3 text-center">{$t('% Att')}</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-50">
								<tr class="transition-colors hover:bg-gray-50">
									<td class="px-5 py-3 font-bold text-gray-800">CPV</td>
									<td class="px-5 py-3 text-center font-medium text-gray-600"
										>{ihSummary.cpv.plan}</td
									>
									<td class="px-5 py-3 text-center font-bold text-blue-600">{ihSummary.cpv.att}</td>
									<td
										class="px-5 py-3 text-center font-bold {ihSummary.cpv.percent >= 100
											? 'text-green-600'
											: ihSummary.cpv.percent >= 80
												? 'text-blue-600'
												: 'text-orange-500'}">{ihSummary.cpv.percent}%</td
									>
								</tr>
								<tr class="transition-colors hover:bg-gray-50">
									<td class="px-5 py-3 font-bold text-gray-800">Cost Plus</td>
									<td class="px-5 py-3 text-center font-medium text-gray-600"
										>{ihSummary.costPlus.plan}</td
									>
									<td class="px-5 py-3 text-center font-bold text-blue-600"
										>{ihSummary.costPlus.att}</td
									>
									<td
										class="px-5 py-3 text-center font-bold {ihSummary.costPlus.percent >= 100
											? 'text-green-600'
											: ihSummary.costPlus.percent >= 80
												? 'text-blue-600'
												: 'text-orange-500'}">{ihSummary.costPlus.percent}%</td
									>
								</tr>
							</tbody>
							<tfoot class="border-t-2 border-gray-200 bg-gray-50">
								<tr>
									<td class="px-5 py-4 text-right text-sm font-bold text-gray-700"
										>Grand Total <span class="text-gray-400">&gt;&gt;&gt;</span></td
									>
									<td class="px-5 py-4 text-center text-base font-black text-gray-900"
										>{ihSummary.total.plan}</td
									>
									<td class="px-5 py-4 text-center text-base font-black text-blue-700"
										>{ihSummary.total.att}</td
									>
									<td
										class="px-5 py-4 text-center text-base font-black {ihSummary.total.percent >=
										100
											? 'text-green-600'
											: ihSummary.total.percent >= 80
												? 'text-blue-600'
												: 'text-orange-500'}">{ihSummary.total.percent}%</td
									>
								</tr>
							</tfoot>
						</table>
					</div>
				</div>
			{/if}

			<div class="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
				{#each Object.entries(groupedByDivision) as [divisionName, divData]}
					{@const currentPage = divPages[divisionName] || 1}
					{@const totalPages = Math.ceil(divData.sections.length / 4)}
					{@const paginatedSections = divData.sections.slice(
						(currentPage - 1) * 4,
						currentPage * 4
					)}

					<div
						class="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
					>
						<div class="border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white p-4">
							<div class="flex items-center justify-between">
								<h3 class="text-lg font-black text-gray-800">
									{divisionName !== '-' ? divisionName : 'ไม่ระบุ Division'}
								</h3>
								<div class="flex flex-col items-end">
									<span
										class="text-2xl font-black {divData.percent >= 100
											? 'text-green-600'
											: divData.percent >= 80
												? 'text-blue-600'
												: 'text-orange-500'}"
									>
										{divData.percent}%
									</span>
									<span class="text-[10px] font-bold text-gray-500 uppercase">Total Att.</span>
								</div>
							</div>

							<div class="mt-2 flex items-center gap-4 text-sm font-medium">
								<div class="flex flex-col">
									<span class="text-gray-500">Plan</span>
									<span class="font-bold text-gray-900"
										>{divData.totalPlan} <span class="text-xs font-normal">คน</span></span
									>
								</div>
								<div class="h-8 w-px bg-gray-200"></div>
								<div class="flex flex-col">
									<span class="text-gray-500">Actual (Att.)</span>
									<span class="font-bold text-blue-600"
										>{divData.totalAtt} <span class="text-xs font-normal">คน</span></span
									>
								</div>
							</div>
						</div>

						<div class="flex flex-1 flex-col justify-between p-0">
							<table class="w-full text-left text-sm">
								<thead class="bg-gray-50 text-[10px] text-gray-500 uppercase">
									<tr>
										<th class="px-4 py-2 font-semibold">Section / Group</th>
										<th class="px-2 py-2 text-center font-semibold">Plan</th>
										<th class="px-2 py-2 text-center font-semibold">Att.</th>
										<th class="px-4 py-2 text-right font-semibold">%</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-100">
									{#each paginatedSections as sec}
										<tr class="transition-colors hover:bg-gray-50">
											<td class="px-4 py-2.5">
												<div
													class="max-w-[150px] truncate font-bold text-gray-800"
													title={sec.section}
												>
													{sec.section}
												</div>
												{#if sec.emp_group && sec.emp_group !== '-'}
													<div
														class="max-w-[150px] truncate text-[11px] text-gray-500"
														title={sec.emp_group}
													>
														{sec.emp_group}
													</div>
												{/if}
											</td>
											<td class="px-2 py-2.5 text-center font-medium text-gray-600"
												>{sec.total_plan}</td
											>
											<td class="px-2 py-2.5 text-center font-bold text-blue-600"
												>{sec.attendance}</td
											>
											<td
												class="px-4 py-2.5 text-right font-bold {sec.percent_att >= 100
													? 'text-green-600'
													: sec.percent_att >= 80
														? 'text-blue-600'
														: 'text-orange-500'}"
											>
												{sec.percent_att}%
											</td>
										</tr>
									{/each}
								</tbody>
							</table>

							{#if totalPages > 1}
								<div
									class="mt-auto flex items-center justify-between border-t border-gray-100 bg-white px-4 py-2.5"
								>
									<button
										class="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
										disabled={currentPage === 1}
										onclick={() => (divPages[divisionName] = currentPage - 1)}
									>
										{$t('Previous')}
									</button>
									<span class="text-xs font-medium text-gray-500">{currentPage} / {totalPages}</span
									>
									<button
										class="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
										disabled={currentPage === totalPages}
										onclick={() => (divPages[divisionName] = (divPages[divisionName] || 1) + 1)}
									>
										{$t('Next')}
									</button>
								</div>
							{:else}
								<div class="mt-auto h-[45px] border-t border-transparent"></div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<div
	class="relative z-[70] flex flex-col overflow-visible rounded-lg border border-gray-100 bg-white shadow-sm"
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
				{isSubmitting ? $t('Saving...') : $t('บันทึกและยืนยันข้อมูล')}
			</button>
		</div>
	</div>

	<div class="flex-1 overflow-x-auto">
		<form
			id="verificationForm"
			method="POST"
			action="?/saveVerification"
			use:enhance={({ cancel }) => {
				const today = new Date();
				const offset = today.getTimezoneOffset() * 60000;
				const localToday = new Date(today.getTime() - offset).toISOString().split('T')[0];
				const isTodayOrFuture = data.displayDate >= localToday;

				const rows = document.querySelectorAll('tbody tr');
				let hasPending = false;

				rows.forEach((row) => {
					const shiftSelect = row.querySelector('select[name="shift[]"]') as HTMLSelectElement;
					const statusSelect = row.querySelector('select[name="status[]"]') as HTMLSelectElement;

					if (shiftSelect && statusSelect && statusSelect.value === 'Pending') {
						if (isTodayOrFuture && shiftSelect.value === 'N') {
						} else {
							hasPending = true;
						}
					}
				});

				if (hasPending) {
					showErrorModal = true;
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
						<th class="px-4 py-3 text-center whitespace-nowrap">{$t('Group')}</th>
						<th class="px-4 py-3 text-center whitespace-nowrap">{$t('Emp ID')}</th>
						<th class="px-4 py-3 text-center whitespace-nowrap">{$t('Name')}</th>
						<th class="w-36 px-4 py-3 text-center whitespace-nowrap">{$t('Work shift')}</th>
						<th class="px-4 py-3 text-center whitespace-nowrap">{$t('Time In')}</th>
						<th class="px-4 py-3 text-center whitespace-nowrap">{$t('Time Out')}</th>
						<th class="w-56 px-4 py-3 text-center whitespace-nowrap"
							>{$t('Status')} <span class="text-red-500"></span></th
						>
						<th class="w-64 px-4 py-3 whitespace-nowrap">{$t('Notes/Types of Leave')}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-50">
					{#each filteredEmpList as emp, index}
						{@const isVisible =
							index >= (validEmpPage - 1) * empPerPage && index < validEmpPage * empPerPage}
						{@const hasScan = emp.time_in !== null || emp.time_out !== null}

						{@const isTodayOrFuture =
							data.displayDate >=
							new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000)
								.toISOString()
								.split('T')[0]}
						{@const isNightPending =
							!hasScan && emp.status === 'Pending' && emp.shift_type === 'N' && isTodayOrFuture}
						{@const needsCheck = !hasScan && emp.status === 'Pending' && !isNightPending}

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
									class="w-full cursor-pointer rounded border py-1.5 pr-8 pl-2 text-center text-sm font-bold [text-align-last:center] focus:outline-none
									{emp.shift_type === 'D' || emp.shift_type === 'Day'
										? 'border-yellow-300 bg-yellow-50 text-yellow-700'
										: 'border-indigo-300 bg-indigo-50 text-indigo-700'}"
								>
									<option value="D" selected={emp.shift_type === 'D' || emp.shift_type === 'Day'}
										>D</option
									>
									<option value="N" selected={emp.shift_type === 'N' || emp.shift_type === 'Night'}
										>N</option
									>
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
									class="w-full cursor-pointer rounded border py-1.5 pr-8 pl-2 text-center text-sm font-medium [text-align-last:center] focus:border-blue-500 focus:outline-none
										{needsCheck
										? 'animate-pulse border-red-400 bg-red-100 text-red-700 ring-1 ring-red-400'
										: isNightPending
											? 'border-gray-300 bg-gray-100 text-gray-500'
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
									{#if needsCheck || isNightPending}
										<option value="Pending" selected hidden>
											{isNightPending ? 'รอกะดึกเข้างาน...' : $t('รอระบุสถานะ...')}
										</option>
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
										: isNightPending
											? '-'
											: $t('หมายเหตุเพิ่มเติม (ถ้ามี)')}
									class="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none {isNightPending
										? 'cursor-not-allowed bg-gray-50 text-gray-400'
										: ''}"
									readonly={isNightPending}
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

{#if showErrorModal}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-all"
	>
		<div class="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
			<div
				class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 shadow-inner"
			>
				<span class="material-symbols-outlined text-[32px]">error</span>
			</div>
			<h3 class="text-xl font-bold text-gray-900">{$t('ไม่สามารถบันทึกได้!')}</h3>
			<p class="mt-3 text-sm leading-relaxed text-gray-600">
				{$t('มีพนักงานที่ยังไม่ได้ระบุสถานะการทำงาน')} <br />
				<span class="font-semibold text-red-500">{$t('กรุณาตรวจสอบช่องสีแดงให้ครบถ้วนครับ')}</span>
				<br />
				<span class="text-xs text-gray-400">({$t('กรุณาเช็คในหน้าอื่นๆ ด้วย')})</span>
			</p>

			<div class="mt-6 flex justify-center">
				<button
					type="button"
					onclick={() => (showErrorModal = false)}
					class="w-full rounded-xl bg-gray-900 px-6 py-3 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.02] hover:bg-gray-800 focus:outline-none"
				>
					{$t('ตกลง')}
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
		--list-z-index: 9999;
	}

	:global(.svelte-select-list) {
		z-index: 9999 !important;
		box-shadow:
			0 10px 25px -5px rgba(0, 0, 0, 0.15),
			0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
		border: 1px solid #e5e7eb !important;
	}
</style>
