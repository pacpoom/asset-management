<script lang="ts">
	import { enhance } from '$app/forms';
	import Select from 'svelte-select'; // เรียกใช้ Library สวยๆ เหมือนหน้า Billing Note
	import { browser } from '$app/environment'; // ใช้สำหรับกำหนด container

	export let data;

	$: checklists = data.checklists || [];

	// เตรียมข้อมูล Master Data ให้เป็น format ที่ svelte-select ต้องการ ({ value, label, ... })
	$: partOptions = (data.masterParts || []).map((p: any) => ({
		value: p.name,
		label: p.name,
		position: p.position // แนบข้อมูล position ไปด้วย
	}));

	$: defectOptions = (data.masterDefects || []).map((d: any) => ({
		value: d.name,
		label: d.name
	}));

	$: solutionOptions = (data.masterSolutions || []).map((s: any) => ({
		value: s.name,
		label: s.name
	}));

	let showModal = false;
	let isSaving = false;

	// Form Variables (ค่าที่จะส่งไป Server)
	let formVin = '';
	let formModel = '';
	let formColor = '';

	// ตัวแปรสำหรับรับค่าจาก Select (จะเป็น Object)
	let selectedPart: any = null;
	let selectedDefect: any = null;
	let selectedSolution: any = null;

	// ตัวแปร String สำหรับเก็บค่าจริงที่จะส่งเข้า Form
	let formPartName = '';
	let formPosition = '';
	let formDefectName = '';
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

	// ฟังก์ชันเมื่อเลือก Part: อัปเดตชื่อ และ เติม Position อัตโนมัติ
	function handlePartSelect(event: any) {
		const selected = event.detail; // ได้ค่า { value, label, position }
		if (selected) {
			formPartName = selected.value;
			if (selected.position) {
				formPosition = selected.position; // Auto-fill Position
			}
		} else {
			formPartName = '';
			formPosition = '';
		}
	}

	// ฟังก์ชันเมื่อพิมพ์เอง (Creatable) หรือ Clear
	function handlePartClear() {
		formPartName = '';
		formPosition = '';
	}
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/svelte-select@latest/dist/stylesheet.css" />
</svelte:head>

