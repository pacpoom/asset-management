<script lang="ts">
	import { enhance } from '$app/forms';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	export let data;
	$: checklists = data.checklists || [];

	$: masters = data.masters || [];
	$: allDetails = data.details || [];
	$: defectOptions = (data.masterDefects || []).map((d: any) => ({
		value: d.name,
		label: d.name
	}));
	$: solutionOptions = (data.masterSolutions || []).map((s: any) => ({
		value: s.name,
		label: s.name
	}));

	let showInspectionModal = false;
	let showNgModal = false;
	let isSaving = false;

	let formVin = '';
	let formModel = '';
	let formColor = '';
	let formSoc = '';
	let formMile = '';

	let selectedVinObj: any = null;

	async function loadVinOptions(filterText: string) {
		if (!filterText || filterText.length < 3) return Promise.resolve([]);
		try {
			const res = await fetch(`/api/vehicle-lookup?q=${filterText}`);
			const data = await res.json();
			if (Array.isArray(data)) {
				return data.map((v: any) => ({
					value: v.vin_number,
					label: v.vin_number,
					model: v.model,
					color: v.color
				}));
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

	// 🌟 แก้ไขตรงนี้: เปลี่ยนจาก === เป็น == เพื่อให้เทียบตัวเลขกับตัวหนังสือได้
	$: currentChecklist = allDetails.filter((d: any) => d.work_id == selectedMasterId);

	let checkStatus: Record<number, 'OK' | 'NG'> = {};
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

	async function lookupVehicle() {
		if (formVin.length < 3) return;
		try {
			const res = await fetch(`/api/vehicle-lookup?vin=${formVin}`);
			const result = await res.json();
			if (result.found) {
				formVin = result.data.vin_number;
				formModel = result.data.model || '';
				formColor = result.data.color || '';
			}
		} catch (e) {
			console.error(e);
		}
	}

	function markOk(itemId: number) {
		checkStatus[itemId] = 'OK';
		checkStatus = { ...checkStatus };
	}

	function openNgModal(item: any) {
		activeNgItem = item;
		formPosition = '';
		selectedDefect = null;
		formDefectName = '';
		selectedSolution = null;
		formSolutionName = '';
		showNgModal = true;
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
		showInspectionModal = true;
	}
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/svelte-select@latest/dist/stylesheet.css" />
</svelte:head>

<div class="mb-6 flex flex-col gap-4 p-6 pb-0 md:flex-row md:items-center md:justify-between">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">NC Tracking (รายการปัญหา)</h1>
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
		เริ่มตรวจรถ (Start Inspection)
	</button>
</div>

<div class="p-6 pt-0">
	<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-50 text-gray-700">
				<tr>
					<th class="px-4 py-3 text-left">Date</th>
					<th class="px-4 py-3 text-left">Vehicle (VIN / Model)</th>
					<th class="px-4 py-3 text-left">Part / Defect</th>
					<th class="px-4 py-3 text-center">Action</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#if checklists.length === 0}
					<tr><td colspan="4" class="py-10 text-center text-gray-500">ไม่พบข้อมูลปัญหา</td></tr>
				{:else}
					{#each checklists as item}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-3 text-gray-600">{formatDate(item.created_at)}</td>
							<td class="px-4 py-3">
								<div class="font-mono font-bold text-blue-700">{item.vin_no}</div>
								<div class="text-xs text-gray-500">{item.model} • {item.color}</div>
							</td>
							<td class="px-4 py-3">
								<div class="font-bold">{item.parts_name}</div>
								<div class="text-xs font-semibold text-red-600">{item.defect}</div>
							</td>
							<td class="px-4 py-3 text-center">
								<form method="POST" action="?/delete" use:enhance class="inline-block">
									<input type="hidden" name="id" value={item.id} />
									<button
										class="text-red-600 hover:text-red-800"
										on:click={(e) => {
											if (!confirm('ลบรายการนี้?')) e.preventDefault();
										}}>ลบ</button
									>
								</form>
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
				ปิด / จบการตรวจสอบ
			</button>
		</div>

		<div class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 overflow-auto p-6">
			<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
				<h3 class="mb-4 border-b pb-2 text-lg font-bold text-gray-800">
					1. ข้อมูลรถยนต์ (Vehicle Info)
				</h3>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-5">
					<div class="md:col-span-2">
						<label class="mb-1 block text-sm font-bold text-gray-700"
							>เลขตัวถัง (VIN No.) <span class="text-red-500">*</span></label
						>

						<Select
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
						<label class="mb-1 block text-sm font-bold text-gray-700">รุ่น (Model)</label>
						<input
							type="text"
							bind:value={formModel}
							class="w-full rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-gray-600"
							readonly
						/>
					</div>
					<div>
						<label class="mb-1 block text-sm font-bold text-gray-700">สี (Color)</label>
						<input
							type="text"
							bind:value={formColor}
							class="w-full rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-gray-600"
							readonly
						/>
					</div>
					<div>
						<label class="mb-1 block text-sm font-bold text-gray-700">แบต / SOC (%)</label>
						<input
							type="number"
							bind:value={formSoc}
							class="w-full rounded-lg border border-gray-300 p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
							placeholder="0-100"
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
													>
														OK
													</button>
													<button
														on:click={() => openNgModal(item)}
														class="rounded-lg border px-5 py-2 font-bold transition-all {checkStatus[
															item.id
														] === 'NG'
															? 'border-red-500 bg-red-500 text-white shadow-sm'
															: 'border-red-200 bg-white text-red-600 hover:bg-red-50'}"
													>
														NG
													</button>
												</div>
											</td>
										</tr>
									{/each}

									{#if currentChecklist.length === 0}
										<tr>
											<td colspan="2" class="py-16 text-center text-gray-500">
												{#if selectedMasterId}
													<p class="mb-2 text-lg font-bold">ยังไม่มีรายการตรวจสอบในหมวดหมู่นี้</p>
													<p class="text-sm text-gray-400">
														คุณสามารถไปเพิ่มจุดตรวจสอบได้ที่เมนู <span
															class="font-bold text-blue-600">Work Items</span
														> ด้านซ้ายมือครับ
													</p>
												{:else}
													กรุณาเลือกหมวดหมู่ด้านซ้าย
												{/if}
											</td>
										</tr>
									{/if}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{:else}
				<div
					class="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 opacity-70"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mb-4 h-16 w-16 text-gray-400"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
						/></svg
					>
					<h3 class="text-lg font-bold text-gray-600">กรุณาระบุเลขตัวถัง (VIN)</h3>
					<p class="text-gray-500">เพื่อเริ่มขั้นตอนการตรวจสอบรถยนต์</p>
				</div>
			{/if}
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
				<button on:click={() => (showNgModal = false)} class="text-red-100 hover:text-white">
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

			<form
				method="POST"
				action="?/create"
				enctype="multipart/form-data"
				use:enhance={() => {
					isSaving = true;
					return async ({ update, result }) => {
						await update({ reset: false }); // ไม่ให้ form หลัก reset ค่า VIN
						isSaving = false;
						if (result.type === 'success') {
							checkStatus[activeNgItem.id] = 'NG'; // อัปเดตปุ่มเป็นสีแดง
							checkStatus = { ...checkStatus };
							showNgModal = false;
						}
					};
				}}
			>
				<input type="hidden" name="vin_no" value={formVin} />
				<input type="hidden" name="model" value={formModel} />
				<input type="hidden" name="color" value={formColor} />
				<input type="hidden" name="soc" value={formSoc} />
				<input type="hidden" name="mile" value={formMile} />
				<input type="hidden" name="parts_name" value={activeNgItem.work_name} />

				<div class="space-y-5 bg-gray-50/50 p-6">
					<div>
						<label for="position" class="mb-1 block text-sm font-bold text-gray-700"
							>ตำแหน่ง (Position)</label
						>
						<input
							type="text"
							name="position"
							bind:value={formPosition}
							class="w-full rounded-lg border p-2.5 font-bold focus:border-red-500 focus:ring-1 focus:ring-red-500"
							placeholder="เช่น ซ้ายหน้า (LH), ฝากระโปรง..."
						/>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="mb-1 block text-sm font-bold text-gray-700"
								>ลักษณะปัญหา (Defect) <span class="text-red-500">*</span></label
							>
							<Select
								items={defectOptions}
								bind:value={selectedDefect}
								on:change={(e) => (formDefectName = e.detail ? e.detail.value : '')}
								placeholder="เลือกปัญหา..."
								container={browser ? document.body : null}
							/>
							<input type="hidden" name="defect" value={formDefectName} required />
						</div>
						<div>
							<label class="mb-1 block text-sm font-bold text-gray-700">วิธีแก้ไข (Solution)</label>
							<Select
								items={solutionOptions}
								bind:value={selectedSolution}
								on:change={(e) => (formSolutionName = e.detail ? e.detail.value : '')}
								placeholder="เลือกวิธีแก้ไข..."
								container={browser ? document.body : null}
							/>
							<input type="hidden" name="solution" value={formSolutionName} />
						</div>
					</div>

					<div
						class="grid grid-cols-1 gap-4 rounded-xl border border-dashed border-gray-300 bg-white p-5 md:grid-cols-2"
					>
						<div>
							<label class="mb-2 block text-center text-sm font-bold text-gray-700"
								>📷 รูปภาพระยะใกล้ (Zoom)</label
							>
							<input
								type="file"
								name="img_zoom"
								accept="image/*"
								class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-200"
							/>
						</div>
						<div>
							<label class="mb-2 block text-center text-sm font-bold text-gray-700"
								>📸 รูปภาพระยะไกล (Far)</label
							>
							<input
								type="file"
								name="img_far"
								accept="image/*"
								class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-200"
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
						disabled={isSaving || !formDefectName}
						class="rounded-lg bg-red-600 px-6 py-2 font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
					>
						{isSaving ? 'กำลังบันทึก...' : 'บันทึกปัญหา'}
					</button>
				</div>
			</form>
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
