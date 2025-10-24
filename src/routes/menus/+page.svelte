<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';

	// UPDATED: Menu type now includes children for nested structure display
	type Menu = PageData['menus'][0]; 

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedMenu = $state<Partial<Menu> | null>(null);
	let menuToDelete = $state<Menu | null>(null);
	let isLoading = $state(false);
    let globalMessage = $state<{ success: boolean, text: string } | null>(null);
    let messageTimeout: NodeJS.Timeout;
    
	function openModal(mode: 'add' | 'edit', menu: Menu | null = null) {
		modalMode = mode;
		if (mode === 'edit' && menu) {
			// Ensure parent_id is null if it's the root, otherwise convert to string for select box
			selectedMenu = { ...menu, parent_id: menu.parent_id ?? null };
		} else {
			// Default to root level
			selectedMenu = { title: '', order: data.menus.length + 1, parent_id: null };
		}
	}

	function closeModal() {
		modalMode = null;
		selectedMenu = null;
	}

    function showGlobalMessage(success: boolean, text: string) {
        clearTimeout(messageTimeout);
        globalMessage = { success, text };
        messageTimeout = setTimeout(() => { globalMessage = null; }, 5000);
    }

	$effect(() => {
		if (form?.success) {
            closeModal();
            // RELOAD data after successful form submission to reflect changes immediately
            // Since this page uses layout.server.ts's load data, we need a full refresh.
            // In a real SvelteKit app using `+page.server.ts` this would be `await update({ invalidate: '/menus' })`
            // But since this is a simple page, a quick reload is acceptable.
            setTimeout(() => window.location.reload(), 100); 
            showGlobalMessage(true, form.message as string);
		} else if (form?.message) {
            showGlobalMessage(false, form.message as string);
        }
	});

	// MODIFIED: Filter for menus that can be parents (no route, and not the current item being edited)
    // We flatten the list for use in the dropdown but ensure only grouping menus are selectable.
	const selectableParents = $derived(
        data.menus
            .filter(m => 
                m.route === null && // Only menus that are groups (no route)
                m.id !== selectedMenu?.id && // Cannot be its own parent
                m.parent_id !== selectedMenu?.id // Cannot be a child of the current menu (prevents simple circular logic)
            )
            .sort((a, b) => a.order - b.order)
    );
    
    // RECURSIVE FUNCTION to render the menu rows with indentation
    // We will use a flat list for simplicity in data fetching, but render it hierarchically
    function renderMenuRows(menus: Menu[], level: number = 0) {
        const rows: Menu[] = [];
        const menuMap = new Map<number, Menu>();
        
        // 1. Create a map and initialize children array
        menus.forEach(menu => {
            menu.children = []; // Ensure children array exists for rendering logic
            menuMap.set(menu.id, menu);
        });

        // 2. Build the tree (Only for display purposes here)
        const rootItems: Menu[] = [];
        menus.forEach(menu => {
            if (menu.parent_id && menuMap.has(menu.parent_id)) {
                menuMap.get(menu.parent_id)?.children?.push(menu);
            } else {
                rootItems.push(menu);
            }
        });
        
        // Sort root and children
        const sortMenus = (menuList: Menu[]) => {
            menuList.sort((a, b) => a.order - b.order);
            menuList.forEach(menu => {
                if (menu.children && menu.children.length > 0) {
                    sortMenus(menu.children);
                }
            });
        };
        sortMenus(rootItems);

        // 3. Flatten the tree for table display with indentation
        function flatten(menuList: Menu[], currentLevel: number) {
            menuList.forEach(menu => {
                // @ts-ignore: We know we are adding 'level' property here
                rows.push({...menu, level: currentLevel}); // Add level info
                if (menu.children && menu.children.length > 0) {
                    flatten(menu.children, currentLevel + 1);
                }
            });
        }
        flatten(rootItems, 0);
        
        return rows;
    }
    
    const displayMenus = $derived(renderMenuRows(data.menus));
</script>

<svelte:head>
	<title>Menu Management</title>
</svelte:head>

