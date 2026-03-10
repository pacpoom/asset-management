<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import type { ActionData, PageData } from './$types';
	import { t, locale } from '$lib/i18n'; // 🌟 ดึงตัวแปลภาษามา

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	export type Customer = PageData['customers'][0];
	export type Product = PageData['products'][0];
	export type Unit = PageData['units'][0];

	export interface BillingNoteItem {
		id: string;
		product_object: { value: number; label: string; product: Product } | null;
		product_id: number | null;
		description: string;
		quantity: number;
		unit_id: number | null;
		unit_price: number;
		wht_rate: number; // เพิ่ม WHT รายบรรทัด
		amount: number;
	}

	let isSaving = $state(false);

	let selectedCustomer = $state<any>(null);
	let billing_date = $state(new Date().toISOString().split('T')[0]);
	let due_date = $state('');
	let notes = $state('');
	let items = $state<BillingNoteItem[]>([]);
	let attachments = $state<FileList | null>(null);

	let discountAmount = $state(0);
	let vatRate = $state(7);
	let whtRate = $state(0);
	// WHT รวม (Global WHT ด้านล่างสุด)

	let globalMessage = $state<{ text: string; type: 'success' | 'error' } | null>(null);
	let messageTimeout: NodeJS.Timeout;

	function showGlobalMessage(text: string, type: 'success' | 'error', duration = 5000) {
		clearTimeout(messageTimeout);
		globalMessage = { text, type };
		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, duration);
	}

	// --- คำนวณยอดเงิน ---
	const subTotal = $derived(items.reduce((sum, item) => sum + (item.amount || 0), 0));
	const totalAfterDiscount = $derived(Math.max(0, subTotal - (discountAmount || 0)));
	const vatAmount = $derived(vatRate > 0 ? (totalAfterDiscount * vatRate) / 100 : 0);
	const totalWhtAmount = $derived(
		items.reduce((sum, item) => sum + ((item.amount || 0) * (item.wht_rate || 0)) / 100, 0)
	);
	const grandTotal = $derived(totalAfterDiscount + vatAmount - totalWhtAmount);

	const customerOptions = $derived(
		(data.customers || []).map((c: any) => ({
			value: c.id,
			label: c.name,
			customer: c
		}))
	);
	const productOptions = $derived(
		(data.products || []).map((p: any) => ({
			value: p.id,
			label: `${p.sku ? p.sku + ' - ' : ''}${p.name}`,
			product: p
		}))
	);

	// 🌟 ปรับรูปแบบตัวเลขให้เปลี่ยนตามภาษาแบบ Reactive ของ Svelte 5
	const currentLoc = $derived($locale === 'th' ? 'th-TH' : $locale === 'zh' ? 'zh-CN' : 'en-US');

	function formatCurrency(val: number) {
		return new Intl.NumberFormat(currentLoc, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(val || 0);
	}

	function addLineItem() {
		items = [
			...items,
			{
				id: crypto.randomUUID(),
				product_object: null,
				product_id: null,
				description: '',
				quantity: 1,
				unit_id: null,
				unit_price: 0,
				wht_rate: 0,
				amount: 0
			}
		];
	}

	function removeLineItem(id: string) {
		items = items.filter((i) => i.id !== id);
	}

	function onProductChange(item: BillingNoteItem) {
		const selected = item.product_object;
		if (selected && selected.product) {
			item.product_id = selected.product.id;
			item.description = selected.product.name;
			item.unit_id = selected.product.unit_id;
			item.unit_price = Number(selected.product.selling_price) || 0;
		} else {
			item.product_id = null;
			item.description = '';
			item.unit_id = null;
			item.unit_price = 0;
		}
		updateLineTotal(item);
	}

	function updateLineTotal(item: BillingNoteItem) {
		item.amount = (item.quantity || 0) * (item.unit_price || 0);
		items = [...items];
	}

	// ให้มี 1 บรรทัดว่างเสมอตอนเปิดหน้ามา
	$effect(() => {
		if (items.length === 0) {
			addLineItem();
		}
	});
</script>

<svelte:head>
	<title>{$t('Create Billing Note (New Billing Note)')}</title>
	<link rel="stylesheet" href="https://unpkg.com/svelte-select@latest/dist/stylesheet.css" />
</svelte:head>

<div class="mx-auto max-w-7xl p-4 md:p-6">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-800">{$t('Create Billing Note')}</h1>
		<p class="mt-1 text-sm text-gray-500">{$t('Fill info to create billing note')}</p>
	</div>

	<div class="relative z-0 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		<form
			method="POST"
			action="?/create"
			enctype="multipart/form-data"
			use:enhance={({ formData }) => {
				isSaving = true;
				globalMessage = null;
				formData.set(
					'itemsJson',
					JSON.stringify(
						items.map((item) => ({
							product_id: item.product_id,
							description: item.description,
							quantity: item.quantity,
							unit_id: item.unit_id,
							unit_price: item.unit_price,
							wht_rate: item.wht_rate,
							amount: item.amount
						}))
					)
				);
				formData.set('subtotal', subTotal.toString());
				formData.set('discount_amount', discountAmount.toString());
				formData.set('vat_rate', vatRate.toString());
				formData.set('vat_amount', vatAmount.toString());
				formData.set('withholding_tax_rate', '0');
				formData.set('withholding_tax_amount', totalWhtAmount.toString());
				formData.set('total_amount', grandTotal.toString());

				return async ({ update, result }) => {
					await update({ reset: false });
					isSaving = false;

					if (result.type === 'success') {
						// กลับไปหน้า List เมื่อสร้างเสร็จ
						goto('/billing-notes');
					} else if (result.type === 'failure') {
						showGlobalMessage((result.data?.message as string) || 'เกิดข้อผิดพลาด', 'error');
					}
				};
			}}
		>
			<div class="space-y-6">
				<div class="relative z-50 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
					<div class="md:col-span-2">
						<label for="customer_select" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Customer')} <span class="text-red-500">*</span></label
						>
						<Select
							id="customer_select"
							items={customerOptions}
							bind:value={selectedCustomer}
							placeholder={$t('-- Search/Select Customer --')}
							class="w-full"
							required
							container={browser ? document.body : null}
						/>
						<input type="hidden" name="customer_id" value={selectedCustomer?.value ?? ''} />
					</div>
					<div>
						<label for="billing_date" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Billing Date')} <span class="text-red-500">*</span></label
						>
						<input
							id="billing_date"
							type="date"
							name="billing_date"
							bind:value={billing_date}
							required
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label for="due_date" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Due Date')}</label
						>
						<input
							id="due_date"
							type="date"
							name="due_date"
							bind:value={due_date}
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
						/>
					</div>
				</div>

				<div>
					<h3 class="text-md mb-2 font-semibold text-gray-800">{$t('Billing Items')}</h3>
					<div class="relative z-10 overflow-x-visible rounded border border-gray-200">
						<table class="min-w-full table-fixed divide-y divide-gray-200 text-sm">
							<thead class="bg-gray-50">
								<tr>
									<th class="w-10 px-3 py-3 text-center text-gray-500">{$t('No.')}</th>

									<th
										class="w-[200px] max-w-[200px] px-3 py-3 text-left font-semibold text-gray-600"
									>
										{$t('Product/Service')}
									</th>

									<th class="w-48 px-3 py-3 text-left font-semibold text-gray-600"
										>{$t('Description')}</th
									>

									<th class="w-24 px-3 py-3 text-center font-semibold text-gray-600"
										>{$t('Quantity')}</th
									>
									<th class="w-24 px-3 py-3 text-center font-semibold text-gray-600"
										>{$t('Unit')}</th
									>
									<th class="w-28 px-3 py-3 text-center font-semibold text-gray-600"
										>{$t('Unit Price')}</th
									>
									<th class="w-24 px-3 py-3 text-center font-semibold text-red-600">{$t('WHT')}</th>
									<th class="w-32 px-3 py-3 text-right font-semibold text-gray-600"
										>{$t('Total')}</th
									>
									<th class="w-10 px-3 py-3"></th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each items as item, index (item.id)}
									<tr class="align-top hover:bg-gray-50">
										<td class="px-3 py-2 pt-3 text-center">{index + 1}</td>
										<td class="w-[200px] max-w-[200px] px-3 py-2">
											<div class="w-full overflow-hidden">
												<Select
													items={productOptions}
													bind:value={item.product_object}
													on:change={() => onProductChange(item)}
													placeholder={$t('-- Search/Select --')}
													container={browser ? document.body : null}
													floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
												/>
											</div>
										</td>
										<td class="px-3 py-2">
											<input
												type="text"
												bind:value={item.description}
												placeholder={$t('Additional details...')}
												class="w-full truncate rounded-md border-gray-300 py-1.5 text-sm focus:border-blue-500 focus:ring-blue-500"
											/>
										</td>
										<td class="px-3 py-2">
											<input
												type="number"
												bind:value={item.quantity}
												oninput={() => updateLineTotal(item)}
												min="0"
												class="w-full rounded-md border-gray-300 py-1.5 text-center text-sm focus:border-blue-500 focus:ring-blue-500"
											/>
										</td>
										<td class="px-3 py-2">
											<select
												bind:value={item.unit_id}
												class="w-full rounded-md border-gray-300 py-1.5 text-center text-sm focus:border-blue-500"
											>
												<option value={null}>-</option>
												{#each data.units || [] as u}
													<option value={u.id}>{u.symbol || u.name}</option>
												{/each}
											</select>
										</td>
										<td class="px-3 py-2">
											<input
												type="number"
												bind:value={item.unit_price}
												oninput={() => updateLineTotal(item)}
												min="0"
												step="0.01"
												class="w-full rounded-md border-gray-300 py-1.5 text-right text-sm focus:border-blue-500 focus:ring-blue-500"
											/>
										</td>
										<td class="px-3 py-2">
											<select
												bind:value={item.wht_rate}
												class="w-full rounded-md border-red-200 bg-red-50 py-1.5 text-center text-sm font-semibold text-red-700 focus:border-red-500 focus:ring-red-500"
											>
												<option value={0}>0%</option>
												<option value={1}>1%</option>
												<option value={2}>2%</option>
												<option value={3}>3%</option>
												<option value={5}>5%</option>
											</select>
										</td>
										<td class="px-3 py-2 pt-3 text-right font-medium"
											>{formatCurrency(item.amount)}</td
										>
										<td class="px-3 py-2 pt-2 text-center">
											<button
												type="button"
												onclick={() => removeLineItem(item.id)}
												class="rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700"
												aria-label={$t('Delete Item')}
												title={$t('Delete Item')}
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-5 w-5"
													viewBox="0 0 20 20"
													fill="currentColor"
												>
													<path
														fill-rule="evenodd"
														d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
														clip-rule="evenodd"
													/>
												</svg>
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<button
						type="button"
						onclick={addLineItem}
						class="mt-3 flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-100"
					>
						{$t('Add Item')}
					</button>
				</div>

				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					<div>
						<label for="notes" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Notes')}</label
						>
						<textarea
							id="notes"
							name="notes"
							bind:value={notes}
							rows="4"
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
						></textarea>
						<label for="attachments_modal" class="mt-4 mb-1 block text-sm font-medium text-gray-700"
							>{$t('Attachments')}</label
						>
						<input
							type="file"
							id="attachments_modal"
							name="attachments"
							multiple
							bind:files={attachments}
							class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:font-medium file:text-gray-700 hover:file:bg-gray-200"
						/>
					</div>

					<div class="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-5">
						<div class="flex justify-between text-sm">
							<span class="font-medium text-gray-600">{$t('Subtotal:')}</span>
							<span class="font-medium">{formatCurrency(subTotal)}</span>
						</div>
						<div class="flex items-center justify-between gap-2 text-sm">
							<label for="discount_amount" class="text-gray-600">{$t('Discount:')}</label>
							<div class="flex items-center gap-2">
								<input
									id="discount_amount"
									type="number"
									bind:value={discountAmount}
									min="0"
									step="0.01"
									class="w-24 rounded-md border-gray-300 py-1 text-right text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
								<span class="w-20 text-right font-medium text-red-600"
									>-{formatCurrency(discountAmount)}</span
								>
							</div>
						</div>
						<div class="flex justify-between border-t border-dashed border-gray-300 pt-2 text-sm">
							<span class="font-medium text-gray-600">{$t('After Discount:')}</span>
							<span class="font-medium">{formatCurrency(totalAfterDiscount)}</span>
						</div>
						<div class="flex items-center justify-between gap-2 text-sm">
							<div class="flex items-center gap-2 text-gray-600">
								<span>VAT:</span>
								<select
									bind:value={vatRate}
									class="h-8 rounded-md border-gray-300 py-0 pr-8 pl-2 text-sm focus:border-blue-500 focus:ring-blue-500"
								>
									<option value={0}>0%</option>
									<option value={7}>7%</option>
								</select>
							</div>
							<span class="font-medium text-gray-800">+{formatCurrency(vatAmount)}</span>
						</div>
						<div class="flex items-center justify-between text-sm">
							<span class="font-medium text-gray-600">{$t('Total WHT:')}</span>
							<span class="font-medium text-red-600">-{formatCurrency(totalWhtAmount)}</span>
						</div>
						<div class="mt-2 flex items-center justify-between border-t-2 border-gray-300 pt-3">
							<span class="text-base font-bold text-gray-800">{$t('Grand Total:')}</span>
							<span class="text-2xl font-black text-blue-700">{formatCurrency(grandTotal)}</span>
						</div>
					</div>
				</div>

				{#if form?.message && !form.success}
					<div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-600">
						<strong>Error:</strong>
						{form.message}
					</div>
				{/if}

				<div class="flex justify-end gap-3 border-t border-gray-200 pt-6">
					<a
						href="/billing-notes"
						class="rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-gray-200 focus:outline-none"
					>
						{$t('Cancel')}
					</a>
					<button
						type="submit"
						disabled={isSaving || items.length === 0}
						class="rounded-lg bg-blue-600 px-8 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
					>
						{#if isSaving}{$t('Saving...')}{:else}{$t('Save Billing Note')}{/if}
					</button>
				</div>
			</div>
		</form>
	</div>
</div>

<style>
	:global(div.svelte-select) {
		min-height: 38px;
		max-width: 100% !important;
		min-width: 0 !important;
		width: 100% !important;
	}

	:global(div.svelte-select .input) {
		padding: 2px 0;
		font-size: 0.875rem;
	}

	:global(div.svelte-select .selection) {
		font-size: 0.875rem;
		padding-top: 4px;
		text-overflow: ellipsis !important;
		overflow: hidden !important;
		white-space: nowrap !important;
		display: block !important;
		position: absolute;
		left: 10px;
		right: 30px;
	}

	:global(div.svelte-select .list) {
		border-radius: 0.375rem;
		border-color: #d1d5db;
		z-index: 9999 !important;
		top: 100% !important;
		bottom: auto !important;
		max-height: 200px;
		overflow-y: auto;
	}

	:global(div.svelte-select .item) {
		font-size: 0.875rem;
		text-overflow: ellipsis !important;
		overflow: hidden !important;
		white-space: nowrap !important;
	}
	:global(div.svelte-select .item.isActive) {
		background: #e0f2fe;
		color: #0c4a6e;
	}
	:global(.selectContainer) {
		overflow: visible !important;
	}
</style>
