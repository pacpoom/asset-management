<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';

	export let data;

	$: masters = data.masters || [];
	$: details = data.details || [];
	$: selectedMasterId = data.selectedMasterId;

	// หา Object ของ Master ที่ถูกเลือกอยู่ (เพื่อเอาชื่อ/รหัสไปโชว์)
	$: selectedMaster = masters.find((m: any) => m.id === selectedMasterId) || null;

	let showAddModal = false;
	let showAddFlowModal = false; // เผื่อเพิ่ม Flow

	// Function เปลี่ยน Work Flow
	function selectMaster(id: number) {
		goto(`?master_id=${id}`);
	}
</script>

<div class="p-6">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">จัดการหัวข้อตรวจสอบ (Work Items)</h1>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
		<div class="lg:col-span-4">
			<div class="rounded-lg border bg-white shadow-sm">
				<div class="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
					<h2 class="font-bold text-gray-700">Work Flow</h2>
					<button
						on:click={() => (showAddFlowModal = true)}
						class="rounded bg-gray-200 px-2 py-1 text-xs hover:bg-gray-300">+ Add</button
					>
				</div>
				<div class="h-[600px] overflow-y-auto p-2">
					<table class="w-full text-sm">
						<thead class="bg-gray-100 text-gray-700">
							<tr>
								<th class="p-2 text-left">ID</th>
								<th class="p-2 text-left">Name</th>
								<th class="p-2 text-center">Act</th>
							</tr>
						</thead>
						<tbody class="divide-y">
							{#each masters as m}
								<tr
									class="cursor-pointer transition-colors hover:bg-blue-50 {selectedMasterId ===
									m.id
										? 'bg-blue-100'
										: ''}"
									on:click={() => selectMaster(m.id)}
								>
									<td class="p-2 font-mono text-xs">{m.Work_Code}</td>
									<td class="p-2">{m.Work_description}</td>
									<td class="p-2 text-center text-xs">
										<button class="text-blue-600">Select</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<div class="lg:col-span-8">
			<div class="rounded-lg border bg-white shadow-sm">
				<div class="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
					<div>
						<h2 class="font-bold text-gray-700">Work Item List</h2>
						{#if selectedMaster}
							<p class="text-xs text-gray-500">
								สำหรับ: {selectedMaster.Work_Code} - {selectedMaster.Work_description}
							</p>
						{/if}
					</div>

					<button
						disabled={!selectedMasterId}
						on:click={() => (showAddModal = true)}
						class="rounded bg-blue-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-gray-300"
					>
						+ Add Item
					</button>
				</div>

				<div class="p-4">
					{#if !selectedMasterId}
						<div
							class="flex h-64 items-center justify-center rounded border-2 border-dashed bg-gray-50 text-gray-400"
						>
							<p>กรุณาเลือก Work Flow จากตารางด้านซ้ายก่อน</p>
						</div>
					{:else}
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead class="bg-gray-100 text-gray-700">
									<tr>
										<th class="w-16 p-2 text-left">ID</th>
										<th class="p-2 text-left">Name</th>
										<th class="w-32 p-2 text-center">Result</th>
										<th class="w-20 p-2 text-center">Action</th>
									</tr>
								</thead>
								<tbody class="divide-y">
									{#each details as item, i}
										<tr class="hover:bg-gray-50">
											<td class="p-2 text-gray-500">#{i + 1}</td>
											<td class="p-2 font-medium">{item.work_name}</td>
											<td class="p-2 text-center">
												<div class="flex justify-center gap-1 opacity-60">
													<span class="border px-1 text-xs">OK</span>
													<span class="border px-1 text-xs">NG</span>
												</div>
											</td>
											<td class="p-2 text-center">
												<form method="POST" action="?/deleteDetail" use:enhance>
													<input type="hidden" name="id" value={item.id} />
													<button class="text-red-600 hover:text-red-800" title="Delete">
														<svg
															xmlns="http://www.w3.org/2000/svg"
															fill="none"
															viewBox="0 0 24 24"
															stroke-width="1.5"
															stroke="currentColor"
															class="size-5"
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
										<tr
											><td colspan="4" class="py-8 text-center text-gray-400"
												>ยังไม่มีรายการตรวจสอบ</td
											></tr
										>
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
	<div class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
		<div class="w-full max-w-md rounded-lg bg-white shadow-xl">
			<div class="border-b px-6 py-4">
				<h3 class="text-lg font-bold">เพิ่มรายการ (Add Work Item)</h3>
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

				<div class="space-y-4 p-6">
					<div>
						<label class="mb-1 block text-sm font-bold text-gray-700">Work Code (Auto)</label>
						<input
							type="text"
							value={selectedMaster.Work_Code}
							class="w-full rounded border bg-gray-100 p-2 text-gray-500"
							readonly
						/>
					</div>

					<div>
						<label class="mb-1 block text-sm font-bold text-gray-700">Type (Auto)</label>
						<input
							type="text"
							value="Inspections"
							class="w-full rounded border bg-gray-100 p-2 text-gray-500"
							readonly
						/>
					</div>

					<div>
						<label class="mb-1 block text-sm font-bold text-gray-700">Work Name</label>
						<input
							type="text"
							name="work_name"
							placeholder="เช่น ซากแมลง, รอยขีดข่วน..."
							class="w-full rounded border p-2 focus:ring-2 focus:ring-blue-500"
							required
							autoFocus
						/>
					</div>
				</div>

				<div class="flex justify-end gap-2 border-t bg-gray-50 px-6 py-4">
					<button
						type="button"
						on:click={() => (showAddModal = false)}
						class="rounded border bg-white px-4 py-2 hover:bg-gray-100">Cancel</button
					>
					<button
						type="submit"
						class="rounded bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700"
						>Save</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if showAddFlowModal}
	<div class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
		<div class="w-full max-w-sm rounded-lg bg-white shadow-xl">
			<div class="border-b px-6 py-4">
				<h3 class="text-lg font-bold">เพิ่ม Work Flow ใหม่</h3>
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
				<div class="p-6">
					<label class="mb-1 block text-sm font-bold text-gray-700">Work Flow Name</label>
					<input
						type="text"
						name="name"
						placeholder="เช่น PM-Check-01"
						class="w-full rounded border p-2"
						required
					/>
					<p class="mt-2 text-xs text-gray-400">* Code จะถูกสร้างอัตโนมัติ</p>
				</div>
				<div class="flex justify-end gap-2 border-t bg-gray-50 px-6 py-4">
					<button
						type="button"
						on:click={() => (showAddFlowModal = false)}
						class="rounded border bg-white px-4 py-2">Cancel</button
					>
					<button type="submit" class="rounded bg-blue-600 px-4 py-2 text-white">Add</button>
				</div>
			</form>
		</div>
	</div>
{/if}
