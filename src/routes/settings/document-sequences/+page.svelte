<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;
	$: ({ sequences } = data);

	// ตัวแปรสำหรับ Modal จัดการฟอร์ม
	let isModalOpen = false;
	let isSaving = false;
	let modalMode: 'create' | 'edit' = 'create';

	// ตัวแปรเก็บข้อมูล Form
	let formData = {
		id: '',
		document_type: 'INV',
		prefix: 'INV-',
		year: new Date().getFullYear(),
		month: new Date().getMonth() + 1,
		last_number: 0,
		padding_length: 4
	};

	// ตัวแปรสำหรับ Modal ลบ
	let isDeleteModalOpen = false;
	let itemToDelete: any = null;
	let isDeleting = false;

	function openCreateModal() {
		modalMode = 'create';
		formData = {
			id: '',
			document_type: 'INV',
			prefix: 'INV-',
			year: new Date().getFullYear(),
			month: new Date().getMonth() + 1,
			last_number: 0,
			padding_length: 4
		};
		isModalOpen = true;
	}

	function openEditModal(item: any) {
		modalMode = 'edit';
		formData = { ...item };
		isModalOpen = true;
	}

	function closeModal() {
		isModalOpen = false;
		if (form?.message) form.message = undefined; // เคลียร์ error
	}

	function openDeleteModal(item: any) {
		itemToDelete = item;
		isDeleteModalOpen = true;
	}

	function closeDeleteModal() {
		isDeleteModalOpen = false;
		itemToDelete = null;
	}

	function getDocTypeName(type: string) {
		switch (type) {
			case 'QT': return 'ใบเสนอราคา';
			case 'BN': return 'ใบวางบิล';
			case 'INV': return 'ใบแจ้งหนี้';
			case 'RE': return 'ใบเสร็จรับเงิน';
			default: return type;
		}
	}

	function getDocTypeColor(type: string) {
		switch (type) {
			case 'QT': return 'text-purple-700 bg-purple-100 border-purple-200';
			case 'BN': return 'text-orange-700 bg-orange-100 border-orange-200';
			case 'INV': return 'text-blue-700 bg-blue-100 border-blue-200';
			case 'RE': return 'text-green-700 bg-green-100 border-green-200';
			default: return 'text-gray-700 bg-gray-100 border-gray-200';
		}
	}

	// อัปเดต Prefix อัตโนมัติเวลาเปลี่ยน Document Type (เฉพาะตอนสร้างใหม่)
	function handleDocTypeChange() {
		if (modalMode === 'create') {
			formData.prefix = formData.document_type + '-';
		}
	}
</script>

<svelte:head>
	<title>ตั้งค่าเลขที่เอกสาร</title>
</svelte:head>

