<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import { slide, fade } from 'svelte/transition';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	let { data, form } = $props();
	let currentStatus = $state(data.statusFilter || 'Active');

	let deptOptions = $derived(
		(data.departments || []).map((d: any) => ({
			value: d.id,
			label: d.name
		}))
	);
	let selectedDept = $state<any>(null);

	let employees = $derived(data.employees || []);

	let sortColumn = $state('emp_id');
	let sortOrder = $state<'asc' | 'desc'>('asc');

	function toggleSort(col: string) {
		if (sortColumn === col) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = col;
			sortOrder = 'asc';
		}
	}

	let sortedEmployees = $derived(
		[...employees].sort((a, b) => {
			let valA = a[sortColumn] || '';
			let valB = b[sortColumn] || '';
			if (sortColumn === 'years_of_experience') {
				valA = Number(a.tenure_days) || 0;
				valB = Number(b.tenure_days) || 0;
			}
			if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
			if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
			return 0;
		})
	);

	let currentPage = $state(1);
	let itemsPerPage = $state(10);
	let totalPages = $derived(Math.ceil(sortedEmployees.length / itemsPerPage) || 1);
	let paginatedEmployees = $derived(
		sortedEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
	);

	let stats = $derived({
		total: employees.length,
		active: employees.filter((e: any) => e.status === 'Active').length,
		resigned: employees.filter((e: any) => e.status === 'Resigned').length,
		subContract: employees.filter((e: any) => e.employee_type === 'Sub Contract').length,
		permanent: employees.filter((e: any) => e.employee_type === 'Permanent').length
	});

	function changeItemsPerPage(e: Event) {
		const target = e.target as HTMLSelectElement;
		itemsPerPage = parseInt(target.value);
		currentPage = 1;
	}

	let selectedIds = $state<string[]>([]);
	let isAllSelected = $derived(
		paginatedEmployees.length > 0 && selectedIds.length === paginatedEmployees.length
	);

	function toggleSelectAll(e: Event) {
		const checked = (e.target as HTMLInputElement).checked;
		if (checked) {
			selectedIds = paginatedEmployees.map((emp) => emp.emp_id);
		} else {
			selectedIds = [];
		}
	}

	$effect(() => {
		currentPage;
		data.searchQuery;
		selectedIds = [];
	});

	let uniqueSections = $derived(
		data.sections && data.sections.length > 0
			? data.sections.map((s: any) => s.section_name)
			: [...new Set(employees.map((e: any) => e.section).filter((v: any) => v && v !== '-'))].sort()
	);

	let uniquePositions = $derived(
		data.positions && data.positions.length > 0
			? data.positions.map((p: any) => p.position_name)
			: [
					...new Set(employees.map((e: any) => e.position_name).filter((v: any) => v && v !== '-'))
				].sort()
	);

	let uniqueGroups = $derived(
		data.groups && data.groups.length > 0
			? data.groups.map((g: any) => g.group_name)
			: [
					...new Set(employees.map((e: any) => e.emp_group).filter((v: any) => v && v !== '-'))
				].sort()
	);

	let uniqueProjects = $derived(
		data.projects && data.projects.length > 0
			? data.projects.map((p: any) => p.project_name)
			: [...new Set(employees.map((e: any) => e.project).filter((v: any) => v && v !== '-'))].sort()
	);

	let modalMode = $state<'view' | 'edit' | 'add' | null>(null);
	let selectedItem = $state<any>(null);
	let itemToDelete = $state<any>(null);
	let showBulkDeleteModal = $state(false);

	let showBulkShiftModal = $state(false);
	let isChangingShift = $state(false);
	let bulkNewShift = $state('');

	let showResignModal = $state(false);
	let employeeToResign = $state<any>(null);
	let isResigning = $state(false);

	let isSaving = $state(false);
	let isDeleting = $state(false);

	function parseDateToInput(dateStr: any) {
		if (!dateStr || typeof dateStr !== 'string' || dateStr === '-') return '';
		const parts = dateStr.split('/');
		if (parts.length === 3) {
			return `${parts[2]}-${parts[1]}-${parts[0]}`;
		}
		return dateStr;
	}

	function openModal(mode: 'view' | 'edit' | 'add', item: any = null) {
		modalMode = mode;

		if (mode === 'add') {
			selectedItem = {
				emp_id: '',
				raw_id: '',
				emp_name: '',
				citizen_id: '',
				employee_type: 'Sub Contract'
			};
		} else {
			selectedItem = { ...item };
			selectedDept = deptOptions.find((opt: any) => opt.value === item.department_id) || null;
			selectedItem.start_date = parseDateToInput(item.start_date);
			selectedItem.default_shift = item.default_shift || '';

			if (mode === 'view') {
				selectedItem.stats = {
					late: item.late_count || 0,
					absent: item.absent_count || 0,
					leave: item.leave_count || 0,
					ot: item.ot_hours || 0,
					balance: item.leave_balance || 15
				};
			}
		}
	}

	function closeModal() {
		modalMode = null;
		selectedItem = null;
	}

	$effect(() => {
		if (form?.success) {
			closeModal();
			itemToDelete = null;
			showBulkDeleteModal = false;
			showResignModal = false;
			showBulkShiftModal = false;
			bulkNewShift = '';
			employeeToResign = null;
			selectedIds = [];
		}
	});
</script>

<svelte:head>
	<title>{$t('Employee Master Data')}</title>
