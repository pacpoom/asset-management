<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { t } from '$lib/i18n';
	import type { PageData, ActionData } from './$types';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	const app = $derived(data.application);

	let showAddTxModal = $state(false);
	let isSubmitting = $state(false);
	let txType = $state<'expense' | 'refund'>('expense');
	let selectedJobId = $state('');
	let selectedCustomer = $state('');
	let jobSearch = $state('');
	let showJobDropdown = $state(false);
	let jobInputRef = $state<HTMLInputElement | null>(null);
	let invoicePreview = $state<string | null>(null);
	let slipPreview = $state<string | null>(null);
	let deleteTxTarget = $state<number | null>(null);

	$effect(() => {
		if (form) {
			if ((form as any).success) {
				toast.success((form as any).message || 'สำเร็จ');
				showAddTxModal = false;
				deleteTxTarget = null;
				invoicePreview = null;
				slipPreview = null;
				selectedJobId = '';
				selectedCustomer = '';
				jobSearch = '';
				showJobDropdown = false;
			} else if ((form as any).message) {
				toast.error((form as any).message);
			}
			isSubmitting = false;
		}
	});

	const filteredJobs = $derived(
		jobSearch.trim() === ''
			? data.jobOrders
			: data.jobOrders.filter((j: any) =>
					`${j.job_number} ${j.customer_name ?? ''}`.toLowerCase().includes(jobSearch.toLowerCase())
			  )
	);

	function selectJob(job: any) {
		selectedJobId = String(job.id);
		selectedCustomer = job.customer_name || '';
		jobSearch = `${job.job_number}${job.customer_name ? ` (${job.customer_name})` : ''}`;
		showJobDropdown = false;
	}

	function clearJob() {
		selectedJobId = '';
		selectedCustomer = '';
		jobSearch = '';
		showJobDropdown = false;
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
		return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function statusColor(s: string) {
		switch (s) {
			case 'Approved': return 'bg-green-100 text-green-800';
			case 'Rejected': return 'bg-red-100 text-red-800';
			case 'Completed': return 'bg-blue-100 text-blue-800';
			default: return 'bg-yellow-100 text-yellow-800';
		}
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
	const qrUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/advance-expense/apply/${app?.id}`;
	const printUrl = `/advance-expense/${app?.id}/print`;
</script>

<svelte:head>
	<title>{app?.document_number} | Advance Expense</title>
</svelte:head>

<div class="space-y-6">
	<!-- Breadcrumb -->
	<div class="flex items-center gap-2 text-sm text-gray-500">
		<a href="/advance-expense" class="hover:text-blue-600">{$t('adv.back_to_list')}</a>
		<span>/</span>
		<span class="font-medium text-gray-800">{app?.document_number}</span>
	</div>

	<!-- Document Header Card -->
	<div class="rounded-2xl border border-gray-200 bg-white shadow-sm">
		<div class="flex flex-col gap-4 border-b px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<div class="flex items-center gap-3">
					<h1 class="text-xl font-bold text-gray-900">{app?.document_number}</h1>
					<span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold {statusColor(app?.status)}">
						{statusLabel(app?.status)}
					</span>
				</div>
				<p class="mt-1 text-lg text-gray-700">{app?.application_title}</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<a href="/advance-expense"
					class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
					<span class="material-symbols-outlined text-base">arrow_back</span>
					{$t('adv.back_to_list')}
				</a>
				<a href={printUrl} target="_blank"
					class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
					<span class="material-symbols-outlined text-base">print</span>
					{$t('adv.print_doc')}
				</a>
				<button onclick={() => (showAddTxModal = true)}
					class="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-sm">
					<span class="material-symbols-outlined text-base">add</span>
					{$t('adv.add_transaction')}
				</button>
			</div>
		</div>

		<div class="grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
			<div>
				<p class="text-xs text-gray-500">{$t('adv.document_date')}</p>
				<p class="font-medium text-gray-900">{formatDate(app?.document_date)}</p>
			</div>
			<div>
				<p class="text-xs text-gray-500">{$t('adv.bank_label')}</p>
				<p class="font-medium text-gray-900">{app?.bank_name || '-'}</p>
			</div>
			<div>
				<p class="text-xs text-gray-500">{$t('adv.creator_label')}</p>
				<p class="font-medium text-gray-900">{app?.creator_name || '-'}</p>
			</div>
			<div>
				<p class="text-xs text-gray-500">{$t('adv.reason_label')}</p>
				<p class="text-sm text-gray-700">{app?.reason}</p>
			</div>
		</div>

		{#if app?.remark}
			<div class="border-t px-6 py-3">
				<p class="text-xs text-gray-500">{$t('adv.remark')}</p>
				<p class="text-sm text-gray-700">{app.remark}</p>
			</div>
		{/if}
	</div>

	<!-- Balance Summary -->
	<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
		<div class="rounded-xl border border-blue-200 bg-blue-50 p-4">
			<p class="text-xs font-medium text-blue-600">{$t('adv.balance_advance')}</p>
			<p class="mt-1 text-xl font-bold text-blue-800">{formatCurrency(app?.amount)} ฿</p>
		</div>
		<div class="rounded-xl border border-orange-200 bg-orange-50 p-4">
			<p class="text-xs font-medium text-orange-600">{$t('adv.balance_used')}</p>
			<p class="mt-1 text-xl font-bold text-orange-800">{formatCurrency(data.totalSpent)} ฿</p>
		</div>
		<div class="rounded-xl border border-purple-200 bg-purple-50 p-4">
			<p class="text-xs font-medium text-purple-600">{$t('adv.balance_refund')}</p>
			<p class="mt-1 text-xl font-bold text-purple-800">{formatCurrency(data.totalRefund)} ฿</p>
		</div>
		<div class="rounded-xl border {data.currentBalance < 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'} p-4">
			<p class="text-xs font-medium {data.currentBalance < 0 ? 'text-red-600' : 'text-green-600'}">{$t('adv.balance_remaining')}</p>
			<p class="mt-1 text-xl font-bold {data.currentBalance < 0 ? 'text-red-800' : 'text-green-800'}">{formatCurrency(data.currentBalance)} ฿</p>
		</div>
	</div>

	<!-- QR Code Section -->
	<div class="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<img
			src="https://quickchart.io/qr?text={encodeURIComponent(qrUrl)}&size=100&margin=1"
			alt="QR Code"
			class="h-24 w-24 flex-shrink-0 rounded-lg border border-gray-200 p-1"
		/>
		<div class="min-w-0">
			<p class="text-sm font-semibold text-gray-800">{$t('adv.qr_title')}</p>
			<p class="mt-0.5 break-all text-xs text-gray-500">{qrUrl}</p>
			<p class="mt-1 text-xs text-gray-400">{$t('adv.qr_desc')}</p>
		</div>
	</div>

	<!-- Transactions Table -->
	<div>
		<h2 class="mb-3 text-base font-semibold text-gray-800">{$t('adv.transactions_title')}</h2>
		<div class="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('adv.tx_date')}</th>
						<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('adv.tx_job_order')}</th>
						<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('adv.tx_customer')}</th>
						<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('adv.tx_description')}</th>
						<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('adv.tx_type')}</th>
						<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('adv.tx_amount')}</th>
						<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('adv.tx_running_balance')}</th>
						<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('adv.tx_documents')}</th>
						<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('adv.actions')}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100">
					{#each data.transactions as tx}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-3 text-gray-600">{formatDate(tx.transaction_date)}</td>
							<td class="px-4 py-3 font-mono text-xs text-blue-700">{tx.job_number || '-'}</td>
							<td class="px-4 py-3 text-gray-700">{tx.customer_name || '-'}</td>
							<td class="px-4 py-3 text-gray-700">{tx.description || '-'}</td>
							<td class="px-4 py-3 text-center">
								{#if tx.type === 'expense'}
									<span class="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">{$t('adv.tx_expense')}</span>
								{:else}
									<span class="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">{$t('adv.tx_refund')}</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-right font-mono {tx.type === 'refund' ? 'text-purple-700' : 'text-orange-700'}">
								{tx.type === 'refund' ? '+' : '-'}{formatCurrency(tx.amount)}
							</td>
							<td class="px-4 py-3 text-right font-mono font-semibold {tx.running_balance < 0 ? 'text-red-600' : 'text-green-700'}">
								{formatCurrency(tx.running_balance)}
							</td>
							<td class="px-4 py-3">
								<div class="flex items-center justify-center gap-1">
									{#if tx.invoice_image}
										<a href={tx.invoice_image} target="_blank" class="text-blue-500 hover:text-blue-700" title="Invoice">
											<span class="material-symbols-outlined text-base">receipt</span>
										</a>
									{/if}
									{#if tx.slip_image}
										<a href={tx.slip_image} target="_blank" class="text-green-500 hover:text-green-700" title="Slip">
											<span class="material-symbols-outlined text-base">payments</span>
										</a>
									{/if}
									{#if !tx.invoice_image && !tx.slip_image}
										<span class="text-xs text-gray-400">-</span>
									{/if}
								</div>
							</td>
							<td class="px-4 py-3 text-center">
								<button
									type="button"
									onclick={() => (deleteTxTarget = tx.id)}
									class="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
									title={$t('adv.delete')}
								>
									<span class="material-symbols-outlined text-base">delete</span>
								</button>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="9" class="px-4 py-10 text-center text-gray-400">
								<span class="material-symbols-outlined mb-1 block text-3xl">account_balance_wallet</span>
								{$t('adv.no_transactions')}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- Add Transaction Modal -->
{#if showAddTxModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="w-full max-w-lg rounded-2xl bg-white shadow-2xl max-h-[90vh] flex flex-col">
			<div class="flex items-center justify-between border-b px-5 py-3 flex-shrink-0">
				<h2 class="text-base font-bold text-gray-900">{$t('adv.add_tx_title')}</h2>
				<button onclick={() => (showAddTxModal = false)} class="rounded-lg p-1 hover:bg-gray-100">
					<span class="material-symbols-outlined text-xl">close</span>
				</button>
			</div>
			<form
				method="POST"
				action="?/addTransaction"
				enctype="multipart/form-data"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update }) => { await update(); };
				}}
				class="space-y-3 p-5 overflow-y-auto"
			>
				<!-- Type + Date row -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="mb-1 block text-xs font-medium text-gray-700">{$t('adv.tx_type_label')}</label>
						<div class="flex gap-3 pt-1">
							<label class="flex cursor-pointer items-center gap-1.5">
								<input type="radio" name="type" value="expense" checked={txType === 'expense'}
									onchange={() => (txType = 'expense')} class="text-blue-600" />
								<span class="text-sm">{$t('adv.tx_expense_label')}</span>
							</label>
							<label class="flex cursor-pointer items-center gap-1.5">
								<input type="radio" name="type" value="refund" checked={txType === 'refund'}
									onchange={() => (txType = 'refund')} class="text-blue-600" />
								<span class="text-sm">{$t('adv.tx_refund_label')}</span>
							</label>
						</div>
					</div>
					<div>
						<label class="mb-1 block text-xs font-medium text-gray-700">{$t('adv.document_date')} <span class="text-red-500">*</span></label>
						<input type="date" name="transaction_date" value={todayStr} required
							class="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
					</div>
				</div>

				<!-- Job Order — Searchable Combobox -->
				<div class="relative">
					<label class="mb-1 block text-xs font-medium text-gray-700">{$t('adv.job_order_label')}</label>

					<!-- hidden input สำหรับ form submit -->
					<input type="hidden" name="job_order_id" value={selectedJobId} />

					<div class="relative flex items-center">
						<input
							bind:this={jobInputRef}
							type="text"
							autocomplete="off"
							placeholder={$t('adv.no_job_order')}
							bind:value={jobSearch}
							onfocus={() => (showJobDropdown = true)}
							onblur={() => setTimeout(() => (showJobDropdown = false), 150)}
							oninput={() => { showJobDropdown = true; if (jobSearch === '') clearJob(); }}
							class="w-full rounded-lg border border-gray-300 px-3 py-1.5 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
						<!-- clear button -->
						{#if selectedJobId || jobSearch}
							<button
								type="button"
								onclick={clearJob}
								class="absolute right-2 text-gray-400 hover:text-gray-600"
								tabindex="-1"
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
								</svg>
							</button>
						{/if}
					</div>

					<!-- dropdown list -->
					{#if showJobDropdown}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
							onmousedown={(e) => e.preventDefault()}
						>
							{#if filteredJobs.length === 0}
								<div class="px-3 py-2 text-sm text-gray-400">ไม่พบรายการ</div>
							{:else}
								{#each filteredJobs as job}
									<button
										type="button"
										onclick={() => selectJob(job)}
										class="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 {String(job.id) === selectedJobId ? 'bg-blue-100 font-semibold text-blue-700' : 'text-gray-800'}"
									>
										<span class="font-medium">{job.job_number}</span>
										{#if job.customer_name}
											<span class="ml-1 text-gray-500">({job.customer_name})</span>
										{/if}
									</button>
								{/each}
							{/if}
						</div>
					{/if}
				</div>

				<!-- Customer (auto-fill) -->
				{#if selectedCustomer}
					<div class="rounded-lg bg-blue-50 px-3 py-1.5">
						<p class="text-xs text-blue-500">{$t('adv.customer_auto')}</p>
						<p class="text-sm font-medium text-blue-800">{selectedCustomer}</p>
					</div>
				{/if}

				<!-- Description + Amount row -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="mb-1 block text-xs font-medium text-gray-700">{$t('adv.description_label')}</label>
						<input type="text" name="description" placeholder={$t('adv.description_placeholder')}
							class="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
					</div>
					<div>
						<label class="mb-1 block text-xs font-medium text-gray-700">{$t('adv.amount_thb')} <span class="text-red-500">*</span></label>
						<input type="number" name="amount" min="0.01" step="0.01" placeholder="0.00" required
							class="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
					</div>
				</div>

				<!-- Invoice + Slip row -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="mb-1 block text-xs font-medium text-gray-700">{$t('adv.invoice_image')}</label>
						<input type="file" name="invoice_image" accept="image/*" capture="environment"
							onchange={(e) => onImageChange(e, 'invoice')}
							class="w-full rounded-lg border border-gray-300 px-2 py-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-blue-50 file:px-2 file:py-0.5 file:text-xs file:text-blue-700" />
						{#if invoicePreview}
							<img src={invoicePreview} alt="Invoice preview" class="mt-1 max-h-20 rounded-lg border object-contain" />
						{/if}
					</div>
					<div>
						<label class="mb-1 block text-xs font-medium text-gray-700">{$t('adv.slip_image')}</label>
						<input type="file" name="slip_image" accept="image/*" capture="environment"
							onchange={(e) => onImageChange(e, 'slip')}
							class="w-full rounded-lg border border-gray-300 px-2 py-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-green-50 file:px-2 file:py-0.5 file:text-xs file:text-green-700" />
						{#if slipPreview}
							<img src={slipPreview} alt="Slip preview" class="mt-1 max-h-20 rounded-lg border object-contain" />
						{/if}
					</div>
				</div>

				<!-- Remark -->
				<div>
					<label for="tx-remark" class="mb-1 block text-xs font-medium text-gray-700">{$t('adv.remark')}</label>
					<textarea id="tx-remark" name="remark" rows="1"
						class="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"></textarea>
				</div>

				<div class="flex justify-end gap-3 pt-1">
					<button type="button" onclick={() => (showAddTxModal = false)}
						class="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{$t('adv.cancel')}</button>
					<button type="submit" disabled={isSubmitting}
						class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
						{#if isSubmitting}
							<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
						{/if}
						{isSubmitting ? $t('adv.saving') : $t('adv.save')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Transaction Confirm -->
{#if deleteTxTarget !== null}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
			<div class="mb-4 flex items-center gap-3 text-red-600">
				<span class="material-symbols-outlined text-3xl">warning</span>
				<h2 class="text-lg font-bold">{$t('adv.confirm_delete_title')}</h2>
			</div>
			<p class="mb-6 text-sm text-gray-600">{$t('adv.confirm_delete_tx')}</p>
			<div class="flex justify-end gap-3">
				<button onclick={() => (deleteTxTarget = null)}
					class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">{$t('adv.cancel')}</button>
				<form method="POST" action="?/deleteTransaction" use:enhance={() => {
					return async ({ update }) => { await update(); };
				}}>
					<input type="hidden" name="id" value={deleteTxTarget} />
					<button type="submit" class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">{$t('adv.delete')}</button>
				</form>
			</div>
		</div>
	</div>
{/if}
