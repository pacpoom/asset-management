<script lang="ts">
	import { enhance } from '$app/forms';

	export let data;

	$: vessels = data.vessels || [];
	$: liners = data.liners || [];

	let searchQuery = '';
	$: filteredVessels = vessels.filter((v: any) =>
		v.vessel_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
		v.liner_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
		v.liner_code?.toLowerCase().includes(searchQuery.toLowerCase())
	);

	// ─── Form Modal (Add / Edit) ──────────────────────────────────────────────
	let showFormModal = false;
	let formMode: 'create' | 'edit' = 'create';
	let isSaving = false;
	let formData = {
		id: '',
		vessel_name: '',
		liner_id: '',
		storage_days: 3,
		demurrage_days: 3,
		detention_days: 32,
		status: 'Active'
	};

	function openCreateModal() {
		formMode = 'create';
		formData = {
			id: '',
			vessel_name: '',
			liner_id: '',
			storage_days: 3,
			demurrage_days: 3,
			detention_days: 32,
			status: 'Active'
		};
		showFormModal = true;
	}

	function openEditModal(vessel: any) {
		formMode = 'edit';
		formData = {
			id: String(vessel.id),
			vessel_name: vessel.vessel_name || '',
			liner_id: vessel.liner_id ? String(vessel.liner_id) : '',
			storage_days: vessel.storage_days ?? 3,
			demurrage_days: vessel.demurrage_days ?? 3,
			detention_days: vessel.detention_days ?? 32,
			status: vessel.status || 'Active'
		};
		showFormModal = true;
	}

	function closeFormModal() {
		showFormModal = false;
		isSaving = false;
	}

	// ─── Delete Modal ─────────────────────────────────────────────────────────
	let showDeleteModal = false;
	let isDeleting = false;
	let deleteTarget = { id: '', name: '' };

	function openDeleteModal(vessel: any) {
		deleteTarget = { id: String(vessel.id), name: vessel.vessel_name };
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
		isDeleting = false;
	}
</script>

