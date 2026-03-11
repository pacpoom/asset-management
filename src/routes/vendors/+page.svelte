<script lang="ts">
	import { enhance } from '$app/forms';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import { t, locale } from '$lib/i18n';
	import Select from 'svelte-select';
	import { browser } from '$app/environment';

	let { data, form } = $props();

	let userOptions = $derived(
		(data.users || []).map((u: any) => ({
			value: u.id,
			label: u.full_name
		}))
	);
	let selectedUserObj = $state<any>(null);

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedVendor = $state<any>(null);
	let vendorToDelete = $state<any>(null);
	let isSavingVendor = $state(false);
	let searchQuery = $state(data.searchQuery ?? '');
	let globalMessage = $state<{
		success: boolean;
		text: string;
		type: 'success' | 'error';
	} | null>(null);
	let messageTimeout: NodeJS.Timeout;
	let notesForSelectedVendor = $state<any[]>([]);
	let newNote = $state('');
	let isAddingNote = $state(false);
	let documentsForSelectedVendor = $state<any[]>([]);
	let isUploadingDocument = $state(false);
	let uploadError = $state<string | null>(null);
	let documentToDelete = $state<any>(null);
	let isDeletingDocument = $state(false);

	let fileInputRef = $state<HTMLInputElement | null>(null);
	let isFileSelected = $state(false);

	// --- Functions ---
	function openModal(mode: 'add' | 'edit', vendor: any = null) {
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
			notesForSelectedVendor = vendor.note_history ? [...vendor.note_history] : [];
			selectedUserObj = vendor.assigned_to_user_id
				? userOptions.find((o: any) => o.value === vendor.assigned_to_user_id) || null
				: null;
		} else {
			selectedVendor = { name: '', company_name: null, assigned_to_user_id: undefined };
			selectedUserObj = null;
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

	// 🌟 ปรับวันที่และเวลาให้เปลี่ยนรูปแบบไปตามภาษาปัจจุบัน
	function formatDateTime(isoString: string | Date | null | undefined): string {
		if (!isoString) return '-';
		try {
			return new Date(isoString).toLocaleString($locale === 'th' ? 'th-TH' : 'en-US', {
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
		isFileSelected = (input.files?.length ?? 0) > 0;
		uploadError = null;
	}

	// --- Reactive Effects ---
	$effect.pre(() => {
		if (form?.action === 'saveVendor') {
			if (form.success) {
				closeModal();
				showGlobalMessage({
					success: true,
					text: (form.message as string) ?? 'Success',
					type: 'success'
				});
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage({
					success: false,
					text: (form.message as string) ?? 'Error',
					type: 'error'
				});
			}
			(form as any).action = undefined;
		}

		if (form?.action === 'deleteVendor') {
			if (form.success) {
				showGlobalMessage({
					success: true,
					text: $t('Vendor deleted successfully'),
					type: 'success'
				});
				vendorToDelete = null;
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage({
					success: false,
					text: (form.message as string) ?? 'Error',
					type: 'error'
				});
				vendorToDelete = null;
			}
			(form as any).action = undefined;
		}
	});

	let paginationRange = $derived.by(() => {
		const delta = 1;
		const left = data.currentPage - delta;
		const right = data.currentPage + delta + 1;
		const range: number[] = [];
		const rangeWithDots: (number | string)[] = [];
		let l: number | undefined;
		for (let i = 1; i <= data.totalPages; i++) {
			if (i == 1 || i == data.totalPages || (i >= left && i < right)) {
				range.push(i);
			}
		}
		for (const i of range) {
			if (l) {
				if (i - l === 2) {
					rangeWithDots.push(l + 1);
				} else if (i - l !== 1) {
					rangeWithDots.push('...');
				}
			}
			rangeWithDots.push(i);
			l = i;
		}
		return rangeWithDots;
	});

	// 🌟 แก้ Type Error ให้รับ parameter แบบ number | string ได้
	function getPageUrl(pageNum: number | string) {
		const params = new URLSearchParams();
		params.set('page', pageNum.toString());
		if (data.searchQuery) {
			params.set('search', data.searchQuery);
		}
		return `/vendors?${params.toString()}`;
	}
</script>

<svelte:head>
	<title>{$t('Vendor Management')}</title>
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
		<h1 class="text-2xl font-bold text-gray-800">{$t('Vendor Management')}</h1>
		<p class="mt-1 text-sm text-gray-500">{$t('Manage vendor data')}</p>
	</div>
	<button
		onclick={() => openModal('add')}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
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
		{$t('Add New Vendor')}
	</button>
</div>

<div class="mb-4">
	<form method="GET" class="relative">
		<input
			type="search"
			name="search"
			bind:value={searchQuery}
			placeholder={$t('Search Vendor Placeholder')}
			class="w-full rounded-lg border-gray-300 py-2 pr-4 pl-10 focus:border-blue-500 focus:ring-blue-500"
		/>
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<svg
				class="h-5 w-5 text-gray-400"
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
	</form>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Contact Name')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Company Name')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Email')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Phone')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Tax ID')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Assigned To')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Actions')}</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.vendors.length === 0}
				<tr
					><td colspan="7" class="py-12 text-center text-gray-500">{$t('No vendor data found')}</td
					></tr
				>
			{:else}
				{#each data.vendors as vendor (vendor.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 font-medium text-gray-900">{vendor.name}</td>
						<td class="px-4 py-3 text-gray-600">{vendor.company_name ?? '-'}</td>
						<td class="px-4 py-3 text-gray-600">{vendor.email ?? '-'}</td>
						<td class="px-4 py-3 text-gray-600">{vendor.phone ?? '-'}</td>
						<td class="px-4 py-3 text-gray-600">{vendor.tax_id ?? '-'}</td>
						<td class="px-4 py-3 text-gray-600">{vendor.assigned_user_name ?? '-'}</td>
						<td class="px-4 py-3">
							<div class="flex items-center gap-2">
								<button
									onclick={() => openModal('edit', vendor)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
									aria-label={$t('Edit')}
									><svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
									></button
								>
								<button
									onclick={() => (vendorToDelete = vendor)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
									aria-label={$t('Delete')}
									><svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
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
		<div>
			<p class="text-sm text-gray-700">
				{$t('Showing page')} <span class="font-medium">{data.currentPage}</span>
				{$t('of')} <span class="font-medium">{data.totalPages}</span>
			</p>
		</div>
		<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm">
			<a
				href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'}
				class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage ===
				1
					? 'pointer-events-none opacity-50'
					: ''}"
				aria-disabled={data.currentPage === 1}
			>
				<span class="sr-only">Previous</span>&larr;
			</a>
			{#each paginationRange as pageNum}
				{#if typeof pageNum === 'string'}
					<span class="px-4 py-2">...</span>
				{:else}
					<a
						href={getPageUrl(pageNum)}
						class="px-4 py-2 {pageNum === data.currentPage
							? 'bg-blue-600 text-white'
							: 'text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-50'}">{pageNum}</a
					>
				{/if}
			{/each}
			<a
				href={data.currentPage < data.totalPages ? getPageUrl(data.currentPage + 1) : '#'}
				class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage ===
				data.totalPages
					? 'pointer-events-none opacity-50'
					: ''}"
				aria-disabled={data.currentPage === data.totalPages}
			>
				<span class="sr-only">Next</span>&rarr;
			</a>
		</nav>
	</div>
{/if}

{#if modalMode && selectedVendor}
	<div
		transition:slide
		class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8 md:pt-16"
	>
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div
			class="relative flex max-h-[90vh] w-full max-w-3xl transform flex-col rounded-xl bg-white shadow-2xl transition-all"
		>
			<div class="flex-shrink-0 border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? $t('Add New Vendor') : $t('Edit Vendor')}
				</h2>
			</div>

			<div class="flex-1 overflow-y-auto">
				<form
					method="POST"
					action="?/saveVendor"
					use:enhance={() => {
						isSavingVendor = true;
						return async ({ update }) => {
							await update();
							isSavingVendor = false;
						};
					}}
					id="vendorForm"
				>
					<div class="space-y-4 p-6">
						{#if modalMode === 'edit'}<input
								type="hidden"
								name="id"
								value={selectedVendor.id}
							/>{/if}
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="name" class="block text-sm font-medium">{$t('Contact Name')} *</label>
								<input
									type="text"
									name="name"
									id="name"
									required
									bind:value={selectedVendor.name}
									class="w-full rounded-md border-gray-300"
								/>
							</div>
							<div>
								<label for="company_name" class="block text-sm font-medium"
									>{$t('Company Name')}</label
								>
								<input
									type="text"
									name="company_name"
									id="company_name"
									bind:value={selectedVendor.company_name}
									class="w-full rounded-md border-gray-300"
								/>
							</div>
						</div>
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="email" class="block text-sm font-medium">{$t('Email')}</label>
								<input
									type="email"
									name="email"
									id="email"
									bind:value={selectedVendor.email}
									class="w-full rounded-md border-gray-300"
								/>
							</div>
							<div>
								<label for="phone" class="block text-sm font-medium">{$t('Phone')}</label>
								<input
									type="tel"
									name="phone"
									id="phone"
									bind:value={selectedVendor.phone}
									class="w-full rounded-md border-gray-300"
								/>
							</div>
						</div>
						<div>
							<label for="tax_id" class="block text-sm font-medium">{$t('Tax ID')}</label>
							<input
								type="text"
								name="tax_id"
								id="tax_id"
								bind:value={selectedVendor.tax_id}
								class="w-full rounded-md border-gray-300"
							/>
						</div>
						<div>
							<label for="address" class="block text-sm font-medium">{$t('Address')}</label>
							<textarea
								name="address"
								id="address"
								rows="2"
								bind:value={selectedVendor.address}
								class="w-full rounded-md border-gray-300"
							></textarea>
						</div>
						<div>
							<span class="mb-1 block text-sm font-medium text-gray-700">{$t('Assigned To')}</span>
							<Select
								items={userOptions}
								bind:value={selectedUserObj}
								placeholder={$t('-- Not assigned --')}
								container={browser ? document.body : null}
								floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
							/>
							<input
								type="hidden"
								name="assigned_to_user_id"
								value={selectedUserObj?.value ?? ''}
							/>
						</div>
						<div>
							<label for="notes" class="block text-sm font-medium">{$t('Additional Notes')}</label>
							<textarea
								name="notes"
								id="notes"
								rows="2"
								bind:value={selectedVendor.notes}
								class="w-full rounded-md border-gray-300"
							></textarea>
						</div>
					</div>
				</form>

				{#if modalMode === 'edit' && selectedVendor.id}
					<div class="border-t bg-gray-50 px-6 py-4">
						<h3 class="mb-2 text-sm font-semibold">{$t('Attachments')}</h3>
						<form
							method="POST"
							action="?/uploadDocument"
							enctype="multipart/form-data"
							use:enhance={() => {
								isUploadingDocument = true;
								return async ({ result, update }) => {
									await update();
									isUploadingDocument = false;

									const actionResult = result as any;
									if (actionResult.type === 'success' && actionResult.data?.newDocument) {
										const newDoc = actionResult.data.newDocument;
										if (!documentsForSelectedVendor.some((d: any) => d.id === newDoc.id)) {
											documentsForSelectedVendor = [newDoc, ...documentsForSelectedVendor];
										}
										uploadError = null;
										if (fileInputRef) fileInputRef.value = '';
										isFileSelected = false;
									} else if (actionResult.type === 'failure') {
										uploadError = (actionResult.data?.message as string) ?? 'Upload failed';
									}
								};
							}}
							class="mb-3 flex gap-2"
						>
							<input type="hidden" name="vendor_id" value={selectedVendor.id} />
							<input
								type="file"
								name="document"
								id="document_upload"
								required
								onchange={handleFileChange}
								class="text-sm file:mr-2 file:border-0 file:bg-blue-50 file:px-2 file:py-1 file:text-xs file:text-blue-700 hover:file:bg-blue-100"
								bind:this={fileInputRef}
							/>
							<button
								type="submit"
								disabled={!isFileSelected || isUploadingDocument}
								class="rounded bg-green-600 px-3 py-1 text-xs text-white disabled:opacity-50"
							>
								{$t('Upload')}
							</button>
						</form>
						{#if uploadError}<p class="mb-2 text-xs text-red-600">{uploadError}</p>{/if}
						<ul class="space-y-1">
							{#each documentsForSelectedVendor as doc (doc.id)}
								<li class="flex justify-between rounded border bg-white p-2 text-sm">
									<a
										href={doc.file_path}
										target="_blank"
										class="truncate text-blue-600"
										rel="noreferrer">{getFileIcon(doc.file_name)} {doc.file_name}</a
									>
									<button
										onclick={() => (documentToDelete = doc)}
										class="text-red-500 hover:text-red-700"
										type="button">{$t('Delete Document')}</button
									>
								</li>
							{/each}
						</ul>
					</div>

					<div class="border-t bg-gray-50 px-6 py-4">
						<h3 class="mb-2 text-sm font-semibold">{$t('Note History')}</h3>
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
							class="mb-3 flex gap-2"
						>
							<input type="hidden" name="vendor_id" value={selectedVendor.id} />
							<input
								type="text"
								name="note"
								required
								bind:value={newNote}
								placeholder={$t('Type a note...')}
								class="flex-1 rounded border-gray-300 text-sm"
							/>
							<button
								type="submit"
								disabled={!newNote || isAddingNote}
								class="rounded bg-indigo-600 px-3 py-1 text-xs text-white disabled:opacity-50"
							>
								{$t('Add')}
							</button>
						</form>
						<ul class="max-h-40 space-y-2 overflow-y-auto">
							{#each notesForSelectedVendor as note (note.id)}
								<li class="rounded border bg-white p-2 text-sm">
									<p>{note.note}</p>
									<div class="mt-1 flex justify-between text-xs text-gray-500">
										<span>{note.user_full_name} - {formatDateTime(note.created_at)}</span>
										<form method="POST" action="?/deleteNote" use:enhance>
											<input type="hidden" name="note_id" value={note.id} />
											<input type="hidden" name="vendor_id" value={selectedVendor.id} />
											<button type="submit" class="text-red-400 hover:text-red-600">x</button>
										</form>
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>

			<div class="sticky bottom-0 flex justify-end gap-3 border-t bg-white p-4">
				<button
					type="button"
					onclick={closeModal}
					class="rounded-md border bg-white px-4 py-2 text-sm">{$t('Cancel')}</button
				>
				<button
					type="submit"
					form="vendorForm"
					disabled={isSavingVendor}
					class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:bg-blue-400"
					>{$t('Save')}</button
				>
			</div>
		</div>
	</div>
{/if}

{#if vendorToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
		<div class="max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">{$t('Confirm Delete')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				{$t('Are you sure you want to delete vendor:')} "{vendorToDelete.name}"?
			</p>
			<form
				method="POST"
				action="?/deleteVendor"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						vendorToDelete = null;
					};
				}}
				class="mt-4 flex justify-end gap-2"
			>
				<input type="hidden" name="id" value={vendorToDelete.id} />
				<button
					type="button"
					onclick={() => (vendorToDelete = null)}
					class="rounded border px-3 py-1 text-sm">{$t('Cancel')}</button
				>
				<button class="rounded bg-red-600 px-3 py-1 text-sm text-white">{$t('Delete')}</button>
			</form>
		</div>
	</div>
{/if}

{#if documentToDelete}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
		<div class="max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">{$t('Delete document?')}</h3>
			<p class="mt-2 text-sm text-gray-600">{documentToDelete.file_name}</p>
			<form
				method="POST"
				action="?/deleteDocument"
				use:enhance={() => {
					isDeletingDocument = true;
					return async ({ result, update }) => {
						await update();
						isDeletingDocument = false;

						const actionResult = result as any;
						if (actionResult.type === 'success') {
							if (actionResult.data?.deletedDocumentId) {
								documentsForSelectedVendor = documentsForSelectedVendor.filter(
									(d: any) => d.id !== actionResult.data.deletedDocumentId
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
				class="mt-4 flex justify-end gap-2"
			>
				<input type="hidden" name="document_id" value={documentToDelete.id} />

				<button
					type="button"
					onclick={() => (documentToDelete = null)}
					class="rounded border px-3 py-1 text-sm hover:bg-gray-100"
					disabled={isDeletingDocument}
				>
					{$t('Cancel')}
				</button>

				<button
					type="submit"
					class="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
					disabled={isDeletingDocument}
				>
					{#if isDeletingDocument}
						{$t('Deleting...')}
					{:else}
						{$t('Delete Document')}
					{/if}
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
