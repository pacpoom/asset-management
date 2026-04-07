<script lang="ts">
    import { enhance } from '$app/forms';
    import { fade } from 'svelte/transition';
    import { t } from '$lib/i18n';
    import type { ActionData, PageData } from './$types';

    const { data, form } = $props<{ data: PageData; form: ActionData }>();

    let isLoading = $state(false);

    // Global Message State (เหมือนหน้า items / receive)
    let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(null);
    let messageTimeout: NodeJS.Timeout;

    // --- Searchable Dropdown: ตู้/แผนงาน (Plan) ---
    let planSearch = $state('');
    let selectedPlanId = $state<string>('');
    let showPlanDropdown = $state(false);

    const filteredPlans = $derived(
        data.plans.filter((p: any) => {
            const searchStr = `${p.container_no} ${p.plan_no}`.toLowerCase();
            return searchStr.includes(planSearch.toLowerCase());
        })
    );

    function selectPlan(plan: any) {
        selectedPlanId = plan.plan_id;
        planSearch = `${plan.container_no} (Plan: ${plan.plan_no || 'N/A'}) - Size: ${plan.size || '-'}`;
        showPlanDropdown = false;
    }

    // --- Searchable Dropdown: ตำแหน่งลาน (Location) ---
    let locSearch = $state('');
    let selectedLocId = $state<string>('');
    let showLocDropdown = $state(false);

    const filteredLocations = $derived(
        data.locations.filter((l: any) => 
            l.location_code.toLowerCase().includes(locSearch.toLowerCase())
        )
    );

    function selectLocation(loc: any) {
        selectedLocId = loc.id;
        locSearch = loc.location_code;
        showLocDropdown = false;
    }

    // ล้างข้อมูลฟอร์ม
    function handleReset() {
        planSearch = '';
        selectedPlanId = '';
        locSearch = '';
        selectedLocId = '';
    }

    // ฟังก์ชันแสดง Toast แบบเดียวกับหน้าอื่นๆ
    function showToast(message: string, type: 'success' | 'error') {
        clearTimeout(messageTimeout);
        globalMessage = { success: type === 'success', text: message, type };
        messageTimeout = setTimeout(() => {
            globalMessage = null;
        }, 5000);
    }

    // ดักสถานะเมื่อ submit เสร็จสิ้น
    $effect.pre(() => {
        if (form?.success) {
            showToast($t(form.message as string), 'success');
            handleReset(); // ถ้าบันทึกสำเร็จ ให้ล้างช่องค้นหาอัตโนมัติ
            form.success = undefined;
        } else if (form?.error) {
            showToast($t(form.error as string), 'error');
            form.error = undefined;
        }
    });
</script>

<svelte:head>
    <title>{$t('Receive Container')}</title>
</svelte:head>

