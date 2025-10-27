<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
    import { invalidateAll } from '$app/navigation'; // For refreshing data

	// --- Types ---
	type Unit = PageData['units'][0];

	// --- Props & State ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedUnit = $state<Partial<Unit> | null>(null);
	let unitToDelete = $state<Unit | null>(null);
    let isSaving = $state(false);
    let globalMessage = $state<{ success: boolean, text: string, type: 'success' | 'error' } | null>(null);
    let messageTimeout: NodeJS.Timeout;

	// --- Functions ---
	function openModal(mode: 'add' | 'edit', unit: Unit | null = null) {
		modalMode = mode;
        globalMessage = null; // Clear message on open
		if (mode === 'edit' && unit) {
			selectedUnit = { ...unit }; // Copy for editing
		} else {
			selectedUnit = { name: '', symbol: '', is_base_unit: true, base_unit_id: null }; // Defaults for new
		}
	}

	function closeModal() {
		modalMode = null;
		selectedUnit = null;
	}

    function showGlobalMessage(message: { success: boolean, text: string, type: 'success' | 'error' }, duration: number = 5000) {
        clearTimeout(messageTimeout);
        globalMessage = message;
        messageTimeout = setTimeout(() => { globalMessage = null; }, duration);
    }

	// --- Reactive Effects ---
	$effect.pre(() => {
        // Handle saveUnit results
        if (form?.action === 'saveUnit') {
            if (form.success) {
                closeModal();
                showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
                invalidateAll(); // Refresh unit list data
            } else if (form.message) {
                 // Keep modal open, show error globally or inside modal
                 showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
            }
             form.action = undefined; // Consume the action state
        }

        // Handle deleteUnit results
        if (form?.action === 'deleteUnit') {
            if (form.success) {
                showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
                invalidateAll(); // Refresh data after delete
            } else if (form.message) {
                showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
            }
            unitToDelete = null; // Close confirmation modal regardless of outcome
            form.action = undefined;
        }
	});

</script>

<svelte:head>
	<title>Unit Management</title>
</svelte:head>

