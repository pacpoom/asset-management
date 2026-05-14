<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { fade, slide } from 'svelte/transition';

	let { data, form } = $props();
	let leaves = $derived(data.leaves || []);
	let isSubmitting = $state(false);

	let leaveTypes = $derived(
		(data.leaveTypes || []).map((lt: any) => ({
			id: lt.leave_name_en,
			name: `${lt.leave_name_en} (${lt.leave_name_th})`
		}))
	);

	let empOptions = $derived(
		(data.employees || []).map((e: any) => ({
			value: e.emp_id,
			label: `${e.emp_id} : ${e.emp_name}`,
			name: e.emp_name
		}))
	);

	let sectionOptions = $derived([
		{ value: 'All', label: `-- ${$t('ทุกแผนก')} --` },
		...(data.sections || []).map((s: string) => ({ value: s, label: s }))
	]);
	let selectedSection = $state(
		data.sectionFilter && data.sectionFilter !== 'All'
			? { value: data.sectionFilter, label: data.sectionFilter }
			: { value: 'All', label: `-- ${$t('ทุกแผนก')} --` }
	);

	let showModal = $state(false);
	let isEditMode = $state(false);

	let showDeleteModal = $state(false);
	let leaveToDelete = $state<string | null>(null);

	let formData = $state({
		id: '',
		emp_id: '',
		leave_type: '',
		leave_date: '',
		end_date: '',
		remark: '',
		status: 'Pending',
		document_path: ''
	});
	let selectedEmp: any = $state(null);

	$effect(() => {
		if (!isEditMode && leaveTypes.length > 0 && !formData.leave_type) {
			formData.leave_type = leaveTypes[0].id;
		}
	});

	function openAddModal() {
		isEditMode = false;
		formData = {
			id: '',
			emp_id: '',
			leave_type: leaveTypes.length > 0 ? leaveTypes[0].id : '',
			leave_date: '',
			end_date: '',
			remark: '',
			status: 'Pending',
			document_path: ''
		};
		selectedEmp = null;
		showModal = true;
	}

	function openEditModal(leave: any) {
		isEditMode = true;

		formData = {
			id: leave.id || '',
			emp_id: leave.emp_id || '',
			leave_type: leave.leave_type
				? leave.leave_type.trim()
				: leaveTypes.length > 0
					? leaveTypes[0].id
					: '',
			leave_date: leave.leave_date ? new Date(leave.leave_date).toISOString().split('T')[0] : '',
			end_date: leave.end_date ? new Date(leave.end_date).toISOString().split('T')[0] : '',
			remark: leave.remark || '',
			status: leave.status || 'Pending',
			document_path: leave.document_path || ''
		};

		selectedEmp = empOptions.find((opt: any) => String(opt.value) === String(leave.emp_id)) || null;

		showModal = true;
	}

	function confirmDelete(id: string) {
		leaveToDelete = id;
		showDeleteModal = true;
	}

	let currentPage = $state(1);
	let itemsPerPage = $state(10);
	let totalPages = $derived(Math.ceil(leaves.length / itemsPerPage) || 1);
	let validPage = $derived(Math.min(currentPage, totalPages) || 1);
	let paginatedLeaves = $derived(
		leaves.slice((validPage - 1) * itemsPerPage, validPage * itemsPerPage)
	);
</script>

<svelte:head>
	<title>{$t('Leave Records')}</title>
</svelte:head>

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Leave Records')}</h1>
		<p class="mt-1 text-sm text-gray-500">
			{$t('จัดการประวัติการลา อัปโหลดเอกสารใบลา และตรวจสอบสถานะ')}
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		{#if form?.message}
			<span
				class="rounded-lg border border-gray-100 bg-white px-4 py-2 text-sm font-semibold {form.success
					? 'text-green-600'
					: 'text-red-600'}"
			>
				{form.message}
			</span>
		{/if}
		<button
			onclick={openAddModal}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
		>
			<span class="material-symbols-outlined text-[18px]">add</span>
			{$t('สร้างใบลาใหม่')}
		</button>
	</div>
</div>

<div class="mb-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
	<form method="GET" class="flex flex-wrap items-end gap-4">
		<div class="z-50 min-w-[200px] flex-1 sm:flex-none">
			<div class="mb-1 block text-sm font-medium text-gray-700">{$t('Section')}</div>
			<Select
				items={sectionOptions}
				bind:value={selectedSection}
				placeholder={$t('-- ทุกแผนก --')}
				container={browser ? document.body : null}
				class="svelte-select-custom"
			/>
			<input type="hidden" name="section" value={selectedSection?.value || 'All'} />
		</div>

		<div class="min-w-[250px] flex-1">
			<div class="mb-1 block text-sm font-medium text-gray-700">
				{$t('ค้นหารหัส / ชื่อพนักงาน')}
			</div>
			<input
				type="text"
				name="search"
				value={data.searchQuery}
				placeholder={$t('พิมพ์คำค้นหา...')}
				class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
			/>
		</div>
		<button
			type="submit"
			class="rounded-lg bg-gray-800 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
		>
			<span class="material-symbols-outlined mr-1 align-middle text-[18px]">search</span>
			{$t('Search')}
		</button>
	</form>
