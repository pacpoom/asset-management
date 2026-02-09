<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll, goto } from '$app/navigation';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	// --- Types ---
	type Customer = PageData['customers'][0];
	type CustomerDocument = Customer['documents'][0];
	type User = PageData['users'][0]; // [FIX] เพิ่ม Type สำหรับ User
	type CustomerNote = {
		id: number;
		customer_id: number;
		note: string;
		user_id: number;
		user_full_name: string;
		created_at: string;
	};

	// --- Props & State ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();
	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedCustomer = $state<Partial<Customer> | null>(null);
	let customerToDelete = $state<Customer | null>(null);
	let isSavingCustomer = $state(false);

	let searchQuery = $state(data.searchQuery ?? '');
	let searchTimeout: NodeJS.Timeout;
	let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(
		null
	);
	let messageTimeout: NodeJS.Timeout;

	let notesForSelectedCustomer = $state<CustomerNote[]>([]);
	let newNote = $state('');
	let isAddingNote = $state(false);
	let documentsForSelectedCustomer = $state<CustomerDocument[]>([]);
	let isUploadingDocument = $state(false);
	let uploadError = $state<string | null>(null);
	let documentToDelete = $state<CustomerDocument | null>(null);
	let isDeletingDocument = $state(false);
	let fileInputRef: HTMLInputElement | null = $state(null);
	let isFileSelected = $state(false);
	let selectedFileName = $state('');

	const userOptions = data.users.map((u: User) => ({
		value: u.id,
		label: `${u.full_name} (${u.email})`,
		user: u
	}));

	let selectedUserObject = $state<any>(null);

	function handleUserChange(event: any) {
		const selected = event?.detail || null;
		selectedUserObject = selected;
		if (selectedCustomer) {
			selectedCustomer.assigned_to_user_id = selected ? selected.value : null;
		}
	}

	// --- Functions ค้นหา ---
	function handleSearch() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => applyFilters(), 500);
	}

	function applyFilters() {
		const params = new URLSearchParams(location.search);
		params.set('page', '1');
		if (searchQuery) {
			params.set('search', searchQuery);
		} else {
			params.delete('search');
		}
		goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	function getPageUrl(pageNum: number) {
		const params = new URLSearchParams(location.search);
		params.set('page', pageNum.toString());
		return `/customers?${params.toString()}`;
	}

	// --- Functions Modal ---
	function openModal(mode: 'add' | 'edit', customer: Customer | null = null) {
		modalMode = mode;
		globalMessage = null;
		uploadError = null;
		notesForSelectedCustomer = [];
		documentsForSelectedCustomer = [];
		newNote = '';
		if (fileInputRef) {
			fileInputRef.value = '';
			isFileSelected = false;
			selectedFileName = '';
		}

		if (mode === 'edit' && customer) {
			selectedCustomer = { ...customer };
			documentsForSelectedCustomer = (customer as any).documents
				? [...(customer as any).documents]
				: [];

			// [FIX] ระบุ Type ให้ 'opt' เพื่อแก้ปัญหา Implicit any
			const foundUser = userOptions.find(
				(opt: { value: number | null }) => opt.value === customer.assigned_to_user_id
			);
			selectedUserObject = foundUser || null;
		} else {
			selectedCustomer = {
				name: '',
				company_name: null,
				assigned_to_user_id: null
			} as unknown as Partial<Customer>;
			selectedUserObject = null;
		}
	}

	function closeModal() {
		modalMode = null;
		selectedCustomer = null;
		selectedUserObject = null;
	}

	function showGlobalMessage(
		message: { success: boolean; text: string; type: 'success' | 'error' },
		duration: number = 5000
	) {
		clearTimeout(messageTimeout);
		globalMessage = message;
		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, duration);
	}

	function formatDateTime(isoString: string | Date | null | undefined): string {
		if (!isoString) return 'N/A';
		try {
			return new Date(isoString).toLocaleString('th-TH', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				hour12: false
			});
		} catch (e) {
			return 'Invalid Date';
		}
	}

	function getFileIcon(fileName: string): string {
		const ext = fileName?.split('.').pop()?.toLowerCase() || '';
		if (['pdf'].includes(ext)) return '📄';
		if (['doc', 'docx'].includes(ext)) return '📝';
		if (['xls', 'xlsx'].includes(ext)) return '📊';
		if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
		return '📎';
	}

	function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			isFileSelected = true;
			selectedFileName = input.files[0].name;
		} else {
			isFileSelected = false;
			selectedFileName = '';
		}
	}

	$effect.pre(() => {
		if (form?.action === 'saveCustomer') {
			if (form.success) {
				closeModal();
				invalidateAll();
			}
			form.action = undefined;
		}
	});

	// Pagination Logic
	const paginationRange = $derived.by(() => {
		const delta = 1;
		const left = data.currentPage - delta;
		const right = data.currentPage + delta + 1;
		const range: number[] = [];
		const rangeWithDots: (number | string)[] = [];
		let l: number | undefined;
		for (let i = 1; i <= data.totalPages; i++) {
			if (i == 1 || i == data.totalPages || (i >= left && i < right)) range.push(i);
		}
		for (const i of range) {
			if (l) {
				if (i - l === 2) rangeWithDots.push(l + 1);
				else if (i - l !== 1) rangeWithDots.push('...');
			}
			rangeWithDots.push(i);
			l = i;
		}
		return rangeWithDots;
	});
