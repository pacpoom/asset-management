<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll, goto } from '$app/navigation';
	import { compressImage } from '$lib/utils/image-compressor';
	import { t, locale } from '$lib/i18n';

	type Product = PageData['products'][0];
	type Vendor = PageData['vendors'][0];
	type Customer = PageData['customers'][0];

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedProduct = $state<Partial<Product> | null>(null);
	let productToDelete = $state<Product | null>(null);
	let productToView = $state<Product | null>(null);
	let productToAdjust = $state<Product | null>(null);
	let productToPrint = $state<Product | null>(null);
	let bulkConfirm = $state<{ op: 'delete' | 'activate' | 'deactivate'; count: number } | null>(null);
	let isSaving = $state(false);
	let showImportModal = $state(false);

	let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(
		null
	);
	let messageTimeout: ReturnType<typeof setTimeout>;

	// Search & filters
	let searchQuery = $state(data.searchQuery ?? '');
	let filterType = $state(data.filters?.type ?? '');
	let filterCategory = $state(data.filters?.category ?? '');
	let filterActive = $state(data.filters?.active ?? '');
	let filterStock = $state(data.filters?.stock ?? '');
	let searchTimer: ReturnType<typeof setTimeout>;

	// Selection (bulk)
	let selectedIds = $state<Set<number>>(new Set());

	// Image handling
	let compressedImageFile = $state<File | null>(null);
	let isCompressing = $state(false);
	let compressionError = $state<string | null>(null);
	let imagePreviewUrl = $state<string | null>(null);
	let removeImageFlag = $state(false);

	// Vendor / Customer search dropdowns
	let vendorSearchText = $state('');
	let isVendorDropdownOpen = $state(false);
	let customerSearchText = $state('');
	let isCustomerDropdownOpen = $state(false);

	const filteredVendors = $derived(
		data.vendors?.filter((v: Vendor) =>
			v.name.toLowerCase().includes(vendorSearchText.toLowerCase())
		) || []
	);
	const filteredCustomers = $derived(
		data.customers?.filter((c: Customer) =>
			c.name.toLowerCase().includes(customerSearchText.toLowerCase())
		) || []
	);

	const filteredProducts = $derived(data.products || []);

	const allOnPageSelected = $derived(
		filteredProducts.length > 0 &&
			filteredProducts.every((p: Product) => selectedIds.has(p.id))
	);

	// --- URL builder ---
	function buildParams(overrides: Record<string, string | number | null> = {}) {
		const params = new URLSearchParams();
		const base: Record<string, string> = {
			search: searchQuery,
			type: filterType,
			category: filterCategory,
			active: filterActive,
			stock: filterStock,
			sort_by: data.sort?.by ?? 'created_at',
			sort_dir: data.sort?.dir ?? 'desc',
			limit: String(data.limit ?? 10),
			page: String(data.currentPage ?? 1)
		};
		for (const [k, v] of Object.entries(base)) {
			if (v && v !== '') params.set(k, v);
		}
		for (const [k, v] of Object.entries(overrides)) {
			if (v === null || v === '') params.delete(k);
			else params.set(k, String(v));
		}
		return params;
	}

	function navigate(overrides: Record<string, string | number | null> = {}) {
		const params = buildParams(overrides);
		goto(`/products?${params.toString()}`, {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	function handleSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => navigate({ page: 1 }), 400);
	}

	function applyFilter(key: string, val: string | null) {
		const update: Record<string, string | null> = { page: '1' };
		update[key] = val;
		// keep local state sync
		if (key === 'type') filterType = val ?? '';
		if (key === 'category') filterCategory = val ?? '';
		if (key === 'active') filterActive = val ?? '';
		if (key === 'stock') filterStock = val ?? '';
		navigate(update);
	}

	function clearAllFilters() {
		filterType = '';
		filterCategory = '';
		filterActive = '';
		filterStock = '';
		searchQuery = '';
		navigate({ search: null, type: null, category: null, active: null, stock: null, page: 1 });
	}

	function toggleSort(col: string) {
		const currentBy = data.sort?.by ?? 'created_at';
		const currentDir = data.sort?.dir ?? 'desc';
		const nextDir = currentBy === col ? (currentDir === 'asc' ? 'desc' : 'asc') : 'asc';
		navigate({ sort_by: col, sort_dir: nextDir, page: 1 });
	}

	function sortIcon(col: string) {
		if ((data.sort?.by ?? 'created_at') !== col) return '↕';
		return data.sort?.dir === 'asc' ? '↑' : '↓';
	}

	function openModal(mode: 'add' | 'edit', product: Product | null = null) {
		modalMode = mode;
		globalMessage = null;
		compressedImageFile = null;
		isCompressing = false;
		compressionError = null;
		imagePreviewUrl = null;
		removeImageFlag = false;
		isVendorDropdownOpen = false;
		isCustomerDropdownOpen = false;

		if (mode === 'edit' && product) {
			selectedProduct = { ...product };
			imagePreviewUrl = product.image_url;
			vendorSearchText =
				data.vendors?.find((v: Vendor) => v.id === product.preferred_vendor_id)?.name || '';
			customerSearchText =
				data.customers?.find((c: Customer) => c.id === product.preferred_customer_id)?.name || '';
		} else {
			selectedProduct = {
				sku: '',
				name: '',
				product_type: 'Stock',
				is_active: true,
				quantity_on_hand: 0
			} as any;
			vendorSearchText = '';
			customerSearchText = '';
		}
	}

	function closeModal() {
		modalMode = null;
		selectedProduct = null;
	}

	function openDetailModal(product: Product) {
		productToView = product;
	}
	function closeDetailModal() {
		productToView = null;
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

	// --- Image ---
	async function onFileSelected(event: Event) {
		const input = event.target as HTMLInputElement;
		removeImageFlag = false;
		if (input.files && input.files.length > 0) {
			const file = input.files[0];
			if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
				compressionError = 'Please select a valid image file (JPG, PNG, WEBP).';
				compressedImageFile = null;
				imagePreviewUrl = selectedProduct?.image_url || null;
				return;
			}
			isCompressing = true;
			compressionError = null;
			try {
				const compressed = await compressImage(file, {
					maxWidth: 800,
					maxHeight: 800,
					quality: 0.8
				});
				compressedImageFile = compressed;
				imagePreviewUrl = URL.createObjectURL(compressed);
			} catch (err) {
				console.error('Image compression failed:', err);
				compressionError = 'Error compressing image.';
				compressedImageFile = null;
				imagePreviewUrl = selectedProduct?.image_url || null;
			} finally {
				isCompressing = false;
			}
		} else {
			compressedImageFile = null;
			imagePreviewUrl = selectedProduct?.image_url || null;
		}
	}

	function flagToRemoveImage() {
		if (modalMode === 'edit') {
			removeImageFlag = true;
			compressedImageFile = null;
			imagePreviewUrl = null;
			const fileInput = document.getElementById('image') as HTMLInputElement;
			if (fileInput) fileInput.value = '';
		}
	}

	// --- Formatters ---
	function formatCurrency(value: number | null | undefined, defaultValue: string = '-') {
		if (value === null || value === undefined) return defaultValue;
		return new Intl.NumberFormat($locale === 'th' ? 'th-TH' : 'en-US', {
			style: 'decimal',
			minimumFractionDigits: 2,
			maximumFractionDigits: 4
		}).format(value);
	}
	function formatQuantity(value: number | null | undefined, defaultValue: string = '-') {
		if (value === null || value === undefined) return defaultValue;
		return new Intl.NumberFormat($locale === 'th' ? 'th-TH' : 'en-US', {
			style: 'decimal',
			minimumFractionDigits: 0,
			maximumFractionDigits: 4
		}).format(value);
	}
	function formatDate(d: string | null | undefined) {
		if (!d) return '-';
		const dt = new Date(d);
		if (isNaN(dt.getTime())) return '-';
		return dt.toLocaleString($locale === 'th' ? 'th-TH' : 'en-US');
	}

	function calcMargin(p: { purchase_cost?: number | null; selling_price?: number | null } | null) {
		const cost = p?.purchase_cost;
		const price = p?.selling_price;
		if (cost === null || cost === undefined || price === null || price === undefined) return null;
		if (price === 0) return null;
		return ((Number(price) - Number(cost)) / Number(price)) * 100;
	}

	function stockBadge(p: Product) {
		if (p.product_type !== 'Stock') return null;
		const qty = Number(p.quantity_on_hand ?? 0);
		const ro = p.reorder_level !== null && p.reorder_level !== undefined ? Number(p.reorder_level) : null;
		if (qty <= 0) return { label: $t('Out of Stock'), cls: 'bg-red-100 text-red-700 border-red-200' };
		if (ro !== null && qty <= ro)
			return { label: $t('Low Stock'), cls: 'bg-amber-100 text-amber-800 border-amber-200' };
		return { label: $t('In Stock'), cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
	}

	const costExceedsPrice = $derived(() => {
		const cost = Number(selectedProduct?.purchase_cost ?? 0);
		const price = Number(selectedProduct?.selling_price ?? 0);
		return cost > 0 && price > 0 && cost > price;
	});

	// --- Selection (bulk) ---
	function toggleSelectAllOnPage() {
		if (allOnPageSelected) {
			for (const p of filteredProducts as Product[]) selectedIds.delete(p.id);
		} else {
			for (const p of filteredProducts as Product[]) selectedIds.add(p.id);
		}
		selectedIds = new Set(selectedIds);
	}
	function toggleSelect(id: number) {
		if (selectedIds.has(id)) selectedIds.delete(id);
		else selectedIds.add(id);
		selectedIds = new Set(selectedIds);
	}
	function clearSelection() {
		selectedIds = new Set();
	}

	// --- Reactive Effects ---
	$effect.pre(() => {
		if (
			form?.action === 'saveProduct' ||
			form?.action === 'deleteProduct' ||
			form?.action === 'duplicateProduct' ||
			form?.action === 'bulkAction' ||
			form?.action === 'adjustStock'
		) {
			if (form.success) {
				if (form.action === 'saveProduct') closeModal();
				if (form.action === 'deleteProduct') productToDelete = null;
				if (form.action === 'bulkAction') {
					bulkConfirm = null;
					clearSelection();
				}
				if (form.action === 'adjustStock') productToAdjust = null;
				showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
			}
			form.action = undefined;
		}

		let currentPreview = imagePreviewUrl;
		return () => {
			if (currentPreview && currentPreview.startsWith('blob:')) {
				URL.revokeObjectURL(currentPreview);
			}
		};
	});

	// --- Pagination ---
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

	function getPageUrl(pageNum: number) {
		return '/products?' + buildParams({ page: pageNum }).toString();
	}

	// Stock adjustment local state
	let adjustMode = $state<'set' | 'delta'>('delta');
	let adjustValue = $state<number | null>(null);
	let adjustMovementType = $state('adjustment');
	let adjustNotes = $state('');
	function openAdjust(p: Product) {
		productToAdjust = p;
		adjustMode = 'delta';
		adjustValue = null;
		adjustMovementType = 'adjustment';
		adjustNotes = '';
	}
</script>

<svelte:head>
	<title>{$t('Products')}</title>
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
		<h1 class="text-2xl font-bold text-gray-800">{$t('Products')}</h1>
		<p class="mt-1 text-sm text-gray-500">{$t('Manage products and services')}</p>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		{#if data.can?.import}
			<button
				type="button"
				onclick={() => (showImportModal = true)}
				class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				{$t('Import')}
			</button>
		{/if}
		<form method="POST" action="/products/export">
			<input type="hidden" name="search" value={searchQuery} />
			<input type="hidden" name="type" value={filterType} />
			<input type="hidden" name="category" value={filterCategory} />
			<input type="hidden" name="active" value={filterActive} />
			<input type="hidden" name="stock" value={filterStock} />
			<button
				type="submit"
				class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
				</svg>
				{$t('Export to CSV')}
			</button>
		</form>
		<button
			onclick={() => openModal('add')}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700"
		>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4">
				<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
			</svg>
			{$t('Add New Product')}
		</button>
	</div>
</div>

<!-- Stats / Quick filter chips -->
<div class="mb-3 flex flex-wrap items-center gap-2">
	<button
		type="button"
		onclick={() => applyFilter('stock', filterStock === 'low' ? null : 'low')}
		class="rounded-full border px-3 py-1 text-xs font-medium {filterStock === 'low' ? 'border-amber-400 bg-amber-100 text-amber-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}"
	>
		⚠ {$t('Low Stock')}: {data.stats?.low_stock ?? 0}
	</button>
	<button
		type="button"
		onclick={() => applyFilter('stock', filterStock === 'out' ? null : 'out')}
		class="rounded-full border px-3 py-1 text-xs font-medium {filterStock === 'out' ? 'border-red-400 bg-red-100 text-red-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}"
	>
		✕ {$t('Out of Stock')}: {data.stats?.out_stock ?? 0}
	</button>
	<button
		type="button"
		onclick={() => applyFilter('active', filterActive === '0' ? null : '0')}
		class="rounded-full border px-3 py-1 text-xs font-medium {filterActive === '0' ? 'border-gray-500 bg-gray-200 text-gray-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}"
	>
		{$t('Inactive')}: {data.stats?.inactive_count ?? 0}
	</button>
	<span class="ml-auto text-xs text-gray-500">{$t('Total')}: {data.stats?.total_count ?? 0}</span>
</div>

<!-- Search + filter row -->
<div class="mb-4 grid grid-cols-1 gap-2 md:grid-cols-12">
	<div class="relative md:col-span-5">
		<input
			type="search"
			name="search"
			bind:value={searchQuery}
			oninput={handleSearchInput}
			placeholder={$t('Search Product Placeholder')}
			class="w-full rounded-lg border-gray-300 py-2 pr-4 pl-10 text-sm focus:border-blue-500 focus:ring-blue-500"
		/>
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<svg class="h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
				<path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
			</svg>
		</div>
	</div>
	<select
		bind:value={filterType}
		onchange={() => applyFilter('type', filterType || null)}
		class="rounded-lg border-gray-300 text-sm md:col-span-2"
	>
		<option value="">{$t('All Types')}</option>
		<option value="Stock">{$t('Stock (Inventory)')}</option>
		<option value="NonStock">{$t('Non-Stock')}</option>
		<option value="Service">{$t('Service')}</option>
	</select>
	<select
		bind:value={filterCategory}
		onchange={() => applyFilter('category', filterCategory || null)}
		class="rounded-lg border-gray-300 text-sm md:col-span-2"
	>
		<option value="">{$t('All Categories')}</option>
		<option value="none">{$t('No Category')}</option>
		{#each data.categories as cat (cat.id)}
			<option value={String(cat.id)}>{cat.name}</option>
		{/each}
	</select>
	<select
		bind:value={filterActive}
		onchange={() => applyFilter('active', filterActive || null)}
		class="rounded-lg border-gray-300 text-sm md:col-span-1"
	>
		<option value="">{$t('All Status')}</option>
		<option value="1">{$t('Active')}</option>
		<option value="0">{$t('Inactive')}</option>
	</select>
	<select
		value={String(data.limit ?? 10)}
		onchange={(e) => navigate({ limit: (e.target as HTMLSelectElement).value, page: 1 })}
		class="rounded-lg border-gray-300 text-sm md:col-span-1"
	>
		{#each [10, 20, 50, 200] as n}
			<option value={String(n)}>{n}/page</option>
		{/each}
	</select>
	<button
		type="button"
		onclick={clearAllFilters}
		class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 md:col-span-1"
	>
		{$t('Clear')}
	</button>
</div>

<!-- Bulk actions toolbar -->
{#if selectedIds.size > 0}
	<div
		transition:slide
		class="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2"
	>
		<span class="text-sm font-medium text-blue-900">
			{selectedIds.size} {$t('selected')}
		</span>
		<button
			type="button"
			onclick={() => (bulkConfirm = { op: 'activate', count: selectedIds.size })}
			class="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
		>
			{$t('Activate')}
		</button>
		<button
			type="button"
			onclick={() => (bulkConfirm = { op: 'deactivate', count: selectedIds.size })}
			class="rounded-md bg-gray-600 px-3 py-1 text-xs font-semibold text-white hover:bg-gray-700"
		>
			{$t('Deactivate')}
		</button>
		<button
			type="button"
			onclick={() => (bulkConfirm = { op: 'delete', count: selectedIds.size })}
			class="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
		>
			{$t('Delete')}
		</button>
		<button
			type="button"
			onclick={clearSelection}
			class="ml-auto text-xs text-blue-900 hover:underline"
		>
			{$t('Clear selection')}
		</button>
	</div>
{/if}

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="w-10 px-4 py-3 text-left">
					<input
						type="checkbox"
						checked={allOnPageSelected}
						onchange={toggleSelectAllOnPage}
						class="h-4 w-4 rounded border-gray-300"
					/>
				</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Image')}</th>
				<th class="cursor-pointer px-4 py-3 text-left font-semibold text-gray-600 hover:text-blue-600" onclick={() => toggleSort('sku')}>
					{$t('SKU')} <span class="text-xs">{sortIcon('sku')}</span>
				</th>
				<th class="cursor-pointer px-4 py-3 text-left font-semibold text-gray-600 hover:text-blue-600" onclick={() => toggleSort('name')}>
					{$t('Name')} <span class="text-xs">{sortIcon('name')}</span>
				</th>
				<th class="cursor-pointer px-4 py-3 text-left font-semibold text-gray-600 hover:text-blue-600" onclick={() => toggleSort('product_type')}>
					{$t('Type')} <span class="text-xs">{sortIcon('product_type')}</span>
				</th>
				<th class="cursor-pointer px-4 py-3 text-left font-semibold text-gray-600 hover:text-blue-600" onclick={() => toggleSort('category_name')}>
					{$t('Category')} <span class="text-xs">{sortIcon('category_name')}</span>
				</th>
				<th class="cursor-pointer px-4 py-3 text-right font-semibold text-gray-600 hover:text-blue-600" onclick={() => toggleSort('quantity_on_hand')}>
					{$t('Qty on Hand')} <span class="text-xs">{sortIcon('quantity_on_hand')}</span>
				</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Unit')}</th>
				<th class="cursor-pointer px-4 py-3 text-right font-semibold text-gray-600 hover:text-blue-600" onclick={() => toggleSort('purchase_cost')}>
					{$t('Cost')} <span class="text-xs">{sortIcon('purchase_cost')}</span>
				</th>
				<th class="cursor-pointer px-4 py-3 text-right font-semibold text-gray-600 hover:text-blue-600" onclick={() => toggleSort('selling_price')}>
					{$t('Price')} <span class="text-xs">{sortIcon('selling_price')}</span>
				</th>
				<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('Margin')}</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Stock')}</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Active')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Actions')}</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if filteredProducts.length === 0}
				<tr>
					<td colspan="14" class="py-12 text-center text-gray-500">
						{#if data.searchQuery}{$t('No products found for:')} "{data.searchQuery}"{:else}{$t('No product data found')}{/if}
					</td>
				</tr>
			{:else}
				{#each filteredProducts as product (product.id)}
					{@const badge = stockBadge(product)}
					{@const margin = calcMargin(product)}
					<tr class="hover:bg-gray-50 {selectedIds.has(product.id) ? 'bg-blue-50/40' : ''}">
						<td class="px-4 py-2">
							<input
								type="checkbox"
								checked={selectedIds.has(product.id)}
								onchange={() => toggleSelect(product.id)}
								class="h-4 w-4 rounded border-gray-300"
							/>
						</td>
						<td class="px-4 py-2">
							<div class="flex h-10 w-10 items-center justify-center overflow-hidden rounded border bg-gray-50">
								{#if product.image_url}
									<img src={product.image_url} alt={product.name} class="h-full w-full object-contain" loading="lazy" />
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-5 w-5 text-gray-400">
										<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
									</svg>
								{/if}
							</div>
						</td>
						<td class="px-4 py-3 font-mono text-xs text-gray-700">
							{product.sku}
							{#if product.barcode}
								<div class="text-[10px] text-gray-400">📊 {product.barcode}</div>
							{/if}
						</td>
						<td
							class="max-w-xs cursor-pointer truncate px-4 py-3 font-medium text-gray-900 hover:text-blue-600 hover:underline"
							title={product.name}
							onclick={() => openDetailModal(product)}
							onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openDetailModal(product)}
							role="button"
							tabindex="0"
						>
							{product.name}
						</td>
						<td class="px-4 py-3 text-xs text-gray-600">{product.product_type}</td>
						<td class="max-w-[150px] truncate px-4 py-3 text-gray-600">{product.category_name ?? '-'}</td>
						<td class="px-4 py-3 text-right font-medium text-blue-700">{formatQuantity(product.quantity_on_hand, '0')}</td>
						<td class="px-4 py-3 text-xs text-gray-500">{product.unit_symbol ?? '-'}</td>
						<td class="px-4 py-3 text-right text-gray-600">{formatCurrency(product.purchase_cost)}</td>
						<td class="px-4 py-3 text-right font-medium text-green-700">{formatCurrency(product.selling_price)}</td>
						<td class="px-4 py-3 text-right text-xs">
							{#if margin !== null}
								<span class={margin < 0 ? 'font-semibold text-red-600' : 'text-gray-600'}>
									{margin.toFixed(1)}%
								</span>
							{:else}
								<span class="text-gray-300">-</span>
							{/if}
						</td>
						<td class="px-4 py-3 text-center">
							{#if badge}
								<span class="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold {badge.cls}">
									{badge.label}
								</span>
							{:else}
								<span class="text-xs text-gray-300">-</span>
							{/if}
						</td>
						<td class="px-4 py-3 text-center">
							{#if product.is_active}<span class="text-green-600">✓</span>{:else}<span class="text-red-500">✕</span>{/if}
						</td>
						<td class="px-4 py-3 whitespace-nowrap">
							<div class="flex items-center gap-1">
								<button
									onclick={() => openModal('edit', product)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
									aria-label={$t('Edit Product')}
									title={$t('Edit Product')}
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
									</svg>
								</button>
								<form method="POST" action="?/duplicateProduct" use:enhance class="inline">
									<input type="hidden" name="id" value={product.id} />
									<button
										type="submit"
										class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-indigo-600"
										aria-label={$t('Duplicate Product')}
										title={$t('Duplicate Product')}
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
										</svg>
									</button>
								</form>
								<button
									onclick={() => (productToPrint = product)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-purple-600"
									aria-label={$t('Print Label')}
									title={$t('Print Label')}
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect width="12" height="8" x="6" y="14" />
									</svg>
								</button>
								{#if product.product_type === 'Stock' && data.can?.adjustStock}
									<button
										onclick={() => openAdjust(product)}
										class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-amber-600"
										aria-label={$t('Adjust Stock')}
										title={$t('Adjust Stock')}
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M3 6h18M3 12h18M3 18h12" />
										</svg>
									</button>
								{/if}
								{#if data.can?.viewHistory && product.product_type === 'Stock'}
									<a
										href={`/products/${product.id}/movements`}
										class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-cyan-600"
										aria-label={$t('Stock History')}
										title={$t('Stock History')}
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
										</svg>
									</a>
								{/if}
								<button
									onclick={() => (productToDelete = product)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
									aria-label={$t('Delete')}
									title={$t('Delete')}
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
									</svg>
								</button>
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
				{$t('of')} <span class="font-medium">{data.totalPages}</span> {$t('pages')}
			</p>
		</div>
		<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
			<a
				href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'}
				class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage === 1 ? 'pointer-events-none opacity-50' : ''}"
			>
				<span class="sr-only">{$t('Previous')}</span>
				<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" /></svg>
			</a>
			{#each paginationRange as pageNum}
				{#if typeof pageNum === 'string'}
					<span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 ring-inset">...</span>
				{:else}
					<a href={getPageUrl(pageNum)} class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum === data.currentPage ? 'z-10 bg-blue-600 text-white' : 'text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-50'}">{pageNum}</a>
				{/if}
			{/each}
			<a
				href={data.currentPage < data.totalPages ? getPageUrl(data.currentPage + 1) : '#'}
				class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage === data.totalPages ? 'pointer-events-none opacity-50' : ''}"
			>
				<span class="sr-only">{$t('Next')}</span>
				<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" /></svg>
			</a>
		</nav>
	</div>
{/if}

<!-- Add / Edit Modal -->
{#if modalMode && selectedProduct}
	<div transition:slide class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div class="relative flex max-h-[85vh] w-full max-w-7xl transform flex-col rounded-xl bg-white shadow-2xl">
			<div class="flex-shrink-0 border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? $t('Add New Product/Service') : $t('Edit Product/Service')}
				</h2>
			</div>

			<form
				method="POST"
				action="?/saveProduct"
				enctype="multipart/form-data"
				use:enhance={({ formData }) => {
					isSaving = true;
					if (compressedImageFile) formData.set('image', compressedImageFile, compressedImageFile.name);
					else if (removeImageFlag && modalMode === 'edit') formData.set('remove_image', 'true');
					if (modalMode === 'edit' && selectedProduct?.image_url) {
						formData.set('existing_image_url', selectedProduct.image_url);
					}
					return async ({ update }) => {
						await update({ reset: false });
						isSaving = false;
					};
				}}
				class="flex-1 overflow-y-auto"
			>
				<div class="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
					<div class="space-y-4 lg:col-span-2">
						{#if modalMode === 'edit'}
							<input type="hidden" name="id" value={selectedProduct.id} />
						{/if}

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<div>
								<label for="sku" class="mb-1 block text-sm font-medium">{$t('SKU')}</label>
								<input
									type="text"
									name="sku"
									id="sku"
									value={modalMode === 'add' ? $t('(Auto-generated)') : selectedProduct.sku}
									class="w-full rounded-md border-gray-300 bg-gray-100 text-sm"
									readonly
								/>
							</div>
							<div>
								<label for="barcode" class="mb-1 block text-sm font-medium">{$t('Barcode')}</label>
								<input
									type="text"
									name="barcode"
									id="barcode"
									bind:value={selectedProduct.barcode}
									placeholder={$t('Optional')}
									class="w-full rounded-md border-gray-300 text-sm"
								/>
							</div>
							<div>
								<label for="name" class="mb-1 block text-sm font-medium">{$t('Name *')}</label>
								<input
									type="text"
									name="name"
									id="name"
									required
									bind:value={selectedProduct.name}
									class="w-full rounded-md border-gray-300 text-sm"
								/>
							</div>
						</div>

						<div>
							<label for="description" class="mb-1 block text-sm font-medium">{$t('Description')}</label>
							<textarea
								name="description"
								id="description"
								rows="3"
								bind:value={selectedProduct.description}
								class="w-full rounded-md border-gray-300 text-sm"
							></textarea>
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="product_type" class="mb-1 block text-sm font-medium">{$t('Product Type *')}</label>
								<select
									name="product_type"
									id="product_type"
									required
									bind:value={selectedProduct.product_type}
									class="w-full rounded-md border-gray-300 text-sm"
								>
									<option value="Stock">{$t('Stock (Inventory)')}</option>
									<option value="NonStock">{$t('Non-Stock')}</option>
									<option value="Service">{$t('Service')}</option>
								</select>
							</div>
							<div>
								<label for="category_id" class="mb-1 block text-sm font-medium">{$t('Category')}</label>
								<select
									name="category_id"
									id="category_id"
									bind:value={selectedProduct.category_id}
									class="w-full rounded-md border-gray-300 text-sm"
								>
									<option value={null}>{$t('-- None --')}</option>
									{#each data.categories as category (category.id)}
										<option value={category.id}>{category.name}</option>
									{/each}
								</select>
							</div>
						</div>

						<fieldset class="rounded-md border p-4">
							<legend class="px-1 text-sm font-medium">{$t('Units')}</legend>
							<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
								<div>
									<label for="unit_id" class="mb-1 block text-xs font-medium">
										{$t('Base Unit *')} <span class="text-gray-500">{$t('(Required)')}</span>
									</label>
									<select name="unit_id" id="unit_id" required bind:value={selectedProduct.unit_id} class="w-full rounded-md border-gray-300 text-sm">
										<option value={undefined} disabled>{$t('Select Unit')}</option>
										{#each data.units as unit (unit.id)}
											<option value={unit.id}>{unit.name} ({unit.symbol})</option>
										{/each}
									</select>
								</div>
								<div>
									<label for="purchase_unit_id" class="mb-1 block text-xs font-medium">{$t('Purchase Unit')}</label>
									<select name="purchase_unit_id" id="purchase_unit_id" bind:value={selectedProduct.purchase_unit_id} class="w-full rounded-md border-gray-300 text-sm">
										<option value={null}>{$t('-- Same as Base --')}</option>
										{#each data.units as unit (unit.id)}
											<option value={unit.id}>{unit.name} ({unit.symbol})</option>
										{/each}
									</select>
								</div>
								<div>
									<label for="sales_unit_id" class="mb-1 block text-xs font-medium">{$t('Sales Unit')}</label>
									<select name="sales_unit_id" id="sales_unit_id" bind:value={selectedProduct.sales_unit_id} class="w-full rounded-md border-gray-300 text-sm">
										<option value={null}>{$t('-- Same as Base --')}</option>
										{#each data.units as unit (unit.id)}
											<option value={unit.id}>{unit.name} ({unit.symbol})</option>
										{/each}
									</select>
								</div>
							</div>
						</fieldset>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<div>
								<label for="purchase_cost" class="mb-1 block text-sm font-medium">{$t('Purchase Cost')}</label>
								<input type="number" step="any" name="purchase_cost" id="purchase_cost" bind:value={selectedProduct.purchase_cost} placeholder="0.00" class="w-full rounded-md border-gray-300 text-sm" />
							</div>
							<div>
								<label for="selling_price" class="mb-1 block text-sm font-medium">{$t('Selling Price')}</label>
								<input type="number" step="any" name="selling_price" id="selling_price" bind:value={selectedProduct.selling_price} placeholder="0.00" class="w-full rounded-md border-gray-300 text-sm" />
							</div>
							<div>
								<label for="tax_rate" class="mb-1 block text-sm font-medium">{$t('Tax Rate (%)')}</label>
								<input type="number" step="any" name="tax_rate" id="tax_rate" bind:value={selectedProduct.tax_rate} placeholder="e.g. 7" class="w-full rounded-md border-gray-300 text-sm" />
							</div>
						</div>

						{#if costExceedsPrice()}
							<div transition:slide class="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
								⚠ {$t('Purchase cost is higher than selling price. Margin will be negative.')}
							</div>
						{/if}

						{#if selectedProduct.product_type === 'Stock'}
							<div transition:slide class="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
								<div>
									<label for="quantity_on_hand" class="mb-1 block text-sm font-medium">{$t('Quantity on Hand')}</label>
									<input type="number" step="any" name="quantity_on_hand" id="quantity_on_hand" bind:value={selectedProduct.quantity_on_hand} class="w-full rounded-md border-gray-300 text-sm" />
									<p class="mt-1 text-xs text-gray-500">{$t('In Base Unit.')}</p>
								</div>
								<div>
									<label for="reorder_level" class="mb-1 block text-sm font-medium">{$t('Reorder Level')}</label>
									<input type="number" step="any" name="reorder_level" id="reorder_level" bind:value={selectedProduct.reorder_level} placeholder={$t('Optional')} class="w-full rounded-md border-gray-300 text-sm" />
									<p class="mt-1 text-xs text-gray-500">{$t('In Base Unit.')}</p>
								</div>
							</div>
						{/if}

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div class="relative">
								<label for="preferred_vendor_id" class="mb-1 block text-sm font-medium">{$t('Preferred Vendor')}</label>
								<input type="hidden" name="preferred_vendor_id" value={selectedProduct?.preferred_vendor_id || ''} />
								<input
									type="text"
									placeholder={$t('-- Search or select Vendor --')}
									bind:value={vendorSearchText}
									onfocus={() => (isVendorDropdownOpen = true)}
									onblur={() => setTimeout(() => (isVendorDropdownOpen = false), 200)}
									oninput={() => { selectedProduct!.preferred_vendor_id = null; isVendorDropdownOpen = true; }}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
								{#if isVendorDropdownOpen}
									<ul class="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
										<li>
											<button type="button" class="w-full px-3 py-2 text-left hover:bg-blue-600 hover:text-white" onclick={() => { selectedProduct!.preferred_vendor_id = null; vendorSearchText = ''; isVendorDropdownOpen = false; }}>
												{$t('-- None --')}
											</button>
										</li>
										{#each filteredVendors as vendor (vendor.id)}
											<li>
												<button type="button" class="w-full px-3 py-2 text-left hover:bg-blue-600 hover:text-white" onclick={() => { selectedProduct!.preferred_vendor_id = vendor.id; vendorSearchText = vendor.name; isVendorDropdownOpen = false; }}>
													{vendor.name}
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							</div>

							<div class="relative">
								<label for="preferred_customer_id" class="mb-1 block text-sm font-medium">{$t('Preferred Customer')}</label>
								<input type="hidden" name="preferred_customer_id" value={selectedProduct?.preferred_customer_id || ''} />
								<input
									type="text"
									placeholder={$t('-- Search or select Customer --')}
									bind:value={customerSearchText}
									onfocus={() => (isCustomerDropdownOpen = true)}
									onblur={() => setTimeout(() => (isCustomerDropdownOpen = false), 200)}
									oninput={() => { selectedProduct!.preferred_customer_id = null; isCustomerDropdownOpen = true; }}
									class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
								/>
								{#if isCustomerDropdownOpen}
									<ul class="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
										<li>
											<button type="button" class="w-full px-3 py-2 text-left hover:bg-blue-600 hover:text-white" onclick={() => { selectedProduct!.preferred_customer_id = null; customerSearchText = ''; isCustomerDropdownOpen = false; }}>
												{$t('-- None --')}
											</button>
										</li>
										{#each filteredCustomers as customer (customer.id)}
											<li>
												<button type="button" class="w-full px-3 py-2 text-left hover:bg-blue-600 hover:text-white" onclick={() => { selectedProduct!.preferred_customer_id = customer.id; customerSearchText = customer.name; isCustomerDropdownOpen = false; }}>
													{customer.name}
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</div>

						<fieldset class="rounded-md border p-4">
							<legend class="px-1 text-sm font-medium">{$t('Accounting Links')}</legend>
							<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
								<div>
									<label for="asset_account_id" class="mb-1 block text-xs font-medium">
										{$t('Asset Account')} <span class="text-gray-500">{$t('(Stock)')}</span>
									</label>
									<select name="asset_account_id" id="asset_account_id" bind:value={selectedProduct.asset_account_id} class="w-full rounded-md border-gray-300 text-sm">
										<option value={null}>{$t('-- None --')}</option>
										{#each data.accounts as acc (acc.id)}
											<option value={acc.id}>{acc.account_code} - {acc.account_name}</option>
										{/each}
									</select>
								</div>
								<div>
									<label for="income_account_id" class="mb-1 block text-xs font-medium">
										{$t('Income Account')} <span class="text-gray-500">{$t('(Sales)')}</span>
									</label>
									<select name="income_account_id" id="income_account_id" bind:value={selectedProduct.income_account_id} class="w-full rounded-md border-gray-300 text-sm">
										<option value={null}>{$t('-- None --')}</option>
										{#each data.accounts as acc (acc.id)}
											<option value={acc.id}>{acc.account_code} - {acc.account_name}</option>
										{/each}
									</select>
								</div>
								<div>
									<label for="expense_account_id" class="mb-1 block text-xs font-medium">
										{$t('Expense/COGS Acct')} <span class="text-gray-500">{$t('(Purchase/Cost)')}</span>
									</label>
									<select name="expense_account_id" id="expense_account_id" bind:value={selectedProduct.expense_account_id} class="w-full rounded-md border-gray-300 text-sm">
										<option value={null}>{$t('-- None --')}</option>
										{#each data.accounts as acc (acc.id)}
											<option value={acc.id}>{acc.account_code} - {acc.account_name}</option>
										{/each}
									</select>
								</div>
							</div>
						</fieldset>

						<div class="flex items-center">
							<input type="checkbox" name="is_active" id="is_active_modal" bind:checked={selectedProduct.is_active} class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
							<label for="is_active_modal" class="ml-2 block text-sm text-gray-900">{$t('Active (can be sold/purchased)')}</label>
						</div>
					</div>

					<div class="space-y-2 lg:col-span-1">
						<label for="image" class="block text-sm font-medium text-gray-700">{$t('Product Image')}</label>
						<div class="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-gray-50">
							{#if imagePreviewUrl}
								<img src={imagePreviewUrl} alt="Product preview" class="h-full w-full object-contain" />
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-16 w-16 text-gray-300">
									<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
								</svg>
							{/if}
						</div>
						<input type="file" name="image" id="image" accept="image/png, image/jpeg, image/webp" onchange={onFileSelected} class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100" />
						{#if isCompressing}<p class="text-xs text-blue-600">{$t('Compressing image...')}</p>{/if}
						{#if compressionError}<p class="text-xs text-red-600">{$t(compressionError)}</p>{/if}
						{#if compressedImageFile && !isCompressing}<p class="text-xs text-green-600">{$t('Image ready to upload.')}</p>{/if}
						{#if modalMode === 'edit' && selectedProduct.image_url && !removeImageFlag}
							<button type="button" onclick={flagToRemoveImage} class="mt-2 text-xs text-red-600 hover:underline">{$t('Remove current image')}</button>
						{/if}
						{#if removeImageFlag}
							<p class="mt-1 text-xs text-orange-600">{$t('Current image will be removed upon saving.')}</p>
						{/if}
					</div>
				</div>

				<div class="sticky bottom-0 flex flex-shrink-0 justify-end gap-3 border-t bg-gray-50 p-4">
					<button type="button" onclick={closeModal} class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50">{$t('Cancel')}</button>
					<button type="submit" disabled={isSaving || isCompressing} class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-400">
						{#if isSaving}{$t('Saving...')}{:else if isCompressing}{$t('Compressing...')}{:else}{$t('Save Product')}{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Detail Modal -->
{#if productToView}
	<div transition:fade={{ duration: 150 }} class="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
		<div class="fixed inset-0" onclick={closeDetailModal} role="presentation"></div>
		<div class="relative flex max-h-[85vh] w-full max-w-7xl flex-col rounded-xl bg-white shadow-2xl" transition:slide={{ duration: 200 }}>
			<div class="flex flex-shrink-0 items-start justify-between border-b p-4">
				<div>
					<h2 class="text-xl font-bold text-gray-900">{productToView.name}</h2>
					<p class="font-mono text-sm text-gray-500">{productToView.sku}{#if productToView.barcode} · {productToView.barcode}{/if}</p>
				</div>
				<button onclick={closeDetailModal} class="-m-2 p-2 text-gray-400 hover:text-gray-600" aria-label="Close">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			<div class="flex-1 space-y-4 overflow-y-auto p-6 text-sm">
				<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
					<div class="flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-gray-50 md:col-span-1">
						{#if productToView.image_url}
							<img src={productToView.image_url} alt={productToView.name} class="h-full w-full object-contain" />
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-16 w-16 text-gray-300">
								<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
							</svg>
						{/if}
					</div>
					<div class="grid grid-cols-2 gap-x-4 gap-y-3 md:col-span-2">
						<div><strong class="block text-gray-500">{$t('Type')}:</strong> {productToView.product_type}</div>
						<div><strong class="block text-gray-500">{$t('Category')}:</strong> {productToView.category_name ?? '-'}</div>
						<div><strong class="block text-gray-500">{$t('Base Unit *')}:</strong> {productToView.unit_symbol ?? '-'}</div>
						{#if productToView.product_type === 'Stock'}
							<div><strong class="block text-gray-500">{$t('Qty on Hand')}:</strong> {formatQuantity(productToView.quantity_on_hand, '0')}</div>
							<div><strong class="block text-gray-500">{$t('Reorder Level')}:</strong> {formatQuantity(productToView.reorder_level)}</div>
						{/if}
						<div><strong class="block text-gray-500">{$t('Purchase Unit')}:</strong> {productToView.purchase_unit_symbol ?? productToView.unit_symbol ?? '-'}</div>
						<div><strong class="block text-gray-500">{$t('Sales Unit')}:</strong> {productToView.sales_unit_symbol ?? productToView.unit_symbol ?? '-'}</div>
						<div><strong class="block text-gray-500">{$t('Purchase Cost')}:</strong> {formatCurrency(productToView.purchase_cost)}</div>
						<div><strong class="block text-gray-500">{$t('Selling Price')}:</strong> {formatCurrency(productToView.selling_price)}</div>
						<div><strong class="block text-gray-500">{$t('Tax Rate (%)')}:</strong> {productToView.tax_rate ?? '-'}</div>
						<div>
							<strong class="block text-gray-500">{$t('Margin')}:</strong>
							{#if calcMargin(productToView) !== null}
								{calcMargin(productToView)?.toFixed(2)}%
							{:else}-{/if}
						</div>
						<div><strong class="block text-gray-500">{$t('Preferred Vendor')}:</strong> {productToView.vendor_name ?? '-'}</div>
						<div><strong class="block text-gray-500">{$t('Preferred Customer')}:</strong> {productToView.customer_name ?? '-'}</div>
						<div><strong class="block text-gray-500">{$t('Status:')}</strong>
							<span class={productToView.is_active ? 'text-green-700' : 'text-red-600'}>{productToView.is_active ? $t('Active') : $t('Inactive')}</span>
						</div>
						<div><strong class="block text-gray-500">{$t('Created at')}:</strong> {formatDate(productToView.created_at)}</div>
						<div><strong class="block text-gray-500">{$t('Updated at')}:</strong> {formatDate(productToView.updated_at)}</div>
					</div>
				</div>

				{#if productToView.description}
					<div>
						<strong class="mb-1 block text-gray-500">{$t('Description')}:</strong>
						<p class="whitespace-pre-wrap text-gray-700">{productToView.description}</p>
					</div>
				{/if}

				<div class="border-t pt-4">
					<h4 class="mb-2 font-medium text-gray-700">{$t('Accounting Links')}</h4>
					<div class="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
						<div><strong class="block text-gray-500">{$t('Asset Account')}:</strong>
							{productToView.asset_account_code ? `${productToView.asset_account_code} - ${productToView.asset_account_name}` : '-'}
						</div>
						<div><strong class="block text-gray-500">{$t('Income Account')}:</strong>
							{productToView.income_account_code ? `${productToView.income_account_code} - ${productToView.income_account_name}` : '-'}
						</div>
						<div><strong class="block text-gray-500">{$t('Expense/COGS Acct')}:</strong>
							{productToView.expense_account_code ? `${productToView.expense_account_code} - ${productToView.expense_account_name}` : '-'}
						</div>
					</div>
				</div>
			</div>

			<div class="flex flex-shrink-0 justify-end gap-3 border-t bg-gray-50 p-4">
				<button type="button" onclick={closeDetailModal} class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50">{$t('Close')}</button>
				<button type="button" onclick={() => { closeDetailModal(); openModal('edit', productToView); }} class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">{$t('Edit Product')}</button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Confirm -->
{#if productToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">{$t('Confirm Delete')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				{$t('Are you sure you want to delete product:')} <br />
				<strong class="font-mono text-xs">{productToDelete.sku} - {productToDelete.name}</strong>?
				<br />{$t('This action cannot be undone.')}
			</p>
			{#if form?.message && !form.success && form.action === 'deleteProduct'}
				<p class="mt-2 text-sm text-red-600"><strong>{$t('Error:')}</strong> {form.message}</p>
			{/if}
			<form method="POST" action="?/deleteProduct" use:enhance class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="id" value={productToDelete.id} />
				<button type="button" onclick={() => (productToDelete = null)} class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50">{$t('Cancel')}</button>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700">{$t('Delete')}</button>
			</form>
		</div>
	</div>
{/if}

<!-- Bulk Confirm -->
{#if bulkConfirm}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">
				{#if bulkConfirm.op === 'delete'}{$t('Confirm Delete')}{:else if bulkConfirm.op === 'activate'}{$t('Activate')}{:else}{$t('Deactivate')}{/if}
			</h3>
			<p class="mt-2 text-sm text-gray-600">
				{bulkConfirm.op === 'delete'
					? $t('Permanently delete the selected products?')
					: $t('Apply this status change to the selected products?')}
				<br />
				<strong>{bulkConfirm.count}</strong> {$t('product(s) selected.')}
			</p>
			<form method="POST" action="?/bulkAction" use:enhance class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="op" value={bulkConfirm.op} />
				<input type="hidden" name="ids" value={Array.from(selectedIds).join(',')} />
				<button type="button" onclick={() => (bulkConfirm = null)} class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50">{$t('Cancel')}</button>
				<button type="submit" class="rounded-md {bulkConfirm.op === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'} px-4 py-2 text-sm font-medium text-white shadow-sm">
					{$t('Confirm')}
				</button>
			</form>
		</div>
	</div>
{/if}

<!-- Stock Adjust -->
{#if productToAdjust}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
		<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">{$t('Adjust Stock')}</h3>
			<p class="mt-1 text-sm text-gray-600">
				<strong class="font-mono text-xs">{productToAdjust.sku}</strong> — {productToAdjust.name}
			</p>
			<p class="mt-1 text-sm">{$t('Current')}: <strong>{formatQuantity(productToAdjust.quantity_on_hand, '0')}</strong> {productToAdjust.unit_symbol ?? ''}</p>

			<form method="POST" action="?/adjustStock" use:enhance class="mt-4 space-y-3">
				<input type="hidden" name="id" value={productToAdjust.id} />
				<div class="grid grid-cols-2 gap-2">
					<label class="flex items-center gap-2 rounded border p-2 text-sm hover:bg-gray-50 {adjustMode === 'delta' ? 'border-blue-500 bg-blue-50' : ''}">
						<input type="radio" name="mode" value="delta" bind:group={adjustMode} />
						{$t('Add / Subtract')}
					</label>
					<label class="flex items-center gap-2 rounded border p-2 text-sm hover:bg-gray-50 {adjustMode === 'set' ? 'border-blue-500 bg-blue-50' : ''}">
						<input type="radio" name="mode" value="set" bind:group={adjustMode} />
						{$t('Set to')}
					</label>
				</div>

				<div>
					<label for="adjust_value" class="mb-1 block text-sm font-medium">
						{adjustMode === 'delta' ? $t('Change (+/-)') : $t('New Quantity')}
					</label>
					<input type="number" step="any" name="value" id="adjust_value" bind:value={adjustValue} required class="w-full rounded-md border-gray-300 text-sm" />
				</div>

				<div>
					<label for="adjust_movement_type" class="mb-1 block text-sm font-medium">{$t('Reason')}</label>
					<select name="movement_type" id="adjust_movement_type" bind:value={adjustMovementType} class="w-full rounded-md border-gray-300 text-sm">
						<option value="adjustment">{$t('Manual Adjustment')}</option>
						<option value="count">{$t('Stock Count Correction')}</option>
						<option value="return_in">{$t('Customer Return (In)')}</option>
						<option value="return_out">{$t('Return to Vendor (Out)')}</option>
						<option value="transfer_in">{$t('Transfer In')}</option>
						<option value="transfer_out">{$t('Transfer Out')}</option>
						<option value="other">{$t('Other')}</option>
					</select>
				</div>

				<div>
					<label for="adjust_notes" class="mb-1 block text-sm font-medium">{$t('Notes')}</label>
					<textarea name="notes" id="adjust_notes" rows="2" bind:value={adjustNotes} class="w-full rounded-md border-gray-300 text-sm"></textarea>
				</div>

				<div class="flex justify-end gap-2 pt-2">
					<button type="button" onclick={() => (productToAdjust = null)} class="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">{$t('Cancel')}</button>
					<button type="submit" class="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">{$t('Apply')}</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- QR / Barcode label print -->
{#if productToPrint}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
		<div class="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">{$t('Print Label')}</h3>
			<p class="mt-1 text-sm text-gray-600">
				<strong class="font-mono text-xs">{productToPrint.sku}</strong> — {productToPrint.name}
			</p>
			<div class="mt-4 space-y-2">
				<a
					href={`/products/${productToPrint.id}/label?type=qr`}
					target="_blank"
					rel="noopener"
					class="block rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700"
				>
					{$t('Open QR Code Label')}
				</a>
				<a
					href={`/products/${productToPrint.id}/label?type=qr&copies=12`}
					target="_blank"
					rel="noopener"
					class="block rounded-md border border-blue-600 px-4 py-2 text-center text-sm font-semibold text-blue-700 hover:bg-blue-50"
				>
					{$t('Sheet (12 copies)')}
				</a>
			</div>
			<div class="mt-4 flex justify-end">
				<button type="button" onclick={() => (productToPrint = null)} class="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">{$t('Close')}</button>
			</div>
		</div>
	</div>
{/if}

<!-- Import Modal -->
{#if showImportModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
		<div class="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">{$t('Import Products')}</h3>
			<p class="mt-1 text-sm text-gray-600">{$t('Upload .xlsx or .csv with columns: name, sku, barcode, description, product_type, category, unit, purchase_cost, selling_price, tax_rate, quantity_on_hand, reorder_level, is_active.')}</p>
			<p class="mt-2 text-xs text-gray-500">{$t('Tip: Download the current export first, then edit and re-upload as template.')}</p>
			<form
				method="POST"
				action="/products/import"
				enctype="multipart/form-data"
				use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'success') {
							showGlobalMessage({ success: true, text: (result.data as any)?.message || $t('Import complete.'), type: 'success' });
							showImportModal = false;
							invalidateAll();
						} else if (result.type === 'failure') {
							showGlobalMessage({ success: false, text: (result.data as any)?.message || $t('Import failed.'), type: 'error' });
						}
					};
				}}
				class="mt-4 space-y-3"
			>
				<input type="file" name="file" accept=".xlsx,.csv" required class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100" />
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" name="update_existing" value="1" />
					{$t('Update existing products (match by SKU)')}
				</label>
				<div class="flex justify-end gap-2 pt-2">
					<button type="button" onclick={() => (showImportModal = false)} class="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">{$t('Cancel')}</button>
					<button type="submit" class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">{$t('Upload')}</button>
				</div>
			</form>
		</div>
	</div>
{/if}
