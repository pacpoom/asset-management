<script lang="ts">
	import { enhance } from '$app/forms';
	import { fade, fly, slide, scale } from 'svelte/transition';

	let { data } = $props();

	let selectedRepair = $state<any>(null);
	let showViewModal = $state(false);
	let showEditModal = $state(false);
	let repairToDelete = $state<any>(null);
	let isUpdating = $state(false);

	// --- Image Viewer State ---
	let showImageModal = $state(false);
	let viewingImageUrl = $state<string | null>(null);

	let historySearchTerm = $state('');
	let isHistoryDropdownOpen = $state(false);
	let selectedAssetForHistory = $state<any>(null);

	let filteredAssetsForHistory = $derived(
		data.assets.filter(
			(a: any) =>
				a.asset_tag.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
				a.name.toLowerCase().includes(historySearchTerm.toLowerCase())
		)
	);

	let assetRepairHistory = $derived(
		selectedAssetForHistory
			? data.repairs.filter((r: any) => r.asset_id === selectedAssetForHistory.id)
			: []
	);

	let assetEditSearchTerm = $state('');
	let isAssetEditDropdownOpen = $state(false);
	let filteredEditAssets = $derived(
		data.assets.filter(
			(a: any) =>
				a.asset_tag.toLowerCase().includes(assetEditSearchTerm.toLowerCase()) ||
				a.name.toLowerCase().includes(assetEditSearchTerm.toLowerCase())
		)
	);

	const statuses = ['Pending', 'In Progress', 'Completed', 'Cancelled'];

	function getStatusClass(status: string) {
		const base = 'px-2.5 py-0.5 rounded-full text-xs font-semibold border ';
		const styles: Record<string, string> = {
			Pending: 'bg-amber-100 text-amber-700 border-amber-200',
			'In Progress': 'bg-blue-100 text-blue-700 border-blue-200',
			Completed: 'bg-green-100 text-green-700 border-green-200',
			Cancelled: 'bg-red-100 text-red-700 border-red-200'
		};
		return base + (styles[status] || 'bg-gray-100 text-gray-700 border-gray-200');
	}

	function getStatusLabel(status: string) {
		const map: Record<string, string> = {
			Pending: 'รอดำเนินการ',
			'In Progress': 'กำลังซ่อม',
			Completed: 'เสร็จสิ้น',
			Cancelled: 'ยกเลิก'
		};
		return map[status] || status;
	}

	function closeModals() {
		showViewModal = false;
		showEditModal = false;
		repairToDelete = null;
		isAssetEditDropdownOpen = false;
		setTimeout(() => (selectedRepair = null), 200);
	}

	function openEditModal(repair: any) {
		selectedRepair = { ...repair };
		assetEditSearchTerm = repair.asset_tag || '';
		showEditModal = true;
	}

	function selectAssetForEdit(asset: any) {
		selectedRepair.asset_id = asset.id;
		selectedRepair.asset_tag = asset.asset_tag;
		assetEditSearchTerm = asset.asset_tag;
		isAssetEditDropdownOpen = false;
	}

	function openImageViewer(url: string) {
		if (!url) return;
		viewingImageUrl = url;
		showImageModal = true;
	}

	function closeImageViewer() {
		showImageModal = false;
		setTimeout(() => (viewingImageUrl = null), 200);
	}
</script>

