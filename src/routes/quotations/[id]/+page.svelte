<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { PageData } from './$types';

	export let data: PageData;
	$: ({ quotation, items, attachments, availableStatuses } = data);

	const formatCurrency = (amount: number) =>
		new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
	const formatDate = (dateStr: string) =>
		dateStr
			? new Date(dateStr).toLocaleDateString('th-TH', {
					year: 'numeric',
					month: 'long',
					day: 'numeric'
				})
			: '-';

	function getStatusClass(status: string) {
		switch (status) {
			case 'Draft':
				return 'bg-gray-100 text-gray-800';
			case 'Sent':
				return 'bg-blue-100 text-blue-800';
			case 'Accepted':
				return 'bg-green-100 text-green-800';
			case 'Rejected':
				return 'bg-red-100 text-red-800';
			case 'Invoiced':
				return 'bg-purple-100 text-purple-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	// จัดการเปลี่ยนสถานะ
	let updateStatusForm: HTMLFormElement;
	let statusToUpdate = '';
	let isSaving = false;

	async function updateStatus(e: Event) {
		statusToUpdate = (e.currentTarget as HTMLSelectElement).value;
		isSaving = true;
		await tick();
		updateStatusForm.requestSubmit();
	}
</script>

<svelte:head>
	<title>ใบเสนอราคา {quotation.quotation_number}</title>
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
				<h1 class="text-2xl font-bold text-gray-800">{quotation.quotation_number}</h1>
				<span
					class="rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusClass(quotation.status)}"
				>
					{quotation.status}
				</span>
			</div>
			<p class="mt-1 text-sm text-gray-500">
				สร้างโดย {quotation.created_by_name} เมื่อ {formatDate(quotation.created_at)}
			</p>
		</div>

		<div class="flex flex-wrap gap-2">
			<a
				href="/quotations"
				class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
				>ย้อนกลับ</a
			>

			<div class="relative">
				<select
					on:change={updateStatus}
					disabled={isSaving}
					class="cursor-pointer appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none"
					style="background-image: none;"
				>
					<option value="" disabled selected>เปลี่ยนสถานะ</option>
					{#each availableStatuses as status}
						{#if status !== quotation.status}<option value={status}>{status}</option>{/if}
					{/each}
				</select>
				<div
					class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 9l-7 7-7-7"
						></path></svg
					>
				</div>
			</div>

			<a
				href="/quotations/{quotation.id}/edit"
				class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="h-4 w-4"
					><path
						d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
					/></svg
				>
				แก้ไข
			</a>

			<a
				href="/quotations/generate-pdf?id={quotation.id}"
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
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"
					/></svg
				>
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
				<p class="text-lg font-medium text-gray-900">{quotation.customer_name}</p>
				<p class="text-sm whitespace-pre-line text-gray-600">{quotation.customer_address || '-'}</p>
				<p class="mt-1 text-sm text-gray-600">Tax ID: {quotation.customer_tax_id || '-'}</p>
			</div>
			<div class="md:text-right">
				<div class="mb-2">
					<span class="text-xs font-semibold tracking-wider text-gray-500 uppercase"
						>วันที่เอกสาร</span
					>
					<p class="font-medium text-gray-900">{formatDate(quotation.quotation_date)}</p>
				</div>
				<div class="mb-2">
					<span class="text-xs font-semibold tracking-wider text-gray-500 text-red-600 uppercase"
						>ยืนยันราคาถึง (Valid Until)</span
					>
					<p class="font-bold text-red-700">{formatDate(quotation.valid_until)}</p>
				</div>
				<div>
					<span class="text-xs font-semibold tracking-wider text-gray-500 uppercase"
						>เอกสารอ้างอิง</span
					>
					<p class="text-gray-900">{quotation.reference_doc || '-'}</p>
				</div>
			</div>
		</div>

		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200">
				<thead class="bg-gray-50">
					<tr>
						<th
							class="w-12 px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>ลำดับ</th
						>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
							>รายการ</th
						>
						<th
							class="w-24 px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase"
							>จำนวน</th
						>
						<th
							class="w-32 px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase"
							>ราคา/หน่วย</th
						>
						<th
							class="w-32 px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase"
							>รวม</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#each items as item, i}
						<tr>
							<td class="px-6 py-4 text-sm text-gray-500">{i + 1}</td>
							<td class="px-6 py-4 text-sm text-gray-900">
								<div class="font-medium">{item.description}</div>
							</td>
							<td class="px-6 py-4 text-right text-sm text-gray-900">
								{item.quantity} <span class="text-xs text-gray-500">{item.unit_symbol || ''}</span>
							</td>
							<td class="px-6 py-4 text-right text-sm text-gray-900"
								>{formatCurrency(item.unit_price)}</td
							>
							<td class="px-6 py-4 text-right text-sm font-medium text-gray-900"
								>{formatCurrency(item.line_total)}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="border-t border-gray-200 bg-gray-50 p-6">
			<div class="flex flex-col justify-between gap-6 md:flex-row">
				<div class="w-full md:w-1/2">
					<h4 class="mb-2 text-sm font-medium text-gray-900">หมายเหตุ</h4>
					<p class="rounded border border-gray-200 bg-white p-3 text-sm text-gray-600">
						{quotation.notes || '-'}
					</p>
					{#if attachments.length > 0}
						<h4 class="mt-4 mb-2 text-sm font-medium text-gray-900">
							ไฟล์แนบ ({attachments.length})
						</h4>
						<ul class="space-y-1">
							{#each attachments as file}
								<li>
									<a
										href={file.url}
										target="_blank"
										rel="noopener noreferrer"
										class="flex items-center gap-2 text-sm text-blue-600 hover:underline"
										><svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="h-4 w-4"
											><path
												fill-rule="evenodd"
												d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.551a.75.75 0 111.061 1.06l-3.45 3.551a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z"
												clip-rule="evenodd"
											/></svg
										>{file.file_original_name}</a
									>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
				<div class="w-full space-y-2 md:w-1/3">
					<div class="flex justify-between text-sm">
						<span class="text-gray-600">รวมเป็นเงิน</span><span class="font-medium text-gray-900"
							>{formatCurrency(quotation.subtotal)}</span
						>
					</div>
					{#if parseFloat(quotation.discount_amount) > 0}
						<div class="flex justify-between text-sm text-red-600">
							<span>ส่วนลด</span><span>- {formatCurrency(quotation.discount_amount)}</span>
						</div>
					{/if}

					<div class="flex justify-between text-sm">
						<span class="text-gray-600">VAT ({quotation.vat_rate}%)</span><span
							class="font-medium text-gray-900">{formatCurrency(quotation.vat_amount)}</span
						>
					</div>

					{#if parseFloat(quotation.withholding_tax_amount) > 0}
						<div class="flex justify-between text-sm text-red-600">
							<span>หัก ณ ที่จ่าย ({quotation.withholding_tax_rate}%)</span>
							<span>- {formatCurrency(quotation.withholding_tax_amount)}</span>
						</div>
					{/if}
					<div class="mt-1 flex items-center justify-between border-t border-gray-300 pt-3">
						<span class="text-base font-bold text-gray-900">ยอดสุทธิ</span><span
							class="text-xl font-bold text-blue-600">{formatCurrency(quotation.total_amount)}</span
						>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
