<!-- eslint-disable svelte/no-navigation-without-resolve -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import type { ActionData, PageData } from './$types';
	import { t, locale } from '$lib/i18n';

	interface Expense { id: number; total_amount: number; amount: number; price?: number; qty?: number; vat_amount?: number; wht_amount?: number; item_name?: string; category_name?: string; ref_document?: string; vendor_company_name?: string; vendor_name?: string; [key: string]: unknown }
	interface SalesDoc { id: number; total_amount: number; document_number: string; reference_doc?: string; document_type: string; document_date: string; status: string; [key: string]: unknown }
	interface Category { id: number; category_name: string; [key: string]: unknown }
	interface Item { id: number; item_name: string; expense_category_id: number; [key: string]: unknown }
    interface Vendor { id: number; name: string; company_name: string | null; [key: string]: unknown }
	interface SelectOption { value: string | number; label: string }

	let { data, form } = $props<{ data: PageData; form: ActionData }>();

	// ใช้ $derived เพื่อให้ข้อมูลอัปเดตตาม data จาก Server เสมอ
	let job = $derived(data.job);
	let attachments = $derived(data.attachments || []);
	
	let expenses = $derived((data.expenses || []) as Expense[]);
	let salesDocuments = $derived((data.salesDocuments || []) as SalesDoc[]);
	let expenseCategories = $derived((data.expenseCategories || []) as Category[]);
	let expenseItems = $derived((data.expenseItems || []) as Item[]);
    let vendorsList = $derived((data.vendors || []) as Vendor[]);

	// คำนวณยอดเงินรวมและกำไร/ขาดทุน (Reactive)
	let totalExpense = $derived(expenses.reduce((sum: number, exp: Expense) => sum + Number(exp.total_amount), 0));
	let totalRevenue = $derived(salesDocuments.reduce((sum: number, doc: SalesDoc) => sum + Number(doc.total_amount), 0));
	
	// หากยังไม่มีเอกสารขาย ให้แสดงกำไรประเมินจากยอด Initial Amount แทน
	let revenueToUse = $derived(totalRevenue > 0 ? totalRevenue : Number(job.amount || 0));
	let netProfit = $derived(revenueToUse - totalExpense);

	// กรอง options เพื่อใช้งานร่วมกับ svelte-select
	let categoryOptions = $derived(expenseCategories.map((c: Category) => ({
		value: c.id,
		label: c.category_name
	})));

    let vendorOptions = $derived(vendorsList.map((v: Vendor) => ({
		value: v.id,
		label: v.company_name ? `${v.company_name} (${v.name})` : v.name
	})));

    // Helper สำหรับกรอง Item ตาม Category
    function getItemOptions(categoryId: string | number | undefined) {
        if (!categoryId) return [];
        return expenseItems
            .filter((i: Item) => i.expense_category_id == categoryId)
            .map((i: Item) => ({ value: i.id, label: i.item_name }));
    }

	// ------------------------------------------
    // จัดการ State สำหรับ Modal Add Expense หลายบรรทัด
    // ------------------------------------------
    interface ExpenseEntry {
        id: string; // ใช้เป็น key สำหรับ loop
        selectedCategory: SelectOption | null;
        selectedItem: SelectOption | null;
        selectedVendor: SelectOption | null;
        refDoc: string;
        price: number | '';
        qty: number | '';
        hasVat: boolean;
        whtRate: string;
        remarks: string;
    }

    function createEmptyEntry(): ExpenseEntry {
        return {
            id: Math.random().toString(36).substr(2, 9),
            selectedCategory: null,
            selectedItem: null,
            selectedVendor: null,
            refDoc: '',
            price: '',
            qty: 1,
            hasVat: false,
            whtRate: 'None',
            remarks: ''
        };
    }

    let isExpenseModalOpen = $state(false);
	let isSavingExpense = $state(false);
    let expenseEntries = $state<ExpenseEntry[]>([]);

    // คำนวณยอดแต่ละบรรทัด
    const getAmt = (e: ExpenseEntry) => (Number(e.price) || 0) * (Number(e.qty) || 0);
    const getVat = (e: ExpenseEntry) => e.hasVat ? getAmt(e) * 0.07 : 0;
    const getWht = (e: ExpenseEntry) => {
        if (e.whtRate === '3') return getAmt(e) * 0.03;
        if (e.whtRate === '1') return getAmt(e) * 0.01;
        return 0;
    };
    const getNet = (e: ExpenseEntry) => getAmt(e) + getVat(e) - getWht(e);

    // ยอดรวมทั้งหมดใน Modal
    let totalModalAmount = $derived(expenseEntries.reduce((sum, e) => sum + getNet(e), 0));
    // เช็คว่า Form พร้อมกด Save ไหม (ต้องกรอก Item, Price >= 0, Qty > 0 ทุกแถว)
    let isFormValid = $derived(expenseEntries.length > 0 && expenseEntries.every(e => e.selectedItem && Number(e.price) >= 0 && Number(e.qty) > 0));

    function openExpenseModal() {
        expenseEntries = [createEmptyEntry()];
        isExpenseModalOpen = true;
    }

    function addExpenseRow() {
        expenseEntries = [...expenseEntries, createEmptyEntry()];
    }

    function removeExpenseRow(index: number) {
        if (expenseEntries.length > 1) {
            expenseEntries = expenseEntries.filter((_, i) => i !== index);
        }
    }

	let isSaving = $state(false);
	let updateStatusForm: HTMLFormElement;
	let statusToUpdate = $state('');

	const formatCurrency = (amount: number | null | undefined) => {
		if (amount === null || amount === undefined) return '-';
		return new Intl.NumberFormat($locale === 'th' ? 'th-TH' : 'en-US', { style: 'currency', currency: 'THB' }).format(amount);
	};

	const formatDate = (dateStr: string | null | undefined) => {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString($locale === 'th' ? 'th-TH' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
		if (updateStatusForm) updateStatusForm.requestSubmit();
	}

	const availableStatuses = data.availableStatuses || ['Pending', 'In Progress', 'Completed', 'Cancelled'];
</script>

<svelte:head>
	<title>{$t('Job Order')} {formatJobNumber(job.job_type, job.job_date, job.id)}</title>
</svelte:head>

<form method="POST" action="?/updateStatus" use:enhance={() => async ({ update }) => { await update(); isSaving = false; }} class="hidden" bind:this={updateStatusForm}>
	<input type="hidden" name="status" bind:value={statusToUpdate} />
</form>

<div class="mb-6 flex flex-col items-start justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
	<div class="flex items-center">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/freight-forwarder/job-orders" aria-label={$t('Back to Job Orders')} title={$t('Back')} class="mr-3 text-gray-500 hover:text-gray-800">
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6"><path d="m15 18-6-6 6-6"></path></svg>
		</a>
		<div>
			<h1 class="text-2xl font-bold text-gray-800">{$t('Job Order')} #{formatJobNumber(job.job_type, job.job_date, job.id)}</h1>
			<p class="mt-1 text-sm text-gray-500">{$t('Customer')}: <span class="font-medium text-gray-700">{job.company_name || job.customer_name || '-'}</span> | {$t('Ref Invoice')}: {job.invoice_no || '-'}</p>
		</div>
	</div>

	<div class="flex flex-shrink-0 items-center gap-2">
		<span class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold {getStatusClass(job.job_status)}">{$t('Status_' + job.job_status) || job.job_status}</span>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/sales-documents/new?job_id={job.id}&customer_id={job.customer_id}" class="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-600 disabled:opacity-50">{$t('Create Invoice')}</a>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/freight-forwarder/job-orders/generate-pdf?id={job.id}&locale={$locale}" target="_blank" class="inline-flex items-center justify-center rounded-lg bg-gray-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-600 disabled:opacity-50">{$t('Print PDF')}</a>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/freight-forwarder/job-orders/{job.id}/edit" class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50">{$t('Edit')}</a>
		<div class="relative">
			<select aria-label={$t('Change Status')} onchange={updateStatus} disabled={isSaving} class="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-yellow-600 focus:outline-none disabled:opacity-50 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2">
				<option value="" disabled selected>{$t('Change Status')}</option>
				{#each availableStatuses as status (status)}
					{#if status !== job.job_status}<option value={status} class="bg-white text-gray-800">{$t('Status_' + status) || status}</option>{/if}
				{/each}
			</select>
		</div>
	</div>
</div>

<!-- ======================= -->
<!-- FINANCIAL SUMMARY CARDS -->
<!-- ======================= -->
<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
	<!-- รายได้รวม (Total Revenue) -->
	<div class="rounded-xl border bg-white p-5 shadow-sm">
		<div class="flex items-center justify-between">
			<div class="text-sm font-semibold text-gray-500">{$t('Total Revenue')}</div>
			<div class="flex h-8 w-8 items-center justify-center rounded-full bg-green-50">
				<svg class="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 1v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
			</div>
		</div>
		<div class="mt-2 text-2xl font-bold {totalRevenue > 0 ? 'text-green-600' : 'text-gray-900'}">
			{formatCurrency(totalRevenue > 0 ? totalRevenue : Number(job.amount || 0))}
		</div>
		<div class="mt-1 text-xs text-gray-400">
			{#if totalRevenue > 0}
				{$t('From total')} {salesDocuments.length} {$t('sales documents')}
			{:else}
				{$t('Estimated Revenue (Initial Amount)')}
			{/if}
		</div>
	</div>

	<!-- ค่าใช้จ่ายรวม (Total Expenses) -->
	<div class="rounded-xl border bg-white p-5 shadow-sm">
		<div class="flex items-center justify-between">
			<div class="text-sm font-semibold text-gray-500">{$t('Total Expenses')}</div>
			<div class="flex h-8 w-8 items-center justify-center rounded-full bg-red-50">
				<svg class="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>
			</div>
		</div>
		<div class="mt-2 text-2xl font-bold text-red-500">
			{formatCurrency(totalExpense)}
		</div>
		<div class="mt-1 text-xs text-gray-400">{$t('From total')} {expenses.length} {$t('recorded expenses')}</div>
	</div>

	<!-- กำไร/ขาดทุน สุทธิ (Net Profit) -->
	<div class="rounded-xl border bg-white p-5 shadow-sm {netProfit < 0 ? 'bg-red-50/30' : 'bg-blue-50/30'}">
		<div class="flex items-center justify-between">
			<div class="text-sm font-semibold text-gray-700">{$t('Net Profit')}</div>
			<div class="flex h-8 w-8 items-center justify-center rounded-full {netProfit < 0 ? 'bg-red-100' : 'bg-blue-100'}">
				<svg class="h-4 w-4 {netProfit < 0 ? 'text-red-600' : 'text-blue-600'}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
			</div>
		</div>
		<div class="mt-2 text-2xl font-bold {netProfit < 0 ? 'text-red-600' : 'text-blue-600'}">
			{netProfit > 0 ? '+' : ''}{formatCurrency(netProfit)}
		</div>
		<div class="mt-1 text-xs text-gray-500">
			{totalRevenue > 0 ? $t('Calculated from actual sales minus expenses') : $t('Estimated from Initial Amount minus expenses')}
		</div>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white shadow-sm">
	<h3 class="mb-3 border-b p-4 pb-2 text-lg font-semibold text-gray-700">{$t('Shipment Details')}</h3>
	<div class="p-6">
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <!-- คอลัมน์ที่ 1: ข้อมูลหลัก และ เอกสาร -->
			<div class="space-y-4">
				<div class="flex items-center justify-between border-b border-gray-100 pb-2">
					<span class="text-sm font-medium text-gray-600">{$t('Job Type')}</span>
					<div class="flex items-center gap-2">
						<span class="font-bold text-gray-900">{job.job_type}</span>
						{#if job.service_type}<span class="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700 uppercase">{job.service_type}</span>{/if}
					</div>
				</div>
				<div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('HBL Number')}</span>
                    <span class="font-mono font-bold text-blue-600">{job.bl_number || '-'}</span>
                </div>
                <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('MB/L')}</span>
                    <span class="font-mono font-medium text-gray-900">{job.mbl || '-'}</span>
                </div>
				<div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('Booking No.')}</span>
                    <span class="font-mono font-medium text-gray-900">{job.booking_no || '-'}</span>
                </div>
                <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('Customer Invoice')}</span>
                    <span class="font-medium text-gray-900">{job.invoice_no || '-'}</span>
                </div>
                <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('Declaration No.')}</span>
                    <span class="font-medium text-gray-900">{job.ccl || '-'}</span>
                </div>
			</div>

            <!-- คอลัมน์ที่ 2: ข้อมูลเส้นทางและเรือ -->
			<div class="space-y-4">
                <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('ETD')}</span>
                    <span class="font-medium text-gray-900">{formatDate(job.etd)}</span>
                </div>
                <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('ETA')}</span>
                    <span class="font-medium text-gray-900">{formatDate(job.eta)}</span>
                </div>
				<div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('Liner / Carrier')}</span>
                    <span class="font-medium text-gray-900">{job.liner_name || '-'}</span>
                </div>
                <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('Vessel')}</span>
                    <span class="font-medium text-gray-900">{job.vessel || '-'}</span>
                </div>
                <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('Feeder')}</span>
                    <span class="font-medium text-gray-900">{job.feeder || '-'}</span>
                </div>
				<!-- เพิ่มส่วนแสดงข้อมูล Flight No. ตรงนี้ -->
				<div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('Flight No.')}</span>
                    <span class="font-medium text-gray-900">{job.flight_no || '-'}</span>
                </div>
			</div>

            <!-- คอลัมน์ที่ 3: ข้อมูลสถานที่และขนาด/น้ำหนัก -->
            <div class="space-y-4">
				<div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('Location')}</span>
                    <span class="font-medium text-gray-900">{job.location || '-'}</span>
                </div>
                <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('Port of Loading')}</span>
                    <span class="font-medium text-gray-900">{job.port_of_loading || '-'}</span>
                </div>
                <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('Port of Discharge')}</span>
                    <span class="font-medium text-gray-900">{job.port_of_discharge || '-'}</span>
                </div>
                <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('Quantity')}</span>
                    <span class="font-medium text-gray-900">{job.quantity || 0} {job.unit_name || ''}</span>
                </div>
                <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('WEIGHT KGS')}</span>
                    <span class="font-medium text-gray-900">{job.weight || '0.00'}</span>
                </div>
                <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span class="text-sm font-medium text-gray-600">{$t('VOLUME CBM')}</span>
                    <span class="font-medium text-gray-900">{job.kgs_volume || '0.00'}</span>
                </div>
            </div>
		</div>
	</div>
