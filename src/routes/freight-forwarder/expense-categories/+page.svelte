<script lang="ts">
    import { enhance } from '$app/forms';

    let { data, form } = $props<{ data: any; form: any }>();
    let categories = $derived(data.categories || []);

    let isModalOpen = $state(false);
    let isSaving = $state(false);
    let modalMode = $state<'create' | 'edit'>('create');

    // ข้อมูลฟอร์ม
    let formData = $state({
        id: '',
        category_code: '',
        category_name: '',
        description: '',
        is_active: true
    });

    function openCreateModal() {
        modalMode = 'create';
        formData = { id: '', category_code: '', category_name: '', description: '', is_active: true };
        isModalOpen = true;
    }

    function openEditModal(category: any) {
        modalMode = 'edit';
        formData = { 
            id: category.id, 
            category_code: category.category_code, 
            category_name: category.category_name, 
            description: category.description || '', 
            is_active: category.is_active === 1 
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
            <h1 class="text-2xl font-bold text-gray-800">Expense Categories</h1>
            <p class="text-sm text-gray-500">จัดการหมวดหมู่ค่าใช้จ่าย (Master Data)</p>
        </div>
        <button 
            onclick={openCreateModal}
            class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold shadow-sm flex items-center gap-2"
        >
            + เพิ่มหมวดหมู่
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
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Code</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Category Name</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                    <th class="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th class="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
                {#each categories as cat}
                    <tr class="hover:bg-gray-50">
                        <td class="px-6 py-4 font-bold text-gray-700">{cat.category_code}</td>
                        <td class="px-6 py-4 font-medium text-gray-900">{cat.category_name}</td>
                        <td class="px-6 py-4 text-gray-500 text-sm">{cat.description || '-'}</td>
                        <td class="px-6 py-4 text-center">
                            <span class="px-2 py-1 text-xs font-semibold rounded-full {cat.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                                {cat.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td class="px-6 py-4 text-right flex justify-end gap-2">
                            <button onclick={() => openEditModal(cat)} class="text-blue-600 hover:text-blue-800 p-1">Edit</button>
                            <form method="POST" action="?/delete" use:enhance onsubmit={(e) => { if(!confirm('ยืนยันการลบหมวดหมู่นี้?')) e.preventDefault(); }}>
                                <input type="hidden" name="id" value={cat.id}>
                                <button type="submit" class="text-red-600 hover:text-red-800 p-1">Delete</button>
                            </form>
                        </td>
                    </tr>
                {:else}
                    <tr><td colspan="5" class="px-6 py-8 text-center text-gray-500">ไม่มีข้อมูลหมวดหมู่ค่าใช้จ่าย</td></tr>
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
                {modalMode === 'create' ? 'เพิ่มหมวดหมู่ใหม่' : 'แก้ไขหมวดหมู่'}
            </h3>
        </div>

        <form method="POST" action="?/{modalMode === 'edit' ? 'update' : 'create'}" use:enhance={() => {
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
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Category Code <span class="text-red-500">*</span></label>
                    <input type="text" name="category_code" bind:value={formData.category_code} required class="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" placeholder="e.g. TRP, CUS">
                </div>

                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Category Name <span class="text-red-500">*</span></label>
                    <input type="text" name="category_name" bind:value={formData.category_name} required class="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" placeholder="e.g. ค่าขนส่ง (Transport)">
                </div>

                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                    <textarea name="description" bind:value={formData.description} rows="2" class="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" placeholder="คำอธิบายเพิ่มเติม..."></textarea>
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