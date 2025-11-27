<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { PageData } from './$types';

	export let data: PageData;
	$: ({ billingNote, invoices, availableStatuses } = data);

	const formatCurrency = (amount: number) =>
		new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);

	const formatDate = (dateStr: string) => {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString('th-TH', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	};

	function getStatusClass(status: string) {
		switch (status) {
			case 'Draft':
				return 'bg-gray-100 text-gray-800';
			case 'Sent':
				return 'bg-blue-100 text-blue-800';
			case 'Paid':
				return 'bg-green-100 text-green-800';
			case 'Void':
				return 'bg-red-100 text-red-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	// --- ส่วนจัดการเปลี่ยนสถานะ (Update Status) ---
	let updateStatusForm: HTMLFormElement;
	let statusToUpdate = '';
	let isSaving = false;

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
	<title>ใบวางบิล {billingNote.billing_note_number}</title>
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

<div class="mx-auto mb-10 max-w-5xl">
	<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
		<div>
			<div class="flex items-center gap-3">
				<h1 class="text-2xl font-bold text-gray-800">{billingNote.billing_note_number}</h1>
				<span
					class="rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusClass(
						billingNote.status
					)}"
				>
					{billingNote.status}
				</span>
			</div>
			<p class="mt-1 text-sm text-gray-500">
				ออกเมื่อ {formatDate(billingNote.billing_date)} โดย {billingNote.created_by_name}
			</p>
		</div>

		<div class="flex flex-wrap gap-2">
			<a
				href="/billing-notes"
				class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
			>
				ย้อนกลับ
			</a>

			<div class="relative">
				<select
					on:change={updateStatus}
					disabled={isSaving}
					class="cursor-pointer appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
					style="background-image: none;"
				>
					<option value="" disabled selected>เปลี่ยนสถานะ</option>
					{#if availableStatuses}
						{#each availableStatuses as status}
							{#if status !== billingNote.status}
								<option value={status}>{status}</option>
							{/if}
						{/each}
					{/if}
				</select>
				<div
					class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"
						></path>
					</svg>
				</div>
			</div>

			<a
				href="/billing-notes/{billingNote.id}/edit"
				class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="h-4 w-4"
				>
					<path
						d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
					/>
				</svg>
				แก้ไข
			</a>

			<a
				href="/billing-notes/generate-pdf?id={billingNote.id}"
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="h-4 w-4"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"
					/>
				</svg>
				พิมพ์ PDF
			</a>
		</div>
	</div>

	<div class="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
		<div class="grid grid-cols-1 gap-6 border-b border-gray-200 p-6 md:grid-cols-2">
			<div>
				<h3 class="mb-1 text-xs font-semibold tracking-wider text-gray-500 uppercase">
					ลูกค้า (Customer)
				</h3>
				<p class="text-lg font-medium text-gray-900">{billingNote.customer_name}</p>
				<p class="text-sm whitespace-pre-line text-gray-600">
					{billingNote.customer_address || '-'}
				</p>
				<p class="mt-1 text-sm text-gray-600">Tax ID: {billingNote.customer_tax_id || '-'}</p>
			</div>
			<div class="md:text-right">
				<div class="mb-2">
					<span class="text-xs font-semibold tracking-wider text-gray-500 uppercase"
						>วันที่วางบิล</span
					>
					<p class="font-medium text-gray-900">{formatDate(billingNote.billing_date)}</p>
				</div>
				<div class="mb-2">
					<span class="text-xs font-semibold tracking-wider text-red-600 uppercase"
						>กำหนดชำระ (Due Date)</span
					>
					<p class="font-bold text-red-700">{formatDate(billingNote.due_date)}</p>
				</div>
			</div>
		</div>
	</div>

	{#if billingNote.notes}
		<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
			<h4 class="mb-2 text-sm font-medium text-gray-900">หมายเหตุ</h4>
			<p class="text-sm text-gray-600">{billingNote.notes}</p>
		</div>
	{/if}
</div>
