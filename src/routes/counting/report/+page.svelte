<script lang="ts">
	import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';

	const { data } = $props<{ data: PageData }>();
    
    let selectedActivityId = $state('');

    // Use onMount to safely access URL search params on the client-side
    onMount(() => {
        selectedActivityId = new URL(window.location.href).searchParams.get('activity_id') || '';
    });

    function handleActivityChange(event: Event) {
        const target = event.target as HTMLSelectElement;
        const newId = target.value;
        if (newId) {
            goto(`/counting/report?activity_id=${newId}`, { keepFocus: true });
        } else {
            goto('/counting/report', { keepFocus: true });
        }
    }

    function formatDateTime(isoString: string | null) {
        if (!isoString) return 'N/A';
        return new Date(isoString).toLocaleString('th-TH', { 
            year: 'numeric', month: 'long', day: 'numeric', 
            hour: '2-digit', minute: '2-digit', hour12: false 
        });
    }

    function getFoundStatusClass(status: string) {
		return {'Found':'bg-green-100 text-green-800','Unrecorded':'bg-orange-100 text-orange-800','Duplicate':'bg-red-100 text-red-800'}[status] || 'bg-gray-100 text-gray-800';
    }

    // --- NEW: Function to format status into Thai ---
    function formatFoundStatus(status: string) {
        const statuses: { [key: string]: string } = {
            'Found': 'นับสำเร็จ',
            'Unrecorded': 'สินทรัพย์เกิน (นอก Scope)',
            'Duplicate': 'สแกนซ้ำ'
        };
        return statuses[status] || status;
    }

    // --- CSV Export Functionality ---
    function exportToCsv(filename: string, dataArray: any[], headersToExport: { key: string; title: string }[]) {
        if (!dataArray || dataArray.length === 0) {
            alert('ไม่มีข้อมูลสำหรับส่งออก');
            return;
        }

        const headers = headersToExport.map(h => h.title);
        const keys = headersToExport.map(h => h.key);

        // Convert data to CSV format
        const csvRows = [
            headers.join(','), // Header row
            ...dataArray.map(row =>
                keys
                    .map(key => {
                        let value = row[key];
                        // Format date if needed
                        if (key === 'scanned_at' && value) {
                            value = formatDateTime(value);
                        }
                        // Format status if needed
                        if (key === 'found_status' && value) {
                            value = formatFoundStatus(value);
                        }
                        const stringValue = value === null || value === undefined ? '' : String(value);
                        // Escape quotes and wrap in quotes if it contains comma, newline, or quote
                        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                            return `"${stringValue.replace(/"/g, '""')}"`;
                        }
                        return stringValue;
                    })
                    .join(',')
            )
        ];

        const csvContent = '\uFEFF' + csvRows.join('\n'); // Add BOM for Excel UTF-8 support
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

        // Create a link and trigger the download
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function getBaseFilename() {
        if (!data.reportData) return 'report';
        const activityName = data.reportData.activity.name.replace(/[^a-z0-9]/gi, '_');
        return `Report_${activityName}`;
    }

    function exportMissing() {
        if (!data.reportData) return;
        const headers = [
            { key: 'asset_tag', title: 'Asset Tag' },
            { key: 'name', title: 'ชื่อสินทรัพย์' },
            { key: 'category_name', title: 'หมวดหมู่' },
            { key: 'location_name', title: 'สถานที่' },
            { key: 'assigned_user_name', title: 'ผู้รับผิดชอบ' }
        ];
        exportToCsv(`${getBaseFilename()}_Missing.csv`, data.reportData.missingList, headers);
    }

    function exportUnrecorded() {
        if (!data.reportData) return;
        const headers = [
            { key: 'asset_tag', title: 'Asset Tag' },
            { key: 'asset_name', title: 'ชื่อสินทรัพย์' },
            { key: 'location_name', title: 'สถานที่ (ตอนสแกน)' },
            { key: 'assigned_user_name', title: 'ผู้รับผิดชอบ (ตอนสแกน)' },
            { key: 'full_name', title: 'สแกนโดย' },
            { key: 'scanned_at', title: 'เวลาสแกน' }
        ];
        exportToCsv(`${getBaseFilename()}_Unrecorded.csv`, data.reportData.unrecordedList, headers);
    }
    
    function exportAllScans() {
        if (!data.reportData) return;
        const headers = [
            { key: 'asset_tag', title: 'Asset Tag' },
            { key: 'asset_name', title: 'ชื่อสินทรัพย์' },
            { key: 'found_status', title: 'สถานะ' },
            { key: 'full_name', title: 'สแกนโดย' },
            { key: 'scanned_at', title: 'เวลาสแกน' }
        ];
        exportToCsv(`${getBaseFilename()}_All_Scans.csv`, data.reportData.scanList, headers);
    }
</script>

<svelte:head>
	<title>รายงานผลการนับสินทรัพย์</title>
</svelte:head>

