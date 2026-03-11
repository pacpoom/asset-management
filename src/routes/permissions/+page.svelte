<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { t } from '$lib/i18n';

	interface Permission {
		id: number;
		name: string;
		guard_name: string;
	}

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedPermission = $state<Partial<Permission> | null>(null);
	let permissionToDelete = $state<Permission | null>(null);
	let isLoading = $state(false);
	let globalMessage = $state<{ success: boolean; text: string } | null>(null);
	let messageTimeout: NodeJS.Timeout;

	function openModal(mode: 'add' | 'edit', permission: Permission | null = null) {
		modalMode = mode;
		selectedPermission =
			mode === 'edit' && permission
				? { ...permission }
				: ({ id: undefined, name: '', guard_name: 'web' } as any);
	}

	function closeModal() {
		modalMode = null;
		selectedPermission = null;
	}

	function showGlobalMessage(success: boolean, text: string) {
		clearTimeout(messageTimeout);
		globalMessage = { success, text };
		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, 5000);
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
	<title>{$t('Permissions Management')}</title>
</svelte:head>

{#if globalMessage}
	<div
		transition:fade
		class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 text-sm font-semibold shadow-xl {globalMessage.success
			? 'bg-green-100 text-green-800'
			: 'bg-red-100 text-red-800'}"
	>
		<p>{globalMessage.text}</p>
	</div>
{/if}

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Permissions Management')}</h1>
		<p class="mt-1 text-sm text-gray-500">
			{$t('Manage individual permissions that can be assigned to roles.')}
		</p>
	</div>
	<button
		onclick={() => openModal('add')}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			class="h-4 w-4"
			><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg
		>
		{$t('Add New Permission')}
	</button>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-6 py-3 text-left font-semibold tracking-wider text-gray-600 uppercase"
					>{$t('Permission Name')}</th
				>
				<th class="px-6 py-3 text-left font-semibold tracking-wider text-gray-600 uppercase"
					>{$t('Guard')}</th
				>
				<th class="px-6 py-3 text-center font-semibold tracking-wider text-gray-600 uppercase"
					>{$t('Actions')}</th
				>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#each data.permissions as permission (permission.id)}
				<tr class="transition-colors hover:bg-gray-50">
					<td class="px-6 py-4 font-medium text-gray-900">{permission.name}</td>
					<td class="px-6 py-4 font-mono text-xs text-gray-500">{permission.guard_name}</td>
					<td class="px-6 py-4 text-center whitespace-nowrap">
						<div class="flex items-center justify-center gap-2">
							<button
								onclick={() => openModal('edit', permission)}
								class="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-yellow-600"
								aria-label={$t('Edit permission')}
								title={$t('Edit')}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
								>
							</button>
							<button
								onclick={() => (permissionToDelete = permission)}
								class="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600"
								aria-label={$t('Delete permission')}
								title={$t('Delete')}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg
								>
							</button>
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

{#if modalMode && selectedPermission}
	<div
		transition:slide={{ duration: 200 }}
		class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16 backdrop-blur-sm"
	>
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div class="relative w-full max-w-md transform rounded-xl bg-white shadow-2xl">
			<div class="border-b border-gray-200 px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? $t('Add New Permission') : $t('Edit Permission')}
				</h2>
			</div>
			<form
				method="POST"
				action="?/savePermission"
				use:enhance={() => {
					isLoading = true;
					return async ({ update }) => {
						await update();
						isLoading = false;
					};
				}}
			>
				<div class="space-y-6 p-6">
					{#if modalMode === 'edit'}
						<input type="hidden" name="id" value={selectedPermission.id} />
					{/if}
					<div>
						<label for="name" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('Permission Name')}</label
						>
						<input
							type="text"
							name="name"
							id="name"
							required
							bind:value={selectedPermission.name}
							placeholder="e.g., view_reports"
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
						/>
					</div>
				</div>
				<div
					class="flex justify-end gap-3 rounded-b-xl border-t border-gray-200 bg-gray-50 px-6 py-4"
				>
					<button
						type="button"
						onclick={closeModal}
						class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
					>
						{$t('Cancel')}
					</button>
					<button
						type="submit"
						disabled={isLoading}
						class="rounded-md bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-70"
					>
						{#if isLoading}
							{$t('Saving...')}
						{:else}
							{$t('Save Permission')}
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if permissionToDelete}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div class="animate-in fade-in zoom-in-95 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
			<div
				class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="h-6 w-6"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/></svg
				>
			</div>
			<h3 class="text-center text-lg font-bold text-gray-900">{$t('Confirm Deletion')}</h3>
			<p class="mt-2 text-center text-sm text-gray-600">
				{$t('Are you sure you want to delete the "')}<strong class="text-gray-900"
					>{permissionToDelete.name}</strong
				>{$t('" permission?')}
			</p>
			<form
				method="POST"
				action="?/deletePermission"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						permissionToDelete = null;
					};
				}}
				class="mt-6 flex justify-center gap-3"
			>
				<input type="hidden" name="id" value={permissionToDelete.id} />
				<button
					type="button"
					onclick={() => (permissionToDelete = null)}
					class="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
				>
					{$t('Cancel')}
				</button>
				<button
					type="submit"
					class="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-red-700"
				>
					{$t('Delete')}
				</button>
			</form>
		</div>
	</div>
{/if}
