<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import { slide, fade } from 'svelte/transition';

	let { data, form } = $props();

	let activeTab = $state<
		'division' | 'section' | 'position' | 'group' | 'project' | 'scanner' | 'leave_type'
	>('division');

	let scannerStatus = $state<Record<string, string>>({});

	async function checkScannerStatus(ip: string) {
		scannerStatus[ip] = 'checking...';
		try {
			const res = await fetch(`/api/scanner-status?ip=${ip}`);
			const data = await res.json();
			scannerStatus[ip] = data.online ? 'Online' : 'Offline';
		} catch (e) {
			scannerStatus[ip] = 'Offline';
		}
	}

	$effect(() => {
		if (activeTab === 'scanner') {
			currentData().forEach((item: any) => {
				if (item.ip_address && !scannerStatus[item.ip_address]) {
					checkScannerStatus(item.ip_address);
				}
			});
		}
	});

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedItem = $state<any>(null);
	let itemToDelete = $state<any>(null);
	let isSaving = $state(false);

	let currentData = $derived(() => {
		if (activeTab === 'section') return data.sections || [];
		if (activeTab === 'position') return data.positions || [];
		if (activeTab === 'group') return data.groups || [];
		if (activeTab === 'project') return data.projects || [];
		if (activeTab === 'scanner') return data.scanners || [];
		if (activeTab === 'leave_type') return data.leaveTypes || [];
		return data.divisions || [];
	});

	let dataList = $derived(currentData());
	let currentPage = $state(1);
	let itemsPerPage = $state(10);
	let totalPages = $derived(Math.ceil(dataList.length / itemsPerPage) || 1);
	let validPage = $derived(Math.min(currentPage, totalPages) || 1);

	let paginatedData = $derived(
		dataList.slice((validPage - 1) * itemsPerPage, validPage * itemsPerPage)
	);

	$effect(() => {
		activeTab;
		currentPage = 1;
	});

	function openModal(mode: 'add' | 'edit', item: any = null) {
		modalMode = mode;
		if (mode === 'edit') {
			selectedItem = {
				...item,
				name:
					item.division_name ||
					item.section_name ||
					item.position_name ||
					item.group_name ||
					item.project_name ||
					item.device_name ||
					item.leave_name_th,
				name_en: item.leave_name_en || '',
				ip_address: item.ip_address || '',
				department_id: item.department_id || '',
				status:
					item.status === 1 || item.status === 'Active' || item.is_active === 1
						? 'Active'
						: 'Inactive'
			};
		} else {
			selectedItem = {
				name: '',
				name_en: '',
				description: '',
				ip_address: '',
				department_id: '',
				status: 'Active'
			};
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
		}
	});
</script>

<svelte:head>
	<title>{$t('Master Data Management')}</title>
