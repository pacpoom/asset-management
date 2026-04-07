<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { enhance } from '$app/forms';
    import { t, locale } from '$lib/i18n';
    import type { PageData } from './$types';

    export let data: PageData;

    // ผูกค่าตัวแปรกับ Search Parameters
    let container_no = data.searchParams.container_no;
    let plan_no = data.searchParams.plan_no;
    let create_date_start = data.searchParams.create_date_start;
    let create_date_end = data.searchParams.create_date_end;
    let pageSize = data.pageSize || 10;

    // ตัวแปรสำหรับจัดการ Modal Packing List
    let showModal = false;
    let selectedContainer = '';
    let modalData: any[] = [];
    let isLoadingModal = false;

    // ตัวแปรสำหรับจัดการ Modal Add Plan และ Import
    let showAddModal = false;
    let isAdding = false;
    let isImporting = false;

    // ฟังก์ชันเปิด Modal และโหลดข้อมูล
    async function openPackingListModal(cNo: string) {
        if (!cNo || cNo === '-') return;
        selectedContainer = cNo;
        showModal = true;
        isLoadingModal = true;
        modalData = [];

        try {
            // เรียก API endpoint ที่สร้างขึ้นใหม่ โดยอ้างอิงจาก path ปัจจุบัน
            const res = await fetch(`${$page.url.pathname}/api-packing-list?container_no=${encodeURIComponent(cNo)}`);
            if (res.ok) {
                modalData = await res.json();
            } else {
                console.error('Failed to load packing list');
            }
        } catch (error) {
            console.error('Error fetching packing list:', error);
        } finally {
            isLoadingModal = false;
        }
    }

    // ฟังก์ชันปิด Modal
    function closeModal() {
        showModal = false;
        selectedContainer = '';
        modalData = [];
    }

    // ฟังก์ชันค้นหา (ทำงานเมื่อกดปุ่มเท่านั้น)
    function search() {
        const url = new URL($page.url);
        
        if (container_no) url.searchParams.set('container_no', container_no);
        else url.searchParams.delete('container_no');

        if (plan_no) url.searchParams.set('plan_no', plan_no);
        else url.searchParams.delete('plan_no');

        if (create_date_start) url.searchParams.set('create_date_start', create_date_start);
        else url.searchParams.delete('create_date_start');

        if (create_date_end) url.searchParams.set('create_date_end', create_date_end);
        else url.searchParams.delete('create_date_end');

        url.searchParams.set('pageSize', pageSize.toString());
        url.searchParams.set('page', '1'); 
        goto(url.toString(), { keepFocus: true, replaceState: true });
    }

    // ฟังก์ชันล้างค่าค้นหา
    function clearSearch() {
        container_no = '';
        plan_no = '';
        
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const firstDay = new Date(year, month, 1).toLocaleDateString('en-CA');
        const lastDay = new Date(year, month + 1, 0).toLocaleDateString('en-CA');
        
        create_date_start = firstDay;
        create_date_end = lastDay;
        
        pageSize = 10;
        search();
    }

    // ฟังก์ชันจัดรูปแบบวันที่เวลาให้ออกมาเป็น yyyy-MM-dd HH:mm:ss
    function formatDateTime(val: any) {
        if (!val) return '-';
        const d = new Date(val);
        if (isNaN(d.getTime())) return val;
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    // --- Pagination Logic ---
    $: paginationRange = (() => {
        const delta = 1;
        const left = data.page - delta;
        const right = data.page + delta + 1;
        const range: number[] = [];
        const rangeWithDots: (number | string)[] = [];
        let l: number | undefined;
        
        for (let i = 1; i <= data.totalPages; i++) {
            if (i == 1 || i == data.totalPages || (i >= left && i < right)) {
                range.push(i);
            }
        }
        for (const i of range) {
            if (l) {
                if (i - l === 2) {
                    rangeWithDots.push(l + 1);
                } else if (i - l !== 1) {
                    rangeWithDots.push('...');
                }
            }
            rangeWithDots.push(i);
            l = i;
        }
        return rangeWithDots;
    })();

    function getPageUrl(pageNum: number) {
        const params = new URLSearchParams($page.url.searchParams);
        params.set('page', pageNum.toString());
        params.set('pageSize', pageSize.toString());
        return `${$page.url.pathname}?${params.toString()}`;
    }

    function changeLimit(newLimit: string) {
        pageSize = Number(newLimit);
        const params = new URLSearchParams($page.url.searchParams);
        params.set('pageSize', newLimit);
        params.set('page', '1');
        goto(`${$page.url.pathname}?${params.toString()}`, {
            keepFocus: true,
            noScroll: true,
            replaceState: true
        });
    }

    $: startItem = data.total === 0 ? 0 : ((data.page - 1) * data.pageSize) + 1;
    $: endItem = Math.min(data.page * data.pageSize, data.total);
</script>

<svelte:head>
    <title>{$t('Container Order Plan')}</title>
</svelte:head>

<div class="p-6 max-w-full mx-auto bg-gray-50 min-h-screen relative">
    
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 class="text-2xl font-bold text-gray-800">{$t('Container Order Plan')}</h1>
        
        <!-- ส่วนปุ่มจัดการข้อมูล (Add / Import) -->
        <div class="flex flex-wrap items-center gap-2">
            <!-- ฟอร์ม Import Data -->
            <form method="POST" action="?/import" enctype="multipart/form-data" use:enhance={() => {
                isImporting = true;
                return async ({ result, update }) => {
                    isImporting = false;
                    if (result.type === 'success') {
                        alert('นำเข้าข้อมูลสำเร็จ');
                        update();
                    } else {
                        alert('เกิดข้อผิดพลาดในการนำเข้าข้อมูล');
                    }
                };
            }}>
                <label class="cursor-pointer bg-purple-600 text-white px-4 py-2 text-sm font-bold rounded-lg hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-2" class:opacity-70={isImporting} class:cursor-not-allowed={isImporting}>
                    {#if isImporting}
                        <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        {$t('Importing...')}
                    {:else}
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        {$t('Import')}
                    {/if}
                    <input type="file" name="file" accept=".xlsx,.xls,.csv" class="hidden" on:change={(e) => {
                        if(e?.currentTarget?.files && e.currentTarget.files.length > 0) e.currentTarget.form?.requestSubmit();
                    }} disabled={isImporting}>
                </label>
            </form>

            <!-- ปุ่มเปิด Modal Add Plan -->
            <button on:click={() => showAddModal = true} class="bg-blue-600 text-white px-4 py-2 text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {$t('Add Plan')}
            </button>
        </div>
    </div>

    <!-- ส่วนของฟอร์มค้นหา -->
    <div class="bg-white p-5 rounded-xl shadow-sm mb-6 border border-gray-200">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
                <label for="search-plan-no" class="block text-sm font-medium text-gray-700 mb-1">{$t('Plan No')}</label>
                <input 
                    id="search-plan-no"
                    type="text" 
                    bind:value={plan_no} 
                    class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                    placeholder="{$t('Search Plan No...')}" 
                />
            </div>
            <div>
                <label for="search-container-no" class="block text-sm font-medium text-gray-700 mb-1">{$t('Container No')}</label>
                <input 
                    id="search-container-no"
                    type="text" 
                    bind:value={container_no} 
                    class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                    placeholder="{$t('Search Container No...')}" 
                />
            </div>
            <div>
                <label for="search-date-start" class="block text-sm font-medium text-gray-700 mb-1">{$t('Create Date (From)')}</label>
                <input 
                    id="search-date-start"
                    type="date" 
                    bind:value={create_date_start} 
                    class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                />
            </div>
            <div>
                <label for="search-date-end" class="block text-sm font-medium text-gray-700 mb-1">{$t('Create Date (To)')}</label>
                <input 
                    id="search-date-end"
                    type="date" 
                    bind:value={create_date_end} 
                    class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                />
            </div>
        </div>
        
        <!-- ปรับแต่งส่วนปุ่มให้ชิดขวาด้วย justify-end -->
        <div class="mt-5 pt-4 border-t border-gray-100 flex flex-wrap gap-3 items-center justify-end">
            <!-- ปุ่มล้างข้อมูล -->
            <button on:click={clearSearch} class="bg-white text-gray-700 px-5 py-2 text-sm font-bold rounded-lg hover:bg-gray-50 transition-colors border border-gray-300 shadow-sm">
                {$t('Clear Filter')}
            </button>
            
            <!-- ปุ่มค้นหา (ทำงานแบบ On Click) -->
            <button on:click={search} class="bg-blue-600 text-white px-5 py-2 text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/>
                </svg>
                {$t('Search')}
            </button>

            <!-- ปุ่ม Download Template -->
            <a 
                href="{$page.url.pathname}/export-template"
                target="_blank"
                class="bg-white text-blue-600 border border-blue-600 px-5 py-2 text-sm font-bold rounded-lg hover:bg-blue-50 transition-colors shadow-sm flex items-center gap-2 ml-4"
            >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {$t('Download Template')}
            </a>

            <!-- ปุ่ม Export Excel -->
            <a 
                href="{$page.url.pathname}/export{$page.url.search ? $page.url.search + '&' : '?'}locale={$locale}"
                target="_blank"
                class="bg-green-600 text-white px-5 py-2 text-sm font-bold rounded-lg hover:bg-green-700 transition-colors shadow-sm flex items-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {$t('Export Excel')}
            </a>
        </div>
    </div>

    <!-- ส่วนของตารางแสดงผล -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-4">
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-sm whitespace-nowrap text-left border-collapse">
                <thead class="bg-gray-100 text-gray-700 border-b border-gray-200">
                    <tr>
                        <th class="px-4 py-3 font-semibold text-center border-r border-gray-200">{$t('Status')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Plan No')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Container No')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('House B/L')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Week Lot')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Vessel')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Model')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Type')}</th>
                        <th class="px-4 py-3 font-semibold">{$t('Create Date')}</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    {#each data.data as item}
                        <tr class="hover:bg-blue-50/50 transition-colors">
                            <td class="px-4 py-3 text-center border-r border-gray-100">
                                {#if item.status === 1}
                                    <span class="px-2 py-1 text-xs font-semibold text-orange-700 bg-orange-100 rounded-md">{$t('Pending')}</span>
                                {:else if item.status === 2}
                                    <span class="px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-100 rounded-md">{$t('Received')}</span>
                                {:else if item.status === 3}
                                    <span class="px-2 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-md">{$t('Shipped Out')}</span>
                                {:else if item.status === 4}
                                    <span class="px-2 py-1 text-xs font-semibold text-red-700 bg-red-100 rounded-md">{$t('Returned')}</span>
                                {:else}
                                    <span class="px-2 py-1 text-xs font-semibold text-gray-700 bg-gray-100 rounded-md">{item.status_label || '-'}</span>
                                {/if}
                            </td>
                            <td class="px-4 py-3 text-gray-800 font-medium border-r border-gray-100">{item.plan_no || '-'}</td>
                            
                            <!-- เปลี่ยน Container No เป็นปุ่มที่กดเปิด Modal ได้ -->
                            <td class="px-4 py-3 font-medium border-r border-gray-100">
                                {#if item.container_no}
                                    <button 
                                        on:click={() => openPackingListModal(item.container_no)} 
                                        class="text-blue-600 hover:text-blue-800 hover:underline focus:outline-none flex items-center gap-1"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                        </svg>
                                        {item.container_no}
                                    </button>
                                {:else}
                                    <span class="text-gray-800">-</span>
                                {/if}
                            </td>
                            
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100">{item.house_bl || '-'}</td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100 text-center">{item.week_lot || '-'}</td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100 truncate max-w-[200px]" title={item.vessel}>{item.vessel || '-'}</td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100">{item.model || '-'}</td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100">{item.type || '-'}</td>
                            <td class="px-4 py-3 text-gray-600">{formatDateTime(item.created_at)}</td>
                        </tr>
                    {:else}
                        <tr>
                            <td colspan="9" class="px-6 py-12 text-center text-gray-500">
                                {$t('No data found matching the search criteria')}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>

    <!-- Pagination & Paging Size -->
    {#if data.total > 0}
        <div class="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row pb-6">
            <div class="flex items-center gap-4">
                <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-700">{$t('Show')}</span>
                    <select
                        class="rounded-md border border-gray-300 py-1 pr-8 pl-3 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white"
                        value={data.pageSize.toString()}
                        on:change={(e) => changeLimit(e.currentTarget.value)}
                    >
                        <option value="10">10</option>
                        <option value="20">20</option>
                        <option value="50">50</option>
                        <option value="200">200</option>
                    </select>
                    <span class="text-sm text-gray-700">{$t('entries')}</span>
                </div>
                {#if data.totalPages > 0}
                    <p class="hidden text-sm text-gray-700 sm:block">
                        {$t('Showing page')} <span class="font-medium">{data.page}</span> {$t('of')} <span class="font-medium">{data.totalPages}</span>
                        <span class="text-gray-400 ml-1">({startItem} - {endItem} {$t('from')} {data.total} {$t('entries')})</span>
                    </p>
                {/if}
            </div>

            {#if data.totalPages > 1}
                <nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    <a
                        href={data.page > 1 ? getPageUrl(data.page - 1) : '#'}
                        aria-label={$t('Previous')}
                        class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.page === 1 ? 'pointer-events-none opacity-50' : ''}"
                    >
                        <span class="sr-only">{$t('Previous')}</span>
                        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
                        </svg>
                    </a>
                    
                    {#each paginationRange as pageNum}
                        {#if typeof pageNum === 'string'}
                            <span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 ring-inset">...</span>
                        {:else}
                            <a
                                href={getPageUrl(pageNum)}
                                class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum === data.page ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600' : 'text-gray-900 bg-white ring-1 ring-gray-300 ring-inset hover:bg-gray-50'}"
                            >
                                {pageNum}
                            </a>
                        {/if}
                    {/each}

                    <a
                        href={data.page < data.totalPages ? getPageUrl(data.page + 1) : '#'}
                        aria-label={$t('Next')}
                        class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.page === data.totalPages ? 'pointer-events-none opacity-50' : ''}"
                    >
                        <span class="sr-only">{$t('Next')}</span>
                        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
                        </svg>
                    </a>
                </nav>
            {/if}
        </div>
    {/if}

    <!-- ==================== Modal Packing List ==================== -->
    {#if showModal}
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity duration-300">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
                <!-- Modal Header -->
                <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {$t('Packing List of Container')}: <span class="text-blue-600 ml-1">{selectedContainer}</span>
                    </h2>
                    <button on:click={closeModal} aria-label={$t('Close')} class="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg p-1 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                
                <!-- Modal Body -->
                <div class="p-6 overflow-y-auto flex-1 bg-white">
                    {#if isLoadingModal}
                        <div class="flex flex-col justify-center items-center py-16 gap-3">
                            <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                            <span class="text-gray-500 font-medium">{$t('Loading...')}</span>
                        </div>
                    {:else if modalData.length > 0}
                        <div class="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
                            <table class="min-w-full divide-y divide-gray-200 text-sm text-left whitespace-nowrap">
                                <thead class="bg-gray-100 text-gray-700">
                                    <tr>
                                        <th class="px-4 py-3 font-semibold border-r border-gray-200 text-center">{$t('Status')}</th>
                                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Delivery Order')}</th>
                                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Item Number')}</th>
                                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Material ID')}</th>
                                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Case Number')}</th>
                                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Box ID')}</th>
                                        <th class="px-4 py-3 font-semibold border-r border-gray-200 text-right">{$t('Qty')}</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-200 bg-white">
                                    {#each modalData as row}
                                        <tr class="hover:bg-blue-50/50 transition-colors">
                                            <td class="px-4 py-3 border-r border-gray-100 text-center">
                                                {#if row.receive_flg === 1}
                                                    <span class="px-2 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-md">{$t('Received')}</span>
                                                {:else}
                                                    <span class="px-2 py-1 text-xs font-semibold text-orange-700 bg-orange-100 rounded-md">{$t('Pending')}</span>
                                                {/if}
                                            </td>
                                            <td class="px-4 py-3 border-r border-gray-100 text-gray-800">{row.delivery_order || '-'}</td>
                                            <td class="px-4 py-3 border-r border-gray-100 text-gray-800">{row.item_number || '-'}</td>
                                            <td class="px-4 py-3 border-r border-gray-100 text-gray-800">{row.material_id || '-'}</td>
                                            <td class="px-4 py-3 border-r border-gray-100 text-gray-800">{row.case_number || '-'}</td>
                                            <td class="px-4 py-3 border-r border-gray-100 text-gray-800">{row.box_id || '-'}</td>
                                            <td class="px-4 py-3 border-r border-gray-100 text-gray-800 font-medium text-right">{row.quantity ?? '-'}</td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                        <div class="mt-4 text-sm text-gray-500 flex justify-end">
                            {$t('Total items')}: <span class="font-bold ml-1">{modalData.length}</span>
                        </div>
                    {:else}
                        <div class="text-center py-16 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300 flex flex-col items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                            {$t('No packing list data found for this container')}
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    <!-- ==================== Modal Add Container Plan ==================== -->
    {#if showAddModal}
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity duration-300">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
                <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                        {$t('Add Container Plan')}
                    </h2>
                    <button on:click={() => showAddModal = false} aria-label={$t('Close')} class="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg p-1 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                
                <div class="p-6 overflow-y-auto flex-1 bg-white">
                    <form method="POST" action="?/create" use:enhance={() => {
                        isAdding = true;
                        return async ({ result, update }) => {
                            isAdding = false;
                            if (result.type === 'success') {
                                showAddModal = false;
                                alert('บันทึกข้อมูลเรียบร้อยแล้ว');
                                update();
                            } else {
                                alert(result.data?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
                            }
                        };
                    }}>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">{$t('Container No')} <span class="text-red-500">*</span></label>
                                <input type="text" name="container_no" required class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">{$t('House B/L')} <span class="text-red-500">*</span></label>
                                <input type="text" name="house_bl" required class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">{$t('Model')}</label>
                                <input type="text" name="model" class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">{$t('Type')}</label>
                                <input type="text" name="type" class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">{$t('ETA Date')}</label>
                                <input type="date" name="eta_date" class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">{$t('Check-in Date')}</label>
                                <input type="date" name="checkin_date" class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">{$t('Free Time')}</label>
                                <input type="text" name="free_time" class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">{$t('Depot')}</label>
                                <input type="text" name="depot" class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">{$t('Week Lot')}</label>
                                <input type="text" name="week_lot" class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">{$t('Vessel')}</label>
                                <input type="text" name="vessel" class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">{$t('Agent')}</label>
                                <input type="text" name="agent" class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">{$t('Container Owner')}</label>
                                <input type="text" name="container_owner" class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                            </div>
                        </div>
                        
                        <div class="mt-8 pt-5 border-t border-gray-100 flex justify-end gap-3">
                            <button type="button" on:click={() => showAddModal = false} class="px-5 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                                {$t('Cancel')}
                            </button>
                            <button type="submit" disabled={isAdding} class="px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:bg-blue-400">
                                {#if isAdding}
                                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    {$t('Saving...')}
                                {:else}
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    {$t('Save')}
                                {/if}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    /* Add smooth animation for modal entrance */
    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    .animate-fade-in-up {
        animation: fadeInUp 0.3s ease-out forwards;
    }
</style>