<!-- Global Notifications -->
{#if globalMessage}
    <div transition:fade class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 font-semibold text-sm shadow-xl {globalMessage.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
        <p>{globalMessage.text}</p>
    </div>
{/if}

<!-- Main Header -->
<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">Menu Management</h1>
		<p class="mt-1 text-sm text-gray-500">Organize the application's navigation sidebar. (รองรับ Sub Menu)</p>
	</div>
	<button onclick={() => openModal('add')} class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
		Add New Menu Item
	</button>
</div>

<!-- Menus Table -->
<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600 w-1/3">Title</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Route</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Required Permission</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Order</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if displayMenus.length === 0}
				<tr>
					<td colspan="5" class="py-12 text-center text-gray-500">No menu items found.</td>
				</tr>
			{:else}
				{#each displayMenus as menu (menu.id)}
					<tr class="hover:bg-gray-50 transition-colors {menu.level > 0 ? 'bg-gray-50/70' : ''}">
						<td class="px-4 py-3 font-medium text-gray-900">
                            <!-- Indentation based on level -->
                            <div class="flex items-center" style="padding-left: {menu.level * 1.5}rem;">
                                {#if menu.level > 0}
                                    <span class="mr-2 text-gray-400">↳</span>
                                {:else if menu.children.length > 0}
                                    <span class="mr-2 text-gray-400">📁</span>
                                {/if}
                                {menu.title}
                            </div>
                        </td>
						<td class="px-4 py-3 font-mono text-xs">{menu.route ?? 'N/A'}</td>
						<td class="px-4 py-3">{menu.permission_name ?? '(Public)'}</td>
						<td class="px-4 py-3">{menu.order}</td>
						<td class="whitespace-nowrap px-4 py-3">
							<div class="flex items-center gap-2">
								<button onclick={() => openModal('edit', menu)} class="rounded p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Edit menu">
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
								</button>
								<button onclick={() => (menuToDelete = menu)} class="rounded p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Delete menu">
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

<!-- Add/Edit Menu Modal -->
{#if modalMode && selectedMenu}
	<div transition:slide class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div class="relative w-full max-w-lg transform rounded-xl bg-white shadow-2xl">
			<div class="border-b px-6 py-4"><h2 class="text-lg font-bold">{modalMode === 'add' ? 'Add Menu Item' : 'Edit Menu Item'}</h2></div>
			<form method="POST" action="?/saveMenu" use:enhance={() => { isLoading = true; return async ({ update }) => { await update(); isLoading = false; }; }}>
				<div class="space-y-4 p-6">
					{#if modalMode === 'edit'}<input type="hidden" name="id" value={selectedMenu.id} />{/if}
					
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label for="title" class="mb-1 block text-sm font-medium">Title *</label>
                            <input type="text" name="title" id="title" required bind:value={selectedMenu.title} class="w-full rounded-md border-gray-300"/>
                        </div>
                        <div>
                            <label for="order" class="mb-1 block text-sm font-medium">Order *</label>
                            <input type="number" name="order" id="order" required bind:value={selectedMenu.order} class="w-full rounded-md border-gray-300"/>
                        </div>
                    </div>
                    
                    <!-- MODIFIED: Parent Menu selection uses selectableParents -->
                    <div>
						<label for="parent_id" class="mb-1 block text-sm font-medium">Parent Menu (สำหรับสร้าง Sub Menu)</label>
						<select name="parent_id" id="parent_id" bind:value={selectedMenu.parent_id} class="w-full rounded-md border-gray-300">
							<option value={null}>-- None (Root Level) --</option>
							{#each selectableParents as menu}
								<option value={menu.id}>{menu.title}</option>
							{/each}
						</select>
                        <p class="mt-1 text-xs text-gray-500">หากเลือก Parent Menu ช่อง Route จะถูกละเว้น (เป็นเมนูสำหรับเปิดรายการย่อย)</p>
					</div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label for="icon" class="mb-1 block text-sm font-medium">Icon Name (Lucide Icons)</label>
                            <input type="text" name="icon" id="icon" bind:value={selectedMenu.icon} placeholder="เช่น assets, settings, users" class="w-full rounded-md border-gray-300"/>
                        </div>
                         <div>
                            <label for="route" class="mb-1 block text-sm font-medium">Route</label>
                            <input type="text" name="route" id="route" bind:value={selectedMenu.route} placeholder="/assets" class="w-full rounded-md border-gray-300" disabled={!!selectedMenu.parent_id}/>
                        </div>
                    </div>

                    <div>
						<label for="permission_name" class="mb-1 block text-sm font-medium">Required Permission</label>
						<select name="permission_name" id="permission_name" bind:value={selectedMenu.permission_name} class="w-full rounded-md border-gray-300">
							<option value={null}>-- None (Public) --</option>
							{#each data.availablePermissions as permission}
								<option value={permission}>{permission}</option>
							{/each}
						</select>
					</div>
				</div>
				<div class="flex justify-end gap-3 border-t bg-gray-50 p-4">
					<button type="button" onclick={closeModal} class="rounded-md border bg-white px-4 py-2 text-sm">Cancel</button>
					<button type="submit" disabled={isLoading} class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:bg-blue-400">
						{#if isLoading} Saving... {:else} Save Menu {/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if menuToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">Confirm Deletion</h3>
			<p class="mt-2 text-sm">
                Are you sure you want to delete "<strong>{menuToDelete.title}</strong>"? 
                {#if menuToDelete.children && menuToDelete.children.length > 0}
                    <span class="font-bold text-red-600">This will also delete all {menuToDelete.children.length} sub-menus under it.</span>
                {/if}
            </p>
			<form method="POST" action="?/deleteMenu" use:enhance={() => { return async ({ update }) => { await update(); menuToDelete = null; }; }} class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="id" value={menuToDelete.id} />
				<button type="button" onclick={() => (menuToDelete = null)} class="rounded-md border bg-white px-4 py-2 text-sm">Cancel</button>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white">Delete</button>
			</form>
		</div>
	</div>
{/if}