<!-- Global Message Toast -->
{#if globalMessage}
    <div
        transition:fade
        class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 text-sm font-semibold shadow-xl {globalMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}"
    >
        {globalMessage.text}
    </div>
{/if}

<div class="mx-auto max-w-4xl p-6">
    <!-- Header สไตล์มาตรฐานของระบบ -->
    <div class="mb-6">
        <h1 class="text-2xl font-bold text-gray-800">{$t('Receive Container')}</h1>
        <p class="mt-1 text-sm text-gray-500">{$t('Receive container to yard location')}</p>
    </div>

    <!-- ฟอร์มรับข้อมูล -->
    <div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <form 
            method="POST" 
            onreset={handleReset}
            use:enhance={() => {
                isLoading = true;
                return async ({ update }) => {
                    await update({ reset: false }); // กันไม่ให้ฟอร์มรีเซ็ตเองถ้ามี error
                    isLoading = false;
                };
            }}
            class="space-y-6"
        >
            <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
                <!-- เลือกตู้/แผนงาน (Searchable Dropdown) -->
                <div class="relative md:col-span-2">
                    <label for="plan_search" class="mb-1 block text-sm font-medium text-gray-700">
                        {$t('Container / Plan')} <span class="text-red-500">*</span>
                    </label>
                    <input type="hidden" name="plan_id" bind:value={selectedPlanId} required />
                    <input 
                        id="plan_search"
                        type="search"
                        bind:value={planSearch}
                        oninput={() => { selectedPlanId = ''; showPlanDropdown = true; }}
                        onfocus={() => (showPlanDropdown = true)}
                        onblur={() => setTimeout(() => (showPlanDropdown = false), 200)}
                        autocomplete="off"
                        placeholder={$t('-- Type to search container --')}
                        class="w-full rounded-md border border-gray-300 p-2.5 shadow-sm focus:border-blue-500 focus:ring-blue-500 {selectedPlanId ? 'border-blue-200 bg-blue-50 font-semibold text-blue-800' : 'bg-white'}"
                    />
                    
                    {#if showPlanDropdown}
                        <ul class="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-xl ring-1 ring-black ring-opacity-5 focus:outline-none">
                            {#if filteredPlans.length === 0}
                                <li class="relative py-3 pl-4 pr-9 italic text-gray-500">{$t('No container data found')}</li>
                            {:else}
                                {#each filteredPlans as plan}
                                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                                    <li 
                                        class="relative cursor-pointer select-none py-2 pl-4 pr-9 text-gray-900 hover:bg-blue-600 hover:text-white"
                                        onmousedown={() => selectPlan(plan)}
                                    >
                                        <span class="font-bold">{plan.container_no}</span>
                                        <span class="ml-1 opacity-80">(Plan: {plan.plan_no || 'N/A'}) - Size: {plan.size || '-'}</span>
                                    </li>
                                {/each}
                            {/if}
                        </ul>
                    {/if}
                </div>

                <!-- เลือกตำแหน่งลาน (Searchable Dropdown) -->
                <div class="relative">
                    <label for="loc_search" class="mb-1 block text-sm font-medium text-gray-700">
                        {$t('Yard Location')} <span class="text-red-500">*</span>
                    </label>
                    <input type="hidden" name="yard_location_id" bind:value={selectedLocId} required />
                    <input 
                        id="loc_search"
                        type="search"
                        bind:value={locSearch}
                        oninput={() => { selectedLocId = ''; showLocDropdown = true; }}
                        onfocus={() => (showLocDropdown = true)}
                        onblur={() => setTimeout(() => (showLocDropdown = false), 200)}
                        autocomplete="off"
                        placeholder={$t('-- Type to search location --')}
                        class="w-full rounded-md border border-gray-300 p-2.5 shadow-sm focus:border-blue-500 focus:ring-blue-500 {selectedLocId ? 'border-blue-200 bg-blue-50 font-semibold text-blue-800' : 'bg-white'}"
                    />

                    {#if showLocDropdown}
                        <ul class="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-xl ring-1 ring-black ring-opacity-5 focus:outline-none">
                            {#if filteredLocations.length === 0}
                                <li class="relative py-3 pl-4 pr-9 italic text-gray-500">{$t('No location data found')}</li>
                            {:else}
                                {#each filteredLocations as loc}
                                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                                    <li 
                                        class="relative cursor-pointer select-none py-2 pl-4 pr-9 font-mono text-gray-900 hover:bg-blue-600 hover:text-white"
                                        onmousedown={() => selectLocation(loc)}
                                    >
                                        {loc.location_code}
                                    </li>
                                {/each}
                            {/if}
                        </ul>
                    {/if}
                </div>

                <!-- สถานะตู้ -->
                <div>
                    <label for="status" class="mb-1 block text-sm font-medium text-gray-700">
                        {$t('Container Status')} <span class="text-red-500">*</span>
                    </label>
                    <select 
                        id="status" 
                        name="status" 
                        required 
                        class="w-full rounded-md border border-gray-300 bg-white p-2.5 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                        <option value="1">{$t('Full Container')}</option>
                        <option value="2">{$t('Partial Container')}</option>
                        <option value="3">{$t('Empty Container')}</option>
                    </select>
                </div>

                <!-- หมายเหตุ -->
                <div class="md:col-span-2">
                    <label for="remarks" class="mb-1 block text-sm font-medium text-gray-700">{$t('Remarks')}</label>
                    <textarea 
                        id="remarks" 
                        name="remarks" 
                        rows="3" 
                        class="w-full rounded-md border border-gray-300 p-2.5 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        placeholder={$t('Add remarks (optional)...')}
                    ></textarea>
                </div>
            </div>

            <!-- ปุ่ม Submit -->
            <div class="flex justify-end gap-3 border-t border-gray-100 pt-6">
                <button 
                    type="reset" 
                    class="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none"
                >
                    {$t('Clear Data')}
                </button>
                <button 
                    type="submit" 
                    disabled={isLoading}
                    class="flex items-center gap-2 rounded-lg border border-transparent bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-blue-400"
                >
                    {#if isLoading}
                        <svg class="-ml-1 mr-2 h-4 w-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {$t('Saving...')}
                    {:else}
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                        </svg>
                        {$t('Confirm Receive')}
                    {/if}
                </button>
            </div>
        </form>
    </div>
</div>