<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import { slide, fade } from 'svelte/transition';
	let { data, form } = $props();

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
			if (sortColumn === 'tenure') {
				valA = Number(valA) || 0;
				valB = Number(valB) || 0;
			}
			if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
			if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
			return 0;
		})
	);

	let currentPage = $state(1);
	let itemsPerPage = $state(20);
	let totalPages = $derived(Math.ceil(sortedEmployees.length / itemsPerPage) || 1);
	let paginatedEmployees = $derived(
		sortedEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
	);

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

	let uniqueDivisions = $derived(
		[...new Set(employees.map((e: any) => e.dis).filter((v: any) => v && v !== '-'))].sort()
	);
	let uniqueSections = $derived(
		[...new Set(employees.map((e: any) => e.section).filter((v: any) => v && v !== '-'))].sort()
	);
	let uniqueGroups = $derived(
		[...new Set(employees.map((e: any) => e.emp_group).filter((v: any) => v && v !== '-'))].sort()
	);
	let uniquePositions = $derived(
		[
			...new Set(employees.map((e: any) => e.position_name).filter((v: any) => v && v !== '-'))
		].sort()
	);
	let uniqueProjects = $derived(
		[...new Set(employees.map((e: any) => e.project).filter((v: any) => v && v !== '-'))].sort()
	);

	let modalMode = $state<'view' | 'edit' | null>(null);
	let selectedItem = $state<any>(null);
	let itemToDelete = $state<any>(null);
	let showBulkDeleteModal = $state(false);
	let isSaving = $state(false);
	let isDeleting = $state(false);

	function parseDateToInput(dateStr: string) {
		if (!dateStr || dateStr === '-') return '';
		const parts = dateStr.split('/');
		if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
		return '';
	}

	function openModal(mode: 'view' | 'edit', item: any) {
		modalMode = mode;
		selectedItem = { ...item };
		selectedItem.start_date = parseDateToInput(item.start_date);
		selectedItem.start_ih = parseDateToInput(item.start_ih);
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
			selectedIds = [];
		}
	});

	const SortHeader = ({ col, label }: { col: string; label: string }) => {
		return `
			<th class="px-4 py-3 cursor-pointer select-none hover:bg-gray-100 transition-colors group whitespace-nowrap" onclick="toggleSort('${col}')">
				<div class="flex items-center gap-1 text-gray-700">
					${label}
					<span class="material-symbols-outlined text-[14px] ${sortColumn === col ? 'text-blue-600' : 'text-gray-300 opacity-0 group-hover:opacity-100'}">
						${sortColumn === col && sortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'}
					</span>
				</div>
			</th>
		`;
	};
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
				onclick={() => (showBulkDeleteModal = true)}
				transition:fade
				class="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
			>
				<span class="material-symbols-outlined text-[18px]">delete</span>
				{$t(`Delete Selected (${selectedIds.length})`)}
			</button>
		{/if}

		<a
			href="/human-resources/employees/export"
			data-sveltekit-reload
			class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
		>
			<span class="material-symbols-outlined text-[18px]">download</span>
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