</script>

<svelte:head>
	<title>Customer Management</title>
</svelte:head>

{#if globalMessage}
	<div
		transition:fade
		class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 text-sm font-semibold shadow-xl {globalMessage.type ===
		'success'
			? 'bg-green-100 text-green-800'
			: 'bg-red-100 text-red-800'}"
	>
		{globalMessage.text}
	</div>
{/if}

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">Customer Management</h1>
		<p class="mt-1 text-sm text-gray-500">จัดการข้อมูลลูกค้า</p>
	</div>
	<button
		onclick={() => openModal('add')}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			class="h-4 w-4"
			><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg
		>
		เพิ่มลูกค้าใหม่
	</button>
</div>

<div class="mb-4">
	<div class="relative w-full md:w-1/3">
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<svg
				class="h-4 w-4 text-gray-400"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				><path
					fill-rule="evenodd"
					d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
					clip-rule="evenodd"
				/></svg
			>
		</div>
		<input
			type="search"
			bind:value={searchQuery}
			oninput={handleSearch}
			placeholder="ค้นหาชื่อลูกค้า, ชื่อบริษัท, โทรศัพท์..."
			class="w-full rounded-lg border-gray-300 py-2 pr-4 pl-10 text-sm focus:border-blue-500 focus:ring-blue-500"
		/>
	</div>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">ชื่อลูกค้า</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">ชื่อบริษัท</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">อีเมล</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">โทรศัพท์</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">เลขประจำตัวผู้เสียภาษี</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">ผู้ดูแล</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.customers.length === 0}
				<tr
					><td colspan="7" class="py-12 text-center text-gray-500"
						>{#if searchQuery}ไม่พบลูกค้าที่ค้นหา: "{searchQuery}"{:else}ไม่พบข้อมูลลูกค้า{/if}</td
					></tr
				>
			{:else}
				{#each data.customers as customer (customer.id)}
					<tr class="transition-colors hover:bg-gray-50">
						<td class="px-4 py-3 font-medium text-gray-900">{customer.name}</td>
						<td class="px-4 py-3 text-gray-600">{customer.company_name ?? 'N/A'}</td>
						<td class="px-4 py-3 text-gray-600">{customer.email ?? 'N/A'}</td>
						<td class="px-4 py-3 text-gray-600">{customer.phone ?? 'N/A'}</td>
						<td class="px-4 py-3 text-gray-600">{customer.tax_id ?? 'N/A'}</td>
						<td class="px-4 py-3 text-gray-600">{customer.assigned_user_name ?? 'N/A'}</td>
						<td class="px-4 py-3">
							<div class="flex items-center gap-2">
								<button
									onclick={() => openModal('edit', customer)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
									aria-label="แก้ไขข้อมูลลูกค้า"
									><svg
										xmlns="http://www.w3.org/2000/svg"
										width="24"
										height="24"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										class="h-4 w-4"
										><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
									></button
								>
								<button
									onclick={() => (customerToDelete = customer)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
									aria-label="ลบข้อมูลลูกค้า"
									><svg
										xmlns="http://www.w3.org/2000/svg"
										width="24"
										height="24"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										class="h-4 w-4"
										><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg
									></button
								>
							</div>
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

{#if data.totalPages > 1}
	<div class="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
		<p class="text-sm text-gray-700">
			แสดงหน้า <span class="font-medium">{data.currentPage}</span> จาก
			<span class="font-medium">{data.totalPages}</span>
		</p>
		<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm">
			<a
				href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'}
				class="px-2 py-2 text-gray-400 ring-1 ring-gray-300 hover:bg-gray-50 {data.currentPage === 1
					? 'pointer-events-none opacity-50'
					: ''}"
				aria-label="หน้าก่อนหน้า"
				><svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"
					><path
						fill-rule="evenodd"
						d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
						clip-rule="evenodd"
					/></svg
				></a
			>
			{#each paginationRange as pageNum}
				{#if typeof pageNum === 'string'}<span class="px-4 py-2 ring-1 ring-gray-300">...</span>
				{:else}<a
						href={getPageUrl(pageNum)}
						class="px-4 py-2 text-sm font-semibold {pageNum === data.currentPage
							? 'bg-blue-600 text-white'
							: 'text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50'}">{pageNum}</a
					>{/if}
			{/each}
			<a
				href={data.currentPage < data.totalPages ? getPageUrl(data.currentPage + 1) : '#'}
				class="px-2 py-2 text-gray-400 ring-1 ring-gray-300 hover:bg-gray-50 {data.currentPage ===
				data.totalPages
					? 'pointer-events-none opacity-50'
					: ''}"
				aria-label="หน้าถัดไป"
				><svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"
					><path
						fill-rule="evenodd"
						d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 01-1.06-.02z"
						clip-rule="evenodd"
					/></svg
				></a
			>
		</nav>
	</div>
{/if}

{#if modalMode && selectedCustomer}
	<div transition:fade class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>

		<div
			class="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl transition-all"
		>
			<div class="flex-shrink-0 border-b bg-white px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? 'เพิ่มลูกค้าใหม่' : 'แก้ไขข้อมูลลูกค้า'}
				</h2>
			</div>

			<div class="flex-1 space-y-8 overflow-y-auto p-6">
				<form
					method="POST"
					action="?/saveCustomer"
					id="saveCustomerForm"
					use:enhance={() => {
						isSavingCustomer = true;
						return async ({ update }) => {
							await update();
							isSavingCustomer = false;
						};
					}}
					class="space-y-4"
				>
					{#if modalMode === 'edit'}<input
							type="hidden"
							name="id"
							value={selectedCustomer.id}
						/>{/if}
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<label for="name" class="mb-1 block text-sm font-medium"
								>ชื่อลูกค้า (ผู้ติดต่อ) *</label
							><input
								type="text"
								name="name"
								id="name"
								required
								bind:value={selectedCustomer.name}
								class="w-full rounded-md border-gray-300"
							/>
						</div>
						<div>
							<label for="company_name" class="mb-1 block text-sm font-medium">ชื่อบริษัท</label
							><input
								type="text"
								name="company_name"
								id="company_name"
								bind:value={selectedCustomer.company_name}
								class="w-full rounded-md border-gray-300"
							/>
						</div>
					</div>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<label for="email" class="mb-1 block text-sm font-medium">อีเมล</label><input
								type="email"
								name="email"
								id="email"
								bind:value={selectedCustomer.email}
								class="w-full rounded-md border-gray-300"
							/>
						</div>
						<div>
							<label for="phone" class="mb-1 block text-sm font-medium">โทรศัพท์</label><input
								type="tel"
								name="phone"
								id="phone"
								bind:value={selectedCustomer.phone}
								class="w-full rounded-md border-gray-300"
							/>
						</div>
					</div>
					<div>
						<label for="tax_id" class="mb-1 block text-sm font-medium">เลขประจำตัวผู้เสียภาษี</label
						><input
							type="text"
							name="tax_id"
							id="tax_id"
							bind:value={selectedCustomer.tax_id}
							class="w-full rounded-md border-gray-300"
						/>
					</div>
					<div>
						<label for="address" class="mb-1 block text-sm font-medium text-gray-700">ที่อยู่</label
						><textarea
							name="address"
							id="address"
							rows="3"
							bind:value={selectedCustomer.address}
							class="w-full rounded-md border-gray-300"
						></textarea>
					</div>

					<div>
						<label for="assigned_to_user_id" class="mb-1 block text-sm font-medium text-gray-700"
							>ผู้ดูแล</label
						>
						<input
							type="hidden"
							name="assigned_to_user_id"
							value={selectedCustomer.assigned_to_user_id}
						/>
						<Select
							id="assigned_to_user_id"
							items={userOptions}
							value={selectedUserObject}
							on:change={handleUserChange}
							on:clear={() => handleUserChange(null)}
							placeholder="-- ค้นหา/เลือกผู้ดูแล --"
							floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
							container={browser ? document.body : null}
							--inputStyles="padding: 2px 0; font-size: 0.875rem;"
							--list="border-radius: 6px; font-size: 0.875rem;"
							--itemIsActive="background: #e0f2fe;"
						/>
					</div>

					<div>
						<label for="notes" class="mb-1 block text-sm font-medium text-gray-700"
							>บันทึกเพิ่มเติม (ลูกค้า)</label
						><textarea
							name="notes"
							id="notes"
							rows="3"
							bind:value={selectedCustomer.notes}
							class="w-full rounded-md border-gray-300"
						></textarea>
					</div>
					{#if form?.message && !form.success && form.action === 'saveCustomer'}<div
							class="rounded-md bg-red-50 p-3 text-sm text-red-600"
						>
							<strong>Error:</strong>
							{form.message}
						</div>{/if}
				</form>

				{#if modalMode === 'edit' && selectedCustomer.id}
					<hr class="border-gray-200" />
					<div class="space-y-4">
						<h3 class="text-md font-bold text-gray-800">เอกสารแนบ</h3>
						<form
							method="POST"
							action="?/uploadDocument"
							enctype="multipart/form-data"
							use:enhance={() => {
								isUploadingDocument = true;
								return async ({ update, result }) => {
									await update();
									isUploadingDocument = false;

									if (result.type === 'success') {
										// 1. ล้างค่า Input และตัวแปร State
										if (fileInputRef) {
											fileInputRef.value = '';
										}
										isFileSelected = false;
										selectedFileName = '';

										// 2. [เพิ่มใหม่] อัปเดตรายการไฟล์บนหน้าจอทันที
										const actionResult = result.data as any;
										if (actionResult.newDocument) {
											documentsForSelectedCustomer = [
												actionResult.newDocument,
												...documentsForSelectedCustomer
											];
										}

										// 3. แสดงข้อความแจ้งเตือนความสำเร็จ
										showGlobalMessage({
											success: true,
											text: 'อัปโหลดเอกสารเรียบร้อยแล้ว',
											type: 'success'
										});
									} else if (result.type === 'failure') {
										// จัดการกรณี Error (ถ้ามี)
										showGlobalMessage({
											success: false,
											text: (result.data?.message as string) ?? 'เกิดข้อผิดพลาดในการอัปโหลด',
											type: 'error'
										});
									}
								};
							}}
							class="rounded-lg border-2 {isFileSelected
								? 'border-green-500 bg-green-50'
								: 'border-dashed border-gray-300'} p-4 text-center"
						>
							<input type="hidden" name="customer_id" value={selectedCustomer.id} /><input
								type="file"
								name="document"
								id="document_upload"
								required
								onchange={handleFileChange}
								class="sr-only"
								bind:this={fileInputRef}
							/>
							<label for="document_upload" class="flex cursor-pointer flex-col items-center py-2">
								<span
									class="text-sm {isFileSelected ? 'font-bold text-green-700' : 'text-gray-600'}"
									>{#if isFileSelected}ไฟล์: {selectedFileName}{:else}คลิกเพื่อเลือกไฟล์ หรือ
										ลากมาวาง{/if}</span
								>
							</label>
							<button
								type="submit"
								disabled={isUploadingDocument || !isFileSelected}
								class="mt-4 w-full rounded bg-green-600 px-4 py-2 text-sm text-white shadow hover:bg-green-700 disabled:opacity-50"
								>{isUploadingDocument ? 'กำลังอัปโหลด...' : 'อัปโหลดเอกสาร'}</button
							>
						</form>
						<ul class="divide-y rounded-lg border bg-gray-50">
							{#if documentsForSelectedCustomer.length === 0}
								<li class="p-4 text-center text-sm text-gray-500 italic">ไม่มีเอกสารแนบ</li>
							{:else}
								{#each documentsForSelectedCustomer as doc (doc.id)}
									<li class="flex items-center justify-between p-3">
										<div class="flex items-center gap-2 overflow-hidden">
											<span class="text-lg">{getFileIcon(doc.file_name)}</span><a
												href={doc.file_path}
												target="_blank"
												class="truncate text-sm text-blue-600 hover:underline">{doc.file_name}</a
											>
										</div>
										<button
											onclick={() => (documentToDelete = doc)}
											class="text-gray-400 hover:text-red-600"
											aria-label="ลบเอกสาร"
											><svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												><path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
												/></svg
											></button
										>
									</li>
								{/each}
							{/if}
						</ul>
					</div>
					<hr class="border-gray-200" />
					<div class="space-y-4">
						<h3 class="text-md font-bold text-gray-800">บันทึก (Notes)</h3>
						<form
							method="POST"
							action="?/addNote"
							use:enhance={() => {
								isAddingNote = true;
								return async ({ update }) => {
									await update();
									isAddingNote = false;
								};
							}}
							class="space-y-2"
						>
							<input type="hidden" name="customer_id" value={selectedCustomer.id} /><textarea
								name="note"
								rows="2"
								placeholder="เพิ่มบันทึก..."
								required
								bind:value={newNote}
								class="w-full rounded-md border-gray-300 text-sm"
							></textarea>
							<div class="flex justify-end">
								<button
									type="submit"
									disabled={isAddingNote || !newNote.trim()}
									class="rounded bg-indigo-600 px-4 py-1.5 text-xs text-white shadow hover:bg-indigo-700 disabled:opacity-50"
									>เพิ่มบันทึก</button
								>
							</div>
						</form>
						<div class="space-y-3">
							{#if notesForSelectedCustomer.length === 0}
								<p class="py-4 text-center text-sm text-gray-500 italic">ยังไม่มีบันทึก</p>
							{:else}
								{#each notesForSelectedCustomer as note (note.id)}
									<div class="rounded-lg border bg-gray-50 p-4 text-sm">
										<p class="whitespace-pre-wrap">{note.note}</p>
										<div
											class="mt-2 flex justify-between text-[10px] font-bold text-gray-500 uppercase"
										>
											<span>{note.user_full_name} • {formatDateTime(note.created_at)}</span>
											<form method="POST" action="?/deleteNote" use:enhance>
												<input type="hidden" name="note_id" value={note.id} /><input
													type="hidden"
													name="customer_id"
													value={selectedCustomer.id}
												/><button
													type="submit"
													class="text-red-500 transition-colors hover:text-red-700">Delete</button
												>
											</form>
										</div>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<div class="flex flex-shrink-0 justify-end gap-3 border-t bg-gray-50 px-6 py-4">
				<button
					type="button"
					onclick={closeModal}
					class="rounded border bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
					>Cancel</button
				>
				<button
					type="submit"
					form="saveCustomerForm"
					disabled={isSavingCustomer}
					class="rounded bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-md hover:bg-blue-700 disabled:bg-blue-300"
					>{#if isSavingCustomer}Saving...{:else}Save Customer{/if}</button
				>
			</div>
		</div>
	</div>
{/if}

{#if customerToDelete}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl transition-all">
			<h3 class="text-lg font-bold text-gray-900">ยืนยันการลบลูกค้า</h3>
			<p class="mt-2 text-sm text-gray-600">
				คุณแน่ใจหรือไม่ที่จะลบลูกค้า "<strong>{customerToDelete.name}</strong>"?
				การดำเนินการนี้จะลบข้อมูลลูกค้า, บันทึก, และเอกสารแนบทั้งหมด ไม่สามารถย้อนกลับได้
			</p>
			<form
				method="POST"
				action="?/deleteCustomer"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						customerToDelete = null;
					};
				}}
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="id" value={customerToDelete.id} />
				<button
					type="button"
					onclick={() => (customerToDelete = null)}
					class="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50">ยกเลิก</button
				>
				<button
					type="submit"
					class="rounded bg-red-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-red-700"
					>ลบข้อมูล</button
				>
			</form>
		</div>
	</div>
{/if}

{#if documentToDelete}
	<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
		<div class="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl transition-all">
			<h3 class="text-lg font-bold text-gray-900">ยืนยันการลบเอกสาร</h3>
			<p class="mt-2 text-sm text-gray-600">
				คุณแน่ใจหรือไม่ที่จะลบไฟล์ "<strong>{documentToDelete.file_name}</strong>"?
				การดำเนินการนี้ไม่สามารถย้อนกลับได้
			</p>
			<form
				method="POST"
				action="?/deleteDocument"
				use:enhance={() => {
					isDeletingDocument = true;
					return async ({ result, update }) => {
						// [1] เพิ่ม update เข้ามา
						isDeletingDocument = false;

						const actionResult = result as any;
						if (actionResult.type === 'success') {
							// ลบ Logic การ filter array แบบ manual ออก หรือเก็บไว้ก็ได้ แต่สำคัญที่สุดคือต้องเรียก update()

							// [2] บังคับให้โหลดข้อมูลใหม่จาก Server เพื่อให้ data.customers เป็นปัจจุบัน
							await update();

							// ถ้าอยากให้ UI ใน Modal อัปเดตทันที (เผื่อ update ทำงานช้า)
							// สามารถคง code filter ไว้ได้ แต่จริงๆ update() ก็เพียงพอแล้ว
							if (documentToDelete) {
								const idToDelete = documentToDelete.id;
								documentsForSelectedCustomer = documentsForSelectedCustomer.filter(
									(d) => d.id !== idToDelete
								);
							}

							documentToDelete = null;
						} else if (actionResult.type === 'failure') {
							showGlobalMessage({
								success: false,
								text: (actionResult.data?.message as string) ?? 'Error',
								type: 'error'
							});
						}
					};
				}}
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="document_id" value={documentToDelete.id} />
				<button
					type="button"
					onclick={() => (documentToDelete = null)}
					class="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
					disabled={isDeletingDocument}>ยกเลิก</button
				>
				<button
					type="submit"
					class="rounded bg-red-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-red-700 disabled:opacity-50"
					disabled={isDeletingDocument}
				>
					{#if isDeletingDocument}กำลังลบ...{:else}ลบไฟล์{/if}
				</button>
			</form>
		</div>
	</div>
{/if}

<style>
	:global(div.svelte-select) {
		min-height: 38px;
		border: 1px solid #d1d5db !important;
		border-radius: 0.375rem !important;
	}
	:global(div.svelte-select .input) {
		font-size: 0.875rem;
	}
	:global(div.svelte-select .list) {
		border-radius: 0.375rem;
		border-color: #d1d5db;
		z-index: 9999 !important;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}
</style>
