<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let { repair } = data;
</script>

<div class="mx-auto max-w-5xl p-6">
	<a href="/repairs" class="mb-4 inline-flex items-center text-gray-500 hover:text-gray-700">
		← กลับไปหน้ารายการ
	</a>

	<div class="flex flex-col gap-6 lg:flex-row">
		<div class="space-y-6 lg:w-1/2">
			<div class="rounded-lg border-l-4 border-blue-500 bg-white p-6 shadow-md">
				<h2 class="mb-4 text-xl font-bold text-gray-800">📋 ข้อมูลการแจ้งซ่อม</h2>

				<div class="mb-6 flex items-start gap-4">
					{#if repair.asset_image}
						<img
							src={repair.asset_image}
							alt="Asset"
							class="h-24 w-24 rounded-lg border object-cover"
						/>
					{:else}
						<div
							class="flex h-24 w-24 items-center justify-center rounded-lg bg-gray-200 text-gray-400"
						>
							No Image
						</div>
					{/if}
					<div>
						<h3 class="text-lg font-bold">{repair.asset_name}</h3>
						<p class="text-sm text-gray-500">รหัส: {repair.asset_tag}</p>
						<p class="mt-1 text-sm text-gray-500">
							ผู้แจ้ง: {repair.reported_by_name || 'ไม่ระบุ'}
						</p>
						<p class="text-sm text-gray-400">
							วันที่แจ้ง: {new Date(repair.created_at).toLocaleString('th-TH')}
						</p>
					</div>
				</div>

				<div class="mb-4">
					<p class="mb-1 block text-sm font-medium text-gray-700">อาการที่เสีย:</p>
					<div class="min-h-[80px] rounded border bg-gray-50 p-3 text-gray-800">
						{repair.issue_description}
					</div>
				</div>

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

		<div class="lg:w-1/2">
			<div class="rounded-lg bg-white p-6 shadow-md">
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
