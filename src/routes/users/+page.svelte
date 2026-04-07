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
	type IsoSection = PageData['isoSections'][0];
	type UserTxLog = NonNullable<PageData['userTransactionLogs']>[number];

	// --- Props & State ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	// --- Pagination & Filter State ---
	let currentPage = $state(1);
	let itemsPerPage = $state(10);
	let searchTerm = $state('');
	let departmentFilter = $state('all');
	let positionFilter = $state('all');
	let roleFilter = $state('all');
	const pageSizeOptions = [10, 50, 100, 500];

	function userHasRoleId(u: User, roleIdStr: string): boolean {
		const rid = Number(roleIdStr);
		if (!Number.isInteger(rid) || rid <= 0) return false;
		if (u.role_id != null && Number(u.role_id) === rid) return true;
		const csv = u.role_ids_csv?.trim();
		if (!csv) return false;
		return csv
			.split(',')
			.map((s) => Number(String(s).trim()))
			.some((n) => Number.isInteger(n) && n > 0 && n === rid);
	}

	function profileSortTimestamp(u: User): number {
		const raw = u.updated_at ?? u.created_at;
		const t = new Date(String(raw ?? '')).getTime();
		return Number.isNaN(t) ? 0 : t;
	}

	let filteredUsers = $derived.by(() => {
		const keyword = searchTerm.trim().toLowerCase();

		const list = data.users.filter((u: User) => {
			const matchesKeyword =
				keyword.length === 0 ||
				[u.full_name, u.email, u.username, u.emp_id]
					.filter(Boolean)
					.some((value) => String(value).toLowerCase().includes(keyword));

			const matchesDepartment =
				departmentFilter === 'all' || String(u.department_id ?? '') === departmentFilter;

			const matchesPosition =
				positionFilter === 'all' || String(u.position_id ?? '') === positionFilter;

			const matchesRole = roleFilter === 'all' || userHasRoleId(u, roleFilter);

			return matchesKeyword && matchesDepartment && matchesPosition && matchesRole;
		});

		return [...list].sort((a, b) => profileSortTimestamp(b) - profileSortTimestamp(a));
	});

	// Derived Pagination Data
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

	function runSearch() {
		currentPage = 1;
	}

	function clearFilters() {
		searchTerm = '';
		departmentFilter = 'all';
		positionFilter = 'all';
		roleFilter = 'all';
		currentPage = 1;
	}

	function formatDateTimeCell(iso: string | null | undefined): string {
		if (iso == null || iso === '') return '—';
		const d = new Date(String(iso));
		if (Number.isNaN(d.getTime())) return '—';
		return d.toLocaleString('th-TH', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatPasswordLastChanged(at: unknown): string | null {
		if (at == null || at === '') return null;
		const d = new Date(at as string);
		if (Number.isNaN(d.getTime())) return null;
		const days = Math.floor((Date.now() - d.getTime()) / 86400000);
		const when = d.toLocaleString('th-TH', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
		return `${when} · ${days} day(s) since last password set`;
	}

	function escapeCsvCell(s: string): string {
		const x = String(s).replace(/"/g, '""');
		return /[",\n\r]/.test(x) ? `"${x}"` : x;
	}

	function downloadAuditReportCsv() {
		const logs = data.userTransactionLogs ?? [];
		const headers = ['Date/Time', 'User', 'Employee ID', 'Changed By', 'Transaction'];
		const rows = logs.map((log: UserTxLog) => {
			const dt = new Date(String(log.created_at ?? '')).toLocaleString('th-TH', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
			return [
				escapeCsvCell(dt),
				escapeCsvCell(String(log.user_name ?? '')),
				escapeCsvCell(log.emp_id != null ? String(log.emp_id) : ''),
				escapeCsvCell(String(log.changed_by_name ?? '')),
				escapeCsvCell(String(log.transaction ?? ''))
			].join(',');
		});
		const body = [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
		const blob = new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		const d = new Date();
		a.download = `user-activity-audit-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// User Modal State
	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedUser = $state<(Partial<User> & { password?: string }) | null>(null);
	let selectedRoleIds = $state<string[]>([]);
	let showPasswordPlain = $state(false);
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

	// --- Iso Section Modal State ---
	let isIsoSectionModalOpen = $state(false);
	let isoSectionModalMode = $state<'add' | 'edit' | null>(null);
	let selectedIsoSection = $state<Partial<IsoSection>>({
		id: undefined,
		code: '',
		name_th: '',
		name_en: ''
	} as Partial<IsoSection>);
	let isoSectionToDelete = $state<IsoSection | null>(null);
	let isSavingIsoSection = $state(false);
	let isoSectionFormMessage = $state<{ text: string; type: 'error' } | null>(null);

	let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(
		null
	);
	let messageTimeout: NodeJS.Timeout;

	// --- Functions ---

	// User Modal Functions
	function toggleRoleMembership(roleId: string, checked: boolean) {
		if (checked) {
			if (!selectedRoleIds.includes(roleId)) selectedRoleIds = [...selectedRoleIds, roleId];
		} else {
			selectedRoleIds = selectedRoleIds.filter((id) => id !== roleId);
		}
	}

	function openUserModal(mode: 'add' | 'edit', user: User | null = null) {
		modalMode = mode;
		showPasswordPlain = false;
		globalMessage = null;
		if (mode === 'edit' && user) {
			const initialRoleIds = user.role_ids_csv
				? user.role_ids_csv
						.split(',')
						.map((id) => id.trim())
						.filter(Boolean)
				: user.role_id
					? [String(user.role_id)]
					: [];
			selectedRoleIds = initialRoleIds;
			selectedUser = {
				...user,
				password: '',
				role_id: user.role_id ?? undefined,
				department_id: user.department_id ?? undefined,
				position_id: user.position_id ?? undefined,
				line_user_id: user.line_user_id ?? ''
			};
		} else {
			selectedRoleIds = data.roles?.[0]?.id ? [String(data.roles[0].id)] : [];
			selectedUser = {
				id: undefined,
				role_id: data.roles?.[0]?.id,
				department_id: undefined,
				position_id: undefined,
				iso_section: '',
				line_user_id: '',
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
		selectedRoleIds = [];
		showPasswordPlain = false;
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

	// Iso Section Modal Functions
	function openIsoSectionManager() {
		isIsoSectionModalOpen = true;
		closeIsoSectionForm();
	}
	function closeIsoSectionManager() {
		isIsoSectionModalOpen = false;
		isoSectionToDelete = null;
	}
	function openIsoSectionForm(mode: 'add' | 'edit', section: IsoSection | null = null) {
		isoSectionModalMode = mode;
		isoSectionFormMessage = null;
		selectedIsoSection =
			mode === 'edit' && section
				? { ...section }
				: ({ code: '', name_th: '', name_en: '' } as Partial<IsoSection>);
	}
	function closeIsoSectionForm() {
		isoSectionModalMode = null;
		isoSectionFormMessage = null;
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

	const handleQuickChangeUserRole: SubmitFunction = () => {
		return async ({
			result,
			update
		}: {
			result: ActionResult;
			update: (options?: { reset: boolean }) => Promise<void>;
		}) => {
			if (result.type === 'success' && result.data?.success) {
				showGlobalMessage({ success: true, text: result.data.message as string, type: 'success' });
				invalidateAll();
			} else if (result.type === 'failure') {
				showGlobalMessage({
					success: false,
					text: (result.data?.message as string) ?? 'Quick role change failed',
					type: 'error'
				});
				await update();
			}
		};
	};

	const handleAssignIsoDocsRole: SubmitFunction = () => {
		return async ({
			result,
			update
		}: {
			result: ActionResult;
			update: (options?: { reset: boolean }) => Promise<void>;
		}) => {
			if (result.type === 'success' && result.data?.success) {
				showGlobalMessage({ success: true, text: result.data.message as string, type: 'success' });
				invalidateAll();
			} else if (result.type === 'failure') {
				showGlobalMessage({
					success: false,
					text: (result.data?.message as string) ?? 'Assign role failed',
					type: 'error'
				});
				await update();
			}
		};
	};

	const handleDeleteUser: SubmitFunction = () => {
		return async ({
			result,
			update
		}: {
			result: ActionResult;
			update: (options?: { reset: boolean; invalidateAll?: boolean }) => Promise<void>;
		}) => {
			if (result.type === 'success') {
				userToDelete = null;
				const msg =
					result.data &&
					typeof result.data === 'object' &&
					'message' in result.data &&
					result.data.message != null
						? String(result.data.message)
						: 'User deleted.';
				showGlobalMessage({ success: true, text: msg, type: 'success' });
				// Custom callback replaces Kit's default: must call update() so invalidateAll + applyAction run
				await update();
			} else if (result.type === 'failure') {
				userToDelete = null;
				showGlobalMessage({
					success: false,
					text: (result.data?.message as string) ?? 'Delete failed',
					type: 'error'
				});
				await update({ reset: false });
			} else if (result.type === 'error') {
				userToDelete = null;
				showGlobalMessage({
					success: false,
					text: 'Delete failed (network or server error).',
					type: 'error'
				});
				await update({ reset: false, invalidateAll: false });
			} else {
				userToDelete = null;
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

	// Iso Section Enhance Handlers
	const handleSaveIsoSection: SubmitFunction = () => {
		isSavingIsoSection = true;
		isoSectionFormMessage = null;
		return async ({
			result,
			update
		}: {
			result: ActionResult;
			update: (options?: { reset: boolean }) => Promise<void>;
		}) => {
			isSavingIsoSection = false;
			if (result.type === 'success' && result.data?.success) {
				closeIsoSectionForm();
				showGlobalMessage({ success: true, text: result.data.message as string, type: 'success' });
				invalidateAll();
			} else if (result.type === 'failure') {
				isoSectionFormMessage = {
					text: (result.data?.message as string) ?? 'Save failed',
					type: 'error'
				};
				await update({ reset: false });
			}
		};
	};

	const handleDeleteIsoSection: SubmitFunction = () => {
		return async ({
			result,
			update
		}: {
			result: ActionResult;
			update: (options?: { reset: boolean }) => Promise<void>;
		}) => {
			isoSectionToDelete = null;
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
		if (!isIsoSectionModalOpen) isoSectionFormMessage = null;
	});
</script>

<svelte:head>
	<title>{$t('Users Management')}</title>
</svelte:head>

{#if globalMessage}
	<!-- Desktop: ชิดขวาแต่เว้นระยะใหญ่พอให้อยู่ซ้ายของคลัสเตอร์ภาษา/โปรไฟล์ — ไม่บังปุ่ม header -->
	<!-- Mobile: ใต้แถบ header จัดกึ่งกลาง -->
	<div
		transition:fade
		class="pointer-events-none fixed inset-x-3 top-[4.5rem] z-[70] flex justify-center sm:inset-x-4 lg:inset-x-0 lg:top-0 lg:h-16 lg:items-center lg:justify-end lg:px-4 lg:pr-[clamp(15rem,32vw,34rem)]"
		role="status"
	>
		<div
			class="pointer-events-auto max-w-[min(20rem,calc(100vw-2rem))] rounded-lg px-3 py-2 text-center text-xs leading-snug font-semibold break-words shadow-lg sm:max-w-[min(22rem,calc(100vw-18rem))] sm:text-sm lg:max-w-sm lg:text-left lg:leading-tight {globalMessage.type ===
			'success'
				? 'bg-green-100 text-green-800 ring-1 ring-green-200/80'
				: 'bg-red-100 text-red-800 ring-1 ring-red-200/80'}"
		>
			{globalMessage.text}
		</div>
	</div>
{/if}

<div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
	<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold text-gray-800">{$t('Users Management')}</h2>
			<p class="mt-1 text-sm text-gray-500">{$t('Manage system users')}</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<button
				onclick={openIsoSectionManager}
				class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 hover:text-blue-600"
			>
				Manage Iso_Section
			</button>
			<button
				onclick={openDepartmentManager}
				class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 hover:text-blue-600"
			>
				{$t('Manage Departments')}
			</button>
			<button
				onclick={openPositionManager}
				class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 hover:text-blue-600"
			>
				{$t('Manage Positions')}
			</button>
			<button
				onclick={() => openUserModal('add')}
				class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
				{$t('Add New User')}
			</button>
		</div>
	</div>

	<div class="mb-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
		<div
			class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(140px,0.9fr)_minmax(140px,0.9fr)_minmax(140px,0.9fr)_auto]"
		>
			<div>
				<label for="searchTerm" class="mb-1 block text-sm font-medium text-gray-700">{$t('Search')}</label>
				<input
					type="text"
					id="searchTerm"
					bind:value={searchTerm}
					onkeydown={(e) => e.key === 'Enter' && runSearch()}
					placeholder={$t('Search by Name, Email, Username, Emp ID...')}
					class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				/>
			</div>
			<div>
				<label for="departmentFilter" class="mb-1 block text-sm font-medium text-gray-700">{$t('Department')}</label>
				<select
					id="departmentFilter"
					bind:value={departmentFilter}
					class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				>
					<option value="all">{$t('All Departments')}</option>
					{#each data.departments as department (department.id)}
						<option value={String(department.id)}>{department.name}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="positionFilter" class="mb-1 block text-sm font-medium text-gray-700">{$t('Position')}</label>
				<select
					id="positionFilter"
					bind:value={positionFilter}
					class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				>
					<option value="all">{$t('All Positions')}</option>
					{#each data.positions as position (position.id)}
						<option value={String(position.id)}>{position.name}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="roleFilter" class="mb-1 block text-sm font-medium text-gray-700">{$t('Role')}</label>
				<select
					id="roleFilter"
					bind:value={roleFilter}
					class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				>
					<option value="all">{$t('All Roles')}</option>
					{#each data.roles as r (r.id)}
						<option value={String(r.id)}>{r.name}</option>
					{/each}
				</select>
			</div>
			<div class="flex items-end gap-2">
				<button
					type="button"
					onclick={runSearch}
					class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
				>
					{$t('Search')}
				</button>
				<button
					type="button"
					onclick={clearFilters}
					class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
				>
					{$t('Clear')}
				</button>
			</div>
		</div>
	</div>

<div class="w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left font-semibold tracking-wider text-gray-600"
							>{$t('Username')}</th
						>
						<th class="px-4 py-3 text-left font-semibold tracking-wider text-gray-600"
							>{$t('Department')}</th
						>
						<th class="px-4 py-3 text-left font-semibold tracking-wider text-gray-600"
							>{$t('Position')}</th
						>
						<th class="px-4 py-3 text-left font-semibold tracking-wider text-gray-600">
							Iso_Section
						</th>
						<th class="px-4 py-3 text-left font-semibold tracking-wider text-gray-600"
							>{$t('Role')}</th
						>
						<th class="px-4 py-3 text-left font-semibold tracking-wider text-gray-600 whitespace-nowrap"
							>{$t('Last updated')}</th
						>
						<th class="px-4 py-3 text-center font-semibold tracking-wider text-gray-600"
							>{$t('Actions')}</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#if paginatedUsers.length === 0}
						<tr>
							<td colspan="7" class="py-12 text-center text-gray-500"> {$t('No users found.')} </td>
						</tr>
					{:else}
						{#each paginatedUsers as user (user.id)}
							<tr class="transition-colors hover:bg-gray-50">
								<td class="px-4 py-3 font-mono text-xs whitespace-nowrap text-gray-700">
									{user.username}
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-gray-600">
									{user.department_name ?? '-'}
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-gray-600">
									{user.position_name ?? '-'}
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-gray-600">
									{user.iso_section ?? '-'}
								</td>
								<td class="px-4 py-3 whitespace-nowrap">
									<div class="flex flex-wrap gap-1">
										{#if user.roles_csv}
											{#each user.roles_csv.split(',') as roleName (roleName)}
												<span
													class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium {roleName ===
													'admin'
														? 'border-purple-200 bg-purple-50 text-purple-700'
														: 'border-gray-200 bg-gray-50 text-gray-700'}"
												>
													{roleName}
												</span>
											{/each}
										{:else if user.role}
											<span
												class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium {user.role ===
												'admin'
													? 'border-purple-200 bg-purple-50 text-purple-700'
													: 'border-gray-200 bg-gray-50 text-gray-700'}"
											>
												{user.role}
											</span>
										{:else}
											<span class="text-xs text-gray-400">-</span>
										{/if}
									</div>
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
									{formatDateTimeCell(user.updated_at ?? user.created_at)}
								</td>
								<td class="px-4 py-3 text-center whitespace-nowrap">
									<div class="flex items-center justify-center gap-3">
										<button
											type="button"
											onclick={() => openUserModal('edit', user)}
											class="text-gray-400 transition-colors hover:text-blue-600"
											title={$t('Edit User')}
										>
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" /></svg>
										</button>

										<button
											type="button"
											onclick={() => (userToDelete = user)}
											class="text-gray-400 transition-colors hover:text-red-600"
											title={$t('Delete User')}
										>
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
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
						<div class="flex gap-2">
							<input
								type={showPasswordPlain ? 'text' : 'password'}
								name="password"
								id="password"
								required={modalMode === 'add'}
								autocomplete={modalMode === 'edit' ? 'new-password' : 'new-password'}
								bind:value={selectedUser.password}
								class="min-w-0 flex-1 rounded-md border-gray-300 shadow-sm"
							/>
							<button
								type="button"
								onclick={() => (showPasswordPlain = !showPasswordPlain)}
								class="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
							>
								{showPasswordPlain ? 'Hide' : 'Show'}
							</button>
						</div>
						{#if modalMode === 'edit'}
							<p class="mt-1 text-xs text-gray-500">
								{$t('Leave blank to keep the current password.')}
							</p>
							{@const pwdSummary = formatPasswordLastChanged(selectedUser.password_changed_at)}
							{#if pwdSummary}
								<p class="mt-1 text-xs text-gray-600">Last password set: {pwdSummary}</p>
							{/if}
							<p class="mt-1 text-xs text-gray-500">
								Stored passwords are one-way encrypted — the old password cannot be shown. Use Show
								only while typing a new password.
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
						<span class="mb-1 block text-sm font-medium text-gray-700">{$t('Role')}</span>
						<div
							class="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-gray-300 p-2"
							id="role_ids"
						>
							{#each data.roles as role (role.id)}
								<label class="flex cursor-pointer items-center gap-2 text-sm">
									<input
										type="checkbox"
										name="role_ids"
										value={role.id}
										checked={selectedRoleIds.includes(String(role.id))}
										onchange={(e) =>
											toggleRoleMembership(String(role.id), e.currentTarget.checked)}
										class="rounded border-gray-300"
									/>
									<span>{role.name}</span>
								</label>
							{/each}
						</div>
						<p class="mt-1 text-xs text-gray-500">Select one or more roles (saved roles are pre-checked).</p>
					</div>

					<div>
						<label for="iso_section" class="mb-1 block text-sm font-medium text-gray-700"
							>Iso_Section</label
						>
						<select
							name="iso_section"
							id="iso_section"
							bind:value={selectedUser.iso_section}
							class="w-full rounded-md border-gray-300 shadow-sm"
						>
							<option value="">-- Not specified --</option>
							{#each data.isoSections as section (section.id)}
								<option value={section.code}>
									{section.code}
									{#if section.name_th}
										- {section.name_th}
									{/if}
								</option>
							{/each}
							{#if selectedUser?.iso_section}
								{@const iso = selectedUser.iso_section}
								{#if !data.isoSections.some((section: IsoSection) => section.code === iso)}
									<option value={iso}>{iso}</option>
								{/if}
							{/if}
						</select>
						<p class="mt-1 text-xs text-gray-500">Optional</p>
					</div>

					<div>
						<label for="line_user_id" class="mb-1 block text-sm font-medium text-gray-700"
							>LINE User ID (IsoDocs)</label
						>
						<input
							type="text"
							name="line_user_id"
							id="line_user_id"
							bind:value={selectedUser.line_user_id}
							class="w-full rounded-md border-gray-300 font-mono text-sm shadow-sm"
							placeholder="U… (optional)"
							autocomplete="off"
						/>
						<p class="mt-1 text-xs text-gray-500">
							Notify via LINE OA when this user is an IsoDocs approver/QMR. They must add your OA as
							a friend. Use the real Messaging API userId (usually starts with U…), not a display
							name. If Save fails, run <code class="rounded bg-gray-100 px-0.5">sql/users_line_user_id.sql</code> on your database once.
						</p>
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

{#if isIsoSectionModalOpen}
	<div
		transition:fade
		class="fixed inset-0 z-60 flex items-start justify-center bg-black/50 p-4 pt-16"
	>
		<div class="fixed inset-0" onclick={closeIsoSectionManager} role="presentation"></div>
		<div
			class="relative flex max-h-[80vh] w-full max-w-2xl transform flex-col rounded-xl bg-white shadow-2xl transition-all"
		>
			<div class="flex flex-shrink-0 items-center justify-between border-b p-4">
				<h2 class="text-lg font-bold">Manage Iso_Section</h2>
				<button onclick={closeIsoSectionManager} class="text-gray-400 hover:text-gray-600"
					>&times;</button
				>
			</div>

			{#if isoSectionModalMode}
				<form
					method="POST"
					action="?/saveIsoSection"
					use:enhance={handleSaveIsoSection}
					transition:slide={{ duration: 150 }}
				>
					<div class="space-y-3 border-b p-4">
						{#if isoSectionModalMode === 'edit'}
							<input type="hidden" name="id" value={selectedIsoSection?.id} />
						{/if}
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
							<div>
								<label for="iso_code" class="block text-sm font-medium">Code *</label>
								<input
									type="text"
									id="iso_code"
									name="code"
									bind:value={selectedIsoSection.code}
									required
									class="w-full rounded-md border-gray-300 uppercase"
								/>
							</div>
							<div>
								<label for="iso_name_th" class="block text-sm font-medium">Thai Name</label>
								<input
									type="text"
									id="iso_name_th"
									name="name_th"
									bind:value={selectedIsoSection.name_th}
									class="w-full rounded-md border-gray-300"
								/>
							</div>
							<div>
								<label for="iso_name_en" class="block text-sm font-medium">English Name</label>
								<input
									type="text"
									id="iso_name_en"
									name="name_en"
									bind:value={selectedIsoSection.name_en}
									class="w-full rounded-md border-gray-300"
								/>
							</div>
						</div>
						{#if isoSectionFormMessage}
							<p class="text-sm text-red-600">{isoSectionFormMessage.text}</p>
						{/if}
						<div class="flex justify-end gap-2">
							<button
								type="button"
								onclick={closeIsoSectionForm}
								class="rounded-md border bg-white px-3 py-1 text-sm">{$t('Cancel')}</button
							>
							<button
								type="submit"
								disabled={isSavingIsoSection}
								class="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:bg-blue-400"
							>
								{#if isSavingIsoSection}
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
						onclick={() => openIsoSectionForm('add')}
						class="rounded-md bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
						>Add Iso_Section</button
					>
				</div>
			{/if}

			<div class="flex-1 overflow-y-auto p-4">
				<ul class="space-y-1">
					{#each data.isoSections as section (section.id)}
						<li class="flex items-center justify-between rounded-lg p-3 hover:bg-gray-50">
							<div>
								<div class="font-semibold text-gray-900">{section.code}</div>
								<div class="text-xs text-gray-600">{section.name_th || '-'}</div>
								<div class="text-xs text-gray-500">{section.name_en || '-'}</div>
							</div>
							<div class="flex gap-2">
								<button
									onclick={() => openIsoSectionForm('edit', section)}
									class="rounded-md px-2.5 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
									>{$t('Edit')}</button
								>
								<button
									onclick={() => (isoSectionToDelete = section)}
									class="rounded-md px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
									>{$t('Delete')}</button
								>
							</div>
						</li>
					{:else}
						<li class="py-4 text-center text-gray-500">No Iso_Section found.</li>
					{/each}
				</ul>
			</div>

			<div class="flex flex-shrink-0 justify-end border-t bg-gray-50 p-4">
				<button
					type="button"
					onclick={closeIsoSectionManager}
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

<!-- User activity / audit (roles + password) -->
<div class="mt-6">
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm">
		<div
			class="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
		>
			<div>
				<h2 class="text-lg font-semibold text-gray-800">{$t('Role Change History')}</h2>
				<p class="mt-1 text-xs text-gray-500">
					Recent activity — roles &amp; password (last 20 records)
				</p>
			</div>
			<button
				type="button"
				onclick={downloadAuditReportCsv}
				class="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
			>
				{$t('Download report')}
			</button>
		</div>
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left font-semibold tracking-wider text-gray-600"
							>{$t('Date/Time')}</th
						>
						<th class="px-4 py-3 text-left font-semibold tracking-wider text-gray-600"
							>{$t('User')}</th
						>
						<th class="px-4 py-3 text-left font-semibold tracking-wider text-gray-600"
							>{$t('Changed By')}</th
						>
						<th class="px-4 py-3 text-left font-semibold tracking-wider text-gray-600"
							>{$t('Transaction')}</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#each data.userTransactionLogs ?? [] as log (log.logKey)}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-3 whitespace-nowrap text-gray-700">
								{new Date(log.created_at).toLocaleString('th-TH', {
									year: 'numeric',
									month: 'short',
									day: 'numeric',
									hour: '2-digit',
									minute: '2-digit'
								})}
							</td>
							<td class="px-4 py-3">
								<div class="font-medium text-gray-800">{log.user_name}</div>
								{#if log.emp_id}
									<div class="text-xs text-gray-500">{log.emp_id}</div>
								{/if}
							</td>
							<td class="px-4 py-3 text-gray-700">{log.changed_by_name}</td>
							<td class="px-4 py-3 text-xs text-gray-600">
								{log.transaction || '-'}
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="4" class="px-4 py-8 text-center text-gray-500">
								{$t('No role change history found.')}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

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

{#if isoSectionToDelete}
	<div
		class="fixed inset-0 z-70 flex items-center justify-center bg-black/60 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">{$t('Confirm Deletion')}</h3>
			<p class="mt-2 text-sm">
				Delete Iso_Section "<strong>{isoSectionToDelete.code}</strong>"? {$t(
					'This action cannot be undone.'
				)}
			</p>
			<form
				method="POST"
				action="?/deleteIsoSection"
				use:enhance={handleDeleteIsoSection}
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="id" value={isoSectionToDelete.id} />
				<button
					type="button"
					onclick={() => (isoSectionToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm">{$t('Cancel')}</button
				>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white"
					>{$t('Delete')}</button
				>
			</form>
		</div>
	</div>
{/if}
