<script lang="ts">
	import { t } from '$lib/i18n';

	export let data;
	$: header = data.headerInfo;
	$: items = data.items || [];

	// ฟังก์ชันสำหรับดึงค่าข้อความออกมาจาก JSON (กรณีข้อมูลเก่ามีปัญหา)
	function displayValue(val: string) {
		if (!val) return '-';
		try {
			const parsed = JSON.parse(val);
			return parsed.label || parsed.value || val;
		} catch (e) {
			return val; // ถ้าไม่ใช่ JSON ให้ส่งค่าเดิมกลับไป
		}
	}

	function formatDate(dateStr: string) {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleString('th-TH', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	$: countOk = items.filter((i: any) => i.status === 'OK').length;
	$: countNg = items.filter((i: any) => i.status === 'NG').length;
</script>

<div class="mx-auto max-w-6xl p-6">
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">
				{$t('Inspection Report') || 'รายงานผลการตรวจสอบ (PDI)'}
			</h1>
			<p class="text-sm text-gray-500">
				เลขตัวถัง (VIN): <span class="font-mono font-bold text-blue-700">{header.vin_no}</span>
			</p>
		</div>
		<a
			href="/nc-tracking"
			class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				viewBox="0 0 20 20"
				fill="currentColor"
			>
				<path
					fill-rule="evenodd"
					d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
					clip-rule="evenodd"
				/>
			</svg>
			{$t('Back') || 'กลับไปหน้าหลัก'}
		</a>
	</div>

	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="flex flex-wrap items-center justify-between border-b bg-gray-50 px-6 py-4">
			<h2 class="text-lg font-bold text-gray-800">1. ข้อมูลรถยนต์ (Vehicle Info)</h2>
			<span class="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
				วันที่บันทึก: {formatDate(header.created_at)}
			</span>
		</div>
		<div class="grid grid-cols-1 gap-6 p-6 md:grid-cols-3 lg:grid-cols-5">
			<div>
				<p class="mb-1 text-sm font-semibold text-gray-500">เลขตัวถัง (VIN)</p>
				<p class="font-mono text-lg font-bold text-blue-700">{header.vin_no}</p>
			</div>
			<div>
				<p class="mb-1 text-sm font-semibold text-gray-500">รุ่น (Model)</p>
				<p class="font-medium text-gray-800">{header.model || '-'}</p>
			</div>
			<div>
				<p class="mb-1 text-sm font-semibold text-gray-500">สี (Color)</p>
				<p class="font-medium text-gray-800">{header.color || '-'}</p>
			</div>
			<div>
				<p class="mb-1 text-sm font-semibold text-gray-500">แบต / SOC (%)</p>
				<p class="font-medium text-gray-800">{header.soc ? header.soc + '%' : '-'}</p>
			</div>
			<div>
				<p class="mb-1 text-sm font-semibold text-gray-500">เลขไมล์ (km)</p>
				<p class="font-medium text-gray-800">
					{header.mile ? header.mile.toLocaleString() + ' km' : '-'}
				</p>
			</div>
		</div>
	</div>

	<div class="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="border-b bg-gray-50 px-6 py-4">
			<h2 class="text-lg font-bold text-gray-800">
				2. รายละเอียดผลการตรวจสอบ (Inspection Results)
			</h2>
		</div>
		<div class="divide-y divide-gray-100">
			{#each items as item (item.id)}
				<div class="p-6 transition hover:bg-gray-50/50">
					<div class="flex items-center justify-between {item.status === 'NG' ? 'mb-4' : ''}">
						<h3 class="text-base font-bold text-gray-800">
							<span class="mr-2 text-gray-400"></span>
							{item.work_name}
						</h3>
						<span
							class="rounded-full border px-4 py-1.5 text-xs font-bold shadow-sm {item.status ===
							'OK'
								? 'border-green-200 bg-green-100 text-green-700'
								: 'border-red-200 bg-red-100 text-red-700'}"
						>
							{item.status === 'OK' ? 'OK (ปกติ)' : 'NG (พบปัญหา)'}
						</span>
					</div>

					{#if item.status === 'NG'}
						<div class="mt-2 rounded-xl border border-red-100 bg-red-50/30 p-5">
							<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
								<div class="space-y-4 lg:col-span-1">
									<div>
										<p class="text-xs font-semibold text-gray-500">ตำแหน่ง (Position)</p>
										<p class="font-medium text-gray-800">{displayValue(item.position)}</p>
									</div>
									<div>
										<p class="text-xs font-semibold text-gray-500">ลักษณะปัญหา (Defect)</p>
										<p class="text-base font-bold text-red-600">{displayValue(item.defect)}</p>
									</div>
									<div>
										<p class="text-xs font-semibold text-gray-500">วิธีแก้ไขที่แนะนำ (Solution)</p>
										<p class="font-medium text-gray-800">{displayValue(item.solution)}</p>
									</div>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>
