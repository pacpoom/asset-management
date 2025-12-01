<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { ActionData, PageData } from './$types';

	// 1. Interfaces
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

	type Voucher = PageData['voucher'];

	// 2. Props & State
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let voucher = $state<Voucher>(data.voucher);
	let companyData = $state<Company>(data.company);

	let isSaving = $state(false);
	let isDeleteModalOpen = $state(false);
	let updateStatusForm: HTMLFormElement;
	let statusToUpdate = $state('');

	$effect(() => {
		voucher = data.voucher;
		companyData = data.company;
	});

	// --- Helpers ---
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
			Draft: 'bg-gray-100 text-gray-800',
			Posted: 'bg-green-100 text-green-800',
			Void: 'bg-red-100 text-red-800'
		};
		return statusMap[status] || 'bg-gray-100 text-gray-800';
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
</script>

<svelte:head>
	<title>{voucher.voucher_number} - รายละเอียด</title>
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
		<a href="/payments" class="mr-3 text-gray-500 hover:text-gray-800" title="Back to list">
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
			<div class="flex items-center gap-3">
				<h1 class="text-2xl font-bold text-gray-800">{voucher.voucher_number}</h1>
				<span
					class="rounded-full px-2.5 py-0.5 text-xs font-medium {voucher.voucher_type === 'RV'
						? 'bg-green-100 text-green-800'
						: 'bg-orange-100 text-orange-800'}"
				>
					{voucher.voucher_type === 'RV' ? 'ใบสำคัญรับ (RV)' : 'ใบสำคัญจ่าย (PV)'}
				</span>
			</div>
			<p class="mt-1 text-sm text-gray-500">
				{voucher.voucher_type === 'RV' ? 'รับจาก' : 'จ่ายให้'}:
				<span class="font-medium text-gray-700">{voucher.contact_name}</span>
			</p>
		</div>
	</div>

	<div class="flex flex-shrink-0 items-center gap-2">
		<span
			class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold {getStatusClass(
				voucher.status
			)}"
		>
			{voucher.status}
		</span>

		{#if voucher.status !== 'Draft'}
			<a
				href="/payments/generate-pdf?id={voucher.id}"
				target="_blank"
				class="inline-flex items-center justify-center rounded-lg bg-gray-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-600 disabled:opacity-50"
			>
				<span>พิมพ์ PDF</span>
			</a>
		{/if}

		<a
			href="/payments/{voucher.id}/edit"
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
				{#each data.availableStatuses as status}
					{#if status !== voucher.status}
						<option value={status} class="bg-white text-gray-800">{status}</option>
					{/if}
				{/each}
			</select>
		</div>

		<button
			onclick={() => (isDeleteModalOpen = true)}
			class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 disabled:opacity-50"
			disabled={isSaving}
		>
			Delete
		</button>
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
				<p class="text-sm text-red-500">ไม่พบข้อมูลบริษัท</p>
			{/if}
		</div>

		<div class="text-left md:text-right">
			<h1 class="text-2xl font-bold text-gray-800 uppercase">
				{voucher.voucher_type === 'RV' ? 'ใบสำคัญรับ' : 'ใบสำคัญจ่าย'}
			</h1>
			<p class="text-sm text-gray-500">
				{voucher.voucher_type === 'RV' ? 'Receipt Voucher (RV)' : 'Payment Voucher (PV)'}
			</p>

			<div class="mt-4 space-y-1">
				<div class="text-sm">
					<span class="font-semibold text-gray-600">เลขที่ / No.:</span>
					<span class="font-medium text-gray-800">#{voucher.voucher_number}</span>
				</div>
				<div class="text-sm">
					<span class="font-semibold text-gray-600">วันที่ / Date:</span>
					<span class="font-medium text-gray-800">{formatDate(voucher.voucher_date)}</span>
				</div>
			</div>
		</div>
	</div>

	<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
		<div>
			<h3 class="text-sm font-semibold text-gray-500 uppercase">
				{voucher.voucher_type === 'RV' ? 'รับเงินจาก (Received From)' : 'จ่ายให้แก่ (Paid To)'}
			</h3>
			<p class="text-lg font-semibold text-gray-800">{voucher.contact_name}</p>
		</div>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white p-6 shadow-sm">
	<h3 class="mb-3 border-b pb-2 text-lg font-semibold text-gray-700">รายละเอียด (Details)</h3>

	<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
		<div class="md:col-span-2">
			<p class="mb-1 text-sm font-medium text-gray-600">คำอธิบาย:</p>
			<div
				class="min-h-[100px] rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm whitespace-pre-wrap text-gray-700"
			>
				{voucher.description || '-'}
			</div>
		</div>

		<div class="md:col-span-1">
			<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
				<div class="mb-2 flex justify-between text-sm">
					<span class="text-gray-600">ยอดรวม (Subtotal)</span>
					<span class="font-medium text-gray-900">{formatCurrency(voucher.subtotal)}</span>
				</div>

				{#if voucher.vat_amount > 0}
					<div class="mb-2 flex justify-between text-sm">
						<span class="text-gray-600">VAT ({voucher.vat_rate}%)</span>
						<span class="font-medium text-gray-900">{formatCurrency(voucher.vat_amount)}</span>
					</div>
				{/if}

				{#if voucher.wht_amount > 0}
					<div class="mb-2 flex justify-between text-sm text-red-600">
						<span>หัก ณ ที่จ่าย ({voucher.wht_rate}%)</span>
						<span>- {formatCurrency(voucher.wht_amount)}</span>
					</div>
				{/if}

				<div class="mt-2 flex justify-between border-t border-gray-300 pt-3">
					<span class="text-base font-bold text-gray-900">ยอดสุทธิ</span>
					<span
						class="text-xl font-bold {voucher.voucher_type === 'RV'
							? 'text-green-600'
							: 'text-blue-600'}"
					>
						{formatCurrency(voucher.total_amount)}
					</span>
				</div>
			</div>
		</div>
	</div>
</div>

{#if isDeleteModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<div class="mb-4 flex items-center gap-3 text-red-600">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/></svg
				>
				<h3 class="text-lg font-bold text-gray-900">ยืนยันการลบ</h3>
			</div>

			<p class="mb-6 text-sm text-gray-600">
				คุณแน่ใจหรือไม่ที่จะลบเอกสาร <strong>{voucher.voucher_number}</strong>?
				<br />การดำเนินการนี้ไม่สามารถย้อนกลับได้
			</p>

			<div class="flex justify-end gap-3">
				<button
					type="button"
					onclick={() => (isDeleteModalOpen = false)}
					class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
				>
					ยกเลิก
				</button>
				<form method="POST" action="?/delete" use:enhance>
					<button
						type="submit"
						class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
					>
						ยืนยันการลบ
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
