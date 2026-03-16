<script lang="ts">
	import { enhance } from '$app/forms';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { t } from '$lib/i18n';

	export let data;
	$: checklists = data.checklists || [];
	$: masters = data.masters || [];
	$: allDetails = data.details || [];
	$: defectOptions = (data.masterDefects || []).map((d: any) => ({ value: d.name, label: d.name }));
	$: solutionOptions = (data.masterSolutions || []).map((s: any) => ({
		value: s.name,
		label: s.name
	}));
	$: positionOptions = (data.masterParts || []).map((p: any) => ({
		value: p.position ? `${p.name} (${p.position})` : p.name,
		label: p.position ? `${p.name} (${p.position})` : p.name
	}));

	let selectedPosition: any = null;
	let showInspectionModal = false;
	let showNgModal = false;
	let isSaving = false;

	let showDeleteModal = false;
	let itemToDelete: any = null;
	let isDeleting = false;

	function confirmDelete(item: any) {
		itemToDelete = item;
		showDeleteModal = true;
	}

	let formVin = '';
	let formModel = '';
	let formColor = '';
	let formSoc = '';
	let formMile = '';
	let selectedVinObj: any = null;

	// 🌟 ฟังก์ชันดึงข้อมูล VIN และตรวจสอบ Exact Match สำหรับ Scanner
	async function loadVinOptions(filterText: string) {
		if (!filterText || filterText.length < 3) return Promise.resolve([]);
		try {
			const res = await fetch(`/api/vehicle-lookup?q=${filterText}`);
			const data = await res.json();

			if (Array.isArray(data)) {
				const options = data.map((v: any) => ({
					value: v.vin_number,
					label: v.vin_number,
					model: v.model,
					color: v.color
				}));

				const exactMatch = options.find(
					(opt) => opt.value.toUpperCase() === filterText.toUpperCase()
				);

				if (exactMatch) {
					formVin = exactMatch.value;
					formModel = exactMatch.model || '';
					formColor = exactMatch.color || '';
					selectedVinObj = exactMatch;
				}

				return options;
			}
			return [];
		} catch (e) {
			console.error(e);
			return [];
		}
	}

	function handleVinSelect(event: any) {
		const selected = event.detail;
		if (selected) {
			formVin = selected.value;
			formModel = selected.model || '';
			formColor = selected.color || '';
		} else {
			formVin = '';
			formModel = '';
			formColor = '';
		}
	}

	let selectedMasterId: number | null = null;
	$: currentChecklist = allDetails.filter((d: any) => {
		const dbWorkId = d.work_id || d.Work_id || d.WORK_ID;
		return String(dbWorkId) === String(selectedMasterId);
	});

	let checkStatus: Record<number, 'OK' | 'NG'> = {};
	let ngData: Record<number, any> = {};
	let zoomFileInput: HTMLInputElement;
	let farFileInput: HTMLInputElement;

	$: checkedCount = Object.keys(checkStatus).length;
	$: totalCount = allDetails.length;
	$: progressPercent = totalCount === 0 ? 0 : Math.round((checkedCount / totalCount) * 100);

	let activeNgItem: any = null;
	let formPosition = '';
	let selectedDefect: any = null;
	let formDefectName = '';
	let selectedSolution: any = null;
	let formSolutionName = '';

	function formatDate(dateStr: string) {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleString('th-TH', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function markOk(itemId: number) {
		checkStatus[itemId] = 'OK';
		checkStatus = { ...checkStatus };
		if (ngData[itemId]) {
			delete ngData[itemId];
			ngData = { ...ngData };
		}
	}

	function openNgModal(item: any) {
		activeNgItem = item;
		const existing = ngData[item.id] || {};
		formPosition = existing.position || '';
		selectedPosition = formPosition ? { value: formPosition, label: formPosition } : null;
		formDefectName = existing.defect || '';
		selectedDefect = formDefectName ? { value: formDefectName, label: formDefectName } : null;
		formSolutionName = existing.solution || '';
		selectedSolution = formSolutionName
			? { value: formSolutionName, label: formSolutionName }
			: null;
		showNgModal = true;
	}

	function saveNgLocal() {
		const zoomFile = zoomFileInput?.files?.[0];
		const farFile = farFileInput?.files?.[0];

		ngData[activeNgItem.id] = {
			parts_name: activeNgItem.work_name,
			position: formPosition,
			defect: formDefectName,
			solution: formSolutionName,
			zoomFile: zoomFile || ngData[activeNgItem.id]?.zoomFile,
			farFile: farFile || ngData[activeNgItem.id]?.farFile
		};
		checkStatus[activeNgItem.id] = 'NG';
		checkStatus = { ...checkStatus };
		showNgModal = false;
	}

	async function submitFullPdi() {
		if (checkedCount < totalCount) {
			customAlert(
				'ข้อมูลไม่ครบถ้วน',
				`กรุณาตรวจสอบให้ครบทุกข้อ (คุณทำไปแล้ว ${checkedCount}/${totalCount} ข้อ)`,
				'warning'
			);
			return;
		}

		isSaving = true;
		const formData = new FormData();
		formData.append('vin_no', formVin);
		formData.append('model', formModel);
		formData.append('color', formColor);
		formData.append('soc', formSoc.toString());
		formData.append('mile', formMile.toString());

		const pdiData = allDetails.map((d: any) => {
			const status = checkStatus[d.id];
			const ng = status === 'NG' ? ngData[d.id] : {};

			if (status === 'NG') {
				if (ng.zoomFile) formData.append(`img_zoom_${d.id}`, ng.zoomFile);
				if (ng.farFile) formData.append(`img_far_${d.id}`, ng.farFile);
			}

			return {
				work_detail_id: d.id,
				work_name: d.work_name,
				parts_name: status === 'NG' ? d.work_name : d.work_name,
				status: status,
				position: ng.position || '',
				defect: ng.defect || '',
				solution: ng.solution || ''
			};
		});

		formData.append('pdi_data', JSON.stringify(pdiData));

		try {
			const res = await fetch('?/submit_pdi', { method: 'POST', body: formData });
			const result = JSON.parse(await res.text());
			if (result.type === 'success' || res.ok) {
				customAlert('สำเร็จ!', 'บันทึกข้อมูล PDI เรียบร้อยแล้ว', 'success', () => {
					window.location.reload();
				});
			} else {
				customAlert('เกิดข้อผิดพลาด', 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
			}
		} catch (e) {
			console.error(e);
			customAlert('เชื่อมต่อล้มเหลว', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
		} finally {
			isSaving = false;
		}
	}

	function startNewInspection() {
		formVin = '';
		formModel = '';
		formColor = '';
		formSoc = '';
		formMile = '';
		selectedVinObj = null;
		selectedMasterId = masters.length > 0 ? masters[0].id : null;
		checkStatus = {};
		ngData = {};
		showInspectionModal = true;
	}

	let showAlertModal = false;
	let alertTitle = '';
	let alertMessage = '';
	let alertType: 'success' | 'warning' | 'error' = 'success';
	let onAlertClose: (() => void) | null = null;

	function customAlert(
		title: string,
		message: string,
		type: 'success' | 'warning' | 'error',
		onClose: (() => void) | null = null
	) {
		alertTitle = title;
		alertMessage = message;
		alertType = type;
		onAlertClose = onClose;
		showAlertModal = true;
	}

	function closeAlertModal() {
		showAlertModal = false;
		if (onAlertClose) {
			onAlertClose();
			onAlertClose = null;
		}
	}
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/svelte-select@latest/dist/stylesheet.css" />
</svelte:head>

<div class="mb-6 flex flex-col gap-4 p-6 pb-0 md:flex-row md:items-center md:justify-between">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">
			{$t('NC Tracking (Defect Logs)') || 'NC Tracking (รายการปัญหา)'}
		</h1>
		<p class="text-sm text-gray-500">ประวัติการตรวจสอบพบปัญหา (Defect Logs)</p>
	</div>
	<button
		on:click={startNewInspection}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-bold text-white shadow-md transition hover:bg-blue-700"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			><path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
			/></svg
		>
		{$t('Start Inspection') || 'เริ่มตรวจรถ (Start Inspection)'}
	</button>
</div>

<div class="p-6 pt-0">
	<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-50 text-gray-700">
				<tr>
					<th class="px-4 py-3 text-left">{$t('Date') || 'วันที่'}</th>
					<th class="px-4 py-3 text-left"
						>{$t('Vehicle (VIN / Model)') || 'ข้อมูลรถ (VIN / รุ่น)'}</th
					>
					<th class="px-4 py-3 text-left">{$t('Result') || 'ผลการตรวจสอบ'}</th>
					<th class="px-4 py-3 text-center">{$t('Action') || 'จัดการ'}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#if checklists.length === 0}
					<tr><td colspan="4" class="py-10 text-center text-gray-500">ไม่พบข้อมูลปัญหา</td></tr>
				{:else}
					{#each checklists as item}
						<tr class="transition-colors hover:bg-gray-50">
							<td class="px-4 py-3 font-medium text-gray-600">
								{formatDate(item.created_at)}
							</td>

							<td class="px-4 py-3">
								<div class="font-mono font-bold text-blue-700">{item.vin_no}</div>
								<div class="text-xs text-gray-500">{item.model} • {item.color}</div>
							</td>

							<td class="px-4 py-3">
								{#if item.ng_count > 0}
									<div class="flex flex-col gap-1">
										<span
											class="inline-flex w-fit items-center rounded-full border border-red-200 bg-red-100 px-3 py-1 text-xs font-bold text-red-700"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="mr-1 h-3 w-3"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													fill-rule="evenodd"
													d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
													clip-rule="evenodd"
												/>
											</svg>
											พบปัญหา {item.ng_count} รายการ
										</span>
									</div>
								{:else}
									<span
										class="inline-flex items-center rounded-full border border-green-200 bg-green-100 px-3 py-1 text-xs font-bold text-green-700"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="mr-1 h-3 w-3"
											viewBox="0 0 20 20"
											fill="currentColor"
										>
											<path
												fill-rule="evenodd"
												d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
												clip-rule="evenodd"
											/>
										</svg>
										ผ่านทั้งหมด (All OK)
									</span>
								{/if}
							</td>

							<td class="px-4 py-4 text-center align-middle">
								<div class="flex justify-center gap-2">
									<a
										href="/nc-tracking/{item.id}"
										class="text-gray-400 transition-colors hover:text-blue-600"
										title={$t('View Details') || 'ดูรายละเอียด'}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="h-5 w-5"
										>
											<path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
											<path
												fill-rule="evenodd"
												d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 8.142 1.987 10.336 5.404.347.526.347 1.186 0 1.712C18.142 14.013 14.257 16 10 16c-4.257 0-8.142-1.987-10.336-5.404zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
												clip-rule="evenodd"
											/>
										</svg>
									</a>

									<a
										href="/nc-tracking/generate-pdf?id={item.id}"
										target="_blank"
										rel="noopener noreferrer"
										class="text-gray-400 transition-colors hover:text-green-600"
										title={$t('Print PDF') || 'พิมพ์ PDF'}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="h-5 w-5"
										>
											<path
												fill-rule="evenodd"
												d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z"
												clip-rule="evenodd"
											/>
										</svg>
									</a>

									<a
										href="/nc-tracking/{item.id}/edit"
										class="text-gray-400 transition-colors hover:text-yellow-600"
										title={$t('Edit') || 'แก้ไข'}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="h-5 w-5"
										>
											<path
												d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
											/>
										</svg>
									</a>

									<button
										type="button"
										on:click={() => confirmDelete(item)}
										class="text-gray-400 transition-colors hover:text-red-600"
										title={$t('Delete') || 'ลบ'}
										aria-label="ลบ"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="h-5 w-5"
										>
											<path
												fill-rule="evenodd"
												d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
												clip-rule="evenodd"
											/>
										</svg>
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

{#if showInspectionModal}
	<div class="fixed inset-0 z-40 flex flex-col bg-gray-100">
		<div class="flex items-center justify-between bg-blue-700 px-6 py-4 text-white shadow-md">
			<div>
				<h2 class="text-xl font-bold">แบบฟอร์มตรวจสอบรถยนต์ (PDI Checklist)</h2>
				<p class="text-sm text-blue-200">ตรวจสอบรถก่อนส่งมอบ และบันทึกปัญหา</p>
			</div>
			<button
				on:click={() => (showInspectionModal = false)}
				class="rounded-lg bg-blue-800 px-4 py-2 font-bold transition hover:bg-blue-900"
			>
				ปิด / ย้ายออก
			</button>
		</div>

		<div class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 overflow-auto p-6 pb-24">
			<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
				<h3 class="mb-4 border-b pb-2 text-lg font-bold text-gray-800">
					1. ข้อมูลรถยนต์ (Vehicle Info)
				</h3>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-6">
					<div class="md:col-span-2">
						<label for="vin_no_input" class="mb-1 block text-sm font-bold text-gray-700"
							>เลขตัวถัง (VIN No.) <span class="text-red-500">*</span></label
						>
						<Select
							id="vin_no_input"
							loadOptions={loadVinOptions}
							bind:value={selectedVinObj}
							on:change={handleVinSelect}
							on:clear={handleVinSelect}
							placeholder="พิมพ์หา VIN (อย่างน้อย 3 ตัว)..."
							container={browser ? document.body : null}
							class="w-full"
						>
							<div slot="item" let:item class="py-1">
								<div class="font-mono font-bold text-blue-700">{item.label}</div>
								<div class="text-xs text-gray-500">{item.model} • {item.color}</div>
							</div>
						</Select>
					</div>
					<div>
						<label for="model_input" class="mb-1 block text-sm font-bold text-gray-700"
							>รุ่น (Model)</label
						>
						<input
							id="model_input"
							type="text"
							bind:value={formModel}
							class="w-full rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-gray-600"
							readonly
						/>
					</div>
					<div>
						<label for="color_input" class="mb-1 block text-sm font-bold text-gray-700"
							>สี (Color)</label
						>
						<input
							id="color_input"
							type="text"
							bind:value={formColor}
							class="w-full rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-gray-600"
							readonly
						/>
					</div>
					<div>
						<label for="soc_input" class="mb-1 block text-sm font-bold text-gray-700"
							>แบต / SOC (%)</label
						>
						<input
							id="soc_input"
							type="number"
							bind:value={formSoc}
							class="w-full rounded-lg border border-gray-300 p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
							placeholder="0-100"
						/>
					</div>
					<div>
						<label for="mile_input" class="mb-1 block text-sm font-bold text-gray-700"
							>เลขไมล์ (km)</label
						>
						<input
							id="mile_input"
							type="number"
							bind:value={formMile}
							class="w-full rounded-lg border border-gray-300 p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
							placeholder="เช่น 15, 50"
						/>
					</div>
				</div>
			</div>

			{#if formVin.length >= 3}
				<div class="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-4">
					<div class="flex flex-col gap-2 lg:col-span-1">
						<h3 class="mb-2 font-bold text-gray-800">2. หมวดหมู่การตรวจสอบ</h3>
						{#each masters as m}
							<button
								on:click={() => (selectedMasterId = m.id)}
								class="rounded-lg border px-4 py-3 text-left transition-all {selectedMasterId ===
								m.id
									? 'border-blue-600 bg-blue-600 font-bold text-white shadow-md'
									: 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'}"
							>
								{m.Work_description}
							</button>
						{/each}
					</div>

					<div
						class="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-3"
					>
						<div class="rounded-t-xl border-b bg-gray-50 px-6 py-4">
							<h3 class="text-lg font-bold text-gray-800">รายการตรวจสอบ</h3>
							<p class="mt-1 text-sm text-gray-500">กด OK หากปกติ / กด NG เพื่อบันทึกปัญหา</p>
						</div>
						<div class="flex-1 overflow-auto p-2">
							<table class="w-full text-left text-sm">
								<tbody class="divide-y divide-gray-100">
									{#each currentChecklist as item (item.id)}
										<tr class="transition-colors hover:bg-gray-50">
											<td class="p-4 text-base font-medium text-gray-800">{item.work_name}</td>
											<td class="w-40 p-4 text-right">
												<div class="flex justify-end gap-2">
													<button
														on:click={() => markOk(item.id)}
														class="rounded-lg border px-5 py-2 font-bold transition-all {checkStatus[
															item.id
														] === 'OK'
															? 'border-green-500 bg-green-500 text-white shadow-sm'
															: 'border-green-200 bg-white text-green-600 hover:bg-green-50'}"
														>OK</button
													>
													<button
														on:click={() => openNgModal(item)}
														class="rounded-lg border px-5 py-2 font-bold transition-all {checkStatus[
															item.id
														] === 'NG'
															? 'border-red-500 bg-red-500 text-white shadow-sm'
															: 'border-red-200 bg-white text-red-600 hover:bg-red-50'}">NG</button
													>
												</div>
											</td>
										</tr>
									{/each}
									{#if currentChecklist.length === 0}
										<tr
											><td colspan="2" class="py-16 text-center text-gray-500"
												>กรุณาเลือกหมวดหมู่ด้านซ้าย</td
											></tr
										>
									{/if}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<div
			class="absolute right-0 bottom-0 left-0 flex items-center justify-between border-t border-gray-300 bg-white px-8 py-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]"
		>
			<div class="max-w-md flex-1">
				<p class="mb-1 text-sm font-bold text-gray-700">
					ความคืบหน้า ({checkedCount}/{totalCount} ข้อ)
				</p>
				<div class="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
					<div
						class="h-full bg-blue-600 transition-all duration-300 ease-out"
						style="width: {progressPercent}%"
					></div>
				</div>
			</div>
			<button
				on:click={submitFullPdi}
				disabled={isSaving || checkedCount < totalCount}
				class="rounded-lg bg-blue-600 px-8 py-3.5 font-bold text-white shadow-lg transition hover:bg-blue-700 disabled:bg-gray-400 disabled:opacity-50"
			>
				{isSaving ? 'กำลังอัปโหลดข้อมูล...' : 'บันทึกใบตรวจ (Submit PDI)'}
			</button>
		</div>
	</div>
{/if}

{#if showNgModal && activeNgItem}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
		<div class="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b bg-red-600 px-6 py-4">
				<div>
					<h2 class="text-lg font-bold text-white">บันทึกปัญหา (Log Defect)</h2>
					<p class="mt-0.5 text-sm text-red-100">
						จุดตรวจสอบ: <span class="font-bold">{activeNgItem.work_name}</span>
					</p>
				</div>
				<button
					on:click={() => (showNgModal = false)}
					class="text-red-100 hover:text-white"
					aria-label="ปิด"
					title="ปิด"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg
					>
				</button>
			</div>

			<form on:submit|preventDefault={saveNgLocal}>
				<div class="space-y-5 bg-gray-50/50 p-6">
					<div>
						<label for="position_input" class="mb-1 block text-sm font-bold text-gray-700"
							>ตำแหน่ง (Position) <span class="text-red-500">*</span></label
						>
						<Select
							id="position_input"
							items={positionOptions}
							bind:value={selectedPosition}
							on:change={(e) => (formPosition = e.detail ? e.detail.value : '')}
							placeholder="ค้นหาตำแหน่งชิ้นส่วน..."
							container={browser ? document.body : null}
						/>
						<input type="hidden" name="position" value={formPosition} required />
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="defect_input" class="mb-1 block text-sm font-bold text-gray-700"
								>ลักษณะปัญหา (Defect) <span class="text-red-500">*</span></label
							>
							<Select
								id="defect_input"
								items={defectOptions}
								bind:value={selectedDefect}
								on:change={(e) => (formDefectName = e.detail ? e.detail.value : '')}
								placeholder="เลือกปัญหา..."
								container={browser ? document.body : null}
							/>
							<input type="hidden" name="defect" value={formDefectName} required />
						</div>
						<div>
							<label for="solution_input" class="mb-1 block text-sm font-bold text-gray-700"
								>วิธีแก้ไข (Solution)</label
							>
							<Select
								id="solution_input"
								items={solutionOptions}
								bind:value={selectedSolution}
								on:change={(e) => (formSolutionName = e.detail ? e.detail.value : '')}
								placeholder="เลือกวิธีแก้ไข..."
								container={browser ? document.body : null}
							/>
						</div>
					</div>
					<div
						class="grid grid-cols-1 gap-4 rounded-xl border border-dashed border-gray-300 bg-white p-5 md:grid-cols-2"
					>
						<div>
							<label for="img_zoom" class="mb-2 block text-center text-sm font-bold text-gray-700"
								>📷 รูปภาพระยะใกล้ (Zoom)</label
							>
							<input
								id="img_zoom"
								type="file"
								bind:this={zoomFileInput}
								accept="image/*"
								class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:font-semibold file:text-gray-700 hover:file:bg-gray-200"
							/>
						</div>
						<div>
							<label for="img_far" class="mb-2 block text-center text-sm font-bold text-gray-700"
								>📸 รูปภาพระยะไกล (Far)</label
							>
							<input
								id="img_far"
								type="file"
								bind:this={farFileInput}
								accept="image/*"
								class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:font-semibold file:text-gray-700 hover:file:bg-gray-200"
							/>
						</div>
					</div>
				</div>
				<div class="flex justify-end gap-3 border-t bg-gray-50 px-6 py-4">
					<button
						type="button"
						on:click={() => (showNgModal = false)}
						class="rounded-lg border bg-white px-5 py-2 font-semibold text-gray-600 hover:bg-gray-100"
						>ยกเลิก</button
					>
					<button
						type="submit"
						disabled={!formDefectName || !formPosition}
						class="rounded-lg bg-red-600 px-6 py-2 font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
						>ยืนยันและพักข้อมูลไว้</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if showDeleteModal && itemToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
		<div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b bg-red-600 px-6 py-4">
				<h2 class="text-lg font-bold text-white">ยืนยันการลบข้อมูล</h2>
				<button
					on:click={() => (showDeleteModal = false)}
					class="text-red-100 hover:text-white"
					aria-label="ปิด"
					title="ปิด"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg
					>
				</button>
			</div>
			<div class="p-6 text-center text-gray-700">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mx-auto mb-4 h-16 w-16 text-red-500"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/></svg
				>
				<p class="mb-2 text-lg font-bold">คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?</p>
				<div class="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600">
					<p>เลขตัวถัง (VIN): <span class="font-bold text-blue-600">{itemToDelete.vin_no}</span></p>
					<p>
						ชิ้นส่วน: <span class="font-semibold text-gray-800">{itemToDelete.parts_name}</span>
					</p>
					<p class="mt-1 text-red-500">ปัญหา: {itemToDelete.defect}</p>
				</div>
			</div>
			<div class="flex justify-end gap-3 border-t bg-gray-50 px-6 py-4">
				<button
					type="button"
					on:click={() => (showDeleteModal = false)}
					class="rounded-lg border bg-white px-5 py-2 font-semibold text-gray-600 transition hover:bg-gray-100"
					>ยกเลิก</button
				>
				<form
					method="POST"
					action="?/delete"
					use:enhance={() => {
						isDeleting = true;
						return async ({ update, result }) => {
							await update();
							isDeleting = false;
							if (result.type === 'success') showDeleteModal = false;
						};
					}}
				>
					<input type="hidden" name="id" value={itemToDelete.id} />
					<button
						type="submit"
						disabled={isDeleting}
						class="rounded-lg bg-red-600 px-6 py-2 font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
						>{isDeleting ? 'กำลังลบ...' : 'ยืนยันการลบ'}</button
					>
				</form>
			</div>
		</div>
	</div>
{/if}

{#if showAlertModal}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl transition-all">
			<div class="p-6 text-center">
				{#if alertType === 'success'}
					<div
						class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-500"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-8 w-8"
							viewBox="0 0 20 20"
							fill="currentColor"
							><path
								fill-rule="evenodd"
								d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
								clip-rule="evenodd"
							/></svg
						>
					</div>
				{:else if alertType === 'error'}
					<div
						class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-500"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-8 w-8"
							viewBox="0 0 20 20"
							fill="currentColor"
							><path
								fill-rule="evenodd"
								d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
								clip-rule="evenodd"
							/></svg
						>
					</div>
				{:else}
					<div
						class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100 text-yellow-500"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-8 w-8"
							viewBox="0 0 20 20"
							fill="currentColor"
							><path
								fill-rule="evenodd"
								d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
								clip-rule="evenodd"
							/></svg
						>
					</div>
				{/if}
				<h3 class="mb-2 text-xl font-bold text-gray-800">{alertTitle}</h3>
				<p class="text-sm text-gray-500">{alertMessage}</p>
			</div>
			<div class="bg-gray-50 px-6 py-4 text-center">
				<button
					on:click={closeAlertModal}
					class="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-bold text-white shadow-sm transition hover:bg-blue-700"
				>
					ตกลง (OK)
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(div.svelte-select) {
		min-height: 42px;
		border-color: #d1d5db !important;
		border-radius: 0.5rem !important;
	}
	:global(div.svelte-select .input) {
		font-size: 0.875rem;
	}
	:global(div.svelte-select .list) {
		border-radius: 0.5rem;
		z-index: 99999 !important;
	}
</style>
