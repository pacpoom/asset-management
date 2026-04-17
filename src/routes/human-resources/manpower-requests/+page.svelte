<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import { slide, fade } from 'svelte/transition';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	let { data, form } = $props();

	let requests = $derived(data.requests || []);
	let currentUserRole = $derived(data.user?.role || 'supervisor');

	let modalMode = $state<'create' | 'edit' | null>(null);
	let selectedItem = $state<any>({});

	let isReviewModalOpen = $state(false);
	let reviewModalItem = $state<any>({});

	let isDeleteModalOpen = $state(false);
	let itemToDelete = $state<any>({});

	// 🌟 เพิ่ม State สำหรับ Modal แจ้งเตือน Error
	let isErrorModalOpen = $state(false);
	let errorMessage = $state('');

	let isSubmitting = $state(false);
	let isDeleting = $state(false);

	let positionType = $state('Permanent');
	let reqNature = $state('Replacement');
	let needDrivingLicense = $state(false);
	let needOtherCert = $state(false);
	let certForklift = $state(false);
	let certSafety = $state(false);

	let actionStatusValue = $state('Approved');

	interface SelectOption {
		value: string;
		label: string;
	}

	let userOptions = $derived(
		data.usersList ? data.usersList.map((u: string) => ({ value: u, label: u })) : []
	);
	let divisionOptions = $derived(
		data.divisions ? data.divisions.map((d: string) => ({ value: d, label: d })) : []
	);
	let sectionOptions = $derived(
		data.sections ? data.sections.map((s: string) => ({ value: s, label: s })) : []
	);
	let groupOptions = $derived(
		data.groups ? data.groups.map((g: string) => ({ value: g, label: g })) : []
	);
	let positionOptions = $derived(
		data.positions ? data.positions.map((p: string) => ({ value: p, label: p })) : []
	);

	let selectedRequester: SelectOption | null = $state(null);
	let selectedDivision: SelectOption | null = $state(null);
	let selectedSection: SelectOption | null = $state(null);
	let selectedGroup: SelectOption | null = $state(null);
	let selectedPosition: SelectOption | null = $state(null);

	function openModal(mode: 'create' | 'edit', item: any = null) {
		modalMode = mode;
		if (mode === 'edit' && item) {
			selectedItem = { ...item };
			positionType = item.position_type || 'Permanent';
			reqNature = item.req_nature || 'Replacement';
			needDrivingLicense = !!item.cert_driving;
			needOtherCert = !!item.cert_other;
			certForklift = item.cert_forklift === 1;
			certSafety = item.cert_safety === 1;

			selectedItem.wage_type = item.wage_type || 'Monthly';
			selectedItem.budget_status = item.budget_status || 'In budget';
			selectedItem.edu_level = item.edu_level || "Master's";
			selectedItem.req_gender = item.req_gender || 'Not specified';

			if (selectedItem.target_date)
				selectedItem.target_date = new Date(selectedItem.target_date).toISOString().split('T')[0];
			if (selectedItem.replacement_resign_date)
				selectedItem.replacement_resign_date = new Date(selectedItem.replacement_resign_date)
					.toISOString()
					.split('T')[0];

			selectedRequester = item.requester_name
				? { value: item.requester_name, label: item.requester_name }
				: null;
			selectedDivision = item.division ? { value: item.division, label: item.division } : null;
			selectedSection = item.section ? { value: item.section, label: item.section } : null;
			selectedGroup = item.emp_group ? { value: item.emp_group, label: item.emp_group } : null;
			selectedPosition = item.position_name
				? { value: item.position_name, label: item.position_name }
				: null;
		} else {
			selectedItem = {
				request_qty: 1,
				wage_type: 'Monthly',
				budget_status: 'In budget',
				req_gender: 'Not specified',
				department: 'In-House Department'
			};
			positionType = 'Permanent';
			reqNature = 'Replacement';
			needDrivingLicense = false;
			needOtherCert = false;
			certForklift = false;
			certSafety = false;

			selectedRequester = null;
			selectedDivision = { value: 'In-House Department', label: 'In-House Department' };
			selectedSection = null;
			selectedGroup = null;
			selectedPosition = null;
		}
	}

	function closeModals() {
		modalMode = null;
		isReviewModalOpen = false;
		isDeleteModalOpen = false;
		isErrorModalOpen = false;
	}

	$effect(() => {
		if (form?.success) closeModals();
	});
</script>

<svelte:head>
	<title>{$t('Manpower Requests')}</title>
