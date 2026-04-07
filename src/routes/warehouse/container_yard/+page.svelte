<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { enhance } from '$app/forms';
    import { t, locale } from '$lib/i18n';
    import type { PageData } from './$types';

    export let data: PageData;

    // Search Parameters สำหรับ Yard Location
    let location_code = data.searchParams.location_code;
    let is_active = data.searchParams.is_active;
    let pageSize = data.pageSize || 10;

    // ตัวแปรสำหรับ Modal Yard Location
    let showLocModal = false;
    let isEditingLoc = false;
    let isSavingLoc = false;
    let locData: any = {};
    let deletingLocId: number | null = null;

    // ตัวแปรสำหรับ Modal Yard Category (Master Data)
    let showCatModal = false;
    let isSavingCat = false;
    let deletingCatId: number | null = null;
    let catFilterType = 'zone'; // default tab
    let catData: any = { type: 'zone' };
    let isEditingCat = false;

    // ตัวเลือกหมวดหมู่ทั้งหมด เพื่อใช้ Filter หน้า UI (แยกตาม Type)
    $: locationTypes = data.categories.filter((c: any) => c.type === 'location_type');
    $: zones = data.categories.filter((c: any) => c.type === 'zone');
    $: areas = data.categories.filter((c: any) => c.type === 'area');
    $: bins = data.categories.filter((c: any) => c.type === 'bin');

    // ตัวแปรสำหรับแสดงรายการ Category ตาม Tab ที่เลือก
    $: filteredCategories = data.categories.filter((c: any) => c.type === catFilterType);

    // ==================== SEARCH & PAGINATION ====================
    function search() {
        const url = new URL($page.url);
        
        if (location_code) url.searchParams.set('location_code', location_code);
        else url.searchParams.delete('location_code');

        if (is_active !== '') url.searchParams.set('is_active', is_active);
        else url.searchParams.delete('is_active');

        url.searchParams.set('pageSize', pageSize.toString());
        url.searchParams.set('page', '1'); 
        goto(url.toString(), { keepFocus: true, replaceState: true });
    }

    function clearSearch() {
        location_code = '';
        is_active = '';
        pageSize = 10;
        search();
    }

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
                if (i - l === 2) rangeWithDots.push(l + 1);
                else if (i - l !== 1) rangeWithDots.push('...');
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
        goto(`${$page.url.pathname}?${params.toString()}`, { keepFocus: true, noScroll: true, replaceState: true });
    }

    $: startItem = data.total === 0 ? 0 : ((data.page - 1) * data.pageSize) + 1;
    $: endItem = Math.min(data.page * data.pageSize, data.total);

    // ==================== MODAL CONTROLS ====================
    function openAddLocationModal() {
        isEditingLoc = false;
        locData = { is_active: true }; // Default active
        showLocModal = true;
    }

    function openEditLocationModal(item: any) {
        isEditingLoc = true;
        locData = { ...item, is_active: item.is_active === 1 };
        showLocModal = true;
    }

    function openManageCategoriesModal() {
        resetCategoryForm();
        showCatModal = true;
    }

    function editCategory(cat: any) {
        isEditingCat = true;
        catData = { ...cat };
        catFilterType = cat.type; // ให้ Tab เปลี่ยนตามตัวที่กดแก้ด้วย
    }

    function resetCategoryForm() {
        isEditingCat = false;
        catData = { type: catFilterType, name: '', description: '' };
    }

    function changeCategoryTab(type: string) {
        catFilterType = type;
        resetCategoryForm();
    }
</script>

<svelte:head>
    <title>{$t('Yard Location')}</title>
</svelte:head>