<!-- Global Notifications -->
{#if globalMessage}
    <div
        transition:fade
        class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 font-semibold text-sm shadow-xl {globalMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}"
    >
        {globalMessage.text}
    </div>
{/if}

<!-- Main Header -->
<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">Unit Management</h1>
		<p class="mt-1 text-sm text-gray-500">จัดการหน่วยนับสำหรับสินค้า (เช่น ชิ้น, กล่อง, โหล)</p>
	</div>
	<button
		onclick={() => openModal('add')}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
	>
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
		เพิ่มหน่วยนับใหม่
	</button>
</div>

<!-- Units Table -->
<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Name</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Symbol</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Base Unit</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.units.length === 0}
				<tr>
					<td colspan="5" class="py-12 text-center text-gray-500">
						ไม่พบข้อมูลหน่วยนับ
					</td>
				</tr>
			{:else}
				{#each data.units as unit (unit.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 font-medium text-gray-900">{unit.name}</td>
						<td class="px-4 py-3 font-mono text-xs uppercase text-gray-700">{unit.symbol}</td>
						<td class="px-4 py-3">
                            {#if unit.is_base_unit}
                                <span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Base Unit</span>
                            {:else}
                                <span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">Sub Unit</span>
                            {/if}
                        </td>
						<td class="px-4 py-3 text-gray-600">{unit.base_unit_name ?? (unit.is_base_unit ? '-' : 'N/A')}</td>
						<td class="px-4 py-3">
							<div class="flex items-center gap-2">
								<button onclick={() => openModal('edit', unit)} class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600" aria-label="Edit unit">
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
								</button>
								<button onclick={() => (unitToDelete = unit)} class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600" aria-label="Delete unit">
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
								</button>
							</div>
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

<!-- Add/Edit Unit Modal -->
{#if modalMode && selectedUnit}
	<div transition:slide class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div class="relative w-full max-w-lg transform rounded-xl bg-white shadow-2xl">
			<div class="border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">{modalMode === 'add' ? 'เพิ่มหน่วยนับใหม่' : 'แก้ไขหน่วยนับ'}</h2>
			</div>

			<form method="POST" action="?/saveUnit" use:enhance={() => { isSaving = true; return async ({ update }) => { await update(); isSaving = false; }; }}>
				<div class="space-y-4 p-6">
					{#if modalMode === 'edit'}<input type="hidden" name="id" value={selectedUnit.id} />{/if}

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label for="name" class="mb-1 block text-sm font-medium text-gray-700">Name *</label>
                            <input type="text" name="name" id="name" required bind:value={selectedUnit.name} class="w-full rounded-md border-gray-300"/>
                        </div>
                        <div>
                            <label for="symbol" class="mb-1 block text-sm font-medium text-gray-700">Symbol *</label>
                            <input type="text" name="symbol" id="symbol" required bind:value={selectedUnit.symbol} placeholder="e.g., pcs, box, kg" class="w-full rounded-md border-gray-300"/>
                        </div>
                    </div>

                    <div>
                        <span class="mb-1 block text-sm font-medium text-gray-700">Unit Type *</span>
                        <div class="flex items-center space-x-4 mt-2">
                             <label class="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="is_base_unit"
                                    value="true"
                                    bind:group={selectedUnit.is_base_unit}
                                    class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span class="text-sm">Base Unit (e.g., ชิ้น, กิโลกรัม)</span>
                            </label>
                             <label class="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="is_base_unit"
                                    value="false"
                                    bind:group={selectedUnit.is_base_unit}
                                    class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span class="text-sm">Sub Unit (e.g., กล่อง, โหล)</span>
                            </label>
                        </div>
                         <!-- Hidden input to ensure value is submitted -->
                        <input type="hidden" name="is_base_unit" value={selectedUnit.is_base_unit === true ? 'true' : 'false'}>
                    </div>

                    <!-- Base Unit Selection (Show only if Sub Unit is selected) -->
                    {#if selectedUnit.is_base_unit === false}
                         <div transition:slide>
                            <label for="base_unit_id" class="mb-1 block text-sm font-medium text-gray-700">Base Unit *</label>
                            <select name="base_unit_id" id="base_unit_id" bind:value={selectedUnit.base_unit_id} required class="w-full rounded-md border-gray-300">
                                <option value={null}>-- Select Base Unit --</option>
                                {#each data.baseUnits as baseUnit (baseUnit.id)}
                                    {#if baseUnit.id !== selectedUnit?.id} <!-- Prevent selecting self -->
                                        <option value={baseUnit.id}>{baseUnit.name} ({baseUnit.symbol})</option>
                                    {/if}
                                {/each}
                            </select>
                            <p class="mt-1 text-xs text-gray-500">Select the main unit this sub-unit relates to (e.g., for 'Box', select 'Piece'). You will define the conversion factor on the next page.</p>
                        </div>
                    {/if}

                    <!-- Display form error messages -->
                    {#if form?.message && !form.success && form.action === 'saveUnit'}
                        <div class="rounded-md bg-red-50 p-3 text-sm text-red-600">
                            <p><strong>Error:</strong> {form.message}</p>
                        </div>
                    {/if}

				</div>
				<div class="flex justify-end gap-3 border-t bg-gray-50 p-4">
					<button type="button" onclick={closeModal} class="rounded-md border bg-white px-4 py-2 text-sm">Cancel</button>
					<button type="submit" disabled={isSaving} class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:bg-blue-400">
						{#if isSaving} Saving... {:else} Save Unit {/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if unitToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">ยืนยันการลบ</h3>
			<p class="mt-2 text-sm text-gray-600">คุณแน่ใจหรือไม่ที่จะลบหน่วยนับ "<strong>{unitToDelete.name}</strong>"? การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
            {#if form?.message && !form.success && form.action === 'deleteUnit'}
                 <p class="mt-2 text-sm text-red-600"><strong>Error:</strong> {form.message}</p>
            {/if}
			<form method="POST" action="?/deleteUnit" use:enhance class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="id" value={unitToDelete.id} />
				<button type="button" onclick={() => (unitToDelete = null)} class="rounded-md border bg-white px-4 py-2 text-sm">Cancel</button>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white">Delete</button>
			</form>
		</div>
	</div>
{/if}
