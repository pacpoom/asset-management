<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';

	export let data;
	$: masters = data.masters || [];
	$: details = data.details || [];
	$: selectedMasterId = data.selectedMasterId;

	$: selectedMaster = masters.find((m: any) => m.id === selectedMasterId) || null;

	let showAddModal = false;
	let showAddFlowModal = false;

	function selectMaster(id: number) {
		goto(`?master_id=${id}`);
	}
</script>

<div class="min-h-screen bg-slate-50 p-6">
	<div class="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-slate-800">{$t('Inspection Master')}</h1>
			<p class="text-sm text-slate-500">
				{$t('จัดการหมวดหมู่และจุดที่ต้องตรวจสอบของรถยนต์ก่อนส่งมอบ')}
			</p>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
		<div class="flex flex-col gap-4 lg:col-span-4">
			<div
				class="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
			>
				<div class="flex items-center gap-2">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5 text-blue-600"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h7" /></svg
					>
					<h2 class="font-bold text-slate-700">{$t('หมวดหมู่การตรวจสอบ')}</h2>
				</div>
				<button
					on:click={() => (showAddFlowModal = true)}
					class="flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-100"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg
					>
					{$t('Add Category')}
				</button>
			</div>

			<div class="flex max-h-[calc(100vh-220px)] flex-col gap-2 overflow-y-auto pr-1 pb-4">
				{#each masters as m}
					<button
						on:click={() => selectMaster(m.id)}
						class="flex w-full flex-col items-start gap-1 rounded-lg border p-4 text-left transition-all duration-200 {selectedMasterId ===
						m.id
							? 'border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-500'
							: 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'}"
					>
						<div class="flex w-full items-center justify-between">
							<span class="font-bold text-slate-800">{m.Work_description}</span>
							{#if selectedMasterId === m.id}
								<div class="h-2 w-2 rounded-full bg-blue-500"></div>
							{/if}
						</div>
						<div class="flex items-center gap-2">
							<span
								class="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-500"
							>
								{m.Work_Code}
							</span>
						</div>
					</button>
				{/each}

				{#if masters.length === 0}
					<div
						class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500"
					>
						{$t('ไม่มีหมวดหมู่การตรวจสอบ')}<br />{$t('กดปุ่ม "เพิ่มหมวด" ด้านบน')}
					</div>
				{/if}
			</div>
		</div>

		<div class="flex h-full flex-col lg:col-span-8">
			<div
				class="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
			>
				<div
					class="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4"
				>
					<div>
						<h2 class="text-lg font-bold text-slate-800">{$t('Inspection Points')}</h2>
						{#if selectedMaster}
							<p class="mt-0.5 text-sm text-slate-500">
								{$t('Category')}
								<span class="font-semibold text-blue-600">{selectedMaster.Work_description}</span>
							</p>
						{:else}
							<p class="mt-0.5 text-sm text-slate-500">{$t('กรุณาเลือกหมวดหมู่จากเมนูด้านซ้าย')}</p>
						{/if}
					</div>

					<button
						disabled={!selectedMasterId}
						on:click={() => (showAddModal = true)}
						class="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-70"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg
						>
						{$t('Add Checkpoint')}
					</button>
				</div>

				<div class="flex-1 overflow-auto bg-white p-6">
					{#if !selectedMasterId}
						<div
							class="flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mb-3 h-12 w-12 text-slate-300"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
								/></svg
							>
							<p class="font-medium text-slate-500">{$t('กรุณาเลือกหมวดหมู่การตรวจสอบด้านซ้าย')}</p>
							<p class="text-sm">{$t('เพื่อดูหรือจัดการจุดที่ต้องตรวจสอบ')}</p>
						</div>
					{:else}
						<div class="overflow-hidden rounded-lg border border-slate-200">
							<table class="w-full text-left text-sm">
								<thead class="border-b border-slate-200 bg-slate-50 text-slate-600">
									<tr>
										<th class="w-16 p-4 text-center font-semibold">{$t('ID')}</th>
										<th class="p-4 font-semibold">{$t('Point Name')}</th>
										<th class="w-40 p-4 text-center font-semibold">{$t('Preview')}</th>
										<th class="w-32 p-4 text-center font-semibold whitespace-nowrap"
											>{$t('Actions')}</th
										>
									</tr>
								</thead>
								<tbody class="divide-y divide-slate-100">
									{#each details as item, i}
										<tr class="transition hover:bg-slate-50/80">
											<td class="p-4 text-center font-mono text-slate-400">{i + 1}</td>
											<td class="p-4 font-medium text-slate-800">{item.work_name}</td>
											<td class="p-4 text-center">
												<div class="inline-flex rounded-md opacity-60 shadow-sm">
													<span
														class="rounded-l-md border border-green-200 bg-green-50 px-3 py-1 text-xs font-bold text-green-700"
														>OK</span
													>
													<span
														class="rounded-r-md border border-l-0 border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700"
														>NG</span
													>
												</div>
											</td>
											<td class="p-4 text-center">
												<form method="POST" action="?/deleteDetail" use:enhance>
													<input type="hidden" name="id" value={item.id} />
													<button
														class="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
														title="ลบรายการนี้"
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															fill="none"
															viewBox="0 0 24 24"
															stroke-width="1.5"
															stroke="currentColor"
															class="h-5 w-5"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
															/>
														</svg>
													</button>
												</form>
											</td>
										</tr>
									{/each}
									{#if details.length === 0}
										<tr>
											<td colspan="4" class="py-12 text-center text-slate-500">
												ยังไม่มีจุดตรวจสอบในหมวดหมู่นี้ <br />
												<span class="text-sm"
													>กดปุ่ม "เพิ่มจุดตรวจสอบ" เพื่อเริ่มสร้าง Checklist</span
												>
											</td>
										</tr>
									{/if}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

{#if showAddModal && selectedMaster}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
			<div class="bg-blue-600 px-6 py-4">
				<h3 class="text-lg font-bold text-white">{$t('Add Inspection Point')}</h3>
				<p class="mt-0.5 text-sm text-blue-100">
					{$t('Category')}
					{selectedMaster.Work_description}
				</p>
			</div>
			<form
				method="POST"
				action="?/addDetail"
				use:enhance={() => {
					return async ({ update, result }) => {
						await update();
						if (result.type === 'success') showAddModal = false;
					};
				}}
			>
				<input type="hidden" name="work_id" value={selectedMasterId} />

				<div class="space-y-5 p-6">
					<div>
						<label for="work_code" class="mb-1.5 block text-sm font-semibold text-slate-700"
							>{$t('รหัสอ้างอิง (หมวดหมู่)')}</label
						>
						<input
							id="work_code"
							type="text"
							value={selectedMaster.Work_Code}
							class="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-500"
							readonly
						/>
					</div>

					<div>
						<label for="work_name" class="mb-1.5 block text-sm font-semibold text-slate-700"
							>{$t('Point Name')} <span class="text-red-500">*</span></label
						>
						<input
							id="work_name"
							type="text"
							name="work_name"
							class="w-full rounded-lg border border-slate-300 p-2.5 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
							required
						/>
						<p class="mt-1.5 text-xs text-slate-500">
							{$t('ระบุจุดของรถยนต์ที่พนักงานต้องทำการเดินตรวจสอบ')}
						</p>
					</div>
				</div>

				<div class="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
					<button
						type="button"
						on:click={() => (showAddModal = false)}
						class="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
					>
						{$t('Cancel')}
					</button>
					<button
						type="submit"
						class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
					>
						{$t('Seve')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if showAddFlowModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
			<div class="bg-slate-800 px-6 py-4">
				<h3 class="text-lg font-bold text-white">{$t('เพิ่มหมวดหมู่การตรวจสอบ')}</h3>
				<p class="mt-0.5 text-sm text-slate-300">
					{$t('สร้างกลุ่มเพื่อให้ง่ายต่อการเช็ครถตามจุดต่างๆ')}
				</p>
			</div>
			<form
				method="POST"
				action="?/addMaster"
				use:enhance={() => {
					return async ({ update, result }) => {
						await update();
						if (result.type === 'success') showAddFlowModal = false;
					};
				}}
			>
				<div class="space-y-2 p-6">
					<label for="category_name" class="mb-1 block text-sm font-semibold text-slate-700"
						>{$t('Category Name')} <span class="text-red-500">*</span></label
					>
					<input
						id="category_name"
						type="text"
						name="name"
						class="w-full rounded-lg border border-slate-300 p-2.5 text-slate-800 focus:border-slate-800 focus:ring-2 focus:ring-slate-800/20 focus:outline-none"
						required
					/>
					<p class="mt-2 text-xs text-slate-400">
						ระบบจะทำการสร้างรหัส Code (เช่น WC-12345) ให้อัตโนมัติ
					</p>
				</div>
				<div class="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
					<button
						type="button"
						on:click={() => (showAddFlowModal = false)}
						class="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
					>
						ยกเลิก
					</button>
					<button
						type="submit"
						class="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-900"
					>
						สร้างหมวดหมู่
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
