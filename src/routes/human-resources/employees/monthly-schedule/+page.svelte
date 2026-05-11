<script lang="ts">
    import { goto } from '$app/navigation';
    import { page, navigating } from '$app/stores';
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
            'orange': 'bg-orange-100 text-orange-800 border-orange-200',
            'red': 'bg-red-100 text-red-800 border-red-200',
            'blue': 'bg-blue-100 text-blue-800 border-blue-200',
            'gray': 'bg-gray-100 text-gray-800 border-gray-200',
            'green': 'bg-green-100 text-green-800 border-green-200',
        };
        return colors[colorStr] || 'bg-gray-100 text-gray-800 border-gray-200';
    }

    // ฟังก์ชันคำนวณและแสดงผล OT
    function getOTDisplay(dayData: any, dateStr: string) {
        if (!dayData) return null;

        // 1. ถ้ามีชั่วโมง OT จากฐานข้อมูล (คำนวณแล้ว) ให้ยึดค่าจาก DB เป็นหลัก
        if (dayData.otHours && Number(dayData.otHours) > 0) {
            return `${Number(dayData.otHours)}h`;
        }

        // 2. ตรวจสอบข้อมูลเบื้องต้น
        const actualTimeOut = dayData.timeOut || dayData.scan_out_time;
        if (!actualTimeOut || !dateStr || !dayData.shift) return null;

        // 3. หาข้อมูลกะจาก shift_master (ดึงผ่านตัวแปร data.shifts ที่มาจาก +page.server.ts)
        const shift = data.shifts?.find((s: any) => s.shift_code === dayData.shift);
        if (!shift || !shift.ot_start_time || !shift.start_time) return null;

        try {
            const [wYear, wMonth, wDay] = dateStr.split('-').map(Number);
            
            // ปรับแก้ Date parsing รองรับ String จาก SQL ที่มักจะคั่นด้วยช่องว่าง "YYYY-MM-DD HH:mm:ss"
            const normalizedTimeOut = typeof actualTimeOut === 'string' ? actualTimeOut.replace(' ', 'T') : actualTimeOut;
            const scanOutDate = new Date(normalizedTimeOut);
            
            const [startH, startM] = shift.start_time.split(':').map(Number);
            const [otH, otM] = shift.ot_start_time.split(':').map(Number);

            // ตรวจสอบว่าเวลาเริ่ม OT ข้ามไปวันถัดไปหรือไม่?
            const isNextDay = otH < startH;
            
            // สร้าง Date Object สำหรับเทียบเวลาสแกนออก กับ เวลาเริ่ม OT ของกะนั้นๆ
            const targetOtStart = new Date(wYear, wMonth - 1, isNextDay ? wDay + 1 : wDay, otH, otM, 0);

            // 4. ถ้าเวลาสแกนออก มากกว่าหรือเท่ากับ เวลาเริ่ม OT
            if (scanOutDate >= targetOtStart) {
                // คำนวณความต่างของเวลาเป็นนาที
                const diffMs = scanOutDate.getTime() - targetOtStart.getTime();
                const diffMins = Math.floor(diffMs / 60000);
                
                // คำนวณชั่วโมง (ปัดเศษลงทุกๆ 30 นาที จะได้ 0.5 ชั่วโมง)
                const calculatedHours = Math.floor(diffMins / 30) * 0.5;
                
                if (calculatedHours > 0) {
                    return `${calculatedHours}h*`; // มี * ต่อท้ายให้รู้ว่าระบบคำนวณสด
                }
                return 'OT'; // หากเลยเวลาเริ่มมานิดหน่อย (ไม่ถึง 30 นาที) โชว์ป้าย OT ไว้
            }
        } catch (e) {
            console.error("Error calculating real-time OT:", e);
        }

        return null;
    }

    // ฟังก์ชันช่วย Format เวลาให้ดูอ่านง่าย (เช่น 07:30) และรองรับ SQL Date String ป้องกันบัค Invalid Date
    function formatTime(dateTimeStr: string | Date | null | undefined) {
        if (!dateTimeStr) return '';
        
        let d: Date;
        if (dateTimeStr instanceof Date) {
            d = dateTimeStr;
        } else {
            // เติม T เข้าไประหว่างวันที่กับเวลา ถ้ามีเว้นวรรค
            const normalizedStr = typeof dateTimeStr === 'string' ? dateTimeStr.replace(' ', 'T') : String(dateTimeStr);
            d = new Date(normalizedStr);
        }
        
        if (isNaN(d.getTime())) return ''; // หากแปลงไม่ได้ส่งค่าว่างกลับไป ให้ Fallback แสดง --:--
        
        return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    }
</script>

