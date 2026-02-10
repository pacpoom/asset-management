<script lang="ts">
	import { enhance } from '$app/forms';
	import { fade, scale } from 'svelte/transition';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let { repair } = data;

	// --- Image Viewer State ---
	let showImageModal = false;
	let viewingImageUrl: string | null = null;

	function openImageViewer(url: string | null) {
		if (!url) return;
		viewingImageUrl = url;
		showImageModal = true;
	}

	function closeImageViewer() {
		showImageModal = false;
		setTimeout(() => (viewingImageUrl = null), 200);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeImageViewer();
		}
	}
</script>

<div class="mx-auto max-w-5xl p-6">
	<a href="/repairs" class="mb-4 inline-flex items-center text-gray-500 hover:text-gray-700">
		← กลับไปหน้ารายการ
	</a>

	<div class="flex flex-col gap-6 lg:flex-row">
		<!-- Left Column: Repair Details -->
		<div class="space-y-6 lg:w-1/2">
			<div class="rounded-lg border-l-4 border-blue-500 bg-white p-6 shadow-md">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-xl font-bold text-gray-800">📋 ข้อมูลการแจ้งซ่อม</h2>
					<span class="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800"
						>#{repair.ticket_code}</span
					>
				</div>

				<div class="mb-6 flex items-start gap-4">
					{#if repair.asset_image}
						<button
							type="button"
							on:click={() => openImageViewer(repair.asset_image)}
							class="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg border shadow-sm hover:opacity-90"
						>
							<img
								src={repair.asset_image}
								alt="Asset"
								class="h-full w-full object-cover"
							/>
						</button>
					{:else}
						<div
							class="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-400"
						>
							No Image
						</div>
					{/if}
					<div>
						<h3 class="text-lg font-bold leading-tight">{repair.asset_name}</h3>
						<p class="text-sm font-mono text-blue-600">{repair.asset_tag}</p>
						<div class="mt-2 space-y-1 text-sm text-gray-500">
							<p>ผู้แจ้ง: <span class="text-gray-900">{repair.reported_by_name || 'ไม่ระบุ'}</span></p>
							<p>วันที่: {new Date(repair.created_at).toLocaleString('th-TH')}</p>
							{#if repair.contact_info}
								<p>ติดต่อ: {repair.contact_info}</p>
							{/if}
						</div>
					</div>
				</div>

				<div class="mb-4">
					<p class="mb-1 block text-sm font-bold text-gray-700">อาการที่เสีย:</p>
					<div class="min-h-[80px] rounded-lg border border-gray-100 bg-gray-50 p-4 text-gray-800 italic">
						"{repair.issue_description}"
					</div>
				</div>
				
				<!-- รูปภาพที่ User แนบมาตอนแจ้งซ่อม (ถ้ามี) -->
				{#if repair.image_url}
					<div class="mb-4">
						<p class="mb-2 text-xs font-bold text-gray-400 uppercase">รูปภาพอาการเสีย (จากผู้แจ้ง):</p>
						<button
							type="button"
							class="h-40 w-full overflow-hidden rounded-lg border border-gray-200 hover:opacity-95"
							on:click={() => openImageViewer(repair.image_url)}
						>
							<img src={repair.image_url} alt="Issue" class="h-full w-full object-cover" />
						</button>
					</div>
				{/if}

				<!-- ส่วนแสดงรูปยืนยันการซ่อม (Completion Image) -->
				{#if repair.completion_image_url}
					<div class="mb-6 rounded-xl border border-green-200 bg-green-50/50 p-4">
						<div class="mb-3 flex items-center gap-2">
							<div class="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600">
								<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
							</div>
							<h3 class="font-bold text-green-800">หลักฐานการซ่อมเสร็จ (Completion)</h3>
						</div>
						
						<button
							type="button"
							class="group relative block w-full overflow-hidden rounded-lg border-2 border-white shadow-sm transition-all hover:shadow-md"
							on:click={() => openImageViewer(repair.completion_image_url)}
						>
							<img
								src={repair.completion_image_url}
								alt="Completion"
								class="h-64 w-full object-cover transition-transform duration-500 group-hover:scale-105"
							/>
							<div class="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
								<span class="rounded-full bg-white/90 px-4 py-2 text-sm font-bold shadow-sm">🔍 คลิกเพื่อขยาย</span>
							</div>
						</button>
					</div>
				{/if}

				{#if repair.latitude && repair.longitude}
					<div class="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
						<div class="mb-2 flex items-center justify-between">
							<p class="text-sm font-bold text-gray-700">📍 พิกัดหน้างาน (GPS)</p>
							<span class="text-xs text-gray-400"
								>Lat: {repair.latitude}, Lng: {repair.longitude}</span
							>
						</div>

						<div class="mb-3 overflow-hidden rounded-lg border border-gray-300 shadow-sm">
							<iframe
								title="Location Map"
								width="100%"
								height="250"
								style="border:0"
								src={`https://maps.google.com/maps?q=${repair.latitude},${repair.longitude}&z=15&output=embed`}
								allowfullscreen
							></iframe>
						</div>

						<a
							href={`https://www.google.com/maps?q=${repair.latitude},${repair.longitude}`}
							target="_blank"
							class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-600 shadow-sm transition-all hover:bg-blue-50"
						>
							เปิดนำทางใน Google Maps
						</a>
					</div>
				{/if}
			</div>
		</div>

		<!-- Right Column: Admin Actions -->
		<div class="lg:w-1/2">
			<div class="sticky top-6 rounded-lg bg-white p-6 shadow-md">
				<h2 class="mb-4 text-xl font-bold text-gray-800">🛠️ การดำเนินการ (Admin/ช่าง)</h2>

				{#if form?.success}
					<div
						class="relative mb-4 rounded border border-green-400 bg-green-100 px-4 py-3 text-green-700"
						role="alert"
					>
						<span class="block sm:inline">{form.message}</span>
					</div>
				{/if}

				<form method="POST" action="?/updateRepair" use:enhance class="space-y-4">
					<div>
						<label for="repair_status" class="mb-1 block text-sm font-medium text-gray-700"
							>สถานะงานซ่อม</label
						>
						<select
							name="repair_status"
							id="repair_status"
							class="w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							value={repair.repair_status}
						>
							<option value="Pending">🕒 รอดำเนินการ (Pending)</option>
							<option value="In Progress">🔧 กำลังซ่อม (In Progress)</option>
							<option value="Completed">✅ เสร็จสิ้น (Completed)</option>
							<option value="Cancelled">❌ ยกเลิก (Cancelled)</option>
						</select>
					</div>

					<div>
						<label for="vendor_name" class="mb-1 block text-sm font-medium text-gray-700"
							>ชื่อช่าง / ร้านซ่อม (Vendor)</label
						>
						<input
							type="text"
							name="vendor_name"
							id="vendor_name"
							class="w-full rounded-md border border-gray-300 p-2 shadow-sm"
							value={repair.vendor_name || ''}
							placeholder="ระบุชื่อผู้ซ่อม..."
						/>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="repair_cost" class="mb-1 block text-sm font-medium text-gray-700"
								>ค่าซ่อม (บาท)</label
							>
							<input
								type="number"
								step="0.01"
								name="repair_cost"
								id="repair_cost"
								class="w-full rounded-md border border-gray-300 p-2 shadow-sm"
								value={repair.repair_cost || 0}
							/>
						</div>
						<div>
							<label for="repair_date" class="mb-1 block text-sm font-medium text-gray-700"
								>วันที่ดำเนินการ</label
							>
							<input
								type="date"
								name="repair_date"
								id="repair_date"
								class="w-full rounded-md border border-gray-300 p-2 shadow-sm"
								value={repair.repair_date || ''}
							/>
						</div>
					</div>

					<div>
						<label for="notes" class="mb-1 block text-sm font-medium text-gray-700"
							>หมายเหตุ / สิ่งที่ซ่อมไป</label
						>
						<textarea
							name="notes"
							id="notes"
							rows="4"
							class="w-full rounded-md border border-gray-300 p-2 shadow-sm"
							placeholder="รายละเอียดการซ่อม หรือสาเหตุที่ยกเลิก...">{repair.notes || ''}</textarea
						>
					</div>

					<div class="mt-6 border-t pt-4">
						<button
							type="submit"
							class="w-full rounded bg-blue-600 px-4 py-2 font-bold text-white shadow transition hover:bg-blue-700"
						>
							บันทึกการเปลี่ยนแปลง
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
</div>

<!-- Image Viewer Modal -->
{#if showImageModal && viewingImageUrl}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm"
		transition:fade
		on:click|self={closeImageViewer}
		on:keydown={handleKeyDown}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<button
			type="button"
			class="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white/70 hover:bg-white/20 hover:text-white"
			on:click={closeImageViewer}
			aria-label="Close image viewer"
		>
			<svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
		<img
			src={viewingImageUrl}
			alt="Full size"
			class="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
			transition:scale={{ start: 0.9, duration: 300 }}
		/>
	</div>
{/if}