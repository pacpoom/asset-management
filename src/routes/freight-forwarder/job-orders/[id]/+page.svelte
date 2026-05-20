<!-- eslint-disable svelte/no-navigation-without-resolve -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import type { ActionData, PageData } from './$types';
	import { t, locale } from '$lib/i18n';

	interface Expense {
		id: number;
		expense_item_id: number;
		vendor_id: number | null;
		tax_type: string;
		remarks: string | null;
		total_amount: number;
		amount: number;
		price?: number;
		qty?: number;
		vat_amount?: number;
		wht_amount?: number;
		item_name?: string;
		category_name?: string;
		ref_document?: string;
		vendor_company_name?: string;
		vendor_name?: string;
		[key: string]: unknown;
	}
	interface SalesDoc {
		id: number;
		total_amount: number;
		document_number: string;
		reference_doc?: string;
		document_type: string;
		document_date: string;
		status: string;
		[key: string]: unknown;
	}
	interface Category {
		id: number;
		category_name: string;
		[key: string]: unknown;
	}
	interface Item {
		id: number;
		item_name: string;
		expense_category_id: number;
		[key: string]: unknown;
	}
	interface Vendor {
		id: number;
		name: string;
		company_name: string | null;
		[key: string]: unknown;
	}
	interface SelectOption {
		value: string | number;
		label: string;
	}

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
	let totalExpense = $derived(
		expenses.reduce((sum: number, exp: Expense) => sum + Number(exp.total_amount), 0)
	);
	let totalRevenue = $derived(
		salesDocuments.reduce((sum: number, doc: SalesDoc) => sum + Number(doc.total_amount), 0)
	);

	// หากยังไม่มีเอกสารขาย ให้แสดงกำไรประเมินจากยอด Initial Amount แทน
	let revenueToUse = $derived(totalRevenue > 0 ? totalRevenue : Number(job.amount || 0));
	let netProfit = $derived(revenueToUse - totalExpense);

	/** Free Days snapshot บน job_orders (โชว์ต่อท้ายชื่อเรือ) */
	let vesselFreeDays = $derived(
		job.storage_days != null || job.demurrage_days != null || job.detention_days != null
			? {
					storage: job.storage_days ?? '—',
					demurrage: job.demurrage_days ?? '—',
					detention: job.detention_days ?? '—'
				}
			: null
	);

	// กรอง options เพื่อใช้งานร่วมกับ svelte-select
	let categoryOptions = $derived(
		expenseCategories.map((c: Category) => ({
			value: c.id,
			label: c.category_name
		}))
	);

	let vendorOptions = $derived(
		vendorsList.map((v: Vendor) => ({
			value: v.id,
			label: v.company_name ? `${v.company_name} (${v.name})` : v.name
		}))
	);

	// Helper สำหรับกรอง Item ตาม Category
	function getItemOptions(categoryId: string | number | undefined | null) {
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
	const getAmt = (e: ExpenseEntry | typeof editExpenseData) =>
		(Number(e.price) || 0) * (Number(e.qty) || 0);
	const getVat = (e: ExpenseEntry | typeof editExpenseData) => (e.hasVat ? getAmt(e) * 0.07 : 0);
	const getWht = (e: ExpenseEntry | typeof editExpenseData) => {
		if (e.whtRate === '3') return getAmt(e) * 0.03;
		if (e.whtRate === '1') return getAmt(e) * 0.01;
		return 0;
	};
	const getNet = (e: ExpenseEntry | typeof editExpenseData) => getAmt(e) + getVat(e) - getWht(e);

	// ยอดรวมทั้งหมดใน Modal
	let totalModalAmount = $derived(expenseEntries.reduce((sum, e) => sum + getNet(e), 0));
	// เช็คว่า Form พร้อมกด Save ไหม (ต้องกรอก Item, Price >= 0, Qty > 0 ทุกแถว)
	let isFormValid = $derived(
		expenseEntries.length > 0 &&
			expenseEntries.every((e) => e.selectedItem && Number(e.price) >= 0 && Number(e.qty) > 0)
	);

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

	// ------------------------------------------
	// จัดการ State สำหรับ Modal สร้าง Expense Item ใหม่
	// ------------------------------------------
	let isCreateItemModalOpen = $state(false);
	let isSavingItem = $state(false);
	let newItemData = $state({
		expense_category_id: '' as string | number,
		item_name: ''
	});

	function openCreateItemModal(categoryId: string | number | undefined) {
		newItemData = {
			expense_category_id: categoryId || '',
			item_name: ''
		};
		isCreateItemModalOpen = true;
	}

	// ------------------------------------------
	// จัดการ State สำหรับ Modal Edit Expense (รายการเดียว)
	// ------------------------------------------
	let isEditExpenseModalOpen = $state(false);
	let isSavingEditExpense = $state(false);
	let editExpenseData = $state({
		id: '',
		selectedCategory: null as SelectOption | null,
		selectedItem: null as SelectOption | null,
		selectedVendor: null as SelectOption | null,
		refDoc: '',
		price: '' as number | '',
		qty: 1 as number | '',
		hasVat: false,
		whtRate: 'None',
		remarks: ''
	});

	let isEditFormValid = $derived(
		editExpenseData.selectedItem &&
			Number(editExpenseData.price) >= 0 &&
			Number(editExpenseData.qty) > 0
	);

	function openEditExpenseModal(exp: Expense) {
		// หา Category ของ Item นี้
		const item = expenseItems.find((i: Item) => i.id === exp.expense_item_id);
		const categoryId = item ? item.expense_category_id : null;

		// แยก Tax Type
		const hasVat = exp.tax_type?.includes('VAT 7%') || false;
		let whtRate = 'None';
		if (exp.tax_type?.includes('WHT 3%')) whtRate = '3';
		if (exp.tax_type?.includes('WHT 1%')) whtRate = '1';

		editExpenseData = {
			id: exp.id.toString(),
			selectedCategory: categoryId
				? categoryOptions.find((c: SelectOption) => c.value == categoryId) || null
				: null,
			selectedItem: exp.expense_item_id
				? { value: exp.expense_item_id, label: exp.item_name || '' }
				: null,
			selectedVendor: exp.vendor_id
				? vendorOptions.find((v: SelectOption) => v.value == exp.vendor_id) || null
				: null,
			refDoc: exp.ref_document || '',
			price: exp.price !== undefined ? Number(exp.price) : '',
			qty: exp.qty !== undefined ? Number(exp.qty) : 1,
			hasVat,
			whtRate,
			remarks: exp.remarks || ''
		};
		isEditExpenseModalOpen = true;
	}

	let isSaving = $state(false);
	let updateStatusForm: HTMLFormElement;
	let statusToUpdate = $state('');

	const formatCurrency = (amount: number | null | undefined) => {
		if (amount === null || amount === undefined) return '-';
		return new Intl.NumberFormat($locale === 'th' ? 'th-TH' : 'en-US', {
			style: 'currency',
			currency: 'THB'
		}).format(amount);
	};

	const formatDate = (dateStr: string | null | undefined) => {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString($locale === 'th' ? 'th-TH' : 'en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
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

	const availableStatuses = data.availableStatuses || [
		'Pending',
		'In Progress',
		'Completed',
		'Cancelled'
	];

	// ---- Container state ----
	interface Container {
		id: number;
		container_size: '20' | '40';
		container_number: string | null;
		seal_number: string | null;
		remarks: string | null;
		status: 'pending' | 'checked_out';
		checkout_date: string | null;
	}
	let containers = $derived((data.containers || []) as Container[]);
	let isContainerModalOpen = $state(false);
	let isContainerEditOpen = $state(false);
	let isAddContainerOpen = $state(false);
	let isSavingContainer = $state(false);
	let containerDeleteId = $state<number | null>(null);
	let containerEditData = $state({ id: 0, container_number: '', seal_number: '', remarks: '' });
	let newContainerSize = $state<'20' | '40'>('20');

	// Checkout state (single + bulk)
	let isCheckoutModalOpen = $state(false);
	let isSavingCheckout = $state(false);
	let checkoutData = $state({ id: 0, checkout_date: '' });

	// Bulk checkout state
	let selectedContainerIds = $state<Set<number>>(new Set());
	let isBulkCheckoutOpen = $state(false);
	let isSavingBulkCheckout = $state(false);
	let bulkCheckoutDate = $state('');

	let pendingContainers = $derived(containers.filter(c => c.status === 'pending'));
	let allPendingSelected = $derived(
		pendingContainers.length > 0 && pendingContainers.every(c => selectedContainerIds.has(c.id))
	);

	function toggleSelectAll() {
		if (allPendingSelected) {
			selectedContainerIds = new Set();
		} else {
			selectedContainerIds = new Set(pendingContainers.map(c => c.id));
		}
	}

	function toggleSelectContainer(id: number) {
		const next = new Set(selectedContainerIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedContainerIds = next;
	}

	function openBulkCheckout() {
		const today = new Date();
		const y = today.getFullYear();
		const m = String(today.getMonth() + 1).padStart(2, '0');
		const d = String(today.getDate()).padStart(2, '0');
		bulkCheckoutDate = `${y}-${m}-${d}`;
		isBulkCheckoutOpen = true;
	}

	function openCheckoutModal(c: Container) {
		const today = new Date();
		const y = today.getFullYear();
		const m = String(today.getMonth() + 1).padStart(2, '0');
		const d = String(today.getDate()).padStart(2, '0');
		checkoutData = { id: c.id, checkout_date: `${y}-${m}-${d}` };
		isCheckoutModalOpen = true;
	}

	// คำนวณจำนวนวันที่ผ่านไปนับจาก ETA (บวก = เลย ETA แล้ว, ลบ = ยังไม่ถึง ETA)
	function calcDaysSinceEta(): number | null {
		if (!job.eta) return null;
		const now = new Date();
		now.setHours(0, 0, 0, 0);
		const eta = new Date(job.eta);
		eta.setHours(0, 0, 0, 0);
		return Math.round((now.getTime() - eta.getTime()) / (1000 * 60 * 60 * 24));
	}

	// คำนวณจำนวนวันที่ผ่านไปนับจาก deadline = ETA + X วัน
	// บวก = เลยกำหนดแล้ว, ลบ = ยังไม่ถึง, null = ไม่มีข้อมูล
	function calcDaysOverdue(deadlineDays: number | null | undefined): number | null {
		if (!job.eta || deadlineDays == null) return null;
		const now = new Date();
		now.setHours(0, 0, 0, 0);
		const deadline = new Date(job.eta);
		deadline.setHours(0, 0, 0, 0);
		deadline.setDate(deadline.getDate() + Number(deadlineDays));
		return Math.round((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24));
	}

	let isEn = $derived($locale === 'en');

	let pendingContainerCount = $derived(containers.filter(c => c.status === 'pending').length);
	let checkedOutCount = $derived(containers.filter(c => c.status === 'checked_out').length);

	// Import state
	interface ImportRow { container_size: string; container_number: string; seal_number: string; remarks: string; }
	let importPreviewRows = $state<ImportRow[]>([]);
	let isImportPreviewOpen = $state(false);
	let isImportingContainers = $state(false);
	let importFileInput: HTMLInputElement;

	function openContainerEdit(c: Container) {
		containerEditData = { id: c.id, container_number: c.container_number || '', seal_number: c.seal_number || '', remarks: c.remarks || '' };
		isContainerEditOpen = true;
	}

	async function downloadContainerTemplate() {
		const XLSX = await import('xlsx');
		const ws = XLSX.utils.aoa_to_sheet([
			['ขนาดตู้ (20 หรือ 40)', 'เบอร์ตู้', 'เบอร์ซีล', 'หมายเหตุ'],
			...containers.map(c => [c.container_size, c.container_number || '', c.seal_number || '', c.remarks || ''])
		]);
		ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 30 }];
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, 'Containers');
		XLSX.writeFile(wb, `containers_${job.job_number || job.id}.xlsx`);
	}

	async function handleContainerFileUpload(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const XLSX = await import('xlsx');
		const arrayBuffer = await file.arrayBuffer();
		const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
		const sheet = workbook.Sheets[workbook.SheetNames[0]];
		const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
		const parsed: ImportRow[] = rows
			.slice(1)
			.filter((row) => row.length > 0 && row[0])
			.map((row) => ({
				container_size: String(row[0] || '').trim(),
				container_number: String(row[1] || '').trim().toUpperCase(),
				seal_number: String(row[2] || '').trim(),
				remarks: String(row[3] || '').trim()
			}))
			.filter((row) => ['20', '40'].includes(row.container_size));
		(event.target as HTMLInputElement).value = '';
		if (parsed.length === 0) { alert('ไม่พบข้อมูลที่ถูกต้อง (ขนาดตู้ต้องเป็น 20 หรือ 40 เท่านั้น)'); return; }
		importPreviewRows = parsed;
		isImportPreviewOpen = true;
	}
</script>

<svelte:head>
	<title>{$t('Job Order')} {formatJobNumber(job.job_type, job.job_date, job.id)}</title>
</svelte:head>

<form
	method="POST"
	action="?/updateStatus"
	use:enhance={() =>
		async ({ update }) => {
			await update();
			isSaving = false;
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
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a
			href="/freight-forwarder/job-orders"
			aria-label={$t('Back to Job Orders')}
			title={$t('Back')}
			class="mr-3 text-gray-500 hover:text-gray-800"
		>
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
			<h1 class="text-2xl font-bold text-gray-800">
				{$t('Job Order')} #{formatJobNumber(job.job_type, job.job_date, job.id)}
			</h1>
			<p class="mt-1 text-sm text-gray-500">
				{$t('Customer')}:
				<span class="font-medium text-gray-700">{job.company_name || job.customer_name || '-'}</span
				>
				| {$t('Ref Invoice')}: {job.invoice_no || '-'}
			</p>
		</div>
	</div>

	<div class="flex flex-shrink-0 items-center gap-2">
		<span
			class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold {getStatusClass(
				job.job_status
			)}">{$t('Status_' + job.job_status) || job.job_status}</span
		>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a
			href="/sales-documents/new?job_id={job.id}&customer_id={job.customer_id}"
			class="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-600 disabled:opacity-50"
			>{$t('Create Invoice')}</a
		>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a
			href="/freight-forwarder/job-orders/generate-pdf?id={job.id}&locale={$locale}"
			target="_blank"
			class="inline-flex items-center justify-center rounded-lg bg-gray-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-600 disabled:opacity-50"
			>{$t('Print PDF')}</a
		>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a
			href="/freight-forwarder/job-orders/{job.id}/edit"
			class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
			>{$t('Edit')}</a
		>
		<div class="relative">
			<select
				aria-label={$t('Change Status')}
				onchange={updateStatus}
				disabled={isSaving}
				class="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-yellow-600 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
			>
				<option value="" disabled selected>{$t('Change Status')}</option>
				{#each availableStatuses as status (status)}
					{#if status !== job.job_status}<option value={status} class="bg-white text-gray-800"
							>{$t('Status_' + status) || status}</option
						>{/if}
				{/each}
			</select>
		</div>
	</div>
</div>

<!-- =============================== -->
<!-- CONTAINER CHECKOUT ALERT BANNER -->
<!-- =============================== -->
{#if containers.length > 0 && pendingContainerCount > 0 && job.eta}
	{@const daysSince = calcDaysSinceEta()}
	{@const hasDays = job.demurrage_days != null || job.storage_days != null || job.detention_days != null}
	{@const dOD = calcDaysOverdue(job.demurrage_days)}
	{@const dOS = calcDaysOverdue(job.storage_days)}
	{@const dODet = calcDaysOverdue(job.detention_days)}
	{@const worst = hasDays
		? Math.max(
				job.demurrage_days != null && dOD != null ? dOD : -999,
				job.storage_days != null && dOS != null ? dOS : -999,
				job.detention_days != null && dODet != null ? dODet : -999
			)
		: (daysSince ?? -999)}
	{@const isOverdue = worst > 0}
	{@const isToday = worst === 0}
	{@const isUpcoming = worst < 0 && worst >= -3}
	{#if isOverdue || isToday || isUpcoming}
		<div class="mb-6 rounded-xl border-l-4 p-4 shadow-sm {isOverdue ? 'border-red-500 bg-red-50' : isToday ? 'border-orange-500 bg-orange-50' : 'border-yellow-400 bg-yellow-50'}">
			<div class="flex items-start gap-3">
				<div class="mt-0.5 flex-shrink-0">
					{#if isOverdue}
						<svg class="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
						</svg>
					{:else}
						<svg class="h-5 w-5 {isToday ? 'text-orange-500' : 'text-yellow-500'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
						</svg>
					{/if}
				</div>
				<div class="flex-1">
					<!-- Main headline -->
					<p class="font-bold {isOverdue ? 'text-red-800' : isToday ? 'text-orange-800' : 'text-yellow-800'}">
						{#if isOverdue}
							⚠️ {isEn ? `Overdue ${worst} day(s) — containers not yet checked out!` : `เลยกำหนดมาแล้ว ${worst} วัน — ตู้ยังไม่ออกจากท่า!`}
						{:else if isToday}
							🚨 {isEn ? `Due today! (ETA: ${formatDate(job.eta)})` : `ครบกำหนดวันนี้! (ETA: ${formatDate(job.eta)})`}
						{:else}
							⏰ {isEn ? `${Math.abs(worst)} day(s) remaining (ETA: ${formatDate(job.eta)}) — prepare for checkout` : `อีก ${Math.abs(worst)} วัน (ETA: ${formatDate(job.eta)}) — เตรียม Checkout ตู้`}
						{/if}
					</p>
					<!-- Sub-text: container count -->
					<p class="mt-1 text-sm {isOverdue ? 'text-red-700' : isToday ? 'text-orange-700' : 'text-yellow-700'}">
						{isEn
							? `${pendingContainerCount} container(s) pending checkout`
							: `มีตู้ ${pendingContainerCount} ตู้ที่ยังไม่ได้ Checkout จากท่าเรือ`}
						{#if checkedOutCount > 0}
							— {isEn ? `${checkedOutCount} checked out` : `ออกแล้ว ${checkedOutCount} ตู้`}
						{/if}
						— {$t('Checkout Record Hint')}
					</p>
					<!-- Per-type deadline chips -->
					{#if hasDays}
						<div class="mt-2 flex flex-wrap gap-2">
							{#if job.demurrage_days != null && dOD != null}
								<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
									{dOD > 0 ? 'bg-red-100 text-red-700' : dOD === 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}">
									{$t('ff.demurrage_label')}: {job.demurrage_days}{$t('ff.day')}
									{#if dOD > 0}— {$t('ff.overdue_label')} {dOD}{$t('ff.day')}!
									{:else if dOD === 0}— {$t('Due today!')}
									{:else}— {isEn ? `${Math.abs(dOD)}d left` : `เหลือ ${Math.abs(dOD)} วัน`}{/if}
								</span>
							{/if}
							{#if job.storage_days != null && dOS != null}
								<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
									{dOS > 0 ? 'bg-red-100 text-red-700' : dOS === 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}">
									{$t('ff.storage_label')}: {job.storage_days}{$t('ff.day')}
									{#if dOS > 0}— {$t('ff.overdue_label')} {dOS}{$t('ff.day')}!
									{:else if dOS === 0}— {$t('Due today!')}
									{:else}— {isEn ? `${Math.abs(dOS)}d left` : `เหลือ ${Math.abs(dOS)} วัน`}{/if}
								</span>
							{/if}
							{#if job.detention_days != null && dODet != null}
								<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
									{dODet > 0 ? 'bg-red-100 text-red-700' : dODet === 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}">
									{$t('ff.detention_label')}: {job.detention_days}{$t('ff.day')}
									{#if dODet > 0}— {$t('ff.overdue_label')} {dODet}{$t('ff.day')}!
									{:else if dODet === 0}— {$t('Due today!')}
									{:else}— {isEn ? `${Math.abs(dODet)}d left` : `เหลือ ${Math.abs(dODet)} วัน`}{/if}
								</span>
							{/if}
						</div>
					{/if}
				</div>
				<button type="button" onclick={() => (isContainerModalOpen = true)}
					class="flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors {isOverdue ? 'bg-red-600 text-white hover:bg-red-700' : isToday ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-yellow-500 text-white hover:bg-yellow-600'}">
					{$t('Container List →')}
				</button>
			</div>
		</div>
	{/if}
{/if}

<!-- ======================= -->
<!-- FINANCIAL SUMMARY CARDS -->
<!-- ======================= -->
<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
	<!-- รายได้รวม (Total Revenue) -->
	<div class="rounded-xl border bg-white p-5 shadow-sm">
		<div class="flex items-center justify-between">
			<div class="text-sm font-semibold text-gray-500">{$t('Total Revenue')}</div>
			<div class="flex h-8 w-8 items-center justify-center rounded-full bg-green-50">
				<svg class="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 1v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/></svg
				>
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
				<svg class="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
					/></svg
				>
			</div>
		</div>
		<div class="mt-2 text-2xl font-bold text-red-500">
			{formatCurrency(totalExpense)}
		</div>
		<div class="mt-1 text-xs text-gray-400">
			{$t('From total')}
			{expenses.length}
			{$t('recorded expenses')}
		</div>
	</div>

	<!-- กำไร/ขาดทุน สุทธิ (Net Profit) -->
	<div
		class="rounded-xl border bg-white p-5 shadow-sm {netProfit < 0
			? 'bg-red-50/30'
			: 'bg-blue-50/30'}"
	>
		<div class="flex items-center justify-between">
			<div class="text-sm font-semibold text-gray-700">{$t('Net Profit')}</div>
			<div
				class="flex h-8 w-8 items-center justify-center rounded-full {netProfit < 0
					? 'bg-red-100'
					: 'bg-blue-100'}"
			>
				<svg
					class="h-4 w-4 {netProfit < 0 ? 'text-red-600' : 'text-blue-600'}"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
					/></svg
				>
			</div>
		</div>
		<div class="mt-2 text-2xl font-bold {netProfit < 0 ? 'text-red-600' : 'text-blue-600'}">
			{netProfit > 0 ? '+' : ''}{formatCurrency(netProfit)}
		</div>
		<div class="mt-1 text-xs text-gray-500">
			{totalRevenue > 0
				? $t('Calculated from actual sales minus expenses')
				: $t('Estimated from Initial Amount minus expenses')}
		</div>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white shadow-sm">
	<h3 class="mb-3 border-b p-4 pb-2 text-lg font-semibold text-gray-700">
		{$t('Shipment Details')}
	</h3>
	<div class="p-6">
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			<!-- คอลัมน์ที่ 1: ข้อมูลหลัก และ เอกสาร -->
			<div class="space-y-4">
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">{$t('Job Type')}</div>
					<div class="flex items-center gap-2">
						<span class="text-sm font-bold text-gray-900">{job.job_type}</span>
						{#if job.service_type}<span
								class="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 uppercase"
								>{job.service_type}</span
							>{/if}
					</div>
				</div>
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">{$t('HBL Number')}</div>
					<div class="font-mono text-sm font-bold break-all text-blue-600">
						{job.bl_number || '-'}
					</div>
				</div>
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">{$t('MB/L')}</div>
					<div class="font-mono text-sm font-medium break-all text-gray-900">{job.mbl || '-'}</div>
				</div>
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">
						{$t('Booking No.')}
					</div>
					<div class="font-mono text-sm font-medium break-all text-gray-900">
						{job.booking_no || '-'}
					</div>
				</div>
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">
						{$t('Customer Invoice')}
					</div>
					<div class="text-sm font-medium break-all text-gray-900">{job.invoice_no || '-'}</div>
				</div>
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">
						{$t('Declaration No.')}
					</div>
					<div class="text-sm font-medium break-all text-gray-900">{job.ccl || '-'}</div>
				</div>
			</div>

			<!-- คอลัมน์ที่ 2: ข้อมูลเส้นทางและเรือ -->
			<div class="space-y-4">
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">{$t('ETD')}</div>
					<div class="text-sm font-medium break-words text-gray-900">{formatDate(job.etd)}</div>
				</div>
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">{$t('ETA')}</div>
					<div class="text-sm font-medium break-words text-gray-900">{formatDate(job.eta)}</div>
				</div>
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">
						{$t('Liner / Carrier')}
					</div>
					<div class="text-sm font-medium break-words text-gray-900">{job.liner_name || '-'}</div>
				</div>
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">{$t('Vessel')}</div>
					<div class="text-sm font-medium break-words text-gray-900">{job.vessel || '-'}</div>
					{#if vesselFreeDays}
						<p class="mt-0.5 text-xs leading-snug text-gray-500">
							Storage {vesselFreeDays.storage} · Demurrage {vesselFreeDays.demurrage} · Detention {vesselFreeDays.detention} วัน
						</p>
					{/if}
				</div>
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">{$t('Feeder')}</div>
					<div class="text-sm font-medium break-words text-gray-900">{job.feeder || '-'}</div>
				</div>
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">{$t('Flight No.')}</div>
					<div class="text-sm font-medium break-words text-gray-900">{job.flight_no || '-'}</div>
				</div>
			</div>

			<!-- คอลัมน์ที่ 3: ข้อมูลสถานที่และขนาด/น้ำหนัก -->
			<div class="space-y-4">
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">{$t('Location')}</div>
					<div class="text-sm font-medium break-words text-gray-900">{job.location || '-'}</div>
				</div>
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">
						{$t('Port of Loading')}
					</div>
					<div class="text-sm font-medium break-words text-gray-900">
						{job.port_of_loading || '-'}
					</div>
				</div>
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">
						{$t('Port of Discharge')}
					</div>
					<div class="text-sm font-medium break-words text-gray-900">
						{job.port_of_discharge || '-'}
					</div>
				</div>
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">{$t('Quantity')}</div>
					<div class="text-sm font-medium break-words text-gray-900">
						{job.quantity || 0}
						{job.unit_name || ''}
					</div>
				</div>
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">{$t('WEIGHT KGS')}</div>
					<div class="text-sm font-medium break-words text-gray-900">{job.weight || '0.00'}</div>
				</div>
				<div class="border-b border-gray-100 pb-2">
					<div class="mb-0.5 text-[11px] font-bold text-gray-400 uppercase">{$t('VOLUME CBM')}</div>
					<div class="text-sm font-medium break-words text-gray-900">
						{job.kgs_volume || '0.00'}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- ======================= -->
<!-- CONTAINERS TRIGGER      -->
<!-- ======================= -->
<button type="button" onclick={() => (isContainerModalOpen = true)}
	class="mb-6 flex w-full items-center justify-between rounded-lg border bg-white p-4 shadow-sm transition-colors hover:bg-blue-50 hover:border-blue-300">
	<div class="flex items-center gap-3">
		<div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
			</svg>
		</div>
		<div class="text-left">
			<div class="font-semibold text-gray-800">{$t('Containers')}</div>
			<div class="text-sm text-gray-500">
				{#if containers.length > 0}
					{@const cnt20 = containers.filter(c => c.container_size === '20').length}
					{@const cnt40 = containers.filter(c => c.container_size === '40').length}
					{#if cnt20 > 0}<span class="font-medium text-blue-600">{cnt20} x 20'</span>{/if}
					{#if cnt20 > 0 && cnt40 > 0} &nbsp;+&nbsp; {/if}
					{#if cnt40 > 0}<span class="font-medium text-orange-600">{cnt40} x 40'</span>{/if}
					&nbsp;({$t('Total')} {containers.length} {$t('units')})
				{:else}
					<span class="text-gray-400">{$t('No containers recorded')}</span>
				{/if}
			</div>
		</div>
	</div>
	<div class="flex items-center gap-2">
		{#if containers.length > 0}
			<span class="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700">{containers.length}</span>
		{/if}
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
		</svg>
	</div>
</button>

{#if job.remarks}
	<div class="mb-6 overflow-hidden rounded-lg border bg-white shadow-sm">
		<div class="flex items-center justify-between border-b bg-gray-50 p-4">
			<h2 class="text-lg font-semibold text-gray-700">{$t('Remarks')}</h2>
		</div>
		<div class="p-6">
			<p class="text-sm whitespace-pre-wrap text-gray-700">{job.remarks}</p>
		</div>
	</div>
{/if}

<!-- ======================= -->
<!-- ATTACHMENTS             -->
<!-- ======================= -->
{#if attachments && attachments.length > 0}
	<div class="mb-6 overflow-hidden rounded-lg border bg-white shadow-sm">
		<div class="flex items-center justify-between border-b bg-gray-50 p-4">
			<h2 class="text-lg font-semibold text-gray-700">{$t('Attachments')}</h2>
		</div>
		<div class="p-6">
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
				{#each attachments as file (file.id)}
					<div
						class="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-blue-400 hover:shadow-md"
					>
						<div class="flex items-center gap-3 overflow-hidden">
							<div
								class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-5 w-5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
									/>
								</svg>
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-bold text-gray-800" title={file.file_original_name}>
									{file.file_original_name}
								</p>
								<p class="text-xs text-gray-500">
									{(Number(file.file_size_bytes) / 1024).toLocaleString(undefined, {
										maximumFractionDigits: 1
									})} KB
								</p>
							</div>
						</div>
						<div class="ml-4 flex flex-shrink-0 items-center gap-2">
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a
								href={file.url}
								target="_blank"
								rel="noopener noreferrer"
								class="rounded-full bg-gray-50 p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600"
								title={$t('View File')}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
									/>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
									/>
								</svg>
							</a>
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a
								href={file.url}
								download={file.file_original_name}
								class="rounded-full bg-blue-50 p-2 text-blue-600 transition-colors hover:bg-blue-100"
								title={$t('Download')}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
									/>
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
<div class="mb-6 overflow-hidden rounded-lg border bg-white shadow-sm">
	<div class="flex items-center justify-between border-b bg-gray-50 p-4">
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
							<a href="/sales-documents/{doc.id}" class="font-bold text-blue-600 hover:underline"
								>{doc.document_number}</a
							>
						</td>
						<td class="px-6 py-3 text-gray-600">{doc.reference_doc || '-'}</td>
						<td class="px-6 py-3 text-gray-600">
							<span class="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold"
								>{doc.document_type}</span
							>
						</td>
						<td class="px-6 py-3 text-gray-600">{formatDate(doc.document_date)}</td>
						<td class="px-6 py-3 text-center">
							<span
								class="rounded px-2 py-0.5 text-xs font-semibold
								{doc.status === 'Paid'
									? 'bg-green-100 text-green-700'
									: doc.status === 'Sent'
										? 'bg-blue-100 text-blue-700'
										: 'bg-gray-100 text-gray-700'}"
							>
								{$t('Status_' + doc.status) || doc.status}
							</span>
						</td>
						<td class="px-6 py-3 text-right font-mono font-bold text-green-600"
							>{formatCurrency(doc.total_amount)}</td
						>
					</tr>
				{:else}
					<tr
						><td colspan="6" class="px-6 py-8 text-center text-gray-400"
							>{$t('No sales documents linked to this Job')}</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<!-- ======================= -->
<!-- EXPENSES TABLE          -->
<!-- ======================= -->
<div class="mb-6 overflow-hidden rounded-lg border bg-white shadow-sm">
	<div class="flex items-center justify-between border-b bg-gray-50 p-4">
		<h2 class="text-lg font-semibold text-gray-700">{$t('Job Expenses')}</h2>
		<button
			onclick={openExpenseModal}
			class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
			>+ {$t('Add Expense')}</button
		>
	</div>

	{#if form?.message && form?.action?.includes('Expense')}
		<div class="border-b bg-red-50 p-4 text-sm text-red-600">{$t(form.message)}</div>
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
								<div
									class="font-medium text-gray-800"
									title={exp.vendor_company_name || exp.vendor_name || ''}
								>
									{exp.vendor_company_name || exp.vendor_name}
								</div>
							{:else}
								-
							{/if}
						</td>
						<td class="px-6 py-3 text-gray-600">{exp.ref_document || '-'}</td>
						<td class="px-6 py-3 text-right font-mono text-gray-700"
							>{formatCurrency(exp.price || 0)}</td
						>
						<td class="px-6 py-3 text-right font-mono text-gray-700">{exp.qty || 1}</td>
						<td class="px-6 py-3 text-right font-mono text-gray-700"
							>{formatCurrency(exp.amount)}</td
						>
						<td class="px-6 py-3 text-right font-mono text-green-600"
							>{formatCurrency(exp.vat_amount || 0)}</td
						>
						<td class="px-6 py-3 text-right font-mono text-orange-600"
							>{formatCurrency(exp.wht_amount || 0)}</td
						>
						<td class="px-6 py-3 text-right font-mono font-bold text-red-600"
							>{formatCurrency(exp.total_amount)}</td
						>
						<td class="px-6 py-3 text-center">
							<div class="flex justify-center gap-1">
								<!-- ปุ่ม Edit -->
								<button
									type="button"
									onclick={() => openEditExpenseModal(exp)}
									class="rounded p-1 text-xs font-semibold text-yellow-500 transition-colors hover:bg-yellow-50 hover:text-yellow-700"
									title={$t('Edit')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
										/>
									</svg>
								</button>
								<!-- ปุ่ม Delete -->
								<form
									method="POST"
									action="?/deleteExpense"
									use:enhance
									onsubmit={(e) => {
										if (!confirm($t('Confirm delete this expense?'))) e.preventDefault();
									}}
								>
									<input type="hidden" name="expense_id" value={exp.id} />
									<button
										type="submit"
										class="rounded p-1 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
										title={$t('Delete')}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
											/>
										</svg>
									</button>
								</form>
							</div>
						</td>
					</tr>
				{:else}
					<tr
						><td colspan="10" class="px-6 py-8 text-center text-gray-400"
							>{$t('No expenses recorded')}</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<!-- ======================= -->
<!-- MODAL: ADD EXPENSES     -->
<!-- ======================= -->
{#if isExpenseModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity"
	>
		<div
			class="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
		>
			<div class="flex shrink-0 items-center justify-between border-b bg-gray-50 px-6 py-4">
				<h3 class="flex items-center gap-2 text-lg font-bold text-gray-800">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 text-blue-600"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
					</svg>
					{$t('Add Multiple Expenses')}
				</h3>
				<button
					type="button"
					onclick={() => (isExpenseModalOpen = false)}
					class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
					aria-label="Close modal"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<form
				method="POST"
				action="?/addExpense"
				class="flex flex-1 flex-col overflow-hidden"
				use:enhance={() => {
					isSavingExpense = true;
					return async ({ update, result }) => {
						await update();
						isSavingExpense = false;
						if (result.type === 'success') isExpenseModalOpen = false;
					};
				}}
			>
				<input type="hidden" name="expenses_data" value={JSON.stringify(expenseEntries)} />

				<div class="flex-1 space-y-4 overflow-y-auto bg-gray-100/50 p-6">
					{#each expenseEntries as entry, index (entry.id)}
						<div
							class="relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-blue-300"
						>
							<div class="mb-4 flex items-center justify-between">
								<span
									class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700"
									>{index + 1}</span
								>
								{#if expenseEntries.length > 1}
									<button
										type="button"
										onclick={() => removeExpenseRow(index)}
										class="rounded p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
										title={$t('Remove')}
									>
										<svg
											class="h-5 w-5"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
											/></svg
										>
									</button>
								{/if}
							</div>

							<div class="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-12">
								<div class="md:col-span-3">
									<label
										for="category-{entry.id}"
										class="mb-1.5 block text-xs font-semibold text-gray-600"
										>{$t('Category')} <span class="text-red-500">*</span></label
									>
									<Select
										id="category-{entry.id}"
										items={categoryOptions}
										bind:value={entry.selectedCategory}
										on:change={() => (entry.selectedItem = null)}
										placeholder={$t('Search...')}
										container={browser ? document.body : null}
										class="svelte-select-custom"
									/>
								</div>
								<div class="md:col-span-3">
									<label
										for="item-{entry.id}"
										class="mb-1.5 block text-xs font-semibold text-gray-600"
										>{$t('Item')} <span class="text-red-500">*</span></label
									>
									<div class="flex gap-2">
										<div class="min-w-0 flex-grow">
											<Select
												id="item-{entry.id}"
												items={getItemOptions(entry.selectedCategory?.value)}
												bind:value={entry.selectedItem}
												disabled={!entry.selectedCategory}
												placeholder={$t('Search...')}
												container={browser ? document.body : null}
												class="svelte-select-custom"
											/>
										</div>
										<button
											type="button"
											disabled={!entry.selectedCategory}
											onclick={() => openCreateItemModal(entry.selectedCategory?.value)}
											class="flex h-[42px] w-10 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100 hover:text-blue-600 disabled:opacity-50"
											title={$t('Add New Item')}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-5 w-5"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"
												/>
											</svg>
										</button>
									</div>
								</div>
								<div class="md:col-span-3">
									<label
										for="vendor-{entry.id}"
										class="mb-1.5 block text-xs font-semibold text-gray-600"
										>{$t('Paid To (Vendor)')}</label
									>
									<Select
										id="vendor-{entry.id}"
										items={vendorOptions}
										bind:value={entry.selectedVendor}
										placeholder={$t('Select Vendor (Optional)')}
										container={browser ? document.body : null}
										class="svelte-select-custom"
									/>
								</div>
								<div class="md:col-span-3">
									<label
										for="refDoc-{entry.id}"
										class="mb-1.5 block text-xs font-semibold text-gray-600">{$t('Ref Doc')}</label
									>
									<input
										id="refDoc-{entry.id}"
										type="text"
										bind:value={entry.refDoc}
										class="w-full rounded-md border-gray-300 px-3 py-[9px] text-sm focus:border-blue-500 focus:ring-blue-500"
										placeholder={$t('INV/Receipt No.')}
									/>
								</div>

								<div class="md:col-span-2">
									<label
										for="price-{entry.id}"
										class="mb-1.5 block text-xs font-semibold text-gray-600"
										>{$t('Unit Price')} <span class="text-red-500">*</span></label
									>
									<input
										id="price-{entry.id}"
										type="number"
										step="0.01"
										bind:value={entry.price}
										class="w-full rounded-md border-gray-300 px-3 py-[9px] text-right text-sm focus:border-blue-500 focus:ring-blue-500"
										placeholder="0.00"
									/>
								</div>
								<div class="md:col-span-2">
									<label
										for="qty-{entry.id}"
										class="mb-1.5 block text-xs font-semibold text-gray-600"
										>{$t('Quantity')} <span class="text-red-500">*</span></label
									>
									<input
										id="qty-{entry.id}"
										type="number"
										step="0.01"
										bind:value={entry.qty}
										class="w-full rounded-md border-gray-300 px-3 py-[9px] text-right text-sm focus:border-blue-500 focus:ring-blue-500"
										placeholder="1"
									/>
								</div>
								<div class="flex items-end pb-0.5 md:col-span-2">
									<label
										for="hasVat-{entry.id}"
										class="flex h-[42px] w-full cursor-pointer items-center space-x-2 rounded-md border border-gray-200 bg-gray-50 p-2.5 transition-colors hover:bg-gray-100"
									>
										<input
											id="hasVat-{entry.id}"
											type="checkbox"
											bind:checked={entry.hasVat}
											class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										/>
										<span class="text-xs font-bold text-gray-700">{$t('+ VAT 7%')}</span>
									</label>
								</div>
								<div class="md:col-span-2">
									<label
										for="whtRate-{entry.id}"
										class="mb-1.5 block text-xs font-semibold text-gray-600">{$t('WH Tax')}</label
									>
									<select
										id="whtRate-{entry.id}"
										bind:value={entry.whtRate}
										class="w-full rounded-md border-gray-300 px-3 py-[9px] text-sm focus:border-blue-500 focus:ring-blue-500"
									>
										<option value="None">{$t('None')}</option>
										<option value="1">WHT 1%</option>
										<option value="3">WHT 3%</option>
									</select>
								</div>
								<div
									class="flex h-[62px] items-center justify-between self-end rounded-lg border border-gray-200 bg-gray-50 p-3 md:col-span-4"
								>
									<div class="text-xs font-bold tracking-wider text-gray-500 uppercase">
										{$t('Net Amount')}
									</div>
									<div class="font-mono text-lg font-bold text-red-600">
										{formatCurrency(getNet(entry))}
									</div>
								</div>

								<div class="mt-1 md:col-span-12">
									<label for="remarks-{entry.id}" class="sr-only">{$t('Remarks')}</label>
									<input
										id="remarks-{entry.id}"
										type="text"
										bind:value={entry.remarks}
										class="w-full rounded-md border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:border-blue-500 focus:bg-white focus:ring-blue-500"
										placeholder={$t('Remarks / Note...')}
									/>
								</div>
							</div>
						</div>
					{/each}

					<button
						type="button"
						onclick={addExpenseRow}
						class="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-300 py-4 font-bold text-blue-600 transition-colors hover:bg-blue-50"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
						</svg>
						{$t('Add More Expense')}
					</button>
				</div>

				<div
					class="flex shrink-0 flex-col items-center justify-between gap-4 border-t bg-white px-6 py-4 md:flex-row"
				>
					<div class="flex items-center gap-4">
						<div class="text-sm text-gray-500">
							{$t('Total Items')}:
							<span class="font-bold text-gray-800">{expenseEntries.length}</span>
						</div>
						<div class="hidden h-6 w-px bg-gray-300 md:block"></div>
						<div class="font-bold text-gray-700">
							{$t('Total Net Amount')}:
							<span class="ml-2 font-mono text-2xl text-red-600"
								>{formatCurrency(totalModalAmount)}</span
							>
						</div>
					</div>

					<div class="flex w-full gap-3 md:w-auto">
						<button
							type="button"
							onclick={() => (isExpenseModalOpen = false)}
							class="flex-1 rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 md:flex-none"
							>{$t('Cancel')}</button
						>
						<button
							type="submit"
							disabled={isSavingExpense || !isFormValid}
							class="flex flex-1 items-center justify-center rounded-lg bg-blue-600 px-8 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 md:flex-none"
						>
							{#if isSavingExpense}
								<svg
									class="mr-2 -ml-1 h-4 w-4 animate-spin text-white"
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									><circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
									></circle><path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									></path></svg
								>
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

<!-- ======================= -->
<!-- MODAL: EDIT EXPENSE     -->
<!-- ======================= -->
{#if isEditExpenseModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity"
	>
		<div class="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
			<div class="flex shrink-0 items-center justify-between border-b bg-gray-50 px-6 py-4">
				<h3 class="flex items-center gap-2 text-lg font-bold text-gray-800">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 text-yellow-600"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
						/>
					</svg>
					{$t('Edit Expense')}
				</h3>
				<button
					type="button"
					onclick={() => (isEditExpenseModalOpen = false)}
					class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
					aria-label="Close modal"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<form
				method="POST"
				action="?/editExpense"
				class="flex flex-1 flex-col overflow-hidden"
				use:enhance={() => {
					isSavingEditExpense = true;
					return async ({ update, result }) => {
						await update();
						isSavingEditExpense = false;
						if (result.type === 'success') isEditExpenseModalOpen = false;
					};
				}}
			>
				<!-- Hidden inputs สำหรับส่งข้อมูลแบบฟอร์มปกติ -->
				<input type="hidden" name="expense_id" value={editExpenseData.id} />
				<input
					type="hidden"
					name="expense_item_id"
					value={editExpenseData.selectedItem?.value || ''}
				/>
				<input type="hidden" name="vendor_id" value={editExpenseData.selectedVendor?.value || ''} />
				<input type="hidden" name="ref_document" value={editExpenseData.refDoc} />
				<input type="hidden" name="price" value={editExpenseData.price} />
				<input type="hidden" name="qty" value={editExpenseData.qty} />
				<input type="hidden" name="hasVat" value={editExpenseData.hasVat.toString()} />
				<input type="hidden" name="whtRate" value={editExpenseData.whtRate} />
				<input type="hidden" name="remarks" value={editExpenseData.remarks} />

				<div class="space-y-4 bg-white p-6">
					<div class="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-12">
						<div class="md:col-span-4">
							<label for="edit-category" class="mb-1.5 block text-xs font-semibold text-gray-600"
								>{$t('Category')} <span class="text-red-500">*</span></label
							>
							<Select
								id="edit-category"
								items={categoryOptions}
								bind:value={editExpenseData.selectedCategory}
								on:change={() => (editExpenseData.selectedItem = null)}
								placeholder={$t('Search...')}
								container={browser ? document.body : null}
								class="svelte-select-custom"
							/>
						</div>
						<div class="md:col-span-4">
							<label for="edit-item" class="mb-1.5 block text-xs font-semibold text-gray-600"
								>{$t('Item')} <span class="text-red-500">*</span></label
							>
							<div class="flex gap-2">
								<div class="min-w-0 flex-grow">
									<Select
										id="edit-item"
										items={getItemOptions(editExpenseData.selectedCategory?.value)}
										bind:value={editExpenseData.selectedItem}
										disabled={!editExpenseData.selectedCategory}
										placeholder={$t('Search...')}
										container={browser ? document.body : null}
										class="svelte-select-custom"
									/>
								</div>
								<button
									type="button"
									disabled={!editExpenseData.selectedCategory}
									onclick={() => openCreateItemModal(editExpenseData.selectedCategory?.value)}
									class="flex h-[42px] w-10 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100 hover:text-blue-600 disabled:opacity-50"
									title={$t('Add New Item')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5"
										viewBox="0 0 20 20"
										fill="currentColor"
									>
										<path
											d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"
										/>
									</svg>
								</button>
							</div>
						</div>
						<div class="md:col-span-4">
							<label for="edit-vendor" class="mb-1.5 block text-xs font-semibold text-gray-600"
								>{$t('Paid To (Vendor)')}</label
							>
							<Select
								id="edit-vendor"
								items={vendorOptions}
								bind:value={editExpenseData.selectedVendor}
								placeholder={$t('Select Vendor (Optional)')}
								container={browser ? document.body : null}
								class="svelte-select-custom"
							/>
						</div>

						<div class="md:col-span-3">
							<label for="edit-refDoc" class="mb-1.5 block text-xs font-semibold text-gray-600"
								>{$t('Ref Doc')}</label
							>
							<input
								id="edit-refDoc"
								type="text"
								bind:value={editExpenseData.refDoc}
								class="w-full rounded-md border-gray-300 px-3 py-[9px] text-sm focus:border-yellow-500 focus:ring-yellow-500"
								placeholder={$t('INV/Receipt No.')}
							/>
						</div>
						<div class="md:col-span-3">
							<label for="edit-price" class="mb-1.5 block text-xs font-semibold text-gray-600"
								>{$t('Unit Price')} <span class="text-red-500">*</span></label
							>
							<input
								id="edit-price"
								type="number"
								step="0.01"
								bind:value={editExpenseData.price}
								class="w-full rounded-md border-gray-300 px-3 py-[9px] text-right text-sm focus:border-yellow-500 focus:ring-yellow-500"
								placeholder="0.00"
							/>
						</div>
						<div class="md:col-span-2">
							<label for="edit-qty" class="mb-1.5 block text-xs font-semibold text-gray-600"
								>{$t('Quantity')} <span class="text-red-500">*</span></label
							>
							<input
								id="edit-qty"
								type="number"
								step="0.01"
								bind:value={editExpenseData.qty}
								class="w-full rounded-md border-gray-300 px-3 py-[9px] text-right text-sm focus:border-yellow-500 focus:ring-yellow-500"
								placeholder="1"
							/>
						</div>
						<div class="flex items-end pb-0.5 md:col-span-2">
							<label
								for="edit-hasVat"
								class="flex h-[42px] w-full cursor-pointer items-center space-x-2 rounded-md border border-gray-200 bg-gray-50 p-2.5 transition-colors hover:bg-gray-100"
							>
								<input
									id="edit-hasVat"
									type="checkbox"
									bind:checked={editExpenseData.hasVat}
									class="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
								/>
								<span class="text-xs font-bold text-gray-700">{$t('+ VAT 7%')}</span>
							</label>
						</div>
						<div class="md:col-span-2">
							<label for="edit-whtRate" class="mb-1.5 block text-xs font-semibold text-gray-600"
								>{$t('WH Tax')}</label
							>
							<select
								id="edit-whtRate"
								bind:value={editExpenseData.whtRate}
								class="w-full rounded-md border-gray-300 px-3 py-[9px] text-sm focus:border-yellow-500 focus:ring-yellow-500"
							>
								<option value="None">{$t('None')}</option>
								<option value="1">WHT 1%</option>
								<option value="3">WHT 3%</option>
							</select>
						</div>

						<div class="mt-1 md:col-span-12">
							<label for="edit-remarks" class="sr-only">{$t('Remarks')}</label>
							<input
								id="edit-remarks"
								type="text"
								bind:value={editExpenseData.remarks}
								class="w-full rounded-md border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:border-yellow-500 focus:bg-white focus:ring-yellow-500"
								placeholder={$t('Remarks / Note...')}
							/>
						</div>
					</div>

					<div
						class="mt-6 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4"
					>
						<div class="text-sm font-bold tracking-wider text-gray-500 uppercase">
							{$t('Net Amount')}
						</div>
						<div class="font-mono text-2xl font-bold text-red-600">
							{formatCurrency(getNet(editExpenseData))}
						</div>
					</div>
				</div>

				<div class="flex justify-end gap-3 border-t bg-gray-50 px-6 py-4">
					<button
						type="button"
						onclick={() => (isEditExpenseModalOpen = false)}
						class="rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100"
						>{$t('Cancel')}</button
					>
					<button
						type="submit"
						disabled={isSavingEditExpense || !isEditFormValid}
						class="flex items-center justify-center rounded-lg bg-yellow-500 px-8 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-yellow-600 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if isSavingEditExpense}
							<svg
								class="mr-2 -ml-1 h-4 w-4 animate-spin text-white"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								><circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle><path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path></svg
							>
							{$t('Saving...')}
						{:else}
							{$t('Save Changes')}
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ======================= -->
<!-- MODAL: CREATE NEW EXPENSE ITEM (MASTER DATA) -->
<!-- ======================= -->
{#if isCreateItemModalOpen}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity"
	>
		<div class="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b bg-gray-50 px-6 py-4">
				<h3 class="flex items-center gap-2 text-lg font-bold text-gray-800">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5 text-blue-600"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"
						/>
					</svg>
					{$t('Add New Expense Item')}
				</h3>
				<button
					type="button"
					onclick={() => (isCreateItemModalOpen = false)}
					class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
					aria-label="Close"
					title="Close"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<form
				method="POST"
				action="?/createExpenseItem"
				use:enhance={() => {
					isSavingItem = true;
					return async ({ update, result }) => {
						await update();
						isSavingItem = false;
						if (result.type === 'success') {
							isCreateItemModalOpen = false;
						}
					};
				}}
			>
				<div class="space-y-4 p-6">
					<div>
						<label for="new_item_category" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('Category')} <span class="text-red-500">*</span></label
						>
						<select
							id="new_item_category"
							name="expense_category_id"
							bind:value={newItemData.expense_category_id}
							class="w-full rounded-md border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
							required
						>
							<option value="" disabled selected>{$t('Select category...')}</option>
							{#each categoryOptions as cat}
								<option value={cat.value}>{cat.label}</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="new_item_name" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('Item Name')} <span class="text-red-500">*</span></label
						>
						<input
							id="new_item_name"
							type="text"
							name="item_name"
							bind:value={newItemData.item_name}
							class="w-full rounded-md border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
							required
							placeholder={$t('e.g. ค่าล่วงเวลา')}
						/>
					</div>
				</div>

				<div class="flex justify-end gap-3 border-t bg-gray-50 px-6 py-4">
					<button
						type="button"
						onclick={() => (isCreateItemModalOpen = false)}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
						>{$t('Cancel')}</button
					>
					<button
						type="submit"
						disabled={isSavingItem || !newItemData.expense_category_id || !newItemData.item_name}
						class="flex items-center rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
					>
						{#if isSavingItem}
							<svg
								class="mr-2 -ml-1 h-4 w-4 animate-spin text-white"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								><circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle><path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path></svg
							>
							{$t('Saving...')}
						{:else}
							{$t('Save Item')}
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ============================ -->
<!-- CONTAINER MAIN MODAL        -->
<!-- ============================ -->
{#if isContainerModalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
		<div class="flex w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" style="max-height: 75vh">
			<!-- Header -->
			<div class="flex-shrink-0 border-b bg-gray-50">
				<!-- Row 1: Title + Close -->
				<div class="flex items-center justify-between px-5 pt-4 pb-2">
					<div class="flex items-center gap-2">
						<div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
							</svg>
						</div>
						<div>
							<span class="font-bold text-gray-800">{$t('Containers')}</span>
							<span class="ml-2 text-xs text-gray-400">{job.job_number || job.id}</span>
						</div>
						{#if containers.length > 0}
							<span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{containers.length}</span>
						{/if}
					</div>
					<button type="button" onclick={() => (isContainerModalOpen = false)} class="text-gray-400 hover:text-gray-600">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
					</button>
				</div>
				<!-- Row 2: Action buttons -->
				<div class="flex items-center gap-2 px-5 pb-3">
					<button type="button" onclick={downloadContainerTemplate}
						class="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
						Template
					</button>
					<label class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
						นำเข้า Excel
						<input bind:this={importFileInput} type="file" accept=".xlsx,.xls,.csv" onchange={handleContainerFileUpload} class="hidden" />
					</label>
					<button type="button" onclick={() => { newContainerSize = '20'; isAddContainerOpen = true; }}
						class="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
						{$t('Add Container')}
					</button>
				</div>
			</div>

			<!-- Summary chips -->
			{#if containers.length > 0}
				{@const cnt20 = containers.filter(c => c.container_size === '20').length}
				{@const cnt40 = containers.filter(c => c.container_size === '40').length}
				<div class="flex flex-wrap gap-2 border-b bg-white px-6 py-3">
					{#if cnt20 > 0}
						<span class="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">{cnt20} x 20'</span>
					{/if}
					{#if cnt40 > 0}
						<span class="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">{cnt40} x 40'</span>
					{/if}
					<span class="text-xs text-gray-400 self-center">รวม {containers.length} ตู้</span>
					<span class="ml-auto rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">✓ ออกแล้ว {checkedOutCount}</span>
					{#if pendingContainerCount > 0}
						<span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">⏳ รอออก {pendingContainerCount}</span>
					{/if}
				</div>
			{/if}

			<!-- Table -->
			<div class="min-h-0 flex-1 overflow-y-auto">
				{#if containers.length > 0}
					<table class="min-w-full divide-y divide-gray-200 text-sm">
						<thead class="sticky top-0 bg-gray-50 text-xs font-bold text-gray-500 uppercase">
							<tr>
								<th class="px-3 py-3 text-center w-10">
									{#if pendingContainers.length > 0}
										<input type="checkbox" checked={allPendingSelected}
											onchange={toggleSelectAll}
											class="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
											title="เลือกทั้งหมด" />
									{/if}
								</th>
								<th class="px-4 py-3 text-left">#</th>
								<th class="px-4 py-3 text-left">{$t('Size')}</th>
								<th class="px-4 py-3 text-left">{$t('Container No.')}</th>
								<th class="px-4 py-3 text-left">{$t('Seal No.')}</th>
								<th class="px-4 py-3 text-left">{$t('Remarks')}</th>
								<th class="px-4 py-3 text-center">สถานะ / วันออกตู้</th>
								<th class="px-4 py-3 text-center">{$t('Action')}</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200 bg-white">
							{#each containers as container, i (container.id)}
								<tr class="hover:bg-gray-50 {container.status === 'checked_out' ? 'bg-green-50/40' : ''} {selectedContainerIds.has(container.id) ? '!bg-green-50' : ''}">
									<td class="px-3 py-3 text-center">
										{#if container.status === 'pending'}
											<input type="checkbox"
												checked={selectedContainerIds.has(container.id)}
												onchange={() => toggleSelectContainer(container.id)}
												class="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer" />
										{/if}
									</td>
									<td class="px-4 py-3 text-gray-400">{i + 1}</td>
									<td class="px-4 py-3">
										<span class="rounded px-2 py-0.5 text-xs font-bold {container.container_size === '40' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}">
											{container.container_size}'
										</span>
									</td>
									<td class="px-4 py-3 font-mono font-bold text-gray-800">
										{#if container.container_number}{container.container_number}{:else}<span class="italic text-gray-400">-</span>{/if}
									</td>
									<td class="px-4 py-3 font-mono text-gray-700">
										{#if container.seal_number}{container.seal_number}{:else}<span class="italic text-gray-400">-</span>{/if}
									</td>
									<td class="px-4 py-3 text-gray-600">{container.remarks || ''}</td>
									<td class="px-4 py-3 text-center">
										{#if container.status === 'checked_out'}
											<div class="flex flex-col items-center gap-0.5">
												<span class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
													<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
													ออกแล้ว
												</span>
												{#if container.checkout_date}
													<span class="text-xs text-gray-500">{formatDate(container.checkout_date)}</span>
												{/if}
											</div>
										{:else}
											<span class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
												<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
												รอออกตู้
											</span>
										{/if}
									</td>
									<td class="px-4 py-3 text-center">
										<div class="flex items-center justify-center gap-2">
											{#if container.status === 'pending'}
												<button type="button" onclick={() => openCheckoutModal(container)}
													class="text-gray-400 hover:text-green-600" title="บันทึกวันออกตู้ (เดี่ยว)">
													<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
												</button>
											{:else}
												<form method="POST" action="?/undoCheckoutContainer" use:enhance={() => {
													isSavingContainer = true;
													return async ({ update }) => { await update(); isSavingContainer = false; };
												}}>
													<input type="hidden" name="container_id" value={container.id} />
													<button type="submit" class="text-gray-400 hover:text-amber-600" title="ยกเลิก Checkout">
														<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
													</button>
												</form>
											{/if}
											<button type="button" onclick={() => openContainerEdit(container)} class="text-gray-400 hover:text-blue-600" title={$t('Edit')}>
												<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
											</button>
											<button type="button" onclick={() => (containerDeleteId = container.id)} class="text-gray-400 hover:text-red-600" title={$t('Delete')}>
												<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
											</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<div class="py-16 text-center">
						<svg xmlns="http://www.w3.org/2000/svg" class="mx-auto mb-3 h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
						<p class="text-sm text-gray-400">{$t('No containers recorded')}</p>
						<p class="mt-1 text-xs text-gray-400">กดปุ่ม "เพิ่มตู้" หรือ "นำเข้า Excel" เพื่อเพิ่มข้อมูลตู้</p>
					</div>
				{/if}
			</div>

			<!-- Footer: Bulk Checkout Bar + Close -->
			<div class="flex-shrink-0 border-t bg-gray-50 px-5 py-3">
				{#if selectedContainerIds.size > 0}
					<div class="mb-2 flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-2">
						<span class="text-sm font-semibold text-green-800">
							เลือกแล้ว {selectedContainerIds.size} ตู้
						</span>
						<button type="button" onclick={openBulkCheckout}
							class="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-green-700">
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
							Checkout {selectedContainerIds.size} ตู้พร้อมกัน
						</button>
						<button type="button" onclick={() => (selectedContainerIds = new Set())}
							class="ml-auto text-xs text-gray-500 hover:text-gray-700 underline">ยกเลิกการเลือก</button>
					</div>
				{/if}
				<div class="flex justify-end">
					<button type="button" onclick={() => { isContainerModalOpen = false; selectedContainerIds = new Set(); }}
						class="rounded-lg bg-gray-200 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300">{$t('Close Modal')}</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- ======================== -->
<!-- CONTAINER EDIT MODAL    -->
<!-- ======================== -->
{#if isContainerEditOpen}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
		<div class="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b px-5 py-4">
				<h3 class="font-bold text-gray-800">{$t('Edit Container')}</h3>
				<button onclick={() => (isContainerEditOpen = false)} class="text-gray-400 hover:text-gray-600">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
				</button>
			</div>
			<form method="POST" action="?/updateContainer" use:enhance={() => {
				isSavingContainer = true;
				return async ({ update }) => { await update(); isSavingContainer = false; isContainerEditOpen = false; };
			}}>
				<input type="hidden" name="container_id" value={containerEditData.id} />
				<div class="space-y-4 p-5">
					<div>
						<label class="mb-1 block text-xs font-bold text-gray-500 uppercase">{$t('Container No.')}</label>
						<input type="text" name="container_number" bind:value={containerEditData.container_number}
							placeholder="e.g. ABCU1234567" class="w-full rounded-md border-gray-300 p-2 font-mono text-sm font-bold uppercase focus:border-blue-500 focus:ring-blue-500" />
					</div>
					<div>
						<label class="mb-1 block text-xs font-bold text-gray-500 uppercase">{$t('Seal No.')}</label>
						<input type="text" name="seal_number" bind:value={containerEditData.seal_number}
							placeholder="Seal number" class="w-full rounded-md border-gray-300 p-2 font-mono text-sm focus:border-blue-500 focus:ring-blue-500" />
					</div>
					<div>
						<label class="mb-1 block text-xs font-bold text-gray-500 uppercase">{$t('Remarks')}</label>
						<input type="text" name="remarks" bind:value={containerEditData.remarks}
							placeholder={$t('Remarks')} class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
					</div>
				</div>
				<div class="flex justify-end gap-3 border-t bg-gray-50 px-5 py-3">
					<button type="button" onclick={() => (isContainerEditOpen = false)}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">{$t('Cancel')}</button>
					<button type="submit" disabled={isSavingContainer}
						class="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
						{isSavingContainer ? $t('Saving...') : $t('Save')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ======================== -->
<!-- CONTAINER ADD MODAL     -->
<!-- ======================== -->
{#if isAddContainerOpen}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
		<div class="w-full max-w-xs overflow-hidden rounded-xl bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b px-5 py-4">
				<h3 class="font-bold text-gray-800">{$t('Add Container')}</h3>
				<button onclick={() => (isAddContainerOpen = false)} class="text-gray-400 hover:text-gray-600">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
				</button>
			</div>
			<form method="POST" action="?/addContainer" use:enhance={() => {
				isSavingContainer = true;
				return async ({ update }) => { await update(); isSavingContainer = false; isAddContainerOpen = false; };
			}}>
				<div class="p-5">
					<label class="mb-2 block text-xs font-bold text-gray-500 uppercase">{$t('Container Size')}</label>
					<div class="flex gap-3">
						<button type="button" onclick={() => (newContainerSize = '20')}
							class="flex-1 rounded-lg border-2 py-3 text-sm font-bold transition-colors {newContainerSize === '20' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}">
							20'
						</button>
						<button type="button" onclick={() => (newContainerSize = '40')}
							class="flex-1 rounded-lg border-2 py-3 text-sm font-bold transition-colors {newContainerSize === '40' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}">
							40'
						</button>
					</div>
					<input type="hidden" name="container_size" value={newContainerSize} />
				</div>
				<div class="flex justify-end gap-3 border-t bg-gray-50 px-5 py-3">
					<button type="button" onclick={() => (isAddContainerOpen = false)}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">{$t('Cancel')}</button>
					<button type="submit" disabled={isSavingContainer}
						class="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
						{isSavingContainer ? $t('Saving...') : $t('Add')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ======================== -->
<!-- CONTAINER DELETE CONFIRM -->
<!-- ======================== -->
{#if containerDeleteId !== null}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
		<div class="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl">
			<div class="p-6 text-center">
				<div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
					<svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
				</div>
				<h3 class="mb-1 text-lg font-bold text-gray-900">{$t('Confirm Delete')}</h3>
				<p class="mb-5 text-sm text-gray-500">{$t('Are you sure you want to delete this container?')}</p>
				<div class="flex justify-center gap-3">
					<button type="button" onclick={() => (containerDeleteId = null)}
						class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">{$t('Cancel')}</button>
					<form method="POST" action="?/deleteContainer" use:enhance={() => {
						return async ({ update }) => { await update(); containerDeleteId = null; };
					}} class="w-full">
						<input type="hidden" name="container_id" value={containerDeleteId} />
						<button type="submit" class="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
							{$t('Confirm Delete')}
						</button>
					</form>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- ======================== -->
<!-- CONTAINER CHECKOUT MODAL -->
<!-- ======================== -->
{#if isCheckoutModalOpen}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
		<div class="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b px-5 py-4">
				<div class="flex items-center gap-2">
					<div class="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
						<svg class="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
					</div>
					<h3 class="font-bold text-gray-800">บันทึกวันออกตู้จากท่าเรือ</h3>
				</div>
				<button onclick={() => (isCheckoutModalOpen = false)} class="text-gray-400 hover:text-gray-600">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
				</button>
			</div>
			<form method="POST" action="?/checkoutContainer" use:enhance={() => {
				isSavingCheckout = true;
				return async ({ update }) => { await update(); isSavingCheckout = false; isCheckoutModalOpen = false; };
			}}>
				<input type="hidden" name="container_id" value={checkoutData.id} />
				<div class="space-y-4 p-5">
					<p class="text-sm text-gray-500">ระบุวันที่ตู้ออกจากท่าเรือ (Checkout Date) เพื่อบันทึกและป้องกัน Extra Charge</p>
					<div>
						<label class="mb-1 block text-xs font-bold uppercase text-gray-500">วันที่ออกตู้ <span class="text-red-500">*</span></label>
						<input type="date" name="checkout_date" bind:value={checkoutData.checkout_date}
							required
							class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-green-500 focus:ring-green-500" />
					</div>
					{#if job.eta}
						{@const d = calcDaysSinceEta()}
						{@const hasDays2 = job.demurrage_days != null || job.storage_days != null || job.detention_days != null}
						<div class="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1.5">
							<div>
								<span class="font-semibold">ETA:</span> {formatDate(job.eta)}
								{#if d !== null}
									<span class="ml-2 font-bold {d > 0 ? 'text-red-600' : d === 0 ? 'text-orange-600' : 'text-green-600'}">
										{#if d > 0}{isEn ? `(Overdue ${d}d)` : `(เลยมาแล้ว ${d} วัน)`}
										{:else if d === 0}{$t('Today!')}
										{:else}{isEn ? `(${Math.abs(d)}d remaining)` : `(อีก ${Math.abs(d)} วัน)`}{/if}
									</span>
								{/if}
							</div>
							{#if hasDays2}
								<div class="flex flex-wrap gap-1 pt-0.5">
									{#if job.demurrage_days != null}
										{@const d2 = calcDaysOverdue(job.demurrage_days)}
										{#if d2 != null}
											<span class="rounded px-1.5 py-0.5 font-semibold {d2 > 0 ? 'bg-red-100 text-red-700' : d2 === 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'}">
												{$t('ff.demurrage_short')} {job.demurrage_days}{$t('ff.day_compact')}
												{d2 > 0 ? ` (+${d2})` : d2 === 0 ? ' ✗' : ` (-${Math.abs(d2)})`}
											</span>
										{/if}
									{/if}
									{#if job.storage_days != null}
										{@const d2 = calcDaysOverdue(job.storage_days)}
										{#if d2 != null}
											<span class="rounded px-1.5 py-0.5 font-semibold {d2 > 0 ? 'bg-red-100 text-red-700' : d2 === 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'}">
												{$t('ff.storage_short')} {job.storage_days}{$t('ff.day_compact')}
												{d2 > 0 ? ` (+${d2})` : d2 === 0 ? ' ✗' : ` (-${Math.abs(d2)})`}
											</span>
										{/if}
									{/if}
									{#if job.detention_days != null}
										{@const d2 = calcDaysOverdue(job.detention_days)}
										{#if d2 != null}
											<span class="rounded px-1.5 py-0.5 font-semibold {d2 > 0 ? 'bg-red-100 text-red-700' : d2 === 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'}">
												{$t('ff.detention_short')} {job.detention_days}{$t('ff.day_compact')}
												{d2 > 0 ? ` (+${d2})` : d2 === 0 ? ' ✗' : ` (-${Math.abs(d2)})`}
											</span>
										{/if}
									{/if}
								</div>
							{/if}
						</div>
					{/if}
				</div>
				<div class="flex justify-end gap-3 border-t bg-gray-50 px-5 py-3">
					<button type="button" onclick={() => (isCheckoutModalOpen = false)}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">{$t('Cancel')}</button>
					<button type="submit" disabled={isSavingCheckout}
						class="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
						{isSavingCheckout
							? $t('Saving...')
							: $t('Confirm Checkout')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ============================= -->
<!-- BULK CHECKOUT MODAL          -->
<!-- ============================= -->
{#if isBulkCheckoutOpen}
	<div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
		<div class="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b px-5 py-4">
				<div class="flex items-center gap-2">
					<div class="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
						<svg class="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
					</div>
					<h3 class="font-bold text-gray-800">Checkout {selectedContainerIds.size} ตู้พร้อมกัน</h3>
				</div>
				<button onclick={() => (isBulkCheckoutOpen = false)} class="text-gray-400 hover:text-gray-600">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
				</button>
			</div>
			<form method="POST" action="?/checkoutContainersBulk" use:enhance={() => {
				isSavingBulkCheckout = true;
				return async ({ update }) => {
					await update();
					isSavingBulkCheckout = false;
					isBulkCheckoutOpen = false;
					selectedContainerIds = new Set();
				};
			}}>
				<input type="hidden" name="container_ids" value={JSON.stringify([...selectedContainerIds])} />
				<div class="space-y-4 p-5">
					<div class="rounded-lg bg-green-50 p-3 text-sm text-green-800">
						จะบันทึกวันออกตู้ให้ <strong>{selectedContainerIds.size}</strong> ตู้ที่เลือกทั้งหมดพร้อมกัน
					</div>
					<div>
						<label class="mb-1 block text-xs font-bold uppercase text-gray-500">วันที่ออกตู้ <span class="text-red-500">*</span></label>
						<input type="date" name="checkout_date" bind:value={bulkCheckoutDate}
							required
							class="w-full rounded-md border-gray-300 p-2 text-sm focus:border-green-500 focus:ring-green-500" />
					</div>
					{#if job.eta}
						{@const d = calcDaysSinceEta()}
						{@const hasDays3 = job.demurrage_days != null || job.storage_days != null || job.detention_days != null}
						<div class="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1.5">
							<div>
								<span class="font-semibold">ETA:</span> {formatDate(job.eta)}
								{#if d !== null}
									<span class="ml-2 font-bold {d > 0 ? 'text-red-600' : d === 0 ? 'text-orange-600' : 'text-green-600'}">
										{#if d > 0}{isEn ? `(Overdue ${d}d)` : `(เลยมาแล้ว ${d} วัน)`}
										{:else if d === 0}{$t('Today!')}
										{:else}{isEn ? `(${Math.abs(d)}d remaining)` : `(อีก ${Math.abs(d)} วัน)`}{/if}
									</span>
								{/if}
							</div>
							{#if hasDays3}
								<div class="flex flex-wrap gap-1 pt-0.5">
									{#if job.demurrage_days != null}
										{@const d2 = calcDaysOverdue(job.demurrage_days)}
										{#if d2 != null}
											<span class="rounded px-1.5 py-0.5 font-semibold {d2 > 0 ? 'bg-red-100 text-red-700' : d2 === 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'}">
												{$t('ff.demurrage_short')} {job.demurrage_days}{$t('ff.day_compact')}
												{d2 > 0 ? ` (+${d2})` : d2 === 0 ? ' ✗' : ` (-${Math.abs(d2)})`}
											</span>
										{/if}
									{/if}
									{#if job.storage_days != null}
										{@const d2 = calcDaysOverdue(job.storage_days)}
										{#if d2 != null}
											<span class="rounded px-1.5 py-0.5 font-semibold {d2 > 0 ? 'bg-red-100 text-red-700' : d2 === 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'}">
												{$t('ff.storage_short')} {job.storage_days}{$t('ff.day_compact')}
												{d2 > 0 ? ` (+${d2})` : d2 === 0 ? ' ✗' : ` (-${Math.abs(d2)})`}
											</span>
										{/if}
									{/if}
									{#if job.detention_days != null}
										{@const d2 = calcDaysOverdue(job.detention_days)}
										{#if d2 != null}
											<span class="rounded px-1.5 py-0.5 font-semibold {d2 > 0 ? 'bg-red-100 text-red-700' : d2 === 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'}">
												{$t('ff.detention_short')} {job.detention_days}{$t('ff.day_compact')}
												{d2 > 0 ? ` (+${d2})` : d2 === 0 ? ' ✗' : ` (-${Math.abs(d2)})`}
											</span>
										{/if}
									{/if}
								</div>
							{/if}
						</div>
					{/if}
				</div>
				<div class="flex justify-end gap-3 border-t bg-gray-50 px-5 py-3">
					<button type="button" onclick={() => (isBulkCheckoutOpen = false)}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">{$t('Cancel')}</button>
					<button type="submit" disabled={isSavingBulkCheckout || !bulkCheckoutDate}
						class="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
						{#if isSavingBulkCheckout}
							<svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
							กำลังบันทึก...
						{:else}
							ยืนยัน Checkout {selectedContainerIds.size} ตู้
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ========================== -->
<!-- IMPORT PREVIEW MODAL       -->
<!-- ========================== -->
{#if isImportPreviewOpen}
	<div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
		<div class="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" style="max-height: 90vh">
			<div class="border-b px-6 py-4">
				<h3 class="font-bold text-gray-800">ตรวจสอบข้อมูลก่อน Import</h3>
				<p class="mt-0.5 text-sm text-gray-500">
					พบ <strong>{importPreviewRows.length}</strong> รายการ —
					<span class="text-amber-600 font-medium">ระบบจะลบตู้เดิมทั้งหมดและแทนที่ด้วยข้อมูลนี้</span>
				</p>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto">
				<table class="min-w-full divide-y divide-gray-200 text-sm">
					<thead class="sticky top-0 bg-gray-50 text-xs font-bold text-gray-500 uppercase">
						<tr>
							<th class="px-4 py-2 text-left">#</th>
							<th class="px-4 py-2 text-left">ขนาด</th>
							<th class="px-4 py-2 text-left">เบอร์ตู้</th>
							<th class="px-4 py-2 text-left">เบอร์ซีล</th>
							<th class="px-4 py-2 text-left">หมายเหตุ</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each importPreviewRows as row, i}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-2 text-gray-400">{i + 1}</td>
								<td class="px-4 py-2">
									<span class="rounded px-2 py-0.5 text-xs font-bold {row.container_size === '40' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}">
										{row.container_size}'
									</span>
								</td>
								<td class="px-4 py-2 font-mono font-bold text-gray-800">{row.container_number || '-'}</td>
								<td class="px-4 py-2 font-mono text-gray-700">{row.seal_number || '-'}</td>
								<td class="px-4 py-2 text-gray-600">{row.remarks || ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="flex justify-end gap-3 border-t bg-gray-50 px-6 py-4">
				<button type="button" onclick={() => (isImportPreviewOpen = false)}
					class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">ยกเลิก</button>
				<form method="POST" action="?/importContainers" use:enhance={() => {
					isImportingContainers = true;
					return async ({ update }) => { await update(); isImportingContainers = false; isImportPreviewOpen = false; };
				}}>
					<input type="hidden" name="containers_json" value={JSON.stringify(importPreviewRows)} />
					<button type="submit" disabled={isImportingContainers}
						class="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
						{#if isImportingContainers}
							<svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
							กำลัง Import...
						{:else}
							ยืนยัน Import {importPreviewRows.length} รายการ
						{/if}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- eslint-disable svelte/no-navigation-without-resolve -->

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
