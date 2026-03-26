<script lang="ts">
	import { enhance } from '$app/forms';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import { t } from '$lib/i18n';

	export let data;
	let record = data.record;
	let items = data.items;

	function cleanValue(val: any) {
		if (!val) return '';
		if (typeof val === 'object' && val !== null) return val.label || val.value || '';
		try {
			const parsed = JSON.parse(val);
			return parsed.label || parsed.value || val;
		} catch (e) {
			return val;
		}
	}

	$: defectOptions = [
		...(data.masterDefects || []).map((d: any) => ({ value: d.name, label: d.name })),
		{ value: 'OTHER', label: 'อื่นๆ (โปรดระบุ)' }
	];
	$: solutionOptions = (data.masterSolutions || []).map((s: any) => ({
		value: s.name,
		label: s.name
	}));

	$: positionOptions = (data.masterParts || []).map((p: any) => ({
		value: p.position ? `${p.name} (${p.position})` : p.name,
		label: p.position ? `${p.name} (${p.position})` : p.name
	}));

	let isSaving = false;

	let formVin = cleanValue(record.vin_no);
	let formModel = cleanValue(record.model);
	let formColor = cleanValue(record.color);
	let formSoc = record.soc || '';
	let formMile = record.mile || '';
	let selectedVinObj = { value: formVin, label: formVin, model: formModel, color: formColor };

	let checkStatus = Object.fromEntries(items.map((i: any) => [i.work_detail_id, i.status]));
	let ngDetails = Object.fromEntries(
		items.map((i: any) => [
			i.work_detail_id,
			{
				...i,
				position: cleanValue(i.position),
				defect: cleanValue(i.defect),
				solution: cleanValue(i.solution)
			}
		])
	);

	let showNgModal = false;
	let activeItem: any = null;
	let currentNgData = { position: '', defect: '', solution: '', img_zoom: null, img_far: null };
	let modalSelectedDefect: any = null;
	let modalDefectText = '';
	let zoomInput: HTMLInputElement;
	let farInput: HTMLInputElement;

	function openNgEdit(item: any) {
		activeItem = item;
		const existing = ngDetails[item.work_detail_id];
		const isMasterDefect = data.masterDefects?.some((d: any) => d.name === existing.defect);
		if (existing.defect && !isMasterDefect) {
			modalSelectedDefect = { value: 'OTHER', label: 'อื่นๆ (โปรดระบุ)' };
			modalDefectText = existing.defect;
		} else if (existing.defect) {
			modalSelectedDefect = { value: existing.defect, label: existing.defect };
			modalDefectText = existing.defect;
		} else {
			modalSelectedDefect = null;
			modalDefectText = '';
		}

		currentNgData = {
			position: existing.position || '',
			defect: existing.defect || '',
			solution: existing.solution || '',
			img_zoom: existing.img_zoom,
			img_far: existing.img_far
		};
		showNgModal = true;
	}

	function saveNgEdit() {
		const posVal =
			typeof currentNgData.position === 'object'
				? (currentNgData.position as any).label
				: currentNgData.position;
		const solVal =
			typeof currentNgData.solution === 'object'
				? (currentNgData.solution as any).label
				: currentNgData.solution;

		const defVal = modalDefectText;

		ngDetails[activeItem.work_detail_id] = {
			...ngDetails[activeItem.work_detail_id],
			position: posVal,
			defect: defVal,
			solution: solVal,
			status: 'NG',
			zoomFile: zoomInput?.files?.[0] || null,
			farFile: farInput?.files?.[0] || null
		};
		checkStatus[activeItem.work_detail_id] = 'NG';
		showNgModal = false;
	}

	async function handleSubmit(event: { formData: FormData }) {
		isSaving = true;
		const { formData } = event;

		const pdiData = items.map((i: any) => {
			const detail = ngDetails[i.work_detail_id];
			if (detail.status === 'NG') {
				if (detail.zoomFile) formData.append(`img_zoom_${i.work_detail_id}`, detail.zoomFile);
				if (detail.farFile) formData.append(`img_far_${i.work_detail_id}`, detail.farFile);
			}
			return {
				work_detail_id: i.work_detail_id,
				status: checkStatus[i.work_detail_id],
				position: detail.position,
				defect: detail.defect,
				solution: detail.solution,
				img_zoom: detail.img_zoom,
				img_far: detail.img_far
			};
		});
		formData.append('pdi_data', JSON.stringify(pdiData));
	}
