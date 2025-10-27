<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation'; // For refreshing data

	// --- Types ---
	type Vendor = PageData['vendors'][0];
    type VendorDocument = Vendor['documents'][0];
    type VendorNote = { // Define Note type if not already globally available
        id: number;
        vendor_id: number;
        note: string;
        user_id: number;
        user_full_name: string;
        created_at: string;
    };


	// --- Props & State ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedVendor = $state<Partial<Vendor> & { notes?: VendorNote[] } | null>(null);
	let vendorToDelete = $state<Vendor | null>(null);
    let isSavingVendor = $state(false);
	let searchQuery = $state(data.searchQuery ?? '');
    let globalMessage = $state<{ success: boolean, text: string, type: 'success' | 'error' } | null>(null);
    let messageTimeout: NodeJS.Timeout;

    // --- State for Notes in Modal ---
    let notesForSelectedVendor = $state<VendorNote[]>([]); 
    let isNotesLoading = $state(false);
    let newNote = $state('');
    let isAddingNote = $state(false);

    // --- State for Documents in Modal ---
    let documentsForSelectedVendor = $state<VendorDocument[]>([]);
    let isUploadingDocument = $state(false);
    let uploadError = $state<string | null>(null);
    let documentToDelete = $state<VendorDocument | null>(null);
    let isDeletingDocument = $state(false);

    let fileInputRef: HTMLInputElement | null = $state(null);
	let isFileSelected = $state(false);


	// --- Functions ---
	function openModal(mode: 'add' | 'edit', vendor: Vendor | null = null) {
		modalMode = mode;
        globalMessage = null;
        uploadError = null;
        notesForSelectedVendor = [];
        documentsForSelectedVendor = [];
        newNote = '';
        if (fileInputRef) {
            fileInputRef.value = '';
            isFileSelected = false;
        }

		if (mode === 'edit' && vendor) {
			selectedVendor = { ...vendor };
            documentsForSelectedVendor = vendor.documents ? [...vendor.documents] : [];
		} else {
			selectedVendor = { name: '', company_name: null, assigned_to_user_id: undefined }; // Defaults
		}
	}

	function closeModal() {
		modalMode = null;
		selectedVendor = null;
        notesForSelectedVendor = [];
        documentsForSelectedVendor = [];
        uploadError = null;
        newNote = '';
        isFileSelected = false;
	}

    function showGlobalMessage(message: { success: boolean, text: string, type: 'success' | 'error' }, duration: number = 5000) {
        clearTimeout(messageTimeout);
        globalMessage = message;
        messageTimeout = setTimeout(() => { globalMessage = null; }, duration);
    }

    function formatDateTime(isoString: string | Date | null | undefined): string {
		if (!isoString) return 'N/A';
		try {
            return new Date(isoString).toLocaleString('th-TH', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false
            });
        } catch (e) {
            console.warn("Invalid date string:", isoString);
            return "Invalid Date";
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
        isFileSelected = (input.files?.length ?? 0) > 0;
        uploadError = null;
    }


	// --- Reactive Effects ---
	$effect.pre(() => {
        // Handle saveVendor results
        if (form?.action === 'saveVendor') { // <-- ACTION
            if (form.success) {
                closeModal();
                showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
                invalidateAll();
            } else if (form.message) {
                 showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
            }
             form.action = undefined;
        }

        // Handle addNote results
        if (form?.action === 'addNote' && modalMode === 'edit' && selectedVendor?.id === form.newNote?.vendor_id) { // <-- FIELD
            if (form.success && form.newNote) {
                 notesForSelectedVendor = [...notesForSelectedVendor, form.newNote as VendorNote].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                 newNote = '';
            } else if (form.message) {
                 console.error("Add note failed:", form.message);
            }
             form.action = undefined;
        }

         // Handle deleteNote results
        if (form?.action === 'deleteNote' && modalMode === 'edit') {
             if (form.success && form.deletedNoteId) {
                if (notesForSelectedVendor.some(n => n.id === form.deletedNoteId)) {
                    notesForSelectedVendor = notesForSelectedVendor.filter(n => n.id !== form.deletedNoteId);
                }
            } else if (form.message) {
                 console.error("Delete note failed:", form.message);
            }
             form.action = undefined;
        }

        // Handle uploadDocument results
        if (form?.action === 'uploadDocument' && modalMode === 'edit' && selectedVendor?.id === form.newDocument?.vendor_id) { // <-- FIELD
            if (form.success && form.newDocument) {
                documentsForSelectedVendor = [form.newDocument as VendorDocument, ...documentsForSelectedVendor];
                uploadError = null;
                if (fileInputRef) fileInputRef.value = '';
                isFileSelected = false;
            } else if (form.message) {
                uploadError = form.message as string;
            }
             form.action = undefined;
        }

         // Handle deleteDocument results
        if (form?.action === 'deleteDocument' && modalMode === 'edit') {
             if (form.success && form.deletedDocumentId) {
                 if (documentsForSelectedVendor.some(d => d.id === form.deletedDocumentId)) {
                    documentsForSelectedVendor = documentsForSelectedVendor.filter(d => d.id !== form.deletedDocumentId);
                 }
                documentToDelete = null;
            } else if (form.message) {
                 showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
                 documentToDelete = null;
            }
             form.action = undefined;
        }
	});

    // --- Pagination Logic ---
    const paginationRange = $derived(() => {
		const delta = 1;
		const left = data.currentPage - delta;
		const right = data.currentPage + delta + 1;
		const range: number[] = [];
		const rangeWithDots: (number | string)[] = [];
		let l: number | undefined;
		for (let i = 1; i <= data.totalPages; i++) { if (i == 1 || i == data.totalPages || (i >= left && i < right)) { range.push(i); } }
		for (const i of range) { if (l) { if (i - l === 2) { rangeWithDots.push(l + 1); } else if (i - l !== 1) { rangeWithDots.push('...'); } } rangeWithDots.push(i); l = i; }
		return rangeWithDots;
	});
	function getPageUrl(pageNum: number) { const params = new URLSearchParams(); params.set('page', pageNum.toString()); if (data.searchQuery) { params.set('search', data.searchQuery); } return `/vendors?${params.toString()}`; } // <-- PATH
