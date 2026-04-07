<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { t } from '$lib/i18n';

	interface Permission {
		id: number;
		name: string;
	}

	interface Role {
		id: number;
		name: string;
		permissions: string[];
	}

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedRole = $state<(Partial<Role> & { permission_ids?: number[] }) | null>(null);
	let roleToDelete = $state<Role | null>(null);
	let isLoading = $state(false);
	let globalMessage = $state<{ success: boolean; text: string } | null>(null);
	let messageTimeout: NodeJS.Timeout;

	const permissionMap = $derived(
		new Map(
			((data.availablePermissions as Permission[]) || []).map((p: Permission) => [p.name, p.id])
		)
	);

	const availablePermissions = $derived((data.availablePermissions as Permission[]) || []);
	let permissionSearchTerm = $state('');

	const filteredPermissions = $derived(
		availablePermissions.filter((p: Permission) =>
			p.name.toLowerCase().includes(permissionSearchTerm.toLowerCase())
		)
	);

	function openModal(mode: 'add' | 'edit', role: Role | null = null) {
		modalMode = mode;
		permissionSearchTerm = '';
		if (mode === 'edit' && role) {
			const assignedPermissionIds = role.permissions
				.map((name) => permissionMap.get(name))
				.filter(Boolean) as number[];
			selectedRole = { ...role, permission_ids: assignedPermissionIds };
		} else {
			selectedRole = { id: undefined, name: '', permission_ids: [] } as any;
		}
	}

	function closeModal() {
		modalMode = null;
		selectedRole = null;
	}

	function showGlobalMessage(success: boolean, text: string) {
		clearTimeout(messageTimeout);
		globalMessage = { success, text };
		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, 5000);
	}

	function togglePermission(permissionId: number) {
		if (!selectedRole?.permission_ids) return;

		const index = selectedRole.permission_ids.indexOf(permissionId);
		if (index > -1) {
			selectedRole.permission_ids.splice(index, 1);
		} else {
			selectedRole.permission_ids.push(permissionId);
		}
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
	<title>{$t('Roles & Permissions')}</title>
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
		<h1 class="text-2xl font-bold text-gray-800">{$t('Roles & Permissions')}</h1>
		<p class="mt-1 text-sm text-gray-500">
			{$t('Manage user roles and their access permissions.')}
		</p>
	</div>
	<button
		onclick={() => openModal('add')}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow transition-colors hover:bg-blue-700"
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
		{$t('Add New Role')}
	</button>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-6 py-3 text-left font-semibold tracking-wider text-gray-600 uppercase"
					>{$t('Role Name')}</th
				>
				<th class="px-6 py-3 text-left font-semibold tracking-wider text-gray-600 uppercase"
					>{$t('Permissions')}</th
				>
				<th class="px-6 py-3 text-center font-semibold tracking-wider text-gray-600 uppercase"
					>{$t('Actions')}</th
				>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#each data.roles as role (role.id)}
				<tr class="transition-colors hover:bg-gray-50">
					<td class="px-6 py-4 font-bold text-gray-900">{role.name}</td>
					<td class="px-6 py-4">
						<div class="flex max-w-md flex-wrap gap-1.5">
							{#if role.permissions.length > 0}
								{#each role.permissions as permission}
									<span
										class="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset"
									>
										{permission}
									</span>
								{/each}
							{:else}
								<span class="text-xs text-gray-400">{$t('No permissions assigned')}</span>
							{/if}
						</div>
					</td>
					<td class="px-6 py-4 text-center whitespace-nowrap">
						<div class="flex items-center justify-center gap-2">
							<button
								onclick={() => openModal('edit', role)}
								class="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-yellow-600"
								aria-label={$t('Edit')}
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
								onclick={() => (roleToDelete = role)}
								class="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-gray-400"
								aria-label={$t('Delete')}
								title={$t('Delete')}
								disabled={role.id <= 2}
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

{#if modalMode && selectedRole}
	<div
		transition:slide={{ duration: 200 }}
		class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16 backdrop-blur-sm"
	>
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div class="relative w-full max-w-2xl transform rounded-xl bg-white shadow-2xl">
			<div class="border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? $t('Add New Role') : $t('Edit Role')}
				</h2>
			</div>
			<form
				method="POST"
				action="?/saveRole"
				use:enhance={() => {
					isLoading = true;
					return async ({ result, update }) => {
						await update();
						if (result.type === 'success') {
							await invalidateAll();
						}
						isLoading = false;
					};
				}}
			>
				<div class="max-h-[60vh] space-y-6 overflow-y-auto p-6">
					<input type="hidden" name="mode" value={modalMode} />
					{#if modalMode === 'edit'}
						<input type="hidden" name="id" value={selectedRole.id} />
					{/if}
					<div>
						<label for="name" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('Role Name')}</label
						>
						<input
							type="text"
							name="name"
							id="name"
							required
							bind:value={selectedRole.name}
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							disabled={selectedRole.id !== undefined && selectedRole.id <= 2}
						/>
						{#if selectedRole.id !== undefined && selectedRole.id <= 2}
							<p class="mt-1 text-xs text-gray-500">{$t('Default roles cannot be renamed.')}</p>
						{/if}
					</div>
					<div>
						<h3 class="mb-3 text-sm font-semibold text-gray-700">{$t('Assign Permissions')}</h3>
						<!-- Always POST the full selected set; filtered-out rows are not in the DOM. -->
						{#each selectedRole.permission_ids ?? [] as pid (pid)}
							<input type="hidden" name="permission_ids" value={pid} />
						{/each}

						<div class="relative mb-4">
							<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
								<svg
									class="h-4 w-4 text-gray-400"
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="2"
									stroke="currentColor"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
									/></svg
								>
							</div>
							<input
								type="search"
								bind:value={permissionSearchTerm}
								placeholder={$t('Search permissions...')}
								class="w-full rounded-md border-gray-300 pl-10 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>

						<div class="max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-4">
							<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
								{#if filteredPermissions.length > 0}
									{#each filteredPermissions as permission (permission.id)}
										<label
											class="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 bg-white p-2.5 transition-colors hover:bg-blue-50"
										>
											<input
												type="checkbox"
												value={permission.id}
												checked={selectedRole.permission_ids?.includes(permission.id)}
												onchange={() => togglePermission(permission.id)}
												class="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
												disabled={selectedRole.id === 1}
											/>
											<span class="text-sm leading-tight font-medium text-gray-700"
												>{permission.name}</span
											>
										</label>
									{/each}
								{:else}
									<div class="col-span-full py-4 text-center text-sm text-gray-500">
										<p>{$t('No permissions found for')} "{permissionSearchTerm}".</p>
									</div>
								{/if}
							</div>
						</div>
						{#if selectedRole.id === 1}
							<p class="mt-2 text-xs font-semibold text-blue-600">
								<span class="mr-1 inline-block">ℹ️</span>{$t(
									'The Admin role automatically has all permissions.'
								)}
							</p>
						{/if}
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
							{$t('Save Role')}
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if roleToDelete}
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
				{$t('Are you sure you want to delete the')}
				<strong class="text-gray-900">"{roleToDelete.name}"</strong>
				{$t('role?')}
			</p>
			<form
				method="POST"
				action="?/deleteRole"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						roleToDelete = null;
					};
				}}
				class="mt-6 flex justify-center gap-3"
			>
				<input type="hidden" name="id" value={roleToDelete.id} />
				<button
					type="button"
					onclick={() => (roleToDelete = null)}
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
