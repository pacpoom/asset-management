<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { ActionData, PageData } from './$types';

	interface Company {
		name: string;
		logo_path: string | null;
		address_line_1: string | null;
		address_line_2: string | null;
		city: string | null;
		state_province: string | null;
		postal_code: string | null;
		country: string | null;
		phone: string | null;
		email: string | null;
		website: string | null;
		tax_id: string | null;
	}

	type JobOrder = PageData['job'];
	type Attachment = PageData['attachments'][0];

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let job = $state<JobOrder>(data.job);
	let attachments = $state<Attachment[]>(data.attachments || []);
	let companyData = $state<Company | null>(data.company || null);

	let isSaving = $state(false);
	let updateStatusForm: HTMLFormElement;
	let statusToUpdate = $state('');

	$effect(() => {
		job = data.job;
		attachments = data.attachments || [];
		companyData = data.company || null;
	});

	const formatCurrency = (amount: number | null | undefined) => {
		if (amount === null || amount === undefined) return '-';
		return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
	};

	const formatDate = (dateStr: string | null | undefined) => {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString('th-TH', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	};

	function getStatusClass(status: string) {
		const statusMap: Record<string, string> = {
			Pending: 'bg-blue-100 text-blue-800',
			'In Progress': 'bg-yellow-100 text-yellow-800',
			Completed: 'bg-green-100 text-green-800',
			Cancelled: 'bg-red-100 text-red-800'
		};
		return statusMap[status] || 'bg-gray-100 text-gray-800';
	}

	function getFileIcon(fileName: string): string {
		const ext = fileName?.split('.').pop()?.toLowerCase() || '';
		if (['pdf'].includes(ext)) return '📄';
		if (['doc', 'docx'].includes(ext)) return '📝';
		if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
		if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
		return '📎';
	}

	function formatJobNumber(type: string, dateStr: string, id: number) {
		if (job.job_number) return job.job_number;
		if (!type || !dateStr || !id) return `JOB-${id}`;
		const d = new Date(dateStr);
		const yy = String(d.getFullYear()).slice(-2);
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const paddedId = String(id).padStart(4, '0');
		return `${type}${yy}${mm}${paddedId}`;
	}

	async function updateStatus(e: Event) {
		const newStatus = (e.currentTarget as HTMLSelectElement).value;
		if (!newStatus) return;
		statusToUpdate = newStatus;
		isSaving = true;
		await tick();
		if (updateStatusForm) {
			updateStatusForm.requestSubmit();
		}
	}

	// สถานะที่มีให้เลือก (เผื่อว่าใน PageData ไม่ได้ส่ง availableStatuses มา)
	const availableStatuses = data.availableStatuses || [
		'Pending',
		'In Progress',
		'Completed',
		'Cancelled'
	];
</script>

<svelte:head>
	<title>ใบสั่งงาน {formatJobNumber(job.job_type, job.job_date, job.id)}</title>
</svelte:head>

<form
	method="POST"
	action="?/updateStatus"
	use:enhance={() => {
		return async ({ update }) => {
			await update();
			isSaving = false;
		};
	}}
	class="hidden"
	bind:this={updateStatusForm}
>
	<input type="hidden" name="status" bind:value={statusToUpdate} />
</form>

<div
	class="mb-6 flex flex-col items-start justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center"
>
	<div class="flex items-center">
		<a
			href="/freight-forwarder/job-orders"
			class="mr-3 text-gray-500 hover:text-gray-800"
			title="Back to list"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-6 w-6"><path d="m15 18-6-6 6-6"></path></svg
			>
		</a>
		<div>
			<h1 class="text-2xl font-bold text-gray-800">
				ใบสั่งงาน #{formatJobNumber(job.job_type, job.job_date, job.id)}
			</h1>
			<p class="mt-1 text-sm text-gray-500">
				Customer: <span class="font-medium text-gray-700"
					>{job.company_name || job.customer_name || '-'}</span
				>
				| Ref Invoice: {job.invoice_no || '-'}
			</p>
		</div>
	</div>

	<div class="flex flex-shrink-0 items-center gap-2">
		<span
			class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold {getStatusClass(
				job.job_status
			)}"
		>
			{job.job_status}
		</span>

		<a
			href="/freight-forwarder/job-orders/generate-pdf?id={job.id}"
			target="_blank"
			class="inline-flex items-center justify-center rounded-lg bg-gray-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-600 disabled:opacity-50"
		>
			<span>พิมพ์ PDF</span>
		</a>

		<a
			href="/freight-forwarder/job-orders/{job.id}/edit"
			class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
		>
			Edit
		</a>

		<div class="relative">
			<select
				id="status-change-select"
				onchange={updateStatus}
				disabled={isSaving}
				class="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-yellow-600 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
			>
				<option value="" disabled selected>Change Status</option>
				{#each availableStatuses as status}
					{#if status !== job.job_status}
						<option value={status} class="bg-white text-gray-800">{status}</option>
					{/if}
				{/each}
			</select>
		</div>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white p-6 shadow-sm">
	<div class="flex flex-col justify-between gap-4 border-b pb-4 md:flex-row">
		<div>
			{#if companyData}
				{#if companyData.logo_path}
					<img
						src={companyData.logo_path}
						alt={companyData.name || 'Company Logo'}
						class="mb-2 h-16 max-w-xs object-contain"
					/>
				{:else if companyData.name}
					<h2 class="text-2xl font-bold text-gray-800">{companyData.name}</h2>
				{/if}

				<div class="mt-2 space-y-0.5 text-sm text-gray-500">
					{#if companyData.address_line_1}<p>{companyData.address_line_1}</p>{/if}
					{#if companyData.address_line_2}<p>{companyData.address_line_2}</p>{/if}
					<p>
						{companyData.city || ''}
						{companyData.state_province || ''}
						{companyData.postal_code || ''}
					</p>
					<p>{companyData.country || ''}</p>

					{#if companyData.phone}<p class="mt-1">
							<span class="font-semibold">Tel:</span>
							{companyData.phone}
						</p>{/if}
					{#if companyData.email}<p>
							<span class="font-semibold">Email:</span>
							{companyData.email}
						</p>{/if}

					<p class="mt-1">
						<span class="font-semibold text-gray-700">Tax ID:</span>
						{companyData.tax_id || '-'}
					</p>
				</div>
			{:else}
				<h2 class="text-2xl font-bold text-gray-800">บริษัทของคุณ</h2>
				<p class="mt-2 text-sm text-gray-500">(ไม่ได้ตั้งค่าข้อมูลบริษัท)</p>
			{/if}
		</div>

		<div class="text-left md:text-right">
			<h1 class="text-2xl font-bold text-gray-800 uppercase">JOB ORDER</h1>
			<p class="text-sm text-gray-500">ใบสั่งงานขนส่ง</p>

			<div class="mt-4 space-y-1">
				<div class="text-sm">
					<span class="font-semibold text-gray-600">เลขที่ / Job No.:</span>
					<span class="font-medium text-gray-800"
						>#{formatJobNumber(job.job_type, job.job_date, job.id)}</span
					>
				</div>
				<div class="text-sm">
					<span class="font-semibold text-gray-600">วันที่ / Job Date:</span>
					<span class="font-medium text-gray-800">{formatDate(job.job_date)}</span>
				</div>
				{#if job.expire_date}
					<div class="text-sm">
						<span class="font-semibold text-gray-600">วันหมดอายุ / Expire:</span>
						<span class="font-medium text-gray-800">{formatDate(job.expire_date)}</span>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
		<div class="md:col-span-2">
			<h3 class="text-sm font-semibold text-gray-500 uppercase">ลูกค้า (Customer)</h3>
			<p class="font-semibold text-gray-800">
				{job.company_name || job.customer_name || 'ไม่ระบุ'}
			</p>

			{#if job.company_name && job.customer_name}
				<p class="mt-1 text-sm text-gray-600">Contact: {job.customer_name}</p>
			{/if}

			<p class="mt-1 text-sm whitespace-pre-wrap text-gray-600">{job.customer_address || '-'}</p>
			<p class="mt-1 text-sm">
				<span class="font-semibold text-gray-700">Tax ID:</span>
				{job.customer_tax_id || '-'}
			</p>

			{#if job.contract_number}
				<p class="mt-1 text-sm">
					<span class="font-semibold text-gray-700">อ้างอิงสัญญา:</span>
					{job.contract_number}
				</p>
			{/if}
		</div>

		<div class="md:col-span-1">
			<h3 class="text-sm font-semibold text-gray-500 uppercase">ข้อมูลเพิ่มเติม (More Info)</h3>
			<p class="mt-1 text-xs text-gray-600">
				<span class="font-semibold">ผู้เตรียม / Prepared By:</span>
				{job.created_by_name || 'System Admin'}
			</p>
			<div class="mt-2 text-xs text-gray-600">
				<span class="font-semibold">สร้างเมื่อ / Created At:</span>
				<p>{formatDate(job.created_at)}</p>
			</div>
		</div>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white shadow-sm">
	<h3 class="mb-3 border-b p-4 pb-2 text-lg font-semibold text-gray-700">
		รายละเอียดการขนส่ง (Shipment Details)
	</h3>
	<div class="p-6">
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="space-y-4">
				<div class="flex items-center justify-between border-b border-gray-100 pb-2">
					<span class="text-sm font-medium text-gray-600">Job Type</span>
					<div class="flex items-center gap-2">
						<span class="font-bold text-gray-900">{job.job_type}</span>
						{#if job.service_type}
							<span
								class="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700 uppercase"
							>
								{job.service_type}
							</span>
						{/if}
					</div>
				</div>
				<div class="flex items-center justify-between border-b border-gray-100 pb-2">
					<span class="text-sm font-medium text-gray-600">B/L Number</span>
					<span class="font-mono font-bold text-blue-600">{job.bl_number || '-'}</span>
				</div>
			</div>

			<div class="space-y-4">
				<div class="flex items-center justify-between border-b border-gray-100 pb-2">
					<span class="text-sm font-medium text-gray-600">Liner / Carrier</span>
					<span class="font-medium text-gray-900">{job.liner_name || '-'}</span>
				</div>
				<div class="flex items-center justify-between border-b border-gray-100 pb-2">
					<span class="text-sm font-medium text-gray-600">Location / Port</span>
					<span class="font-medium text-gray-900">{job.location || '-'}</span>
				</div>
				<div class="flex items-center justify-between border-b border-gray-100 pb-2">
					<span class="text-sm font-medium text-gray-600">Customer Invoice Ref.</span>
					<span class="font-medium text-gray-900">{job.invoice_no || '-'}</span>
				</div>
			</div>
		</div>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white p-4 shadow-sm">
	<h2 class="border-b pb-2 text-lg font-semibold text-gray-700">Financial Summary</h2>
	<div class="mt-3 w-full space-y-2 text-sm">
		<div class="flex w-full flex-col items-end justify-end">
			<div class="flex w-full max-w-sm items-center justify-between border-t-2 pt-2">
				<span class="text-base font-bold text-gray-900">Initial Amount:</span>
				<span class="text-xl font-bold text-blue-700">
					{formatCurrency(job.amount)}
					<span class="ml-1 text-sm text-gray-500">{job.currency || 'THB'}</span>
				</span>
			</div>
		</div>
	</div>
</div>

<div class="mb-6 grid grid-cols-1 gap-6">
	<div class="rounded-lg border bg-white p-4 shadow-sm">
		<h3 class="mb-3 border-b pb-2 text-lg font-semibold text-gray-700">Remarks (หมายเหตุ)</h3>
		<p class="text-sm whitespace-pre-wrap text-gray-600">{job.remarks || 'No remarks.'}</p>
	</div>

	<div class="rounded-lg border bg-white p-4 shadow-sm">
		<h3 class="mb-3 border-b pb-2 text-lg font-semibold text-gray-700">
			Attachments ({attachments.length})
		</h3>
		<div class="space-y-2">
			{#if attachments.length === 0}
				<p class="text-sm text-gray-500">No attachments found.</p>
			{:else}
				{#each attachments as attachment (attachment.id)}
					<div class="flex items-center justify-between rounded-md bg-gray-100 p-2 text-sm">
						<div class="flex items-center gap-2 overflow-hidden">
							<span class="flex-shrink-0 text-lg">{getFileIcon(attachment.file_original_name)}</span
							>
							<a
								href={attachment.url || `/uploads/job_orders/${attachment.file_system_name}`}
								target="_blank"
								rel="noopener noreferrer"
								class="truncate text-blue-600 hover:underline"
								title={attachment.file_original_name}>{attachment.file_original_name}</a
							>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>
