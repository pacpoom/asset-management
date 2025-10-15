<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';

	type Permission = PageData['permissions'][0];

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedPermission = $state<Partial<Permission> | null>(null);
	let permissionToDelete = $state<Permission | null>(null);
	let isLoading = $state(false);
    let globalMessage = $state<{ success: boolean, text: string } | null>(null);
    let messageTimeout: NodeJS.Timeout;

	function openModal(mode: 'add' | 'edit', permission: Permission | null = null) {
		modalMode = mode;
		selectedPermission = mode === 'edit' && permission ? { ...permission } : { name: '' };
	}

	function closeModal() {
		modalMode = null;
		selectedPermission = null;
	}

    function showGlobalMessage(success: boolean, text: string) {
        clearTimeout(messageTimeout);
        globalMessage = { success, text };
        messageTimeout = setTimeout(() => { globalMessage = null; }, 5000);
    }

	$effect(() => {
		if (form?.success) {
            closeModal();
            showGlobalMessage(true, form.message as string);
		} else if (form?.message) {
            showGlobalMessage(false, form.message as string);
        }
	});
</script>

<svelte:head>
	<title>Permissions Management</title>
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
		<h1 class="text-2xl font-bold text-gray-800">Permissions Management</h1>
		<p class="mt-1 text-sm text-gray-500">Manage individual permissions that can be assigned to roles.</p>
	</div>
	<button onclick={() => openModal('add')} class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
		Add New Permission
	</button>
</div>

<!-- Permissions Table -->
<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Permission Name</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Guard</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#each data.permissions as permission (permission.id)}
				<tr class="hover:bg-gray-50">
					<td class="px-4 py-3 font-medium text-gray-900">{permission.name}</td>
					<td class="px-4 py-3 font-mono text-xs">{permission.guard_name}</td>
					<td class="whitespace-nowrap px-4 py-3">
						<div class="flex items-center gap-2">
							<button onclick={() => openModal('edit', permission)} class="rounded p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Edit permission">
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
							</button>
							<button onclick={() => (permissionToDelete = permission)} class="rounded p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Delete permission">
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
							</button>
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<!-- Add/Edit Permission Modal -->
{#if modalMode && selectedPermission}
	<div transition:slide class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16">
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div class="relative w-full max-w-lg transform rounded-xl bg-white shadow-2xl">
			<div class="border-b px-6 py-4"><h2 class="text-lg font-bold">{modalMode === 'add' ? 'Add New Permission' : 'Edit Permission'}</h2></div>
			<form method="POST" action="?/savePermission" use:enhance={() => { isLoading = true; return async ({ update }) => { await update(); isLoading = false; }; }}>
				<div class="space-y-6 p-6">
					{#if modalMode === 'edit'}<input type="hidden" name="id" value={selectedPermission.id} />{/if}
					<div>
						<label for="name" class="mb-1 block text-sm font-medium">Permission Name</label>
						<input type="text" name="name" id="name" required bind:value={selectedPermission.name} placeholder="e.g., view_reports" class="w-full rounded-md border-gray-300"/>
					</div>
				</div>
				<div class="flex justify-end gap-3 border-t bg-gray-50 p-4">
					<button type="button" onclick={closeModal} class="rounded-md border bg-white px-4 py-2 text-sm">Cancel</button>
					<button type="submit" disabled={isLoading} class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:bg-blue-400">
						{#if isLoading} Saving... {:else} Save Permission {/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if permissionToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">Confirm Deletion</h3>
			<p class="mt-2 text-sm">Are you sure you want to delete the "<strong>{permissionToDelete.name}</strong>" permission?</p>
			<form method="POST" action="?/deletePermission" use:enhance={() => { return async ({ update }) => { await update(); permissionToDelete = null; }; }} class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="id" value={permissionToDelete.id} />
				<button type="button" onclick={() => (permissionToDelete = null)} class="rounded-md border bg-white px-4 py-2 text-sm">Cancel</button>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white">Delete</button>
			</form>
		</div>
	</div>
{/if}