</script>

<svelte:head>
	<title>Vendor Management</title>
</svelte:head>

<!-- Global Notifications -->
{#if globalMessage}
    <div
        transition:fade
        class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 font-semibold text-sm shadow-xl {globalMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}"
    >
        {globalMessage.text}
    </div>
{/if}

<!-- Main Header -->
<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">Vendor Management</h1>
		<p class="mt-1 text-sm text-gray-500">จัดการข้อมูลซัพพลายเออร์ / ผู้จัดจำหน่าย</p>
	</div>
	<button
		onclick={() => openModal('add')}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
	>
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
		เพิ่มซัพพลายเออร์ใหม่
	</button>
</div>

<!-- Search Input -->
<div class="mb-4">
	<form method="GET" class="relative">
		<input
			type="search"
			name="search"
			bind:value={searchQuery}
			placeholder="ค้นหาด้วยชื่อผู้ติดต่อ, ชื่อบริษัท, อีเมล, โทรศัพท์, เลขภาษี, ผู้ดูแล..."
			class="w-full rounded-lg border-gray-300 py-2 pl-10 pr-4 focus:border-blue-500 focus:ring-blue-500"
		/>
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<svg class="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" /></svg>
		</div>
	</form>
</div>

<!-- Vendors Table -->
<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">ชื่อผู้ติดต่อ</th>
                <th class="px-4 py-3 text-left font-semibold text-gray-600">ชื่อบริษัท</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">อีเมล</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">โทรศัพท์</th>
                <th class="px-4 py-3 text-left font-semibold text-gray-600">เลขประจำตัวผู้เสียภาษี</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">ผู้ดูแล</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.vendors.length === 0}
				<tr>
					<td colspan="7" class="py-12 text-center text-gray-500">
						{#if data.searchQuery}ไม่พบซัพพลายเออร์ที่ค้นหา: "{data.searchQuery}"{:else}ไม่พบข้อมูลซัพพลายเออร์{/if}
					</td>
				</tr>
			{:else}
				{#each data.vendors as vendor (vendor.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 font-medium text-gray-900">{vendor.name}</td>
                        <td class="px-4 py-3 text-gray-600">{vendor.company_name ?? 'N/A'}</td>
						<td class="px-4 py-3 text-gray-600">{vendor.email ?? 'N/A'}</td>
						<td class="px-4 py-3 text-gray-600">{vendor.phone ?? 'N/A'}</td>
                        <td class="px-4 py-3 text-gray-600">{vendor.tax_id ?? 'N/A'}</td>
						<td class="px-4 py-3 text-gray-600">{vendor.assigned_user_name ?? 'N/A'}</td>
						<td class="px-4 py-3">
							<div class="flex items-center gap-2">
								<button onclick={() => openModal('edit', vendor)} class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600" aria-label="Edit vendor">
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
								</button>
								<button onclick={() => (vendorToDelete = vendor)} class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600" aria-label="Delete vendor">
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
								</button>
							</div>
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

<!-- Pagination Controls -->
{#if data.totalPages > 1}
	<div class="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
		<div><p class="text-sm text-gray-700">แสดงหน้า <span class="font-medium">{data.currentPage}</span> จาก <span class="font-medium">{data.totalPages}</span> หน้า</p></div>
		<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
			<a href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'} class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 {data.currentPage === 1 ? 'pointer-events-none opacity-50' : ''}" aria-disabled={data.currentPage === 1}><span class="sr-only">ก่อนหน้า</span><svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" /></svg></a>
			{#each paginationRange as pageNum}
				{#if typeof pageNum === 'string'}<span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300">...</span>
				{:else}<a href={getPageUrl(pageNum)} class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum === data.currentPage ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600' : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'}" aria-current={pageNum === data.currentPage ? 'page' : undefined}>{pageNum}</a>{/if}
			{/each}
			<a href={data.currentPage < data.totalPages ? getPageUrl(data.currentPage + 1) : '#'} class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 {data.currentPage === data.totalPages ? 'pointer-events-none opacity-50' : ''}" aria-disabled={data.currentPage === data.totalPages}><span class="sr-only">ถัดไป</span><svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" /></svg></a>
		</nav>
	</div>
{/if}

<!-- Add/Edit Vendor Modal -->
{#if modalMode && selectedVendor}
	<div transition:slide class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8 md:pt-16">
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div class="relative w-full max-w-3xl transform rounded-xl bg-white shadow-2xl transition-all max-h-[90vh] flex flex-col">
			<div class="border-b px-6 py-4 flex-shrink-0">
				<h2 class="text-lg font-bold text-gray-900">{modalMode === 'add' ? 'เพิ่มซัพพลายเออร์ใหม่' : 'แก้ไขข้อมูลซัพพลายเออร์'}</h2>
			</div>

            <!-- Vendor Details Form -->
			<form method="POST" action="?/saveVendor" use:enhance={() => { isSavingVendor = true; return async ({ update }) => { await update(); isSavingVendor = false; }; }} class="flex-1 overflow-y-auto">
				<div class="space-y-4 p-6">
					{#if modalMode === 'edit'}<input type="hidden" name="id" value={selectedVendor.id} />{/if}

                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div><label for="name" class="mb-1 block text-sm font-medium">ชื่อผู้ติดต่อ *</label><input type="text" name="name" id="name" required bind:value={selectedVendor.name} class="w-full rounded-md border-gray-300"/></div>
                        <div><label for="company_name" class="mb-1 block text-sm font-medium">ชื่อบริษัท</label><input type="text" name="company_name" id="company_name" bind:value={selectedVendor.company_name} class="w-full rounded-md border-gray-300"/></div>
                    </div>
                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div><label for="email" class="mb-1 block text-sm font-medium">อีเมล</label><input type="email" name="email" id="email" bind:value={selectedVendor.email} class="w-full rounded-md border-gray-300"/></div>
                        <div><label for="phone" class="mb-1 block text-sm font-medium">โทรศัพท์</label><input type="tel" name="phone" id="phone" bind:value={selectedVendor.phone} class="w-full rounded-md border-gray-300"/></div>
                    </div>
                     <div><label for="tax_id" class="mb-1 block text-sm font-medium">เลขประจำตัวผู้เสียภาษี</label><input type="text" name="tax_id" id="tax_id" bind:value={selectedVendor.tax_id} class="w-full rounded-md border-gray-300"/></div>
                     <div><label for="address" class="mb-1 block text-sm font-medium">ที่อยู่</label><textarea name="address" id="address" rows="3" bind:value={selectedVendor.address} class="w-full rounded-md border-gray-300"></textarea></div>
                     <div>
                        <label for="assigned_to_user_id" class="mb-1 block text-sm font-medium">ผู้ดูแล</label>
                        <select name="assigned_to_user_id" id="assigned_to_user_id" bind:value={selectedVendor.assigned_to_user_id} class="w-full rounded-md border-gray-300">
							<option value={undefined}>-- ไม่ได้กำหนด --</option>
							{#each data.users as user (user.id)}<option value={user.id}>{user.full_name} ({user.email})</option>{/each}
						</select>
                    </div>
					<div><label for="notes" class="mb-1 block text-sm font-medium">บันทึกเพิ่มเติม (ภายใน)</label><textarea name="notes" id="notes" rows="3" bind:value={selectedVendor.notes} class="w-full rounded-md border-gray-300"></textarea></div>

                    <!-- Display save vendor form error messages -->
                    {#if form?.message && !form.success && form.action === 'saveVendor'}
                        <div class="rounded-md bg-red-50 p-3 text-sm text-red-600"><p><strong>Error:</strong> {form.message}</p></div>
                    {/if}
				</div>

                <!-- *** MOVED SECTIONS HERE *** -->
                <!-- Sections only shown in EDIT mode (Moved inside the scrolling form) -->
                {#if modalMode === 'edit' && selectedVendor.id}
                    <!-- Documents Section -->
                    <div class="border-t px-6 py-6"> <!-- <-- REMOVED max-h, overflow, flex-shrink. Added py-6 -->
                        <h3 class="text-md font-semibold mb-3 text-gray-700">เอกสารแนบ</h3>
                        <!-- Upload Form -->
                        <form method="POST" action="?/uploadDocument" enctype="multipart/form-data" use:enhance={() => { isUploadingDocument = true; uploadError = null; return async ({ update }) => { await update(); isUploadingDocument = false; }; }} class="mb-4 rounded-lg border {isFileSelected ? 'border-green-500 bg-green-50' : 'border-dashed border-gray-300'} p-4 text-center hover:border-blue-500 relative transition-colors duration-200">
                            <input type="hidden" name="vendor_id" value={selectedVendor.id}>
                            
                            <input 
                                type="file" 
                                name="document" 
                                id="document_upload" 
                                required 
                                onchange={handleFileChange}
                                class="sr-only" 
                                bind:this={fileInputRef}
                            />

                            <label for="document_upload" class="flex flex-col items-center justify-center cursor-pointer p-4">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-8 w-8 {isFileSelected ? 'text-green-600' : 'text-gray-400'} mb-2 transition-colors duration-200"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                                <span class="text-sm {isFileSelected ? 'text-green-700 font-semibold' : 'text-gray-600'}">
                                    {#if isFileSelected}
                                        ไฟล์พร้อมอัปโหลด: {fileInputRef?.files?.[0]?.name}
                                    {:else}
                                        ลากไฟล์มาวาง หรือ คลิกเพื่อเลือกไฟล์
                                    {/if}
                                </span>
                            </label>
                            
                            <button type="submit" disabled={isUploadingDocument || !isFileSelected} class="mt-3 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700">
                                {#if isUploadingDocument} กำลังอัปโหลด... {:else} อัปโหลดเอกสาร {/if}
                            </button>
                            {#if uploadError} <p class="mt-2 text-xs text-red-600">{uploadError}</p> {/if}
                        </form>
                        <!-- Document List -->
                        <ul class="space-y-2">
                            {#if documentsForSelectedVendor.length === 0}
                                <li class="text-center text-sm text-gray-500 py-2">ไม่มีเอกสารแนบ</li>
                            {:else}
                                {#each documentsForSelectedVendor as doc (doc.id)}
                                    <li class="flex items-center justify-between rounded-md bg-gray-50 p-2 hover:bg-gray-100">
                                        <div class="flex items-center gap-2 overflow-hidden">
                                            <span class="text-lg flex-shrink-0">{getFileIcon(doc.file_name)}</span>
                                            <a href={doc.file_path} target="_blank" rel="noopener noreferrer" class="truncate text-sm text-blue-600 hover:underline" title={doc.file_name}>{doc.file_name}</a>
                                        </div>
                                        <div class="flex items-center gap-2 flex-shrink-0 ml-2">
                                             <span class="text-xs text-gray-400">{formatDateTime(doc.uploaded_at)}</span>
                                             <button onclick={() => (documentToDelete = doc)} class="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600" title="ลบเอกสาร" disabled={isDeletingDocument}>
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                                            </button>
                                        </div>
                                    </li>
                                {/each}
                            {/if}
                        </ul>
                    </div>

                    <!-- Notes Section -->
                    <div class="border-t px-6 py-6"> <!-- <-- REMOVED max-h, overflow, flex-shrink. Added py-6 -->
                        <h3 class="text-md font-semibold mb-3 text-gray-700">บันทึก (Notes)</h3>
                        <!-- Add Note Form -->
                        <form method="POST" action="?/addNote" use:enhance={() => { isAddingNote = true; return async ({ update }) => { await update(); isAddingNote = false; }; }} class="mb-4">
                            <input type="hidden" name="vendor_id" value={selectedVendor.id} />
                            <textarea name="note" rows="2" placeholder="เพิ่มบันทึก..." required bind:value={newNote} class="w-full rounded-md border-gray-300 text-sm mb-2"></textarea>
                            <button type="submit" disabled={isAddingNote || !newNote.trim()} class="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700">
                                 {#if isAddingNote} Saving... {:else} Add Note {/if}
                            </button>
                            {#if form?.message && !form.success && form.action === 'addNote'} <p class="mt-1 text-xs text-red-600">{form.message}</p> {/if}
                        </form>
                         <!-- Notes List -->
                        <ul class="space-y-2">
                            {#if notesForSelectedVendor.length === 0}
                                <li class="text-center text-sm text-gray-500 py-2">ยังไม่มีบันทึก</li>
                            {:else}
                                {#each notesForSelectedVendor as note (note.id)}
                                    <li class="rounded-md bg-gray-50 p-3 text-sm">
                                        <p class="whitespace-pre-wrap">{note.note}</p>
                                        <div class="mt-1 flex items-center justify-between text-xs text-gray-500">
                                            <span>โดย: {note.user_full_name} ({formatDateTime(note.created_at)})</span>
                                            <form method="POST" action="?/deleteNote" use:enhance>
                                                <input type="hidden" name="note_id" value={note.id}>
                                                <input type="hidden" name="vendor_id" value={selectedVendor.id}>
                                                 <button type="submit" class="text-red-500 hover:underline">Delete</button>
                                            </form>
                                        </div>
                                    </li>
                                {/each}
                            {/if}
                        </ul>
                    </div>
                {/if} <!-- End of Edit Mode Sections -->

                <!-- Sticky Footer -->
                <div class="flex justify-end gap-3 border-t bg-gray-50 p-4 mt-auto flex-shrink-0 sticky bottom-0">
					<button type="button" onclick={closeModal} class="rounded-md border bg-white px-4 py-2 text-sm">Cancel</button>
					<button type="submit" disabled={isSavingVendor} class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:bg-blue-400">
						{#if isSavingVendor} Saving... {:else} Save Vendor {/if}
					</button>
				</div>
			</form>

            <!-- *** MOVED SECTIONS FROM HERE *** -->
            
		</div>
	</div>
{/if}

<!-- Delete Vendor Confirmation Modal -->
{#if vendorToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">ยืนยันการลบซัพพลายเออร์</h3>
			<p class="mt-2 text-sm text-gray-600">คุณแน่ใจหรือไม่ที่จะลบซัพพลายเออร์ "<strong>{vendorToDelete.name}</strong>"? การดำเนินการนี้จะลบข้อมูล, บันทึก, และเอกสารแนบทั้งหมด ไม่สามารถย้อนกลับได้</p>
			<form method="POST" action="?/deleteVendor" use:enhance={() => { return async ({ update }) => { await update(); vendorToDelete = null; }; }} class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="id" value={vendorToDelete.id} />
				<button type="button" onclick={() => (vendorToDelete = null)} class="rounded-md border bg-white px-4 py-2 text-sm">ยกเลิก</button>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white">ลบ</button>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Document Confirmation Modal -->
{#if documentToDelete}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="alertdialog">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">ยืนยันการลบเอกสาร</h3>
			<p class="mt-2 text-sm text-gray-600">คุณแน่ใจหรือไม่ที่จะลบเอกสาร "<strong>{documentToDelete.file_name}</strong>"? การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
			<form method="POST" action="?/deleteDocument" use:enhance={() => { isDeletingDocument = true; return async ({ update }) => { await update(); isDeletingDocument = false; }; }} class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="document_id" value={documentToDelete.id} />
				<button type="button" onclick={() => (documentToDelete = null)} class="rounded-md border bg-white px-4 py-2 text-sm" disabled={isDeletingDocument}>ยกเลิก</button>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed" disabled={isDeletingDocument}>
                    {#if isDeletingDocument} กำลังลบ... {:else} ลบ {/if}
                </button>
			</form>
		</div>
	</div>
{/if}