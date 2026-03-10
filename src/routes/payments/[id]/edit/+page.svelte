<script lang="ts">
	import { enhance } from '$app/forms';
	import { t, locale } from '$lib/i18n';
	export let data;
	let { voucher } = data;

	let isSaving = false;

	let subtotal = Number(voucher.subtotal || 0);
	let vatRate = Number(voucher.vat_rate || 0);
	let whtRate = Number(voucher.wht_rate || 0);

	$: vatAmount = subtotal * (vatRate / 100);
	$: whtAmount = subtotal * (whtRate / 100);
	$: totalAmount = subtotal + vatAmount - whtAmount;

	$: formatCurrency = (amount: number) => {
		return new Intl.NumberFormat($locale === 'th' ? 'th-TH' : 'en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	};
</script>

<svelte:head>
	<title>{$t('Edit: ')} {voucher.voucher_number}</title>
</svelte:head>

<div class="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-800">{$t('Edit: ')} {voucher.voucher_number}</h1>
		<span
			class="rounded-full px-3 py-1 text-sm font-bold {voucher.voucher_type === 'RV'
				? 'bg-green-100 text-green-800'
				: 'bg-red-100 text-red-800'}"
		>
			{voucher.voucher_type === 'RV' ? $t('Receipt Voucher (RV)') : $t('Payment Voucher (PV)')}
		</span>
	</div>

	<form
		method="POST"
		action="?/update"
		use:enhance={() => {
			isSaving = true;
			return async ({ update }) => {
				await update();
				isSaving = false;
			};
		}}
	>
		<div class="mb-4 grid grid-cols-2 gap-4">
			<div>
				<label for="date" class="mb-1 block text-sm font-medium text-gray-700">{$t('Date')}</label>
				<input
					id="date"
					type="date"
					name="voucher_date"
					value={new Date(voucher.voucher_date).toISOString().split('T')[0]}
					class="w-full rounded-md border-gray-300"
					required
				/>
			</div>
			<div>
				<label for="contact" class="mb-1 block text-sm font-medium text-gray-700">
					{voucher.voucher_type === 'RV' ? $t('Received From (Payer)') : $t('Paid To (Payee)')}
				</label>
				<input
					id="contact"
					type="text"
					name="contact_name"
					value={voucher.contact_name}
					class="w-full rounded-md border-gray-300"
					required
				/>
			</div>
		</div>

		<div class="mb-4">
			<label for="desc" class="mb-1 block text-sm font-medium text-gray-700"
				>{$t('Description')}</label
			>
			<textarea id="desc" name="description" rows="3" class="w-full rounded-md border-gray-300"
				>{voucher.description || ''}</textarea
			>
		</div>

		<div class="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
			<div class="mb-3">
				<label for="subtotal" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Subtotal Amount')}</label
				>
				<input
					id="subtotal"
					type="number"
					step="0.01"
					name="subtotal"
					bind:value={subtotal}
					class="w-full rounded-md border-gray-300 text-right font-medium"
					placeholder="0.00"
				/>
			</div>

			<div class="mb-3 grid grid-cols-2 gap-4">
				<div>
					<label for="vat_rate" class="mb-1 block text-sm font-medium text-gray-700">VAT (%)</label>
					<select
						id="vat_rate"
						name="vat_rate"
						bind:value={vatRate}
						class="w-full rounded-md border-gray-300"
					>
						<option value={0}>{$t('No VAT (0%)')}</option>
						<option value={7}>VAT 7%</option>
					</select>
				</div>
				<div>
					<label for="wht_rate" class="mb-1 block text-sm font-medium text-gray-700"
						>{$t('WHT Rate (%)')}</label
					>
					<input
						id="wht_rate"
						type="number"
						step="0.01"
						name="wht_rate"
						bind:value={whtRate}
						class="w-full rounded-md border-gray-300 text-right"
						placeholder="0"
					/>
				</div>
			</div>

			<input type="hidden" name="vat_amount" value={vatAmount.toFixed(2)} />
			<input type="hidden" name="wht_amount" value={whtAmount.toFixed(2)} />
			<input type="hidden" name="total_amount" value={totalAmount.toFixed(2)} />

			<div class="border-t border-gray-300 pt-3">
				<div class="mb-1 flex justify-between text-sm">
					<span>VAT ({vatRate}%)</span>
					<span>{formatCurrency(vatAmount)}</span>
				</div>
				<div class="mb-2 flex justify-between text-sm text-red-600">
					<span>{$t('WHT')} ({whtRate}%)</span>
					<span>- {formatCurrency(whtAmount)}</span>
				</div>
				<div class="flex items-center justify-between text-lg font-bold">
					<span
						>{$t('Net Total')} ({voucher.voucher_type === 'RV'
							? $t('Income')
							: $t('Expense')})</span
					>
					<span class="text-blue-600">{formatCurrency(totalAmount)}</span>
				</div>
			</div>
		</div>

		<div class="flex justify-end gap-2">
			<a
				href="/payments/{voucher.id}"
				class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
				>{$t('Cancel')}</a
			>
			<button
				type="submit"
				disabled={isSaving}
				class="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
			>
				{isSaving ? $t('Saving...') : $t('Save Changes')}
			</button>
		</div>
	</form>
</div>
