<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll, goto } from '$app/navigation';
	import { compressImage } from '$lib/utils/image-compressor';

	// --- Types ---
	type Product = PageData['products'][0];
	type ProductCategory = PageData['categories'][0];
	type Unit = PageData['units'][0];
	type Vendor = PageData['vendors'][0];
	type ChartOfAccount = PageData['accounts'][0];

	// --- Props & State ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedProduct = $state<Partial<Product> | null>(null);
	let productToDelete = $state<Product | null>(null);
	let productToView = $state<Product | null>(null);
	let isSaving = $state(false);

	let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(
		null
	);
	let messageTimeout: NodeJS.Timeout;

	// Search State
	let searchQuery = $state(data.searchQuery ?? '');
	let searchTimer: NodeJS.Timeout; // ตัวจับเวลาสำหรับ Live Search

	// Image handling state
	let compressedImageFile = $state<File | null>(null);
	let isCompressing = $state(false);
	let compressionError = $state<string | null>(null);
	let imagePreviewUrl = $state<string | null>(null);
	let removeImageFlag = $state(false);

	// --- Derived Data ---
	// [แก้ไข] ใช้ข้อมูลจาก Server โดยตรง ไม่ต้องกรองซ้ำที่หน้าจอ
	// เพราะ Live Search จะสั่ง Server ให้กรองมาให้แล้ว
	const filteredProducts = $derived(data.products || []);

	// --- Functions ---

	// [เพิ่มใหม่] ฟังก์ชัน Live Search
	function handleSearchInput() {
		clearTimeout(searchTimer);
		// รอ 400ms หลังพิมพ์เสร็จ ค่อยส่งคำสั่งค้นหา
		searchTimer = setTimeout(() => {
			const params = new URLSearchParams();
			if (searchQuery) params.set('search', searchQuery);
			params.set('page', '1'); // รีเซ็ตไปหน้า 1 เสมอเมื่อค้นหาใหม่

			// สั่งโหลดหน้าใหม่แบบไม่รีเฟรช (AJAX)
			goto(`/products?${params.toString()}`, {
				keepFocus: true, // เก็บ cursor ไว้ในช่องค้นหา
				noScroll: true, // ไม่ต้องเด้งไปบนสุด
				replaceState: true // ไม่ต้องเก็บประวัติการพิมพ์ทุกตัวอักษร
			});
		}, 400);
	}

	function openModal(mode: 'add' | 'edit', product: Product | null = null) {
		modalMode = mode;
		globalMessage = null;
		compressedImageFile = null;
		isCompressing = false;
		compressionError = null;
		imagePreviewUrl = null;
		removeImageFlag = false;

		if (mode === 'edit' && product) {
			selectedProduct = { ...product };
			imagePreviewUrl = product.image_url;
		} else {
			selectedProduct = {
				sku: '',
				name: '',
				product_type: 'Stock',
				is_active: true,
				quantity_on_hand: 0
			} as any;
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

	// --- Image Handling ---
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
			} catch (error) {
				console.error('Image compression failed:', error);
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

	function formatCurrency(value: number | null | undefined, defaultValue: string = '-') {
		if (value === null || value === undefined) return defaultValue;
		return new Intl.NumberFormat('th-TH', {
			style: 'decimal',
			minimumFractionDigits: 2,
			maximumFractionDigits: 4
		}).format(value);
	}
	function formatQuantity(value: number | null | undefined, defaultValue: string = '-') {
		if (value === null || value === undefined) return defaultValue;
		return new Intl.NumberFormat('th-TH', {
			style: 'decimal',
			minimumFractionDigits: 0,
			maximumFractionDigits: 4
		}).format(value);
	}

	// --- Reactive Effects ---
	$effect.pre(() => {
		if (form?.action === 'saveProduct') {
			if (form.success) {
				closeModal();
				showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
			}
			form.action = undefined;
		}

		if (form?.action === 'deleteProduct') {
			if (form.success) {
				showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
			}
			productToDelete = null;
			form.action = undefined;
		}

		let currentPreview = imagePreviewUrl;
		return () => {
			if (currentPreview && currentPreview.startsWith('blob:')) {
				URL.revokeObjectURL(currentPreview);
			}
		};
	});

	// --- Pagination Logic ---
	const paginationRange = $derived.by(() => {
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

	// [แก้ไข] แก้บั๊ก window is not defined ด้วยการใช้ตัวแปร state แทน
	function getPageUrl(pageNum: number) {
		const params = new URLSearchParams();
		if (searchQuery) params.set('search', searchQuery);
		params.set('page', pageNum.toString());
		return `/products?${params.toString()}`;
	}
</script>

<svelte:head>
	<title>Products</title>
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
		<h1 class="text-2xl font-bold text-gray-800">Products</h1>
		<p class="mt-1 text-sm text-gray-500">จัดการรายการสินค้าและบริการ</p>
	</div>
	<div class="flex items-center gap-2">
		<form method="POST" action="/products/export">
			<input type="hidden" name="search" value={searchQuery} />
			<button
				type="submit"
				class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:outline-none"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					class="h-4 w-4"
					><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
						points="7 10 12 15 17 10"
					/><line x1="12" y1="15" x2="12" y2="3" /></svg
				>
				ส่งออกเป็น CSV
			</button>
		</form>
		<button
			onclick={() => openModal('add')}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
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
			เพิ่มสินค้าใหม่
		</button>
	</div>
</div>

<div class="mb-4">
	<form method="GET" action="/products" class="relative">
		<input type="hidden" name="page" value="1" />
		<input
			type="search"
			name="search"
			bind:value={searchQuery}
			oninput={handleSearchInput}
			placeholder="ค้นหา SKU, ชื่อสินค้า, หมวดหมู่, ผู้ขาย..."
			class="w-full rounded-lg border-gray-300 py-2 pr-4 pl-10 text-sm focus:border-blue-500 focus:ring-blue-500"
		/>
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
	</form>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Image</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">SKU</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Name</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Category</th>
				<th class="px-4 py-3 text-right font-semibold text-gray-600">Qty on Hand</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Unit</th>
				<th class="px-4 py-3 text-right font-semibold text-gray-600">Cost</th>
				<th class="px-4 py-3 text-right font-semibold text-gray-600">Price</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">Active</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if filteredProducts.length === 0}
				<tr>
					<td colspan="11" class="py-12 text-center text-gray-500">
						{#if data.searchQuery}ไม่พบสินค้าที่ค้นหา: "{data.searchQuery}"{:else}ไม่พบข้อมูลสินค้า{/if}
					</td>
				</tr>
			{:else}
				{#each filteredProducts as product (product.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-2">
							<div
								class="flex h-10 w-10 items-center justify-center overflow-hidden rounded border bg-gray-50"
							>
								{#if product.image_url}
									<img
										src={product.image_url}
										alt={product.name}
										class="h-full w-full object-contain"
										loading="lazy"
									/>
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
										class="h-5 w-5 text-gray-400"
										><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle
											cx="9"
											cy="9"
											r="2"
										/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg
									>
								{/if}
							</div>
						</td>

						<td class="px-4 py-3 font-mono text-xs text-gray-700">{product.sku}</td>
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
						<td class="max-w-[150px] truncate px-4 py-3 text-gray-600"
							>{product.category_name ?? '-'}</td
						>
						<td class="px-4 py-3 text-right font-medium text-blue-700"
							>{formatQuantity(product.quantity_on_hand, '0')}</td
						>
						<td class="px-4 py-3 text-xs text-gray-500">{product.unit_symbol ?? '-'}</td>
						<td class="px-4 py-3 text-right text-gray-600"
							>{formatCurrency(product.purchase_cost)}</td
						>
						<td class="px-4 py-3 text-right font-medium text-green-700"
							>{formatCurrency(product.selling_price)}</td
						>
						<td class="px-4 py-3 text-center">
							{#if product.is_active}
								<span class="text-green-600">✓</span>
							{:else}
								<span class="text-red-500">✕</span>
							{/if}
						</td>
						<td class="px-4 py-3 whitespace-nowrap">
							<div class="flex items-center gap-2">
								<button
									onclick={() => openModal('edit', product)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
									aria-label="Edit product"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
									>
								</button>
								<button
									onclick={() => (productToDelete = product)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
									aria-label="Delete product"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg
									>
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
				Page <span class="font-medium">{data.currentPage}</span> of
				<span class="font-medium">{data.totalPages}</span>
			</p>
		</div>
		<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
			<a
				href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'}
				class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage ===
				1
					? 'pointer-events-none opacity-50'
					: ''}"
				aria-disabled={data.currentPage === 1}
				><span class="sr-only">Previous</span><svg
					class="h-5 w-5"
					viewBox="0 0 20 20"
					fill="currentColor"
					><path
						fill-rule="evenodd"
						d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
						clip-rule="evenodd"
					/></svg
				></a
			>
			{#each paginationRange as pageNum}
				{#if typeof pageNum === 'string'}<span
						class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 ring-inset"
						>...</span
					>
				{:else}<a
						href={getPageUrl(pageNum)}
						class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum ===
						data.currentPage
							? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
							: 'text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-50'}"
						aria-current={pageNum === data.currentPage ? 'page' : undefined}>{pageNum}</a
					>{/if}
			{/each}
			<a
				href={data.currentPage < data.totalPages ? getPageUrl(data.currentPage + 1) : '#'}
				class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage ===
				data.totalPages
					? 'pointer-events-none opacity-50'
					: ''}"
				aria-disabled={data.currentPage === data.totalPages}
				><span class="sr-only">Next</span><svg
					class="h-5 w-5"
					viewBox="0 0 20 20"
					fill="currentColor"
					><path
						fill-rule="evenodd"
						d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
						clip-rule="evenodd"
					/></svg
				></a
			>
		</nav>
	</div>
{/if}

{#if modalMode && selectedProduct}
	<div
		transition:slide
		class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
	>
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div
			class="relative flex max-h-[85vh] w-full max-w-7xl transform flex-col rounded-xl bg-white shadow-2xl transition-all"
		>
			<div class="flex-shrink-0 border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? 'เพิ่มสินค้า/บริการใหม่' : 'แก้ไขสินค้า/บริการ'}
				</h2>
			</div>

			<form
				method="POST"
				action="?/saveProduct"
				enctype="multipart/form-data"
				use:enhance={({ formData }) => {
					isSaving = true;
					if (compressedImageFile) {
						formData.set('image', compressedImageFile, compressedImageFile.name);
					} else if (removeImageFlag && modalMode === 'edit') {
						formData.set('remove_image', 'true');
					}
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
						{#if modalMode === 'edit'}<input
								type="hidden"
								name="id"
								value={selectedProduct.id}
							/>{/if}

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="sku" class="mb-1 block text-sm font-medium">SKU</label>
								<input
									type="text"
									name="sku"
									id="sku"
									value={modalMode === 'add' ? '(Auto-generated)' : selectedProduct.sku}
									class="w-full rounded-md border-gray-300 bg-gray-100 text-sm"
									readonly
								/>
								{#if modalMode === 'add'}
									<p class="mt-1 text-xs text-gray-500">ระบบจะสร้าง SKU ให้โดยอัตโนมัติ</p>
								{/if}
							</div>
							<div>
								<label for="name" class="mb-1 block text-sm font-medium">Name *</label><input
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
							<label for="description" class="mb-1 block text-sm font-medium">Description</label
							><textarea
								name="description"
								id="description"
								rows="3"
								bind:value={selectedProduct.description}
								class="w-full rounded-md border-gray-300 text-sm"
							></textarea>
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="product_type" class="mb-1 block text-sm font-medium"
									>Product Type *</label
								>
								<select
									name="product_type"
									id="product_type"
									required
									bind:value={selectedProduct.product_type}
									class="w-full rounded-md border-gray-300 text-sm"
								>
									<option value="Stock">Stock (สินค้าคงคลัง)</option>
									<option value="NonStock">Non-Stock (สินค้าไม่นับสต็อก)</option>
									<option value="Service">Service (บริการ)</option>
								</select>
							</div>
							<div>
								<label for="category_id" class="mb-1 block text-sm font-medium">Category</label>
								<select
									name="category_id"
									id="category_id"
									bind:value={selectedProduct.category_id}
									class="w-full rounded-md border-gray-300 text-sm"
								>
									<option value={null}>-- None --</option>
									{#each data.categories as category (category.id)}
										<option value={category.id}>{category.name}</option>
									{/each}
								</select>
							</div>
						</div>

						<fieldset class="rounded-md border p-4">
							<legend class="px-1 text-sm font-medium">Units</legend>
							<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
								<div>
									<label for="unit_id" class="mb-1 block text-xs font-medium"
										>Base Unit * <span class="text-gray-500">(Required)</span></label
									>
									<select
										name="unit_id"
										id="unit_id"
										required
										bind:value={selectedProduct.unit_id}
										class="w-full rounded-md border-gray-300 text-sm"
									>
										<option value={undefined} disabled>Select Unit</option>
										{#each data.units as unit (unit.id)}
											<option value={unit.id}>{unit.name} ({unit.symbol})</option>
										{/each}
									</select>
								</div>
								<div>
									<label for="purchase_unit_id" class="mb-1 block text-xs font-medium"
										>Purchase Unit</label
									>
									<select
										name="purchase_unit_id"
										id="purchase_unit_id"
										bind:value={selectedProduct.purchase_unit_id}
										class="w-full rounded-md border-gray-300 text-sm"
									>
										<option value={null}>-- Same as Base --</option>
										{#each data.units as unit (unit.id)}
											<option value={unit.id}>{unit.name} ({unit.symbol})</option>
										{/each}
									</select>
								</div>
								<div>
									<label for="sales_unit_id" class="mb-1 block text-xs font-medium"
										>Sales Unit</label
									>
									<select
										name="sales_unit_id"
										id="sales_unit_id"
										bind:value={selectedProduct.sales_unit_id}
										class="w-full rounded-md border-gray-300 text-sm"
									>
										<option value={null}>-- Same as Base --</option>
										{#each data.units as unit (unit.id)}
											<option value={unit.id}>{unit.name} ({unit.symbol})</option>
										{/each}
									</select>
								</div>
							</div>
							<p class="mt-2 text-xs text-gray-500">
								Define unit conversions if Purchase/Sales units differ from Base Unit.
							</p>
						</fieldset>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="purchase_cost" class="mb-1 block text-sm font-medium"
									>Purchase Cost</label
								>
								<input
									type="number"
									step="any"
									name="purchase_cost"
									id="purchase_cost"
									bind:value={selectedProduct.purchase_cost}
									placeholder="0.00"
									class="w-full rounded-md border-gray-300 text-sm"
								/>
							</div>
							<div>
								<label for="selling_price" class="mb-1 block text-sm font-medium"
									>Selling Price</label
								>
								<input
									type="number"
									step="any"
									name="selling_price"
									id="selling_price"
									bind:value={selectedProduct.selling_price}
									placeholder="0.00"
									class="w-full rounded-md border-gray-300 text-sm"
								/>
							</div>
						</div>

						{#if selectedProduct.product_type === 'Stock'}
							<div transition:slide class="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
								<div>
									<label for="quantity_on_hand" class="mb-1 block text-sm font-medium"
										>Quantity on Hand</label
									>
									<input
										type="number"
										step="any"
										name="quantity_on_hand"
										id="quantity_on_hand"
										bind:value={selectedProduct.quantity_on_hand}
										class="w-full rounded-md border-gray-300 text-sm"
									/>
									<p class="mt-1 text-xs text-gray-500">In Base Unit.</p>
								</div>
								<div>
									<label for="reorder_level" class="mb-1 block text-sm font-medium"
										>Reorder Level</label
									>
									<input
										type="number"
										step="any"
										name="reorder_level"
										id="reorder_level"
										bind:value={selectedProduct.reorder_level}
										placeholder="Optional"
										class="w-full rounded-md border-gray-300 text-sm"
									/>
									<p class="mt-1 text-xs text-gray-500">In Base Unit.</p>
								</div>
							</div>
						{/if}

						<div>
							<label for="preferred_vendor_id" class="mb-1 block text-sm font-medium"
								>Preferred Vendor</label
							>
							<select
								name="preferred_vendor_id"
								id="preferred_vendor_id"
								bind:value={selectedProduct.preferred_vendor_id}
								class="w-full rounded-md border-gray-300 text-sm"
							>
								<option value={null}>-- None --</option>
								{#each data.vendors as vendor (vendor.id)}
									<option value={vendor.id}>{vendor.name}</option>
								{/each}
							</select>
						</div>

						<fieldset class="rounded-md border p-4">
							<legend class="px-1 text-sm font-medium">Accounting Links</legend>
							<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
								<div>
									<label for="asset_account_id" class="mb-1 block text-xs font-medium"
										>Asset Account <span class="text-gray-500">(Stock)</span></label
									>
									<select
										name="asset_account_id"
										id="asset_account_id"
										bind:value={selectedProduct.asset_account_id}
										class="w-full rounded-md border-gray-300 text-sm"
									>
										<option value={null}>-- None --</option>
										{#each data.accounts as acc (acc.id)}
											<option value={acc.id}>{acc.account_code} - {acc.account_name}</option>
										{/each}
									</select>
								</div>
								<div>
									<label for="income_account_id" class="mb-1 block text-xs font-medium"
										>Income Account <span class="text-gray-500">(Sales)</span></label
									>
									<select
										name="income_account_id"
										id="income_account_id"
										bind:value={selectedProduct.income_account_id}
										class="w-full rounded-md border-gray-300 text-sm"
									>
										<option value={null}>-- None --</option>
										{#each data.accounts as acc (acc.id)}
											<option value={acc.id}>{acc.account_code} - {acc.account_name}</option>
										{/each}
									</select>
								</div>
								<div>
									<label for="expense_account_id" class="mb-1 block text-xs font-medium"
										>Expense/COGS Acct <span class="text-gray-500">(Purchase/Cost)</span></label
									>
									<select
										name="expense_account_id"
										id="expense_account_id"
										bind:value={selectedProduct.expense_account_id}
										class="w-full rounded-md border-gray-300 text-sm"
									>
										<option value={null}>-- None --</option>
										{#each data.accounts as acc (acc.id)}
											<option value={acc.id}>{acc.account_code} - {acc.account_name}</option>
										{/each}
									</select>
								</div>
							</div>
						</fieldset>

						<div class="flex items-center">
							<input
								type="checkbox"
								name="is_active"
								id="is_active_modal"
								bind:checked={selectedProduct.is_active}
								class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							<label for="is_active_modal" class="ml-2 block text-sm text-gray-900"
								>Active (can be sold/purchased)</label
							>
						</div>
					</div>

					<div class="space-y-2 lg:col-span-1">
						<label for="image" class="block text-sm font-medium text-gray-700">Product Image</label>
						<div
							class="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-gray-50"
						>
							{#if imagePreviewUrl}
								<img
									src={imagePreviewUrl}
									alt="Product preview"
									class="h-full w-full object-contain"
								/>
							{:else}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									class="h-16 w-16 text-gray-300"
									><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle
										cx="9"
										cy="9"
										r="2"
									/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg
								>
							{/if}
						</div>
						<input
							type="file"
							name="image"
							id="image"
							accept="image/png, image/jpeg, image/webp"
							onchange={onFileSelected}
							class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
						/>
						{#if isCompressing}
							<p class="text-xs text-blue-600">Compressing image...</p>
						{/if}
						{#if compressionError}
							<p class="text-xs text-red-600">{compressionError}</p>
						{/if}
						{#if compressedImageFile && !isCompressing}
							<p class="text-xs text-green-600">Image ready to upload.</p>
						{/if}

						{#if modalMode === 'edit' && selectedProduct.image_url && !removeImageFlag}
							<button
								type="button"
								onclick={flagToRemoveImage}
								class="mt-2 text-xs text-red-600 hover:underline">Remove current image</button
							>
						{/if}
						{#if removeImageFlag}
							<p class="mt-1 text-xs text-orange-600">Current image will be removed upon saving.</p>
						{/if}
					</div>

					{#if form?.message && !form.success && form.action === 'saveProduct'}
						<div class="rounded-md bg-red-50 p-3 text-sm text-red-600 lg:col-span-3">
							<p><strong>Error:</strong> {form.message}</p>
						</div>
					{/if}
				</div>

				<div class="sticky bottom-0 flex flex-shrink-0 justify-end gap-3 border-t bg-gray-50 p-4">
					<button
						type="button"
						onclick={closeModal}
						class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
						>Cancel</button
					>
					<button
						type="submit"
						disabled={isSaving || isCompressing}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-400"
					>
						{#if isSaving}
							Saving...
						{:else if isCompressing}
							Compressing...
						{:else}
							Save Product
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if productToView}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
	>
		<div class="fixed inset-0" onclick={closeDetailModal} role="presentation"></div>
		<div
			class="relative flex max-h-[85vh] w-full max-w-7xl flex-col rounded-xl bg-white shadow-2xl"
			transition:slide={{ duration: 200 }}
		>
			<div class="flex flex-shrink-0 items-start justify-between border-b p-4">
				<div>
					<h2 class="text-xl font-bold text-gray-900">{productToView.name}</h2>
					<p class="font-mono text-sm text-gray-500">{productToView.sku}</p>
				</div>
				<button
					onclick={closeDetailModal}
					class="-m-2 p-2 text-gray-400 hover:text-gray-600"
					aria-label="Close"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg
					>
				</button>
			</div>

			<div class="flex-1 space-y-4 overflow-y-auto p-6 text-sm">
				<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
					<div
						class="flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-gray-50 md:col-span-1"
					>
						{#if productToView.image_url}
							<img
								src={productToView.image_url}
								alt={productToView.name}
								class="h-full w-full object-contain"
							/>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								class="h-16 w-16 text-gray-300"
								><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle
									cx="9"
									cy="9"
									r="2"
								/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg
							>
						{/if}
					</div>
					<div class="grid grid-cols-2 gap-x-4 gap-y-3 md:col-span-2">
						<div>
							<strong class="block text-gray-500">Type:</strong>
							{productToView.product_type}
						</div>
						<div>
							<strong class="block text-gray-500">Category:</strong>
							{productToView.category_name ?? '-'}
						</div>
						<div>
							<strong class="block text-gray-500">Base Unit:</strong>
							{productToView.unit_symbol ?? '-'}
						</div>
						{#if productToView.product_type === 'Stock'}
							<div>
								<strong class="block text-gray-500">Qty on Hand:</strong>
								{formatQuantity(productToView.quantity_on_hand, '0')}
							</div>
							<div>
								<strong class="block text-gray-500">Reorder Level:</strong>
								{formatQuantity(productToView.reorder_level)}
							</div>
						{/if}
						<div>
							<strong class="block text-gray-500">Purchase Unit:</strong>
							{productToView.purchase_unit_symbol ?? productToView.unit_symbol ?? '-'}
						</div>
						<div>
							<strong class="block text-gray-500">Sales Unit:</strong>
							{productToView.sales_unit_symbol ?? productToView.unit_symbol ?? '-'}
						</div>
						<div>
							<strong class="block text-gray-500">Purchase Cost:</strong>
							{formatCurrency(productToView.purchase_cost)}
						</div>
						<div>
							<strong class="block text-gray-500">Selling Price:</strong>
							{formatCurrency(productToView.selling_price)}
						</div>
						<div>
							<strong class="block text-gray-500">Preferred Vendor:</strong>
							{productToView.vendor_name ?? '-'}
						</div>
						<div>
							<strong class="block text-gray-500">Status:</strong>
							<span class={productToView.is_active ? 'text-green-700' : 'text-red-600'}
								>{productToView.is_active ? 'Active' : 'Inactive'}</span
							>
						</div>
					</div>
				</div>

				{#if productToView.description}
					<div>
						<strong class="mb-1 block text-gray-500">Description:</strong>
						<p class="whitespace-pre-wrap text-gray-700">{productToView.description}</p>
					</div>
				{/if}

				<div class="border-t pt-4">
					<h4 class="mb-2 font-medium text-gray-700">Accounting Links</h4>
					<div class="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
						<div>
							<strong class="block text-gray-500">Asset Acct:</strong>
							{productToView.asset_account_code
								? `${productToView.asset_account_code} - ${productToView.asset_account_name}`
								: '-'}
						</div>
						<div>
							<strong class="block text-gray-500">Income Acct:</strong>
							{productToView.income_account_code
								? `${productToView.income_account_code} - ${productToView.income_account_name}`
								: '-'}
						</div>
						<div>
							<strong class="block text-gray-500">Expense/COGS Acct:</strong>
							{productToView.expense_account_code
								? `${productToView.expense_account_code} - ${productToView.expense_account_name}`
								: '-'}
						</div>
					</div>
				</div>
			</div>

			<div class="flex flex-shrink-0 justify-end gap-3 border-t bg-gray-50 p-4">
				<button
					type="button"
					onclick={closeDetailModal}
					class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
					>Close</button
				>
				<button
					type="button"
					onclick={() => {
						closeDetailModal();
						openModal('edit', productToView);
					}}
					class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
					>Edit Product</button
				>
			</div>
		</div>
	</div>
{/if}

{#if productToDelete}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">ยืนยันการลบ</h3>
			<p class="mt-2 text-sm text-gray-600">
				คุณแน่ใจหรือไม่ที่จะลบสินค้า: <br />
				<strong class="font-mono text-xs">{productToDelete.sku} - {productToDelete.name}</strong>?
				<br />การดำเนินการนี้ไม่สามารถย้อนกลับได้
			</p>
			{#if form?.message && !form.success && form.action === 'deleteProduct'}
				<p class="mt-2 text-sm text-red-600"><strong>Error:</strong> {form.message}</p>
			{/if}
			<form method="POST" action="?/deleteProduct" use:enhance class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="id" value={productToDelete.id} />
				<button
					type="button"
					onclick={() => (productToDelete = null)}
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