<div class="mb-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
	<form method="GET" class="flex flex-wrap items-end gap-4">
		<div class="min-w-[250px] flex-1">
			<label for="searchInput" class="mb-1 block text-sm font-medium text-gray-700"
				>{$t('ค้นหารหัส / บัตรประชาชน / ชื่อพนักงาน')}</label
			>
			<input
				id="searchInput"
				type="text"
				name="search"
				value={data.searchQuery}
				placeholder={$t('พิมพ์คำค้นหา...')}
				class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
			/>
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
		{$t('item')}
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
					<th
						class="group cursor-pointer px-4 py-3 whitespace-nowrap transition-colors select-none hover:bg-gray-100"
						onclick={() => toggleSort('emp_id')}
					>
						<div class="flex items-center gap-1 text-gray-700">
							{$t('Emp ID')}
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
					<th
						class="group cursor-pointer px-4 py-3 whitespace-nowrap transition-colors select-none hover:bg-gray-100"
						onclick={() => toggleSort('emp_name')}
					>
						<div class="flex items-center gap-1 text-gray-700">
							{$t('Name')}
							<span
								class="material-symbols-outlined text-[14px] {sortColumn === 'emp_name'
									? 'text-blue-600'
									: 'text-gray-300 opacity-0 group-hover:opacity-100'}"
								>{sortOrder === 'desc' && sortColumn === 'emp_name'
									? 'arrow_downward'
									: 'arrow_upward'}</span
							>
						</div>
					</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Start TC')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Start IH')}</th>
					<th
						class="group cursor-pointer px-4 py-3 whitespace-nowrap transition-colors select-none hover:bg-gray-100"
						onclick={() => toggleSort('tenure')}
					>
						<div class="flex items-center gap-1 text-gray-700">
							{$t('Tenure')}
							<span
								class="material-symbols-outlined text-[14px] {sortColumn === 'tenure'
									? 'text-blue-600'
									: 'text-gray-300 opacity-0 group-hover:opacity-100'}"
								>{sortOrder === 'desc' && sortColumn === 'tenure'
									? 'arrow_downward'
									: 'arrow_upward'}</span
							>
						</div>
					</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Dis.')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Section')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Group')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Position')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Project')}</th>
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
						><td colspan="15" class="px-4 py-8 text-center text-gray-500">ไม่พบข้อมูลพนักงาน</td
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
						<td class="px-4 py-3 font-bold whitespace-nowrap text-blue-600">{emp.subcontractor}</td>
						<td class="px-4 py-3 font-medium whitespace-nowrap text-gray-900">{emp.emp_id}</td>
						<td class="px-4 py-3 font-mono whitespace-nowrap">{emp.citizen_id || '-'}</td>
						<td class="px-4 py-3 whitespace-nowrap">{emp.emp_name}</td>
						<td class="px-4 py-3 font-mono whitespace-nowrap">{emp.start_date}</td>
						<td class="px-4 py-3 font-mono whitespace-nowrap">{emp.start_ih}</td>
						<td class="px-4 py-3 whitespace-nowrap">{emp.tenure}</td>
						<td class="px-4 py-3 whitespace-nowrap">{emp.dis}</td>
						<td class="px-4 py-3 whitespace-nowrap">{emp.section}</td>
						<td class="px-4 py-3 whitespace-nowrap">{emp.emp_group}</td>
						<td class="px-4 py-3 whitespace-nowrap">{emp.position_name}</td>
						<td class="px-4 py-3 whitespace-nowrap">{emp.project}</td>
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
									title={$t('View')}
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
			class="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
		>
			<div class="flex items-center justify-between border-b bg-gray-50 px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'view' ? $t('รายละเอียดพนักงาน (View)') : $t('แก้ไขข้อมูลพนักงาน (Edit)')}
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
					use:enhance={() => {
						isSaving = true;
						return async ({ update }) => {
							await update();
							isSaving = false;
						};
					}}
				>
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
						<div>
							<label for="emp_id" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Emp ID')}</label
							>
							<input
								id="emp_id"
								type="text"
								name="emp_id"
								bind:value={selectedItem.emp_id}
								readonly
								class="w-full rounded-md border-gray-300 bg-gray-100 text-gray-500 shadow-sm"
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
								readonly={modalMode === 'view'}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 {modalMode ===
								'view'
									? 'bg-gray-50'
									: ''}"
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
								readonly={modalMode === 'view'}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 {modalMode ===
								'view'
									? 'bg-gray-50'
									: ''}"
							/>
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
								readonly={modalMode === 'view'}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 {modalMode ===
								'view'
									? 'bg-gray-50'
									: ''}"
							/>
						</div>
						<div>
							<label for="start_date" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('วันเริ่มงาน TC')}</label
							>
							<input
								id="start_date"
								type="date"
								name="start_date"
								bind:value={selectedItem.start_date}
								readonly={modalMode === 'view'}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 {modalMode ===
								'view'
									? 'bg-gray-50'
									: ''}"
							/>
						</div>
						<div>
							<label for="start_ih" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Start IH')}</label
							>
							<input
								id="start_ih"
								type="date"
								name="start_ih"
								bind:value={selectedItem.start_ih}
								readonly={modalMode === 'view'}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 {modalMode ===
								'view'
									? 'bg-gray-50'
									: ''}"
							/>
						</div>

						<div>
							<label for="tenure" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('อายุงาน')}</label
							>
							<input
								id="tenure"
								type="text"
								name="tenure"
								bind:value={selectedItem.tenure}
								readonly={modalMode === 'view'}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 {modalMode ===
								'view'
									? 'bg-gray-50'
									: ''}"
							/>
						</div>

						<div>
							<label for="dis" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Division (Dis.)')}</label
							>
							{#if modalMode === 'view'}
								<input
									id="dis"
									type="text"
									value={selectedItem.dis}
									readonly
									class="w-full rounded-md border-gray-300 bg-gray-50 text-gray-600 shadow-sm"
								/>
							{:else}
								<select
									id="dis"
									name="dis"
									bind:value={selectedItem.dis}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								>
									<option value="-">{$t('- ไม่ระบุ -')}</option>
									{#each uniqueDivisions as val}
										<option value={val}>{val}</option>
									{/each}
								</select>
							{/if}
						</div>

						<div>
							<label for="section" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Section')}</label
							>
							{#if modalMode === 'view'}
								<input
									id="section"
									type="text"
									value={selectedItem.section}
									readonly
									class="w-full rounded-md border-gray-300 bg-gray-50 text-gray-600 shadow-sm"
								/>
							{:else}
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
							{/if}
						</div>

						<div>
							<label for="emp_group" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Group')}</label
							>
							{#if modalMode === 'view'}
								<input
									id="emp_group"
									type="text"
									value={selectedItem.emp_group}
									readonly
									class="w-full rounded-md border-gray-300 bg-gray-50 text-gray-600 shadow-sm"
								/>
							{:else}
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
							{/if}
						</div>

						<div>
							<label for="position_name" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Position')}</label
							>
							{#if modalMode === 'view'}
								<input
									id="position_name"
									type="text"
									value={selectedItem.position_name}
									readonly
									class="w-full rounded-md border-gray-300 bg-gray-50 text-gray-600 shadow-sm"
								/>
							{:else}
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
							{/if}
						</div>

						<div>
							<label for="project" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Project')}</label
							>
							{#if modalMode === 'view'}
								<input
									id="project"
									type="text"
									value={selectedItem.project}
									readonly
									class="w-full rounded-md border-gray-300 bg-gray-50 text-gray-600 shadow-sm"
								/>
							{:else}
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
							{/if}
						</div>

						<div>
							<label for="status" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Status')}</label
							>
							{#if modalMode === 'view'}
								<input
									id="status"
									type="text"
									value={selectedItem.status === 'Active' ? 'ทำงานอยู่' : 'ลาออก'}
									readonly
									class="w-full rounded-md border-gray-300 bg-gray-50 font-bold text-gray-700 shadow-sm"
								/>
							{:else}
								<select
									id="status"
									name="status"
									bind:value={selectedItem.status}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								>
									<option value="Active">{$t('ทำงานอยู่ (Active)')}</option>
									<option value="Resigned">{$t('ลาออก (Resigned)')}</option>
								</select>
							{/if}
						</div>
					</div>
				</form>
			</div>

			<div class="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
				<button
					type="button"
					onclick={closeModal}
					class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
				>
					{modalMode === 'view' ? $t('Close') : $t('Cancel')}
				</button>
				{#if modalMode === 'edit'}
					<button
						type="submit"
						form="employeeForm"
						disabled={isSaving}
						class="rounded-md bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-70"
					>
						{isSaving ? $t('Saving...') : $t('Save Changes')}
					</button>
				{/if}
			</div>
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
				>
					{$t('Cancel')}
				</button>
				<button
					type="submit"
					disabled={isDeleting}
					class="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-70"
				>
					{isDeleting ? $t('Deleting...') : $t('Confirm Delete')}
				</button>
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
				>
					{$t('Cancel')}
				</button>
				<button
					type="submit"
					disabled={isDeleting}
					class="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-70"
				>
					{isDeleting ? $t('Deleting...') : $t('Delete Selected')}
				</button>
			</form>
		</div>
	</div>
{/if}