</svelte:head>

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<h1 class="text-2xl font-bold text-gray-800">{$t('Master Data Management')}</h1>
	<div class="flex items-center gap-3">
		{#if form?.message}
			<span class="text-sm font-semibold {form.success ? 'text-green-600' : 'text-red-600'}">
				{form.message}
			</span>
		{/if}
		<button
			onclick={() => openModal('add')}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500"
		>
			<span class="material-symbols-outlined text-[18px]">add</span>
			{$t('Add New')}
		</button>
	</div>
</div>

<div class="mb-6 flex overflow-x-auto border-b border-gray-200">
	<button
		onclick={() => (activeTab = 'division')}
		class="px-6 py-2 font-medium whitespace-nowrap {activeTab === 'division'
			? 'border-b-2 border-blue-600 text-blue-600'
			: 'text-gray-500 hover:text-blue-500'}">{$t('Divisions')}</button
	>
	<button
		onclick={() => (activeTab = 'section')}
		class="px-6 py-2 font-medium whitespace-nowrap {activeTab === 'section'
			? 'border-b-2 border-blue-600 text-blue-600'
			: 'text-gray-500 hover:text-blue-500'}">{$t('Sections')}</button
	>
	<button
		onclick={() => (activeTab = 'position')}
		class="px-6 py-2 font-medium whitespace-nowrap {activeTab === 'position'
			? 'border-b-2 border-blue-600 text-blue-600'
			: 'text-gray-500 hover:text-blue-500'}">{$t('Positions')}</button
	>
	<button
		onclick={() => (activeTab = 'group')}
		class="px-6 py-2 font-medium whitespace-nowrap {activeTab === 'group'
			? 'border-b-2 border-blue-600 text-blue-600'
			: 'text-gray-500 hover:text-blue-500'}">{$t('Groups')}</button
	>
	<button
		onclick={() => (activeTab = 'project')}
		class="px-6 py-2 font-medium whitespace-nowrap {activeTab === 'project'
			? 'border-b-2 border-blue-600 text-blue-600'
			: 'text-gray-500 hover:text-blue-500'}">{$t('Projects')}</button
	>
	<button
		onclick={() => (activeTab = 'scanner')}
		class="px-6 py-2 font-medium whitespace-nowrap {activeTab === 'scanner'
			? 'border-b-2 border-blue-600 text-blue-600'
			: 'text-gray-500 hover:text-blue-500'}">{$t('Scanners')}</button
	>

	<button
		onclick={() => (activeTab = 'leave_type')}
		class="px-6 py-2 font-medium whitespace-nowrap {activeTab === 'leave_type'
			? 'border-b-2 border-blue-600 text-blue-600'
			: 'text-gray-500 hover:text-blue-500'}">{$t('Leave Types')}</button
	>
</div>

