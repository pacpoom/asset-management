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

	let showEditDetailModal = false;
	let editingDetail: any = null;
	let showDeleteDetailModal = false;
	let deletingDetail: any = null;
	let isDeletingDetail = false;

	function openEditDetail(item: any) {
		editingDetail = { ...item };
		showEditDetailModal = true;
	}
	function openDeleteDetail(item: any) {
		deletingDetail = item;
		showDeleteDetailModal = true;
	}
	function closeDeleteDetail() {
		showDeleteDetailModal = false;
		deletingDetail = null;
	}

	function selectMaster(id: number) {
		goto(`?master_id=${id}`);
	}

	let showEditMasterModal = false;
	let editingMaster: any = null;
	let showDeleteMasterModal = false;
	let deletingMaster: any = null;
	let isDeletingMaster = false;

	function openEditMaster(m: any) {
		editingMaster = { ...m };
		showEditMasterModal = true;
	}
	function openDeleteMaster(m: any) {
		deletingMaster = m;
		showDeleteMasterModal = true;
	}
	function closeDeleteMaster() {
		showDeleteMasterModal = false;
		deletingMaster = null;
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
					<div
						class="relative flex w-full items-center justify-between rounded-lg border transition-all duration-200 {selectedMasterId ===
						m.id
							? 'border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-500'
							: 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'}"
					>
						<button
							on:click={() => selectMaster(m.id)}
							class="flex flex-1 flex-col items-start gap-1 p-4 text-left"
						>
							<div class="flex w-full items-center justify-between">
								<span class="pr-2 font-bold text-slate-800">{m.Work_description}</span>
								{#if selectedMasterId === m.id}
									<div class="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500"></div>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								<span
									class="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-500"
									>{m.Work_Code}</span
								>
							</div>
						</button>

						<div class="flex flex-col gap-1 pr-3">
							<button
								type="button"
								on:click={() => openEditMaster(m)}
								class="rounded p-1.5 text-slate-400 transition hover:bg-indigo-100 hover:text-indigo-600"
								title="แก้ไขหมวดหมู่"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="h-4 w-4"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
									/></svg
								>
							</button>
							<button
								type="button"
								on:click={() => openDeleteMaster(m)}
								class="rounded p-1.5 text-slate-400 transition hover:bg-red-100 hover:text-red-600"
								title="ลบหมวดหมู่"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="h-4 w-4"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
									/></svg
								>
							</button>
						</div>
					</div>
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
												<div class="flex justify-center gap-2">
													<button
														type="button"
														on:click={() => openEditDetail(item)}
														class="rounded p-1.5 text-slate-400 transition hover:bg-yellow-50 hover:text-yellow-600"
														title={$t('Edit') || 'แก้ไขรายการนี้'}
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															fill="none"
															viewBox="0 0 24 24"
															stroke-width="1.5"
															stroke="currentColor"
															class="h-5 w-5"
															><path
																stroke-linecap="round"
																stroke-linejoin="round"
																d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
															/></svg
														>
													</button>
													<button
														type="button"
														on:click={() => openDeleteDetail(item)}
														class="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
														title={$t('Delete') || 'ลบรายการนี้'}
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															fill="none"
															viewBox="0 0 24 24"
															stroke-width="1.5"
															stroke="currentColor"
															class="h-5 w-5"
															><path
																stroke-linecap="round"
																stroke-linejoin="round"
																d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
															/></svg
														>
													</button>
												</div>
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
				<div class="space-y-4 p-6">
					<div>
						<label for="category_code" class="mb-1.5 block text-sm font-semibold text-slate-700"
							>{$t('รหัสอ้างอิง / เลขเอกสาร')} <span class="text-red-500">*</span></label
						>
						<input
							id="category_code"
							type="text"
							name="code"
							placeholder="เช่น PM-01, ENG-001"
							class="w-full rounded-lg border border-slate-300 p-2.5 text-slate-800 focus:border-slate-800 focus:ring-2 focus:ring-slate-800/20 focus:outline-none"
							required
						/>
					</div>
					<div>
						<label for="category_name" class="mb-1.5 block text-sm font-semibold text-slate-700"
							>{$t('Category Name')} <span class="text-red-500">*</span></label
						>
						<input
							id="category_name"
							type="text"
							name="name"
							placeholder="ชื่อหมวดหมู่..."
							class="w-full rounded-lg border border-slate-300 p-2.5 text-slate-800 focus:border-slate-800 focus:ring-2 focus:ring-slate-800/20 focus:outline-none"
							required
						/>
					</div>
				</div>
				<div class="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
					<button
						type="button"
						on:click={() => (showAddFlowModal = false)}
						class="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
						>ยกเลิก</button
					>
					<button
						type="submit"
						class="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-900"
						>สร้างหมวดหมู่</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

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
						>{$t('Cancel')}</button
					>
					<button
						type="submit"
						class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
						>{$t('Save')}</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if showEditMasterModal && editingMaster}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
			<div class="bg-indigo-600 px-6 py-4">
				<h3 class="text-lg font-bold text-white">{$t('แก้ไขหมวดหมู่การตรวจสอบ')}</h3>
			</div>
			<form
				method="POST"
				action="?/updateMaster"
				use:enhance={() => {
					return async ({ update, result }) => {
						await update();
						if (result.type === 'success') showEditMasterModal = false;
					};
				}}
			>
				<input type="hidden" name="id" value={editingMaster.id} />
				<div class="space-y-4 p-6">
					<div>
						<label for="edit_master_code" class="mb-1.5 block text-sm font-semibold text-slate-700"
							>{$t('รหัสอ้างอิง / เลขเอกสาร')} <span class="text-red-500">*</span></label
						>
						<input
							id="edit_master_code"
							type="text"
							name="code"
							bind:value={editingMaster.Work_Code}
							class="w-full rounded-lg border border-slate-300 p-2.5 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
							required
						/>
					</div>
					<div>
						<label for="edit_master_name" class="mb-1.5 block text-sm font-semibold text-slate-700"
							>{$t('Category Name')} <span class="text-red-500">*</span></label
						>
						<input
							id="edit_master_name"
							type="text"
							name="name"
							bind:value={editingMaster.Work_description}
							class="w-full rounded-lg border border-slate-300 p-2.5 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
							required
						/>
					</div>
				</div>
				<div class="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
					<button
						type="button"
						on:click={() => (showEditMasterModal = false)}
						class="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
						>{$t('Cancel')}</button
					>
					<button
						type="submit"
						class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
						>{$t('Save')}</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if showEditDetailModal && editingDetail}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
			<div class="bg-yellow-500 px-6 py-4">
				<h3 class="text-lg font-bold text-white">{$t('แก้ไขจุดตรวจสอบ')}</h3>
				{#if selectedMaster}
					<p class="mt-0.5 text-sm text-yellow-50">
						{$t('Category')}
						{selectedMaster.Work_description}
					</p>
				{/if}
			</div>
			<form
				method="POST"
				action="?/updateDetail"
				use:enhance={() => {
					return async ({ update, result }) => {
						await update();
						if (result.type === 'success') showEditDetailModal = false;
					};
				}}
			>
				<input type="hidden" name="id" value={editingDetail.id} />
				<div class="space-y-5 p-6">
					<div>
						<label for="edit_work_name" class="mb-1.5 block text-sm font-semibold text-slate-700"
							>{$t('Point Name')} <span class="text-red-500">*</span></label
						>
						<input
							id="edit_work_name"
							type="text"
							name="work_name"
							bind:value={editingDetail.work_name}
							class="w-full rounded-lg border border-slate-300 p-2.5 text-slate-800 focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20 focus:outline-none"
							required
						/>
					</div>
				</div>
				<div class="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
					<button
						type="button"
						on:click={() => (showEditDetailModal = false)}
						class="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
						>{$t('Cancel')}</button
					>
					<button
						type="submit"
						class="rounded-lg bg-yellow-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-yellow-600"
						>{$t('Save')}</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if showDeleteMasterModal && deletingMaster}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b bg-red-600 px-6 py-4 text-white">
				<h3 class="text-lg font-bold">{$t('ยืนยันการลบหมวดหมู่')}</h3>
			</div>
			<div class="p-6 text-center text-slate-700">
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
				<p class="mb-2 text-lg font-bold">{$t('คุณแน่ใจหรือไม่ที่จะลบหมวดหมู่นี้?')}</p>
				<p class="mb-4 text-sm font-semibold text-red-500">
					{$t('(คำเตือน: จุดตรวจสอบที่อยู่ข้างในจะถูกลบไปด้วย!)')}
				</p>
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
					<p>
						{$t('หมวดหมู่')}:
						<span class="font-bold text-slate-800">{deletingMaster.Work_description}</span>
					</p>
				</div>
			</div>
			<div class="flex justify-end gap-3 border-t bg-slate-50 px-6 py-4">
				<button
					type="button"
					on:click={closeDeleteMaster}
					class="rounded-lg border bg-white px-5 py-2 font-semibold text-slate-600 transition hover:bg-slate-100"
					>{$t('Cancel')}</button
				>
				<form
					method="POST"
					action="?/deleteMaster"
					use:enhance={() => {
						isDeletingMaster = true;
						return async ({ update }) => {
							await update();
							isDeletingMaster = false;
							closeDeleteMaster();
						};
					}}
				>
					<input type="hidden" name="id" value={deletingMaster.id} />
					<button
						type="submit"
						disabled={isDeletingMaster}
						class="rounded-lg bg-red-600 px-6 py-2 font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
					>
						{isDeletingMaster ? $t('กำลังลบ...') : $t('ยืนยันการลบ')}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}

