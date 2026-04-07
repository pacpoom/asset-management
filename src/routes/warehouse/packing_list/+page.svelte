<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { t, locale } from '$lib/i18n';
    import type { PageData } from './$types';

    export let data: PageData;

    // ผูกค่าตัวแปรกับ Search Parameters ที่ได้จาก Server
    let container = data.searchParams.container;
    let delivery_order = data.searchParams.delivery_order;
    let temp_material = data.searchParams.temp_material;
    
    let create_date_start = data.searchParams.create_date_start;
    let create_date_end = data.searchParams.create_date_end;
    
    let pageSize = data.pageSize || 10;

    // ฟังก์ชันค้นหา
    function search() {
        const url = new URL($page.url);
        
        if (container) url.searchParams.set('container', container);
        else url.searchParams.delete('container');

        if (delivery_order) url.searchParams.set('delivery_order', delivery_order);
        else url.searchParams.delete('delivery_order');

        if (temp_material) url.searchParams.set('temp_material', temp_material);
        else url.searchParams.delete('temp_material');

        if (create_date_start) url.searchParams.set('create_date_start', create_date_start);
        else url.searchParams.delete('create_date_start');

        if (create_date_end) url.searchParams.set('create_date_end', create_date_end);
        else url.searchParams.delete('create_date_end');

        url.searchParams.set('pageSize', pageSize.toString());
        url.searchParams.set('page', '1'); 
        goto(url.toString());
    }

    // ฟังก์ชันล้างค่าค้นหา
    function clearSearch() {
        container = '';
        delivery_order = '';
        temp_material = '';
        
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
        if (isNaN(d.getTime())) return val; // ถ้าไม่ใช่ format วันที่ให้แสดงค่าเดิม
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    // --- Pagination Logic (เหมือนหน้า Items/Job Expenses) ---
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
    <title>{$t('Container Packing List')}</title>
</svelte:head>

<div class="p-6 max-w-full mx-auto bg-gray-50 min-h-screen">
    <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold text-gray-800">{$t('Container Packing List')}</h1>
    </div>

    <!-- ส่วนของฟอร์มค้นหา -->
    <div class="bg-white p-5 rounded-xl shadow-sm mb-6 border border-gray-200">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
                <label for="search-container" class="block text-sm font-medium text-gray-700 mb-1">{$t('Container')}</label>
                <input 
                    id="search-container"
                    type="text" 
                    bind:value={container} 
                    class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                    placeholder="{$t('Search Container...')}" 
                />
            </div>
            <div>
                <label for="search-delivery-order" class="block text-sm font-medium text-gray-700 mb-1">{$t('Delivery Order')}</label>
                <input 
                    id="search-delivery-order"
                    type="text" 
                    bind:value={delivery_order} 
                    class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                    placeholder="{$t('Search Delivery Order...')}" 
                />
            </div>
            <div>
                <label for="search-temp-material" class="block text-sm font-medium text-gray-700 mb-1">{$t('Temp Material')}</label>
                <input 
                    id="search-temp-material"
                    type="text" 
                    bind:value={temp_material} 
                    class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                    placeholder="{$t('Search Temp Material...')}" 
                />
            </div>
            <div>
                <label for="search-date-start" class="block text-sm font-medium text-gray-700 mb-1">{$t('Create Date (Start)')}</label>
                <input 
                    id="search-date-start"
                    type="date" 
                    bind:value={create_date_start} 
                    class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                />
            </div>
            <div>
                <label for="search-date-end" class="block text-sm font-medium text-gray-700 mb-1">{$t('Create Date (End)')}</label>
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
            
            <!-- ปุ่มค้นหา -->
            <button on:click={search} class="bg-blue-600 text-white px-5 py-2 text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/>
                </svg>
                {$t('Search')}
            </button>

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
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Container')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Delivery Order')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Item Number')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Create Date')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Material No')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Case Number')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Storage Location')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Box ID')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200 text-right">{$t('Qty')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Container Received')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('File Name')}</th>
                        <th class="px-4 py-3 font-semibold">{$t('TR Name')}</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    {#each data.data as item}
                        <tr class="hover:bg-blue-50/50 transition-colors">
                            <td class="px-4 py-3 text-center border-r border-gray-100">
                                {#if item.receive_flg === 1}
                                    <span class="px-2 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-md">{$t('Received')}</span>
                                {:else}
                                    <span class="px-2 py-1 text-xs font-semibold text-orange-700 bg-orange-100 rounded-md">{$t('Pending')}</span>
                                {/if}
                            </td>
                            <td class="px-4 py-3 text-gray-800 font-medium border-r border-gray-100">{item.container || '-'}</td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100">{item.delivery_order || '-'}</td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100">{item.item_number || '-'}</td>
                            <td class="px-4 py-3 text-gray-600 border-r border-gray-100">
                                {item.created_at ? new Date(item.created_at).toLocaleDateString($locale === 'th' ? 'th-TH' : 'en-CA') : '-'}
                            </td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100">{item.temp_material || '-'}</td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100">{item.case_number || '-'}</td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100">{item.storage_location || '-'}</td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100">{item.box_id || '-'}</td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100 text-right">{item.quantity ?? '-'}</td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100">{formatDateTime(item.container_received)}</td>
                            <td class="px-4 py-3 text-gray-600 border-r border-gray-100 text-xs">{item.file_name || '-'}</td>
                            <td class="px-4 py-3 text-gray-800 text-xs">{item.tr_name || '-'}</td>
                        </tr>
                    {:else}
                        <tr>
                            <td colspan="13" class="px-6 py-12 text-center text-gray-500">
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
</div>