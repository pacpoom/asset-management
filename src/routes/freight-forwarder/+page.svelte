<script lang="ts">
	export let data;
	$: stats = data.stats;
	$: recentJobs = data.recentJobs || [];
	$: alerts = data.alerts || [];

	function getStatusClass(status: string) {
		switch (status) {
			case 'Pending':
				return 'bg-blue-100 text-blue-800';
			case 'In Progress':
				return 'bg-yellow-100 text-yellow-800';
			case 'Completed':
				return 'bg-green-100 text-green-800';
			case 'Cancelled':
				return 'bg-red-100 text-red-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	function formatJobNumber(type: string, dateStr: string, id: number) {
		if (!type || !dateStr || !id) return `JOB-${id}`;
		const d = new Date(dateStr);
		const yy = String(d.getFullYear()).slice(-2);
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const paddedId = String(id).padStart(4, '0');
		return `${type}${yy}${mm}${paddedId}`;
	}

	function getDaysLeft(expireDate: string) {
		const diffTime = Math.abs(new Date(expireDate).getTime() - new Date().getTime());
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
		return diffDays;
	}
</script>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-gray-900">Dashboard (Freight Forwarder)</h1>
		<p class="mt-1 text-sm text-gray-500">ภาพรวมระบบจัดการงานขนส่งประจำวัน</p>
	</div>

	<div class="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
		<div
			class="overflow-hidden rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md"
		>
			<div class="flex items-center gap-4">
				<div
					class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600"
				>
					<span class="material-symbols-outlined h-6 w-6">work</span>
				</div>
				<div>
					<p class="text-sm font-medium text-gray-500">Total Job Orders</p>
					<p class="text-2xl font-bold text-gray-900">{stats.total_jobs}</p>
				</div>
			</div>
		</div>

		<div
			class="overflow-hidden rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md"
		>
			<div class="flex items-center gap-4">
				<div
					class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600"
				>
					<span class="material-symbols-outlined h-6 w-6">pending_actions</span>
				</div>
				<div>
					<p class="text-sm font-medium text-gray-500">Pending</p>
					<p class="text-2xl font-bold text-gray-900">{stats.pending_jobs || 0}</p>
				</div>
			</div>
		</div>

		<div
			class="overflow-hidden rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md"
		>
			<div class="flex items-center gap-4">
				<div
					class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-yellow-50 text-yellow-600"
				>
					<span class="material-symbols-outlined h-6 w-6">local_shipping</span>
				</div>
				<div>
					<p class="text-sm font-medium text-gray-500">In Progress</p>
					<p class="text-2xl font-bold text-gray-900">{stats.in_progress_jobs || 0}</p>
				</div>
			</div>
		</div>

		<div
			class="overflow-hidden rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md"
		>
			<div class="flex items-center gap-4">
				<div
					class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600"
				>
					<span class="material-symbols-outlined h-6 w-6">check_circle</span>
				</div>
				<div>
					<p class="text-sm font-medium text-gray-500">Completed</p>
					<p class="text-2xl font-bold text-gray-900">{stats.completed_jobs || 0}</p>
				</div>
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<div class="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-2">
			<div class="flex items-center justify-between border-b border-gray-100 px-6 py-4">
				<h2 class="text-base font-bold text-gray-800">งานล่าสุด (Recent Job Orders)</h2>
				<a
					href="/freight-forwarder/job-orders"
					class="text-sm font-semibold text-blue-600 hover:text-blue-800">ดูทั้งหมด &rarr;</a
				>
			</div>
			<div class="flex-1 overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-100 text-sm">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase"
								>Job No.</th
							>
							<th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase"
								>Customer</th
							>
							<th class="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase"
								>Status</th
							>
							<th class="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase"
								>Date</th
							>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100 bg-white">
						{#each recentJobs as job}
							<tr
								class="cursor-pointer transition-colors hover:bg-gray-50"
								onclick={() => (window.location.href = `/freight-forwarder/job-orders/${job.id}`)}
							>
								<td class="px-6 py-4">
									<div class="font-bold text-gray-900">
										{formatJobNumber(job.job_type, job.job_date, job.id)}
									</div>
									{#if job.service_type}
										<div class="mt-0.5 text-[10px] text-gray-500 uppercase">{job.service_type}</div>
									{/if}
								</td>
								<td class="px-6 py-4">
									<div class="font-medium text-gray-800">
										{job.company_name || job.customer_name || 'ไม่ระบุ'}
									</div>
								</td>
								<td class="px-6 py-4 text-center">
									<span
										class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getStatusClass(
											job.job_status
										)}"
									>
										{job.job_status}
									</span>
								</td>
								<td class="px-6 py-4 text-right text-xs text-gray-500">
									{new Date(job.job_date).toLocaleDateString('th-TH')}
								</td>
							</tr>
						{/each}
						{#if recentJobs.length === 0}
							<tr>
								<td colspan="4" class="py-10 text-center text-gray-400">ยังไม่มีข้อมูลงานล่าสุด</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
		</div>

		<div class="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-1">
			<div
				class="flex items-center justify-between rounded-t-xl border-b border-gray-100 bg-red-50/50 px-6 py-4"
			>
				<div class="flex items-center gap-2">
					<span class="relative flex h-3 w-3">
						{#if alerts.length > 0}
							<span
								class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"
							></span>
						{/if}
						<span class="relative inline-flex h-3 w-3 rounded-full bg-red-500"></span>
					</span>
					<h2 class="text-base font-bold text-gray-800">การแจ้งเตือน (Alerts)</h2>
				</div>
				{#if alerts.length > 0}
					<span class="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-600"
						>{alerts.length}</span
					>
				{/if}
			</div>

			<div class="max-h-[400px] flex-1 overflow-y-auto p-4">
				<div class="space-y-4">
					{#each alerts as alert}
						<div
							class="flex items-start gap-4 rounded-lg border border-red-100 bg-white p-4 shadow-sm transition-all hover:bg-red-50"
						>
							<div class="mt-0.5 rounded-full bg-red-100 p-1.5 text-red-600">
								<span class="material-symbols-outlined h-5 w-5">warning</span>
							</div>
							<div class="flex-1">
								<div class="flex items-center justify-between">
									<a
										href="/freight-forwarder/job-orders/{alert.id}"
										class="text-sm font-bold text-gray-900 hover:text-blue-600 hover:underline"
									>
										{formatJobNumber(alert.job_type, alert.job_date, alert.id)}
									</a>
									<span class="text-[10px] font-bold text-red-600">
										เหลือ {getDaysLeft(alert.expire_date)} วัน
									</span>
								</div>
								<p class="mt-1 text-xs text-gray-600">
									ใบงานสถานะ <span class="font-bold">{alert.job_status}</span>
									กำลังจะหมดอายุในวันที่ {new Date(alert.expire_date).toLocaleDateString('th-TH')}
								</p>
							</div>
						</div>
					{/each}

					{#if alerts.length === 0}
						<div class="flex flex-col items-center justify-center py-10 text-center">
							<div class="mb-3 rounded-full bg-green-50 p-3 text-green-500">
								<span class="material-symbols-outlined h-8 w-8">notifications_active</span>
							</div>
							<h3 class="text-sm font-bold text-gray-900">ยอดเยี่ยม!</h3>
							<p class="mt-1 text-xs text-gray-500">
								ไม่มีรายการแจ้งเตือนด่วนในขณะนี้<br />ระบบทำงานได้อย่างราบรื่น
							</p>
						</div>
					{/if}
				</div>
			</div>

			<div class="rounded-b-xl border-t border-gray-100 bg-gray-50 px-6 py-3 text-center">
				<p class="text-[10px] text-gray-400">อัปเดตข้อมูลแบบ Real-time ตามระบบฐานข้อมูล</p>
			</div>
		</div>
	</div>
</div>

<style>
	.material-symbols-outlined {
		font-variation-settings:
			'FILL' 1,
			'wght' 400,
			'GRAD' 0,
			'opsz' 24;
	}
</style>