</div>

<div class="flex flex-col overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
	<div class="flex-1 overflow-x-auto">
		<table class="w-full min-w-[1000px] text-left text-sm text-gray-600">
			<thead class="border-b border-gray-100 bg-gray-50 text-xs text-gray-700 uppercase">
				<tr>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Date')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Emp ID')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Name')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Section / Group')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Type')}</th>
					<th class="px-4 py-3 whitespace-nowrap">{$t('Leave date')}</th>
					<th class="px-4 py-3 text-center whitespace-nowrap">{$t('Leave document')}</th>
					<th class="px-4 py-3 text-center whitespace-nowrap">{$t('Status')}</th>
					<th class="px-4 py-3 text-right whitespace-nowrap">{$t('Actions')}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-50">
				{#each paginatedLeaves as leave}
					<tr class="transition-colors hover:bg-gray-50">
						<td class="px-4 py-3 whitespace-nowrap"
							>{new Date(leave.created_at).toLocaleDateString('th-TH')}</td
						>
						<td class="px-4 py-3 font-mono text-gray-900">{leave.emp_id}</td>
						<td class="px-4 py-3 font-medium text-blue-700">{leave.emp_name}</td>
						<td class="px-4 py-3 text-xs"
							>{leave.section} <br /> <span class="text-gray-400">{leave.emp_group}</span></td
						>
						<td class="px-4 py-3 font-bold text-gray-800">{leave.leave_type}</td>
						<td class="px-4 py-3 text-xs">
							{new Date(leave.leave_date).toLocaleDateString('th-TH')} <br />
							{$t('ถึง')}
							{leave.end_date
								? new Date(leave.end_date).toLocaleDateString('th-TH')
								: new Date(leave.leave_date).toLocaleDateString('th-TH')}
						</td>
						<td class="px-4 py-3 text-center">
							{#if leave.document_path}
								<a
									href={leave.document_path}
									target="_blank"
									class="inline-flex items-center justify-center rounded-full bg-blue-50 p-1.5 text-blue-600 hover:bg-blue-100"
									title="ดูเอกสาร"
								>
									<span class="material-symbols-outlined text-[18px]">attachment</span>
								</a>
							{:else}
								<span class="text-gray-300">-</span>
							{/if}
						</td>
						<td class="px-4 py-3 text-center">
							<span
								class="rounded-full px-2.5 py-1 text-xs font-semibold {leave.status === 'Approved'
									? 'bg-green-100 text-green-700'
									: leave.status === 'Rejected'
										? 'bg-red-100 text-red-700'
										: 'bg-yellow-100 text-yellow-700'}"
							>
								{leave.status === 'Approved'
									? $t('อนุมัติแล้ว')
									: leave.status === 'Rejected'
										? $t('ไม่อนุมัติ')
										: $t('รอตรวจสอบ')}
							</span>
						</td>
						<td class="px-4 py-3 text-right">
							<div class="flex items-center justify-end gap-2">
								<button
									onclick={() => openEditModal(leave)}
									class="text-gray-400 transition-colors hover:text-blue-600"
									title="แก้ไข"
								>
									<span class="material-symbols-outlined text-[20px]">edit</span>
								</button>
								<button
									onclick={() => confirmDelete(leave.id)}
									class="text-gray-400 transition-colors hover:text-red-600"
									title="ลบ"
								>
									<span class="material-symbols-outlined text-[20px]">delete</span>
								</button>
							</div>
						</td>
					</tr>
				{/each}
				{#if leaves.length === 0}
					<tr
						><td colspan="9" class="px-4 py-8 text-center text-gray-500"
							>{$t('ไม่มีประวัติการลางาน')}</td
						></tr
					>
				{/if}
			</tbody>
		</table>
	</div>

	{#if leaves.length > 0}
		<div
			class="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3 sm:px-6"
		>
			<div class="flex flex-col gap-4 sm:flex-1 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-wrap items-center gap-4">
					<div class="flex items-center gap-2 text-sm text-gray-700">
						<span>{$t('Show')}:</span>
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
						{$t('แสดง')} <span class="font-medium">{(validPage - 1) * itemsPerPage + 1}</span>
						{$t('ถึง')}
						<span class="font-medium">{Math.min(validPage * itemsPerPage, leaves.length)}</span>
						{$t('From total')}
						<span class="font-medium">{leaves.length}</span>
						{$t('รายการ')}
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

{#if showModal}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm"
	>
		<div
			transition:slide={{ duration: 200 }}
			class="w-full max-w-2xl rounded-xl bg-white shadow-2xl"
		>
			<div class="flex items-center justify-between border-b border-gray-100 px-6 py-4">
				<h2 class="text-lg font-bold text-gray-800">
					{isEditMode ? $t('แก้ไขข้อมูลการลา') : $t('สร้างใบลาใหม่')}
				</h2>
				<button
					type="button"
					onclick={() => (showModal = false)}
					class="text-gray-400 hover:text-gray-600"
				>
					<span class="material-symbols-outlined">close</span>
				</button>
			</div>

			<form
				method="POST"
				action="?/saveLeave"
				enctype="multipart/form-data"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update }) => {
						await update();
						isSubmitting = false;
						showModal = false;
					};
				}}
				class="p-6"
			>
				<input type="hidden" name="id" value={formData.id} />
				<input type="hidden" name="existing_document_path" value={formData.document_path} />

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="sm:col-span-2">
						<div class="mb-1 block text-sm font-medium text-gray-700">
							{$t('พนักงานที่ต้องการลา')} *
						</div>
						<Select
							items={empOptions}
							bind:value={selectedEmp}
							placeholder={$t('พิมพ์ชื่อ หรือ รหัสพนักงาน...')}
							container={browser ? document.body : null}
							class="svelte-select-custom"
						/>
						<input
							type="hidden"
							name="emp_id"
							value={selectedEmp?.value || formData.emp_id}
							required
						/>
					</div>

					<div>
						<div class="mb-1 block text-sm font-medium text-gray-700">{$t('ประเภทการลา')} *</div>
						<select
							name="leave_type"
							bind:value={formData.leave_type}
							class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
							required
						>
							{#each leaveTypes as type}
								<option value={type.id}>{type.name}</option>
							{/each}
						</select>
					</div>

					<div>
						<div class="mb-1 block text-sm font-medium text-gray-700">{$t('สถานะ')}</div>
						<select
							name="status"
							bind:value={formData.status}
							class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
						>
							<option value="Pending">{$t('Pending')}</option>
							<option value="Approved">{$t('Approved')}</option>
							<option value="Rejected">{$t('Rejected')}</option>
						</select>
					</div>

					<div>
						<div class="mb-1 block text-sm font-medium text-gray-700">{$t('วันที่เริ่มลา')} *</div>
						<input
							type="date"
							name="leave_date"
							bind:value={formData.leave_date}
							class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
							required
						/>
					</div>

					<div>
						<div class="mb-1 block text-sm font-medium text-gray-700">{$t('ถึงวันที่')} *</div>
						<input
							type="date"
							name="end_date"
							bind:value={formData.end_date}
							class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
							required
						/>
					</div>

					<div class="sm:col-span-2">
						<div class="mb-1 block text-sm font-medium text-gray-700">{$t('เหตุผล/หมายเหตุ')}</div>
						<textarea
							name="remark"
							bind:value={formData.remark}
							rows="2"
							class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
							placeholder={$t('ระบุรายละเอียด...')}
						></textarea>
					</div>

					<div class="sm:col-span-2">
						<div class="mb-1 block text-sm font-medium text-gray-700">
							{$t('แนบไฟล์เอกสารใบลา (รูปภาพ หรือ PDF)')}
						</div>
						<input
							type="file"
							name="document"
							accept=".jpg,.jpeg,.png,.pdf"
							class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-semibold hover:file:bg-gray-200 focus:outline-none"
						/>
						{#if formData.document_path}
							<p class="mt-2 text-xs text-blue-600">
								📎 {$t('มีไฟล์แนบเดิมอยู่แล้ว')}
								<a href={formData.document_path} target="_blank" class="underline"
									>({$t('ดูไฟล์')})</a
								>
							</p>
						{/if}
					</div>
				</div>

				<div class="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-4">
					<button
						type="button"
						onclick={() => (showModal = false)}
						class="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
						>{$t('ยกเลิก')}</button
					>
					<button
						type="submit"
						disabled={isSubmitting}
						class="rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
					>
						{isSubmitting ? $t('กำลังบันทึก...') : $t('บันทึก')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if showDeleteModal}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm"
	>
		<div
			transition:slide={{ duration: 200 }}
			class="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl"
		>
			<div
				class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 shadow-inner"
			>
				<span class="material-symbols-outlined text-[32px]">delete_forever</span>
			</div>
			<h3 class="text-xl font-bold text-gray-900">{$t('ยืนยันการลบใบลา?')}</h3>
			<p class="mt-2 text-sm text-gray-500">
				{$t('คุณกำลังจะลบประวัติการลานี้ ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้')}
			</p>
			<form
				method="POST"
				action="?/deleteLeave"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						showDeleteModal = false;
					};
				}}
				class="mt-6 flex justify-center gap-3"
			>
				<input type="hidden" name="id" value={leaveToDelete} />
				<button
					type="button"
					onclick={() => (showDeleteModal = false)}
					class="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
				>
					{$t('ยกเลิก')}
				</button>
				<button
					type="submit"
					class="w-full rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-red-700"
				>
					{$t('ยืนยันการลบ')}
				</button>
			</form>
		</div>
	</div>
{/if}

<style>
	:global(div.svelte-select) {
		border-color: #d1d5db !important;
		border-radius: 0.5rem !important;
		min-height: 38px !important;
		background-color: white !important;
		font-size: 0.875rem !important;
	}
</style>
