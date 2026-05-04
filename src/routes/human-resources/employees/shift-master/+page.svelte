<script lang="ts">
	import { t } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import { slide, fade } from 'svelte/transition';

	let { data, form } = $props();
	let shifts = $derived(data.shifts || []);

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedItem = $state<any>(null);
	let itemToDelete = $state<any>(null);
	let isSaving = $state(false);
	let isDeleting = $state(false);

	// ชุดสีที่รองรับในระบบ
	const colorThemes = [
		{
			id: 'orange',
			name: 'ส้ม (มักใช้กับ กะเช้า/Day)',
			classes: 'bg-orange-100 text-orange-700 border-orange-200'
		},
		{
			id: 'indigo',
			name: 'น้ำเงิน (มักใช้กับ กะดึก/Night)',
			classes: 'bg-indigo-100 text-indigo-700 border-indigo-200'
		},
		{
			id: 'gray',
			name: 'เทา (มักใช้กับ วันหยุด/Off)',
			classes: 'bg-gray-100 text-gray-500 border-gray-200'
		},
		{
			id: 'red',
			name: 'แดง (มักใช้กับ ลางาน/Leave)',
			classes: 'bg-red-100 text-red-700 border-red-200'
		},
		{
			id: 'green',
			name: 'เขียว (มักใช้กับ พิเศษ/OT)',
			classes: 'bg-green-100 text-green-700 border-green-200'
		},
		{ id: 'blue', name: 'ฟ้า', classes: 'bg-blue-100 text-blue-700 border-blue-200' },
		{ id: 'purple', name: 'ม่วง', classes: 'bg-purple-100 text-purple-700 border-purple-200' },
		{ id: 'yellow', name: 'เหลือง', classes: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
	];

	function getThemeClasses(themeId: string) {
		const theme = colorThemes.find((t) => t.id === themeId);
		return theme ? theme.classes : colorThemes[2].classes; // ค่าเริ่มต้นเป็นสีเทา
	}

	function formatTime(timeStr: string) {
		if (!timeStr) return '-';
		return timeStr.substring(0, 5); // แปลง 08:00:00 ให้เหลือ 08:00
	}

	function openModal(mode: 'add' | 'edit', item: any = null) {
		modalMode = mode;
		if (mode === 'add') {
			selectedItem = {
				shift_code: '',
				shift_name: '',
				start_time: '08:00',
				end_time: '17:00',
				ot_start_time: '',
				ot_end_time: '',
				color_theme: 'orange',
				shift_category: 'Normal', // ค่าเริ่มต้นประเภทกะ
				status: 'Active'
			};
		} else {
			selectedItem = { ...item };
			if (selectedItem.start_time)
				selectedItem.start_time = selectedItem.start_time.substring(0, 5);
			if (selectedItem.end_time) selectedItem.end_time = selectedItem.end_time.substring(0, 5);
			if (selectedItem.ot_start_time)
				selectedItem.ot_start_time = selectedItem.ot_start_time.substring(0, 5);
			if (selectedItem.ot_end_time)
				selectedItem.ot_end_time = selectedItem.ot_end_time.substring(0, 5);
			if (!selectedItem.shift_category) selectedItem.shift_category = 'Normal';
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
	<title>{$t('Shift Master')}</title>
</svelte:head>

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Seting Shift Master')}</h1>
		<p class="mt-1 text-sm text-gray-500">
			{$t('จัดการประเภทกะการทำงานและสีแสดงผลก่อนนำไปจัดตาราง')}
		</p>
	</div>

	<div class="flex items-center gap-3">
		{#if form?.message}
			<span class="text-sm font-semibold {form.success ? 'text-green-600' : 'text-red-600'}">
				{form.message}
			</span>
		{/if}

		<button
			onclick={() => openModal('add')}
			class="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
		>
			<span class="material-symbols-outlined text-[18px]">add</span>
			{$t('เพิ่มกะใหม่')}
		</button>
	</div>
</div>

<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
	<div class="overflow-x-auto">
		<table class="w-full text-left text-sm text-gray-600">
			<thead class="bg-gray-50 text-xs text-gray-700 uppercase">
				<tr>
					<th class="px-6 py-4">{$t('พรีวิว (Preview)')}</th>
					<th class="px-6 py-4">{$t('รหัสกะ (Code)')}</th>
					<th class="px-6 py-4">{$t('ชื่อกะ (Name)')}</th>
					<th class="px-6 py-4">{$t('ประเภท')}</th>
					<th class="px-6 py-4">{$t('เวลาทำงาน / OT')}</th>
					<th class="px-6 py-4">{$t('สถานะ')}</th>
					<th class="px-6 py-4 text-center">{$t('Actions')}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-100">
				{#if shifts.length === 0}
					<tr
						><td colspan="7" class="px-6 py-8 text-center text-gray-500"
							>ยังไม่มีข้อมูลรูปแบบกะในระบบ</td
						></tr
					>
				{/if}
				{#each shifts as shift}
					<tr class="transition-colors hover:bg-gray-50">
						<td class="px-6 py-4">
							<div
								class={`flex h-8 w-8 items-center justify-center rounded border text-sm font-bold shadow-sm ${getThemeClasses(shift.color_theme)}`}
							>
								{shift.shift_code}
							</div>
						</td>
						<td class="px-6 py-4 font-bold text-gray-900">{shift.shift_code}</td>
						<td class="px-6 py-4 font-medium">{shift.shift_name}</td>
						<td class="px-6 py-4">
							{#if shift.shift_category === 'Holiday'}
								<span class="rounded bg-pink-100 px-2 py-1 text-[11px] font-bold text-pink-700"
									>วันหยุด (Holiday)</span
								>
							{:else}
								<span class="rounded bg-blue-100 px-2 py-1 text-[11px] font-bold text-blue-700"
									>วันปกติ (Normal)</span
								>
							{/if}
						</td>
						<td class="px-6 py-4 font-mono text-gray-500">
							<div class="flex flex-col gap-1">
								<span>
									{shift.start_time && shift.end_time
										? `ปกติ: ${formatTime(shift.start_time)} - ${formatTime(shift.end_time)}`
										: '-'}
								</span>
								{#if shift.ot_start_time && shift.ot_end_time}
									<span
										class="w-fit rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-500"
										>OT: {formatTime(shift.ot_start_time)} - {formatTime(shift.ot_end_time)}</span
									>
								{/if}
							</div>
						</td>
						<td class="px-6 py-4">
							<span
								class="rounded-full px-2.5 py-1 text-xs font-semibold {shift.status === 'Active'
									? 'bg-green-100 text-green-700'
									: 'bg-red-100 text-red-700'}"
							>
								{shift.status}
							</span>
						</td>
						<td class="px-6 py-4 text-center">
							<div class="flex items-center justify-center gap-2">
								<button
									onclick={() => openModal('edit', shift)}
									class="rounded p-1.5 text-gray-400 transition-colors hover:bg-yellow-50 hover:text-yellow-600"
								>
									<span class="material-symbols-outlined text-[20px]">edit</span>
								</button>
								<button
									onclick={() => (itemToDelete = shift)}
									class="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
								>
									<span class="material-symbols-outlined text-[20px]">delete</span>
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<!-- Modal เพิ่ม/แก้ไขข้อมูลกะ -->
{#if modalMode && selectedItem}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div
			transition:slide={{ duration: 200 }}
			class="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl"
		>
			<div class="flex items-center justify-between border-b bg-gray-50 px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? $t('เพิ่มรูปแบบกะใหม่') : $t('แก้ไขข้อมูลกะ')}
				</h2>
				<button onclick={closeModal} class="text-gray-400 hover:text-gray-600">
					<span class="material-symbols-outlined">close</span>
				</button>
			</div>

			<form
				method="POST"
				action="?/save"
				use:enhance={() => {
					isSaving = true;
					return async ({ update }) => {
						await update();
						isSaving = false;
					};
				}}
				class="p-6"
			>
				<input type="hidden" name="mode" value={modalMode} />
				<input type="hidden" name="original_code" value={selectedItem.shift_code} />

				<div
					class="mb-4 flex items-center justify-center gap-4 rounded-lg border border-gray-100 bg-gray-50 p-4"
				>
					<div class="text-sm font-medium text-gray-500">พรีวิวการแสดงผล:</div>
					<div
						class={`flex h-10 w-10 items-center justify-center rounded border text-lg font-bold shadow-sm ${getThemeClasses(selectedItem.color_theme)}`}
					>
						{selectedItem.shift_code || '?'}
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="col-span-1">
						<label for="shift_code" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('รหัสกะ (ตัวย่อ)')} *</label
						>
						<input
							id="shift_code"
							type="text"
							name="shift_code"
							maxlength="5"
							placeholder="เช่น D, N, O"
							bind:value={selectedItem.shift_code}
							required
							class="w-full rounded-md border-gray-300 uppercase shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
						/>
					</div>
					<div class="col-span-1">
						<label for="shift_name" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('ชื่อเต็มของกะ')} *</label
						>
						<input
							id="shift_name"
							type="text"
							name="shift_name"
							placeholder="เช่น Day Shift"
							bind:value={selectedItem.shift_name}
							required
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
						/>
					</div>

					<div class="col-span-2">
						<label for="shift_category" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('ประเภทกะ (มีผลกับสูตรคำนวณ OT)')}</label
						>
						<select
							id="shift_category"
							name="shift_category"
							bind:value={selectedItem.shift_category}
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
						>
							<option value="Normal">วันทำงานปกติ (Normal)</option>
							<option value="Holiday">วันหยุด / วันหยุดนักขัตฤกษ์ (Holiday)</option>
						</select>
						<p class="mt-1 text-[11px] text-gray-500">
							หากเลือก 'วันหยุด' ระบบจะคำนวณ OT: 8 ชม.แรก = 1 แรง, หลังจากนั้น = 3 แรง
						</p>
					</div>

					<div class="col-span-1">
						<label for="start_time" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('เวลาเริ่มงาน')}</label
						>
						<input
							id="start_time"
							type="time"
							name="start_time"
							bind:value={selectedItem.start_time}
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
						/>
					</div>
					<div class="col-span-1">
						<label for="end_time" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('เวลาเลิกงาน')}</label
						>
						<input
							id="end_time"
							type="time"
							name="end_time"
							bind:value={selectedItem.end_time}
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
						/>
					</div>

					<div class="col-span-1">
						<label for="ot_start_time" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('เวลาเริ่ม OT')}</label
						>
						<input
							id="ot_start_time"
							type="time"
							name="ot_start_time"
							bind:value={selectedItem.ot_start_time}
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
						/>
					</div>
					<div class="col-span-1">
						<label for="ot_end_time" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('เวลาเลิก OT')}</label
						>
						<input
							id="ot_end_time"
							type="time"
							name="ot_end_time"
							bind:value={selectedItem.ot_end_time}
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
						/>
					</div>

					<div class="col-span-2">
						<label for="color_theme" class="mb-2 block text-sm font-semibold text-gray-700"
							>{$t('สีสำหรับแสดงผล')}</label
						>
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
							{#each colorThemes as theme}
								<label class="cursor-pointer">
									<input
										type="radio"
										name="color_theme"
										value={theme.id}
										bind:group={selectedItem.color_theme}
										class="peer sr-only"
									/>
									<div
										class={`rounded-md border-2 p-2 text-center text-xs font-semibold transition-all peer-checked:ring-2 peer-checked:ring-indigo-500 peer-checked:ring-offset-1 ${theme.id === selectedItem.color_theme ? 'border-indigo-500' : 'border-transparent'} ${theme.classes}`}
									>
										{theme.name}
									</div>
								</label>
							{/each}
						</div>
					</div>

					<div class="col-span-2">
						<label for="status" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('สถานะ')}</label
						>
						<select
							id="status"
							name="status"
							bind:value={selectedItem.status}
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
						>
							<option value="Active">Active (เปิดใช้งาน)</option>
							<option value="Inactive">Inactive (ปิดการใช้งาน)</option>
						</select>
					</div>
				</div>

				<div class="mt-6 flex justify-end gap-3 border-t pt-4">
					<button
						type="button"
						onclick={closeModal}
						class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
					>
						{$t('Cancel')}
					</button>
					<button
						type="submit"
						disabled={isSaving}
						class="rounded-md bg-indigo-600 px-6 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-70"
					>
						{isSaving ? $t('Saving...') : $t('Save Changes')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Modal ยืนยันการลบ -->
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
			<h3 class="text-lg font-bold text-gray-900">{$t('ยืนยันการลบกะ')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				ต้องการลบรหัสกะ <strong class="text-gray-900"
					>{itemToDelete.shift_code} ({itemToDelete.shift_name})</strong
				> ใช่หรือไม่?
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
				<input type="hidden" name="shift_code" value={itemToDelete.shift_code} />
				<button
					type="button"
					onclick={() => (itemToDelete = null)}
					class="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
				>
					{$t('Cancel')}
				</button>
				<button
					type="submit"
					disabled={isDeleting}
					class="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-70"
				>
					{isDeleting ? $t('Deleting...') : $t('Confirm')}
				</button>
			</form>
		</div>
	</div>
{/if}
