<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import type { PageData } from './$types';

	export let data: PageData;

	let selectedMonth = data.currentMonth;

	// ฟังก์ชันสร้าง Array ของวันที่ (1 ถึงจำนวนวันสิ้นเดือน)
	$: daysArray = Array.from({ length: data.daysInMonth || 31 }, (_, i) => i + 1);

	// จัดการเมื่อเปลี่ยนเดือน
	function handleMonthChange() {
		if (selectedMonth) {
			goto(`?month=${selectedMonth}`);
		}
	}

	// ฟังก์ชันช่วยแปลงสีจากฐานข้อมูลเป็น Tailwind Class
	function getColorClass(colorStr: string) {
		const colors: Record<string, string> = {
			orange: 'bg-orange-100 text-orange-800 border-orange-200',
			red: 'bg-red-100 text-red-800 border-red-200',
			blue: 'bg-blue-100 text-blue-800 border-blue-200',
			gray: 'bg-gray-100 text-gray-800 border-gray-200',
			green: 'bg-green-100 text-green-800 border-green-200'
		};
		return colors[colorStr] || colors['gray'];
	}
</script>

<div class="max-w-[100vw] p-6">
	<div class="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">{$t('ตารางการทำงานรายเดือน')}</h1>
			<p class="mt-1 text-sm text-gray-500">
				{$t('แสดงข้อมูลเวลาเข้า-ออก และชั่วโมงโอทีของพนักงาน (Active Employees)')}
			</p>
		</div>

		<div class="flex items-center gap-2">
			<label for="month" class="text-sm font-medium text-gray-700">{$t('เลือกเดือน:')}</label>
			<input
				type="month"
				id="month"
				bind:value={selectedMonth}
				on:change={handleMonthChange}
				class="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-blue-500"
			/>

			<button
				on:click={() => (window.location.href = `monthly-schedule/export?month=${selectedMonth}`)}
				class="inline-flex items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-green-700"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
					/>
				</svg>
				<span class="mt-0.5 leading-none">{$t('Export')}</span>
			</button>
		</div>
	</div>

	<div class="mb-4 flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
		<span class="mr-2 text-sm font-medium text-gray-700">{$t('สัญลักษณ์กะ:')}</span>
		{#each data.shifts as shift}
			<div class="flex items-center gap-1.5 text-xs">
				<span class="rounded border px-2 py-0.5 {getColorClass(shift.color_theme)} font-semibold">
					{shift.shift_code}
				</span>
				<span class="text-gray-600">= {shift.shift_name}</span>
			</div>
		{/each}
		<div class="ml-2 flex items-center gap-1.5 border-l border-gray-300 pl-3 text-xs">
			<span
				class="rounded border border-gray-300 bg-gray-200 px-2 py-0.5 font-semibold text-gray-600"
			>
				DAY OFF
			</span>
			<span class="text-gray-600">= {$t('วันหยุด')}</span>
		</div>
	</div>

	<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
		<div class="custom-scrollbar max-h-[70vh] w-full overflow-x-auto">
			<table class="w-full min-w-max border-collapse text-left text-sm whitespace-nowrap">
				<thead class="sticky top-0 z-20 bg-gray-50 text-gray-600 shadow-sm">
					<tr>
						<th
							class="sticky left-0 z-30 min-w-[250px] border-r border-b border-gray-200 bg-gray-50 px-4 py-3 align-middle font-semibold"
						>
							{$t('รหัส - ชื่อพนักงาน')}
						</th>
						{#each daysArray as day}
							<th
								class="min-w-[130px] border-b border-gray-200 px-2 py-3 text-center font-semibold"
							>
								{$t('วันที่')}
								{day}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					{#if data.employees && data.employees.length > 0}
						{#each data.employees as emp}
							<tr class="transition-colors hover:bg-gray-50">
								<td
									class="sticky left-0 z-10 border-r border-gray-200 bg-white px-4 py-2 align-middle shadow-[1px_0_0_0_#e5e7eb] group-hover:bg-gray-50"
								>
									<div class="font-medium text-gray-800">{emp.emp_id}</div>
									<div class="max-w-[200px] truncate text-xs text-gray-500">{emp.emp_name}</div>
								</td>

								{#each daysArray as day}
									{@const dateKey = `${data.targetYear}-${String(data.targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`}
									{@const shiftData = data.scheduleMap?.[emp.emp_id]?.[dateKey]}

									<td class="border-r border-gray-100 p-1.5 align-top last:border-r-0">
										{#if shiftData}
											{@const isDayOff = shiftData.shift === 'O'}
											{@const hasOT = Number(shiftData.otHours) > 0}
											{@const hasWork = shiftData.timeIn || shiftData.timeOut || hasOT}

											<div
												class="flex h-full flex-col overflow-hidden rounded border border-gray-200 bg-white shadow-sm {isDayOff &&
												!hasWork
													? 'opacity-80'
													: 'hover:border-blue-300'} transition-colors"
											>
												<div
													class="border-b border-gray-200 py-1 text-center {isDayOff
														? 'bg-gray-200 text-gray-600'
														: getColorClass(shiftData.color)}"
												>
													<span class="text-[11px] font-bold tracking-wide"
														>{isDayOff ? 'DAY OFF' : shiftData.shift}</span
													>
												</div>

												{#if isDayOff && !hasWork}
													<div
														class="flex flex-grow items-center justify-center bg-gray-50 py-3 text-[10px] font-medium text-gray-400"
													>
														{$t('พักผ่อน')}
													</div>
												{:else}
													<div
														class="grid flex-grow grid-cols-3 divide-x divide-gray-100 text-center text-[10px]"
													>
														<div class="flex flex-col justify-center bg-gray-50 py-1.5">
															<span class="text-[8px] font-medium text-gray-400 uppercase">IN</span>
															<span
																class="font-medium {shiftData.timeIn
																	? 'text-green-700'
																	: 'text-gray-400'}">{shiftData.timeIn || '-'}</span
															>
														</div>
														<div class="flex flex-col justify-center bg-gray-50 py-1.5">
															<span class="text-[8px] font-medium text-gray-400 uppercase">OUT</span
															>
															<span
																class="font-medium {shiftData.timeOut
																	? 'text-orange-600'
																	: 'text-gray-400'}">{shiftData.timeOut || '-'}</span
															>
														</div>
														<div
															class="flex flex-col justify-center py-1.5 {hasOT
																? 'bg-blue-100'
																: isDayOff
																	? 'bg-gray-50'
																	: 'bg-blue-50/30'}"
														>
															<span
																class="{hasOT
																	? 'text-blue-800'
																	: 'text-gray-400'} text-[8px] font-medium uppercase">OT</span
															>
															<span
																class="font-bold {hasOT
																	? 'text-blue-700'
																	: 'font-medium text-gray-400'}"
															>
																{hasOT ? shiftData.otHours : '-'}
															</span>
														</div>
													</div>
												{/if}
											</div>
										{:else}
											<div
												class="flex h-full min-h-[48px] w-full items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50/50"
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
