<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
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
            'orange': 'bg-orange-100 text-orange-800 border-orange-200',
            'red': 'bg-red-100 text-red-800 border-red-200',
            'blue': 'bg-blue-100 text-blue-800 border-blue-200',
            'gray': 'bg-gray-100 text-gray-800 border-gray-200',
            'green': 'bg-green-100 text-green-800 border-green-200',
        };
        return colors[colorStr] || colors['gray'];
    }
</script>

<!-- หน้าจอ Loading Overlay (จะแสดงก็ต่อเมื่อ isLoading = true) -->
{#if isLoading}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-sm transition-opacity">
        <div class="flex flex-col items-center p-6 bg-white rounded-xl shadow-lg border border-gray-100">
            <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            <p class="mt-4 text-blue-700 font-semibold text-lg">กำลังประมวลผลข้อมูล...</p>
            <p class="text-gray-400 text-sm mt-1">กรุณารอสักครู่</p>
        </div>
    </div>
{/if}

<div class="max-w-[100vw] p-6">
	<div class="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">{$t('ตารางการทำงานรายเดือน')}</h1>
			<p class="mt-1 text-sm text-gray-500">
				{$t('แสดงข้อมูลเวลาเข้า-ออก และชั่วโมงโอทีของพนักงาน (Active Employees)')}
			</p>
		</div>

        <!-- ตัวเลือกเดือน -->
        <div class="flex items-center gap-2">
            <label for="month" class="text-sm font-medium text-gray-700">เลือกเดือน:</label>
            <input 
                type="month" 
                id="month" 
                bind:value={selectedMonth} 
                on:change={handleMonthChange}
                class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
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

    <!-- ตารางข้อมูล -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto w-full max-h-[70vh] custom-scrollbar">
            <table class="min-w-max w-full text-left text-sm whitespace-nowrap border-collapse">
                <thead class="bg-gray-50 sticky top-0 z-20 shadow-sm text-gray-600">
                    <tr>
                        <!-- คอลัมน์พนักงาน (Sticky ซ้าย) -->
                        <th class="px-4 py-3 font-semibold border-b border-r border-gray-200 sticky left-0 z-30 bg-gray-50 min-w-[250px] align-middle">
                            รหัส - ชื่อพนักงาน
                        </th>
                        
                        <!-- คอลัมน์วันที่ 1-31 -->
                        {#each daysArray as day}
                            <!-- เพิ่มความกว้างคอลัมน์เพื่อรองรับข้อมูล 3 ช่อง -->
                            <th class="px-2 py-3 font-semibold border-b border-gray-200 text-center min-w-[130px]">
                                วันที่ {day}
                            </th>
                        {/each}
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    {#if data.employees && data.employees.length > 0}
                        {#each data.employees as emp}
                            <tr class="hover:bg-gray-50 transition-colors">
                                <!-- ชื่อพนักงาน (Sticky ซ้าย) -->
                                <td class="px-4 py-2 border-r border-gray-200 sticky left-0 z-10 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_0_#e5e7eb] align-middle">
                                    <div class="font-medium text-gray-800">{emp.emp_id}</div>
                                    <div class="text-gray-500 text-xs truncate max-w-[200px]">{emp.emp_name}</div>
                                </td>

                                <!-- วนลูปเช็คข้อมูลแต่ละวัน -->
                                {#each daysArray as day}
                                    {@const dateKey = `${data.targetYear}-${String(data.targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`}
                                    {@const shiftData = data.scheduleMap?.[emp.emp_id]?.[dateKey]}
                                    
                                    <td class="p-1.5 border-r border-gray-100 last:border-r-0 align-top">
                                        {#if shiftData}
                                            {@const isDayOff = shiftData.shift === 'O'}
                                            {@const hasOT = Number(shiftData.otHours) > 0}
                                            {@const hasWork = shiftData.timeIn || shiftData.timeOut || hasOT}
                                            
                                            <!-- กล่องแสดงข้อมูล 1 วัน (กะด้านบน, IN/OUT/OT ด้านล่าง) -->
                                            <div class="flex flex-col bg-white border {isDayOff ? 'border-gray-200' : 'border-gray-200'} rounded shadow-sm overflow-hidden h-full {isDayOff && !hasWork ? 'opacity-80' : 'hover:border-blue-300'} transition-colors">
                                                
                                                <!-- ส่วนหัวกะการทำงาน (Shift หรือ DAY OFF) -->
                                                <div class="text-center py-1 border-b border-gray-200 {isDayOff ? 'bg-gray-200 text-gray-600' : getColorClass(shiftData.color)}">
                                                    <span class="text-[11px] font-bold tracking-wide">{isDayOff ? 'DAY OFF' : shiftData.shift}</span>
                                                </div>
                                                
                                                <!-- ส่วนแบ่งข้อมูล IN / OUT / OT ออกเป็น 3 ช่อง -->
                                                {#if isDayOff && !hasWork}
                                                    <!-- กรณีเป็นวันหยุดและไม่ได้มาสแกนทำงาน (พักผ่อน) -->
                                                    <div class="flex-grow flex items-center justify-center bg-gray-50 text-gray-400 text-[10px] font-medium py-3">
                                                        พักผ่อน
                                                    </div>
                                                {:else}
                                                    <div class="grid grid-cols-3 divide-x divide-gray-100 text-[10px] text-center flex-grow">
                                                        <div class="py-1.5 flex flex-col justify-center {isDayOff ? 'bg-gray-50' : 'bg-gray-50'}">
                                                            <span class="text-gray-400 text-[8px] uppercase font-medium">IN</span>
                                                            <span class="font-medium {shiftData.timeIn ? 'text-green-700' : 'text-gray-400'}">{shiftData.timeIn || '-'}</span>
                                                        </div>
                                                        <div class="py-1.5 flex flex-col justify-center {isDayOff ? 'bg-gray-50' : 'bg-gray-50'}">
                                                            <span class="text-gray-400 text-[8px] uppercase font-medium">OUT</span>
                                                            <span class="font-medium {shiftData.timeOut ? 'text-orange-600' : 'text-gray-400'}">{shiftData.timeOut || '-'}</span>
                                                        </div>
                                                        <!-- ไฮไลท์ช่อง OT หากมีการทำโอที -->
                                                        <div class="py-1.5 flex flex-col justify-center {hasOT ? 'bg-blue-100' : (isDayOff ? 'bg-gray-50' : 'bg-blue-50/30')}">
                                                            <span class="{hasOT ? 'text-blue-800' : 'text-gray-400'} text-[8px] uppercase font-medium">OT</span>
                                                            <span class="font-bold {hasOT ? 'text-blue-700' : 'text-gray-400 font-medium'}">
                                                                {hasOT ? shiftData.otHours : '-'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                {/if}
                                                
                                            </div>
                                        {:else}
                                            <!-- กรณีไม่มีข้อมูลเข้างาน -->
                                            <div class="flex items-center justify-center w-full h-full min-h-[48px] rounded-md bg-gray-50/50 border border-dashed border-gray-200">
                                                <span class="text-gray-300 text-xs font-light">-</span>
                                            </div>
                                        {/if}
                                    </td>
                                {/each}
                            </tr>
                        {/each}
                    {:else}
                        <tr>
                            <td colspan={daysArray.length + 1} class="px-6 py-12 text-center text-gray-500">
                                ไม่พบข้อมูลพนักงาน Active ในแผนกของคุณ
                            </td>
                        </tr>
                    {/if}
                </tbody>
            </table>
        </div>
    </div>
</div>

<style>
    /* ปรับ Scrollbar ให้ดูสะอาดตาขึ้น */
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
