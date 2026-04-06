<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n';

	// --- Types ---
	type User = PageData['users'][0];
	type Department = PageData['departments'][0];
	type Position = PageData['positions'][0];
	type Role = PageData['roles'][0];

	// --- Props & State ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	// --- Filter State ---
	let inputSearchQuery = $state('');
	let inputDepartment = $state<number | 'all'>('all');
	let inputPosition = $state<number | 'all'>('all');

	let appliedSearchQuery = $state('');
	let appliedDepartment = $state<number | 'all'>('all');
	let appliedPosition = $state<number | 'all'>('all');

	function applyFilters() {
		appliedSearchQuery = inputSearchQuery;
		appliedDepartment = inputDepartment;
		appliedPosition = inputPosition;
		currentPage = 1; // กลับไปหน้าที่ 1 เสมอเมื่อค้นหาใหม่
	}

	function clearFilters() {
		inputSearchQuery = '';
		inputDepartment = 'all';
		inputPosition = 'all';
		applyFilters();
	}

	// กรองข้อมูลตาม Filter ที่ตั้งไว้
	let filteredUsers = $derived(
		data.users.filter((user: User) => {
			const searchLower = appliedSearchQuery.toLowerCase();
			const matchesSearch =
				appliedSearchQuery === '' ||
				user.full_name?.toLowerCase().includes(searchLower) ||
				user.email?.toLowerCase().includes(searchLower) ||
				user.username?.toLowerCase().includes(searchLower) ||
				user.emp_id?.toLowerCase().includes(searchLower);

			const matchesDept = appliedDepartment === 'all' || user.department_id === appliedDepartment;
			const matchesPos = appliedPosition === 'all' || user.position_id === appliedPosition;

			return matchesSearch && matchesDept && matchesPos;
		})
	);

	// --- Pagination State ---
	let currentPage = $state(1);
	let itemsPerPage = $state(10);
	const pageSizeOptions = [10, 50, 100, 500];

	// Derived Pagination Data (ใช้ filteredUsers แทน data.users)
	let totalItems = $derived(filteredUsers.length);
	let totalPages = $derived(Math.ceil(totalItems / itemsPerPage));
	let startItem = $derived(totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1);
	let endItem = $derived(Math.min(currentPage * itemsPerPage, totalItems));

	let paginatedUsers = $derived(
		filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
	);

	// Reset page if data changes or is out of bounds
	$effect(() => {
		if (currentPage > totalPages && totalPages > 0) {
			currentPage = totalPages;
		}
	});

	function goToPage(page: number) {
		if (page >= 1 && page <= totalPages) {
			currentPage = page;
		}
	}

	// User Modal State
	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedUser = $state<(Partial<User> & { password?: string }) | null>(null);
	let userToDelete = $state<User | null>(null);
	let isSavingUser = $state(false);

	// --- Department Modal State ---
	let isDepartmentModalOpen = $state(false);
	let departmentModalMode = $state<'add' | 'edit' | null>(null);
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
	let selectedPosition = $state<Partial<Position>>({
		id: undefined,
		name: ''
	} as Partial<Position>);

	let positionToDelete = $state<Position | null>(null);
	let isSavingPosition = $state(false);
	let positionFormMessage = $state<{ text: string; type: 'error' } | null>(null);

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
			selectedUser = {
				...user,
				password: '',
				role_id: user.role_id ?? undefined,
				department_id: user.department_id ?? undefined,
				position_id: user.position_id ?? undefined
			};
		} else {
			selectedUser = {
				id: undefined,
				role_id: data.roles?.[0]?.id,
				department_id: undefined,
				position_id: undefined,
				emp_id: '',
				full_name: '',
				username: '',
				email: '',
				password: ''
			} as Partial<User> & { password?: string };
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
				invalidateAll();
			} else if (result.type === 'failure') {
				await update({ reset: false });
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
			userToDelete = null;
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
			departmentToDelete = null;
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
			positionToDelete = null;
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
		if (!isDepartmentModalOpen) departmentFormMessage = null;
		if (!isPositionModalOpen) positionFormMessage = null;
	});
</script>