<div class="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
	<div class="overflow-x-auto">
		<table class="w-full text-left text-sm text-gray-600">
			<thead class="border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-700 uppercase">
				<tr>
					<th class="px-6 py-4">{activeTab === 'leave_type' ? $t('Name') : $t('Name')}</th>
					<th class="px-6 py-4"
						>{activeTab === 'scanner'
							? 'IP Address'
							: activeTab === 'leave_type'
								? $t('Abbreviation')
								: $t('Description')}</th
					>

					{#if activeTab === 'scanner'}
						<th class="px-6 py-4 text-center">{$t('Responsible Dept')}</th>
						<th class="px-6 py-4 text-center">{$t('Last Sync')}</th>
					{/if}

					<th class="px-6 py-4 text-center">{$t('Status')}</th>
					<th class="px-6 py-4 text-center">{$t('Actions')}</th>
				</tr>
			</thead>
			<tbody>
				{#if paginatedData.length === 0}
					<tr>
						<td
							colspan={activeTab === 'scanner' ? 5 : 4}
							class="px-6 py-10 text-center text-gray-500"
						>
							{$t('No data found')}
						</td>
					</tr>
				{/if}
				{#each paginatedData as item}
					<tr class="border-b border-gray-50 transition-colors hover:bg-gray-50">
						<td class="px-6 py-4 font-bold text-gray-900">
							{item.division_name ||
								item.section_name ||
								item.position_name ||
								item.group_name ||
								item.project_name ||
								item.device_name ||
								item.leave_name_th}
						</td>

						<td class="px-6 py-4 text-gray-500">
							{activeTab === 'scanner'
								? item.ip_address
								: activeTab === 'leave_type'
									? item.leave_name_en
									: item.description || '-'}
						</td>

						{#if activeTab === 'scanner'}
							<td class="px-6 py-4 text-center whitespace-nowrap">
								{#if item.department_id}
									{@const dept = data.departments.find((d: any) => d.id === item.department_id)}
									<span
										class="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-700/10 ring-inset"
									>
										{dept ? dept.name : 'Unknown'}
									</span>
								{:else}
									<span class="text-xs text-gray-400">{$t('ส่วนกลาง')}</span>
								{/if}
							</td>
							<td class="px-6 py-4 text-center font-mono text-sm text-gray-500">
								{#if item.last_sync}
									{@const d = new Date(item.last_sync)}
									{@const dd = String(d.getDate()).padStart(2, '0')}
									{@const mm = String(d.getMonth() + 1).padStart(2, '0')}
									{@const yyyy = d.getFullYear()}
									{@const time = d.toLocaleTimeString('th-TH', {
										hour: '2-digit',
										minute: '2-digit'
									})}
									<span class="font-medium text-gray-800">{dd}/{mm}/{yyyy}</span>
									<span class="text-xs">{time}</span>
								{:else}
									-
								{/if}
							</td>
						{/if}

						<td class="px-6 py-4 text-center">
							{#if activeTab === 'scanner'}
								{#if scannerStatus[item.ip_address] === 'checking...'}
									<span
										class="animate-pulse rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500"
									>
										Checking...
									</span>
								{:else if scannerStatus[item.ip_address] === 'Online'}
									<span
										class="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700"
									>
										<div class="h-1.5 w-1.5 rounded-full bg-green-500"></div>
										Online
									</span>
								{:else}
									<span
										class="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700"
									>
										<div class="h-1.5 w-1.5 rounded-full bg-red-500"></div>
										Offline
									</span>
								{/if}
							{:else}
								<span
									class="rounded-full px-2.5 py-1 text-xs font-semibold {item.status === 'Active' ||
									item.status === 1 ||
									item.is_active === 1
										? 'bg-green-100 text-green-700'
										: 'bg-red-100 text-red-700'}"
								>
									{item.status === 'Active' || item.status === 1 || item.is_active === 1
										? 'Active'
										: 'Inactive'}
								</span>
							{/if}
						</td>

						<td class="px-6 py-4 text-center">
							<div class="flex items-center justify-center gap-2">
								<button
									onclick={() => openModal('edit', item)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
									><span class="material-symbols-outlined text-[20px]">edit</span></button
								>
								<button
									onclick={() => (itemToDelete = item)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
									><span class="material-symbols-outlined text-[20px]">delete</span></button
								>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if dataList.length > 0}
		<div
			class="mt-auto flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3 sm:px-6"
		>
			<div class="flex flex-col gap-4 sm:flex-1 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-wrap items-center gap-4">
					<div class="flex items-center gap-2 text-sm text-gray-700">
						<span>{$t('Showing')}:</span>
						<select
							aria-label="Items per page"
							bind:value={itemsPerPage}
							onchange={() => (currentPage = 1)}
							class="w-20 cursor-pointer rounded border border-gray-300 bg-white py-1 pr-8 pl-3 text-sm font-medium focus:border-blue-500 focus:outline-none"
						>
							<option value={10}>10</option>
							<option value={50}>50</option>
							<option value={100}>100</option>
						</select>
					</div>
					<p class="hidden text-sm text-gray-700 md:block">
						{$t('Show')} <span class="font-medium">{(validPage - 1) * itemsPerPage + 1}</span>
						{$t('to')}
						<span class="font-medium">{Math.min(validPage * itemsPerPage, dataList.length)}</span>
						{$t('From total')}
						<span class="font-medium">{dataList.length}</span>
						{$t('Item')}
					</p>
				</div>
				<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
					<button
						aria-label="ก่อนหน้า"
						onclick={() => (currentPage = validPage - 1)}
						disabled={validPage === 1}
						class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50"
					>
						<span class="material-symbols-outlined text-[18px]">chevron_left</span>
					</button>
					<span
						class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 ring-inset"
						>{validPage} / {totalPages}</span
					>
					<button
						aria-label="ถัดไป"
						onclick={() => (currentPage = validPage + 1)}
						disabled={validPage === totalPages}
						class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50"
					>
						<span class="material-symbols-outlined text-[18px]">chevron_right</span>
					</button>
				</nav>
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
			class="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl"
		>
			<div class="flex items-center justify-between border-b bg-gray-50 px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? $t('Add New') : $t('Edit')}
					{activeTab.toUpperCase()}
				</h2>
				<button onclick={closeModal} class="text-gray-400 hover:text-gray-600"
					><span class="material-symbols-outlined">close</span></button
				>
			</div>
			<div class="p-6">
				<form
					id="masterForm"
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
					<input type="hidden" name="id" value={selectedItem.id || ''} />
					<input type="hidden" name="tab" value={activeTab} />
					<div class="space-y-4">
						<div>
							<label for="name" class="mb-1 block text-sm font-semibold text-gray-700">
								{activeTab === 'leave_type'
									? 'ชื่อภาษาไทย'
									: activeTab === 'scanner'
										? 'Device Name (ชื่อจุดสแกน)'
										: $t('Name')}
							</label>
							<input
								name="name"
								type="text"
								bind:value={selectedItem.name}
								required
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>

						{#if activeTab === 'scanner'}
							<div>
								<label for="ip_address" class="mb-1 block text-sm font-semibold text-gray-700"
									>IP Address <span class="text-red-500">*</span></label
								>
								<input
									name="ip_address"
									type="text"
									bind:value={selectedItem.ip_address}
									required
									placeholder="ex. 192.168.1.100"
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<div>
								<label for="department_id" class="mb-1 block text-sm font-semibold text-gray-700"
									>แผนกที่ดูแลเครื่องนี้ (Department)</label
								>
								<select
									name="department_id"
									bind:value={selectedItem.department_id}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								>
									<option value="">-- เป็นของส่วนกลาง (Admin ทุกคนเห็น) --</option>
									{#if data.departments}
										{#each data.departments as dept}
											<option value={dept.id}>{dept.name}</option>
										{/each}
									{/if}
								</select>
							</div>
						{:else if activeTab === 'leave_type'}
							<div>
								<label for="name_en" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('ตัวย่อ')}</label
								>
								<input
									name="name_en"
									type="text"
									bind:value={selectedItem.name_en}
									required
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
						{:else}
							<div>
								<label for="description" class="mb-1 block text-sm font-semibold text-gray-700"
									>{$t('Description')}</label
								>
								<textarea
									name="description"
									bind:value={selectedItem.description}
									rows="3"
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								></textarea>
							</div>
						{/if}

						<div>
							<label for="status" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Status')}</label
							>
							<select
								name="status"
								bind:value={selectedItem.status}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							>
								<option value="Active">Active</option>
								<option value="Inactive">Inactive</option>
							</select>
						</div>
					</div>
				</form>
			</div>
			<div class="flex justify-end gap-3 border-t bg-gray-50 px-6 py-4">
				<button onclick={closeModal} class="rounded-md border px-4 py-2 text-sm"
					>{$t('Cancel')}</button
				>
				<button
					type="submit"
					form="masterForm"
					disabled={isSaving}
					class="rounded-md bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
				>
					{isSaving ? $t('Saving...') : $t('Save Changes')}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if itemToDelete}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl">
			<h3 class="text-lg font-bold">{$t('Confirm Delete')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				คุณต้องการลบ <strong
					>{itemToDelete.division_name ||
						itemToDelete.section_name ||
						itemToDelete.position_name ||
						itemToDelete.group_name ||
						itemToDelete.project_name ||
						itemToDelete.device_name ||
						itemToDelete.leave_name_th}</strong
				> ใช่หรือไม่?
			</p>
			<form method="POST" action="?/delete" use:enhance class="mt-6 flex justify-center gap-3">
				<input type="hidden" name="id" value={itemToDelete.id} />
				<input type="hidden" name="tab" value={activeTab} />
				<button
					type="button"
					onclick={() => (itemToDelete = null)}
					class="w-full rounded-md border py-2 text-sm">{$t('Cancel')}</button
				>
				<button type="submit" class="w-full rounded-md bg-red-600 py-2 text-sm font-bold text-white"
					>{$t('Confirm')}</button
				>
			</form>
		</div>
	</div>
{/if}