</script>

<div class="mx-auto max-w-6xl p-6">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">
				{$t('Edit Inspection Report') || 'แก้ไขรายงานการตรวจสอบ'}
			</h1>
			<p class="text-sm text-gray-500">
				คุณกำลังแก้ไขรายงานของรถ VIN: <span class="font-bold">{formVin}</span>
			</p>
		</div>
		<a
			href="/nc-tracking"
			class="rounded-lg border bg-white px-5 py-2.5 font-semibold text-gray-600 shadow-sm hover:bg-gray-50"
		>
			{$t('Cancel') || 'ยกเลิก'}
		</a>
	</div>

	<form method="POST" action="?/update" use:enhance={handleSubmit} class="space-y-6">
		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
			<h2 class="mb-4 border-b pb-2 text-lg font-bold text-gray-800">1. ข้อมูลรถยนต์</h2>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
				<div class="lg:col-span-2">
					<label for="vin_no_input" class="mb-1 block text-sm font-bold text-gray-700"
						>เลขตัวถัง (VIN No.)</label
					>
					<input
						id="vin_no_input"
						type="text"
						name="vin_no"
						bind:value={formVin}
						readonly
						class="w-full rounded-lg border bg-gray-50 p-2.5 font-mono font-bold text-blue-700"
					/>
				</div>
				<div>
					<label for="model_input" class="mb-1 block text-sm font-bold text-gray-700"
						>รุ่น (Model)</label
					>
					<input
						id="model_input"
						type="text"
						name="model"
						bind:value={formModel}
						class="w-full rounded-lg border p-2.5"
					/>
				</div>
				<div>
					<label for="soc_input" class="mb-1 block text-sm font-bold text-gray-700"
						>แบต / SOC (%)</label
					>
					<input
						id="soc_input"
						type="number"
						name="soc"
						bind:value={formSoc}
						class="w-full rounded-lg border p-2.5"
					/>
				</div>
				<div>
					<label for="mile_input" class="mb-1 block text-sm font-bold text-gray-700"
						>เลขไมล์ (km)</label
					>
					<input
						id="mile_input"
						type="number"
						name="mile"
						bind:value={formMile}
						class="w-full rounded-lg border p-2.5"
					/>
				</div>
				<input type="hidden" name="color" value={formColor} />
			</div>
		</div>

		<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
			<div class="border-b bg-gray-50 px-6 py-4">
				<h2 class="text-lg font-bold text-gray-800">2. รายการตรวจสอบ (Inspection Items)</h2>
			</div>
			<div class="divide-y divide-gray-100">
				{#each items as item}
					<div class="flex items-center justify-between p-4 transition hover:bg-gray-50/50">
						<div class="flex flex-col">
							<span class="font-bold text-gray-800">{item.work_name}</span>
							{#if checkStatus[item.work_detail_id] === 'NG'}
								<span class="text-xs font-bold text-red-600"
									>ปัญหา: {ngDetails[item.work_detail_id].defect}</span
								>
							{/if}
						</div>
						<div class="flex gap-2">
							<button
								type="button"
								on:click={() => (checkStatus[item.work_detail_id] = 'OK')}
								class="rounded-lg border px-4 py-1.5 font-bold transition {checkStatus[
									item.work_detail_id
								] === 'OK'
									? 'border-green-600 bg-green-500 text-white'
									: 'border-green-200 bg-white text-green-600 hover:bg-green-50'}"
							>
								OK
							</button>
							<button
								type="button"
								on:click={() => openNgEdit(item)}
								class="rounded-lg border px-4 py-1.5 font-bold transition {checkStatus[
									item.work_detail_id
								] === 'NG'
									? 'border-red-600 bg-red-500 text-white'
									: 'border-red-200 bg-white text-red-600 hover:bg-red-50'}"
							>
								NG
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="flex justify-end gap-3 pt-4">
			<button
				type="submit"
				disabled={isSaving}
				class="rounded-lg bg-blue-600 px-10 py-3 font-bold text-white shadow-lg transition hover:bg-blue-700 disabled:opacity-50"
			>
				{isSaving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไขทั้งหมด'}
			</button>
		</div>
	</form>
</div>

{#if showNgModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
		<div class="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
			<div class="flex justify-between bg-red-600 px-6 py-4 text-white">
				<h2 class="font-bold">แก้ไขรายละเอียดปัญหา: {activeItem.work_name}</h2>
				<button on:click={() => (showNgModal = false)}>✕</button>
			</div>
			<div class="space-y-4 p-6">
				<div>
					<label for="pos_select" class="mb-1 block text-sm font-bold text-gray-700"
						>ตำแหน่ง (Position)</label
					>
					<Select
						id="pos_select"
						items={positionOptions}
						bind:value={currentNgData.position}
						container={browser ? document.body : null}
					/>
				</div>
				<div>
					<label for="defect_select" class="mb-1 block text-sm font-bold text-gray-700"
						>ปัญหา (Defect)</label
					>
					<Select
						id="defect_select"
						items={defectOptions}
						bind:value={modalSelectedDefect}
						on:change={(e) => {
							modalDefectText = e.detail && e.detail.value !== 'OTHER' ? e.detail.value : '';
						}}
						container={browser ? document.body : null}
					/>

					{#if modalSelectedDefect?.value === 'OTHER'}
						<input
							type="text"
							bind:value={modalDefectText}
							placeholder="พิมพ์ระบุลักษณะปัญหาที่พบ..."
							class="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
							required
						/>
					{/if}
				</div>
				<div>
					<label for="sol_select" class="mb-1 block text-sm font-bold text-gray-700"
						>วิธีแก้ไข (Solution)</label
					>
					<Select
						id="sol_select"
						items={solutionOptions}
						bind:value={currentNgData.solution}
						container={browser ? document.body : null}
					/>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<p class="mb-1 text-xs font-bold">รูปซูม (Zoom)</p>
						{#if currentNgData.img_zoom}<img
								src="/uploads/inspections/{currentNgData.img_zoom}"
								class="mb-1 h-20 rounded object-cover"
								alt="zoom"
							/>{/if}
						<input
							type="file"
							bind:this={zoomInput}
							accept="image/*"
							capture="environment"
							class="text-xs"
							aria-label="อัปโหลดรูปภาพระยะใกล้"
						/>
					</div>
					<div>
						<p class="mb-1 text-xs font-bold">รูปมุมกว้าง (Far)</p>
						{#if currentNgData.img_far}<img
								src="/uploads/inspections/{currentNgData.img_far}"
								class="mb-1 h-20 rounded object-cover"
								alt="far"
							/>{/if}
						<input
							type="file"
							bind:this={farInput}
							accept="image/*"
							capture="environment"
							class="text-xs"
							aria-label="อัปโหลดรูปภาพระยะไกล"
						/>
					</div>
				</div>
			</div>
			<div class="flex justify-end gap-2 bg-gray-50 px-6 py-4">
				<button
					type="button"
					on:click={() => (showNgModal = false)}
					class="rounded border px-4 py-2 font-bold hover:bg-gray-100">ยกเลิก</button
				>
				<button
					type="button"
					on:click={saveNgEdit}
					class="rounded bg-red-600 px-6 py-2 font-bold text-white hover:bg-red-700"
					>บันทึกรายละเอียด</button
				>
			</div>
		</div>
	</div>
{/if}