{#if showDeleteDetailModal && deletingDetail}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b bg-red-600 px-6 py-4 text-white">
				<h3 class="text-lg font-bold">{$t('ยืนยันการลบจุดตรวจสอบ')}</h3>
			</div>
			<div class="p-6 text-center text-slate-700">
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
				<p class="mb-2 text-lg font-bold">{$t('คุณแน่ใจหรือไม่ที่จะลบรายการนี้?')}</p>
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
					<p>
						{$t('จุดตรวจสอบ')}:
						<span class="font-bold text-slate-800">{deletingDetail.work_name}</span>
					</p>
				</div>
			</div>
			<div class="flex justify-end gap-3 border-t bg-slate-50 px-6 py-4">
				<button
					type="button"
					on:click={closeDeleteDetail}
					class="rounded-lg border bg-white px-5 py-2 font-semibold text-slate-600 transition hover:bg-slate-100"
					>{$t('Cancel')}</button
				>
				<form
					method="POST"
					action="?/deleteDetail"
					use:enhance={() => {
						isDeletingDetail = true;
						return async ({ update }) => {
							await update();
							isDeletingDetail = false;
							closeDeleteDetail();
						};
					}}
				>
					<input type="hidden" name="id" value={deletingDetail.id} />
					<button
						type="submit"
						disabled={isDeletingDetail}
						class="rounded-lg bg-red-600 px-6 py-2 font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
					>
						{isDeletingDetail ? $t('กำลังลบ...') : $t('ยืนยันการลบ')}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