</div>

{#if job.remarks}
<div class="mb-6 rounded-lg border bg-white shadow-sm overflow-hidden">
	<div class="flex justify-between items-center border-b p-4 bg-gray-50">
		<h2 class="text-lg font-semibold text-gray-700">{$t('Remarks')}</h2>
	</div>
	<div class="p-6">
		<p class="whitespace-pre-wrap text-sm text-gray-700">{job.remarks}</p>
	</div>
</div>
{/if}

<!-- ======================= -->
<!-- ATTACHMENTS             -->
<!-- ======================= -->
{#if attachments && attachments.length > 0}
<div class="mb-6 rounded-lg border bg-white shadow-sm overflow-hidden">
	<div class="flex justify-between items-center border-b p-4 bg-gray-50">
		<h2 class="text-lg font-semibold text-gray-700">{$t('Attachments')}</h2>
	</div>
			<div class="p-6">
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
			{#each attachments as file (file.id)}
				<div class="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-blue-400 hover:shadow-md">
					<div class="flex items-center gap-3 overflow-hidden">
						<div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
							</svg>
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-bold text-gray-800" title={file.file_original_name}>{file.file_original_name}</p>
							<p class="text-xs text-gray-500">{(Number(file.file_size_bytes) / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB</p>
						</div>
					</div>
					<div class="flex flex-shrink-0 items-center gap-2 ml-4">
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                        <a href={file.url} target="_blank" rel="noopener noreferrer" class="rounded-full bg-gray-50 p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition-colors" title={$t('View File')}>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
								<path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
							</svg>
						</a>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a href={file.url} download={file.file_original_name} class="rounded-full bg-blue-50 p-2 text-blue-600 hover:bg-blue-100 transition-colors" title={$t('Download')}>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
							</svg>
						</a>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
{/if}

<!-- ======================= -->
<!-- SALES & INVOICES TABLE  -->
<!-- ======================= -->
<div class="mb-6 rounded-lg border bg-white shadow-sm overflow-hidden">
	<div class="flex justify-between items-center border-b p-4 bg-gray-50">
		<h2 class="text-lg font-semibold text-gray-700">{$t('Sales & Invoices')}</h2>
	</div>

	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200">
			<thead class="bg-white text-xs text-gray-500 uppercase">
				<tr>
					<th class="px-6 py-3 text-left font-semibold">{$t('Document No.')}</th>
					<th class="px-6 py-3 text-left font-semibold">{$t('Reference Doc')}</th>
					<th class="px-6 py-3 text-left font-semibold">{$t('Type')}</th>
					<th class="px-6 py-3 text-left font-semibold">{$t('Date')}</th>
					<th class="px-6 py-3 text-center font-semibold">{$t('Status')}</th>
					<th class="px-6 py-3 text-right font-semibold">{$t('Total Amount')}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-100 bg-white text-sm">
				{#each salesDocuments as doc (doc.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-6 py-3">
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href="/sales-documents/{doc.id}" class="font-bold text-blue-600 hover:underline">{doc.document_number}</a>
						</td>
						<td class="px-6 py-3 text-gray-600">{doc.reference_doc || '-'}</td>
						<td class="px-6 py-3 text-gray-600">
							<span class="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold">{doc.document_type}</span>
						</td>
						<td class="px-6 py-3 text-gray-600">{formatDate(doc.document_date)}</td>
						<td class="px-6 py-3 text-center">
							<span class="px-2 py-0.5 rounded text-xs font-semibold 
								{doc.status === 'Paid' ? 'bg-green-100 text-green-700' : 
								 doc.status === 'Sent' ? 'bg-blue-100 text-blue-700' : 
								 'bg-gray-100 text-gray-700'}">
								{$t('Status_' + doc.status) || doc.status}
							</span>
						</td>
						<td class="px-6 py-3 text-right font-mono font-bold text-green-600">{formatCurrency(doc.total_amount)}</td>
					</tr>
				{:else}
					<tr><td colspan="6" class="px-6 py-8 text-center text-gray-400">{$t('No sales documents linked to this Job')}</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<!-- ======================= -->
<!-- EXPENSES TABLE          -->
<!-- ======================= -->
<div class="mb-6 rounded-lg border bg-white shadow-sm overflow-hidden">
	<div class="flex justify-between items-center border-b p-4 bg-gray-50">
		<h2 class="text-lg font-semibold text-gray-700">{$t('Job Expenses')}</h2>
		<button onclick={openExpenseModal} class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm transition-colors">+ {$t('Add Expense')}</button>
	</div>

	{#if form?.message && form?.action?.includes('Expense')}
		<div class="p-4 bg-red-50 text-red-600 text-sm border-b">{$t(form.message)}</div>
	{/if}

	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200">
			<thead class="bg-white text-xs text-gray-500 uppercase">
				<tr>
					<th class="px-6 py-3 text-left font-semibold">{$t('Category / Item')}</th>
                    <th class="px-6 py-3 text-left font-semibold">{$t('Paid To')}</th>
					<th class="px-6 py-3 text-left font-semibold">{$t('Ref. Doc')}</th>
					<th class="px-6 py-3 text-right font-semibold">{$t('Price')}</th>
					<th class="px-6 py-3 text-right font-semibold">{$t('Qty')}</th>
					<th class="px-6 py-3 text-right font-semibold">{$t('Amount')}</th>
					<th class="px-6 py-3 text-right font-semibold text-green-600">{$t('VAT')}</th>
					<th class="px-6 py-3 text-right font-semibold text-orange-600">{$t('WH')}</th>
					<th class="px-6 py-3 text-right font-semibold">{$t('Total Amount')}</th>
					<th class="px-6 py-3 text-center font-semibold">{$t('Action')}</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-100 bg-white text-sm">
				{#each expenses as exp (exp.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-6 py-3">
							<div class="font-bold text-gray-900">{exp.item_name}</div>
							<div class="text-xs text-gray-500">{exp.category_name}</div>
						</td>
                        <td class="px-6 py-3 text-gray-600">
                            {#if exp.vendor_company_name || exp.vendor_name}
                                <div class="font-medium text-gray-800" title={exp.vendor_company_name || exp.vendor_name || ''}>
                                    {exp.vendor_company_name || exp.vendor_name}
                                </div>
                            {:else}
                                -
                            {/if}
                        </td>
						<td class="px-6 py-3 text-gray-600">{exp.ref_document || '-'}</td>
						<td class="px-6 py-3 text-right font-mono text-gray-700">{formatCurrency(exp.price || 0)}</td>
						<td class="px-6 py-3 text-right font-mono text-gray-700">{exp.qty || 1}</td>
						<td class="px-6 py-3 text-right font-mono text-gray-700">{formatCurrency(exp.amount)}</td>
						<td class="px-6 py-3 text-right font-mono text-green-600">{formatCurrency(exp.vat_amount || 0)}</td>
						<td class="px-6 py-3 text-right font-mono text-orange-600">{formatCurrency(exp.wht_amount || 0)}</td>
						<td class="px-6 py-3 text-right font-mono font-bold text-red-600">{formatCurrency(exp.total_amount)}</td>
						<td class="px-6 py-3 text-center">
							<form method="POST" action="?/deleteExpense" use:enhance onsubmit={(e) => { if(!confirm($t('Confirm delete this expense?'))) e.preventDefault(); }}>
								<input type="hidden" name="expense_id" value={exp.id}>
								<button type="submit" class="text-red-500 hover:text-red-700 text-xs font-semibold p-1 rounded hover:bg-red-50 transition-colors">{$t('Delete')}</button>
							</form>
						</td>
					</tr>
				{:else}
					<tr><td colspan="10" class="px-6 py-8 text-center text-gray-400">{$t('No expenses recorded')}</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

{#if isExpenseModalOpen}
<!-- ขยาย Modal ด้วย max-w-6xl และให้ scroll ได้เพื่อรองรับหลายรายการ -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity">
	<div class="w-full max-w-6xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
		<div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
			<h3 class="font-bold text-gray-800 text-lg flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                {$t('Add Multiple Expenses')}
            </h3>
			<button type="button" onclick={() => isExpenseModalOpen = false} class="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-200" aria-label="Close modal">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
		</div>

		<form method="POST" action="?/addExpense" class="flex flex-col flex-1 overflow-hidden" use:enhance={() => {
			isSavingExpense = true;
			return async ({ update, result }) => {
				await update();
				isSavingExpense = false;
				if(result.type === 'success') isExpenseModalOpen = false;
			};
		}}>
            <!-- แปลง state รายการให้เป็น JSON ซ่อนไว้เพื่อส่งไปฝั่ง Server -->
            <input type="hidden" name="expenses_data" value={JSON.stringify(expenseEntries)} />
            
            <div class="flex-1 overflow-y-auto p-6 bg-gray-100/50 space-y-4">
                {#each expenseEntries as entry, index (entry.id)}
                    <div class="bg-white border border-gray-200 rounded-xl p-5 shadow-sm relative transition-all hover:border-blue-300">
                        <div class="flex justify-between items-center mb-4">
                            <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs">{index + 1}</span>
                            {#if expenseEntries.length > 1}
                                <button type="button" onclick={() => removeExpenseRow(index)} class="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors" title={$t('Remove')}>
                                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            {/if}
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-12 gap-x-5 gap-y-4">
                            <div class="md:col-span-3">
                                <label for="category-{entry.id}" class="block text-xs font-semibold text-gray-600 mb-1.5">{$t('Category')} <span class="text-red-500">*</span></label>
                                <Select id="category-{entry.id}" items={categoryOptions} bind:value={entry.selectedCategory} on:change={() => entry.selectedItem = null} placeholder={$t('Search...')} container={browser ? document.body : null} class="svelte-select-custom" />
                            </div>
                            <div class="md:col-span-3">
                                <label for="item-{entry.id}" class="block text-xs font-semibold text-gray-600 mb-1.5">{$t('Item')} <span class="text-red-500">*</span></label>
                                <Select id="item-{entry.id}" items={getItemOptions(entry.selectedCategory?.value)} bind:value={entry.selectedItem} disabled={!entry.selectedCategory} placeholder={$t('Search...')} container={browser ? document.body : null} class="svelte-select-custom" />
                            </div>
                            <div class="md:col-span-3">
                                <label for="vendor-{entry.id}" class="block text-xs font-semibold text-gray-600 mb-1.5">{$t('Paid To (Vendor)')}</label>
                                <Select id="vendor-{entry.id}" items={vendorOptions} bind:value={entry.selectedVendor} placeholder={$t('Select Vendor (Optional)')} container={browser ? document.body : null} class="svelte-select-custom" />
                            </div>
                            <div class="md:col-span-3">
                                <label for="refDoc-{entry.id}" class="block text-xs font-semibold text-gray-600 mb-1.5">{$t('Ref Doc')}</label>
                                <input id="refDoc-{entry.id}" type="text" bind:value={entry.refDoc} class="w-full rounded-md border-gray-300 py-[9px] px-3 text-sm focus:border-blue-500 focus:ring-blue-500" placeholder={$t('INV/Receipt No.')}>
                            </div>

                            <div class="md:col-span-2">
                                <label for="price-{entry.id}" class="block text-xs font-semibold text-gray-600 mb-1.5">{$t('Unit Price')} <span class="text-red-500">*</span></label>
                                <input id="price-{entry.id}" type="number" step="0.01" bind:value={entry.price} class="w-full rounded-md border-gray-300 py-[9px] px-3 text-sm text-right focus:border-blue-500 focus:ring-blue-500" placeholder="0.00">
                            </div>
                            <div class="md:col-span-2">
                                <label for="qty-{entry.id}" class="block text-xs font-semibold text-gray-600 mb-1.5">{$t('Quantity')} <span class="text-red-500">*</span></label>
                                <input id="qty-{entry.id}" type="number" step="0.01" bind:value={entry.qty} class="w-full rounded-md border-gray-300 py-[9px] px-3 text-sm text-right focus:border-blue-500 focus:ring-blue-500" placeholder="1">
                            </div>
                            <div class="md:col-span-2 flex items-end pb-0.5">
                                <label for="hasVat-{entry.id}" class="flex items-center space-x-2 cursor-pointer bg-gray-50 hover:bg-gray-100 w-full p-2.5 rounded-md border border-gray-200 transition-colors h-[42px]">
                                    <input id="hasVat-{entry.id}" type="checkbox" bind:checked={entry.hasVat} class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                                    <span class="text-xs font-bold text-gray-700">{$t('+ VAT 7%')}</span>
                                </label>
                            </div>
                            <div class="md:col-span-2">
                                <label for="whtRate-{entry.id}" class="block text-xs font-semibold text-gray-600 mb-1.5">{$t('WH Tax')}</label>
                                <select id="whtRate-{entry.id}" bind:value={entry.whtRate} class="w-full rounded-md border-gray-300 py-[9px] px-3 text-sm focus:border-blue-500 focus:ring-blue-500">
                                    <option value="None">{$t('None')}</option>
                                    <option value="1">WHT 1%</option>
                                    <option value="3">WHT 3%</option>
                                </select>
                            </div>
                            <div class="md:col-span-4 bg-gray-50 rounded-lg p-3 border border-gray-200 flex justify-between items-center h-[62px] self-end">
                                <div class="text-xs text-gray-500 font-bold tracking-wider uppercase">{$t('Net Amount')}</div>
                                <div class="font-bold text-red-600 text-lg font-mono">{formatCurrency(getNet(entry))}</div>
                            </div>

                            <div class="md:col-span-12 mt-1">
                                <label for="remarks-{entry.id}" class="sr-only">{$t('Remarks')}</label>
                                <input id="remarks-{entry.id}" type="text" bind:value={entry.remarks} class="w-full rounded-md border-gray-300 py-2 px-3 text-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 focus:bg-white" placeholder={$t('Remarks / Note...')}>
                            </div>
                        </div>
                    </div>
                {/each}

                <button type="button" onclick={addExpenseRow} class="w-full py-4 border-2 border-dashed border-blue-300 rounded-xl text-blue-600 font-bold hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {$t('Add More Expense')}
                </button>
            </div>

			<div class="px-6 py-4 bg-white border-t flex flex-col md:flex-row justify-between items-center shrink-0 gap-4">
                <div class="flex items-center gap-4">
                    <div class="text-gray-500 text-sm">
                        {$t('Total Items')}: <span class="font-bold text-gray-800">{expenseEntries.length}</span>
                    </div>
                    <div class="h-6 w-px bg-gray-300 hidden md:block"></div>
                    <div class="text-gray-700 font-bold">
                        {$t('Total Net Amount')}: <span class="text-2xl text-red-600 ml-2 font-mono">{formatCurrency(totalModalAmount)}</span>
                    </div>
                </div>
                
                <div class="flex w-full md:w-auto gap-3">
				    <button type="button" onclick={() => isExpenseModalOpen = false} class="flex-1 md:flex-none px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors">{$t('Cancel')}</button>
				    <button type="submit" disabled={isSavingExpense || !isFormValid} class="flex-1 md:flex-none px-8 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex justify-center items-center">
					    {#if isSavingExpense}
                            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            {$t('Saving...')}
                        {:else}
                            {$t('Save All Expenses')}
                        {/if}
				    </button>
                </div>
			</div>
		</form>
	</div>
</div>
{/if}

<style>
	/* เพิ่มสไตล์ให้กับ svelte-select เพื่อให้เข้ากับ UI ของระบบ */
	:global(div.svelte-select-custom) {
		border-color: #d1d5db !important;
		border-radius: 0.375rem !important;
		min-height: 42px !important;
		background-color: white !important;
	}
	:global(div.svelte-select-custom input) {
		font-size: 0.875rem !important;
	}
</style>
<!-- eslint-disable svelte/no-navigation-without-resolve -->