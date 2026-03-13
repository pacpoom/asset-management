<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';
	import type { ActionData, PageData } from './$types';

	let { data, form } = $props<{ data: PageData; form: ActionData }>();

	// ใช้ $derived เพื่อให้ข้อมูลอัปเดตตาม data จาก Server เสมอ
	let job = $derived(data.job);
	let attachments = $derived(data.attachments || []);
	let companyData = $derived(data.company || null);
	
	let expenses = $derived(data.expenses || []);
	let expenseCategories = $derived(data.expenseCategories || []);
	let expenseItems = $derived(data.expenseItems || []);

	// คำนวณยอดเงินรวม (Reactive)
	let totalExpense = $derived(expenses.reduce((sum: number, exp: any) => sum + Number(exp.total_amount), 0));
	let estimatedProfit = $derived(Number(job.amount || 0) - totalExpense);

	// ตัวแปรควบคุม Modal การเพิ่มค่าใช้จ่าย
	let isExpenseModalOpen = $state(false);
	let isSavingExpense = $state(false);
	let expCategoryId = $state('');
	let expItemId = $state('');
	let expRefDoc = $state('');
	let expAmount = $state<number | ''>('');
	let expTaxType = $state('None');
	let expRemarks = $state('');

	// สำหรับ svelte-select ค้นหาหมวดหมู่และรายการ
	let selectedCategory = $state<any>(null);
	let selectedItem = $state<any>(null);

	// กรอง options เพื่อใช้งานร่วมกับ svelte-select
	let categoryOptions = $derived(expenseCategories.map((c: any) => ({
		value: c.id,
		label: c.category_name
	})));

	let filteredItemOptions = $derived(
		expenseItems
			.filter((i: any) => i.expense_category_id == (selectedCategory?.value || ''))
			.map((i: any) => ({
				value: i.id,
				label: i.item_name
			}))
	);

	// ผูกค่า selected จาก svelte-select เข้ากับตัวแปรหลัก
	$effect(() => {
		if (selectedCategory && selectedCategory.value !== expCategoryId) {
			expCategoryId = selectedCategory.value;
			selectedItem = null; // รีเซ็ต Item เมื่อเปลี่ยน Category
			expItemId = '';
		} else if (!selectedCategory) {
			expCategoryId = '';
			selectedItem = null;
			expItemId = '';
		}
	});

	$effect(() => {
		if (selectedItem && selectedItem.value !== expItemId) {
			expItemId = selectedItem.value;
		} else if (!selectedItem) {
			expItemId = '';
		}
	});

	// คำนวณ Total Amount ในฟอร์มแบบ Real-time
	let calculatedExpTotal = $derived.by(() => {
		const amt = Number(expAmount) || 0;
		if (expTaxType === 'VAT 7%') return amt * 1.07;
		if (expTaxType === 'WHT 3%') return amt * 0.97;
		if (expTaxType === 'WHT 1%') return amt * 0.99;
		return amt;
	});

	let isSaving = $state(false);
	let updateStatusForm: HTMLFormElement;
	let statusToUpdate = $state('');

	const formatCurrency = (amount: number | null | undefined) => {
		if (amount === null || amount === undefined) return '-';
		return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
	};

	const formatDate = (dateStr: string | null | undefined) => {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
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

	function openExpenseModal() {
		expCategoryId = ''; expItemId = ''; expRefDoc = ''; 
		expAmount = ''; expTaxType = 'None'; expRemarks = '';
		selectedCategory = null; selectedItem = null;
		isExpenseModalOpen = true;
	}

	const availableStatuses = data.availableStatuses || ['Pending', 'In Progress', 'Completed', 'Cancelled'];
</script>

<svelte:head>
	<title>ใบสั่งงาน {formatJobNumber(job.job_type, job.job_date, job.id)}</title>
</svelte:head>

<form method="POST" action="?/updateStatus" use:enhance={() => async ({ update }) => { await update(); isSaving = false; }} class="hidden" bind:this={updateStatusForm}>
	<input type="hidden" name="status" bind:value={statusToUpdate} />
</form>

<div class="mb-6 flex flex-col items-start justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
	<div class="flex items-center">
		<a href="/freight-forwarder/job-orders" aria-label="ย้อนกลับไปหน้ารายการใบงาน" title="ย้อนกลับ" class="mr-3 text-gray-500 hover:text-gray-800">
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6"><path d="m15 18-6-6 6-6"></path></svg>
		</a>
		<div>
			<h1 class="text-2xl font-bold text-gray-800">ใบสั่งงาน #{formatJobNumber(job.job_type, job.job_date, job.id)}</h1>
			<p class="mt-1 text-sm text-gray-500">Customer: <span class="font-medium text-gray-700">{job.company_name || job.customer_name || '-'}</span> | Ref Invoice: {job.invoice_no || '-'}</p>
		</div>
	</div>

	<div class="flex flex-shrink-0 items-center gap-2">
		<span class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold {getStatusClass(job.job_status)}">{job.job_status}</span>
		<a href="/freight-forwarder/job-orders/generate-pdf?id={job.id}" target="_blank" class="inline-flex items-center justify-center rounded-lg bg-gray-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-600 disabled:opacity-50">พิมพ์ PDF</a>
		<a href="/freight-forwarder/job-orders/{job.id}/edit" class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50">Edit</a>
		<div class="relative">
			<select aria-label="Change Status" onchange={updateStatus} disabled={isSaving} class="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-yellow-600 focus:outline-none disabled:opacity-50 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2">
				<option value="" disabled selected>Change Status</option>
				{#each availableStatuses as status}
					{#if status !== job.job_status}<option value={status} class="bg-white text-gray-800">{status}</option>{/if}
				{/each}
			</select>
		</div>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white shadow-sm">
	<h3 class="mb-3 border-b p-4 pb-2 text-lg font-semibold text-gray-700">รายละเอียดการขนส่ง (Shipment Details)</h3>
	<div class="p-6">
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="space-y-4">
				<div class="flex items-center justify-between border-b border-gray-100 pb-2">
					<span class="text-sm font-medium text-gray-600">Job Type</span>
					<div class="flex items-center gap-2">
						<span class="font-bold text-gray-900">{job.job_type}</span>
						{#if job.service_type}<span class="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700 uppercase">{job.service_type}</span>{/if}
					</div>
				</div>
				<div class="flex items-center justify-between border-b border-gray-100 pb-2"><span class="text-sm font-medium text-gray-600">B/L Number</span><span class="font-mono font-bold text-blue-600">{job.bl_number || '-'}</span></div>
			</div>
			<div class="space-y-4">
				<div class="flex items-center justify-between border-b border-gray-100 pb-2"><span class="text-sm font-medium text-gray-600">Liner / Carrier</span><span class="font-medium text-gray-900">{job.liner_name || '-'}</span></div>
				<div class="flex items-center justify-between border-b border-gray-100 pb-2"><span class="text-sm font-medium text-gray-600">Port / Location</span><span class="font-medium text-gray-900">{job.location || '-'}</span></div>
			</div>
		</div>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white shadow-sm overflow-hidden">
	<div class="flex justify-between items-center border-b p-4 bg-gray-50">
		<h2 class="text-lg font-semibold text-gray-700">ต้นทุนและค่าใช้จ่าย (Job Expenses)</h2>
		<button onclick={openExpenseModal} class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm transition-colors">+ เพิ่มค่าใช้จ่าย</button>
	</div>

	{#if form?.message && form?.action?.includes('Expense')}
		<div class="p-4 bg-red-50 text-red-600 text-sm border-b">{form.message}</div>
	{/if}

	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200">
			<thead class="bg-white text-xs text-gray-500 uppercase">
				<tr>
					<th class="px-6 py-3 text-left font-semibold">Category / Item</th>
					<th class="px-6 py-3 text-left font-semibold">Ref. Doc</th>
					<th class="px-6 py-3 text-right font-semibold">Amount</th>
					<th class="px-6 py-3 text-center font-semibold">Tax</th>
					<th class="px-6 py-3 text-right font-semibold">Total Amount</th>
					<th class="px-6 py-3 text-center font-semibold">Action</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-100 bg-white text-sm">
				{#each expenses as exp}
					<tr class="hover:bg-gray-50">
						<td class="px-6 py-3">
							<div class="font-bold text-gray-900">{exp.item_name}</div>
							<div class="text-xs text-gray-500">{exp.category_name}</div>
						</td>
						<td class="px-6 py-3 text-gray-600">{exp.ref_document || '-'}</td>
						<td class="px-6 py-3 text-right font-mono text-gray-700">{formatCurrency(exp.amount)}</td>
						<td class="px-6 py-3 text-center">
							<span class="px-2 py-0.5 rounded text-xs {exp.tax_type === 'None' ? 'bg-gray-100 text-gray-600' : 'bg-purple-100 text-purple-700 font-bold'}">{exp.tax_type}</span>
						</td>
						<td class="px-6 py-3 text-right font-mono font-bold text-red-600">{formatCurrency(exp.total_amount)}</td>
						<td class="px-6 py-3 text-center">
							<form method="POST" action="?/deleteExpense" use:enhance onsubmit={(e) => { if(!confirm('ยืนยันการลบค่าใช้จ่ายนี้?')) e.preventDefault(); }}>
								<input type="hidden" name="expense_id" value={exp.id}>
								<button type="submit" class="text-red-500 hover:text-red-700 text-xs font-semibold p-1 rounded hover:bg-red-50 transition-colors">ลบ</button>
							</form>
						</td>
					</tr>
				{:else}
					<tr><td colspan="6" class="px-6 py-8 text-center text-gray-400">ยังไม่มีการบันทึกค่าใช้จ่าย</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<div class="mb-6 rounded-lg border bg-white p-6 shadow-sm">
	<h2 class="border-b pb-2 text-lg font-semibold text-gray-700 mb-4">สรุปการเงิน (Financial Summary)</h2>
	<div class="flex justify-end w-full">
		<div class="w-full max-w-sm space-y-3">
			<div class="flex justify-between items-center text-gray-600">
				<span class="font-medium">รายได้ (Revenue):</span>
				<span class="font-mono text-lg font-bold">{formatCurrency(job.amount)}</span>
			</div>
			<div class="flex justify-between items-center text-red-600">
				<span class="font-medium">ต้นทุน (Total Expense):</span>
				<span class="font-mono text-lg font-bold">- {formatCurrency(totalExpense)}</span>
			</div>
			<div class="flex justify-between items-center border-t-2 border-gray-800 pt-3">
				<span class="text-base font-bold text-gray-900">กำไรประเมิน (Est. Profit):</span>
				<span class="font-mono text-2xl font-bold {estimatedProfit >= 0 ? 'text-green-600' : 'text-red-600'}">
					{formatCurrency(estimatedProfit)}
				</span>
			</div>
		</div>
	</div>
</div>

{#if isExpenseModalOpen}
<!-- ขยาย Modal ด้วย max-w-2xl -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity">
	<div class="w-full max-w-2xl rounded-xl bg-white shadow-2xl overflow-hidden">
		<div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
			<h3 class="font-bold text-gray-800 text-lg">บันทึกค่าใช้จ่าย (Add Expense)</h3>
			<button type="button" onclick={() => isExpenseModalOpen = false} class="text-gray-400 hover:text-gray-600" aria-label="Close modal">✕</button>
		</div>

		<form method="POST" action="?/addExpense" use:enhance={() => {
			isSavingExpense = true;
			return async ({ update, result }) => {
				await update();
				isSavingExpense = false;
				if(result.type === 'success') isExpenseModalOpen = false;
			};
		}}>
			<div class="p-6 space-y-5">
				<div class="grid grid-cols-2 gap-5">
					<div>
						<label for="exp_category" class="block text-sm font-semibold text-gray-700 mb-1.5">Category <span class="text-red-500">*</span></label>
						<!-- เปลี่ยนเป็น svelte-select -->
						<Select 
							items={categoryOptions}
							bind:value={selectedCategory}
							placeholder="ค้นหาหมวดหมู่..."
							container={browser ? document.body : null}
							class="svelte-select-custom"
						/>
					</div>
					<div>
						<label for="expense_item_id" class="block text-sm font-semibold text-gray-700 mb-1.5">Item <span class="text-red-500">*</span></label>
						<!-- เปลี่ยนเป็น svelte-select -->
						<Select 
							items={filteredItemOptions}
							bind:value={selectedItem}
							placeholder="ค้นหารายการ..."
							disabled={!selectedCategory}
							container={browser ? document.body : null}
							class="svelte-select-custom"
						/>
						<!-- ส่งค่าตัวแปรเพื่อบันทึกลงฐานข้อมูล -->
						<input type="hidden" name="expense_item_id" value={expItemId} required />
					</div>
				</div>

				<div>
					<label for="ref_document" class="block text-sm font-semibold text-gray-700 mb-1.5">Ref Document (เลขใบเสร็จ/ใบแจ้งหนี้)</label>
					<input id="ref_document" type="text" name="ref_document" bind:value={expRefDoc} class="w-full rounded-md border-gray-300 py-2 focus:border-blue-500 focus:ring-blue-500" placeholder="เช่น INV-2026-001">
				</div>

				<div class="grid grid-cols-2 gap-5">
					<div>
						<label for="amount" class="block text-sm font-semibold text-gray-700 mb-1.5">Amount (ยอดก่อนภาษี) <span class="text-red-500">*</span></label>
						<input id="amount" type="number" step="0.01" name="amount" bind:value={expAmount} required class="w-full rounded-md border-gray-300 py-2 text-right focus:border-blue-500 focus:ring-blue-500" placeholder="0.00">
					</div>
					<div>
						<label for="tax_type" class="block text-sm font-semibold text-gray-700 mb-1.5">Tax Type</label>
						<select id="tax_type" name="tax_type" bind:value={expTaxType} class="w-full rounded-md border-gray-300 py-2 focus:border-blue-500 focus:ring-blue-500">
							<option value="None">ไม่มี (None)</option>
							<option value="VAT 7%">VAT 7% (+)</option>
							<option value="WHT 3%">WHT 3% (-)</option>
							<option value="WHT 1%">WHT 1% (-)</option>
						</select>
					</div>
				</div>

				<div class="bg-blue-50/50 p-4 rounded-lg flex justify-between items-center border border-blue-100 mt-2">
					<span class="text-sm font-semibold text-gray-700">Total Amount (ยอดสุทธิ):</span>
					<span class="text-xl font-bold text-red-600">{formatCurrency(calculatedExpTotal)}</span>
				</div>

				<div>
					<label for="remarks" class="block text-sm font-semibold text-gray-700 mb-1.5">Remarks</label>
					<textarea id="remarks" name="remarks" bind:value={expRemarks} rows="2" class="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" placeholder="คำอธิบายเพิ่มเติม..."></textarea>
				</div>
			</div>

			<div class="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3 rounded-b-xl">
				<button type="button" onclick={() => isExpenseModalOpen = false} class="px-5 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors">ยกเลิก</button>
				<button type="submit" disabled={isSavingExpense || !expItemId || !expAmount} class="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
					{isSavingExpense ? 'กำลังบันทึก...' : 'บันทึกค่าใช้จ่าย'}
				</button>
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