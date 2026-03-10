<script lang="ts">
	import { enhance } from '$app/forms';
	import { t, locale } from '$lib/i18n';

	let isSaving = false;
	let type = 'PV';

	let subtotal = 0;
	let vatRate = 0;
	let whtRate = 0;

	$: vatAmount = subtotal * (vatRate / 100);
	$: whtAmount = subtotal * (whtRate / 100);
	$: totalAmount = subtotal + vatAmount - whtAmount;

	$: currentLoc = $locale === 'th' ? 'th-TH' : $locale === 'zh' ? 'zh-CN' : 'en-US';
	$: formatNumber = (amount: number) =>
		amount.toLocaleString(currentLoc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
</script>

<svelte:head>
	<title>{$t('Create Voucher Title')}</title>
</svelte:head>

<div class="mx-auto max-w-7xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
	<h1 class="mb-6 text-2xl font-bold text-gray-800">{$t('Create Voucher Title')}</h1>

	<form
		method="POST"
		action="?/create"
		use:enhance={() => {
			isSaving = true;
			return async ({ update }) => {
				await update();
				isSaving = false;
			};
		}}
	>
		<div class="mb-6">
			<span class="mb-2 block text-sm font-medium text-gray-700">{$t('Document Type')}</span>
			<div class="flex gap-4">
				<label
					class="flex cursor-pointer items-center gap-2 rounded-lg border p-3 {type === 'RV'
						? 'border-green-500 bg-green-50'
						: ''}"
				>
					<input type="radio" name="voucher_type" value="RV" bind:group={type} />
					<span class="font-bold text-green-700">{$t('Receipt Voucher (RV)')}</span>
				</label>
				<label
					class="flex cursor-pointer items-center gap-2 rounded-lg border p-3 {type === 'PV'
						? 'border-red-500 bg-red-50'
						: ''}"
				>
					<input type="radio" name="voucher_type" value="PV" bind:group={type} />
					<span class="font-bold text-red-700">{$t('Payment Voucher (PV)')}</span>
				</label>
			</div>
		</div>

		<div class="mb-4 grid grid-cols-2 gap-4">
			<div>
				<label for="voucher_date" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Date')}</label
				>
				<input
					id="voucher_date"
					type="date"
					name="voucher_date"
					required
					class="w-full rounded-md border-gray-300"
					value={new Date().toISOString().split('T')[0]}
				/>
			</div>
			<div>
				<label for="contact_name" class="mb-1 block text-sm font-medium text-gray-700">
					{type === 'RV' ? $t('Received From (Payer)') : $t('Paid To (Payee)')}
				</label>
				<input
					id="contact_name"
					type="text"
					name="contact_name"
					required
					class="w-full rounded-md border-gray-300"
					placeholder={$t('Enter name...')}
				/>
			</div>
		</div>

		<div class="mb-4">
			<label for="description" class="mb-1 block text-sm font-medium text-gray-700"
				>{$t('Description')}</label
			>
			<textarea
				id="description"
				name="description"
				rows="3"
				class="w-full rounded-md border-gray-300"
				placeholder={$t('Description...')}
			></textarea>
		</div>

		<div class="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
			<div class="mb-3">
				<label for="subtotal" class="mb-1 block text-sm font-medium text-gray-700"
					>{$t('Amount (Subtotal)')}</label
				>
				<input
					id="subtotal"
					type="number"
					step="0.01"
					name="subtotal"
					bind:value={subtotal}
					class="w-full rounded-md border-gray-300 text-right"
					placeholder="0.00"
				/>
			</div>

			<div class="mb-3 grid grid-cols-2 gap-4">
				<div>
					<label for="vat_rate" class="mb-1 block text-sm font-medium text-gray-700"
						>{$t('VAT (%)')}</label
					>
					<select
						id="vat_rate"
						name="vat_rate"
						bind:value={vatRate}
						class="w-full rounded-md border-gray-300"
					>
						<option value={0}>{$t('No VAT (0%)')}</option>
						<option value={7}>{$t('VAT 7%')}</option>
					</select>
				</div>
				<div>
					<label for="wht_rate" class="mb-1 block text-sm font-medium text-gray-700"
						>{$t('Withholding Tax (%)')}</label
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
					<span>{formatNumber(vatAmount)}</span>
				</div>
				<div class="mb-2 flex justify-between text-sm text-red-600">
					<span>{$t('Withholding Tax (%)').replace(' (%)', '')} ({whtRate}%)</span>
					<span>- {formatNumber(whtAmount)}</span>
				</div>
				<div class="flex items-center justify-between text-lg font-bold">
					<span>{$t('Net Total')} ({type === 'RV' ? $t('Income') : $t('Expense')})</span>
					<span class="text-blue-600">{formatNumber(totalAmount)}</span>
				</div>
			</div>
		</div>

		<div class="flex justify-end gap-3">
			<a
				href="/payments"
				class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700"
				>{$t('Cancel')}</a
			>
			<button
				type="submit"
				disabled={isSaving}
				class="rounded-md bg-blue-600 px-6 py-2 text-sm text-white hover:bg-blue-700"
			>
				{isSaving ? $t('Saving...') : $t('Save Data')}
			</button>
		</div>
	</form>
</div>