</svelte:head>

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<h1 class="text-2xl font-bold text-gray-800">{$t('Employee Master')}</h1>
	<div class="flex flex-wrap items-center gap-3">
		{#if form?.message}
			<span class="text-sm font-semibold {form.success ? 'text-green-600' : 'text-red-600'}">
				{form.message}
			</span>
		{/if}

		{#if selectedIds.length > 0}
			<button
				onclick={() => (showBulkShiftModal = true)}
				transition:fade
				class="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
			>
				<span class="material-symbols-outlined text-[18px]">schedule</span>
				{$t(`เปลี่ยนกะ (${selectedIds.length})`)}
			</button>

			<button
				onclick={() => (showBulkDeleteModal = true)}
				transition:fade
				class="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
			>
				<span class="material-symbols-outlined text-[18px]">delete</span>
				{$t(`Delete Selected (${selectedIds.length})`)}
			</button>
		{/if}

		<button
			onclick={() => openModal('add')}
			class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-500"
		>
			<span class="material-symbols-outlined text-[18px]">add</span>
			{$t('Add')}
		</button>

		<a
			href="/human-resources/employees/export?status={currentStatus}&search={data.searchQuery ||
				''}"
			data-sveltekit-reload
			class="flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
		>
			<span class="material-symbols-outlined mr-2 text-[20px]">download</span>
			{$t('Export')}
		</a>
		<form
			method="POST"
			action="?/importExcel"
			enctype="multipart/form-data"
			use:enhance
			class="flex"
		>
			<label
				for="fileUpload"
				class="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500"
			>
				<span class="material-symbols-outlined text-[18px]">upload</span>
				{$t('Import')}
				<input
					id="fileUpload"
					type="file"
					name="file"
					accept=".xlsx, .xls"
					class="hidden"
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				/>
			</label>
		</form>
	</div>
</div>

<div class="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
	<div class="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
		<p class="text-sm font-medium text-gray-500">{$t('พนักงานทั้งหมด')}</p>
		<p class="mt-2 text-3xl font-bold text-gray-900">{stats.total}</p>
	</div>
	<div
		class="rounded-lg border border-l-4 border-gray-100 border-l-green-500 bg-white p-5 shadow-sm"
	>
		<p class="text-sm font-medium text-gray-500">{$t('Actives')}</p>
		<p class="mt-2 text-3xl font-bold text-green-600">{stats.active}</p>
	</div>
	<div class="rounded-lg border border-l-4 border-gray-100 border-l-red-500 bg-white p-5 shadow-sm">
		<p class="text-sm font-medium text-gray-500">{$t('Resigned')}</p>
		<p class="mt-2 text-3xl font-bold text-red-600">{stats.resigned}</p>
	</div>
	<div
		class="rounded-lg border border-l-4 border-gray-100 border-l-purple-500 bg-white p-5 shadow-sm"
	>
		<p class="text-sm font-medium text-gray-500">{$t('Sub Contract')}</p>
		<p class="mt-2 text-3xl font-bold text-purple-600">{stats.subContract}</p>
	</div>
	<div
		class="rounded-lg border border-l-4 border-gray-100 border-l-blue-500 bg-white p-5 shadow-sm"
	>
		<p class="text-sm font-medium text-gray-500">{$t('Permanent')}</p>
		<p class="mt-2 text-3xl font-bold text-blue-600">{stats.permanent}</p>
	</div>
</div>

<div class="mb-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
	<form method="GET" class="flex flex-wrap items-end gap-4">
		<div class="min-w-[250px] flex-1">
			<label for="searchInput" class="mb-1 block text-sm font-medium text-gray-700">
				{$t('ค้นหารหัส / บัตรประชาชน / ชื่อพนักงาน')}
			</label>
			<input
				id="searchInput"
				type="text"
				name="search"
				value={data.searchQuery}
				placeholder={$t('พิมพ์คำค้นหา...')}
				class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
			/>
		</div>

		<div class="w-full sm:w-48">
			<label for="status" class="mb-1 block text-sm font-medium text-gray-700">
				{$t('สถานะพนักงาน')}
			</label>
			<select
				id="status"
				name="status"
				bind:value={currentStatus}
				class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
			>
				<option value="All">{$t('All')}</option>
				<option value="Active">{$t('Actives')}</option>
				<option value="Resigned">{$t('Resigned')}</option>
			</select>
		</div>

		<button
			type="submit"
			class="rounded-lg bg-gray-800 px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-700"
		>
			<span class="material-symbols-outlined mr-1 align-middle text-[18px]">search</span>
			{$t('Search')}
		</button>
	</form>
</div>

<div
	class="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-100 bg-white p-4 shadow-sm"
>
	<div class="flex items-center gap-2 text-sm font-medium text-gray-700">
		<label for="itemsPerPage">{$t('Show')}</label>
		<select
			id="itemsPerPage"
			class="rounded-lg border border-gray-300 bg-white py-1.5 pr-8 pl-3 focus:border-blue-500 focus:outline-none"
			value={itemsPerPage}
			onchange={changeItemsPerPage}
		>
			<option value={10}>10</option>
			<option value={20}>20</option>
			<option value={50}>50</option>
			<option value={100}>100</option>
			<option value={200}>200</option>
		</select>
		<span>{$t('รายการต่อหน้า')}</span>
	</div>
	<div
		class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700"
	>
		{$t('พบข้อมูลทั้งหมด')} <span class="font-bold text-blue-600">{employees.length}</span>
		{$t('รายการ')}
	</div>
</div>

<div class="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
	<div class="overflow-x-auto">
		<table class="w-full min-w-[1600px] text-left text-sm text-gray-600">
			<thead class="border-b border-gray-100 bg-gray-50 text-xs text-gray-700 uppercase">
				<tr>
					<th class="w-12 px-4 py-3 text-center">
						<input
							type="checkbox"
							class="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							checked={isAllSelected}
							onchange={toggleSelectAll}
						/>
					</th>
					<!-- รวม Column Emp ID กับ Name เข้าด้วยกันเป็น Profile -->
					<th
						class="group cursor-pointer px-4 py-3 whitespace-nowrap transition-colors select-none hover:bg-gray-100"
						onclick={() => toggleSort('emp_id')}
					>
						<div class="flex items-center gap-1 text-gray-700">
							{$t('Profile')}
							<span
								class="material-symbols-outlined text-[14px] {sortColumn === 'emp_id'
									? 'text-blue-600'
									: 'text-gray-300 opacity-0 group-hover:opacity-100'}"
								>{sortOrder === 'desc' && sortColumn === 'emp_id'
									? 'arrow_downward'
									: 'arrow_upward'}</span
							>
						</div>
					</th>
					<th
						class="group cursor-pointer px-4 py-3 whitespace-nowrap transition-colors select-none hover:bg-gray-100"
						onclick={() => toggleSort('raw_id')}
					>
						<div class="flex items-center gap-1 text-gray-700">
							{$t('Raw ID')}
							<span
								class="material-symbols-outlined text-[14px] {sortColumn === 'raw_id'
									? 'text-blue-600'
									: 'text-gray-300 opacity-0 group-hover:opacity-100'}"
								>{sortOrder === 'desc' && sortColumn === 'raw_id'
									? 'arrow_downward'
									: 'arrow_upward'}</span
							>
						</div>
					</th>
					<th
						class="group cursor-pointer px-4 py-3 whitespace-nowrap transition-colors select-none hover:bg-gray-100"
						onclick={() => toggleSort('citizen_id')}
					>
						<div class="flex items-center gap-1 text-gray-700">
							{$t('National ID card')}
							<span
								class="material-symbols-outlined text-[14px] {sortColumn === 'citizen_id'
									? 'text-blue-600'
									: 'text-gray-300 opacity-0 group-hover:opacity-100'}"
								>{sortOrder === 'desc' && sortColumn === 'citizen_id'
									? 'arrow_downward'
									: 'arrow_upward'}</span
							>
						</div>
					</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Department')}</th>
					<th
						class="group cursor-pointer px-4 py-3 whitespace-nowrap transition-colors select-none hover:bg-gray-100"
						onclick={() => toggleSort('employee_type')}
					>
						<div class="flex items-center gap-1 text-gray-700">
							{$t('Type')}
							<span
								class="material-symbols-outlined text-[14px] {sortColumn === 'employee_type'
									? 'text-blue-600'
									: 'text-gray-300 opacity-0 group-hover:opacity-100'}"
								>{sortOrder === 'desc' && sortColumn === 'employee_type'
									? 'arrow_downward'
									: 'arrow_upward'}</span
							>
						</div>
					</th>
					<th
						class="group cursor-pointer px-4 py-3 whitespace-nowrap transition-colors select-none hover:bg-gray-100"
						onclick={() => toggleSort('default_shift')}
					>
						<div class="flex items-center gap-1 text-gray-700">
							{$t('Shift / Time')}
							<span
								class="material-symbols-outlined text-[14px] {sortColumn === 'default_shift'
									? 'text-blue-600'
									: 'text-gray-300 opacity-0 group-hover:opacity-100'}"
								>{sortOrder === 'desc' && sortColumn === 'default_shift'
									? 'arrow_downward'
									: 'arrow_upward'}</span
							>
						</div>
					</th>
					<th
						class="group cursor-pointer px-4 py-3 whitespace-nowrap transition-colors select-none hover:bg-gray-100"
						onclick={() => toggleSort('subcontractor')}
					>
						<div class="flex items-center gap-1 text-gray-700">
							{$t('Subcontract')}
							<span
								class="material-symbols-outlined text-[14px] {sortColumn === 'subcontractor'
									? 'text-blue-600'
									: 'text-gray-300 opacity-0 group-hover:opacity-100'}"
								>{sortOrder === 'desc' && sortColumn === 'subcontractor'
									? 'arrow_downward'
									: 'arrow_upward'}</span
							>
						</div>
					</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Start Date')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Phone Number')}</th>
					<th
						class="group cursor-pointer px-4 py-3 whitespace-nowrap transition-colors select-none hover:bg-gray-100"
						onclick={() => toggleSort('years_of_experience')}
					>
						<div class="flex items-center gap-1 text-gray-700">
							{$t('Tenure')}
							<span
								class="material-symbols-outlined text-[14px] {sortColumn === 'years_of_experience'
									? 'text-blue-600'
									: 'text-gray-300 opacity-0 group-hover:opacity-100'}"
								>{sortOrder === 'desc' && sortColumn === 'years_of_experience'
									? 'arrow_downward'
									: 'arrow_upward'}</span
							>
						</div>
					</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Dis.')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Section')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Group')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Project')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Sync')}</th>
					<th
						class="group cursor-pointer px-4 py-3 whitespace-nowrap transition-colors select-none hover:bg-gray-100"
						onclick={() => toggleSort('status')}
					>
						<div class="flex items-center gap-1 text-gray-700">
							{$t('Status')}
							<span
								class="material-symbols-outlined text-[14px] {sortColumn === 'status'
									? 'text-blue-600'
									: 'text-gray-300 opacity-0 group-hover:opacity-100'}"
								>{sortOrder === 'desc' && sortColumn === 'status'
									? 'arrow_downward'
									: 'arrow_upward'}</span
							>
						</div>
					</th>
					<th class="px-4 py-3 text-center whitespace-nowrap">{$t('Actions')}</th>
				</tr>
			</thead>
			<tbody>
				{#if paginatedEmployees.length === 0}
					<tr
						><td colspan="19" class="px-4 py-8 text-center text-gray-500">ไม่พบข้อมูลพนักงาน</td
						></tr
					>
				{/if}
				{#each paginatedEmployees as emp}
					<tr
						class="border-b border-gray-50 transition-colors hover:bg-gray-50 {selectedIds.includes(
							emp.emp_id
						)
							? 'bg-blue-50/50'
							: ''}"
					>
						<td class="px-4 py-3 text-center">
							<input
								type="checkbox"
								class="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
								value={emp.emp_id}
								bind:group={selectedIds}
							/>
						</td>
						<!-- ปุ่ม Profile Card กดในคอลัมน์แรกสุด -->
						<td class="min-w-[250px] px-4 py-2 whitespace-nowrap">
							<button
								onclick={() => openModal('view', emp)}
								class="group flex w-full items-center gap-3 rounded-lg border border-transparent p-2 text-left transition-all hover:border-gray-200 hover:bg-white hover:shadow-md"
								title="คลิกเพื่อดู Profile"
							>
								{#if emp.profile_image_path}
									<img
										src={emp.profile_image_path}
										alt={emp.emp_name}
										class="h-10 w-10 rounded-full border border-gray-200 object-cover shadow-sm transition-transform group-hover:scale-105"
									/>
								{:else}
									<div
										class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-sm transition-transform group-hover:scale-105"
									>
										{emp.emp_name ? emp.emp_name.charAt(0).toUpperCase() : '?'}
									</div>
								{/if}
								<div>
									<p class="font-bold text-gray-900 transition-colors group-hover:text-blue-600">
										{emp.emp_name}
									</p>
									<p class="text-xs text-gray-500">
										<span class="font-mono font-medium text-blue-600">{emp.emp_id}</span>
										{#if emp.position_name && emp.position_name !== '-'}
											<span class="mx-1">•</span>{emp.position_name}
										{/if}
									</p>
								</div>
							</button>
						</td>
						<td class="px-4 py-3 font-medium whitespace-nowrap text-gray-600"
							>{emp.raw_id || '-'}</td
						>
						<td class="px-4 py-3 font-mono whitespace-nowrap">{emp.citizen_id || '-'}</td>
						<td class="px-4 py-3 font-semibold whitespace-nowrap text-gray-700"
							>{emp.actual_dept_name || '-'}</td
						>
						<td class="px-4 py-3 font-medium whitespace-nowrap text-purple-600"
							>{emp.employee_type || 'Sub Contract'}</td
						>
						<td class="px-4 py-3 whitespace-nowrap">
							<div class="flex flex-col">
								<span class="font-bold text-indigo-600">{emp.default_shift || '-'}</span>
								{#if emp.shift_time_display && emp.shift_time_display !== '-'}
									<span class="text-[11px] text-gray-500">{emp.shift_time_display}</span>
								{/if}
							</div>
						</td>
						<td class="px-4 py-3 font-bold whitespace-nowrap text-blue-600"
							>{emp.subcontractor || '-'}</td
						>
						<td class="px-4 py-3 font-mono whitespace-nowrap">{emp.start_date}</td>
						<td class="px-4 py-3 font-mono whitespace-nowrap">{emp.phone_number || '-'}</td>
						<td class="px-4 py-3 whitespace-nowrap">{emp.years_of_experience || '-'}</td>
						<td class="px-4 py-3 whitespace-nowrap">{emp.division || '-'}</td>
						<td class="px-4 py-3 whitespace-nowrap">{emp.section || '-'}</td>
						<td class="px-4 py-3 whitespace-nowrap">{emp.emp_group || '-'}</td>
						<td class="px-4 py-3 whitespace-nowrap">{emp.project || '-'}</td>
						<td class="px-4 py-3 font-mono text-xs whitespace-nowrap text-gray-500">
							{#if emp.last_sync_time}
								{@const d = new Date(emp.last_sync_time)}
								{String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(
									2,
									'0'
								)}/{d.getFullYear()}
								<span class="font-bold text-blue-600"
									>{d.getHours().toString().padStart(2, '0')}:{d
										.getMinutes()
										.toString()
										.padStart(2, '0')}</span
								>
							{:else}
								<span class="text-gray-300">ยังไม่เคยซิงค์</span>
							{/if}
						</td>
						<td class="px-4 py-3 whitespace-nowrap">
							<span
								class="rounded-full px-2.5 py-1 text-xs font-semibold {emp.status === 'Active'
									? 'bg-green-100 text-green-700'
									: 'bg-red-100 text-red-700'}"
							>
								{emp.status === 'Active' ? 'ทำงานอยู่' : 'ลาออก'}
							</span>
						</td>
						<td class="px-4 py-3 text-center whitespace-nowrap">
							<div class="flex items-center justify-center gap-2">
								<button
									onclick={() => openModal('view', emp)}
									class="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600"
									title={$t('View Profile')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle
											cx="12"
											cy="12"
											r="3"
										/></svg
									>
								</button>
								<button
									onclick={() => openModal('edit', emp)}
									class="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-yellow-600"
									title={$t('Edit')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
									>
								</button>
								<button
									onclick={() => {
										employeeToResign = {
											...emp,
											resign_date: new Date().toISOString().split('T')[0],
											resign_reason: ''
										};
										showResignModal = true;
									}}
									class="rounded p-1.5 transition-colors {emp.status === 'Resigned'
										? 'cursor-not-allowed text-gray-300'
										: 'text-gray-500 hover:bg-orange-50 hover:text-orange-600'}"
									title={$t('Resign')}
									disabled={emp.status === 'Resigned'}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline
											points="16 17 21 12 16 7"
										/><line x1="21" y1="12" x2="9" y2="12" />
									</svg>
								</button>
								<button
									onclick={() => (itemToDelete = emp)}
									class="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600"
									title={$t('Delete')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2-2H7a2 2 0 0 1-2-2V6" /></svg
									>
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if totalPages > 1}
		<div
			class="flex flex-col items-center justify-between gap-4 border-t border-gray-100 bg-gray-50 p-4 sm:flex-row"
		>
			<span class="text-sm font-medium text-gray-600"
				>{$t('กำลังแสดงหน้าที่')} {currentPage} {$t('จากทั้งหมด')} {totalPages} {$t('หน้า')}</span
			>
			<div class="flex gap-2">
				<button
					class="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={currentPage === 1}
					onclick={() => currentPage--}
				>
					<span class="material-symbols-outlined text-[16px]">chevron_left</span>
					{$t('ก่อนหน้า')}
				</button>
				<button
					class="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={currentPage === totalPages}
					onclick={() => currentPage++}
				>
					{$t('ถัดไป')} <span class="material-symbols-outlined text-[16px]">chevron_right</span>
				</button>
			</div>
		</div>
	{/if}
</div>

{#if modalMode && selectedItem}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div
			transition:slide={{ duration: 200 }}
			class="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
		>
			{#if modalMode === 'view'}
				<!-- Profile Card Header (เท่ๆ สำหรับโหมด View) -->
				<div
					class="relative overflow-hidden bg-gradient-to-r from-blue-700 to-indigo-900 px-8 py-10 text-white shadow-inner"
				>
					<div class="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
					<div
						class="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/10 blur-3xl"
					></div>

					<button
						type="button"
						onclick={closeModal}
						class="absolute top-4 right-4 z-20 rounded-full bg-black/20 p-1.5 text-white/70 transition-colors hover:bg-black/40 hover:text-white"
					>
						<span class="material-symbols-outlined text-[20px]">close</span>
					</button>

					<div class="relative z-10 flex flex-col items-center gap-6 md:flex-row md:items-center">
						<div class="relative">
							{#if selectedItem.profile_image_path}
								<img
									src={selectedItem.profile_image_path}
									alt="Profile"
									class="h-28 w-28 rounded-full border-4 border-white/20 object-cover shadow-2xl backdrop-blur-sm"
								/>
							{:else}
								<div
									class="flex h-28 w-28 items-center justify-center rounded-full border-4 border-white/20 bg-white/10 text-5xl font-bold shadow-2xl backdrop-blur-sm"
								>
									{selectedItem.emp_name.charAt(0)}
								</div>
							{/if}
							<span
								class="absolute right-2 bottom-2 h-5 w-5 rounded-full border-2 border-indigo-900 {selectedItem.status ===
								'Active'
									? 'bg-green-400'
									: 'bg-red-500'} shadow-lg"
								title={selectedItem.status}
							></span>
						</div>

						<div class="text-center md:text-left">
							<div class="flex flex-wrap items-center justify-center gap-3 md:justify-start">
								<h2 class="text-3xl font-bold tracking-tight">{selectedItem.emp_name}</h2>
								<span
									class="rounded-full border border-white/10 bg-white/20 px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur-md"
								>
									{selectedItem.employee_type || 'Sub Contract'}
								</span>
							</div>
							<p
								class="mt-1 flex items-center justify-center gap-2 text-lg font-medium text-blue-100 md:justify-start"
							>
								<span class="material-symbols-outlined text-[18px] opacity-70">badge</span>
								{selectedItem.emp_id}
								{#if selectedItem.position_name && selectedItem.position_name !== '-'}
									<span class="px-1 opacity-40">|</span> {selectedItem.position_name}
								{/if}
							</p>
							<div class="mt-4 flex flex-wrap justify-center gap-2 md:justify-start">
								<div
									class="flex items-center gap-1.5 rounded-lg border border-white/5 bg-black/20 px-3 py-1.5 text-sm font-medium backdrop-blur-sm"
								>
									<span class="material-symbols-outlined text-[16px] text-blue-200">apartment</span>
									{selectedItem.actual_dept_name || 'No Department'}
								</div>
								<div
									class="flex items-center gap-1.5 rounded-lg border border-white/5 bg-black/20 px-3 py-1.5 text-sm font-medium backdrop-blur-sm"
								>
									<span class="material-symbols-outlined text-[16px] text-purple-200">schedule</span
									>
									{selectedItem.default_shift || 'No Shift'}
									{#if selectedItem.shift_time_display && selectedItem.shift_time_display !== '-'}
										<span class="ml-1 text-xs opacity-70">({selectedItem.shift_time_display})</span>
									{/if}
								</div>
							</div>
						</div>
					</div>
				</div>

				<div class="overflow-y-auto bg-gray-50/50 p-8">
					<!-- Stats Dashboard -->
					<div class="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
						<div
							class="rounded-xl border border-yellow-200/60 bg-yellow-50 p-4 text-center shadow-sm transition-shadow hover:shadow"
						>
							<p class="text-xs font-bold tracking-wide text-yellow-600 uppercase">{$t('Late')}</p>
							<p class="mt-1 text-2xl font-black text-yellow-700">
								{selectedItem?.stats?.late ?? 0}
							</p>
						</div>
						<div
							class="rounded-xl border border-red-200/60 bg-red-50 p-4 text-center shadow-sm transition-shadow hover:shadow"
						>
							<p class="text-xs font-bold tracking-wide text-red-600 uppercase">{$t('Absent')}</p>
							<p class="mt-1 text-2xl font-black text-red-700">
								{selectedItem?.stats?.absent ?? 0}
							</p>
						</div>
						<div
							class="rounded-xl border border-blue-200/60 bg-blue-50 p-4 text-center shadow-sm transition-shadow hover:shadow"
						>
							<p class="text-xs font-bold tracking-wide text-blue-600 uppercase">{$t('Leave')}</p>
							<p class="mt-1 text-2xl font-black text-blue-700">
								{selectedItem?.stats?.leave ?? 0}
							</p>
						</div>
						<div
							class="rounded-xl border border-purple-200/60 bg-purple-50 p-4 text-center shadow-sm transition-shadow hover:shadow"
						>
							<p class="text-xs font-bold tracking-wide text-purple-600 uppercase">
								{$t('OT (Hrs)')}
							</p>
							<p class="mt-1 text-2xl font-black text-purple-700">{selectedItem?.stats?.ot ?? 0}</p>
						</div>
						<div
							class="rounded-xl border border-green-200/60 bg-green-50 p-4 text-center shadow-sm transition-shadow hover:shadow"
						>
							<p class="text-xs font-bold tracking-wide text-green-600 uppercase">
								{$t('Leave Balance')}
							</p>
							<p class="mt-1 text-2xl font-black text-green-700">
								{(selectedItem?.stats?.balance ?? 30) - (selectedItem?.stats?.leave ?? 0)}
							</p>
						</div>
					</div>

					<!-- Detailed Info Grid -->
					<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
						<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
							<h4
								class="mb-4 flex items-center gap-2 text-xs font-bold tracking-wider text-gray-400 uppercase"
							>
								<span class="material-symbols-outlined text-[18px]">work</span> Work Information
							</h4>
							<div class="space-y-4">
								<div class="flex items-center justify-between border-b border-gray-100 pb-3">
									<span class="text-sm text-gray-500">Start Date</span>
									<span class="text-sm font-medium text-gray-900">{selectedItem.start_date}</span>
								</div>
								<div class="flex items-center justify-between border-b border-gray-100 pb-3">
									<span class="text-sm text-gray-500">Tenure (อายุงาน)</span>
									<span class="rounded bg-blue-50 px-2 py-0.5 text-sm font-medium text-blue-600"
										>{selectedItem.years_of_experience}</span
									>
								</div>
								<div class="flex items-center justify-between border-b border-gray-100 pb-3">
									<span class="text-sm text-gray-500">Division / Section</span>
									<span class="text-right text-sm font-medium text-gray-900"
										>{selectedItem.division || '-'} / {selectedItem.section || '-'}</span
									>
								</div>
								<div class="flex items-center justify-between pb-1">
									<span class="text-sm text-gray-500">Subcontractor</span>
									<span class="text-sm font-medium text-gray-900"
										>{selectedItem.subcontractor || '-'}</span
									>
								</div>
							</div>
						</div>

						<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
							<h4
								class="mb-4 flex items-center gap-2 text-xs font-bold tracking-wider text-gray-400 uppercase"
							>
								<span class="material-symbols-outlined text-[18px]">manage_accounts</span> Personal &
								System
							</h4>
							<div class="space-y-4">
								<div class="flex items-center justify-between border-b border-gray-100 pb-3">
									<span class="text-sm text-gray-500">National ID</span>
									<span class="font-mono text-sm text-gray-900"
										>{selectedItem.citizen_id || '-'}</span
									>
								</div>
								<div class="flex items-center justify-between border-b border-gray-100 pb-3">
									<span class="text-sm text-gray-500">Phone Number</span>
									<span class="font-mono text-sm text-gray-900"
										>{selectedItem.phone_number || '-'}</span
									>
								</div>
								<div class="flex items-center justify-between border-b border-gray-100 pb-3">
									<span class="text-sm text-gray-500">Raw ID (Scanner)</span>
									<span class="rounded bg-gray-100 px-2 py-0.5 font-mono text-sm text-gray-900"
										>{selectedItem.raw_id || '-'}</span
									>
								</div>
								<div class="flex items-center justify-between pb-1">
									<span class="text-sm text-gray-500">Group / Project</span>
									<span class="text-right text-sm font-medium text-gray-900"
										>{selectedItem.emp_group || '-'} / {selectedItem.project || '-'}</span
									>
								</div>
							</div>
						</div>
					</div>
				</div>
			{:else}
				<!-- Header สำหรับ Add / Edit -->
				<div class="flex items-center justify-between border-b bg-gray-50 px-6 py-4">
					<h2 class="text-lg font-bold text-gray-900">
						{modalMode === 'add' ? $t('Add New Employee') : $t('Edit employee information')}
					</h2>
					<button type="button" onclick={closeModal} class="text-gray-400 hover:text-gray-600">
						<span class="material-symbols-outlined">close</span>
					</button>
				</div>

				<div class="overflow-y-auto p-6">
					<form
						id="employeeForm"
						method="POST"
						action="?/save"
						enctype="multipart/form-data"
						use:enhance={() => {
							isSaving = true;
							return async ({ update }) => {
								await update();
								isSaving = false;
							};
						}}
					>
						<input type="hidden" name="mode" value={modalMode} />

						<div class="mb-4">
							<label for="profile_image" class="mb-1 block text-sm font-semibold text-gray-700">
								{$t('รูปถ่ายพนักงาน')}
							</label>
							<div class="mt-2 flex items-center gap-4">
								{#if selectedItem.profile_image_path && modalMode === 'edit'}
									<img
										src={selectedItem.profile_image_path}
										class="h-12 w-12 rounded-full border object-cover"
										alt="preview"
									/>
								{/if}

								<input
									id="profile_image"
									type="file"
									name="profile_image"
									accept="image/*"
									class="w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-semibold hover:file:bg-gray-200"
								/>
								<input
									type="hidden"
									name="existing_image_path"
									value={selectedItem.profile_image_path || ''}
								/>
							</div>
						</div>

						<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
							<!-- Input ฟิลด์ต่างๆ สำหรับ Edit / Add (ดึงโค้ดเดิมของคุณมาใช้งาน) -->
							<div>
								<label for="emp_id" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Emp ID')} <span class="text-red-500">*</span></label
								>
								<input
									id="emp_id"
									type="text"
									name="emp_id"
									bind:value={selectedItem.emp_id}
									required
									readonly={modalMode !== 'add'}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 {modalMode !==
									'add'
										? 'bg-gray-100 text-gray-500'
										: ''}"
								/>
							</div>

							<div>
								<label for="raw_id" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('รหัสในเครื่องสแกน (Raw ID)')}</label
								>
								<input
									id="raw_id"
									type="text"
									name="raw_id"
									bind:value={selectedItem.raw_id}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<div>
								<label for="emp_name" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Name')} <span class="text-red-500">*</span></label
								>
								<input
									id="emp_name"
									type="text"
									name="emp_name"
									bind:value={selectedItem.emp_name}
									required
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<div>
								<label for="department" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Department')} (ฝ่าย) <span class="text-red-500">*</span></label
								>
								<Select
									items={deptOptions}
									bind:value={selectedDept}
									placeholder={$t('เลือกฝ่าย...')}
									container={browser ? document.body : null}
									class="svelte-select-custom"
								/>
								<input
									type="hidden"
									name="department_id"
									value={selectedDept?.value || ''}
									required
								/>
							</div>

							<div>
								<label for="citizen_id" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('National ID card')}</label
								>
								<input
									id="citizen_id"
									type="text"
									name="citizen_id"
									bind:value={selectedItem.citizen_id}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<div>
								<label for="employee_type" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Employee Type')} <span class="text-red-500">*</span></label
								>
								<select
									id="employee_type"
									name="employee_type"
									bind:value={selectedItem.employee_type}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								>
									<option value="Sub Contract">Sub Contract</option>
									<option value="Permanent">Permanent</option>
								</select>
							</div>

							<div>
								<label for="default_shift" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Default Shift')}</label
								>
								<select
									id="default_shift"
									name="default_shift"
									bind:value={selectedItem.default_shift}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								>
									<option value="">{$t('- ไม่ระบุ -')}</option>
									{#if data.shifts && data.shifts.length > 0}
										{#each data.shifts as shift}
											<option value={shift.shift_code}
												>{shift.shift_code} - {shift.shift_name}</option
											>
										{/each}
									{/if}
								</select>
							</div>

							<div>
								<label for="subcontractor" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Subcontract')}</label
								>
								<input
									id="subcontractor"
									type="text"
									name="subcontractor"
									bind:value={selectedItem.subcontractor}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="start_date" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Start Date')}</label
								>
								<input
									id="start_date"
									type="date"
									name="start_date"
									bind:value={selectedItem.start_date}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="phone_number" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Phone Number')}</label
								>
								<input
									id="phone_number"
									type="text"
									name="phone_number"
									bind:value={selectedItem.phone_number}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<div>
								<label for="dis" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Division')}</label
								>
								<select
									id="dis"
									name="dis"
									bind:value={selectedItem.division}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								>
									<option value="-">{$t('- ไม่ระบุ -')}</option>
									{#each data.divisions as div}
										<option value={div.division_name}>{div.division_name}</option>
									{/each}
								</select>
							</div>

							<div>
								<label for="section" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Section')}</label
								>
								<select
									id="section"
									name="section"
									bind:value={selectedItem.section}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								>
									<option value="-">{$t('- ไม่ระบุ -')}</option>
									{#each uniqueSections as val}
										<option value={val}>{val}</option>
									{/each}
								</select>
							</div>

							<div>
								<label for="emp_group" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Group')}</label
								>
								<select
									id="emp_group"
									name="emp_group"
									bind:value={selectedItem.emp_group}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								>
									<option value="-">{$t('- ไม่ระบุ -')}</option>
									{#each uniqueGroups as val}
										<option value={val}>{val}</option>
									{/each}
								</select>
							</div>

							<div>
								<label for="position_name" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Position')}</label
								>
								<select
									id="position_name"
									name="position_name"
									bind:value={selectedItem.position_name}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								>
									<option value="-">{$t('- ไม่ระบุ -')}</option>
									{#each uniquePositions as val}
										<option value={val}>{val}</option>
									{/each}
								</select>
							</div>

							<div>
								<label for="project" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Project')}</label
								>
								<select
									id="project"
									name="project"
									bind:value={selectedItem.project}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								>
									<option value="-">{$t('- ไม่ระบุ -')}</option>
									{#each uniqueProjects as val}
										<option value={val}>{val}</option>
									{/each}
								</select>
							</div>

							<div>
								<label for="status" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Status')}</label
								>
								<select
									id="status"
									name="status"
									bind:value={selectedItem.status}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								>
									<option value="Active">{$t('Active')}</option>
									<option value="Resigned">{$t('Resigned')}</option>
								</select>
							</div>
						</div>
					</form>
				</div>
			{/if}

			<div class="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
				<button
					type="button"
					onclick={closeModal}
					class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
				>
					{modalMode === 'view' ? $t('Close') : $t('Cancel')}
				</button>
				{#if modalMode === 'edit' || modalMode === 'add'}
					<button
						type="submit"
						form="employeeForm"
						disabled={isSaving}
						class="rounded-md bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-70"
					>
						{isSaving
							? $t('Saving...')
							: modalMode === 'add'
								? $t('Add Employee')
								: $t('Save Changes')}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Modal ทำรายการลาออก และแจ้งเตือนอื่นๆ ยังคงเหมือนเดิม -->
{#if showResignModal && employeeToResign}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		transition:fade={{ duration: 150 }}
	>
		<div
			class="w-full max-w-md rounded-xl bg-white shadow-2xl"
			transition:slide={{ duration: 200 }}
		>
			<div class="flex items-center justify-between border-b bg-gray-50 px-6 py-4">
				<h3 class="text-lg font-bold text-gray-900">{$t('แจ้งพนักงานลาออก')}</h3>
				<button
					type="button"
					onclick={() => {
						showResignModal = false;
						employeeToResign = null;
					}}
					class="text-gray-400 hover:text-gray-600"
				>
					<span class="material-symbols-outlined">close</span>
				</button>
			</div>

			<form
				method="POST"
				action="?/resign"
				use:enhance={() => {
					isResigning = true;
					return async ({ update }) => {
						await update();
						isResigning = false;
					};
				}}
				class="p-6"
			>
				<input type="hidden" name="emp_id" value={employeeToResign.emp_id} />
				<div class="mb-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-800">
					คุณกำลังทำรายการให้พนักงาน <strong class="text-gray-900"
						>{employeeToResign.emp_name}</strong
					>
					(รหัส: {employeeToResign.emp_id}) เปลี่ยนสถานะเป็น <b>"ลาออก"</b>
				</div>

				<div class="space-y-4">
					<div>
						<label for="resign_date" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('วันที่ลาออก (มีผล)')} <span class="text-red-500">*</span></label
						>
						<input
							id="resign_date"
							type="date"
							name="resign_date"
							bind:value={employeeToResign.resign_date}
							required
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500"
						/>
					</div>
					<div>
						<label for="resign_reason" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('สาเหตุการลาออก')}</label
						>
						<textarea
							id="resign_reason"
							name="resign_reason"
							rows="3"
							bind:value={employeeToResign.resign_reason}
							placeholder="ระบุสาเหตุ (ถ้ามี)"
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500"
						></textarea>
					</div>
				</div>

				<div class="mt-6 flex justify-end gap-3">
					<button
						type="button"
						onclick={() => {
							showResignModal = false;
							employeeToResign = null;
						}}
						class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
						>{$t('Cancel')}</button
					>
					<button
						type="submit"
						disabled={isResigning}
						class="rounded-md bg-orange-600 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-700 disabled:opacity-70"
						>{isResigning ? $t('กำลังบันทึก...') : $t('ยืนยันการลาออก')}</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if itemToDelete}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl">
			<div
				class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600"
			>
				<span class="material-symbols-outlined text-[24px]">delete</span>
			</div>
			<h3 class="text-lg font-bold text-gray-900">{$t('ยืนยันการลบข้อมูล')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				คุณต้องการลบข้อมูลของ <strong class="text-gray-900">{itemToDelete.emp_name}</strong> ใช่หรือไม่?
			</p>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					isDeleting = true;
					return async ({ update }) => {
						await update();
						isDeleting = false;
					};
				}}
				class="mt-6 flex justify-center gap-3"
			>
				<input type="hidden" name="emp_id" value={itemToDelete.emp_id} />
				<button
					type="button"
					onclick={() => (itemToDelete = null)}
					class="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
					>{$t('Cancel')}</button
				>
				<button
					type="submit"
					disabled={isDeleting}
					class="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-70"
					>{isDeleting ? $t('Deleting...') : $t('Confirm Delete')}</button
				>
			</form>
		</div>
	</div>
{/if}

{#if showBulkDeleteModal}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl">
			<div
				class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600"
			>
				<span class="material-symbols-outlined text-[24px]">warning</span>
			</div>
			<h3 class="text-lg font-bold text-gray-900">{$t('ยืนยันการลบข้อมูล')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				คุณกำลังจะลบข้อมูลพนักงานทั้งหมด <strong class="text-lg text-red-600"
					>{selectedIds.length}</strong
				>
				รายการ <br />
				การกระทำนี้ไม่สามารถย้อนกลับได้ คุณแน่ใจหรือไม่?
			</p>
			<form
				method="POST"
				action="?/bulkDelete"
				use:enhance={() => {
					isDeleting = true;
					return async ({ update }) => {
						await update();
						isDeleting = false;
					};
				}}
				class="mt-6 flex justify-center gap-3"
			>
				<input type="hidden" name="ids" value={JSON.stringify(selectedIds)} />
				<button
					type="button"
					onclick={() => (showBulkDeleteModal = false)}
					class="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
					>{$t('Cancel')}</button
				>
				<button
					type="submit"
					disabled={isDeleting}
					class="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-70"
					>{isDeleting ? $t('Deleting...') : $t('Delete Selected')}</button
				>
			</form>
		</div>
	</div>
{/if}

{#if showBulkShiftModal}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		transition:fade={{ duration: 150 }}
	>
		<div
			class="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl"
			transition:slide={{ duration: 200 }}
		>
			<div
				class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600"
			>
				<span class="material-symbols-outlined text-[24px]">schedule</span>
			</div>
			<h3 class="text-lg font-bold text-gray-900">{$t('เปลี่ยนกะการทำงาน')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				เลือกกะใหม่สำหรับพนักงานที่เลือก <strong class="text-lg text-indigo-600"
					>{selectedIds.length}</strong
				> รายการ
			</p>

			<form
				method="POST"
				action="?/bulkChangeShift"
				use:enhance={() => {
					isChangingShift = true;
					return async ({ update }) => {
						await update();
						isChangingShift = false;
					};
				}}
				class="mt-6 text-left"
			>
				<input type="hidden" name="ids" value={JSON.stringify(selectedIds)} />

				<div class="mb-6">
					<label for="bulk_new_shift" class="mb-2 block text-sm font-semibold text-gray-700"
						>{$t('กะการทำงานใหม่')} <span class="text-red-500">*</span></label
					>
					<select
						id="bulk_new_shift"
						name="new_shift"
						bind:value={bulkNewShift}
						required
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
					>
						<option value="" disabled selected>{$t('- โปรดเลือกกะ -')}</option>
						{#if data.shifts && data.shifts.length > 0}
							{#each data.shifts as shift}
								<option value={shift.shift_code}>{shift.shift_code} - {shift.shift_name}</option>
							{/each}
						{/if}
					</select>
				</div>

				<div class="flex justify-center gap-3">
					<button
						type="button"
						onclick={() => (showBulkShiftModal = false)}
						class="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
						>{$t('Cancel')}</button
					>
					<button
						type="submit"
						disabled={isChangingShift || !bulkNewShift}
						class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-70"
						>{isChangingShift ? $t('Saving...') : $t('ยืนยัน')}</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}
