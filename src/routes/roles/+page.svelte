<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';

	type Role = PageData['roles'][0];
	type Permission = PageData['availablePermissions'][0];
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedRole = $state<Partial<Role> & { permission_ids?: number[] } | null>(null);
	let roleToDelete = $state<Role | null>(null);
	let isLoading = $state(false);
    let globalMessage = $state<{ success: boolean, text: string } | null>(null);
    let messageTimeout: NodeJS.Timeout;
	const permissionMap = $derived(new Map((data.availablePermissions || []).map(p => [p.name, p.id])));
	// More robust derived state for permissions
	const availablePermissions = $derived(data.availablePermissions || []);
    let permissionSearchTerm = $state('');

    const filteredPermissions = $derived(
        availablePermissions.filter(p => 
            p.name.toLowerCase().includes(permissionSearchTerm.toLowerCase())
        )
    );

	function openModal(mode: 'add' | 'edit', role: Role | null = null) {
		modalMode = mode;
        permissionSearchTerm = ''; // Reset search on open
		if (mode === 'edit' && role) {
			const assignedPermissionIds = role.permissions.map(name => permissionMap.get(name)).filter(Boolean) as number[];
			selectedRole = { ...role, permission_ids: assignedPermissionIds };
		} else {
			selectedRole = { name: '', permission_ids: [] };
		}
	}

	function closeModal() {
		modalMode = null;
		selectedRole = null;
	}
    
    function showGlobalMessage(success: boolean, text: string) {
        clearTimeout(messageTimeout);
		globalMessage = { success, text };
        messageTimeout = setTimeout(() => { globalMessage = null; }, 5000);
	}

	function togglePermission(permissionId: number) {
		if (!selectedRole?.permission_ids) return;

		const index = selectedRole.permission_ids.indexOf(permissionId);
		if (index > -1) {
			selectedRole.permission_ids.splice(index, 1);
		} else {
			selectedRole.permission_ids.push(permissionId);
		}
		// Svelte 5 runes will automatically trigger reactivity
	}


	$effect.pre(() => {
		if (form?.success) {
            closeModal();
            showGlobalMessage(true, form.message as string);
		} else if (form?.message) {
            showGlobalMessage(false, form.message as string);
        }
	});
</script>

<svelte:head>
	<title>Roles & Permissions</title>
</svelte:head>

{#if globalMessage}
    <div transition:fade class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 font-semibold text-sm shadow-xl {globalMessage.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
        <p>{globalMessage.text}</p>
    </div>
{/if}

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">Roles & Permissions</h1>
		<p class="mt-1 text-sm text-gray-500">Manage user roles and their access permissions.</p>
	</div>
	<button onclick={() => openModal('add')} class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
		Add New Role
	</button>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Role Name</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Permissions</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#each data.roles as role (role.id)}
				<tr class="hover:bg-gray-50">
					<td class="px-4 py-3 font-medium text-gray-900">{role.name}</td>
					<td class="px-4 py-3">
						<div class="flex flex-wrap gap-1 max-w-md">
							{#if role.permissions.length > 0}
								{#each role.permissions as permission}
									<span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{permission}</span>
								{/each}
							{:else}
								<span class="text-xs text-gray-400">No permissions assigned</span>
							{/if}
						</div>
					</td>
					<td class="whitespace-nowrap px-4 py-3">
						<div class="flex items-center gap-2">
							<button onclick={() => openModal('edit', role)} class="rounded p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Edit role">
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
							</button>
							<button onclick={() => (roleToDelete = role)} class="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Delete role" disabled={role.id <= 2}>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
							</button>
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

{#if modalMode && selectedRole}
	<div transition:slide class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div class="relative w-full max-w-2xl transform rounded-xl bg-white shadow-2xl">
			<div class="border-b px-6 py-4"><h2 class="text-lg font-bold">{modalMode === 'add' ? 'Add New Role' : 'Edit Role'}</h2></div>
			<form method="POST" action="?/saveRole" use:enhance={() => { isLoading = true; return async ({ update }) => { await update(); isLoading = false; }; }}>
				<div class="space-y-6 p-6 max-h-[60vh] overflow-y-auto">
					{#if modalMode === 'edit'}<input type="hidden" name="id" value={selectedRole.id} />{/if}
					<div>
						<label for="name" class="mb-1 block text-sm font-medium">Role Name</label>
						<input type="text" name="name" id="name" required bind:value={selectedRole.name} class="w-full rounded-md border-gray-300" disabled={selectedRole.id <= 2}/>
                        {#if selectedRole.id <= 2}
                            <p class="text-xs text-gray-500 mt-1">Default roles cannot be renamed.</p>
                        {/if}
					</div>
					<div>
						<h3 class="mb-2 text-sm font-medium">Assign Permissions</h3>
                        
                        <div class="mb-4">
                            <input 
                                type="search" 
                                bind:value={permissionSearchTerm}
                                placeholder="Search permissions..."
                                class="w-full rounded-md border-gray-300 text-sm"
                            />
                        </div>

						<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 rounded-md border p-4 max-h-64 overflow-y-auto">
							{#if filteredPermissions.length > 0}
								{#each filteredPermissions as permission (permission.id)}
									<label class="flex items-center gap-2">
										<input 
											type="checkbox" 
											name="permission_ids" 
											value={permission.id} 
											checked={selectedRole.permission_ids?.includes(permission.id)}
											onchange={() => togglePermission(permission.id)}
											class="rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
											disabled={selectedRole.id === 1}
										/>
										<span class="text-sm">{permission.name}</span>
									</label>
								{/each}
							{:else}
								<div class="col-span-full text-center text-sm text-gray-500">
									<p>No permissions found for "{permissionSearchTerm}".</p>
								</div>
							{/if}
						</div>
                        {#if selectedRole.id === 1}
                             <p class="text-xs text-gray-500 mt-1">The Admin role automatically has all permissions.</p>
                        {/if}
					</div>
				</div>
				<div class="flex justify-end gap-3 border-t bg-gray-50 p-4">
					<button type="button" onclick={closeModal} class="rounded-md border bg-white px-4 py-2 text-sm">Cancel</button>
					<button type="submit" disabled={isLoading} class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:bg-blue-400">
						{#if isLoading} Saving... {:else} Save Role {/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if roleToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">Confirm Deletion</h3>
			<p class="mt-2 text-sm">Are you sure you want to delete the "<strong>{roleToDelete.name}</strong>" role?</p>
			<form method="POST" action="?/deleteRole" use:enhance={() => { return async ({ update }) => { await update(); roleToDelete = null; }; }} class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="id" value={roleToDelete.id} />
				<button type="button" onclick={() => (roleToDelete = null)} class="rounded-md border bg-white px-4 py-2 text-sm">Cancel</button>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white">Delete</button>
			</form>
		</div>
	</div>
{/if}