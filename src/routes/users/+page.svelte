<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide } from 'svelte/transition';

	// Define a more complete User type based on PageData
	type User = PageData['users'][0];

	export let data: PageData;
	export let form: ActionData;

	let modalMode: 'add' | 'edit' | null = null;
	// The selectedUser can have properties not present in the table, like password
	let selectedUser: Partial<User> & { password?: string } | null = null;
	let userToDelete: User | null = null;
	let isLoading = false;

	function openModal(mode: 'add' | 'edit', user: User | null = null) {
		modalMode = mode;
		if (mode === 'edit' && user) {
			// Create a copy for editing, ensuring password is not shown
			selectedUser = { ...user, password: '' };
		} else {
			// Set defaults for a new user, default role to the first available role ID
			selectedUser = {
				role_id: data.roles?.[0]?.id,
				department_id: undefined,
				position_id: undefined,
				emp_id: ''
			};
		}
	}

	function closeModal() {
		modalMode = null;
		selectedUser = null;
		form = undefined; // Clear previous form errors
	}

	// Reactively close modal on successful form submission
	$: if (form?.success) {
		closeModal();
	}
</script>

<svelte:head>
	<title>Users Management</title>
</svelte:head>

<!-- Main Header -->
<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">Users Management</h1>
		<p class="mt-1 text-sm text-gray-500">Add, edit, and manage user accounts.</p>
	</div>
	<button
		on:click={() => openModal('add')}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="h-4 w-4"
		>
			<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
		</svg>
		Add New User
	</button>
</div>

