<script lang="ts">
	import { goto } from '$app/navigation';
	import { page, navigating } from '$app/stores';
	import { t } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();

	let selectedMonth = $state(data.currentMonth);

	// --- ส่วนของ Pagination ---
	let perPage = $state(10);
	let currentPage = $state(1);

	let totalEmployees = $derived(data.employees?.length || 0);
	let totalPages = $derived(Math.ceil(totalEmployees / perPage));
	let paginatedEmployees = $derived(
		data.employees?.slice((currentPage - 1) * perPage, currentPage * perPage) || []
	);

	function handlePerPageChange() {
		currentPage = 1;
	}

	// ฟังก์ชันสร้าง Array ของวันที่
	let daysArray = $derived(Array.from({ length: data.daysInMonth || 31 }, (_, i) => i + 1));

	function handleMonthChange() {
		if (selectedMonth) {
			currentPage = 1;
			goto(`?month=${selectedMonth}`);
		}
	}

	function getColorClass(colorStr: string) {
		const colors: Record<string, string> = {
			orange: 'bg-orange-100 text-orange-800 border-orange-200',
			red: 'bg-red-100 text-red-800 border-red-200',
			blue: 'bg-blue-100 text-blue-800 border-blue-200',
			gray: 'bg-gray-100 text-gray-800 border-gray-200',
			green: 'bg-green-100 text-green-800 border-green-200'
		};
		return colors[colorStr] || 'bg-gray-100 text-gray-800 border-gray-200';
	}

	function getOTDisplay(dayData: any, dateStr: string) {
		if (!dayData) return null;
		if (dayData.otHours && Number(dayData.otHours) > 0) {
			return `${Number(dayData.otHours)}h`;
		}
		const actualTimeOut = dayData.timeOut || dayData.scan_out_time;
		if (!actualTimeOut || !dateStr || !dayData.shift) return null;
		const shift = data.shifts?.find((s: any) => s.shift_code === dayData.shift);
		if (!shift || !shift.ot_start_time || !shift.start_time) return null;

		try {
			const [wYear, wMonth, wDay] = dateStr.split('-').map(Number);
			const normalizedTimeOut =
				typeof actualTimeOut === 'string' ? actualTimeOut.replace(' ', 'T') : actualTimeOut;
			const scanOutDate = new Date(normalizedTimeOut);
			const [startH, startM] = shift.start_time.split(':').map(Number);
			const [otH, otM] = shift.ot_start_time.split(':').map(Number);
			const isNextDay = otH < startH;
			const targetOtStart = new Date(wYear, wMonth - 1, isNextDay ? wDay + 1 : wDay, otH, otM, 0);
			if (scanOutDate >= targetOtStart) {
				const diffMs = scanOutDate.getTime() - targetOtStart.getTime();
				const diffMins = Math.floor(diffMs / 60000);
				const calculatedHours = Math.floor(diffMins / 30) * 0.5;
				if (calculatedHours > 0) return `${calculatedHours}h*`;
				return 'OT';
			}
		} catch (e) {
			console.error('Error calculating real-time OT:', e);
		}
		return null;
	}

	function formatTime(dateTimeStr: string | Date | null | undefined) {
		if (!dateTimeStr) return '';
		let d: Date;
		if (dateTimeStr instanceof Date) {
			d = dateTimeStr;
		} else {
			const normalizedStr =
				typeof dateTimeStr === 'string' ? dateTimeStr.replace(' ', 'T') : String(dateTimeStr);
			d = new Date(normalizedStr);
		}
		if (isNaN(d.getTime())) return '';
		return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="flex h-screen flex-col bg-gray-50 text-black">
	<div class="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
		<div>
			<h1 class="text-xl font-bold text-gray-800">{$t('ตารางกะการทำงาน (Monthly Schedule)')}</h1>
			<p class="text-sm text-gray-500">{$t('ตรวจสอบตารางกะและเวลาสแกนเข้า-ออกของพนักงาน')}</p>
		</div>

		<div class="flex items-center space-x-4">
			{#if $navigating}
				<div class="flex items-center text-sm font-medium text-blue-600">
					<svg
						class="mr-2 -ml-1 h-4 w-4 animate-spin text-blue-600"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
					>
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
					{$t('กำลังโหลดข้อมูล...')}
				</div>
			{/if}

			<input
				type="month"
				bind:value={selectedMonth}
				onchange={handleMonthChange}
				class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-black shadow-sm focus:border-blue-500 focus:ring-blue-500"
			/>

			<button
				onclick={() => {
					const basePath = window.location.pathname.replace(/\/$/, '');
					window.location.href = `${basePath}/export?month=${selectedMonth}`;
				}}
				class="flex items-center rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700"
			>
				<span class="material-symbols-outlined mr-2 text-[18px]">download</span>
				{$t('Export Excel')}
			</button>
		</div>
	</div>

	<div class="flex flex-1 flex-col overflow-hidden p-6">
		<div
			class="custom-scrollbar flex-1 overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm"
		>
			<table class="w-full text-left text-sm whitespace-nowrap">
				<thead class="sticky top-0 z-20 bg-gray-100 text-gray-700 shadow-sm">
					<tr>
						<th
							class="sticky left-0 z-30 min-w-[280px] border-r border-b border-gray-200 bg-gray-100 px-4 py-3 font-semibold"
						>
							{$t('ข้อมูลพนักงาน')}
						</th>
						{#each daysArray as day}
							<th
								class="min-w-[120px] border-b border-gray-200 px-3 py-3 text-center font-semibold text-black"
							>
								{day}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					{#if paginatedEmployees.length > 0}
						{#each paginatedEmployees as emp}
							<tr class="group transition-colors hover:bg-blue-50/50">
								<td
									class="sticky left-0 z-10 border-r border-gray-200 bg-white px-4 py-3 align-top shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] group-hover:bg-blue-50/50"
								>
									<div class="flex flex-col gap-1">
										<div class="flex items-baseline justify-between">
											<span class="text-sm font-semibold text-black">{emp.emp_name}</span>
											<span
												class="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-[11px] font-medium text-black"
											>
												{emp.emp_id}
											</span>
										</div>
										<div class="mt-1 grid grid-cols-1 gap-1 text-[11px] text-black">
											{#if emp.division || emp.section}
												<div class="flex items-center truncate">
													<span class="w-12 shrink-0 font-bold text-black">{$t('Div/Sec:')}</span>
													<span class="truncate font-medium text-black">
														{emp.division || '-'} <span class="mx-0.5 text-gray-400">/</span>
														{emp.section || '-'}
													</span>
												</div>
											{/if}
											{#if emp.emp_group}
												<div class="flex items-center truncate">
													<span class="w-12 shrink-0 font-bold text-black">{$t('Group:')}</span>
													<span class="truncate font-medium text-black">{emp.emp_group}</span>
												</div>
											{/if}
										</div>
									</div>
								</td>

								{#each daysArray as day}
									{@const dateStr = `${data.targetYear}-${String(data.targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`}
									{@const dayData = data.scheduleMap?.[emp.emp_id]?.[dateStr]}
									<td
										class="border-r border-gray-100 px-2 py-2 text-center align-top last:border-r-0"
									>
										{#if dayData}
											{@const actualTimeIn = dayData.timeIn || dayData.scan_in_time}
											{@const actualTimeOut = dayData.timeOut || dayData.scan_out_time}
											{@const otDisplay = getOTDisplay(dayData, dateStr)}
											<div
												class="flex h-full flex-col items-center justify-center gap-1.5 rounded-lg border p-1.5 {getColorClass(
													dayData.color
												)} bg-opacity-30"
											>
												<div class="flex items-center justify-center gap-1">
													<span
														class="bg-opacity-75 rounded bg-white px-1.5 py-0.5 text-xs font-bold text-black shadow-sm"
													>
														{dayData.shift}
													</span>
													{#if otDisplay}
														<span
															class="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600 shadow-sm"
														>
															{otDisplay}
														</span>
													{/if}
												</div>
												<div
													class="mt-0.5 flex w-full flex-col items-center rounded bg-white px-2 py-1 text-[10px] font-medium shadow-sm"
												>
													{#if actualTimeIn || actualTimeOut}
														<div class="flex w-full items-center justify-center space-x-1">
															<span class="text-green-600"
																>{formatTime(actualTimeIn) || '--:--'}</span
															>
															<span class="leading-none text-gray-300">|</span>
															<span class="text-blue-600"
																>{formatTime(actualTimeOut) || '--:--'}</span
															>
														</div>
													{:else}
														<span class="text-gray-400">{$t('ไม่มีสแกน')}</span>
													{/if}
												</div>
											</div>
										{:else}
											<div
												class="flex h-full min-h-[48px] w-full items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50"
											>
												<span class="text-xs font-light text-gray-300">-</span>
											</div>
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					{:else}
						<tr>
							<td colspan={daysArray.length + 1} class="px-6 py-12 text-center text-gray-500">
								{$t('ไม่พบข้อมูลพนักงาน Active ในแผนกของคุณ')}
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>

		<div
			class="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
		>
			<div class="flex items-center gap-4">
				<div class="flex items-center gap-2 text-sm text-black">
					<span>{$t('Show')}:</span>
					<select
						bind:value={perPage}
						onchange={handlePerPageChange}
						class="w-20 cursor-pointer rounded border border-gray-300 bg-white py-1 pr-8 pl-3 text-sm font-medium focus:border-blue-500 focus:outline-none"
					>
						<option value={10}>10</option>
						<option value={50}>50</option>
						<option value={100}>100</option>
						<option value={200}>200</option>
					</select>
				</div>
				<p class="text-sm text-black">
					{$t('แสดง')}
					<span class="font-bold">{totalEmployees > 0 ? (currentPage - 1) * perPage + 1 : 0}</span>
					{$t('ถึง')}
					<span class="font-bold">{Math.min(currentPage * perPage, totalEmployees)}</span>
					{$t('จาก')} <span class="font-bold">{totalEmployees}</span>
					{$t('รายการ')}
				</p>
			</div>

			<nav class="flex items-center gap-2">
				<button
					onclick={() => (currentPage = 1)}
					disabled={currentPage === 1}
					class="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-black hover:bg-gray-50 disabled:opacity-30"
				>
					{$t('First')}
				</button>
				<button
					onclick={() => (currentPage = Math.max(1, currentPage - 1))}
					disabled={currentPage === 1}
					class="flex items-center rounded border border-gray-300 px-2 py-1 text-black hover:bg-gray-50 disabled:opacity-30"
				>
					<span class="material-symbols-outlined">chevron_left</span>
				</button>

				<span class="rounded bg-gray-100 px-4 py-1 text-sm font-bold text-black">
					{currentPage} / {totalPages || 1}
				</span>

				<button
					onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
					disabled={currentPage === totalPages || totalPages === 0}
					class="flex items-center rounded border border-gray-300 px-2 py-1 text-black hover:bg-gray-50 disabled:opacity-30"
				>
					<span class="material-symbols-outlined">chevron_right</span>
				</button>
				<button
					onclick={() => (currentPage = totalPages)}
					disabled={currentPage === totalPages || totalPages === 0}
					class="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-black hover:bg-gray-50 disabled:opacity-30"
				>
					{$t('Last')}
				</button>
			</nav>
		</div>
	</div>
</div>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		height: 10px;
		width: 10px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: #f8fafc;
		border-radius: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: #cbd5e1;
		border-radius: 4px;
		border: 2px solid #f8fafc;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: #94a3b8;
	}
</style>
