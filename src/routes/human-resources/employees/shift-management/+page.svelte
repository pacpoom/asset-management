<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import { navigating } from '$app/stores';

	let { data, form } = $props();

	let employees = $derived(data.employees || []);
	let shifts = $derived(data.shifts || []);
	let schedules = $derived(data.schedules || []);

	let selectedMonth = $state(data.currentMonth);
	let selectedYear = $state(data.currentYear);
	let searchQuery = $state(data.searchQuery);

	// การจัดรูปแบบสีของกะ
	const themeMap: Record<string, string> = {
		orange: 'bg-orange-100 text-orange-700',
		indigo: 'bg-indigo-100 text-indigo-700',
		gray: 'bg-gray-100 text-gray-700',
		red: 'bg-red-100 text-red-700',
		green: 'bg-green-100 text-green-700',
		blue: 'bg-blue-100 text-blue-700',
		purple: 'bg-purple-100 text-purple-700',
		yellow: 'bg-yellow-100 text-yellow-700'
	};

	function getShiftTheme(shiftCode: string) {
		const shift = shifts.find((s: any) => s.shift_code === shiftCode);
		return shift
			? themeMap[shift.color_theme] || themeMap['gray']
			: 'bg-gray-50 text-gray-400 border border-dashed border-gray-300';
	}

	// สร้างแมปข้อมูลตารางงานจากฐานข้อมูล
	let scheduleMap = $derived.by(() => {
		const map: Record<string, Record<string, string>> = {};
		for (const emp of employees) {
			map[emp.emp_id] = {};
		}
		for (const row of schedules) {
			if (!map[row.emp_id]) map[row.emp_id] = {};
			map[row.emp_id][row.work_date_str] = row.shift_code;
		}
		return map;
	});

	// คำนวณจำนวนวันในเดือนที่เลือก
	let daysInMonth = $derived.by(() => {
		const days = new Date(selectedYear, selectedMonth, 0).getDate();
		return Array.from({ length: days }, (_, i) => i + 1);
	});

	let daysHeaders = $derived.by(() => {
		const days = [];
		const dayNames = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
		for (let i = 1; i <= daysInMonth.length; i++) {
			const date = new Date(selectedYear, selectedMonth - 1, i);
			const isWeekend = date.getDay() === 0 || date.getDay() === 6;
			days.push({
				date: i,
				dayName: dayNames[date.getDay()],
				isWeekend,
				dateStr: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(i).padStart(2, '0')}`
			});
		}
		return days;
	});

	// --- ระบบจัดการเครื่องมือระบายสี (Paint Tool) ---
	let activePaintTool = $state<string | null>(null);
	let pendingChanges = $state<Record<string, string>>({});
	let isSaving = $state(false);

	// การใช้งานระบายสีช่อง (คลิกที่ช่อง)
	function applyShift(empId: string, dateStr: string) {
		if (!activePaintTool) return;

		const key = `${empId}|${dateStr}`;
		if (activePaintTool === 'ERASER') {
			pendingChanges[key] = 'DELETE';
		} else {
			pendingChanges[key] = activePaintTool;
		}
		// บังคับให้ Svelte อัปเดต Object
		pendingChanges = { ...pendingChanges };
	}

	// เทสีลงในทั้งคอลัมน์ (คลิกที่หัววันที่)
	function applyShiftToColumn(dateStr: string, displayDate: number) {
		if (!activePaintTool) return;

		const actionName = activePaintTool === 'ERASER' ? 'ลบกะ' : `กำหนดกะ ${activePaintTool}`;
		if (!confirm(`คุณต้องการ "${actionName}" ให้กับพนักงานทุกคนในวันที่ ${displayDate} หรือไม่?`))
			return;

		let newChanges = { ...pendingChanges };
		for (const emp of employees) {
			const key = `${emp.emp_id}|${dateStr}`;
			if (activePaintTool === 'ERASER') {
				newChanges[key] = 'DELETE';
			} else {
				newChanges[key] = activePaintTool;
			}
		}
		pendingChanges = newChanges;
	}

	// จัดกะอัตโนมัติ (เติมกะ Default ให้เฉพาะวันที่ยังว่าง)
	function autoAssignDefaults() {
		if (
			!confirm('ต้องการจัดกะอัตโนมัติตาม Default Shift สำหรับวันที่ว่างทั้งหมดในเดือนนี้หรือไม่?')
		)
			return;

		let newChanges = { ...pendingChanges };
		let assignedCount = 0;

		for (const emp of employees) {
			if (!emp.default_shift) continue;

			for (const day of daysHeaders) {
				const key = `${emp.emp_id}|${day.dateStr}`;
				const currentSavedShift = scheduleMap[emp.emp_id]?.[day.dateStr];
				const pendingShift = newChanges[key];

				// ข้ามถ้ามีกะอยู่แล้ว หรือมีการกำหนด pending change ไว้แล้ว
				if (!currentSavedShift && pendingShift !== 'DELETE' && !pendingShift) {
					newChanges[key] = emp.default_shift;
					assignedCount++;
				}
			}
		}
		pendingChanges = newChanges;
		alert(`จัดกะอัตโนมัติสำเร็จ ${assignedCount} รายการ (กรุณากดปุ่ม "บันทึก" เพื่อยืนยัน)`);
	}

	function changeFilter() {
		let url = `?month=${selectedMonth}&year=${selectedYear}`;
		if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
		goto(url);
		pendingChanges = {};
	}

	$effect(() => {
		if (form?.success) {
			pendingChanges = {};
		}
	});
</script>

<svelte:head>
	<title>{$t('Shift Management')}</title>
</svelte:head>

<div class="mb-4 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('จัดกะการทำงาน (Shift Management)')}</h1>
		<p class="mt-1 text-sm text-gray-500">
			คลิกเลือกกะด้านล่าง แล้วนำไปคลิกใส่ตารางของพนักงานได้เลย หรือคลิกที่ "วันที่"
			เพื่อกำหนดให้ทุกคน
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<input
			type="text"
			bind:value={searchQuery}
			placeholder="ค้นหารหัส / ชื่อ"
			class="w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
			onkeydown={(e) => e.key === 'Enter' && changeFilter()}
		/>

		<select
			bind:value={selectedMonth}
			onchange={changeFilter}
			class="cursor-pointer rounded-lg border border-gray-300 py-2 pr-8 pl-3 text-sm font-medium focus:border-blue-500 focus:outline-none"
		>
			{#each Array(12) as _, i}
				<option value={i + 1}>เดือน {i + 1}</option>
			{/each}
		</select>
		<select
			bind:value={selectedYear}
			onchange={changeFilter}
			class="cursor-pointer rounded-lg border border-gray-300 py-2 pr-8 pl-3 text-sm font-medium focus:border-blue-500 focus:outline-none"
		>
			{#each [data.currentYear - 1, data.currentYear, data.currentYear + 1] as y}
				<option value={y}>ปี {y}</option>
			{/each}
		</select>
		<button
			onclick={changeFilter}
			class="rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-gray-700"
		>
			{$t('กรองข้อมูล')}
		</button>
	</div>
</div>

{#if form?.message}
	<div
		class="mb-4 rounded-lg p-4 text-sm font-semibold {form.success
			? 'border border-green-200 bg-green-50 text-green-700'
			: 'border border-red-200 bg-red-50 text-red-700'}"
	>
		{form.message}
	</div>
{/if}

<!-- เครื่องมือจัดการกะ (Toolbar) -->
<div
	class="sticky top-0 z-20 mb-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white/90 p-4 shadow-sm backdrop-blur-md"
>
	<div class="flex items-center gap-2 overflow-x-auto pb-1">
		<span class="mr-2 text-sm font-bold whitespace-nowrap text-gray-700"
			><span class="material-symbols-outlined align-middle text-[18px]">palette</span> เลือกกะ :</span
		>

		{#each shifts as shift}
			<button
				onclick={() =>
					(activePaintTool = activePaintTool === shift.shift_code ? null : shift.shift_code)}
				class={`flex h-10 min-w-12 flex-col items-center justify-center rounded-lg border-2 px-2 text-xs font-bold transition-all
					${activePaintTool === shift.shift_code ? 'scale-110 border-gray-800 shadow-md' : 'border-transparent hover:border-gray-300'} 
					${themeMap[shift.color_theme] || themeMap['gray']}`}
				title={shift.shift_name}
			>
				<span>{shift.shift_code}</span>
				<span class="text-[10px] font-normal opacity-80"
					>{shift.start_time?.substring(0, 5) || '-'}</span
				>
			</button>
		{/each}

		<div class="mx-2 h-8 w-px bg-gray-300"></div>

		<!-- เครื่องมือยางลบ -->
		<button
			onclick={() => (activePaintTool = activePaintTool === 'ERASER' ? null : 'ERASER')}
			class={`flex h-10 w-12 flex-col items-center justify-center rounded-lg border-2 bg-gray-50 text-xs font-bold text-gray-600 transition-all
				${activePaintTool === 'ERASER' ? 'scale-110 border-red-500 text-red-600 shadow-md' : 'border-dashed border-gray-300 hover:border-gray-400'}`}
			title="ลบกะการทำงาน (ยางลบ)"
		>
			<span class="material-symbols-outlined text-[18px]">ink_eraser</span>
			<span class="text-[10px] font-normal">ลบ</span>
		</button>
	</div>

	<div class="flex gap-2 whitespace-nowrap">
		<button
			onclick={autoAssignDefaults}
			class="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
		>
			<span class="material-symbols-outlined text-[18px]">auto_awesome</span>
			{$t('จัดกะอัตโนมัติ (Default)')}
		</button>

		<form
			method="POST"
			action="?/saveShifts"
			use:enhance={() => {
				isSaving = true;
				return async ({ update }) => {
					await update();
					isSaving = false;
				};
			}}
		>
			<input type="hidden" name="changes" value={JSON.stringify(pendingChanges)} />
			<button
				type="submit"
				disabled={Object.keys(pendingChanges).length === 0 || isSaving}
				class="flex items-center gap-1 rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
			>
				<span class="material-symbols-outlined text-[18px]">save</span>
				{isSaving
					? $t('กำลังบันทึก...')
					: $t(`บันทึกการเปลี่ยนแปลง (${Object.keys(pendingChanges).length})`)}
			</button>
		</form>
	</div>
</div>

<!-- ตารางจัดกะ (Scheduler Grid) -->
<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
	<div class="max-h-[65vh] overflow-x-auto overflow-y-auto pb-4">
		<table class="w-full border-collapse text-center text-sm">
			<thead class="sticky top-0 z-10 bg-gray-100 text-xs text-gray-600 shadow-sm">
				<tr>
					<th
						class="sticky left-0 z-20 min-w-[200px] border-r border-b border-gray-200 bg-gray-100 p-3 text-left font-bold shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"
					>
						พนักงาน ({employees.length} คน)
					</th>
					{#each daysHeaders as day}
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<th
							class={`min-w-[40px] border-b border-gray-200 p-2 font-medium transition-colors select-none
								${day.isWeekend ? 'bg-red-50 text-red-600' : ''}
								${activePaintTool ? 'cursor-pointer ring-inset hover:bg-blue-200 hover:text-blue-800 hover:ring-2 hover:ring-blue-400' : ''}`}
							onclick={() => applyShiftToColumn(day.dateStr, day.date)}
							title={activePaintTool
								? `คลิกเพื่อกำหนดกะ "${activePaintTool}" ให้ทุกคนในวันนี้`
								: ''}
						>
							<div class="flex flex-col items-center">
								<span
									class="font-bold text-gray-800 {day.isWeekend && !activePaintTool
										? 'text-red-600'
										: ''}">{day.date}</span
								>
								<span class="text-[10px]">{day.dayName}</span>
								{#if activePaintTool}
									<span class="material-symbols-outlined mt-0.5 text-[14px] opacity-50"
										>format_color_fill</span
									>
								{/if}
							</div>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-100">
				{#if employees.length === 0}
					<tr
						><td colspan={daysHeaders.length + 1} class="p-8 text-center text-gray-500"
							>ไม่พบข้อมูลพนักงาน</td
						></tr
					>
				{/if}
				{#each employees as emp}
					<tr class="group transition-colors hover:bg-blue-50/30">
						<td
							class="sticky left-0 z-10 border-r border-gray-100 bg-white p-3 text-left shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] group-hover:bg-blue-50/80"
						>
							<div class="font-bold text-gray-800">{emp.emp_name}</div>
							<div class="flex items-center justify-between text-[11px] text-gray-500">
								<span>{emp.emp_id}</span>
								{#if emp.default_shift}
									<span class="rounded bg-gray-100 px-1 font-mono text-indigo-600"
										>Def: {emp.default_shift}</span
									>
								{/if}
							</div>
						</td>
						{#each daysHeaders as day}
							{@const key = `${emp.emp_id}|${day.dateStr}`}
							{@const dbShift = scheduleMap[emp.emp_id]?.[day.dateStr]}
							{@const pendingShift = pendingChanges[key]}

							<!-- ค่าที่จะแสดง: ค่าใหม่ที่ยังไม่บันทึก (ถ้ามี) หรือ ค่าจากฐานข้อมูล -->
							{@const displayShift =
								pendingShift !== undefined
									? pendingShift === 'DELETE'
										? null
										: pendingShift
									: dbShift}
							{@const isModified = pendingShift !== undefined}

							<td
								class={`relative border-r border-b border-gray-50 p-1 ${day.isWeekend ? 'bg-red-50/20' : ''}`}
							>
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class={`mx-auto flex h-8 w-8 cursor-pointer items-center justify-center rounded text-xs font-bold transition-all hover:scale-110 hover:ring-2 hover:ring-blue-400
										${displayShift ? getShiftTheme(displayShift) : 'bg-transparent text-gray-300 hover:bg-gray-100'}
										${isModified ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
									onclick={() => applyShift(emp.emp_id, day.dateStr)}
									title={displayShift ? `กะ ${displayShift}` : 'เว้นว่าง'}
								>
									{displayShift || '-'}
								</div>
								{#if isModified}
									<div
										class="absolute top-0 right-0 h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500"
									></div>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<!-- Loading Overlay สำหรับล็อกหน้าจอตอนกำลังบันทึกหรือเปลี่ยนเดือน/ค้นหา -->
{#if isSaving || $navigating}
	<div
		class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm"
		transition:fade={{ duration: 1000 }}
	>
		<div
			class="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"
		></div>
		<p class="mt-4 text-sm font-semibold tracking-wide text-gray-700">
			{isSaving ? $t('กำลังบันทึกข้อมูลกะ...') : $t('กำลังโหลดข้อมูล...')}
		</p>
	</div>
{/if}
