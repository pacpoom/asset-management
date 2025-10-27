<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll, goto } from '$app/navigation'; // Added goto for navigation
	import { browser } from '$app/environment'; // Import browser check

	// --- Types ---
	type ProductCategory = {
		id: number;
		name: string;
		description: string | null;
	};

	// --- Props & State (Svelte 5 Runes) ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedCategory = $state<Partial<ProductCategory> | null>(null);
	let categoryToDelete = $state<ProductCategory | null>(null);
	let isSaving = $state(false);
	let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(
		null
	);
	let messageTimeout: NodeJS.Timeout;
	// State for the search filter input, initialized from server data
	let searchQuery = $state(data.searchQuery ?? '');

	// --- Functions ---
	function openModal(mode: 'add' | 'edit', category: ProductCategory | null = null) {
		modalMode = mode;
		globalMessage = null;
		if (mode === 'edit' && category) {
			selectedCategory = { ...category };
		} else {
			selectedCategory = { name: '', description: '' };
		}
	}

	function closeModal() {
		modalMode = null;
		selectedCategory = null;
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

	// --- Pagination Logic ---
	const paginationRange = $derived(() => {
		if (!data.totalPages || data.totalPages <= 1) return []; // Return empty if no pagination needed
		const delta = 1; // How many pages to show before and after current
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

	// Function to generate URL for pagination links
	// *** FIX: Check if running in browser before accessing window.location ***
	function getPageUrl(pageNum: number) {
		const params = browser ? new URLSearchParams(window.location.search) : new URLSearchParams();
		// If server-side, read search from data prop
		if (!browser && data.searchQuery) {
			params.set('search', data.searchQuery);
		}
		params.set('page', pageNum.toString());
		return `/product-categories?${params.toString()}`;
	}


	// --- Reactive Effects ---
	$effect.pre(() => {
		// Handle saveCategory results
		if (form?.action === 'saveCategory') {
			if (form.success) {
				closeModal();
				showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
			}
			form.action = undefined;
		}

		// Handle deleteCategory results
		if (form?.action === 'deleteCategory') {
			if (form.success) {
				showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
			}
			categoryToDelete = null;
			form.action = undefined;
		}
	});

	// Debugging effect
	$effect(() => {
        if (data.categories) {
            console.log(`[ProductCategories] Displaying ${data.categories.length} categories on page ${data.currentPage} of ${data.totalPages}. Search: "${data.searchQuery}"`);
        } else {
             console.error("[ProductCategories] data.categories is undefined or null.");
        }
    });

</script>

<svelte:head>
	<title>Product Categories</title>
</svelte:head>

<!-- Global Notifications Area -->
{#if globalMessage}
	<div
		transition:fade
		class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 font-semibold text-sm shadow-xl {globalMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}"
	>
		{globalMessage.text}
	</div>
{/if}

<!-- Main Header Section -->
<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">Product Categories</h1>
		<p class="mt-1 text-sm text-gray-500">จัดการหมวดหมู่สินค้า</p>
	</div>
	<button
		onclick={() => openModal('add')}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
	>
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
		เพิ่มหมวดหมู่ใหม่
	</button>
</div>

<!-- Search Input Field -->
<div class="mb-4">
    <!-- Use GET method to update URL search parameters -->
	<form method="GET" class="relative">
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<svg class="h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" /></svg>
		</div>
		<input
			type="search"
            name="search"
			bind:value={searchQuery}
			placeholder="ค้นหาชื่อหมวดหมู่..."
			class="w-full rounded-lg border-gray-300 py-2 pl-10 pr-4 focus:border-blue-500 focus:ring-blue-500 text-sm"
		/>
        <!-- Implicit submit on Enter or explicit button can trigger the form GET -->
	</form>
</div>

<!-- Categories Table -->
<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600 w-1/2">Category Name</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Description</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			<!-- Use data.categories directly as it's filtered server-side -->
			{#if !data.categories || data.categories.length === 0}
				<tr>
					<td colspan="3" class="py-12 text-center text-gray-500">
						{#if data.searchQuery}
							ไม่พบหมวดหมู่ที่ค้นหา: "{data.searchQuery}"
						{:else}
							ไม่พบข้อมูลหมวดหมู่สินค้า
						{/if}
					</td>
				</tr>
			{:else}
				{#each data.categories as category (category.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 font-medium text-gray-900">
							{category.name}
						</td>
						<td
							class="px-4 py-3 text-gray-600 truncate max-w-sm"
							title={category.description ?? ''}
						>
							{category.description ?? '-'}
						</td>
						<td class="px-4 py-3 whitespace-nowrap">
							<div class="flex items-center gap-2">
								<button
									onclick={() => openModal('edit', category)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
									aria-label="Edit category"
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
								</button>
								<button
									onclick={() => (categoryToDelete = category)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
									aria-label="Delete category"
								>
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
		<div>
			<p class="text-sm text-gray-700">
				แสดงหน้า <span class="font-medium">{data.currentPage}</span> จาก
				<span class="font-medium">{data.totalPages}</span> หน้า
			</p>
		</div>
		<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
			<a
				href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'}
				class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 {data.currentPage === 1 ? 'pointer-events-none opacity-50' : ''}"
				aria-disabled={data.currentPage === 1}
			>
				<span class="sr-only">ก่อนหน้า</span>
				<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
					<path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
				</svg>
			</a>
			{#each paginationRange as pageNum}
				{#if typeof pageNum === 'string'}
					<span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300">...</span>
				{:else}
					<a
						href={getPageUrl(pageNum)}
						class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum === data.currentPage ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600' : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'}"
						aria-current={pageNum === data.currentPage ? 'page' : undefined}
					>{pageNum}</a>
				{/if}
			{/each}
			<a
				href={data.currentPage < data.totalPages ? getPageUrl(data.currentPage + 1) : '#'}
				class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 {data.currentPage === data.totalPages ? 'pointer-events-none opacity-50' : ''}"
				aria-disabled={data.currentPage === data.totalPages}
			>
				<span class="sr-only">ถัดไป</span>
				<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
					<path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
				</svg>
			</a>
		</nav>
	</div>
{/if}

<!-- Add/Edit Category Modal -->
{#if modalMode && selectedCategory}
	<div
		transition:slide
		class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
	>
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div class="relative w-full max-w-lg transform rounded-xl bg-white shadow-2xl">
			<div class="border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? 'เพิ่มหมวดหมู่ใหม่' : 'แก้ไขหมวดหมู่'}
				</h2>
			</div>
			<form
				method="POST"
				action="?/saveCategory"
				use:enhance={() => {
					isSaving = true;
					return async ({ update }) => {
						await update();
						isSaving = false;
					};
				}}
			>
				<div class="space-y-6 p-6 max-h-[70vh] overflow-y-auto">
					{#if modalMode === 'edit'}
						<input type="hidden" name="id" value={selectedCategory.id} />
					{/if}
					<div>
						<label for="name" class="mb-1 block text-sm font-medium text-gray-700"
							>Category Name *</label
						>
						<input
							type="text"
							name="name"
							id="name"
							required
							bind:value={selectedCategory.name}
							class="w-full rounded-md border-gray-300"
						/>
					</div>
					<div>
						<label for="description" class="mb-1 block text-sm font-medium text-gray-700"
							>Description</label
						>
						<textarea
							name="description"
							id="description"
							rows="3"
							bind:value={selectedCategory.description}
							class="w-full rounded-md border-gray-300"
						></textarea>
					</div>
					{#if form?.message && !form.success && form.action === 'saveCategory'}
						<div class="rounded-md bg-red-50 p-3 text-sm text-red-600">
							<p><strong>Error:</strong> {form.message}</p>
						</div>
					{/if}
				</div>
				<div class="flex justify-end gap-3 border-t bg-gray-50 p-4">
					<button
						type="button"
						onclick={closeModal}
						class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
						>Cancel</button
					>
					<button
						type="submit"
						disabled={isSaving}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:bg-blue-400 hover:bg-blue-700"
					>
						{#if isSaving} Saving... {:else} Save Category {/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if categoryToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">ยืนยันการลบ</h3>
			<p class="mt-2 text-sm text-gray-600">
				คุณแน่ใจหรือไม่ที่จะลบหมวดหมู่ "<strong>{categoryToDelete.name}</strong>"?
				<br />การดำเนินการนี้ไม่สามารถย้อนกลับได้
			</p>
			{#if form?.message && !form.success && form.action === 'deleteCategory'}
				<p class="mt-2 text-sm text-red-600"><strong>Error:</strong> {form.message}</p>
			{/if}
			<form method="POST" action="?/deleteCategory" use:enhance class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="id" value={categoryToDelete.id} />
				<button
					type="button"
					onclick={() => (categoryToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
					>Cancel</button
				>
				<button
					type="submit"
					class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
					>Delete</button
				>
			</form>
		</div>
	</div>
{/if}