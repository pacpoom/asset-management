<script lang="ts">
	import { enhance } from '$app/forms';
	// ✅ 1. FIX: Import ActionResult from @sveltejs/kit
	import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation'; // For refreshing data

	// --- Types ---
	type User = PageData['users'][0];
	type Department = PageData['departments'][0];
	type Position = PageData['positions'][0];
	type Role = PageData['roles'][0];

	// --- Props & State ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	// User Modal State
	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedUser = $state<(Partial<User> & { password?: string }) | null>(null);
	let userToDelete = $state<User | null>(null);
	let isSavingUser = $state(false);

	// --- Department Modal State ---
	let isDepartmentModalOpen = $state(false);
	let departmentModalMode = $state<'add' | 'edit' | null>(null);
	// ✅ 2. FIX: Initialize state correctly for Partial<T>
	let selectedDepartment = $state<Partial<Department>>({
		id: undefined,
		name: ''
	} as Partial<Department>);
	let departmentToDelete = $state<Department | null>(null);
	let isSavingDepartment = $state(false);
	let departmentFormMessage = $state<{ text: string; type: 'error' } | null>(null);

	// --- Position Modal State ---
	let isPositionModalOpen = $state(false);
	let positionModalMode = $state<'add' | 'edit' | null>(null);
	// ✅ 2. FIX: Initialize state correctly for Partial<T>
	let selectedPosition = $state<Partial<Position>>({
		id: undefined,
		name: ''
	} as Partial<Position>);
	let positionToDelete = $state<Position | null>(null);
	let isSavingPosition = $state(false);
	let positionFormMessage = $state<{ text: string; type: 'error' } | null>(null);

	// Global Message State
	let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(
		null
	);
	let messageTimeout: NodeJS.Timeout;

	// --- Functions ---

	// User Modal Functions
	function openUserModal(mode: 'add' | 'edit', user: User | null = null) {
		modalMode = mode;
		globalMessage = null;
		if (mode === 'edit' && user) {
			// Ensure IDs are numbers/undefined
			selectedUser = {
				...user,
				password: '', // Don't pre-fill password
				role_id: user.role_id ?? undefined,
				department_id: user.department_id ?? undefined,
				position_id: user.position_id ?? undefined
			};
		} else {
			// ✅ 3. FIX: Correct default object structure for Partial<User>
			selectedUser = {
				id: undefined, // Explicitly undefined for 'add'
				role_id: data.roles?.[0]?.id, // Default role
				department_id: undefined,
				position_id: undefined,
				emp_id: '',
				full_name: '',
				username: '',
				email: '',
				password: '' // Initialize password field
			} as Partial<User> & { password?: string }; // <--- เพิ่มตรงนี้
		}
	}
	function closeUserModal() {
		modalMode = null;
		selectedUser = null;
	}

	// Department Modal Functions
	function openDepartmentManager() {
		isDepartmentModalOpen = true;
		closeDepartmentForm();
	}
	function closeDepartmentManager() {
		isDepartmentModalOpen = false;
		departmentToDelete = null;
	}
	function openDepartmentForm(mode: 'add' | 'edit', dept: Department | null = null) {
		departmentModalMode = mode;
		departmentFormMessage = null;
		selectedDepartment =
			mode === 'edit' && dept ? { ...dept } : ({ name: '' } as Partial<Department>);
	}
	function closeDepartmentForm() {
		departmentModalMode = null;
		departmentFormMessage = null;
	}

	// Position Modal Functions
	function openPositionManager() {
		isPositionModalOpen = true;
		closePositionForm();
	}
	function closePositionManager() {
		isPositionModalOpen = false;
		positionToDelete = null;
	}
	function openPositionForm(mode: 'add' | 'edit', pos: Position | null = null) {
		positionModalMode = mode;
		positionFormMessage = null;
		selectedPosition = mode === 'edit' && pos ? { ...pos } : ({ name: '' } as Partial<Position>);
	}
	function closePositionForm() {
		positionModalMode = null;
		positionFormMessage = null;
	}

	// Global Message Function
	function showGlobalMessage(
		message: { success: boolean; text: string; type: 'success' | 'error' },
		duration: number = 5000
	) {
		clearTimeout(messageTimeout);
		globalMessage = message;
		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, duration);
	}

	// --- Enhance Handlers ---

	// User Form Enhance
	const handleSaveUser: SubmitFunction = () => {
		isSavingUser = true;
		return async ({
			result,
			update
		}: {
			result: ActionResult;
			update: (options?: { reset: boolean }) => Promise<void>;
		}) => {
			isSavingUser = false;
			if (result.type === 'success' && result.data?.success) {
				closeUserModal();
				showGlobalMessage({ success: true, text: result.data.message as string, type: 'success' });
				invalidateAll(); // Refresh all data
			} else if (result.type === 'failure') {
				// Form prop updates automatically for errors
				await update({ reset: false }); // Prevent form reset
			}
		};
	};

	const handleDeleteUser: SubmitFunction = () => {
		return async ({
			result,
			update
		}: {
			result: ActionResult;
			update: (options?: { reset: boolean }) => Promise<void>;
		}) => {
			userToDelete = null; // Close confirmation modal
			if (result.type === 'success') {
				// Redirects handled by SvelteKit
			} else if (result.type === 'failure') {
				showGlobalMessage({
					success: false,
					text: (result.data?.message as string) ?? 'Delete failed',
					type: 'error'
				});
				await update();
			}
		};
	};

	// Department Enhance Handlers
	const handleSaveDepartment: SubmitFunction = () => {
		isSavingDepartment = true;
		departmentFormMessage = null;
		return async ({
			result,
			update
		}: {
			result: ActionResult;
			update: (options?: { reset: boolean }) => Promise<void>;
		}) => {
			isSavingDepartment = false;
			if (result.type === 'success' && result.data?.success) {
				closeDepartmentForm();
				showGlobalMessage({ success: true, text: result.data.message as string, type: 'success' });
				invalidateAll();
			} else if (result.type === 'failure') {
				departmentFormMessage = {
					text: (result.data?.message as string) ?? 'Save failed',
					type: 'error'
				};
				await update({ reset: false });
			}
		};
	};

	const handleDeleteDepartment: SubmitFunction = () => {
		return async ({
			result,
			update
		}: {
			result: ActionResult;
			update: (options?: { reset: boolean }) => Promise<void>;
		}) => {
			departmentToDelete = null; // Close confirmation
			if (result.type === 'success' && result.data?.success) {
				showGlobalMessage({ success: true, text: result.data.message as string, type: 'success' });
				invalidateAll();
			} else if (result.type === 'failure') {
				showGlobalMessage({
					success: false,
					text: (result.data?.message as string) ?? 'Delete failed',
					type: 'error'
				});
				await update();
			}
		};
	};

	// Position Enhance Handlers
	const handleSavePosition: SubmitFunction = () => {
		isSavingPosition = true;
		positionFormMessage = null;
		return async ({
			result,
			update
		}: {
			result: ActionResult;
			update: (options?: { reset: boolean }) => Promise<void>;
		}) => {
			isSavingPosition = false;
			if (result.type === 'success' && result.data?.success) {
				closePositionForm();
				showGlobalMessage({ success: true, text: result.data.message as string, type: 'success' });
				invalidateAll();
			} else if (result.type === 'failure') {
				positionFormMessage = {
					text: (result.data?.message as string) ?? 'Save failed',
					type: 'error'
				};
				await update({ reset: false });
			}
		};
	};

	const handleDeletePosition: SubmitFunction = () => {
		return async ({
			result,
			update
		}: {
			result: ActionResult;
			update: (options?: { reset: boolean }) => Promise<void>;
		}) => {
			positionToDelete = null; // Close confirmation
			if (result.type === 'success' && result.data?.success) {
				showGlobalMessage({ success: true, text: result.data.message as string, type: 'success' });
				invalidateAll();
			} else if (result.type === 'failure') {
				showGlobalMessage({
					success: false,
					text: (result.data?.message as string) ?? 'Delete failed',
					type: 'error'
				});
				await update();
			}
		};
	};

	// --- Reactive Effects ---
	$effect.pre(() => {
		// Clear specific form errors when modals close
		if (!isDepartmentModalOpen) departmentFormMessage = null;
		if (!isPositionModalOpen) positionFormMessage = null;

		// Handle generic form prop changes for User modal specifically
		if (form && !form.success && (form.action === 'addUser' || form.action === 'editUser')) {
			// Error message should display within the user modal via the 'form' prop directly
		}

		// ✅ 4. FIX: ลบบรรทัดนี้ออก - Cannot assign to constant 'form'
		// Reset form prop after handling (IMPORTANT to prevent re-triggering)
		// if (form) {
		//    (form as ActionData) = undefined;
		// }
	});