<svelte:head>
	<title>{$t('Users Management')}</title>
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
		<h1 class="text-2xl font-bold text-gray-800">{$t('Users Management')}</h1>
		<p class="mt-1 text-sm text-gray-500">{$t('Manage system users')}</p>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<button
			onclick={openDepartmentManager}
			class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold whitespace-nowrap text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:text-blue-600 focus:outline-none"
		>
			{$t('Manage Departments')}
		</button>

		<button
			onclick={openPositionManager}
			class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold whitespace-nowrap text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:text-blue-600 focus:outline-none"
		>
			{$t('Manage Positions')}
		</button>

		<button
			onclick={() => openUserModal('add')}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-sm transition-all hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
			</svg>
			{$t('Add New User')}
		</button>
	</div>
</div>

<!-- ส่วนตัวกรองข้อมูล (Filter Section) -->
<div
	class="mb-6 flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end"
>
	<!-- ค้นหาด้วยข้อความ -->
	<div class="flex-1">
		<label for="searchQuery" class="mb-1 block text-sm font-medium text-gray-700"
			>{$t('Search')}</label
		>
		<div class="relative">
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<svg
					class="h-4 w-4 text-gray-400"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/>
				</svg>
			</div>
			<input
				type="text"
				id="searchQuery"
				bind:value={inputSearchQuery}
				onkeydown={(e) => e.key === 'Enter' && applyFilters()}
				placeholder={$t('Search by Name, Email, Username, Emp ID...')}
				class="block w-full rounded-md border-gray-300 pl-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
			/>
		</div>
	</div>

	<!-- ตัวกรองแผนก -->
	<div class="w-full sm:w-48">
		<label for="filterDepartment" class="mb-1 block text-sm font-medium text-gray-700"
			>{$t('Department')}</label
		>
		<select
			id="filterDepartment"
			bind:value={inputDepartment}
			class="block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
		>
			<option value="all">{$t('All Departments')}</option>
			{#each data.departments as dept (dept.id)}
				<option value={dept.id}>{dept.name}</option>
			{/each}
		</select>
	</div>

	<!-- ตัวกรองตำแหน่ง -->
	<div class="w-full sm:w-48">
		<label for="filterPosition" class="mb-1 block text-sm font-medium text-gray-700"
			>{$t('Position')}</label
		>
		<select
			id="filterPosition"
			bind:value={inputPosition}
			class="block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
		>
			<option value="all">{$t('All Positions')}</option>
			{#each data.positions as pos (pos.id)}
				<option value={pos.id}>{pos.name}</option>
			{/each}
		</select>
	</div>

	<!-- ปุ่ม Actions -->
	<div class="mt-2 flex w-full gap-2 sm:mt-0 sm:w-auto">
		<button
			onclick={applyFilters}
			class="flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none sm:flex-none"
		>
			{$t('Search')}
		</button>
		<button
			onclick={clearFilters}
			class="flex flex-1 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none sm:flex-none"
		>
			{$t('Clear')}
		</button>
	</div>
</div>

<div class="flex flex-col gap-4">
	<div class="w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50">
					<tr>
						<th
							class="px-4 py-3 text-center font-semibold tracking-wider whitespace-nowrap text-gray-600"
							>{$t('Full Name')}</th
						>
						<th
							class="px-4 py-3 text-center font-semibold tracking-wider whitespace-nowrap text-gray-600"
							>{$t('Emp ID')}</th
						>
						<th
							class="px-4 py-3 text-center font-semibold tracking-wider whitespace-nowrap text-gray-600"
							>{$t('Email')}</th
						>
						<th
							class="px-4 py-3 text-center font-semibold tracking-wider whitespace-nowrap text-gray-600"
							>{$t('Username')}</th
						>
						<th
							class="px-4 py-3 text-center font-semibold tracking-wider whitespace-nowrap text-gray-600"
							>{$t('Department')}</th
						>
						<th
							class="px-4 py-3 text-center font-semibold tracking-wider whitespace-nowrap text-gray-600"
							>{$t('Position')}</th
						>
						<th
							class="px-4 py-3 text-center font-semibold tracking-wider whitespace-nowrap text-gray-600"
							>{$t('Role')}</th
						>
						<th
							class="px-4 py-3 text-center font-semibold tracking-wider whitespace-nowrap text-gray-600"
							>{$t('Actions')}</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#if paginatedUsers.length === 0}
						<tr>
							<td colspan="8" class="py-12 text-center text-gray-500">
								{appliedSearchQuery || appliedDepartment !== 'all' || appliedPosition !== 'all'
									? $t('No users found matching the filters.')
									: $t('No users found.')}
							</td>
						</tr>
					{:else}
						{#each paginatedUsers as user (user.id)}
							<tr class="transition-colors hover:bg-gray-50">
								<td class="px-4 py-3 text-center font-medium whitespace-nowrap text-gray-900"
									>{user.full_name}</td
								>
								<td class="px-4 py-3 text-center font-mono text-xs whitespace-nowrap text-gray-700"
									>{user.emp_id ?? '-'}</td
								>
								<td class="px-4 py-3 text-center whitespace-nowrap text-gray-600">{user.email}</td>
								<td class="px-4 py-3 text-center font-mono text-xs whitespace-nowrap text-gray-700"
									>{user.username}</td
								>
								<td class="px-4 py-3 text-center whitespace-nowrap text-gray-600"
									>{user.department_name ?? '-'}</td
								>
								<td class="px-4 py-3 text-center whitespace-nowrap text-gray-600"
									>{user.position_name ?? '-'}</td
								>
								<td class="px-4 py-3 text-center whitespace-nowrap">
									<span
										class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium {user.role ===
										'admin'
											? 'border-purple-200 bg-purple-50 text-purple-700'
											: 'border-gray-200 bg-gray-50 text-gray-700'}"
									>
										{user.role}
									</span>
								</td>
								<td class="px-4 py-3 text-center whitespace-nowrap">
									<div class="flex items-center justify-center gap-3">
										<button
											onclick={() => openUserModal('edit', user)}
											class="text-gray-400 transition-colors hover:text-blue-600"
											title={$t('Edit user')}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="20"
												height="20"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
												><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path
													d="m15 5 4 4"
												/></svg
											>
										</button>
										<button
											onclick={() => (userToDelete = user)}
											class="text-gray-400 transition-colors hover:text-red-600"
											title={$t('Delete user')}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="20"
												height="20"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
												><path d="M3 6h18" /><path
													d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
												/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg
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
	</div>

	<div
		class="flex flex-col items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row"
	>
		<div class="text-sm text-gray-600">
			{$t('Showing')} <span class="font-semibold text-gray-900">{startItem}</span>
			{$t('to')} <span class="font-semibold text-gray-900">{endItem}</span>
			{$t('of')} <span class="font-semibold text-gray-900">{totalItems}</span>
			{$t('entries')}
		</div>

		<div class="flex items-center gap-4">
			<div class="flex items-center gap-2">
				<label for="itemsPerPage" class="text-sm text-gray-600">{$t('Rows per page:')}</label>
				<select
					id="itemsPerPage"
					bind:value={itemsPerPage}
					onchange={() => (currentPage = 1)}
					class="rounded-md border-gray-300 py-1 pr-8 pl-2 text-sm focus:border-blue-500 focus:ring-blue-500"
				>
					{#each pageSizeOptions as size}
						<option value={size}>{size}</option>
					{/each}
				</select>
			</div>

			<div class="flex gap-1">
				<button
					onclick={() => goToPage(currentPage - 1)}
					disabled={currentPage === 1}
					class="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{$t('Previous')}
				</button>

				<div class="flex items-center px-2">
					<span class="text-sm text-gray-600"
						>{$t('Page')} {currentPage} {$t('of')} {totalPages || 1}</span
					>
				</div>

				<button
					onclick={() => goToPage(currentPage + 1)}
					disabled={currentPage === totalPages || totalPages === 0}
					class="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{$t('Next')}
				</button>
			</div>
		</div>
	</div>
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
					{modalMode === 'add' ? $t('Add New User') : $t('Edit User')}
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
								>{$t('Full Name')}</label
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
								>{$t('Emp ID')}</label
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
								>{$t('Username')}</label
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
							<label for="email" class="mb-1 block text-sm font-medium text-gray-700"
								>{$t('Email')}</label
							>
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
							>{$t('Password')}</label
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
							<p class="mt-1 text-xs text-gray-500">
								{$t('Leave blank to keep the current password.')}
							</p>
						{/if}
					</div>

					<div>
						<label for="profile_image" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Profile Image')}</label
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
								>{$t('Department')}</label
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
								>{$t('Position')}</label
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
						<label for="role_id" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Role')}</label
						>
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
						{$t('Cancel')}
					</button>
					<button
						type="submit"
						disabled={isSavingUser}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-400"
					>
						{#if isSavingUser}
							{$t('Saving...')}
						{:else}
							{$t('Save User')}
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
			<h3 class="text-lg font-bold text-gray-900">{$t('Confirm Deletion')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				{$t('Are you sure you want to delete user')} "<strong>{userToDelete.full_name}</strong>"?
				{$t('This action cannot be undone.')}
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
					>{$t('Cancel')}</button
				>
				<button
					type="submit"
					class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
					>{$t('Delete')}</button
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
				<h2 class="text-lg font-bold">{$t('Manage Departments')}</h2>
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
							<label for="dept_name" class="block text-sm font-medium">{$t('Name *')}</label>
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
								class="rounded-md border bg-white px-3 py-1 text-sm">{$t('Cancel')}</button
							>
							<button
								type="submit"
								disabled={isSavingDepartment}
								class="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:bg-blue-400"
							>
								{#if isSavingDepartment}
									{$t('Saving...')}
								{:else}
									{$t('Save')}
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
						>{$t('Add Department')}</button
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
									>{$t('Edit')}</button
								>
								<button
									onclick={() => (departmentToDelete = dept)}
									class="rounded-md px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
									>{$t('Delete')}</button
								>
							</div>
						</li>
					{:else}
						<li class="text-center text-gray-500 py-4">{$t('No departments found.')}</li>
					{/each}
				</ul>
			</div>

			<div class="flex flex-shrink-0 justify-end border-t bg-gray-50 p-4">
				<button
					type="button"
					onclick={closeDepartmentManager}
					class="rounded-md border bg-white px-4 py-2 text-sm">{$t('Close')}</button
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
				<h2 class="text-lg font-bold">{$t('Manage Positions')}</h2>
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
							<label for="pos_name" class="block text-sm font-medium">{$t('Name *')}</label>
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
								class="rounded-md border bg-white px-3 py-1 text-sm">{$t('Cancel')}</button
							>
							<button
								type="submit"
								disabled={isSavingPosition}
								class="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:bg-blue-400"
							>
								{#if isSavingPosition}
									{$t('Saving...')}
								{:else}
									{$t('Save')}
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
						>{$t('Add Position')}</button
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
									>{$t('Edit')}</button
								>
								<button
									onclick={() => (positionToDelete = pos)}
									class="rounded-md px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
									>{$t('Delete')}</button
								>
							</div>
						</li>
					{:else}
						<li class="text-center text-gray-500 py-4">{$t('No positions found.')}</li>
					{/each}
				</ul>
			</div>

			<div class="flex flex-shrink-0 justify-end border-t bg-gray-50 p-4">
				<button
					type="button"
					onclick={closePositionManager}
					class="rounded-md border bg-white px-4 py-2 text-sm">{$t('Close')}</button
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
			<h3 class="text-lg font-bold">{$t('Confirm Deletion')}</h3>
			<p class="mt-2 text-sm">
				{$t('Delete department')} "<strong>{departmentToDelete.name}</strong>"? {$t(
					'This action cannot be undone.'
				)}
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
					class="rounded-md border bg-white px-4 py-2 text-sm">{$t('Cancel')}</button
				>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white"
					>{$t('Delete')}</button
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
			<h3 class="text-lg font-bold">{$t('Confirm Deletion')}</h3>
			<p class="mt-2 text-sm">
				{$t('Delete position')} "<strong>{positionToDelete.name}</strong>"? {$t(
					'This action cannot be undone.'
				)}
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
					class="rounded-md border bg-white px-4 py-2 text-sm">{$t('Cancel')}</button
				>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white"
					>{$t('Delete')}</button
				>
			</form>
		</div>
	</div>
{/if}
