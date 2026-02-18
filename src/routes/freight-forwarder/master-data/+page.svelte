<script lang="ts">
	import { enhance } from '$app/forms';
	export let data;

	$: liners = data.liners || [];

	let searchQuery = '';
	$: filteredLiners = liners.filter(
		(l: any) =>
			(l.name && l.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
			(l.code && l.code.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	let showFormModal = false;
	let isSaving = false;
	let formMode: 'create' | 'edit' = 'create';
	let formData = {
		id: '',
		code: '',
		name: '',
		contact_person: '',
		phone: '',
		email: '',
		status: 'Active'
	};

	function openCreateModal() {
		formMode = 'create';
		formData = {
			id: '',
			code: '',
			name: '',
			contact_person: '',
			phone: '',
			email: '',
			status: 'Active'
		};
		showFormModal = true;
	}

	function openEditModal(liner: any) {
		formMode = 'edit';
		formData = { ...liner };
		showFormModal = true;
	}

	function closeFormModal() {
		showFormModal = false;
		isSaving = false;
	}

	let showDeleteModal = false;
	let deleteId = '';
	let deleteName = '';
	let isDeleting = false;

	function openDeleteModal(id: string, name: string) {
		deleteId = id;
		deleteName = name;
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
		isDeleting = false;
	}
</script>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">Liner / Carrier Management</h1>
			<p class="text-sm text-gray-500">จัดการข้อมูลสายเดินเรือ และสายการบิน</p>
		</div>

		<div class="flex flex-col items-center gap-3 sm:flex-row">
			<div class="relative w-full sm:w-64">
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
					placeholder="ค้นหาชื่อ หรือ รหัส..."
					class="block w-full rounded-lg border-0 py-2 pr-3 pl-10 text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-blue-600 focus:ring-inset sm:text-sm sm:leading-6"
				/>
			</div>

			<button
				onclick={openCreateModal}
				class="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold whitespace-nowrap text-white shadow-sm transition-colors hover:bg-blue-700 sm:w-auto"
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
				เพิ่มสายเรือ
			</button>
		</div>
	</div>

	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50 text-gray-700">
					<tr>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase">Code</th>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase"
							>Carrier Name</th
						>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase"
							>Contact Info</th
						>
						<th class="px-6 py-3 text-center text-xs font-semibold tracking-wider uppercase"
							>Status</th
						>
						<th class="px-6 py-3 text-center text-xs font-semibold tracking-wider uppercase"
							>Action</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#each filteredLiners as liner}
						<tr class="transition-colors hover:bg-gray-50">
							<td class="px-6 py-4">
								<span
									class="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600 ring-1 ring-gray-500/10 ring-inset"
								>
									{liner.code || '-'}
								</span>
							</td>
							<td class="px-6 py-4">
								<div class="font-bold text-gray-900">{liner.name}</div>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm text-gray-900">{liner.contact_person || '-'}</div>
								<div class="mt-1 flex flex-col gap-0.5 text-xs text-gray-500">
									{#if liner.phone}<span>📞 {liner.phone}</span>{/if}
									{#if liner.email}<span>✉️ {liner.email}</span>{/if}
								</div>
							</td>
							<td class="px-6 py-4 text-center">
								{#if liner.status === 'Active'}
									<span
										class="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset"
										>Active</span
									>
								{:else}
									<span
										class="inline-flex items-center rounded-full bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-500/10 ring-inset"
										>Inactive</span
									>
								{/if}
							</td>
							<td class="px-4 py-3 text-center">
								<div class="flex justify-center gap-2">
									<button
										type="button"
										onclick={() => openEditModal(liner)}
										class="text-gray-400 transition-colors hover:text-yellow-600"
										title="แก้ไข"
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

									<button
										type="button"
										onclick={() => openDeleteModal(liner.id, liner.name)}
										class="text-gray-400 transition-colors hover:text-red-600"
										title="ลบ"
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
								</div>
							</td>
						</tr>
					{/each}
					{#if filteredLiners.length === 0}
						<tr
							><td colspan="5" class="py-12 text-center text-gray-400">ไม่พบข้อมูลสายเดินเรือ</td
							></tr
						>
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

{#if showFormModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity"
	>
		<div
			class="animate-in fade-in zoom-in-95 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl duration-200"
		>
			<div class="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
				<h3 class="text-lg font-bold text-gray-800">
					{formMode === 'create' ? 'เพิ่มสายเดินเรือใหม่' : 'แก้ไขข้อมูลสายเดินเรือ'}
				</h3>
				<button
					type="button"
					onclick={closeFormModal}
					class="text-gray-400 hover:text-gray-600 focus:outline-none"
					aria-label="ปิดหน้าต่าง"
					title="ปิด"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke="currentColor"
						class="h-6 w-6"
						><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg
					>
				</button>
			</div>

			<form
				method="POST"
				action="?/save"
				class="flex-1 overflow-y-auto"
				use:enhance={() => {
					isSaving = true;
					return async ({ update }) => {
						await update();
						closeFormModal();
					};
				}}
			>
				<input type="hidden" name="id" value={formData.id} />

				<div class="space-y-5 p-6">
					<div class="grid grid-cols-3 gap-4">
						<div class="col-span-1">
							<label for="code" class="mb-1 block text-sm font-semibold text-gray-700">Code</label>
							<input
								type="text"
								id="code"
								name="code"
								bind:value={formData.code}
								placeholder="e.g. MSK"
								class="w-full rounded-md border-gray-300 font-mono uppercase shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>
						<div class="col-span-2">
							<label for="name" class="mb-1 block text-sm font-semibold text-gray-700"
								>Carrier Name <span class="text-red-500">*</span></label
							>
							<input
								type="text"
								id="name"
								name="name"
								bind:value={formData.name}
								required
								placeholder="ชื่อสายเรือ"
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>
					</div>

					<div class="border-t border-gray-100 pt-4">
						<h4 class="mb-3 text-xs font-bold tracking-wider text-gray-400 uppercase">
							Contact Information
						</h4>
						<div class="space-y-4">
							<div>
								<label for="contact_person" class="mb-1 block text-sm font-medium text-gray-700"
									>Contact Person</label
								>
								<input
									type="text"
									id="contact_person"
									name="contact_person"
									bind:value={formData.contact_person}
									class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
							<div class="grid grid-cols-2 gap-4">
								<div>
									<label for="phone" class="mb-1 block text-sm font-medium text-gray-700"
										>Phone</label
									>
									<input
										type="text"
										id="phone"
										name="phone"
										bind:value={formData.phone}
										class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
									/>
								</div>
								<div>
									<label for="email" class="mb-1 block text-sm font-medium text-gray-700"
										>Email</label
									>
									<input
										type="email"
										id="email"
										name="email"
										bind:value={formData.email}
										class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
									/>
								</div>
							</div>
						</div>
					</div>

					<div class="border-t border-gray-100 pt-4">
						<label for="status" class="mb-1 block text-sm font-semibold text-gray-700">Status</label
						>
						<select
							id="status"
							name="status"
							bind:value={formData.status}
							class="w-full rounded-md border-gray-300 font-medium shadow-sm focus:border-blue-500 focus:ring-blue-500"
						>
							<option value="Active">Active (เปิดใช้งาน)</option>
							<option value="Inactive">Inactive (ระงับการใช้งาน)</option>
						</select>
					</div>
				</div>

				<div
					class="flex justify-end gap-3 rounded-b-2xl border-t border-gray-100 bg-gray-50 px-6 py-4"
				>
					<button
						type="button"
						onclick={closeFormModal}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
						>ยกเลิก</button
					>
					<button
						type="submit"
						disabled={isSaving}
						class="flex items-center justify-center rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white hover:bg-blue-700 focus:outline-none disabled:opacity-70"
					>
						{isSaving ? 'Saving...' : 'บันทึกข้อมูล'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if showDeleteModal}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity"
	>
		<div
			class="animate-in fade-in zoom-in-95 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl duration-200"
		>
			<div class="p-6">
				<div class="flex items-start gap-4">
					<div
						class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:h-10 sm:w-10"
					>
						<svg
							class="h-6 w-6 text-red-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/></svg
						>
					</div>
					<div class="mt-1 text-left sm:mt-0">
						<h3 class="text-lg leading-6 font-bold text-gray-900">ยืนยันการลบข้อมูล</h3>
						<div class="mt-2">
							<p class="text-sm text-gray-500">
								คุณแน่ใจหรือไม่ว่าต้องการลบสายเรือ <span class="font-bold text-gray-800"
									>{deleteName}</span
								> ?
							</p>
						</div>
					</div>
				</div>
			</div>
			<div class="flex justify-end gap-3 bg-gray-50 px-6 py-4 sm:flex-row">
				<button
					type="button"
					class="mt-3 inline-flex w-full justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 sm:mt-0 sm:w-auto"
					onclick={closeDeleteModal}
					disabled={isDeleting}>ยกเลิก</button
				>
				<form
					method="POST"
					action="?/delete"
					class="m-0 flex w-full sm:w-auto"
					use:enhance={() => {
						isDeleting = true;
						return async ({ update }) => {
							await update();
							closeDeleteModal();
						};
					}}
				>
					<input type="hidden" name="id" value={deleteId} />
					<button
						type="submit"
						class="inline-flex w-full justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50 sm:w-auto"
						disabled={isDeleting}
					>
						{isDeleting ? 'กำลังลบ...' : 'ยืนยันการลบ'}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
