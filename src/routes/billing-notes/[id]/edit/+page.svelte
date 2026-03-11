<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import type { ActionData, PageData } from './$types';
	import { t, locale } from '$lib/i18n';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	export interface BillingNoteItem {
		id: string;
		product_object: any | null;
		product_id: number | null;
		description: string;
		quantity: number;
		unit_id: number | null;
		unit_price: number;
		wht_rate: number;
		amount: number;
	}

	let isSaving = $state(false);

	let selectedCustomer = $state(
		data.customers.find((c: any) => c.id === data.billingNote.customer_id)
			? {
					value: data.billingNote.customer_id,
					label: data.customers.find((c: any) => c.id === data.billingNote.customer_id).company_name
						? `${data.customers.find((c: any) => c.id === data.billingNote.customer_id).company_name} (${data.customers.find((c: any) => c.id === data.billingNote.customer_id).name})`
						: data.customers.find((c: any) => c.id === data.billingNote.customer_id).name
				}
			: null
	);
	let billing_date = $state(
		data.billingNote.billing_date
			? new Date(data.billingNote.billing_date).toISOString().split('T')[0]
			: ''
	);
	let due_date = $state(
		data.billingNote.due_date ? new Date(data.billingNote.due_date).toISOString().split('T')[0] : ''
	);
	let notes = $state(data.billingNote.notes || '');

	let items = $state<BillingNoteItem[]>(
		data.billingNoteItems.map((item: any) => ({
			id: crypto.randomUUID(),
			product_id: item.product_id,
			product_object: item.product_id
				? {
						value: item.product_id,
						label:
							data.products.find((p: any) => p.id === item.product_id)?.name || item.description,
						product: data.products.find((p: any) => p.id === item.product_id)
					}
				: null,
			description: item.description || '',
			quantity: Number(item.quantity) || 0,
			unit_id: item.unit_id,
			unit_price: Number(item.unit_price) || 0,
			wht_rate: Number(item.wht_rate) || 0,
			amount: Number(item.amount) || 0
		}))
	);

	let discountAmount = $state(Number(data.billingNote.discount_amount) || 0);
	let vatRate = $state(Number(data.billingNote.vat_rate) || 7);

	const subTotal = $derived(items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
	const totalAfterDiscount = $derived(Math.max(0, subTotal - (discountAmount || 0)));
	const vatAmount = $derived(vatRate > 0 ? (totalAfterDiscount * vatRate) / 100 : 0);
	const totalWhtAmount = $derived(
		items.reduce(
			(sum, item) => sum + ((Number(item.amount) || 0) * (Number(item.wht_rate) || 0)) / 100,
			0
		)
	);
	const grandTotal = $derived(totalAfterDiscount + vatAmount - totalWhtAmount);

	const customerOptions = $derived(
		(data.customers || []).map((c: any) => ({
			value: c.id,
			label: c.company_name ? `${c.company_name} (${c.name})` : c.name
		}))
	);
	const productOptions = $derived(
		(data.products || []).map((p: any) => ({ value: p.id, label: p.name, product: p }))
	);

	const formatCurrency = (val: number) => {
		return new Intl.NumberFormat($locale === 'th' ? 'th-TH' : 'en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(val || 0);
	};

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
			item.wht_rate = 0;
		}
		updateLineTotal(item);
	}

	function updateLineTotal(item: BillingNoteItem) {
		item.amount = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
		items = [...items];
	}
</script>

<svelte:head>
	<title>{$t('Edit Billing Note: ')} {data.billingNote.billing_note_number}</title>
</svelte:head>