<!-- Main Header -->
<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center print:hidden">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">รายงานผลการนับสินทรัพย์</h1>
		<p class="mt-1 text-sm text-gray-500">เลือกกิจกรรมการนับเพื่อดูสรุปผล</p>
	</div>
    <div class="flex items-center gap-2 flex-wrap justify-end">
        <a href="/counting" class="rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50">
		    กลับไปหน้าการนับ
	    </a>
        <button onclick={exportMissing} disabled={!data.reportData || data.reportData.missingList.length === 0} class="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
		    Export Missing
	    </button>
        <button onclick={exportUnrecorded} disabled={!data.reportData || data.reportData.unrecordedList.length === 0} class="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed">
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
		    Export Unrecorded
	    </button>
         <button onclick={exportAllScans} disabled={!data.reportData || data.reportData.scanList.length === 0} class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
		    Export All Scans
	    </button>
        <button onclick={() => window.print()} disabled={!data.reportData} class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
		    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
		    พิมพ์รายงาน
	    </button>
    </div>
</div>

<!-- Activity Selector -->
<div class="mb-6 max-w-lg print:hidden">
    <label for="activity-select" class="mb-2 block text-sm font-medium text-gray-700">เลือกกิจกรรมการนับ:</label>
    <select id="activity-select" bind:value={selectedActivityId} onchange={handleActivityChange} class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
        <option value="">-- กรุณาเลือกกิจกรรม --</option>
        {#each data.activities as activity}
            <option value={activity.id}>{activity.name} (เริ่ม {formatDateTime(activity.start_date)})</option>
        {/each}
    </select>
</div>

<!-- Report Display Area -->
{#if data.reportData}
    {@const report = data.reportData}
    <div class="space-y-8 rounded-lg border border-gray-200 bg-white p-6 printable-area">
        <!-- Report Header -->
        <div class="border-b pb-4 text-center">
            <h2 class="text-3xl font-bold text-gray-900">{report.activity.name}</h2>
            <p class="mt-2 text-gray-600">
                <strong>วันที่เริ่ม:</strong> {formatDateTime(report.activity.start_date)}
                {#if report.activity.end_date}| <strong>วันที่สิ้นสุด:</strong> {formatDateTime(report.activity.end_date)}{/if}
            </p>
            <p class="text-gray-600">
                <strong>ขอบเขตการนับ:</strong> 
                สถานที่: <span class="font-semibold">{report.activity.location_name ?? 'ทั้งหมด'}</span>,
                หมวดหมู่: <span class="font-semibold">{report.activity.category_name ?? 'ทั้งหมด'}</span>
            </p>
        </div>

        <!-- Summary -->
        <div>
            <h3 class="text-xl font-semibold text-gray-800 mb-4">สรุปผลการนับ</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center"><p class="text-sm font-medium text-gray-600">สินทรัพย์ใน Scope</p><p class="text-3xl font-bold text-gray-900">{report.summary.expected}</p></div>
                <div class="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center"><p class="text-sm font-medium text-blue-700">สแกนทั้งหมด</p><p class="text-3xl font-bold text-blue-900">{report.summary.scanned}</p></div>
                <div class="rounded-lg border border-green-200 bg-green-50 p-4 text-center"><p class="text-sm font-medium text-green-700">สแกนพบ (ใน Scope)</p><p class="text-3xl font-bold text-green-900">{report.summary.found}</p></div>
                <div class="rounded-lg border border-orange-200 bg-orange-50 p-4 text-center"><p class="text-sm font-medium text-orange-700">สินทรัพย์เกิน (นอก Scope)</p><p class="text-3xl font-bold text-orange-900">{report.summary.unrecorded}</p></div>
                <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-center"><p class="text-sm font-medium text-red-700">สินทรัพย์ที่ขาด</p><p class="text-3xl font-bold text-red-900">{report.summary.missing}</p></div>
            </div>
        </div>

        <!-- Missing Assets List -->
        <div class="page-break">
            <h3 class="text-xl font-semibold text-gray-800 mb-4">รายการสินทรัพย์ที่ขาด ({report.missingList.length} รายการ)</h3>
            {#if report.missingList.length > 0}
                <div class="overflow-x-auto rounded-lg border">
                    <table class="min-w-full divide-y divide-gray-200 text-sm">
                        <thead class="bg-red-50"><tr><th class="px-4 py-3 text-left font-semibold text-red-800">Asset Tag</th><th class="px-4 py-3 text-left font-semibold text-red-800">ชื่อสินทรัพย์</th><th class="px-4 py-3 text-left font-semibold text-red-800">หมวดหมู่</th><th class="px-4 py-3 text-left font-semibold text-red-800">สถานที่</th><th class="px-4 py-3 text-left font-semibold text-red-800">ผู้รับผิดชอบ</th></tr></thead>
                        <tbody class="divide-y divide-gray-200">
                            {#each report.missingList as asset}
                                <tr class="bg-red-50/50"><td class="px-4 py-2 font-mono text-xs text-red-900">{asset.asset_tag}</td><td class="px-4 py-2 text-red-800">{asset.name}</td><td class="px-4 py-2 text-red-800">{asset.category_name ?? 'N/A'}</td><td class="px-4 py-2 text-red-800">{asset.location_name ?? 'N/A'}</td><td class="px-4 py-2 text-red-800">{asset.assigned_user_name ?? 'N/A'}</td></tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}
                <p class="text-center text-gray-500 py-4">ไม่พบสินทรัพย์ที่ขาด</p>
            {/if}
        </div>

        <!-- Unrecorded Assets List -->
        <div class="page-break">
            <h3 class="text-xl font-semibold text-gray-800 mb-4">รายการสินทรัพย์เกิน (นอก Scope) ({report.unrecordedList.length} รายการ)</h3>
             {#if report.unrecordedList.length > 0}
                <div class="overflow-x-auto rounded-lg border">
                    <table class="min-w-full divide-y divide-gray-200 text-sm">
                        <thead class="bg-orange-50"><tr><th class="px-4 py-3 text-left font-semibold text-orange-800">Asset Tag</th><th class="px-4 py-3 text-left font-semibold text-orange-800">ชื่อสินทรัพย์</th><th class="px-4 py-3 text-left font-semibold text-orange-800">สถานที่</th><th class="px-4 py-3 text-left font-semibold text-orange-800">ผู้รับผิดชอบ</th><th class="px-4 py-3 text-left font-semibold text-orange-800">สแกนโดย</th><th class="px-4 py-3 text-left font-semibold text-orange-800">เวลาสแกน</th></tr></thead>
                        <tbody class="divide-y divide-gray-200">
                            {#each report.unrecordedList as scan}
                                <tr class="bg-orange-50/50"><td class="px-4 py-2 font-mono text-xs text-orange-900">{scan.asset_tag}</td><td class="px-4 py-2 text-orange-800">{scan.asset_name ?? 'N/A'}</td><td class="px-4 py-2 text-orange-800">{scan.location_name ?? 'N/A'}</td><td class="px-4 py-2 text-orange-800">{scan.assigned_user_name ?? 'N/A'}</td><td class="px-4 py-2 text-orange-800">{scan.full_name}</td><td class="px-4 py-2 text-orange-800 text-xs">{formatDateTime(scan.scanned_at)}</td></tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}
                <p class="text-center text-gray-500 py-4">ไม่พบสินทรัพย์เกิน</p>
            {/if}
        </div>

         <!-- All Scans List -->
        <div class="page-break">
            <h3 class="text-xl font-semibold text-gray-800 mb-4">ประวัติการสแกนทั้งหมด ({report.scanList.length} รายการ)</h3>
            <div class="overflow-x-auto rounded-lg border">
                <table class="min-w-full divide-y divide-gray-200 text-sm">
                    <thead class="bg-gray-50"><tr><th class="px-4 py-3 text-left font-semibold text-gray-600">Asset Tag</th><th class="px-4 py-3 text-left font-semibold text-gray-600">ชื่อสินทรัพย์</th><th class="px-4 py-3 text-left font-semibold text-gray-600">สถานะ</th><th class="px-4 py-3 text-left font-semibold text-gray-600">สแกนโดย</th><th class="px-4 py-3 text-left font-semibold text-gray-600">เวลาสแกน</th></tr></thead>
                    <tbody class="divide-y divide-gray-200">
                        {#each report.scanList as scan}
                            <tr>
                                <td class="px-4 py-2 font-mono text-xs">{scan.asset_tag}</td>
                                <td class="px-4 py-2">{scan.asset_name ?? 'N/A'}</td>
                                <td class="px-4 py-2">
                                    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getFoundStatusClass(scan.found_status)}">
                                        {formatFoundStatus(scan.found_status)}
                                    </span>
                                </td>
                                <td class="px-4 py-2">{scan.full_name}</td>
                                <td class="px-4 py-2 text-xs">{formatDateTime(scan.scanned_at)}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>

    </div>
{:else if selectedActivityId}
    <div class="flex items-center justify-center p-12 text-gray-500 border rounded-lg">
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        กำลังโหลดรายงาน...
    </div>
{:else}
    <div class="text-center p-12 text-gray-500 border rounded-lg">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto h-12 w-12 text-gray-400 mb-4"><path d="m14 2-2.1 2.1L6.3 9.7l-2.4 2.4L2 14.1V22h7.9l2-1.9 2.4-2.4 5.6-5.6L22 6.5Z"/><path d="m14.1 14.1 4.2-4.2L22 6.5l-3.5-3.5-3.5 3.5-4.2 4.2"/><path d="m5 19 6-6"/></svg>
        <h3 class="text-lg font-medium text-gray-800">กรุณาเลือกกิจกรรมการนับ</h3>
        <p class="mt-1 text-sm">เลือกกิจกรรมจากเมนูด้านบนเพื่อแสดงผลรายงาน</p>
    </div>
{/if}

<style>
    @media print {
        .print\:hidden {
            display: none;
        }
        :global(body) {
            background-color: white !important;
        }
        .printable-area {
            border: none;
            box-shadow: none;
            padding: 0;
            margin: 0;
        }
        .page-break {
            page-break-before: always;
        }
        @page {
            size: A4;
            margin: 1cm;
        }
    }
</style>