<svelte:head>
	<title>Vessel Master</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-6">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-800">Vessel Master</h1>
		<p class="text-sm text-gray-500">จัดการข้อมูลเรือและกำหนดค่า Free Days</p>
	</div>

	<!-- Toolbar -->
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="relative w-full sm:w-72">
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<svg
					class="h-4 w-4 text-gray-400"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
					/>
				</svg>
			</div>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="ค้นหาชื่อเรือหรือสายเรือ..."
				class="block w-full rounded-lg border-0 py-2 pr-3 pl-10 text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-blue-600 focus:ring-inset sm:text-sm"
			/>
		</div>

		<button
			onclick={openCreateModal}
			class="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="2"
				stroke="currentColor"
				class="h-5 w-5"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
			</svg>
			เพิ่ม Vessel
		</button>
	</div>

	<!-- Table -->
	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50 text-gray-700">
					<tr>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase">#</th>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase">ชื่อเรือ</th>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase">สายเรือ</th>
						<th class="px-6 py-3 text-center text-xs font-semibold tracking-wider uppercase">Storage (วัน)</th>
						<th class="px-6 py-3 text-center text-xs font-semibold tracking-wider uppercase">Demurrage (วัน)</th>
						<th class="px-6 py-3 text-center text-xs font-semibold tracking-wider uppercase">Detention (วัน)</th>
						<th class="px-6 py-3 text-center text-xs font-semibold tracking-wider uppercase">Status</th>
						<th class="px-6 py-3 text-center text-xs font-semibold tracking-wider uppercase">Action</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#each filteredVessels as vessel, i}
						<tr class="transition-colors hover:bg-gray-50">
							<td class="px-6 py-4 text-gray-400 text-xs">{i + 1}</td>
							<td class="px-6 py-4">
								<div class="font-semibold text-gray-900">{vessel.vessel_name}</div>
							</td>
							<td class="px-6 py-4">
								{#if vessel.liner_name}
									<div class="flex items-center gap-2">
										{#if vessel.liner_code}
											<span class="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600 ring-1 ring-gray-500/10 ring-inset">
												{vessel.liner_code}
											</span>
										{/if}
										<span class="text-gray-700">{vessel.liner_name}</span>
									</div>
								{:else}
									<span class="text-gray-400">-</span>
								{/if}
							</td>
							<td class="px-6 py-4 text-center">
								<span class="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
									{vessel.storage_days}
								</span>
							</td>
							<td class="px-6 py-4 text-center">
								<span class="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
									{vessel.demurrage_days}
								</span>
							</td>
							<td class="px-6 py-4 text-center">
								<span class="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
									{vessel.detention_days}
								</span>
							</td>
							<td class="px-6 py-4 text-center">
								{#if vessel.status === 'Active'}
									<span class="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
										Active
									</span>
								{:else}
									<span class="inline-flex items-center rounded-full bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-500/10 ring-inset">
										Inactive
									</span>
								{/if}
							</td>
							<td class="px-6 py-4 text-center">
								<div class="flex justify-center gap-2">
									<button
										type="button"
										onclick={() => openEditModal(vessel)}
										class="text-gray-400 transition-colors hover:text-yellow-600"
										title="Edit"
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
											<path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
										</svg>
									</button>
									<button
										type="button"
										onclick={() => openDeleteModal(vessel)}
										class="text-gray-400 transition-colors hover:text-red-600"
										title="Delete"
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
											<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
										</svg>
									</button>
								</div>
							</td>
						</tr>
					{/each}
					{#if filteredVessels.length === 0}
						<tr>
							<td colspan="8" class="py-12 text-center text-gray-400">
								{searchQuery ? 'ไม่พบข้อมูลที่ค้นหา' : 'ยังไม่มีข้อมูล Vessel'}
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- ════════════════════════════════════════════════════════════
     Form Modal (Add / Edit)
════════════════════════════════════════════════════════════ -->
{#if showFormModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
		<div class="animate-in fade-in zoom-in-95 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl duration-200">
			<!-- Modal Header -->
			<div class="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
				<h3 class="text-lg font-bold text-gray-800">
					{formMode === 'create' ? 'เพิ่ม Vessel ใหม่' : 'แก้ไข Vessel'}
				</h3>
				<button
					type="button"
					onclick={closeFormModal}
					class="text-gray-400 hover:text-gray-600 focus:outline-none"
					aria-label="Close"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-6 w-6">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Form Body -->
			<form
				method="POST"
				action="?/save"
				class="flex flex-1 flex-col overflow-hidden"
				use:enhance={() => {
					isSaving = true;
					return async ({ update }) => {
						await update();
						closeFormModal();
					};
				}}
			>
				<input type="hidden" name="id" value={formData.id} />

				<div class="flex-1 overflow-y-auto">
					<div class="space-y-5 p-6">
						<!-- ชื่อเรือ -->
						<div>
							<label for="vessel_name" class="mb-1 block text-sm font-semibold text-gray-700">
								ชื่อเรือ <span class="text-red-500">*</span>
							</label>
							<input
								type="text"
								id="vessel_name"
								name="vessel_name"
								bind:value={formData.vessel_name}
								required
								placeholder="กรอกชื่อเรือ"
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>

						<!-- สายเรือ -->
						<div>
							<label for="liner_id" class="mb-1 block text-sm font-semibold text-gray-700">
								สายเรือ (Liner)
							</label>
							<select
								id="liner_id"
								name="liner_id"
								bind:value={formData.liner_id}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							>
								<option value="">— ไม่ระบุ —</option>
								{#each liners as liner}
									<option value={String(liner.id)}>
										{liner.code ? `[${liner.code}] ` : ''}{liner.name}
									</option>
								{/each}
							</select>
						</div>

						<!-- Free Days -->
						<div class="border-t border-gray-100 pt-4">
							<h4 class="mb-3 text-xs font-bold tracking-wider text-gray-400 uppercase">Free Days</h4>
							<div class="grid grid-cols-3 gap-4">
								<div>
									<label for="storage_days" class="mb-1 block text-sm font-medium text-gray-700">
										Storage Charge
									</label>
									<div class="relative">
										<input
											type="number"
											id="storage_days"
											name="storage_days"
											bind:value={formData.storage_days}
											min="0"
											max="999"
											class="w-full rounded-md border-gray-300 pr-10 shadow-sm focus:border-blue-500 focus:ring-blue-500"
										/>
										<span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400">วัน</span>
									</div>
								</div>
								<div>
									<label for="demurrage_days" class="mb-1 block text-sm font-medium text-gray-700">
										Demurrage
									</label>
									<div class="relative">
										<input
											type="number"
											id="demurrage_days"
											name="demurrage_days"
											bind:value={formData.demurrage_days}
											min="0"
											max="999"
											class="w-full rounded-md border-gray-300 pr-10 shadow-sm focus:border-blue-500 focus:ring-blue-500"
										/>
										<span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400">วัน</span>
									</div>
								</div>
								<div>
									<label for="detention_days" class="mb-1 block text-sm font-medium text-gray-700">
										Detention
									</label>
									<div class="relative">
										<input
											type="number"
											id="detention_days"
											name="detention_days"
											bind:value={formData.detention_days}
											min="0"
											max="999"
											class="w-full rounded-md border-gray-300 pr-10 shadow-sm focus:border-blue-500 focus:ring-blue-500"
										/>
										<span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400">วัน</span>
									</div>
								</div>
							</div>
						</div>

						<!-- Status -->
						<div class="border-t border-gray-100 pt-4">
							<label for="status" class="mb-1 block text-sm font-semibold text-gray-700">Status</label>
							<select
								id="status"
								name="status"
								bind:value={formData.status}
								class="w-full rounded-md border-gray-300 font-medium shadow-sm focus:border-blue-500 focus:ring-blue-500"
							>
								<option value="Active">Active (เปิดใช้งาน)</option>
								<option value="Inactive">Inactive (ปิดใช้งาน)</option>
							</select>
						</div>
					</div>
				</div>

				<!-- Modal Footer -->
				<div class="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
					<button
						type="button"
						onclick={closeFormModal}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
					>
						ยกเลิก
					</button>
					<button
						type="submit"
						disabled={isSaving}
						class="flex items-center justify-center rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white hover:bg-blue-700 focus:outline-none disabled:opacity-70"
					>
						{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ════════════════════════════════════════════════════════════
     Delete Confirm Modal
════════════════════════════════════════════════════════════ -->
{#if showDeleteModal}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
		<div class="animate-in fade-in zoom-in-95 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl duration-200">
			<div class="p-6">
				<div class="flex items-start gap-4">
					<div class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:h-10 sm:w-10">
						<svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
					</div>
					<div class="mt-1 text-left sm:mt-0">
						<h3 class="text-lg leading-6 font-bold text-gray-900">ยืนยันการลบ</h3>
						<div class="mt-2">
							<p class="text-sm text-gray-500">
								คุณต้องการลบเรือ <span class="font-bold text-gray-800">{deleteTarget.name}</span> ใช่หรือไม่?
							</p>
						</div>
					</div>
				</div>
			</div>

			<div class="flex justify-end gap-3 bg-gray-50 px-6 py-4">
				<button
					type="button"
					onclick={closeDeleteModal}
					disabled={isDeleting}
					class="inline-flex justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50"
				>
					ยกเลิก
				</button>
				<form
					method="POST"
					action="?/delete"
					class="m-0"
					use:enhance={() => {
						isDeleting = true;
						return async ({ update }) => {
							await update();
							closeDeleteModal();
						};
					}}
				>
					<input type="hidden" name="id" value={deleteTarget.id} />
					<button
						type="submit"
						disabled={isDeleting}
						class="inline-flex justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50"
					>
						{isDeleting ? 'กำลังลบ...' : 'ลบ'}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