<div class="flex flex-col h-screen bg-gray-50">
    <!-- Header Section -->
    <div class="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <div>
            <h1 class="text-xl font-bold text-gray-800">ตารางกะการทำงาน (Monthly Schedule)</h1>
            <p class="text-sm text-gray-500">ตรวจสอบตารางกะและเวลาสแกนเข้า-ออกของพนักงาน</p>
        </div>
        
        <div class="flex items-center space-x-4">
            <!-- Loading Indicator -->
            {#if $navigating}
                <div class="flex items-center text-blue-600 text-sm font-medium">
                    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    กำลังโหลดข้อมูล...
                </div>
            {/if}

            <input 
                type="month" 
                bind:value={selectedMonth} 
                on:change={handleMonthChange}
                class="px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm font-medium text-gray-700"
            />
            
            <button 
                on:click={() => window.location.href = `export?month=${selectedMonth}`}
                class="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm transition-colors text-sm font-medium">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                Export Excel
            </button>
        </div>
    </div>

    <!-- Table Section -->
    <div class="flex-1 overflow-hidden p-6">
        <div class="h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-auto custom-scrollbar">
            <table class="w-full text-sm text-left whitespace-nowrap">
                <thead class="sticky top-0 bg-gray-100 text-gray-700 shadow-sm z-20">
                    <tr>
                        <th class="sticky left-0 bg-gray-100 px-4 py-3 font-semibold border-b border-r border-gray-200 min-w-[280px] z-30">
                            ข้อมูลพนักงาน
                        </th>
                        {#each daysArray as day}
                            <th class="px-3 py-3 font-semibold text-center border-b border-gray-200 min-w-[120px]">
                                {day}
                            </th>
                        {/each}
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    {#if data.employees && data.employees.length > 0}
                        {#each data.employees as emp}
                            <tr class="hover:bg-blue-50/50 transition-colors">
                                <!-- Employee Info Column -->
                                <td class="sticky left-0 bg-white px-4 py-3 border-r border-gray-200 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] group-hover:bg-blue-50/50 align-top">
                                    <div class="flex flex-col gap-1">
                                        <div class="flex items-baseline justify-between">
                                            <span class="font-semibold text-gray-800 text-sm">{emp.emp_name}</span>
                                            <span class="text-[11px] font-mono font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{emp.emp_id}</span>
                                        </div>
                                        <div class="grid grid-cols-1 gap-1 text-[11px] text-gray-500 mt-1">
                                            {#if emp.division || emp.section}
                                                <div class="flex items-center truncate" title="{emp.division || '-'} / {emp.section || '-'}">
                                                    <span class="w-12 text-gray-400 shrink-0">Div/Sec:</span> 
                                                    <span class="truncate font-medium text-gray-600">{emp.division || '-'} <span class="text-gray-300 mx-0.5">/</span> {emp.section || '-'}</span>
                                                </div>
                                            {/if}
                                            {#if emp.emp_group}
                                                <div class="flex items-center truncate" title="{emp.emp_group}">
                                                    <span class="w-12 text-gray-400 shrink-0">Group:</span>
                                                    <span class="truncate font-medium text-gray-600">{emp.emp_group}</span>
                                                </div>
                                            {/if}
                                            {#if emp.position_name}
                                                <div class="flex mt-0.5">
                                                    <span class="text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded text-[10px] font-medium truncate" title="{emp.position_name}">{emp.position_name}</span>
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                </td>

                                <!-- Days Columns -->
                                {#each daysArray as day}
                                    {@const dateStr = `${data.targetYear}-${String(data.targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`}
                                    {@const dayData = data.scheduleMap?.[emp.emp_id]?.[dateStr]}
                                    
                                    <td class="px-2 py-2 text-center border-r border-gray-100 last:border-r-0 align-top">
                                        {#if dayData}
                                            {@const actualTimeIn = dayData.timeIn || dayData.scan_in_time}
                                            {@const actualTimeOut = dayData.timeOut || dayData.scan_out_time}
                                            {@const otDisplay = getOTDisplay(dayData, dateStr)}
                                            
                                            <div class="flex flex-col items-center gap-1.5 p-1.5 rounded-lg border {getColorClass(dayData.color)} bg-opacity-30 h-full justify-center">
                                                <div class="flex items-center justify-center gap-1">
                                                    <!-- Shift Badge -->
                                                    <span class="font-bold text-xs px-1.5 py-0.5 rounded bg-white bg-opacity-75 shadow-sm">
                                                        {dayData.shift}
                                                    </span>
                                                    
                                                    <!-- แสดง OT ถัดจากจุดสี (คำนวณจาก Shift Master หรือ DB) -->
                                                    {#if otDisplay}
                                                        <span class="ml-1 text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded shadow-sm" title="OT (Real-time Calculation)">
                                                            {otDisplay}
                                                        </span>
                                                    {/if}
                                                </div>
                                                
                                                <!-- Time In/Out -->
                                                <div class="text-[10px] font-medium bg-white px-2 py-1 rounded shadow-sm flex flex-col items-center w-full mt-0.5">
                                                    {#if actualTimeIn || actualTimeOut}
                                                        <div class="flex items-center space-x-1 w-full justify-center">
                                                            <span class="text-green-600">{formatTime(actualTimeIn) || '--:--'}</span>
                                                            <span class="text-gray-300 leading-none">|</span>
                                                            <span class="text-blue-600">{formatTime(actualTimeOut) || '--:--'}</span>
                                                        </div>
                                                    {:else}
                                                        <span class="text-gray-400">ไม่มีสแกน</span>
                                                    {/if}
                                                </div>
                                            </div>
                                        {:else}
                                            <!-- กรณีไม่มีข้อมูลเข้างาน -->
                                            <div class="flex items-center justify-center w-full h-full min-h-[48px] rounded-md bg-gray-50 border border-dashed border-gray-200">
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