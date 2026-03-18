<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import { Toaster, toast } from 'svelte-sonner';

	export let data: any;
	export let form: any;

	let record = data.record;
	let items = data.ngItems.map((item: any) => ({
		...item,
		repair_status: item.repair_status || 'Pending',
		repair_note: item.repair_note || ''
	}));

	let isSubmitting = false;

	function prepareData() {
		return JSON.stringify(
			items.map((item: any) => ({
				id: item.id,
				repair_status: item.repair_status,
				repair_note: item.repair_note
			}))
		);
	}
</script>

<Toaster richColors position="top-right" />

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">{$t('บันทึกการซ่อมแก้ไข (Rework)')}</h1>
			<p class="mt-1 text-gray-500">
				รถรุ่น: <span class="font-semibold">{record.model}</span> | VIN:
				<span class="font-semibold text-blue-600">{record.vin_no}</span>
			</p>
		</div>
		<a
			href="/nc-tracking"
			class="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-200"
		>
			<span class="material-symbols-outlined text-sm">arrow_back</span>
			{$t('กลับหน้ารายการ')}
		</a>
	</div>

	{#if form?.error}
		<div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">{form.error}</div>
	{/if}

	<div class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
		<div class="flex items-center gap-2 border-b border-gray-100 bg-orange-50/50 p-4">
			<span class="material-symbols-outlined text-orange-500">build</span>
			<h2 class="font-bold text-gray-800">
				{$t('รายการที่ต้องแก้ไขทั้งหมด')} ({items.length} รายการ)
			</h2>
		</div>

		<form
			method="POST"
			action="?/saveRepair"
			use:enhance={() => {
				isSubmitting = true;
				return async ({ update, result }) => {
					isSubmitting = false;
					await update();
					if (result.type === 'success') {
						toast.success('บันทึกการซ่อมสำเร็จ!');
					}
				};
			}}
			class="p-6"
		>
			<input type="hidden" name="items" value={prepareData()} />

			<div class="space-y-6">
				{#each items as item, i}
					<div class="relative rounded-lg border border-gray-200 bg-gray-50/30 p-5">
						<div class="mb-4 flex items-start justify-between">
							<div>
								<h3 class="text-lg font-bold text-gray-800">{i + 1}. {item.work_name}</h3>
								<p class="mt-1 text-sm text-gray-500">
									ปัญหาที่พบ: <span class="font-semibold text-red-500">{item.defect || '-'}</span> |
									วิธีแก้เบื้องต้น: <span class="text-gray-700">{item.solution || '-'}</span>
								</p>
							</div>

							<select
								bind:value={item.repair_status}
								class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 {item.repair_status ===
								'Repaired'
									? 'border-green-200 bg-green-50 text-green-700'
									: 'border-orange-200 bg-orange-50 text-orange-700'}"
							>
								<option value="Pending">รอการซ่อม</option>
								<option value="Repaired">ซ่อมเสร็จแล้ว</option>
							</select>
						</div>

						<div>
							<label for="repair-note-{i}" class="mb-1 block text-sm font-medium text-gray-700"
								>บันทึกรายละเอียดการซ่อม (ช่างซ่อม)</label
							>
							<textarea
								id="repair-note-{i}"
								bind:value={item.repair_note}
								rows="2"
								class="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
								placeholder="อธิบายสิ่งที่ได้แก้ไขไปแล้ว..."
							></textarea>
						</div>
					</div>
				{/each}
			</div>

			<div class="mt-8 flex justify-end">
				<button
					type="submit"
					disabled={isSubmitting}
					class="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
				>
					{#if isSubmitting}
						<span class="material-symbols-outlined animate-spin">sync</span> กำลังบันทึก...
					{:else}
						<span class="material-symbols-outlined">save</span> บันทึกงานซ่อมทั้งหมด
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