<!-- Users Table -->
<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Full Name</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Employee ID</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Email</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Username</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Department</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Position</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Role</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.users.length === 0}
				<tr>
					<td colspan="8" class="py-12 text-center text-gray-500"> No users found. </td>
				</tr>
			{:else}
				{#each data.users as user (user.id)}
					<tr class="hover:bg-gray-50">
						<td class="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{user.full_name}</td>
						<td class="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700"
							>{user.emp_id ?? 'N/A'}</td
						>
						<td class="whitespace-nowrap px-4 py-3 text-gray-600">{user.email}</td>
						<td class="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700"
							>{user.username}</td
						>
						<td class="whitespace-nowrap px-4 py-3 text-gray-600"
							>{user.department_name ?? 'N/A'}</td
						>
						<td class="whitespace-nowrap px-4 py-3 text-gray-600"
							>{user.position_name ?? 'N/A'}</td
						>
						<td class="whitespace-nowrap px-4 py-3">
							<span
								class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {user.role ===
								'admin'
									? 'bg-purple-100 text-purple-800'
									: 'bg-gray-100 text-gray-800'}"
							>
								{user.role}
							</span>
						</td>
						<td class="whitespace-nowrap px-4 py-3">
							<div class="flex items-center gap-2">
								<button
									on:click={() => openModal('edit', user)}
									class="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600"
									aria-label="Edit user"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="24"
										height="24"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="h-4 w-4"
										><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path
											d="m15 5 4 4"
										/></svg
									>
								</button>
								<button
									on:click={() => (userToDelete = user)}
									class="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600"
									aria-label="Delete user"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="24"
										height="24"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="h-4 w-4"
										><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path
											d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
										/></svg
									>
								</button>
							</div>
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

<!-- Add/Edit User Modal -->
{#if modalMode && selectedUser}
	<div
		transition:slide={{ duration: 150 }}
		class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
	>
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<div
			class="fixed inset-0"
			on:click={closeModal}
			role="button"
			tabindex="-1"
			aria-label="Close modal"
		></div>

		<div class="relative w-full max-w-lg transform rounded-xl bg-white shadow-2xl transition-all">
			<div class="border-b border-gray-200 px-6 py-4">
				<h2 id="modal-title" class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? 'Add New User' : 'Edit User'}
				</h2>
			</div>

			<form
				method="POST"
				action={modalMode === 'add' ? '?/addUser' : '?/editUser'}
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
						<input type="hidden" name="id" value={selectedUser.id} />
					{/if}

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<!-- Full Name -->
						<div>
							<label for="full_name" class="mb-1 block text-sm font-medium text-gray-700"
								>Full Name</label
							>
							<input
								type="text"
								name="full_name"
								id="full_name"
								required
								bind:value={selectedUser.full_name}
								class="w-full rounded-md border-gray-300 shadow-sm"
							/>
						</div>
						<!-- Employee ID -->
						<div>
							<label for="emp_id" class="mb-1 block text-sm font-medium text-gray-700"
								>Employee ID</label
							>
							<input
								type="text"
								name="emp_id"
								id="emp_id"
								bind:value={selectedUser.emp_id}
								class="w-full rounded-md border-gray-300 shadow-sm"
							/>
						</div>
					</div>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<!-- Username -->
						<div>
							<label for="username" class="mb-1 block text-sm font-medium text-gray-700"
								>Username</label
							>
							<input
								type="text"
								name="username"
								id="username"
								required
								bind:value={selectedUser.username}
								class="w-full rounded-md border-gray-300 shadow-sm"
							/>
						</div>

						<!-- Email -->
						<div>
							<label for="email" class="mb-1 block text-sm font-medium text-gray-700">Email</label>
							<input
								type="email"
								name="email"
								id="email"
								required
								bind:value={selectedUser.email}
								class="w-full rounded-md border-gray-300 shadow-sm"
							/>
						</div>
					</div>

					<!-- Password -->
					<div>
						<label for="password" class="mb-1 block text-sm font-medium text-gray-700"
							>Password</label
						>
						<input
							type="password"
							name="password"
							id="password"
							required={modalMode === 'add'}
							bind:value={selectedUser.password}
							class="w-full rounded-md border-gray-300 shadow-sm"
						/>
						{#if modalMode === 'edit'}
							<p class="mt-1 text-xs text-gray-500">Leave blank to keep the current password.</p>
						{/if}
					</div>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<!-- Department -->
						<div>
							<label for="department_id" class="mb-1 block text-sm font-medium text-gray-700"
								>Department</label
							>
							<select
								name="department_id"
								id="department_id"
								bind:value={selectedUser.department_id}
								class="w-full rounded-md border-gray-300 shadow-sm"
							>
								<option value={undefined}>-- Select Department --</option>
								{#each data.departments as department (department.id)}
									<option value={department.id}>{department.name}</option>
								{/each}
							</select>
						</div>

						<!-- Position -->
						<div>
							<label for="position_id" class="mb-1 block text-sm font-medium text-gray-700"
								>Position</label
							>
							<select
								name="position_id"
								id="position_id"
								bind:value={selectedUser.position_id}
								class="w-full rounded-md border-gray-300 shadow-sm"
							>
								<option value={undefined}>-- Select Position --</option>
								{#each data.positions as position (position.id)}
									<option value={position.id}>{position.name}</option>
								{/each}
							</select>
						</div>
					</div>

					<!-- Role -->
					<div>
						<label for="role_id" class="mb-1 block text-sm font-medium text-gray-700">Role</label>
						<select
							name="role_id"
							id="role_id"
							bind:value={selectedUser.role_id}
							class="w-full rounded-md border-gray-300 shadow-sm"
						>
							{#each data.roles as role (role.id)}
								<option value={role.id}>{role.name}</option>
							{/each}
						</select>
					</div>

					{#if form?.message && !form?.success}
						<div class="mt-4 rounded-md bg-red-50 p-4">
							<p class="text-sm text-red-600">{form.message}</p>
						</div>
					{/if}
				</div>

				<div class="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 p-4">
					<button
						type="button"
						on:click={closeModal}
						class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={isLoading}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:bg-blue-400 hover:bg-blue-700"
					>
						{#if isLoading} Saving... {:else} Save User {/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if userToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold text-gray-900">Confirm Deletion</h3>
			<p class="mt-2 text-sm text-gray-600">
				Are you sure you want to delete user "<strong>{userToDelete.full_name}</strong>"? This
				action cannot be undone.
			</p>
			<form
				method="POST"
				action="?/deleteUser"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						userToDelete = null; // Close modal on completion
					};
				}}
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="id" value={userToDelete.id} />
				<button
					type="button"
					on:click={() => (userToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
					>Cancel</button
				>
				<button
					type="submit"
					class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
					>Delete</button
				>
			</form>
		</div>
	</div>
{/if}