<div class="p-6 max-w-full mx-auto bg-gray-50 min-h-screen relative">
    
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 class="text-2xl font-bold text-gray-800">{$t('Yard Location Management')}</h1>
        
        <div class="flex flex-wrap items-center gap-2">
            <!-- ปุ่มจัดการ Master Data Categories -->
            <button on:click={openManageCategoriesModal} class="bg-purple-600 text-white px-4 py-2 text-sm font-bold rounded-lg hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                {$t('Manage Categories')}
            </button>

            <!-- ปุ่ม Add Location -->
            <button on:click={openAddLocationModal} class="bg-blue-600 text-white px-4 py-2 text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {$t('Add Location')}
            </button>
        </div>
    </div>

    <!-- ส่วนของฟอร์มค้นหา -->
    <div class="bg-white p-5 rounded-xl shadow-sm mb-6 border border-gray-200">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <div>
                <label for="search-location-code" class="block text-sm font-medium text-gray-700 mb-1">{$t('Location Code')}</label>
                <input 
                    id="search-location-code"
                    type="text" 
                    bind:value={location_code} 
                    class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                    placeholder="{$t('Search Location Code...')}" 
                />
            </div>
            <div>
                <label for="search-status" class="block text-sm font-medium text-gray-700 mb-1">{$t('Status')}</label>
                <select id="search-status" bind:value={is_active} class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white">
                    <option value="">{$t('All')}</option>
                    <option value="1">{$t('Active')}</option>
                    <option value="0">{$t('Inactive')}</option>
                </select>
            </div>
        </div>
        
        <div class="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-3 items-center justify-start">
            <button on:click={search} class="bg-blue-600 text-white px-5 py-2 text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/>
                </svg>
                {$t('Search')}
            </button>
            <button on:click={clearSearch} class="bg-white text-gray-700 px-5 py-2 text-sm font-bold rounded-lg hover:bg-gray-50 transition-colors border border-gray-300 shadow-sm">
                {$t('Clear Filter')}
            </button>
        </div>
    </div>

    <!-- ตารางแสดงผล Yard Locations -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-4">
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-sm whitespace-nowrap text-left border-collapse">
                <thead class="bg-gray-100 text-gray-700 border-b border-gray-200">
                    <tr>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Location Code')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Type')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Zone')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Area')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200">{$t('Bin')}</th>
                        <th class="px-4 py-3 font-semibold border-r border-gray-200 text-center">{$t('Status')}</th>
                        <th class="px-4 py-3 font-semibold text-center w-24">{$t('Action')}</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    {#each data.data as item}
                        <tr class="hover:bg-blue-50/50 transition-colors">
                            <td class="px-4 py-3 text-blue-700 font-bold border-r border-gray-100">{item.location_code}</td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100">{item.type_name || '-'}</td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100">{item.zone_name || '-'}</td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100">{item.area_name || '-'}</td>
                            <td class="px-4 py-3 text-gray-800 border-r border-gray-100">{item.bin_name || '-'}</td>
                            <td class="px-4 py-3 text-center border-r border-gray-100">
                                {#if item.is_active === 1}
                                    <span class="px-2 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-md">{$t('Active')}</span>
                                {:else}
                                    <span class="px-2 py-1 text-xs font-semibold text-red-700 bg-red-100 rounded-md">{$t('Inactive')}</span>
                                {/if}
                            </td>
                            <td class="px-4 py-3 text-center whitespace-nowrap">
                                <div class="flex items-center justify-center gap-2">
                                    <button on:click={() => openEditLocationModal(item)} class="text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-1.5 rounded-md transition-colors" title="{$t('Edit')}">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    </button>

                                    <form method="POST" action="?/deleteLocation" class="inline" use:enhance={(e) => {
                                        if (!confirm('คุณต้องการลบ Location นี้ใช่หรือไม่?')) { e.cancel(); return; }
                                        deletingLocId = item.id;
                                        return async ({ result, update }) => {
                                            deletingLocId = null;
                                            if (result.type === 'success') update();
                                            else alert(result.data?.message || 'เกิดข้อผิดพลาดในการลบข้อมูล');
                                        };
                                    }}>
                                        <input type="hidden" name="id" value={item.id} />
                                        <button type="submit" disabled={deletingLocId === item.id} class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-md transition-colors disabled:opacity-50" title="{$t('Delete')}">
                                            {#if deletingLocId === item.id}
                                                <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                                            {:else}
                                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            {/if}
                                        </button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                    {:else}
                        <tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">{$t('No data found')}</td></tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>

    <!-- Pagination (ระบบเดียวกับ Container Order Plan) -->
    {#if data.total > 0}
        <div class="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row pb-6">
            <div class="flex items-center gap-4">
                <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-700">{$t('Show')}</span>
                    <select class="rounded-md border border-gray-300 py-1 pr-8 pl-3 text-sm bg-white" value={data.pageSize.toString()} on:change={(e) => changeLimit(e.currentTarget.value)}>
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
                        <span class="text-gray-400 ml-1">({startItem} - {endItem} {$t('from')} {data.total})</span>
                    </p>
                {/if}
            </div>

            {#if data.totalPages > 1}
                <nav class="isolate inline-flex -space-x-px rounded-md shadow-sm">
                    <a href={data.page > 1 ? getPageUrl(data.page - 1) : '#'} aria-label={$t('Previous')} class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.page === 1 ? 'pointer-events-none opacity-50' : ''}">
                        <span class="sr-only">{$t('Previous')}</span>
                        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" /></svg>
                    </a>
                    {#each paginationRange as pageNum}
                        {#if typeof pageNum === 'string'}
                            <span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 ring-inset">...</span>
                        {:else}
                            <a href={getPageUrl(pageNum)} class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum === data.page ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600' : 'text-gray-900 bg-white ring-1 ring-gray-300 ring-inset hover:bg-gray-50'}">{pageNum}</a>
                        {/if}
                    {/each}
                    <a href={data.page < data.totalPages ? getPageUrl(data.page + 1) : '#'} aria-label={$t('Next')} class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.page === data.totalPages ? 'pointer-events-none opacity-50' : ''}">
                        <span class="sr-only">{$t('Next')}</span>
                        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" /></svg>
                    </a>
                </nav>
            {/if}
        </div>
    {/if}

    <!-- ==================== MODAL: ADD / EDIT YARD LOCATION ==================== -->
    {#if showLocModal}
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in-up">
                <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">
                        {#if isEditingLoc}{$t('Edit Yard Location')}{:else}{$t('Add Yard Location')}{/if}
                    </h2>
                    <button on:click={() => showLocModal = false} aria-label={$t('Close')} class="text-gray-400 hover:text-red-500 rounded-lg p-1 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div class="p-6">
                    <form method="POST" action={isEditingLoc ? '?/updateLocation' : '?/createLocation'} use:enhance={() => {
                        isSavingLoc = true;
                        return async ({ result, update }) => {
                            isSavingLoc = false;
                            if (result.type === 'success') {
                                showLocModal = false;
                                alert(isEditingLoc ? 'แก้ไขข้อมูลสำเร็จ' : 'เพิ่มข้อมูลสำเร็จ');
                                update();
                            } else {
                                alert(result.data?.message || 'เกิดข้อผิดพลาด');
                            }
                        };
                    }}>
                        {#if isEditingLoc}
                            <input type="hidden" name="id" value={locData.id} />
                        {/if}

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label for="loc_code" class="block text-sm font-medium text-gray-700 mb-1">{$t('Location Code')} <span class="text-red-500">*</span></label>
                                <input id="loc_code" type="text" name="location_code" bind:value={locData.location_code} required maxlength="255" class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label for="loc_type" class="block text-sm font-medium text-gray-700 mb-1">{$t('Location Type')}</label>
                                <select id="loc_type" name="location_type_id" bind:value={locData.location_type_id} class="w-full border border-gray-300 rounded-md py-2 px-3 bg-white">
                                    <option value="">-- {$t('None')} --</option>
                                    {#each locationTypes as type}
                                        <option value={type.id}>{type.name}</option>
                                    {/each}
                                </select>
                            </div>
                            <div>
                                <label for="loc_zone" class="block text-sm font-medium text-gray-700 mb-1">{$t('Zone')}</label>
                                <select id="loc_zone" name="zone_id" bind:value={locData.zone_id} class="w-full border border-gray-300 rounded-md py-2 px-3 bg-white">
                                    <option value="">-- {$t('None')} --</option>
                                    {#each zones as zone}
                                        <option value={zone.id}>{zone.name}</option>
                                    {/each}
                                </select>
                            </div>
                            <div>
                                <label for="loc_area" class="block text-sm font-medium text-gray-700 mb-1">{$t('Area')}</label>
                                <select id="loc_area" name="area_id" bind:value={locData.area_id} class="w-full border border-gray-300 rounded-md py-2 px-3 bg-white">
                                    <option value="">-- {$t('None')} --</option>
                                    {#each areas as area}
                                        <option value={area.id}>{area.name}</option>
                                    {/each}
                                </select>
                            </div>
                            <div>
                                <label for="loc_bin" class="block text-sm font-medium text-gray-700 mb-1">{$t('Bin')}</label>
                                <select id="loc_bin" name="bin_id" bind:value={locData.bin_id} class="w-full border border-gray-300 rounded-md py-2 px-3 bg-white">
                                    <option value="">-- {$t('None')} --</option>
                                    {#each bins as bin}
                                        <option value={bin.id}>{bin.name}</option>
                                    {/each}
                                </select>
                            </div>
                            <div class="flex items-center mt-6">
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" name="is_active" bind:checked={locData.is_active} class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                                    <span class="text-sm font-medium text-gray-700">{$t('Active (พร้อมใช้งาน)')}</span>
                                </label>
                            </div>
                        </div>
                        
                        <div class="mt-8 pt-5 border-t border-gray-100 flex justify-end gap-3">
                            <button type="button" on:click={() => showLocModal = false} class="px-5 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-lg">{$t('Cancel')}</button>
                            <button type="submit" disabled={isSavingLoc} class="px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2">
                                {#if isSavingLoc} <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> {/if}
                                {$t('Save')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    {/if}

    <!-- ==================== MODAL: MANAGE YARD CATEGORIES ==================== -->
    {#if showCatModal}
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
                
                <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h2 class="text-lg font-bold text-gray-800">{$t('Manage Yard Categories')}</h2>
                    <button on:click={() => showCatModal = false} aria-label={$t('Close')} class="text-gray-400 hover:text-red-500 rounded-lg p-1">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <!-- TABS -->
                <div class="flex border-b border-gray-200 bg-white px-6 pt-2 overflow-x-auto">
                    <button on:click={() => changeCategoryTab('zone')} class="px-4 py-3 font-semibold text-sm border-b-2 whitespace-nowrap {catFilterType === 'zone' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">Zone</button>
                    <button on:click={() => changeCategoryTab('area')} class="px-4 py-3 font-semibold text-sm border-b-2 whitespace-nowrap {catFilterType === 'area' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">Area</button>
                    <button on:click={() => changeCategoryTab('bin')} class="px-4 py-3 font-semibold text-sm border-b-2 whitespace-nowrap {catFilterType === 'bin' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">Bin</button>
                    <button on:click={() => changeCategoryTab('location_type')} class="px-4 py-3 font-semibold text-sm border-b-2 whitespace-nowrap {catFilterType === 'location_type' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">Location Type</button>
                </div>

                <div class="p-6 flex-1 overflow-y-auto bg-gray-50 flex flex-col lg:flex-row gap-6">
                    
                    <!-- Form ฝั่งซ้าย สำหรับเพิ่ม/แก้ไข -->
                    <div class="w-full lg:w-1/3 bg-white p-5 rounded-lg border border-gray-200 h-fit sticky top-0">
                        <h3 class="font-bold text-gray-800 mb-4 border-b pb-2">
                            {#if isEditingCat}{$t('Edit')} {$t('Category')}{:else}{$t('Add New')} {$t('Category')}{/if}
                        </h3>
                        <form method="POST" action={isEditingCat ? '?/updateCategory' : '?/createCategory'} use:enhance={() => {
                            isSavingCat = true;
                            return async ({ result, update }) => {
                                isSavingCat = false;
                                if (result.type === 'success') {
                                    alert(isEditingCat ? 'แก้ไขสำเร็จ' : 'เพิ่มสำเร็จ');
                                    resetCategoryForm();
                                    update(); // reload load() ใหม่
                                } else {
                                    alert(result.data?.message || 'เกิดข้อผิดพลาด');
                                }
                            };
                        }}>
                            {#if isEditingCat} <input type="hidden" name="id" value={catData.id} /> {/if}
                            
                            <div class="mb-4">
                                <label for="cat_type" class="block text-sm font-medium text-gray-700 mb-1">{$t('Type')} <span class="text-red-500">*</span></label>
                                <select id="cat_type" name="type" bind:value={catData.type} on:change={(e) => catFilterType = e.currentTarget.value} required class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 text-sm bg-white">
                                    <option value="zone">Zone</option>
                                    <option value="area">Area</option>
                                    <option value="bin">Bin</option>
                                    <option value="location_type">Location Type</option>
                                </select>
                            </div>
                            <div class="mb-4">
                                <label for="cat_name" class="block text-sm font-medium text-gray-700 mb-1">{$t('Name')} <span class="text-red-500">*</span></label>
                                <input id="cat_name" type="text" name="name" bind:value={catData.name} required maxlength="255" class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 text-sm" />
                            </div>
                            <div class="mb-4">
                                <label for="cat_desc" class="block text-sm font-medium text-gray-700 mb-1">{$t('Description')}</label>
                                <textarea id="cat_desc" name="description" bind:value={catData.description} rows="3" class="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 text-sm"></textarea>
                            </div>
                            
                            <div class="flex gap-2">
                                <button type="submit" disabled={isSavingCat} class="flex-1 bg-blue-600 text-white py-2 rounded-md font-bold text-sm hover:bg-blue-700">
                                    {isEditingCat ? $t('Update') : $t('Add')}
                                </button>
                                {#if isEditingCat}
                                    <button type="button" on:click={resetCategoryForm} class="bg-gray-200 text-gray-700 px-3 py-2 rounded-md font-bold text-sm hover:bg-gray-300">{$t('Cancel')}</button>
                                {/if}
                            </div>
                        </form>
                    </div>

                    <!-- ตารางฝั่งขวา แสดงข้อมูล -->
                    <div class="w-full lg:w-2/3 bg-white border border-gray-200 rounded-lg overflow-hidden h-fit">
                        <table class="min-w-full divide-y divide-gray-200 text-sm whitespace-nowrap text-left">
                            <thead class="bg-gray-100">
                                <tr>
                                    <th class="px-4 py-3 font-semibold">{$t('Name')}</th>
                                    <th class="px-4 py-3 font-semibold">{$t('Description')}</th>
                                    <th class="px-4 py-3 font-semibold text-center w-24">{$t('Action')}</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200">
                                {#each filteredCategories as cat}
                                    <tr class="hover:bg-blue-50/30">
                                        <td class="px-4 py-2 font-medium text-gray-800">{cat.name}</td>
                                        <td class="px-4 py-2 text-gray-500 truncate max-w-[200px]" title={cat.description}>{cat.description || '-'}</td>
                                        <td class="px-4 py-2 text-center">
                                            <div class="flex justify-center gap-1">
                                                <button on:click={() => editCategory(cat)} class="text-blue-500 hover:bg-blue-50 p-1.5 rounded" title="{$t('Edit')}">
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                </button>
                                                <form method="POST" action="?/deleteCategory" class="inline" use:enhance={(e) => {
                                                    if(!confirm(`ลบหมวดหมู่ ${cat.name} ใช่หรือไม่?`)) { e.cancel(); return; }
                                                    deletingCatId = cat.id;
                                                    return async ({ result, update }) => {
                                                        deletingCatId = null;
                                                        if (result.type === 'success') { resetCategoryForm(); update(); }
                                                        else alert(result.data?.message || 'เกิดข้อผิดพลาด');
                                                    };
                                                }}>
                                                    <input type="hidden" name="id" value={cat.id} />
                                                    <button type="submit" disabled={deletingCatId === cat.id} class="text-red-500 hover:bg-red-50 p-1.5 rounded disabled:opacity-50" title="{$t('Delete')}">
                                                        {#if deletingCatId === cat.id} <div class="animate-spin h-4 w-4 border-b-2 border-red-600 rounded-full"></div>
                                                        {:else} <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> {/if}
                                                    </button>
                                                </form>
                                            </div>
                                        </td>
                                    </tr>
                                {:else}
                                    <tr><td colspan="3" class="px-4 py-8 text-center text-gray-500">{$t('No categories found')}</td></tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .animate-fade-in-up { animation: fadeInUp 0.3s ease-out forwards; }
</style>