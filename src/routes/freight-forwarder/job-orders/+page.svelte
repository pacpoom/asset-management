<script lang="ts">
	import { enhance } from '$app/forms';
	export let data;
	$: jobs = data.job_orders || [];

	let showDeleteModal = false;
	let jobToDeleteId: number | null = null;
	let jobToDeleteName: string = '';
	let isDeleting = false;

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

	function confirmDelete(job: any) {
		jobToDeleteId = job.id;
		jobToDeleteName = formatJobNumber(job.job_type, job.job_date, job.id);
		showDeleteModal = true;
	}

	function closeModal() {
		showDeleteModal = false;
		jobToDeleteId = null;
		jobToDeleteName = '';
		isDeleting = false;
	}
</script>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">Job Orders</h1>
			<p class="text-sm text-gray-500">จัดการรายการงานขนส่ง (Freight Forwarder)</p>
		</div>
		<a
			href="/freight-forwarder/job-orders/create"
			class="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow transition-colors hover:bg-blue-700"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				class="h-5 w-5"
			>
				<path
					d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"
				/>
			</svg>
			เปิด Job ใหม่
		</a>
	</div>

	<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50 text-gray-700">
					<tr>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase"
							>Job No. / Date</th
						>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase"
							>Type / Service</th
						>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase"
							>Customer</th
						>
						<th class="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase"
							>Shipment Info</th
						>
						<th class="px-6 py-3 text-center text-xs font-semibold tracking-wider uppercase"
							>Status</th
						>
						<th class="px-6 py-3 text-right text-xs font-semibold tracking-wider uppercase"
							>Amount</th
						>
						<th class="px-6 py-3 text-center text-xs font-semibold tracking-wider uppercase"
							>Action</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#each jobs as job}
						<tr class="hover:bg-gray-50">
							<td class="px-6 py-4">
								<a
									href="/freight-forwarder/job-orders/{job.id}"
									class="font-bold text-blue-600 hover:underline"
								>
									{formatJobNumber(job.job_type, job.job_date, job.id)}
								</a>
								<div class="text-xs text-gray-500">
									{new Date(job.job_date).toLocaleDateString('th-TH')}
								</div>
							</td>

							<td class="px-6 py-4">
								<div class="flex flex-col items-start gap-1.5">
									<span class="rounded bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700">
										{job.job_type}
									</span>
									{#if job.service_type}
										<span
											class="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-blue-700 uppercase"
										>
											{job.service_type}
										</span>
									{/if}
								</div>
							</td>

							<td class="px-6 py-4">
								<div class="font-medium text-gray-900">
									{job.company_name || job.customer_name || 'ไม่ระบุ'}
								</div>
								{#if job.company_name && job.customer_name}
									<div
										class="max-w-[200px] truncate text-xs text-gray-500"
										title={job.customer_name}
									>
										Contact: {job.customer_name}
									</div>
								{/if}
							</td>

							<td class="px-6 py-4">
								<div>
									<span class="text-xs text-gray-400">B/L:</span>
									<span class="font-mono font-bold text-gray-800">{job.bl_number}</span>
								</div>
								<div class="text-xs text-gray-500">{job.liner_name || '-'}</div>
							</td>

							<td class="px-6 py-4 text-center">
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusClass(
										job.job_status
									)}"
								>
									{job.job_status}
								</span>
							</td>

							<td class="px-6 py-4 text-right">
								<div class="font-mono font-bold text-gray-800">
									{Number(job.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
								</div>
								<div class="text-[10px] text-gray-500">{job.currency}</div>
							</td>

							<td class="px-4 py-3 text-center">
								<div class="flex justify-center gap-2">
									<a
										href="/freight-forwarder/job-orders/{job.id}"
										class="text-gray-400 transition-colors hover:text-blue-600"
										title="ดูรายละเอียด"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="h-5 w-5"
										>
											<path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
											<path
												fill-rule="evenodd"
												d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 8.142 1.987 10.336 5.404.347.526.347 1.186 0 1.712C18.142 14.013 14.257 16 10 16c-4.257 0-8.142-1.987-10.336-5.404zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
												clip-rule="evenodd"
											/>
										</svg>
									</a>

									<button
										type="button"
										onclick={() => window.open(`/freight-forwarder/job-orders/${job.id}`, '_blank')}
										class="text-gray-400 transition-colors hover:text-green-600"
										title="พิมพ์"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="h-5 w-5"
										>
											<path
												fill-rule="evenodd"
												d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z"
												clip-rule="evenodd"
											/>
										</svg>
									</button>

									<a
										href="/freight-forwarder/job-orders/{job.id}/edit"
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
									</a>

									<button
										type="button"
										onclick={() => confirmDelete(job)}
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
					{#if jobs.length === 0}
						<tr>
							<td colspan="7" class="py-12 text-center text-gray-400">ไม่พบรายการ Job Order</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

{#if showDeleteModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity"
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
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
					</div>
					<div class="mt-1 text-left sm:mt-0">
						<h3 class="text-lg leading-6 font-bold text-gray-900">ยืนยันการลบข้อมูล</h3>
						<div class="mt-2">
							<p class="text-sm text-gray-500">
								คุณแน่ใจหรือไม่ว่าต้องการลบใบงาน <span class="font-bold text-gray-800"
									>{jobToDeleteName}</span
								>
								?
								<br />การกระทำนี้
								<span class="font-semibold text-red-600">ไม่สามารถย้อนกลับได้</span>
							</p>
						</div>
					</div>
				</div>
			</div>

			<div class="flex justify-end gap-3 bg-gray-50 px-6 py-4 sm:flex-row">
				<button
					type="button"
					class="mt-3 inline-flex w-full justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 sm:mt-0 sm:w-auto"
					onclick={closeModal}
					disabled={isDeleting}
				>
					ยกเลิก
				</button>

				<form
					method="POST"
					action="?/delete"
					use:enhance={() => {
						isDeleting = true;
						return async ({ update }) => {
							await update(); // อัปเดตตารางหลังจากลบใน DB แล้ว
							closeModal(); // ปิดหน้าต่าง Modal
						};
					}}
					class="m-0 flex w-full sm:w-auto"
				>
					<input type="hidden" name="id" value={jobToDeleteId} />
					<button
						type="submit"
						class="inline-flex w-full justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-500 disabled:opacity-50 sm:w-auto"
						disabled={isDeleting}
					>
						{#if isDeleting}
							<svg
								class="mr-2 -ml-1 h-4 w-4 animate-spin text-white"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								><circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle><path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path></svg
							>
							กำลังลบ...
						{:else}
							ยืนยันการลบ
						{/if}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