</svelte:head>

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Manpower Requests')}</h1>
		<p class="mt-1 text-sm text-gray-500">
			{$t('ใบขออัตรากำลังพนักงานรับเหมาแรงงาน (Outsource Requisition)')}
		</p>
	</div>
	<div class="flex flex-wrap items-center gap-3">
		{#if form?.message}
			<span class="text-sm font-semibold {form.success ? 'text-green-600' : 'text-red-600'}"
				>{$t(form.message)}</span
			>
		{/if}
		{#if currentUserRole === 'supervisor' || currentUserRole === 'admin'}
			<button
				type="button"
				onclick={() => openModal('create')}
				class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
			>
				<span class="material-symbols-outlined text-[18px]">add</span>
				{$t('สร้างใบขออัตรากำลัง')}
			</button>
		{/if}
	</div>
</div>

<div class="mb-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
	<form method="GET" class="flex flex-wrap items-end gap-4">
		<div class="w-48">
			<label for="statusFilter" class="mb-1 block text-sm font-medium text-gray-700"
				>{$t('สถานะ')}</label
			>
			<select
				id="statusFilter"
				name="status"
				value={data.statusFilter}
				class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
				onchange={(e) => e.currentTarget.form?.submit()}
			>
				<option value="All">{$t('ทั้งหมด')}</option>
				<option value="Pending Dept">{$t('รออนุมัติ (Dept)')}</option>
				<option value="Pending HR">{$t('รออนุมัติ (HR)')}</option>
				<option value="Approved">{$t('อนุมัติแล้ว (Approved)')}</option>
				<option value="Rejected">{$t('ไม่อนุมัติ (Rejected)')}</option>
			</select>
		</div>
		<div class="min-w-[250px] flex-1">
			<label for="searchInput" class="mb-1 block text-sm font-medium text-gray-700"
				>{$t('ค้นหาเลขที่ / แผนก / ตำแหน่ง')}</label
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
			class="rounded-lg bg-gray-800 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
			><span class="material-symbols-outlined mr-1 align-middle text-[18px]">search</span>
			{$t('ค้นหา')}</button
		>
	</form>
</div>

<div class="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
	<div class="overflow-x-auto">
		<table class="w-full min-w-[1200px] text-left text-sm text-gray-600">
			<thead class="border-b border-gray-100 bg-gray-50 text-xs text-gray-700 uppercase">
				<tr>
					<th class="px-4 py-3">{$t('Req. No.')}</th>
					<th class="px-4 py-3">{$t('วันที่ขอ')}</th>
					<th class="px-4 py-3">{$t('Section / ตำแหน่ง')}</th>
					<th class="px-4 py-3 text-center">{$t('จำนวน')}</th>
					<th class="px-4 py-3">{$t('เริ่มงานวันที่')}</th>
					<th class="px-4 py-3">{$t('ผู้ขอ')}</th>
					<th class="px-4 py-3 text-center">{$t('สถานะ')}</th>
					<th class="px-4 py-3 text-center">{$t('Actions')}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-50">
				{#each requests as req}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 font-mono font-bold text-blue-600">{req.request_no}</td>
						<td class="px-4 py-3">{new Date(req.request_date).toLocaleDateString('en-GB')}</td>
						<td class="px-4 py-3"
							><span class="font-medium text-gray-900">{req.section}</span><br /><span
								class="text-xs text-gray-500">{req.position_name}</span
							></td
						>
						<td class="px-4 py-3 text-center font-bold text-gray-900">{req.request_qty}</td>
						<td class="px-4 py-3 font-medium text-orange-600"
							>{new Date(req.target_date).toLocaleDateString('en-GB')}</td
						>
						<td class="px-4 py-3">{req.requester_name}</td>
						<td class="px-4 py-3 text-center">
							{#if req.status === 'Pending Dept'}
								<span class="rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800"
									>{$t('รออนุมัติ (Dept Mgr)')}</span
								>
							{:else if req.status === 'Pending HR'}
								<span class="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800"
									>{$t('รออนุมัติ (HR Mgr)')}</span
								>
							{:else if req.status === 'Approved'}
								<span class="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800"
									>{$t('อนุมัติแล้ว')}</span
								>
							{:else}
								<span class="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800"
									>{$t('ปฏิเสธ')}</span
								>
							{/if}
						</td>
						<td class="px-4 py-3 text-center whitespace-nowrap">
							<div class="flex items-center justify-center gap-2">
								<a
									href="/human-resources/manpower-requests/generate-pdf?id={req.id}"
									target="_blank"
									class="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-green-600"
									title={$t('Print PDF')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 20 20"
										fill="currentColor"
										class="h-5 w-5"
										><path
											fill-rule="evenodd"
											d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z"
											clip-rule="evenodd"
										/></svg
									>
								</a>

								<button
									type="button"
									onclick={() => {
										reviewModalItem = req;
										isReviewModalOpen = true;
										actionStatusValue = 'Approved';
									}}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
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
										><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle
											cx="12"
											cy="12"
											r="3"
										/></svg
									>
								</button>

								{#if (currentUserRole === 'supervisor' || currentUserRole === 'admin') && req.status === 'Pending Dept'}
									<button
										type="button"
										onclick={() => openModal('edit', req)}
										class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-yellow-600"
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
											><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
										>
									</button>
									<button
										type="button"
										onclick={() => {
											itemToDelete = req;
											isDeleteModalOpen = true;
										}}
										class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
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
											><path d="M3 6h18" /><path
												d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
											/></svg
										>
									</button>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

{#if modalMode}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div
			transition:slide={{ duration: 200 }}
			class="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
		>
			<div class="flex items-center justify-between border-b bg-gray-50 px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'edit'
						? `${$t('แก้ไขใบขออัตรากำลัง')}`
						: `${$t('สร้างใบขออัตรากำลังใหม่')}`}
				</h2>
				<button type="button" onclick={closeModals} class="text-gray-400 hover:text-gray-600"
					><span class="material-symbols-outlined">close</span></button
				>
			</div>
			<div class="overflow-y-auto bg-gray-50/50 p-6">
				<form
					id="createEditForm"
					method="POST"
					action="?/{modalMode === 'edit' ? 'editRequest' : 'createRequest'}"
					use:enhance={({ cancel }) => {
						if (
							!selectedRequester?.value ||
							!selectedSection?.value ||
							!selectedPosition?.value ||
							!selectedItem.request_qty ||
							!selectedItem.target_date
						) {
							errorMessage = 'กรุณากรอกข้อมูลที่จำเป็น (มีเครื่องหมาย *) ให้ครบถ้วน';
							isErrorModalOpen = true;
							cancel();
							return;
						}
						isSubmitting = true;
						return async ({ update }) => {
							await update();
							isSubmitting = false;
						};
					}}
					class="space-y-6"
				>
					{#if modalMode === 'edit'}<input type="hidden" name="id" value={selectedItem.id} />{/if}

					<div class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
						<h3 class="mb-4 border-b pb-2 text-sm font-bold text-gray-800 uppercase">
							1. {$t('ข้อมูลตำแหน่ง')} (Position Details)
						</h3>
						<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
							<div class="md:col-span-3">
								<div class="mb-1 block text-sm font-medium">
									{$t('ชื่อผู้ขอ')} (Supervisor) <span class="text-red-500">*</span>
								</div>
								<Select
									items={userOptions}
									bind:value={selectedRequester}
									placeholder={$t('ค้นหาชื่อผู้ขอ...')}
									container={browser ? document.body : null}
									class="svelte-select-custom"
								/>
								<input type="hidden" name="requester_name" value={selectedRequester?.value || ''} />
							</div>

							<div>
								<label for="department" class="mb-1 block text-sm font-medium"
									>DEPARTMENT / {$t('ฝ่าย')}</label
								>
								<input
									id="department"
									type="text"
									name="department"
									bind:value={selectedItem.department}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>

							<div>
								<div class="mb-1 block text-sm font-medium">Division / {$t('สังกัด')}</div>
								<Select
									items={divisionOptions}
									bind:value={selectedDivision}
									placeholder={$t('ค้นหาสังกัด...')}
									container={browser ? document.body : null}
									class="svelte-select-custom"
								/>
								<input type="hidden" name="division" value={selectedDivision?.value || ''} />
							</div>

							<div>
								<div class="mb-1 block text-sm font-medium">
									SECTION / {$t('แผนก')} <span class="text-red-500">*</span>
								</div>
								<Select
									items={sectionOptions}
									bind:value={selectedSection}
									placeholder={$t('ค้นหาแผนก...')}
									container={browser ? document.body : null}
									class="svelte-select-custom"
								/>
								<input type="hidden" name="section" value={selectedSection?.value || ''} />
							</div>

							<div>
								<div class="mb-1 block text-sm font-medium">Group / {$t('กลุ่มงาน')}</div>
								<Select
									items={groupOptions}
									bind:value={selectedGroup}
									placeholder={$t('ค้นหากลุ่มงาน...')}
									container={browser ? document.body : null}
									class="svelte-select-custom"
								/>
								<input type="hidden" name="emp_group" value={selectedGroup?.value || ''} />
							</div>

							<div>
								<div class="mb-1 block text-sm font-medium">
									POSITION / {$t('ตำแหน่ง')} <span class="text-red-500">*</span>
								</div>
								<Select
									items={positionOptions}
									bind:value={selectedPosition}
									placeholder={$t('ค้นหาตำแหน่ง...')}
									container={browser ? document.body : null}
									class="svelte-select-custom"
								/>
								<input type="hidden" name="position_name" value={selectedPosition?.value || ''} />
							</div>

							<div>
								<label for="report_to" class="mb-1 block text-sm font-medium"
									>Report to / {$t('รายงานตรงกับ')}</label
								>
								<input
									id="report_to"
									type="text"
									name="report_to"
									bind:value={selectedItem.report_to}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label for="request_qty" class="mb-1 block text-sm font-medium"
									>{$t('จำนวนที่ต้องการ (คน)')} <span class="text-red-500">*</span></label
								>
								<input
									id="request_qty"
									type="number"
									name="request_qty"
									min="1"
									bind:value={selectedItem.request_qty}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div class="md:col-span-2">
								<label for="target_date" class="mb-1 block text-sm font-medium"
									>DATE REQUIRED / {$t('เริ่มงานวันที่')} <span class="text-red-500">*</span></label
								>
								<input
									id="target_date"
									type="date"
									name="target_date"
									bind:value={selectedItem.target_date}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
						</div>
					</div>

					<div class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
						<h3 class="mb-4 border-b pb-2 text-sm font-bold text-gray-800 uppercase">
							2. {$t('ประเภทอัตราตำแหน่ง')} (Type of Position)
						</h3>
						<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
							<div class="space-y-2">
								<label class="flex cursor-pointer items-center gap-2"
									><input
										type="radio"
										name="position_type"
										value="Permanent"
										bind:group={positionType}
										class="text-blue-600 focus:ring-blue-500"
									/>
									{$t('ประจำ')} (Permanent)</label
								>
								<div class="flex items-center gap-2">
									<label class="flex cursor-pointer items-center gap-2 whitespace-nowrap"
										><input
											type="radio"
											name="position_type"
											value="Temporary"
											bind:group={positionType}
											class="text-blue-600 focus:ring-blue-500"
										/>
										{$t('ชั่วคราว')} (Temporary)</label
									>
									<input
										aria-label="ระยะเวลาชั่วคราว"
										type="text"
										name="position_period"
										bind:value={selectedItem.position_period}
										disabled={positionType !== 'Temporary'}
										placeholder={$t('ระบุระยะเวลา...')}
										class="w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
									/>
								</div>
							</div>
							<div class="space-y-2 border-l pl-6">
								<label class="flex cursor-pointer items-center gap-2"
									><input
										type="radio"
										name="wage_type"
										value="Monthly"
										bind:group={selectedItem.wage_type}
										class="text-blue-600 focus:ring-blue-500"
									/>
									{$t('รายเดือน')} (Monthly)</label
								>
								<label class="flex cursor-pointer items-center gap-2"
									><input
										type="radio"
										name="wage_type"
										value="Daily"
										bind:group={selectedItem.wage_type}
										class="text-blue-600 focus:ring-blue-500"
									/>
									{$t('รายวัน')} (Daily)</label
								>
							</div>
						</div>
					</div>

					<div class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
						<h3 class="mb-4 border-b pb-2 text-sm font-bold text-gray-800 uppercase">
							3. {$t('เสนอเพื่อขอ')} (Nature of Requirement)
						</h3>
						<div class="mb-4 flex gap-6">
							<label class="flex cursor-pointer items-center gap-2 font-medium"
								><input
									type="radio"
									name="budget_status"
									value="In budget"
									bind:group={selectedItem.budget_status}
									class="text-blue-600 focus:ring-blue-500"
								/>
								{$t('มีในงบประมาณ')} (In budget)</label
							>
							<label class="flex cursor-pointer items-center gap-2 font-medium"
								><input
									type="radio"
									name="budget_status"
									value="Not in budget"
									bind:group={selectedItem.budget_status}
									class="text-blue-600 focus:ring-blue-500"
								/>
								{$t('ไม่มีในงบ')} (Not in budget)</label
							>
						</div>

						<div class="space-y-4">
							<div
								class="rounded-md border p-4 {reqNature === 'Replacement'
									? 'border-blue-200 bg-blue-50/30'
									: 'border-gray-200'}"
							>
								<label class="mb-3 flex cursor-pointer items-center gap-2 font-bold text-gray-800"
									><input
										type="radio"
										name="req_nature"
										value="Replacement"
										bind:group={reqNature}
										class="text-blue-600 focus:ring-blue-500"
									/>
									{$t('ทดแทนตำแหน่งเดิม')} (Replacement)</label
								>
								<div class="grid grid-cols-1 gap-4 pl-6 md:grid-cols-2">
									<div>
										<label for="replacement_name" class="mb-1 block text-sm font-medium"
											>{$t('ชื่อพนักงานที่ออก')} (Name)</label
										><input
											id="replacement_name"
											type="text"
											name="replacement_name"
											bind:value={selectedItem.replacement_name}
											disabled={reqNature !== 'Replacement'}
											class="w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 disabled:bg-gray-100"
										/>
									</div>
									<div>
										<label for="replacement_resign_date" class="mb-1 block text-sm font-medium"
											>{$t('วันที่มีผลออก')} (Resign date)</label
										><input
											id="replacement_resign_date"
											type="date"
											name="replacement_resign_date"
											bind:value={selectedItem.replacement_resign_date}
											disabled={reqNature !== 'Replacement'}
											class="w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 disabled:bg-gray-100"
										/>
									</div>
									<div class="md:col-span-2">
										<label for="replacement_reason" class="mb-1 block text-sm font-medium"
											>{$t('เหตุผลที่ออก')} (Reason)</label
										><input
											id="replacement_reason"
											type="text"
											name="replacement_reason"
											bind:value={selectedItem.replacement_reason}
											disabled={reqNature !== 'Replacement'}
											class="w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 disabled:bg-gray-100"
										/>
									</div>
								</div>
							</div>

							<div
								class="rounded-md border p-4 {reqNature === 'Additional'
									? 'border-blue-200 bg-blue-50/30'
									: 'border-gray-200'}"
							>
								<label class="mb-3 flex cursor-pointer items-center gap-2 font-bold text-gray-800"
									><input
										type="radio"
										name="req_nature"
										value="Additional"
										bind:group={reqNature}
										class="text-blue-600 focus:ring-blue-500"
									/>
									{$t('เพิ่มตำแหน่งงานใหม่')} (Additional)</label
								>
								<div class="pl-6">
									<label for="additional_reason" class="mb-1 block text-sm font-medium"
										>{$t('เหตุผลที่เพิ่ม')} (Reason)</label
									><input
										id="additional_reason"
										type="text"
										name="additional_reason"
										bind:value={selectedItem.additional_reason}
										disabled={reqNature !== 'Additional'}
										class="w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 disabled:bg-gray-100"
									/>
								</div>
							</div>
						</div>
					</div>

					<div class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
						<h3 class="mb-4 border-b pb-2 text-sm font-bold text-gray-800 uppercase">
							4. {$t('ข้อมูลเพื่อการสรรหาว่าจ้าง')} (Information for Recruitment)
						</h3>
						<div class="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
							<div class="md:col-span-2">
								<span class="mb-2 block text-sm font-medium text-gray-700"
									>{$t('ระดับการศึกษา')} (Education)</span
								>
								<div class="flex flex-wrap gap-4 text-sm">
									<label class="flex cursor-pointer items-center gap-1"
										><input
											type="radio"
											name="edu_level"
											value="Master's"
											bind:group={selectedItem.edu_level}
											class="text-blue-600 focus:ring-blue-500"
										/>
										{$t('ป.โท')}</label
									>
									<label class="flex cursor-pointer items-center gap-1"
										><input
											type="radio"
											name="edu_level"
											value="Bachelor's"
											bind:group={selectedItem.edu_level}
											class="text-blue-600 focus:ring-blue-500"
										/>
										{$t('ป.ตรี')}</label
									>
									<label class="flex cursor-pointer items-center gap-1"
										><input
											type="radio"
											name="edu_level"
											value="Diploma"
											bind:group={selectedItem.edu_level}
											class="text-blue-600 focus:ring-blue-500"
										/>
										{$t('ปวส/อนุปริญญา')}</label
									>
									<label class="flex cursor-pointer items-center gap-1"
										><input
											type="radio"
											name="edu_level"
											value="Highschool"
											bind:group={selectedItem.edu_level}
											class="text-blue-600 focus:ring-blue-500"
										/>
										{$t('ปวช/ม.6')}</label
									>
									<label class="flex cursor-pointer items-center gap-1"
										><input
											type="radio"
											name="edu_level"
											value="Junior High school or below"
											bind:group={selectedItem.edu_level}
											class="text-blue-600 focus:ring-blue-500"
										/>
										{$t('ม.3 หรือต่ำกว่า')}</label
									>
								</div>
							</div>
							<div>
								<label for="req_age" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('อายุ')} (Age)</label
								><input
									id="req_age"
									type="text"
									name="req_age"
									bind:value={selectedItem.req_age}
									class="w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
									placeholder={$t('เช่น 20-35 ปี')}
								/>
							</div>
							<div>
								<label for="req_experience" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('ประสบการณ์')} (Experience)</label
								><input
									id="req_experience"
									type="text"
									name="req_experience"
									bind:value={selectedItem.req_experience}
									class="w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
									placeholder={$t('เช่น 1-2 ปี')}
								/>
							</div>
							<div>
								<label for="req_major" class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('สาขาวิชา')} (Major Field)</label
								><input
									id="req_major"
									type="text"
									name="req_major"
									bind:value={selectedItem.req_major}
									class="w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div>
								<span class="mb-2 block text-sm font-medium text-gray-700"
									>{$t('เพศ')} (Gender)</span
								>
								<div class="mt-2 flex gap-4 text-sm">
									<label class="flex cursor-pointer items-center gap-1"
										><input
											type="radio"
											name="req_gender"
											value="Male"
											bind:group={selectedItem.req_gender}
											class="text-blue-600 focus:ring-blue-500"
										/>
										{$t('ชาย')}</label
									>
									<label class="flex cursor-pointer items-center gap-1"
										><input
											type="radio"
											name="req_gender"
											value="Female"
											bind:group={selectedItem.req_gender}
											class="text-blue-600 focus:ring-blue-500"
										/>
										{$t('หญิง')}</label
									>
									<label class="flex cursor-pointer items-center gap-1"
										><input
											type="radio"
											name="req_gender"
											value="Not specified"
											bind:group={selectedItem.req_gender}
											class="text-blue-600 focus:ring-blue-500"
										/>
										{$t('ไม่ระบุ')}</label
									>
								</div>
							</div>
							<div class="mt-2 md:col-span-2">
								<span class="mb-2 block text-sm font-medium text-gray-700"
									>{$t('เอกสารที่ต้องมี')} (Required Certification)</span
								>
								<div
									class="grid grid-cols-1 gap-3 rounded border bg-gray-50 p-4 text-sm md:grid-cols-2"
								>
									<div class="flex items-center gap-2 whitespace-nowrap">
										<label class="flex cursor-pointer items-center gap-2"
											><input
												type="checkbox"
												bind:checked={needDrivingLicense}
												class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
											/>
											{$t('ใบขับขี่ประเภท')}</label
										>
										<input
											type="text"
											name="cert_driving"
											aria-label={$t('ประเภทใบขับขี่')}
											bind:value={selectedItem.cert_driving}
											disabled={!needDrivingLicense}
											class="w-full rounded border-gray-300 py-1 text-sm disabled:bg-gray-100"
										/>
									</div>
									<label class="flex cursor-pointer items-center gap-2"
										><input
											type="checkbox"
											name="cert_forklift"
											bind:checked={certForklift}
											value="1"
											class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										/>
										{$t('ใบอบรมขับรถโฟล์คลิฟต์')}</label
									>
									<label class="flex cursor-pointer items-center gap-2"
										><input
											type="checkbox"
											name="cert_safety"
											bind:checked={certSafety}
											value="1"
											class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										/>
										{$t('ใบอบรม จป.')}</label
									>
									<div class="flex items-center gap-2 whitespace-nowrap">
										<label class="flex cursor-pointer items-center gap-2"
											><input
												type="checkbox"
												bind:checked={needOtherCert}
												class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
											/>
											{$t('อื่นๆ')}</label
										>
										<input
											type="text"
											name="cert_other"
											aria-label={$t('เอกสารอื่นๆ')}
											bind:value={selectedItem.cert_other}
											disabled={!needOtherCert}
											class="w-full rounded border-gray-300 py-1 text-sm disabled:bg-gray-100"
										/>
									</div>
								</div>
							</div>
							<div class="md:col-span-2">
								<label
									for="other_qualifications"
									class="mb-1 block text-sm font-medium text-gray-700"
									>{$t('คุณสมบัติอื่นๆ')} (Other Qualifications)</label
								><textarea
									id="other_qualifications"
									name="other_qualifications"
									bind:value={selectedItem.other_qualifications}
									rows="2"
									class="w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
								></textarea>
							</div>
						</div>
					</div>
				</form>
			</div>
			<div class="flex justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4">
				<button
					type="button"
					onclick={closeModals}
					class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
					>{$t('Cancel')}</button
				>
				<button
					type="submit"
					form="createEditForm"
					disabled={isSubmitting}
					class="rounded-md bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-70"
				>
					{isSubmitting
						? $t('Saving...')
						: modalMode === 'edit'
							? $t('บันทึกการแก้ไข')
							: $t('ส่งใบขออัตรากำลัง')}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if isReviewModalOpen}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div
			transition:slide={{ duration: 200 }}
			class="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
		>
			<div class="flex items-center justify-between border-b bg-gray-50 px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{(reviewModalItem.status === 'Pending Dept' &&
						(currentUserRole === 'dept_manager' || currentUserRole === 'admin')) ||
					(reviewModalItem.status === 'Pending HR' &&
						(currentUserRole === 'hr_manager' || currentUserRole === 'admin'))
						? '' + $t('ตรวจสอบและอนุมัติ')
						: '' + $t('รายละเอียดใบขออัตรากำลัง')}
				</h2>
				<button type="button" onclick={closeModals} class="text-gray-400 hover:text-gray-600"
					><span class="material-symbols-outlined">close</span></button
				>
			</div>

			<div class="overflow-y-auto bg-gray-50/30 p-6">
				<div class="mb-6 flex items-start justify-between border-b-2 border-gray-800 pb-4">
					<div>
						<h1 class="text-xl font-black tracking-wider uppercase">Outsource Requisition Form</h1>
						<p class="text-sm font-medium text-gray-600">
							{$t('ใบขออัตรากำลังสำหรับพนักงานรับเหมาแรงงาน')}
						</p>
					</div>
					<div class="text-right">
						<p class="text-sm text-gray-500">{$t('Req.No. / เลขที่ใบขอ')}</p>
						<p class="font-mono text-lg font-bold text-blue-700">{reviewModalItem.request_no}</p>
					</div>
				</div>

				<div class="mb-6 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
					<div class="rounded border bg-white p-3 shadow-sm">
						<span class="block text-xs text-gray-500">Department / {$t('ฝ่าย')}</span><strong
							class="text-gray-800">{reviewModalItem.department || '-'}</strong
						>
					</div>
					<div class="rounded border bg-white p-3 shadow-sm">
						<span class="block text-xs text-gray-500">Division / {$t('สังกัด')}</span><strong
							class="text-gray-800">{reviewModalItem.division || '-'}</strong
						>
					</div>
					<div class="rounded border bg-white p-3 shadow-sm">
						<span class="block text-xs text-gray-500">Section / {$t('แผนก')}</span><strong
							class="text-gray-800">{reviewModalItem.section}</strong
						>
					</div>
					<div class="rounded border bg-white p-3 shadow-sm">
						<span class="block text-xs text-gray-500">Group / {$t('กลุ่มงาน')}</span><strong
							class="text-gray-800">{reviewModalItem.emp_group || '-'}</strong
						>
					</div>
					<div class="rounded border bg-white p-3 shadow-sm">
						<span class="block text-xs text-gray-500">Position / {$t('ตำแหน่ง')}</span><strong
							class="text-gray-800">{reviewModalItem.position_name}</strong
						>
					</div>
					<div class="rounded border bg-white p-3 shadow-sm">
						<span class="block text-xs text-gray-500">Report to / {$t('รายงานตรงกับ')}</span><strong
							class="text-gray-800">{reviewModalItem.report_to || '-'}</strong
						>
					</div>
					<div class="rounded border border-blue-200 bg-blue-50 p-3 shadow-sm">
						<span class="block text-xs font-bold text-blue-600">{$t('จำนวนที่ต้องการ')}</span
						><strong class="text-xl text-blue-800"
							>{reviewModalItem.request_qty}
							<span class="text-sm font-normal">{$t('คน')}</span></strong
						>
					</div>
					<div class="rounded border border-orange-200 bg-orange-50 p-3 shadow-sm">
						<span class="block text-xs font-bold text-orange-600">{$t('เริ่มงานวันที่')}</span>
						<strong class="text-lg text-orange-800">
							{reviewModalItem.target_date
								? new Date(reviewModalItem.target_date).toLocaleDateString('th-TH')
								: '-'}
						</strong>
					</div>
				</div>

				<div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
					<div class="space-y-4">
						<div class="rounded border bg-white p-4 shadow-sm">
							<h4 class="mb-2 text-xs font-bold text-gray-500 uppercase">
								{$t('ประเภทการจ้าง & งบประมาณ')}
							</h4>
							<ul class="space-y-2 text-sm">
								<li>
									<span
										class="material-symbols-outlined align-text-bottom text-[16px] text-green-500"
										>check_circle</span
									>
									<strong
										>{reviewModalItem.position_type === 'Permanent'
											? $t('ประจำ (Permanent)')
											: `${$t('ชั่วคราว (Temporary)')} - ${reviewModalItem.position_period}`}</strong
									>
								</li>
								<li>
									<span
										class="material-symbols-outlined align-text-bottom text-[16px] text-green-500"
										>check_circle</span
									> <strong>{$t('รับค่าจ้างแบบ')} {$t(reviewModalItem.wage_type)}</strong>
								</li>
								<li>
									<span
										class="material-symbols-outlined align-text-bottom text-[16px] text-green-500"
										>check_circle</span
									>
									<strong
										>{reviewModalItem.budget_status === 'In budget'
											? $t('มีในงบประมาณ (In budget)')
											: $t('ไม่มีในงบประมาณ (Not in budget)')}</strong
									>
								</li>
							</ul>
						</div>

						<div class="rounded border bg-white p-4 shadow-sm">
							<h4 class="mb-2 text-xs font-bold text-gray-500 uppercase">
								{$t('เสนอเพื่อขอ')} (Nature)
							</h4>
							{#if reviewModalItem.req_nature === 'Replacement'}
								<div class="rounded border border-blue-100 bg-blue-50 p-3 text-sm">
									<p class="mb-1 font-bold text-blue-800">{$t('ทดแทนตำแหน่งเดิม')}</p>
									<p>
										<strong>{$t('ชื่อคนออก')}:</strong>
										{reviewModalItem.replacement_name || '-'}
									</p>
									<p>
										<strong>{$t('มีผลวันที่')}:</strong>
										{reviewModalItem.replacement_resign_date
											? new Date(reviewModalItem.replacement_resign_date).toLocaleDateString(
													'th-TH'
												)
											: '-'}
									</p>
									<p>
										<strong>{$t('เหตุผล')}:</strong>
										{reviewModalItem.replacement_reason || '-'}
									</p>
								</div>
							{:else}
								<div class="rounded border border-purple-100 bg-purple-50 p-3 text-sm">
									<p class="mb-1 font-bold text-purple-800">{$t('เพิ่มตำแหน่งใหม่')}</p>
									<p><strong>{$t('เหตุผล')}:</strong> {reviewModalItem.additional_reason || '-'}</p>
								</div>
							{/if}
						</div>
					</div>

					<div class="rounded border bg-white p-4 shadow-sm">
						<h4 class="mb-3 text-xs font-bold text-gray-500 uppercase">
							{$t('ข้อมูลการสรรหา')} (Recruitment Info)
						</h4>
						<div class="space-y-3 text-sm">
							<div class="flex justify-between border-b pb-1">
								<span>{$t('การศึกษา')}:</span>
								<strong>{$t(reviewModalItem.edu_level) || '-'}</strong>
							</div>
							<div class="flex justify-between border-b pb-1">
								<span>{$t('อายุ (ปี)')}:</span> <strong>{reviewModalItem.req_age || '-'}</strong>
							</div>
							<div class="flex justify-between border-b pb-1">
								<span>{$t('ประสบการณ์')}:</span>
								<strong>{reviewModalItem.req_experience || '-'}</strong>
							</div>
							<div class="flex justify-between border-b pb-1">
								<span>{$t('สาขาวิชา')}:</span> <strong>{reviewModalItem.req_major || '-'}</strong>
							</div>
							<div class="flex justify-between border-b pb-1">
								<span>{$t('เพศ')}:</span>
								<strong
									>{reviewModalItem.req_gender === 'Male'
										? $t('ชาย')
										: reviewModalItem.req_gender === 'Female'
											? $t('หญิง')
											: $t('ไม่ระบุ')}</strong
								>
							</div>
							<div class="rounded bg-gray-50 p-2">
								<span class="mb-1 block text-xs text-gray-500">{$t('ใบรับรอง/เอกสาร')}:</span>
								{#if reviewModalItem.cert_driving}<p>
										✔️ {$t('ใบขับขี่')} ({reviewModalItem.cert_driving})
									</p>{/if}
								{#if reviewModalItem.cert_forklift === 1}<p>
										✔️ {$t('ใบอบรมขับรถโฟล์คลิฟต์')}
									</p>{/if}
								{#if reviewModalItem.cert_safety === 1}<p>✔️ {$t('ใบอบรม จป.')}</p>{/if}
								{#if reviewModalItem.cert_other}<p>
										✔️ {$t('อื่นๆ')} ({reviewModalItem.cert_other})
									</p>{/if}
								{#if !reviewModalItem.cert_driving && reviewModalItem.cert_forklift === 0 && reviewModalItem.cert_safety === 0 && !reviewModalItem.cert_other}<p
										class="text-gray-400"
									>
										- {$t('ไม่มี')} -
									</p>{/if}
							</div>
						</div>
					</div>
				</div>

				<div class="mt-6 grid grid-cols-1 gap-4 border-t border-gray-200 pt-6 md:grid-cols-3">
					<div
						class="relative overflow-hidden rounded-lg border bg-gray-50 p-4 text-center shadow-sm"
					>
						<div class="absolute top-0 left-0 h-1 w-full bg-gray-400"></div>
						<p class="mb-2 text-xs font-bold text-gray-500 uppercase">REQUESTED BY</p>
						<p class="text-lg font-bold text-gray-900">{reviewModalItem.requester_name}</p>
						<p class="text-sm text-gray-500">{$t('Supervisor')}</p>
						<p class="mt-2 text-xs text-gray-400">
							{reviewModalItem.request_date
								? new Date(reviewModalItem.request_date).toLocaleDateString('th-TH')
								: '-'}
						</p>
					</div>

					<div
						class="relative overflow-hidden rounded-lg border p-4 text-center shadow-sm {reviewModalItem.dept_manager_name
							? 'border-green-200 bg-green-50'
							: 'bg-gray-50'}"
					>
						<div
							class="absolute top-0 left-0 h-1 w-full {reviewModalItem.dept_manager_name
								? 'bg-green-500'
								: 'bg-yellow-400'}"
						></div>
						<p class="mb-2 text-xs font-bold text-gray-500 uppercase">APPROVED BY DEPARTMENT</p>
						{#if reviewModalItem.dept_manager_name}
							<p class="text-lg font-bold text-green-700">{reviewModalItem.dept_manager_name}</p>
							<p class="text-sm text-gray-600">{$t('Department Manager')}</p>
							<p class="mt-2 text-xs text-gray-500">
								{reviewModalItem.dept_manager_date
									? new Date(reviewModalItem.dept_manager_date).toLocaleDateString('th-TH')
									: '-'}
							</p>
							{#if reviewModalItem.dept_manager_remark}<p
									class="mt-2 border-t border-green-200 pt-1 text-xs text-gray-600 italic"
								>
									"{reviewModalItem.dept_manager_remark}"
								</p>{/if}
						{:else}
							<p class="mt-4 font-bold text-yellow-600">{$t('รอการอนุมัติ')}</p>
						{/if}
					</div>

					<div
						class="relative overflow-hidden rounded-lg border p-4 text-center shadow-sm {reviewModalItem.hr_manager_name
							? 'border-blue-200 bg-blue-50'
							: 'bg-gray-50'}"
					>
						<div
							class="absolute top-0 left-0 h-1 w-full {reviewModalItem.hr_manager_name
								? 'bg-blue-500'
								: 'bg-yellow-400'}"
						></div>
						<p class="mb-2 text-xs font-bold text-gray-500 uppercase">APPROVED BY HR</p>
						{#if reviewModalItem.hr_manager_name}
							<p class="text-lg font-bold text-blue-700">{reviewModalItem.hr_manager_name}</p>
							<p class="text-sm text-gray-600">{$t('HR Manager')}</p>
							<p class="mt-2 text-xs text-gray-500">
								{reviewModalItem.hr_manager_date
									? new Date(reviewModalItem.hr_manager_date).toLocaleDateString('th-TH')
									: '-'}
							</p>
							{#if reviewModalItem.hr_manager_remark}<p
									class="mt-2 border-t border-blue-200 pt-1 text-xs text-gray-600 italic"
								>
									"{reviewModalItem.hr_manager_remark}"
								</p>{/if}
						{:else}
							<p class="mt-4 font-bold text-yellow-600">{$t('รอการอนุมัติ')}</p>
						{/if}
					</div>
				</div>

				{#if (reviewModalItem.status === 'Pending Dept' && (currentUserRole === 'dept_manager' || currentUserRole === 'admin')) || (reviewModalItem.status === 'Pending HR' && (currentUserRole === 'hr_manager' || currentUserRole === 'admin'))}
					<form
						id="approveForm"
						method="POST"
						action="?/updateStatus"
						use:enhance={() => {
							isSubmitting = true;
							return async ({ update }) => {
								await update();
								isSubmitting = false;
							};
						}}
						class="mt-6 rounded-lg border-2 border-dashed border-blue-200 bg-white p-4"
					>
						<input type="hidden" name="id" value={reviewModalItem.id} />
						<label for="admin_remark" class="mb-1 block font-bold text-blue-800">
							{$t('ส่วนของผู้อนุมัติ')} ({currentUserRole === 'dept_manager' ||
							(currentUserRole === 'admin' && reviewModalItem.status === 'Pending Dept')
								? $t('Department Manager')
								: $t('HR Manager')})
						</label>
						<textarea
							id="admin_remark"
							name="remark"
							rows="2"
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							placeholder={$t('ระบุเหตุผล หรือ หมายเหตุถึงผู้ขอ (ถ้ามี)...')}
						></textarea>
					</form>
				{/if}
			</div>

			<div class="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-4">
				<button
					type="button"
					onclick={closeModals}
					class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
					>{$t('Close')}</button
				>

				{#if (reviewModalItem.status === 'Pending Dept' && (currentUserRole === 'dept_manager' || currentUserRole === 'admin')) || (reviewModalItem.status === 'Pending HR' && (currentUserRole === 'hr_manager' || currentUserRole === 'admin'))}
					<div class="flex gap-3">
						<button
							type="submit"
							form="approveForm"
							name="status"
							value="Rejected"
							disabled={isSubmitting}
							class="rounded-md border border-red-200 bg-red-50 px-6 py-2 text-sm font-bold text-red-700 shadow-sm transition-colors hover:bg-red-100"
							>{$t('Reject')}</button
						>
						<button
							type="submit"
							form="approveForm"
							name="status"
							value="Approved"
							disabled={isSubmitting}
							class="rounded-md bg-green-600 px-8 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-green-700"
							>{$t('Approve')}</button
						>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if isDeleteModalOpen}
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
				{$t('คุณต้องการลบใบขอกำลังคนเลขที่')} <br />
				<strong class="text-base text-gray-900">{itemToDelete.request_no}</strong>
				{$t('ใช่หรือไม่')}?
			</p>
			<form
				method="POST"
				action="?/deleteRequest"
				use:enhance={() => {
					isDeleting = true;
					return async ({ update }) => {
						await update();
						isDeleting = false;
					};
				}}
				class="mt-6 flex justify-center gap-3"
			>
				<input type="hidden" name="id" value={itemToDelete.id} />
				<button
					type="button"
					onclick={closeModals}
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

{#if isErrorModalOpen}
	<div
		class="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl">
			<div
				class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 text-yellow-600"
			>
				<span class="material-symbols-outlined text-[24px]">warning</span>
			</div>
			<h3 class="text-lg font-bold text-gray-900">{$t('ข้อมูลไม่ครบถ้วน')}</h3>
			<p class="mt-2 text-sm text-gray-600">{errorMessage}</p>
			<div class="mt-6 flex justify-center">
				<button
					type="button"
					onclick={() => (isErrorModalOpen = false)}
					class="w-full rounded-md bg-gray-800 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-gray-700"
					>{$t('ตกลง')}</button
				>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(div.svelte-select) {
		border-color: #d1d5db !important;
		border-radius: 0.375rem !important;
		min-height: 38px !important;
		background-color: white !important;
	}
	:global(div.svelte-select input) {
		font-size: 0.875rem !important;
	}
</style>
