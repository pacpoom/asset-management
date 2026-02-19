<script lang="ts">
	export let data;
	$: job = data.job;

	function getStatusClass(status: string) {
		switch (status) {
			case 'Pending':
				return 'bg-blue-100 text-blue-800 border-blue-200';
			case 'In Progress':
				return 'bg-yellow-100 text-yellow-800 border-yellow-200';
			case 'Completed':
				return 'bg-green-100 text-green-800 border-green-200';
			case 'Cancelled':
				return 'bg-red-100 text-red-800 border-red-200';
			default:
				return 'bg-gray-100 text-gray-800 border-gray-200';
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
</script>

<div class="min-h-screen bg-gray-100 p-6 pb-20">
	<div class="mx-auto mb-6 flex max-w-4xl items-center justify-between">
		<div class="flex items-center gap-4">
			<a
				href="/freight-forwarder/job-orders"
				title="ย้อนกลับ"
				class="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm transition-colors hover:bg-blue-50 hover:text-blue-600"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					class="h-5 w-5"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
					/></svg
				>
			</a>
			<div>
				<h1 class="text-2xl font-bold text-gray-800">
					Job Order: {formatJobNumber(job.job_type, job.job_date, job.id)}
				</h1>
				<p class="text-sm text-gray-500">รายละเอียดใบงานขนส่ง</p>
			</div>
		</div>
		<div class="flex gap-3">
			<a
				href="/freight-forwarder/job-orders/{job.id}/edit"
				class="flex items-center gap-2 rounded border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50"
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
						d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
					/></svg
				>
				แก้ไขข้อมูล
			</a>
			<button
				class="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
				onclick={() => window.print()}
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
						d="M6.728 6.75A.75.75 0 017.5 6h9a.75.75 0 01.728.75v3.75a.75.75 0 01-.728.75h-9a.75.75 0 01-.728-.75V6.75zM3 15.75v-1.5A2.25 2.25 0 015.25 12h13.5A2.25 2.25 0 0121 14.25v1.5a2.25 2.25 0 01-2.25 2.25h-13.5A2.25 2.25 0 013 15.75z"
					/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12v3m-6-3v3" /></svg
				>
				พิมพ์ใบงาน
			</button>
		</div>
	</div>

	<div
		class="mx-auto max-w-4xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg print:border-none print:shadow-none"
	>
		<div class="h-2 w-full bg-gray-800 print:hidden"></div>

		<div class="p-8 md:p-12">
			<div class="mb-10 flex items-start justify-between border-b border-gray-100 pb-8">
				<div>
					<h2 class="text-3xl font-black tracking-tight text-gray-800 uppercase">Job Order</h2>
					<div class="mt-2 font-mono text-lg text-gray-500">
						{formatJobNumber(job.job_type, job.job_date, job.id)}
					</div>
				</div>
				<div class="text-right">
					<span
						class="inline-flex items-center rounded-full border px-3 py-1 text-sm font-bold tracking-wider uppercase {getStatusClass(
							job.job_status
						)}"
					>
						{job.job_status}
					</span>
					<p class="mt-3 text-sm font-medium text-gray-500">
						Job Date: <span class="text-gray-800"
							>{new Date(job.job_date).toLocaleDateString('th-TH')}</span
						>
					</p>
					{#if job.expire_date}
						<p class="mt-1 text-sm font-medium text-gray-500">
							Expire Date: <span class="text-gray-800"
								>{new Date(job.expire_date).toLocaleDateString('th-TH')}</span
							>
						</p>
					{/if}
				</div>
			</div>

			<div class="mb-10 grid grid-cols-1 gap-10 md:grid-cols-2">
				<div>
					<h3 class="mb-3 text-xs font-bold tracking-wider text-gray-400 uppercase">
						Customer Information
					</h3>
					<div class="rounded-lg border border-gray-100 bg-gray-50 p-5">
						<div class="text-lg font-bold text-gray-800">
							{job.company_name || job.customer_name}
						</div>
						{#if job.company_name && job.customer_name}
							<div class="mt-1 font-medium text-gray-700">Contact: {job.customer_name}</div>
						{/if}
						<div class="mt-2 text-sm leading-relaxed text-gray-500">
							{job.customer_address || 'ไม่มีข้อมูลที่อยู่'}
						</div>
						{#if job.contract_number}
							<div
								class="mt-4 inline-block rounded border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700"
							>
								Contract: {job.contract_number}
							</div>
						{/if}
					</div>
				</div>

				<div>
					<h3 class="mb-3 text-xs font-bold tracking-wider text-gray-400 uppercase">
						Shipment Details
					</h3>
					<div class="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
						<div class="grid grid-cols-2 gap-4">
							<div>
								<p class="text-xs text-gray-500 uppercase">Job Type</p>
								<div class="mt-1 flex items-center gap-2">
									<span class="font-bold text-gray-800">{job.job_type}</span>
									{#if job.service_type}
										<span
											class="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 uppercase"
											>{job.service_type}</span
										>
									{/if}
								</div>
							</div>
							<div>
								<p class="text-xs text-gray-500 uppercase">B/L Number</p>
								<p class="mt-1 font-mono font-bold text-blue-600">{job.bl_number}</p>
							</div>
						</div>

						<div class="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3">
							<div>
								<p class="text-xs text-gray-500 uppercase">Liner / Carrier</p>
								<p class="mt-1 font-medium text-gray-800">{job.liner_name || '-'}</p>
							</div>
							<div>
								<p class="text-xs text-gray-500 uppercase">Location / Port</p>
								<p class="mt-1 font-medium text-gray-800">{job.location || '-'}</p>
							</div>
						</div>
						{#if job.invoice_no}
							<div class="border-t border-gray-100 pt-3">
								<p class="text-xs text-gray-500 uppercase">Customer Invoice</p>
								<p class="mt-1 font-medium text-gray-800">{job.invoice_no}</p>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<h3 class="mb-3 text-xs font-bold tracking-wider text-gray-400 uppercase">
				Financial Overview
			</h3>
			<div
				class="mb-8 flex flex-col items-center justify-between rounded-lg border border-blue-100 bg-blue-50 p-6 md:flex-row"
			>
				<div class="font-medium text-blue-800">ยอดเงินเบื้องต้น (Initial Amount)</div>
				<div class="mt-2 font-mono text-3xl font-black text-blue-900 md:mt-0">
					{Number(job.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
					<span class="text-lg text-blue-700">{job.currency}</span>
				</div>
			</div>

			{#if job.remarks}
				<div class="border-t border-gray-100 pt-6">
					<h3 class="mb-2 text-xs font-bold tracking-wider text-gray-400 uppercase">Remarks</h3>
					<p class="text-sm leading-relaxed whitespace-pre-line text-gray-600">{job.remarks}</p>
				</div>
			{/if}

			<div
				class="mt-16 border-t border-gray-200 pt-6 text-center text-xs text-gray-400 print:hidden"
			>
				Created on {new Date(job.created_at).toLocaleString('th-TH')}
			</div>
		</div>
	</div>
</div>

<style>
	@media print {
		:global(body) {
			background-color: white;
		}
		:global(nav),
		:global(aside) {
			display: none !important;
		}
	}
</style>