<div class="mx-auto max-w-7xl p-4 md:p-6">
	<h1 class="mb-6 text-2xl font-bold text-gray-800">
		{$t('Edit Billing Note: ')}
		{data.billingNote.billing_note_number}
	</h1>

	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		<form
			method="POST"
			action="?/update"
			use:enhance={({ formData }) => {
				isSaving = true;
				formData.set('itemsJson', JSON.stringify(items));
				formData.set('subtotal', subTotal.toString());
				formData.set('discount_amount', discountAmount.toString());
				formData.set('vat_rate', vatRate.toString());
				formData.set('vat_amount', vatAmount.toString());
				formData.set('withholding_tax_amount', totalWhtAmount.toString());
				formData.set('total_amount', grandTotal.toString());
				return async ({ update, result }) => {
					isSaving = false;
					if (result.type === 'success' || result.type === 'redirect') {
						goto('/billing-notes');
					}
				};
			}}
		>
			<div class="relative z-50 mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
				<div class="md:col-span-2">
					<label for="customer_select" class="mb-1 block text-sm font-medium text-gray-700">
						{$t('Customer')} <span class="text-red-500">*</span>
					</label>
					<Select
						items={customerOptions}
						bind:value={selectedCustomer}
						placeholder={$t('Select Customer')}
						container={browser ? document.body : null}
					/>
					<input type="hidden" name="customer_id" value={selectedCustomer?.value ?? ''} />
				</div>
				<div>
					<label for="billing_date" class="mb-1 block text-sm font-medium text-gray-700"
						>{$t('Billing Date')}</label
					>
					<input
						type="date"
						name="billing_date"
						bind:value={billing_date}
						required
						class="w-full rounded-md border-gray-300"
					/>
				</div>
				<div>
					<label for="due_date" class="mb-1 block text-sm font-medium text-gray-700"
						>{$t('Due Date')}</label
					>
					<input
						type="date"
						name="due_date"
						bind:value={due_date}
						class="w-full rounded-md border-gray-300"
					/>
				</div>
			</div>

			<div class="relative z-10 overflow-x-auto rounded border border-gray-200">
				<table class="min-w-full table-fixed divide-y divide-gray-200 text-sm">
					<thead class="bg-gray-50">
						<tr>
							<th class="w-10 px-3 py-3 text-gray-500">{$t('No.')}</th>
							<th class="w-[200px] max-w-[200px] px-3 py-3 text-left">{$t('Product/Service')}</th>
							<th class="w-[180px] max-w-[180px] px-3 py-3 text-left">{$t('Description')}</th>
							<th class="w-20 px-2 py-3 text-center">{$t('Quantity')}</th>
							<th class="w-20 px-2 py-3 text-center">{$t('Unit')}</th>
							<th class="w-28 px-2 py-3 text-center">{$t('Unit Price')}</th>
							<th class="w-20 px-2 py-3 text-center text-red-600">WHT</th>
							<th class="w-32 px-3 py-3 text-right">{$t('Total')}</th>
							<th class="w-10 px-3 py-3"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each items as item, index (item.id)}
							<tr class="align-top hover:bg-gray-50">
								<td class="px-3 py-2 pt-3 text-center">{index + 1}</td>
								<td class="w-[200px] max-w-[200px] px-2 py-2">
									<div class="w-full overflow-hidden">
										<Select
											items={productOptions}
											bind:value={item.product_object}
											on:change={() => onProductChange(item)}
											container={browser ? document.body : null}
											floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
											placeholder={$t('-- Search/Select Product --')}
										/>
									</div>
								</td>
								<td class="w-[180px] max-w-[180px] px-2 py-2">
									<input
										type="text"
										bind:value={item.description}
										class="w-full truncate rounded-md border-gray-300 py-1.5"
									/>
								</td>
								<td class="px-2 py-2"
									><input
										type="number"
										bind:value={item.quantity}
										oninput={() => updateLineTotal(item)}
										class="w-full rounded-md border-gray-300 py-1.5 text-center"
									/></td
								>
								<td class="px-2 py-2">
									<select
										bind:value={item.unit_id}
										class="w-full rounded-md border-gray-300 py-1.5 text-sm"
									>
										<option value={null}>-</option>
										{#each data.units || [] as u}
											<option value={u.id}>{u.symbol || u.name}</option>
										{/each}
									</select>
								</td>
								<td class="px-2 py-2"
									><input
										type="number"
										bind:value={item.unit_price}
										oninput={() => updateLineTotal(item)}
										step="0.01"
										class="w-full rounded-md border-gray-300 py-1.5 text-right"
									/></td
								>
								<td class="px-2 py-2">
									<select
										bind:value={item.wht_rate}
										class="w-full rounded-md border-red-200 bg-red-50 py-1.5 text-center text-sm font-bold text-red-700"
									>
										<option value={0}>0%</option><option value={1}>1%</option><option value={2}
											>2%</option
										><option value={3}>3%</option><option value={5}>5%</option>
									</select>
								</td>
								<td class="px-3 py-2 pt-3 text-right font-medium">{formatCurrency(item.amount)}</td>
								<td class="px-3 py-2 pt-2 text-center"
									><button
										type="button"
										onclick={() => removeLineItem(item.id)}
										class="text-red-500">✕</button
									></td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<button
				type="button"
				onclick={addLineItem}
				class="mt-2 mb-8 text-sm font-medium text-blue-600">{$t('Add Item')}</button
			>

			<div class="grid grid-cols-1 gap-6 border-t pt-6 md:grid-cols-2">
				<div>
					<label for="notes" class="mb-1 block text-sm font-medium text-gray-700"
						>{$t('Notes')}</label
					>
					<textarea
						bind:value={notes}
						name="notes"
						rows="4"
						class="w-full rounded-md border-gray-300"
					></textarea>
				</div>
				<div class="space-y-3 rounded-lg border bg-gray-50 p-5">
					<div class="flex justify-between">
						<span>{$t('Subtotal')}:</span><span>{formatCurrency(subTotal)}</span>
					</div>
					<div class="flex items-center justify-between">
						<span>{$t('Discount')}:</span>
						<input
							type="number"
							bind:value={discountAmount}
							class="w-24 rounded border-gray-300 py-1 text-right"
						/>
					</div>
					<div class="flex items-center justify-between">
						<span>VAT:</span><select bind:value={vatRate} class="h-8 rounded border-gray-300 py-0"
							><option value={0}>0%</option><option value={7}>7%</option></select
						>
					</div>
					<div class="flex justify-between font-bold text-red-600">
						<span>{$t('Total WHT')}:</span><span>-{formatCurrency(totalWhtAmount)}</span>
					</div>
					<div
						class="mt-2 flex items-center justify-between border-t-2 pt-3 text-xl font-black text-blue-700"
					>
						<span>{$t('Grand Total')}:</span><span>{formatCurrency(grandTotal)}</span>
					</div>
				</div>
			</div>

			<div class="mt-8 flex justify-end gap-3 border-t pt-6">
				<a
					href="/billing-notes"
					class="rounded-lg border px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
					>{$t('Cancel')}</a
				>
				<button
					type="submit"
					disabled={isSaving}
					class="rounded-lg bg-blue-600 px-8 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-50"
				>
					{isSaving ? $t('Saving...') : $t('Save Changes')}
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	:global(div.svelte-select) {
		min-height: 38px;
		max-width: 100% !important;
		width: 100% !important;
		z-index: 50 !important;
	}
	:global(div.svelte-select .selection) {
		text-overflow: ellipsis !important;
		overflow: hidden !important;
		white-space: nowrap !important;
		display: block !important;
		position: absolute;
		left: 10px;
		right: 30px;
	}
	:global(div.svelte-select .list) {
		z-index: 9999 !important;
	}
</style>