<div class="mx-auto max-w-7xl">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">จัดการเลขที่เอกสาร (Document Sequences)</h1>
			<p class="mt-1 text-sm text-gray-500">ตั้งค่ารูปแบบคำนำหน้าและเลขลำดับ (Running Number) ปัจจุบัน</p>
		</div>
		<button
			type="button"
			on:click={openCreateModal}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
		>
			+ เพิ่มลำดับใหม่
		</button>
	</div>

	<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left font-semibold text-gray-600">ประเภทเอกสาร</th>
						<th class="px-4 py-3 text-center font-semibold text-gray-600">ปี / เดือน</th>
						<th class="px-4 py-3 text-center font-semibold text-gray-600">คำนำหน้า (Prefix)</th>
						<th class="px-4 py-3 text-center font-semibold text-gray-600">จำนวนหลัก</th>
						<th class="px-4 py-3 text-center font-semibold text-blue-600">เลขที่ถูกใช้ล่าสุด</th>
						<th class="px-4 py-3 text-center font-semibold text-gray-600">ตัวอย่างเอกสารถัดไป</th>
						<th class="px-4 py-3 text-center font-semibold text-gray-600">จัดการ</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#if sequences.length === 0}
						<tr>
							<td colspan="7" class="py-8 text-center text-gray-500">ยังไม่มีข้อมูลการตั้งค่าเลขลำดับ (ระบบจะสร้างให้อัตโนมัติเมื่อมีการสร้างเอกสารใบแรกของเดือน)</td>
						</tr>
					{:else}
						{#each sequences as seq}
							{@const nextNumStr = String(seq.last_number + 1).padStart(seq.padding_length, '0')}
							{@const monthStr = String(seq.month).padStart(2, '0')}
							<tr class="transition-colors hover:bg-gray-50">
								<td class="px-4 py-3">
									<span class="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold border {getDocTypeColor(seq.document_type)}">
										{getDocTypeName(seq.document_type)} ({seq.document_type})
									</span>
								</td>
								<td class="px-4 py-3 text-center font-medium text-gray-700">{seq.year} / {monthStr}</td>
								<td class="px-4 py-3 text-center text-gray-600 font-mono bg-gray-50 rounded mx-2">{seq.prefix}</td>
								<td class="px-4 py-3 text-center text-gray-600">{seq.padding_length}</td>
								<td class="px-4 py-3 text-center font-bold text-blue-600 text-base">{seq.last_number}</td>
								<td class="px-4 py-3 text-center text-gray-500 font-mono">
									{seq.prefix}{seq.year}{monthStr}-{nextNumStr}
								</td>
								<td class="px-4 py-3 text-center">
									<div class="flex justify-center gap-2">
										<button type="button" on:click={() => openEditModal(seq)} class="text-gray-400 hover:text-yellow-600" title="แก้ไข">
											✏️
										</button>
										<button type="button" on:click={() => openDeleteModal(seq)} class="text-gray-400 hover:text-red-600" title="ลบ">
											🗑️
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
</div>

<!-- Modal สำหรับเพิ่ม/แก้ไข -->
{#if isModalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50 p-4 transition-opacity">
		<div class="w-full transform overflow-hidden rounded-lg bg-white shadow-xl transition-all sm:max-w-md">
			<div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
				<h3 class="text-lg font-bold text-gray-900">
					{modalMode === 'create' ? 'เพิ่มการตั้งค่าเลขลำดับ' : 'แก้ไขเลขลำดับ'}
				</h3>
				<button type="button" on:click={closeModal} class="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
			</div>

			<form method="POST" action="?/save" use:enhance={() => { isSaving = true; return async ({ update, result }) => { await update(); isSaving = false; if (result.type === 'success') closeModal(); }; }}>
				<div class="p-6 space-y-4">
					{#if form?.message}
						<div class="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
							{form.message}
						</div>
					{/if}

					<input type="hidden" name="id" value={formData.id} />
					
					<div>
						<label for="document_type" class="block text-sm font-medium text-gray-700 mb-1">ประเภทเอกสาร</label>
						<select id="document_type" name="document_type" bind:value={formData.document_type} on:change={handleDocTypeChange} class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" disabled={modalMode === 'edit'}>
							<option value="QT">ใบเสนอราคา (QT)</option>
							<option value="BN">ใบวางบิล (BN)</option>
							<option value="INV">ใบแจ้งหนี้ (INV)</option>
							<option value="RE">ใบเสร็จรับเงิน (RE)</option>
						</select>
						{#if modalMode === 'edit'}
							<input type="hidden" name="document_type" value={formData.document_type} />
							<p class="text-xs text-gray-500 mt-1">ไม่สามารถเปลี่ยนประเภทเอกสารได้เมื่อแก้ไข</p>
						{/if}
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="year" class="block text-sm font-medium text-gray-700 mb-1">ปี (ค.ศ.)</label>
							<input id="year" type="number" name="year" bind:value={formData.year} required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" disabled={modalMode === 'edit'} />
							{#if modalMode === 'edit'}<input type="hidden" name="year" value={formData.year} />{/if}
						</div>
						<div>
							<label for="month" class="block text-sm font-medium text-gray-700 mb-1">เดือน (1-12)</label>
							<input id="month" type="number" name="month" bind:value={formData.month} min="1" max="12" required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" disabled={modalMode === 'edit'} />
							{#if modalMode === 'edit'}<input type="hidden" name="month" value={formData.month} />{/if}
						</div>
					</div>

					<div>
						<label for="prefix" class="block text-sm font-medium text-gray-700 mb-1">คำนำหน้า (Prefix)</label>
						<input id="prefix" type="text" name="prefix" bind:value={formData.prefix} required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 font-mono" placeholder="เช่น INV-" />
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="last_number" class="block text-sm font-medium text-blue-700 mb-1">เลขที่ถูกใช้ล่าสุด <span class="text-red-500">*</span></label>
							<input id="last_number" type="number" name="last_number" bind:value={formData.last_number} min="0" required class="w-full rounded-md border-blue-300 bg-blue-50 shadow-sm focus:border-blue-500 focus:ring-blue-500 font-bold text-blue-700" />
							<p class="text-[10px] text-gray-500 mt-1">ตั้งเป็น 0 เพื่อให้เริ่มที่ 1</p>
						</div>
						<div>
							<label for="padding_length" class="block text-sm font-medium text-gray-700 mb-1">จำนวนหลัก (Padding)</label>
							<input id="padding_length" type="number" name="padding_length" bind:value={formData.padding_length} min="3" max="10" required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
						</div>
					</div>
					
					<div class="p-3 bg-gray-50 border border-gray-200 rounded text-sm text-center">
						ตัวอย่างเอกสารใบถัดไป: <br/>
						<strong class="font-mono text-lg text-gray-800">
							{formData.prefix}{formData.year}{String(formData.month).padStart(2, '0')}-{String(Number(formData.last_number) + 1).padStart(Number(formData.padding_length), '0')}
						</strong>
					</div>
				</div>

				<div class="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200">
					<button type="button" on:click={closeModal} class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">ยกเลิก</button>
					<button type="submit" disabled={isSaving} class="rounded-md bg-blue-600 px-6 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
						{isSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Modal ลบ -->
{#if isDeleteModalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50 p-4 transition-opacity">
		<div class="w-full transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all sm:max-w-lg">
			<h3 class="mb-2 text-lg font-medium text-gray-900">ยืนยันการลบ</h3>
			<p class="text-sm text-gray-500">
				คุณต้องการลบการตั้งค่าลำดับของ <strong class="text-gray-800">{getDocTypeName(itemToDelete?.document_type)} (เดือน {itemToDelete?.month}/{itemToDelete?.year})</strong> ใช่หรือไม่? <br/>
				<span class="text-red-500 text-xs">*การลบไม่มีผลกับเอกสารที่ออกไปแล้ว แต่อาจทำให้การออกเอกสารใหม่ในเดือนนี้เริ่มนับ 1 ใหม่</span>
			</p>
			<div class="mt-6 flex justify-end gap-3">
				<button type="button" on:click={closeDeleteModal} class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">ยกเลิก</button>
				<form method="POST" action="?/delete" use:enhance={() => { isDeleting = true; return async ({ update }) => { await update(); isDeleting = false; closeDeleteModal(); }; }}>
					<input type="hidden" name="id" value={itemToDelete?.id} />
					<button type="submit" disabled={isDeleting} class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
						{isDeleting ? 'กำลังลบ...' : 'ยืนยันการลบ'}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}