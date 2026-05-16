<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import type { PageData, ActionData } from './$types';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	const app = $derived(data.application);

	let isSubmitting = $state(false);
	let submitted = $state(false);
	let selectedCustomer = $state('');
	let invoicePreview = $state<string | null>(null);
	let slipPreview = $state<string | null>(null);
	let txType = $state<'expense' | 'refund'>('expense');

	$effect(() => {
		if (form) {
			if ((form as any).success) {
				submitted = true;
			}
			isSubmitting = false;
		}
	});

	function onJobChange(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		const job = data.jobOrders.find((j: any) => String(j.id) === val);
		selectedCustomer = job?.customer_name || '';
	}

	function onImageChange(e: Event, which: 'invoice' | 'slip') {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			if (which === 'invoice') invoicePreview = ev.target?.result as string;
			else slipPreview = ev.target?.result as string;
		};
		reader.readAsDataURL(file);
	}

	function formatCurrency(n: number) {
		return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	function formatDate(d: string) {
		if (!d) return '-';
		return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
	}

	function statusLabel(s: string) {
		switch (s) {
			case 'Approved': return $t('adv.status_approved');
			case 'Rejected': return $t('adv.status_rejected');
			case 'Completed': return $t('adv.status_completed');
			default: return $t('adv.status_pending');
		}
	}

	const todayStr = new Date().toISOString().split('T')[0];
	const balancePct = app ? Math.max(0, Math.min(100, (data.currentBalance / Number(app.amount)) * 100)) : 0;
</script>

<svelte:head>
	<title>{$t('adv.mobile_appbar')} | {app?.document_number}</title>
	<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
</svelte:head>

<!-- Full-page mobile layout — no sidebar (layout shows only children for non-logged-in users) -->
<div class="min-h-screen bg-gradient-to-b from-blue-50 to-gray-50">

	<!-- App Bar -->
	<div class="sticky top-0 z-10 bg-blue-600 px-4 py-3 shadow-md">
		<div class="flex items-center gap-3">
			<div class="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500">
				<svg class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/>
				</svg>
			</div>
			<div>
				<div class="text-xs font-medium text-blue-200">{$t('adv.mobile_appbar')}</div>
				<div class="text-sm font-bold text-white">{app?.document_number}</div>
			</div>
		</div>
	</div>

	{#if submitted}
		<!-- Success State -->
		<div class="flex min-h-[calc(100vh-60px)] flex-col items-center justify-center p-6 text-center">
			<div class="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
				<svg class="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
				</svg>
			</div>
			<h2 class="mb-2 text-xl font-bold text-gray-900">{$t('adv.success_title')}</h2>
			<p class="mb-6 text-gray-600">{(form as any)?.message || $t('adv.success_message')}</p>
			<button onclick={() => { submitted = false; invoicePreview = null; slipPreview = null; selectedCustomer = ''; }}
				class="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm active:bg-blue-700">
				{$t('adv.add_more')}
			</button>
		</div>
	{:else}
		<div class="p-4 space-y-4 pb-10">

			<!-- Document Info Card -->
			<div class="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
				<div class="flex items-start justify-between mb-2">
					<h1 class="text-base font-bold text-gray-900">{app?.application_title}</h1>
					<span class="ml-2 inline-flex rounded-full bg-{app?.status === 'Approved' ? 'green' : app?.status === 'Rejected' ? 'red' : 'yellow'}-100 px-2 py-0.5 text-xs font-semibold text-{app?.status === 'Approved' ? 'green' : app?.status === 'Rejected' ? 'red' : 'yellow'}-800 flex-shrink-0">
						{statusLabel(app?.status || 'Pending')}
					</span>
				</div>
				<p class="text-xs text-gray-500 mb-3">{formatDate(app?.document_date)} | {$t('adv.bank_label')}: {app?.bank_name || '-'}</p>
				<p class="text-xs text-gray-600 mb-3">{app?.reason}</p>

				<!-- Balance Bar -->
				<div class="mb-1 flex justify-between text-xs font-medium">
					<span class="text-gray-500">{$t('adv.balance_advance')}: <strong class="text-blue-700">{formatCurrency(app?.amount || 0)} ฿</strong></span>
					<span class="text-{data.currentBalance < 0 ? 'red' : 'green'}-600 font-bold">{$t('adv.balance_remaining')}: {formatCurrency(data.currentBalance)} ฿</span>
				</div>
				<div class="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
					<div
						class="h-2.5 rounded-full transition-all {data.currentBalance < 0 ? 'bg-red-500' : 'bg-green-500'}"
						style="width: {balancePct}%"
					></div>
				</div>
				<div class="mt-1 flex justify-between text-xs text-gray-400">
					<span>{$t('adv.balance_used')}: {formatCurrency(data.totalSpent)} ฿</span>
					<span>{balancePct.toFixed(0)}%</span>
				</div>
			</div>

			{#if app?.status === 'Rejected'}
				<div class="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
					{$t('adv.rejected_notice')}
				</div>
			{:else}

			<!-- Error message -->
			{#if form && !(form as any).success && (form as any).message}
				<div class="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
					{(form as any).message}
				</div>
			{/if}

			<!-- Form -->
			<form
				method="POST"
				action="?/submit"
				enctype="multipart/form-data"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update }) => { await update(); };
				}}
				class="space-y-4"
			>
				<!-- Type Toggle -->
				<div class="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
					<p class="mb-3 text-sm font-semibold text-gray-700">{$t('adv.tx_type_label')}</p>
					<div class="grid grid-cols-2 gap-2">
						<label class="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 p-3 transition-colors {txType === 'expense' ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}">
							<input type="radio" name="type" value="expense" class="sr-only" checked={txType === 'expense'} onchange={() => txType = 'expense'} />
							<svg class="h-4 w-4 {txType === 'expense' ? 'text-orange-600' : 'text-gray-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							<span class="text-sm font-medium {txType === 'expense' ? 'text-orange-700' : 'text-gray-600'}">{$t('adv.type_expense')}</span>
						</label>
						<label class="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 p-3 transition-colors {txType === 'refund' ? 'border-purple-400 bg-purple-50' : 'border-gray-200'}">
							<input type="radio" name="type" value="refund" class="sr-only" checked={txType === 'refund'} onchange={() => txType = 'refund'} />
							<svg class="h-4 w-4 {txType === 'refund' ? 'text-purple-600' : 'text-gray-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							<span class="text-sm font-medium {txType === 'refund' ? 'text-purple-700' : 'text-gray-600'}">{$t('adv.type_refund')}</span>
						</label>
					</div>
				</div>

				<!-- Basic Info -->
				<div class="rounded-2xl bg-white p-4 shadow-sm border border-gray-100 space-y-4">
					<p class="text-sm font-semibold text-gray-700">{$t('adv.basic_info')}</p>

					<div>
						<label class="mb-1 block text-xs font-medium text-gray-600">{$t('adv.document_date')} <span class="text-red-500">*</span></label>
						<input type="date" name="transaction_date" value={todayStr} required
							class="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
					</div>

					<!-- Job Order -->
					<div>
						<label class="mb-1 block text-xs font-medium text-gray-600">{$t('adv.job_order_label')}</label>
						<select name="job_order_id" onchange={onJobChange}
							class="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none">
							<option value="">{$t('adv.no_job_order')}</option>
							{#each data.jobOrders as job}
								<option value={job.id}>{job.job_number}{job.customer_name ? ` — ${job.customer_name}` : ''}</option>
							{/each}
						</select>
					</div>

					<!-- Customer (auto display) -->
					{#if selectedCustomer}
						<div class="rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5">
							<p class="text-xs text-blue-500">{$t('adv.customer_auto')}</p>
							<p class="font-semibold text-blue-800">{selectedCustomer}</p>
						</div>
					{/if}

					<div>
						<label class="mb-1 block text-xs font-medium text-gray-600">{$t('adv.description_label')}</label>
						<input type="text" name="description" placeholder={$t('adv.description_placeholder')}
							class="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
					</div>

					<div>
						<label class="mb-1 block text-xs font-medium text-gray-600">{$t('adv.amount_thb')} <span class="text-red-500">*</span></label>
						<div class="relative">
							<input type="number" name="amount" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" required
								class="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-4 pr-12 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
							<span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">฿</span>
						</div>
					</div>

					<div>
						<label class="mb-1 block text-xs font-medium text-gray-600">{$t('adv.remark')}</label>
						<textarea name="remark" rows="2" placeholder={$t('adv.remark_placeholder')}
							class="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"></textarea>
					</div>
				</div>

				<!-- Invoice Photo -->
				<div class="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
					<p class="mb-3 text-sm font-semibold text-gray-700">{$t('adv.invoice_image')}</p>
					<label class="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 p-4 text-center transition hover:border-blue-400 hover:bg-blue-100">
						{#if invoicePreview}
							<img src={invoicePreview} alt="Invoice" class="mb-2 max-h-48 rounded-lg object-contain" />
							<span class="text-xs text-blue-600">{$t('adv.tap_to_change')}</span>
						{:else}
							<svg class="mb-2 h-10 w-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
							</svg>
							<span class="text-sm font-medium text-blue-600">{$t('adv.take_invoice')}</span>
							<span class="text-xs text-gray-400 mt-1">{$t('adv.tap_camera')}</span>
						{/if}
						<input type="file" name="invoice_image" accept="image/*" class="sr-only"
							onchange={(e) => onImageChange(e, 'invoice')} />
					</label>
				</div>

				<!-- Slip Photo -->
				<div class="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
					<p class="mb-3 text-sm font-semibold text-gray-700">{$t('adv.slip_image')}</p>
					<label class="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-green-200 bg-green-50 p-4 text-center transition hover:border-green-400 hover:bg-green-100">
						{#if slipPreview}
							<img src={slipPreview} alt="Slip" class="mb-2 max-h-48 rounded-lg object-contain" />
							<span class="text-xs text-green-600">{$t('adv.tap_to_change')}</span>
						{:else}
							<svg class="mb-2 h-10 w-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/>
							</svg>
							<span class="text-sm font-medium text-green-600">{$t('adv.take_slip')}</span>
							<span class="text-xs text-gray-400 mt-1">{$t('adv.tap_camera')}</span>
						{/if}
						<input type="file" name="slip_image" accept="image/*" class="sr-only"
							onchange={(e) => onImageChange(e, 'slip')} />
					</label>
				</div>

				<!-- Submit Button -->
				<button
					type="submit"
					disabled={isSubmitting}
					class="w-full rounded-2xl bg-blue-600 py-4 text-base font-bold text-white shadow-lg transition active:bg-blue-700 disabled:opacity-60"
				>
					{#if isSubmitting}
						<div class="flex items-center justify-center gap-2">
							<div class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
							{$t('adv.submitting')}
						</div>
					{:else}
						{$t('adv.submit_btn')}
					{/if}
				</button>
			</form>
			{/if}
		</div>
	{/if}
</div>