<div class="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
	<div class="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">🛠️ รายการแจ้งซ่อม (Repairs)</h1>
			<p class="mt-1 text-sm font-medium text-gray-500">จัดการสถานะและตรวจสอบประวัติสินทรัพย์</p>
		</div>
		<a
			href="/repairs/create"
			class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700"
			>+ แจ้งซ่อมใหม่</a
		>
	</div>

	<div class="mb-10 rounded-2xl border border-blue-100 bg-blue-50/50 p-6 shadow-sm">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-bold text-blue-900">🔍 ตรวจสอบประวัติรายเครื่อง</h2>
			{#if selectedAssetForHistory}
				<button
					onclick={() => {
						selectedAssetForHistory = null;
						historySearchTerm = '';
					}}
					class="text-xs font-bold text-red-600 hover:underline">ล้างการค้นหา</button
				>
			{/if}
		</div>

		<div class="relative max-w-md">
			<input
				type="text"
				placeholder="พิมพ์รหัส Asset Tag เพื่อดูประวัติซ่อม..."
				class="w-full rounded-xl border-gray-200 p-4 text-sm shadow-sm focus:ring-4 focus:ring-blue-100"
				bind:value={historySearchTerm}
				onfocus={() => (isHistoryDropdownOpen = true)}
			/>
			{#if isHistoryDropdownOpen && historySearchTerm.length > 0}
				<div
					class="absolute z-20 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border bg-white shadow-2xl"
					transition:slide
				>
					{#each filteredAssetsForHistory as asset}
						<button
							class="w-full border-b border-gray-50 px-4 py-3 text-left hover:bg-blue-50"
							onclick={() => {
								selectedAssetForHistory = asset;
								historySearchTerm = asset.asset_tag;
								isHistoryDropdownOpen = false;
							}}
						>
							<div class="text-sm font-bold text-blue-600">{asset.asset_tag}</div>
							<div class="text-xs text-gray-500">{asset.name}</div>
						</button>
					{:else}
						<div class="px-4 py-3 text-sm text-gray-400 italic">ไม่พบข้อมูลสินทรัพย์</div>
					{/each}
				</div>
			{/if}
		</div>

		{#if selectedAssetForHistory}
			<div class="mt-6" transition:fade>
				<p class="mb-3 text-xs font-bold text-gray-400 uppercase">
					ประวัติการซ่อมของ: <span class="text-blue-600"
						>[{selectedAssetForHistory.asset_tag}] {selectedAssetForHistory.name}</span
					>
				</p>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{#each assetRepairHistory as item}
						<button
							onclick={() => {
								selectedRepair = item;
								showViewModal = true;
							}}
							class="rounded-xl border bg-white p-4 text-left transition-all hover:shadow-md"
						>
							<div class="mb-2 flex justify-between">
								<span class="font-mono text-xs font-bold text-blue-600">#{item.ticket_code}</span>
								<span class={getStatusClass(item.repair_status)} style="font-size: 10px;"
									>{item.repair_status}</span
								>
							</div>
							<p class="text-[10px] font-bold text-gray-400 uppercase">
								{item.created_at_formatted}
							</p>
							<p class="mt-1 line-clamp-2 text-sm font-medium text-gray-800 italic">
								"{item.issue_description}"
							</p>
						</button>
					{:else}
						<div
							class="col-span-full py-6 text-center text-gray-400 text-sm italic bg-white rounded-xl border border-dashed"
						>
							ยังไม่เคยมีประวัติการซ่อม
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="w-full text-left text-sm text-gray-600">
				<thead class="border-b bg-gray-50 text-xs font-bold tracking-wider text-gray-500 uppercase">
					<tr>
						<th class="px-6 py-4 text-center">รูปภาพ</th>
						<th class="px-6 py-4">Ticket / วันที่</th>
						<th class="px-6 py-4">อุปกรณ์ / สถานที่</th>
						<th class="px-6 py-4">ชื่อ-นามสกุล</th>
						<th class="px-6 py-4 text-center">รหัสสินทรัพย์ (Asset Tag)</th>
						<th class="px-6 py-4 text-center">สถานะ</th>
						<th class="px-6 py-4 text-center">จัดการ</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					{#each data.repairs as repair}
						<tr class="transition-colors hover:bg-gray-50/50">
							<td class="px-6 py-4 text-center">
								{#if repair.image_url}
									<button
										onclick={(e) => {
											e.stopPropagation();
											openImageViewer(repair.image_url);
										}}
										class="relative h-14 w-14 overflow-hidden rounded-lg border border-gray-200 shadow-sm transition-transform hover:scale-105"
										title="คลิกเพื่อดูรูปขนาดใหญ่"
									>
										<img
											src={repair.image_url}
											alt="Repair"
											class="h-full w-full object-cover"
										/>
										<div
											class="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity hover:bg-black/10 hover:opacity-100"
										>
											<svg
												class="h-5 w-5 text-white drop-shadow-md"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												><path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
												/></svg
											>
										</div>
									</button>
								{:else}
									<div
										class="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-gray-100 text-gray-300"
									>
										<svg
											class="h-6 w-6"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
											/>
										</svg>
									</div>
								{/if}
							</td>
							<td class="px-6 py-4">
								<div class="font-bold text-blue-600">#{repair.ticket_code}</div>
								<div class="text-[10px] font-medium text-gray-400">
									{repair.created_at_formatted}
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="font-semibold text-gray-900">{repair.asset_name}</div>
								<div class="max-w-[150px] truncate text-xs text-gray-500">
									{repair.location_name || '-'}
								</div>
							</td>
							<td class="px-6 py-4 font-medium text-gray-700">
								{repair.reporter_name}
							</td>
							<td class="px-6 py-4 text-center font-mono text-xs font-bold text-gray-700">
								{repair.asset_tag || '-'}
							</td>
							<td class="px-6 py-4 text-center">
								<span class={getStatusClass(repair.repair_status)}
									>{getStatusLabel(repair.repair_status)}</span
								>
							</td>
							<td class="px-6 py-4 text-center">
								<div class="flex justify-center gap-1">
									<button
										onclick={() => {
											selectedRepair = repair;
											showViewModal = true;
										}}
										class="rounded-lg p-2 text-gray-400 transition-colors hover:text-blue-600"
										title="ดูรายละเอียด"
										aria-label="ดูรายละเอียด"
									>
										<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
											/><path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
											/></svg
										>
									</button>

									<a
										href={`/repairs/print/${repair.id}`}
										target="_blank"
										class="rounded-lg p-2 text-gray-400 transition-colors hover:text-purple-600"
										title="พิมพ์ใบแจ้งซ่อม"
									>
										<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
											/>
										</svg>
									</a>

									<button
										onclick={() => openEditModal(repair)}
										class="rounded-lg p-2 text-gray-400 transition-colors hover:text-amber-600"
										title="จัดการข้อมูล"
										aria-label="จัดการข้อมูล"
									>
										<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
											/></svg
										>
									</button>
									<button
										onclick={() => (repairToDelete = repair)}
										class="rounded-lg p-2 text-gray-400 transition-colors hover:text-red-600"
										title="ลบ"
										aria-label="ลบ"
									>
										<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
											/></svg
										>
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

{#if showViewModal && selectedRepair}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		transition:fade
	>
		<div
			class="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl"
			transition:fly={{ y: 20 }}
		>
			<div class="flex items-center justify-between border-b bg-gray-50 px-6 py-4">
				<h3 class="text-lg font-bold text-gray-900">
					รายละเอียด Ticket #{selectedRepair.ticket_code}
				</h3>
				<button
					onclick={closeModals}
					class="p-1 text-gray-400 hover:text-gray-600"
					aria-label="ปิดหน้าต่าง"
				>
					<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/></svg
					>
				</button>
			</div>
			<div class="max-h-[75vh] space-y-6 overflow-y-auto p-6 text-sm text-gray-800">
				<div class="grid grid-cols-2 gap-4">
					<div>
						<p class="text-xs font-bold text-gray-400 uppercase">อุปกรณ์ที่แจ้ง</p>
						<p class="font-semibold">{selectedRepair.asset_name}</p>
					</div>
					<div>
						<p class="text-xs font-bold text-gray-400 uppercase">สถานะ</p>
						<div class="mt-1">
							<span class={getStatusClass(selectedRepair.repair_status)}
								>{getStatusLabel(selectedRepair.repair_status)}</span
							>
						</div>
					</div>
					<div>
						<p class="text-xs font-bold text-gray-400 uppercase">ผู้แจ้งซ่อม</p>
						<p class="font-medium">{selectedRepair.reporter_name}</p>
					</div>
					<div>
						<p class="text-xs font-bold text-gray-400 uppercase">เบอร์ติดต่อ</p>
						<p>{selectedRepair.contact_info || '-'}</p>
					</div>
				</div>
				<div>
					<p class="text-xs font-bold text-gray-400 uppercase">รายละเอียดอาการเสีย</p>
					<div class="mt-1 rounded-lg border bg-gray-50 p-3 italic">
						"{selectedRepair.issue_description}"
					</div>
				</div>
				{#if selectedRepair.image_url}<div>
						<p class="mb-2 text-xs font-bold text-gray-400 uppercase">รูปถ่ายจากผู้แจ้ง:</p>
						<button
							type="button"
							class="w-full overflow-hidden rounded-lg border shadow-sm transition-opacity hover:opacity-90"
							onclick={() => openImageViewer(selectedRepair.image_url)}
						>
							<img
								src={selectedRepair.image_url}
								alt="User reported"
								class="h-full w-full object-cover"
							/>
						</button>
					</div>{/if}

				{#if selectedRepair.latitude && selectedRepair.longitude}
					<div class="mt-4 overflow-hidden rounded-lg border border-gray-200 shadow-sm">
						<div
							class="flex items-center justify-between border-b bg-gray-50 px-3 py-2 text-xs font-bold"
						>
							<span class="text-gray-500">📍 ตำแหน่งพิกัด (GPS)</span>
							<a
								href={`https://www.google.com/maps?q=${selectedRepair.latitude},${selectedRepair.longitude}`}
								target="_blank"
								class="text-blue-600 hover:underline"
							>
								เปิด Google Maps
							</a>
						</div>
						<iframe
							title="Location Map"
							width="100%"
							height="200"
							style="border:0"
							loading="lazy"
							src={`https://maps.google.com/maps?q=${selectedRepair.latitude},${selectedRepair.longitude}&z=15&output=embed`}
						></iframe>
					</div>
				{/if}

				{#if selectedRepair.completion_image_url}
					<div class="rounded-xl border border-green-100 bg-green-50 p-4">
						<p class="mb-2 text-xs font-bold text-green-600 uppercase">✅ ผลการดำเนินการ:</p>
						<button
							type="button"
							class="w-full overflow-hidden rounded-lg border-2 border-white shadow-sm transition-opacity hover:opacity-90"
							onclick={() => openImageViewer(selectedRepair.completion_image_url)}
						>
							<img
								src={selectedRepair.completion_image_url}
								alt="Admin resolved"
								class="mb-2 w-full"
							/>
						</button>
						{#if selectedRepair.admin_notes}<p class="text-sm font-medium text-green-800">
								{selectedRepair.admin_notes}
							</p>{/if}
					</div>
				{/if}
			</div>
			<div class="border-t bg-gray-50 p-4 text-right">
				<button
					onclick={closeModals}
					class="rounded-lg border bg-white px-6 py-2 font-bold text-gray-700 hover:bg-gray-50"
					>ปิด</button
				>
			</div>
		</div>
	</div>
{/if}

{#if showEditModal && selectedRepair}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		transition:fade
	>
		<div
			class="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl"
			transition:fly={{ y: 20 }}
		>
			<div class="border-b bg-amber-50 px-6 py-4">
				<h3 class="text-lg font-bold text-amber-800">
					จัดการงานซ่อม #{selectedRepair.ticket_code}
				</h3>
			</div>
			<form
				method="POST"
				action="?/updateRepair"
				use:enhance={() => {
					isUpdating = true;
					return async ({ update }) => {
						await update();
						isUpdating = false;
						closeModals();
					};
				}}
				enctype="multipart/form-data"
				class="space-y-4 p-6"
			>
				<input type="hidden" name="id" value={selectedRepair.id} />
				<input
					type="hidden"
					name="existing_completion_image"
					value={selectedRepair.completion_image_url}
				/>

				<div>
					<label for="asset_search" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
						>ระบุรหัสสินทรัพย์ในระบบ (Asset Tag)</label
					>
					<div class="relative">
						<input
							type="text"
							id="asset_search"
							placeholder="พิมพ์เลข Tag หรือชื่ออุปกรณ์..."
							class="w-full rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
							bind:value={assetEditSearchTerm}
							onfocus={() => (isAssetEditDropdownOpen = true)}
						/>
						<input type="hidden" name="asset_id" value={selectedRepair.asset_id} />
						{#if isAssetEditDropdownOpen && assetEditSearchTerm.length > 0}
							<div
								class="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-2xl"
								transition:slide
							>
								{#each filteredEditAssets as asset}
									<button
										type="button"
										class="w-full border-b border-gray-50 px-4 py-3 text-left last:border-0 hover:bg-blue-50"
										onclick={() => selectAssetForEdit(asset)}
									>
										<div class="text-sm font-bold text-blue-600">{asset.asset_tag}</div>
										<div class="text-xs text-gray-500">{asset.name}</div>
									</button>
								{:else}
									<div class="px-4 py-3 text-sm text-gray-400 italic text-center">
										ไม่พบรหัสสินทรัพย์
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<div>
					<label for="repair_status" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
						>อัปเดตสถานะ</label
					><select
						name="repair_status"
						id="repair_status"
						bind:value={selectedRepair.repair_status}
						class="w-full rounded-lg border-gray-300 text-sm"
						>{#each statuses as s}<option value={s}>{getStatusLabel(s)}</option>{/each}</select
					>
				</div>
				<div>
					<label for="admin_notes" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
						>หมายเหตุช่าง / ผลการซ่อม</label
					><textarea
						name="admin_notes"
						id="admin_notes"
						rows="2"
						class="w-full rounded-lg border-gray-300 text-sm"
						placeholder="ระบุการแก้ไข..."
						bind:value={selectedRepair.admin_notes}
					></textarea>
				</div>

				<div>
					<label for="completion_image" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
						>อัปโหลดรูปยืนยันหลังซ่อม (ส่งให้ User)</label
					>
					{#if selectedRepair.completion_image_url}
						<div class="relative mb-2 h-20 w-32 overflow-hidden rounded border">
							<img
								src={selectedRepair.completion_image_url}
								alt="Current completion"
								class="h-full w-full object-cover"
							/>
							<div
								class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100"
							>
								<span class="text-[10px] font-bold text-white">มีรูปเดิมอยู่แล้ว</span>
							</div>
						</div>
					{/if}
					<input
						type="file"
						name="completion_image"
						id="completion_image"
						accept="image/*"
						class="w-full text-xs text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
					/>
					<p class="mt-1 text-[10px] text-gray-400 italic">* เลือกไฟล์ใหม่เพื่อแทนที่รูปเดิม</p>
				</div>

				<div class="flex gap-2 pt-4">
					<button
						type="button"
						onclick={closeModals}
						class="flex-1 rounded-lg py-2 font-bold text-gray-500 transition-colors hover:bg-gray-100"
						>ยกเลิก</button
					>
					<button
						type="submit"
						disabled={isUpdating}
						class="flex-1 rounded-lg bg-blue-600 py-2 font-bold text-white shadow-sm transition-all disabled:opacity-50"
						>{isUpdating ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if repairToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" transition:fade>
		<div
			class="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl"
			transition:fly={{ y: 20 }}
		>
			<div
				class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600"
			>
				<svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/></svg
				>
			</div>
			<h3 class="text-lg font-bold text-gray-900">ยืนยันการลบ?</h3>
			<p class="mt-1 text-sm text-gray-500">
				คุณต้องการลบ Ticket <strong>#{repairToDelete.ticket_code}</strong> ใช่หรือไม่?
			</p>
			<div class="mt-6 flex gap-2">
				<button
					onclick={() => (repairToDelete = null)}
					class="flex-1 rounded-lg py-2 font-bold text-gray-500 transition-colors hover:bg-gray-100"
					>ยกเลิก</button
				>
				<form
					method="POST"
					action="?/deleteRepair"
					use:enhance={() => {
						return async ({ update }) => {
							await update();
							repairToDelete = null;
						};
					}}
					class="flex-1"
				>
					<input type="hidden" name="id" value={repairToDelete.id} /><button
						type="submit"
						class="w-full rounded-lg bg-red-600 py-2 font-bold text-white shadow-sm transition-colors hover:bg-red-700"
						>ลบข้อมูล</button
					>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Image Viewer Modal -->
{#if showImageModal && viewingImageUrl}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm"
		transition:fade
		onclick={(e) => {
			if (e.target === e.currentTarget) closeImageViewer();
		}}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onkeydown={(e) => e.key === 'Escape' && closeImageViewer()}
	>
		<button
			class="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
			onclick={closeImageViewer}
			aria-label="Close image viewer"
		>
			<svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				/></svg
			>
		</button>
		<img
			src={viewingImageUrl}
			alt="Full size view"
			class="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
			transition:scale={{ start: 0.9, duration: 300 }}
		/>
	</div>
{/if}