</script>

<svelte:head>
	<title>Users Management</title>
</svelte:head>

{#if globalMessage}
	<div
		transition:fade
		class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 text-sm font-semibold shadow-xl {globalMessage.type ===
		'success'
			? 'bg-green-100 text-green-800'
			: 'bg-red-100 text-red-800'}"
	>
		{globalMessage.text}
	</div>
{/if}

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">Users Management</h1>
		<p class="mt-1 text-sm text-gray-500"></p>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<button
			onclick={openDepartmentManager}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
		>
			Manage Departments
		</button>
		<button
			onclick={openPositionManager}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
		>
			Manage Positions
		</button>
		<button
			onclick={() => openUserModal('add')}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
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
			Add New User
		</button>
	</div>
</div>

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
						<td class="px-4 py-3 font-medium whitespace-nowrap text-gray-900">{user.full_name}</td>
						<td class="px-4 py-3 font-mono text-xs whitespace-nowrap text-gray-700">
							{user.emp_id ?? 'N/A'}
						</td>
						<td class="px-4 py-3 whitespace-nowrap text-gray-600">{user.email}</td>
						<td class="px-4 py-3 font-mono text-xs whitespace-nowrap text-gray-700">
							{user.username}
						</td>
						<td class="px-4 py-3 whitespace-nowrap text-gray-600">
							{user.department_name ?? 'N/A'}
						</td>
						<td class="px-4 py-3 whitespace-nowrap text-gray-600">
							{user.position_name ?? 'N/A'}
						</td>
						<td class="px-4 py-3 whitespace-nowrap">
							<span
								class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {user.role ===
								'admin'
									? 'bg-purple-100 text-purple-800'
									: 'bg-gray-100 text-gray-800'}"
							>
								{user.role}
							</span>
						</td>
						<td class="px-4 py-3 whitespace-nowrap">
							<div class="flex items-center gap-2">
								<button
									onclick={() => openUserModal('edit', user)}
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
									onclick={() => (userToDelete = user)}
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

{#if modalMode && selectedUser}
	<div
		transition:slide={{ duration: 150 }}
		class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
	>
		<div
			class="fixed inset-0"
			onclick={closeUserModal}
			role="button"
			tabindex="-1"
			aria-label="Close modal"
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && closeUserModal()}
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
				use:enhance={handleSaveUser}
				enctype="multipart/form-data"
			>
				<div class="max-h-[70vh] space-y-6 overflow-y-auto p-6">
					{#if modalMode === 'edit'}
						<input type="hidden" name="id" value={selectedUser.id} />
					{/if}

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
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

					<div>
						<label for="profile_image" class="mb-1 block text-sm font-medium text-gray-700"
							>Profile Image</label
						>
						<input
							type="file"
							name="profile_image"
							id="profile_image"
							accept="image/png, image/jpeg, image/webp"
							class="w-full rounded-md border-gray-300 shadow-sm file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
						/>
					</div>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
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

					<div>
						<label for="role_id" class="mb-1 block text-sm font-medium text-gray-700">Role</label>
						<select
							name="role_id"
							id="role_id"
							bind:value={selectedUser.role_id}
							required
							class="w-full rounded-md border-gray-300 shadow-sm"
						>
							{#each data.roles as role (role.id)}
								<option value={role.id}>{role.name}</option>
							{/each}
						</select>
					</div>

					{#if form?.action === (modalMode === 'add' ? 'addUser' : 'editUser') && form?.success === false && form?.message}
						<div class="mt-4 rounded-md bg-red-50 p-4">
							<p class="text-sm text-red-600">{form.message}</p>
						</div>
					{/if}
				</div>

				<div class="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 p-4">
					<button
						type="button"
						onclick={closeUserModal}
						class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={isSavingUser}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-400"
					>
						{#if isSavingUser}
							Saving...
						{:else}
							Save User
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if userToDelete}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold text-gray-900">Confirm Deletion</h3>
			<p class="mt-2 text-sm text-gray-600">
				Are you sure you want to delete user "<strong>{userToDelete.full_name}</strong>"? This
				action cannot be undone.
			</p>
			<form
				method="POST"
				action="?/deleteUser"
				use:enhance={handleDeleteUser}
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="id" value={userToDelete.id} />
				<button
					type="button"
					onclick={() => (userToDelete = null)}
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

{#if isDepartmentModalOpen}
	<div
		transition:fade
		class="fixed inset-0 z-60 flex items-start justify-center bg-black/50 p-4 pt-16"
	>
		<div class="fixed inset-0" onclick={closeDepartmentManager} role="presentation"></div>
		<div
			class="relative flex max-h-[80vh] w-full max-w-xl transform flex-col rounded-xl bg-white shadow-2xl transition-all"
		>
			<div class="flex flex-shrink-0 items-center justify-between border-b p-4">
				<h2 class="text-lg font-bold">Manage Departments</h2>
				<button onclick={closeDepartmentManager} class="text-gray-400 hover:text-gray-600"
					>&times;</button
				>
			</div>

			{#if departmentModalMode}
				<form
					method="POST"
					action="?/saveDepartment"
					use:enhance={handleSaveDepartment}
					transition:slide={{ duration: 150 }}
				>
					<div class="space-y-3 border-b p-4">
						{#if departmentModalMode === 'edit'}
							<input type="hidden" name="id" value={selectedDepartment?.id} />
						{/if}
						<div>
							<label for="dept_name" class="block text-sm font-medium">Name *</label>
							<input
								type="text"
								id="dept_name"
								name="name"
								bind:value={selectedDepartment.name}
								required
								class="w-full rounded-md border-gray-300"
							/>
						</div>
						{#if departmentFormMessage}
							<p class="text-sm text-red-600">{departmentFormMessage.text}</p>
						{/if}
						<div class="flex justify-end gap-2">
							<button
								type="button"
								onclick={closeDepartmentForm}
								class="rounded-md border bg-white px-3 py-1 text-sm">Cancel</button
							>
							<button
								type="submit"
								disabled={isSavingDepartment}
								class="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:bg-blue-400"
							>
								{#if isSavingDepartment}
									Saving...
								{:else}
									Save
								{/if}
							</button>
						</div>
					</div>
				</form>
			{:else}
				<div class="flex justify-end border-b p-4">
					<button
						onclick={() => openDepartmentForm('add')}
						class="rounded-md bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
						>Add Department</button
					>
				</div>
			{/if}

			<div class="flex-1 overflow-y-auto p-4">
				<ul class="space-y-1">
					{#each data.departments as dept (dept.id)}
						<li class="flex items-center justify-between rounded-lg p-3 hover:bg-gray-50">
							<span class="font-medium text-gray-800">{dept.name}</span>
							<div class="flex gap-2">
								<button
									onclick={() => openDepartmentForm('edit', dept)}
									class="rounded-md px-2.5 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
									>Edit</button
								>
								<button
									onclick={() => (departmentToDelete = dept)}
									class="rounded-md px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
									>Delete</button
								>
							</div>
						</li>
					{:else}
						<li class="text-center text-gray-500 py-4">No departments found.</li>
					{/each}
				</ul>
			</div>

			<div class="flex flex-shrink-0 justify-end border-t bg-gray-50 p-4">
				<button
					type="button"
					onclick={closeDepartmentManager}
					class="rounded-md border bg-white px-4 py-2 text-sm">Close</button
				>
			</div>
		</div>
	</div>
{/if}

{#if isPositionModalOpen}
	<div
		transition:fade
		class="fixed inset-0 z-60 flex items-start justify-center bg-black/50 p-4 pt-16"
	>
		<div class="fixed inset-0" onclick={closePositionManager} role="presentation"></div>
		<div
			class="relative flex max-h-[80vh] w-full max-w-xl transform flex-col rounded-xl bg-white shadow-2xl transition-all"
		>
			<div class="flex flex-shrink-0 items-center justify-between border-b p-4">
				<h2 class="text-lg font-bold">Manage Positions</h2>
				<button onclick={closePositionManager} class="text-gray-400 hover:text-gray-600"
					>&times;</button
				>
			</div>

			{#if positionModalMode}
				<form
					method="POST"
					action="?/savePosition"
					use:enhance={handleSavePosition}
					transition:slide={{ duration: 150 }}
				>
					<div class="space-y-3 border-b p-4">
						{#if positionModalMode === 'edit'}
							<input type="hidden" name="id" value={selectedPosition?.id} />
						{/if}
						<div>
							<label for="pos_name" class="block text-sm font-medium">Name *</label>
							<input
								type="text"
								id="pos_name"
								name="name"
								bind:value={selectedPosition.name}
								required
								class="w-full rounded-md border-gray-300"
							/>
						</div>
						{#if positionFormMessage}
							<p class="text-sm text-red-600">{positionFormMessage.text}</p>
						{/if}
						<div class="flex justify-end gap-2">
							<button
								type="button"
								onclick={closePositionForm}
								class="rounded-md border bg-white px-3 py-1 text-sm">Cancel</button
							>
							<button
								type="submit"
								disabled={isSavingPosition}
								class="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:bg-blue-400"
							>
								{#if isSavingPosition}
									Saving...
								{:else}
									Save
								{/if}
							</button>
						</div>
					</div>
				</form>
			{:else}
				<div class="flex justify-end border-b p-4">
					<button
						onclick={() => openPositionForm('add')}
						class="rounded-md bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
						>Add Position</button
					>
				</div>
			{/if}

			<div class="flex-1 overflow-y-auto p-4">
				<ul class="space-y-1">
					{#each data.positions as pos (pos.id)}
						<li class="flex items-center justify-between rounded-lg p-3 hover:bg-gray-50">
							<span class="font-medium text-gray-800">{pos.name}</span>
							<div class="flex gap-2">
								<button
									onclick={() => openPositionForm('edit', pos)}
									class="rounded-md px-2.5 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
									>Edit</button
								>
								<button
									onclick={() => (positionToDelete = pos)}
									class="rounded-md px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
									>Delete</button
								>
							</div>
						</li>
					{:else}
						<li class="text-center text-gray-500 py-4">No positions found.</li>
					{/each}
				</ul>
			</div>

			<div class="flex flex-shrink-0 justify-end border-t bg-gray-50 p-4">
				<button
					type="button"
					onclick={closePositionManager}
					class="rounded-md border bg-white px-4 py-2 text-sm">Close</button
				>
			</div>
		</div>
	</div>
{/if}

{#if departmentToDelete}
	<div
		class="fixed inset-0 z-70 flex items-center justify-center bg-black/60 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">Confirm Deletion</h3>
			<p class="mt-2 text-sm">
				Delete department "<strong>{departmentToDelete.name}</strong>"? This cannot be undone.
			</p>
			<form
				method="POST"
				action="?/deleteDepartment"
				use:enhance={handleDeleteDepartment}
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="id" value={departmentToDelete.id} />
				<button
					type="button"
					onclick={() => (departmentToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm">Cancel</button
				>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white"
					>Delete</button
				>
			</form>
		</div>
	</div>
{/if}

{#if positionToDelete}
	<div
		class="fixed inset-0 z-70 flex items-center justify-center bg-black/60 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">Confirm Deletion</h3>
			<p class="mt-2 text-sm">
				Delete position "<strong>{positionToDelete.name}</strong>"? This cannot be undone.
			</p>
			<form
				method="POST"
				action="?/deletePosition"
				use:enhance={handleDeletePosition}
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="id" value={positionToDelete.id} />
				<button
					type="button"
					onclick={() => (positionToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm">Cancel</button
				>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white"
					>Delete</button
				>
			</form>
		</div>
	</div>
{/if}