<div class="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">NC Tracking</h1>
		<p class="text-sm text-gray-500">บันทึกผลตรวจสอบ (Inspection Records)</p>
	</div>
	<button
		on:click={() => (showModal = true)}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white shadow-sm hover:bg-blue-700"
	>
		+ บันทึกผลตรวจสอบ
	</button>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50 text-gray-700">
			<tr>
				<th class="px-4 py-3 text-left">Date</th>
				<th class="px-4 py-3 text-left">VIN</th>
				<th class="px-4 py-3 text-left">Model</th>
				<th class="px-4 py-3 text-left">Part / Defect</th>
				<th class="px-4 py-3 text-center">Action</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if checklists.length === 0}
				<tr><td colspan="5" class="py-10 text-center text-gray-500">ไม่พบข้อมูล</td></tr>
			{:else}
				{#each checklists as item}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 text-gray-600">{formatDate(item.created_at)}</td>
						<td class="px-4 py-3 font-mono font-bold">{item.vin_no}</td>
						<td class="px-4 py-3">{item.model}</td>
						<td class="px-4 py-3">
							<div class="font-bold">{item.parts_name}</div>
							<div class="text-xs text-red-600">{item.defect}</div>
						</td>
						<td class="px-4 py-3 text-center">
							<form method="POST" action="?/delete" use:enhance class="inline-block">
								<input type="hidden" name="id" value={item.id} />
								<button
									class="text-red-600 hover:underline"
									on:click={(e) => {
										if (!confirm('ลบ?')) e.preventDefault();
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

{#if showModal}
	<div
		class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
			<div class="border-b px-6 py-4">
				<h2 class="text-xl font-bold text-gray-800">บันทึกผลตรวจสอบ</h2>
			</div>

			<form
				method="POST"
				action="?/create"
				enctype="multipart/form-data"
				use:enhance={() => {
					isSaving = true;
					return async ({ update, result }) => {
						await update();
						isSaving = false;
						if (result.type === 'success') {
							showModal = false;
							// Reset Form
							formVin = '';
							formModel = '';
							formColor = '';
							selectedPart = null;
							formPartName = '';
							formPosition = '';
							selectedDefect = null;
							formDefectName = '';
							selectedSolution = null;
							formSolutionName = '';
						}
					};
				}}
			>
				<div class="space-y-4 p-6">
					<div
						class="grid grid-cols-1 gap-4 rounded-lg border border-blue-100 bg-blue-50 p-4 md:grid-cols-3"
					>
						<div class="md:col-span-1">
							<label for="vin_no" class="mb-1 block text-sm font-bold text-gray-700"
								>VIN No. *</label
							>
							<input
								id="vin_no"
								type="text"
								name="vin_no"
								bind:value={formVin}
								on:blur={lookupVehicle}
								class="w-full rounded border p-2 uppercase"
								required
								placeholder="Scan VIN..."
							/>
						</div>
						<div>
							<label for="model" class="mb-1 block text-sm font-bold text-gray-700">Model</label>
							<input
								id="model"
								type="text"
								name="model"
								bind:value={formModel}
								class="w-full rounded border bg-gray-100 p-2"
								readonly
							/>
						</div>
						<div>
							<label for="color" class="mb-1 block text-sm font-bold text-gray-700">Color</label>
							<input
								id="color"
								type="text"
								name="color"
								bind:value={formColor}
								class="w-full rounded border bg-gray-100 p-2"
								readonly
							/>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="soc" class="mb-1 block text-sm font-bold text-gray-700">SOC (%)</label>
							<input id="soc" type="number" name="soc" class="w-full rounded border p-2" />
						</div>
						<div>
							<label for="mile" class="mb-1 block text-sm font-bold text-gray-700">Mile (km)</label>
							<input id="mile" type="number" name="mile" class="w-full rounded border p-2" />
						</div>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="mb-1 block text-sm font-bold text-gray-700">ชิ้นส่วน (Part)</label>
							<Select
								items={partOptions}
								bind:value={selectedPart}
								on:change={handlePartSelect}
								on:clear={handlePartClear}
								placeholder="เลือกชิ้นส่วน..."
								container={browser ? document.body : null}
							/>
							<input type="hidden" name="parts_name" value={formPartName} />
						</div>
						<div>
							<label for="position" class="mb-1 block text-sm font-bold text-gray-700"
								>ตำแหน่ง (Position)</label
							>
							<input
								id="position"
								type="text"
								name="position"
								bind:value={formPosition}
								class="w-full rounded border bg-gray-50 p-2 text-center font-bold"
								placeholder="RH / LH"
							/>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="mb-1 block text-sm font-bold text-gray-700">ปัญหา (Defect)</label>
							<Select
								items={defectOptions}
								bind:value={selectedDefect}
								on:change={(e) => (formDefectName = e.detail ? e.detail.value : '')}
								placeholder="เลือกปัญหา..."
								container={browser ? document.body : null}
							/>
							<input type="hidden" name="defect" value={formDefectName} />
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

					<div class="grid grid-cols-1 gap-4 rounded border bg-gray-50 p-4 md:grid-cols-2">
						<div>
							<label for="img_zoom" class="mb-2 block text-sm font-bold text-gray-700"
								>รูปภาพระยะใกล้ (Zoom)</label
							>
							<input
								id="img_zoom"
								type="file"
								name="img_zoom"
								accept="image/*"
								class="w-full text-sm"
							/>
						</div>
						<div>
							<label for="img_far" class="mb-2 block text-sm font-bold text-gray-700"
								>รูปภาพระยะไกล (Far)</label
							>
							<input
								id="img_far"
								type="file"
								name="img_far"
								accept="image/*"
								class="w-full text-sm"
							/>
						</div>
					</div>
				</div>

				<div class="flex justify-end gap-3 border-t bg-gray-50 px-6 py-4">
					<button
						type="button"
						on:click={() => (showModal = false)}
						class="rounded border bg-white px-4 py-2 hover:bg-gray-100">ยกเลิก</button
					>
					<button
						type="submit"
						disabled={isSaving}
						class="rounded bg-blue-600 px-6 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
					>
						{isSaving ? 'บันทึก...' : 'บันทึกข้อมูล'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	:global(div.svelte-select) {
		min-height: 42px; /* ความสูงของ Input */
		border-color: #d1d5db !important;
		border-radius: 0.375rem !important;
	}
	:global(div.svelte-select .input) {
		font-size: 0.875rem; /* ขนาดตัวอักษร */
	}
	:global(div.svelte-select .list) {
		border-radius: 0.375rem;
		border-color: #d1d5db;
		z-index: 9999 !important; /* ให้ Dropdown ลอยทับ Modal */
		max-height: 200px;
		overflow-y: auto;
	}
	:global(div.svelte-select .item) {
		font-size: 0.875rem;
		padding: 8px 12px;
	}
	:global(div.svelte-select .item.isActive) {
		background: #e0f2fe; /* สีไฮไลท์ตอนเลือก */
		color: #0c4a6e;
	}
</style>
