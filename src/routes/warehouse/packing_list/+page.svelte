<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
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

    // ฟังก์ชันเปลี่ยนหน้า (Pagination)
    function changePage(newPage: number) {
        if (newPage >= 1 && newPage <= data.totalPages) {
            const url = new URL($page.url);
            url.searchParams.set('page', newPage.toString());
            goto(url.toString());
        }
    }

    // ฟังก์ชันคำนวณหน้าที่จะแสดงผลใน Pagination (เช่น 1, 2, 3, 4, 5)
    function getVisiblePages(current: number, total: number) {
        if (total <= 5) return Array.from({length: total}, (_, i) => i + 1);
        if (current <= 3) return [1, 2, 3, 4, 5];
        if (current >= total - 2) return [total - 4, total - 3, total - 2, total - 1, total];
        return [current - 2, current - 1, current, current + 1, current + 2];
    }

    $: visiblePages = getVisiblePages(data.page, data.totalPages);
    $: startItem = data.total === 0 ? 0 : ((data.page - 1) * data.pageSize) + 1;
    $: endItem = Math.min(data.page * data.pageSize, data.total);
</script>

<div class="p-6 max-w-full mx-auto">
    <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold text-gray-800">Container Packing List</h1>
    </div>

    <!-- ส่วนของฟอร์มค้นหา -->
    <div class="bg-white p-5 rounded-lg shadow-sm mb-6 border border-gray-200">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
                <label for="search-container" class="block text-sm font-medium text-gray-700 mb-1">Container</label>
                <input 
                    id="search-container"
                    type="text" 
                    bind:value={container} 
                    class="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500" 
                    placeholder="ค้นหา Container..." 
                />
            </div>
            <div>
                <label for="search-delivery-order" class="block text-sm font-medium text-gray-700 mb-1">Delivery Order</label>
                <input 
                    id="search-delivery-order"
                    type="text" 
                    bind:value={delivery_order} 
                    class="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500" 
                    placeholder="ค้นหา Delivery Order..." 
                />
            </div>
            <div>
                <label for="search-temp-material" class="block text-sm font-medium text-gray-700 mb-1">Temp Material</label>
                <input 
                    id="search-temp-material"
                    type="text" 
                    bind:value={temp_material} 
                    class="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500" 
                    placeholder="ค้นหา Temp Material..." 
                />
            </div>
            <div>
                <label for="search-date-start" class="block text-sm font-medium text-gray-700 mb-1">Create Date (Start)</label>
                <input 
                    id="search-date-start"
                    type="date" 
                    bind:value={create_date_start} 
                    class="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500" 
                />
            </div>
            <div>
                <label for="search-date-end" class="block text-sm font-medium text-gray-700 mb-1">Create Date (End)</label>
                <input 
                    id="search-date-end"
                    type="date" 
                    bind:value={create_date_end} 
                    class="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500" 
                />
            </div>
        </div>
        <div class="mt-4 flex gap-2">
            <!-- ปุ่มค้นหาจะเป็นตัวเดียวที่ทำการดึงข้อมูลใหม่ -->
            <button on:click={search} class="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/>
                </svg>
                ค้นหา
            </button>
            <button on:click={clearSearch} class="bg-gray-100 text-gray-700 px-5 py-2 rounded-md hover:bg-gray-200 transition-colors border border-gray-300">
                ล้างข้อมูล
            </button>
        </div>
    </div>

    <!-- ส่วนของตารางแสดงผล -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-4">
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse whitespace-nowrap">
                <thead class="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th class="p-3 text-sm font-semibold text-gray-700">Status</th>
                        <th class="p-3 text-sm font-semibold text-gray-700">Container</th>
                        <th class="p-3 text-sm font-semibold text-gray-700">Delivery Order</th>
                        <th class="p-3 text-sm font-semibold text-gray-700">Item Number</th>
                        <th class="p-3 text-sm font-semibold text-gray-700">Create Date</th>
                        <th class="p-3 text-sm font-semibold text-gray-700">Material ID</th>
                        <th class="p-3 text-sm font-semibold text-gray-700">Case Number</th>
                        <th class="p-3 text-sm font-semibold text-gray-700">Storage Location</th>
                        <th class="p-3 text-sm font-semibold text-gray-700">Box ID</th>
                        <th class="p-3 text-sm font-semibold text-gray-700">Qty</th>
                        <th class="p-3 text-sm font-semibold text-gray-700">Container Received</th>
                        <th class="p-3 text-sm font-semibold text-gray-700">File Name</th>
                        <th class="p-3 text-sm font-semibold text-gray-700">TR Name</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    {#each data.data as item}
                        <tr class="hover:bg-gray-50 transition-colors">
                            <td class="p-3 text-sm">
                                {#if item.receive_flg === 1}
                                    <span class="px-2 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-full">Received</span>
                                {:else}
                                    <span class="px-2 py-1 text-xs font-semibold text-orange-700 bg-orange-100 rounded-full">Pending</span>
                                {/if}
                            </td>
                            <td class="p-3 text-sm text-gray-800 font-medium">{item.container || '-'}</td>
                            <td class="p-3 text-sm text-gray-800">{item.delivery_order || '-'}</td>
                            <td class="p-3 text-sm text-gray-800">{item.item_number || '-'}</td>
                            <td class="p-3 text-sm text-gray-800">
                                {item.created_at ? new Date(item.created_at).toLocaleDateString('en-CA') : '-'}
                            </td>
                            <td class="p-3 text-sm text-gray-800">{item.material_id || '-'}</td>
                            <td class="p-3 text-sm text-gray-800">{item.case_number || '-'}</td>
                            <td class="p-3 text-sm text-gray-800">{item.storage_location || '-'}</td>
                            <td class="p-3 text-sm text-gray-800">{item.box_id || '-'}</td>
                            <td class="p-3 text-sm text-gray-800">{item.quantity ?? '-'}</td>
                            <td class="p-3 text-sm text-gray-800">{item.container_received || '-'}</td>
                            <td class="p-3 text-sm text-gray-800">{item.file_name || '-'}</td>
                            <td class="p-3 text-sm text-gray-800">{item.tr_name || '-'}</td>
                        </tr>
                    {:else}
                        <tr>
                            <td colspan="13" class="p-8 text-center text-gray-500">
                                ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>

    <!-- ส่วนของการจัดการหน้า (Pagination Layout ด้านล่างตาราง ย้าย Dropdown มาที่นี่) -->
    <div class="flex flex-col lg:flex-row items-center justify-between px-2 py-3 gap-4">
        
        <!-- ซ้าย: เลือกแสดงจำนวนรายการ & ข้อมูลรายการปัจจุบัน -->
        <div class="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto justify-between sm:justify-start">
            
            <div class="flex items-center gap-2">
                <span class="text-sm text-gray-700">Show</span>
                <!-- นำ on:change ออก เพื่อให้เปลี่ยนค่าเมื่อกดปุ่มค้นหาเท่านั้น -->
                <select 
                    id="page-size-select"
                    bind:value={pageSize} 
                    class="border border-gray-300 rounded-md py-1 px-2 text-sm focus:ring-blue-500 focus:border-blue-500 bg-white outline-none"
                >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={200}>200</option>
                </select>
                <span class="text-sm text-gray-700">entries</span>
            </div>

            {#if data.total > 0}
                <div class="text-sm text-gray-700">
                    Showing <span class="font-medium">{startItem}</span> to
                    <span class="font-medium">{endItem}</span> of
                    <span class="font-medium">{data.total}</span> entries
                </div>
            {/if}
        </div>

        <!-- ขวา: ปุ่มเปลี่ยนหน้า (รูปแบบหมายเลขหน้า) -->
        {#if data.totalPages > 0}
            <div class="flex justify-between w-full lg:w-auto sm:hidden">
                <button 
                    disabled={data.page === 1}
                    on:click={() => changePage(data.page - 1)}
                    class="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                    Previous
                </button>
                <button 
                    disabled={data.page === data.totalPages}
                    on:click={() => changePage(data.page + 1)}
                    class="relative ml-3 inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                    Next
                </button>
            </div>
            
            <div class="hidden sm:flex sm:items-center">
                <nav class="inline-flex -space-x-px rounded-md shadow-sm isolate" aria-label="Pagination">
                    <!-- ปุ่มก่อนหน้า -->
                    <button 
                        disabled={data.page === 1}
                        on:click={() => changePage(data.page - 1)}
                        class="relative inline-flex items-center px-3 py-2 text-gray-500 bg-white rounded-l-md ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed">
                        <span class="sr-only">Previous</span>
                        <span class="text-sm">Previous</span>
                    </button>

                    <!-- หมายเลขหน้า -->
                    {#each visiblePages as p}
                        <button 
                            on:click={() => changePage(p)}
                            class="relative inline-flex items-center px-4 py-2 text-sm font-semibold focus:z-20 focus:outline-offset-0 {data.page === p ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600' : 'text-gray-900 bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-50'}"
                        >
                            {p}
                        </button>
                    {/each}

                    <!-- ปุ่มถัดไป -->
                    <button 
                        disabled={data.page === data.totalPages}
                        on:click={() => changePage(data.page + 1)}
                        class="relative inline-flex items-center px-3 py-2 text-gray-500 bg-white rounded-r-md ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed">
                        <span class="sr-only">Next</span>
                        <span class="text-sm">Next</span>
                    </button>
                </nav>
            </div>
        {/if}
    </div>
</div>