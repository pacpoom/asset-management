<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';

	export let data: any;
	export let form: any;

	let solutions = data.solutions || [];
	let isModalOpen = false;
	let editingItem: any = null;

	function openAddModal() {
		editingItem = null;
		isModalOpen = true;
	}

	function openEditModal(item: any) {
		editingItem = { ...item };
		isModalOpen = true;
	}

	function closeModal() {
		isModalOpen = false;
		editingItem = null;
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">{$t('รายการวิธีแก้ไข (Solutions)')}</h1>
		<button
			onclick={openAddModal}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
		>
			<span class="material-symbols-outlined text-sm">add</span>
			{$t('เพิ่มวิธีแก้ไข')}
		</button>
	</div>

	{#if form?.error}
		<div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">{form.error}</div>
	{/if}

	<div class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
		<table class="w-full text-left text-sm text-gray-600">
			<thead class="border-b border-gray-200 bg-gray-50 text-gray-700">
				<tr>
					<th class="w-16 px-6 py-4 text-center font-semibold">ID</th>
					<th class="w-1/3 px-6 py-4 font-semibold">{$t('ชื่อวิธีแก้ไข')}</th>
					<th class="px-6 py-4 font-semibold">{$t('คำอธิบายเพิ่มเติม')}</th>
					<th class="w-32 px-6 py-4 text-center font-semibold whitespace-nowrap">{$t('Action')}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-100">
				{#if solutions.length === 0}
					<tr
						><td colspan="4" class="px-6 py-8 text-center text-gray-400"
							>{$t('ไม่พบข้อมูลวิธีแก้ไข')}</td
						></tr
					>
				{:else}
					{#each solutions as item}
						<tr class="transition duration-150 hover:bg-blue-50/50">
							<td class="px-6 py-4 text-center font-medium">{item.id}</td>
							<td class="px-6 py-4 font-semibold text-gray-800">{item.name}</td>
							<td class="px-6 py-4 text-gray-500">{item.description || '-'}</td>
							<td class="px-6 py-4 text-center">
								<div class="flex justify-center gap-2">
									<button
										type="button"
										onclick={() => openEditModal(item)}
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
									</button>

									<form
										method="POST"
										action="?/delete"
										use:enhance
										onsubmit={() => confirm($t('คุณแน่ใจหรือไม่ที่จะลบรายการนี้?'))}
									>
										<input type="hidden" name="id" value={item.id} />
										<button
											type="submit"
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
									</form>
								</div>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>

{#if isModalOpen}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
				<h3 class="text-lg font-bold text-gray-800">
					{editingItem ? $t('แก้ไขวิธีแก้ไข') : $t('เพิ่มวิธีแก้ไขใหม่')}
				</h3>
				<button onclick={closeModal} class="text-gray-400 hover:text-gray-600"
					><span class="material-symbols-outlined">close</span></button
				>
			</div>

			<form
				method="POST"
				action={editingItem ? '?/update' : '?/create'}
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						closeModal();
					};
				}}
				class="space-y-4 p-6"
			>
				{#if editingItem}<input type="hidden" name="id" value={editingItem.id} />{/if}
				<div>
					<label for="solution-name" class="mb-1 block text-sm font-medium text-gray-700"
						>{$t('ชื่อวิธีแก้ไข')} <span class="text-red-500">*</span></label
					>
					<input
						id="solution-name"
						type="text"
						name="name"
						value={editingItem?.name || ''}
						required
						class="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
						placeholder={$t('เช่น ขัดสี, ทำสีใหม่, เปลี่ยนชิ้นส่วน')}
					/>
				</div>
				<div>
					<label for="solution-desc" class="mb-1 block text-sm font-medium text-gray-700"
						>{$t('คำอธิบาย')}</label
					>
					<textarea
						id="solution-desc"
						name="description"
						rows="3"
						class="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
						>{editingItem?.description || ''}</textarea
					>
				</div>
				<div class="flex justify-end gap-3 border-t border-gray-100 pt-4">
					<button
						type="button"
						onclick={closeModal}
						class="rounded-lg px-4 py-2 font-medium text-gray-600 transition hover:bg-gray-100"
						>{$t('ยกเลิก')}</button
					>
					<button
						type="submit"
						class="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white shadow-sm transition hover:bg-blue-700"
						>{$t('บันทึกข้อมูล')}</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}
