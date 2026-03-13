<script lang="ts">
    import { enhance } from '$app/forms';

    let { data, form } = $props<{ data: any; form: any }>();
    let items = $derived(data.items || []);
    let categories = $derived(data.categories || []);

    let isModalOpen = $state(false);
    let isSaving = $state(false);
    let modalMode = $state<'create' | 'edit'>('create');

    // ข้อมูลฟอร์ม
    let formData = $state({
        id: '',
        expense_category_id: '',
        item_code: '',
        item_name: '',
        description: '',
        is_active: true
    });

    function openCreateModal() {
        modalMode = 'create';
        formData = { id: '', expense_category_id: '', item_code: '', item_name: '', description: '', is_active: true };
        isModalOpen = true;
    }

    function openEditModal(item: any) {
        modalMode = 'edit';
        formData = { 
            id: item.id, 
            expense_category_id: item.expense_category_id, 
            item_code: item.item_code || '', 
            item_name: item.item_name, 
            description: item.description || '', 
            is_active: item.is_active === 1 
        };
        isModalOpen = true;
    }

    function closeModal() {
        isModalOpen = false;
    }
</script>

<div class="p-6 max-w-6xl mx-auto">
    <div class="flex justify-between items-center mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-800">Expense Items</h1>
            <p class="text-sm text-gray-500">จัดการรายการค่าใช้จ่ายย่อย</p>
        </div>
        <button 
            onclick={openCreateModal}
            class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold shadow-sm flex items-center gap-2"
        >
            + เพิ่มรายการ
        </button>
    </div>

    {#if form?.message}
        <div class="mb-4 p-4 rounded-lg {form?.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
            {form.message}
        </div>
    {/if}

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Item Code</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Item Name</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
                    <th class="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th class="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
                {#each items as item}
                    <tr class="hover:bg-gray-50">
                        <td class="px-6 py-4 font-mono text-gray-600">{item.item_code || '-'}</td>
                        <td class="px-6 py-4 font-bold text-gray-900">{item.item_name}</td>
                        <td class="px-6 py-4">
                            <span class="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded border">{item.category_name}</span>
                        </td>
                        <td class="px-6 py-4 text-center">
                            <span class="px-2 py-1 text-xs font-semibold rounded-full {item.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                                {item.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td class="px-6 py-4 text-right flex justify-end gap-2">
                            <button onclick={() => openEditModal(item)} class="text-blue-600 hover:text-blue-800 p-1">Edit</button>
                            <form method="POST" action="?/delete" use:enhance onsubmit={(e) => { if(!confirm('ยืนยันการลบรายการนี้?')) e.preventDefault(); }}>
                                <input type="hidden" name="id" value={item.id}>
                                <button type="submit" class="text-red-600 hover:text-red-800 p-1">Delete</button>
                            </form>
                        </td>
                    </tr>
                {:else}
                    <tr><td colspan="5" class="px-6 py-8 text-center text-gray-500">ไม่มีข้อมูลรายการค่าใช้จ่าย</td></tr>
                {/each}
            </tbody>
        </table>
    </div>
</div>

<!-- ================= MODAL ================= -->
{#if isModalOpen}
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div class="px-6 py-4 border-b bg-gray-50">
            <h3 class="text-lg font-bold text-gray-800">
                {modalMode === 'create' ? 'เพิ่มรายการย่อยใหม่' : 'แก้ไขรายการย่อย'}
            </h3>
        </div>

        <form method="POST" action={modalMode === 'edit' ? '?/update' : '?/create'} use:enhance={() => {
            isSaving = true;
            return async ({ update, result }) => {
                await update();
                isSaving = false;
                if(result.type === 'success') closeModal();
            };
        }}>
            <div class="p-6 space-y-4">
                {#if modalMode === 'edit'}
                    <input type="hidden" name="id" value={formData.id} />
                {/if}

                <div>
                    <label for="expense_category_id" class="block text-sm font-semibold text-gray-700 mb-1">หมวดหมู่ (Category) <span class="text-red-500">*</span></label>
                    <select id="expense_category_id" name="expense_category_id" bind:value={formData.expense_category_id} required class="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500">
                        <option value="" disabled selected>เลือกหมวดหมู่...</option>
                        {#each categories as cat}
                            <option value={cat.id}>{cat.category_name}</option>
                        {/each}
                    </select>
                </div>

                <div>
                    <label for="item_code" class="block text-sm font-semibold text-gray-700 mb-1">Item Code</label>
                    <input id="item_code" type="text" name="item_code" bind:value={formData.item_code} class="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" placeholder="รหัสย่อย (ถ้ามี)">
                </div>

                <div>
                    <label for="item_name" class="block text-sm font-semibold text-gray-700 mb-1">Item Name <span class="text-red-500">*</span></label>
                    <input id="item_name" type="text" name="item_name" bind:value={formData.item_name} required class="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" placeholder="e.g. ค่ารถหัวลาก">
                </div>

                <div>
                    <label for="item_description" class="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                    <textarea id="item_description" name="description" bind:value={formData.description} rows="2" class="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" placeholder="คำอธิบายเพิ่มเติม..."></textarea>
                </div>

                {#if modalMode === 'edit'}
                    <div class="flex items-center gap-2 mt-4">
                        <input type="checkbox" id="is_active" name="is_active" value="true" checked={formData.is_active} class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4">
                        <label for="is_active" class="text-sm font-medium text-gray-700">เปิดใช้งาน (Active)</label>
                    </div>
                {/if}
            </div>

            <div class="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
                <button type="button" onclick={closeModal} class="px-4 py-2 bg-white border rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50">ยกเลิก</button>
                <button type="submit" disabled={isSaving} class="px-4 py-2 bg-blue-600 rounded-lg text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
                    {isSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </button>
            </div>
        </form>
    </div>
</div>
{/if}