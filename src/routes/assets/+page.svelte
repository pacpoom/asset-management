<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	// --- NEW: Import the image compressor utility ---
	import { compressImage } from '$lib/utils/image-compressor';


	type Asset = PageData['assets'][0];

	// FIX: Cannot use `export let` in runes mode — use $props() instead
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	// FIX: Must use $state for all variables that are updated to be reactive
	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedAsset = $state<Partial<Asset> | null>(null);
	let assetToDelete = $state<Asset | null>(null);
	let assetToView = $state<Asset | null>(null); // For detail modal
	let isLoading = $state(false);
	let searchQuery = $state(data.searchQuery ?? '');
    
    // --- NEW: State for image compression ---
    let originalImageFile: File | null = $state(null);
    let isCompressing = $state(false);
    let compressionError = $state<string | null>(null);

    // --- NEW: Global Notification States ---
    let globalMessage = $state<{ success: boolean, text: string, type: 'success' | 'error' } | null>(null);
    let messageTimeout: NodeJS.Timeout;

    // --- NEW: Function to handle file input change and trigger compression ---
    async function onFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const file = input.files[0];
            
            // Basic validation for file type
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                compressionError = 'กรุณาเลือกไฟล์รูปภาพ (JPG, PNG, WEBP) เท่านั้น';
                originalImageFile = null;
                return;
            }

            isCompressing = true;
            compressionError = null;
            try {
                // Compress the image with default settings
                const compressedFile = await compressImage(file);
                originalImageFile = compressedFile; // Store the compressed file to be used in the form
            } catch (error) {
                console.error('Image compression failed:', error);
                compressionError = 'เกิดข้อผิดพลาดในการบีบอัดรูปภาพ';
                originalImageFile = null;
            } finally {
                isCompressing = false;
            }
        }
    }


	function openModal(mode: 'add' | 'edit', asset: Asset | null = null) {
		modalMode = mode;
        // Clear global message and image states when opening a modal
        globalMessage = null; 
        originalImageFile = null;
        compressionError = null;
        isCompressing = false;

		if (mode === 'edit' && asset) {
			selectedAsset = { ...asset }; // Create a copy to edit
		} else {
			selectedAsset = { status: 'In Storage', asset_tag: '', asset_tag_sub: undefined }; // Defaults for new asset
		}
	}

	function closeModal() {
		modalMode = null;
		selectedAsset = null;
	}

	function openDetailModal(asset: Asset) {
		assetToView = asset;
	}

	function closeDetailModal() {
		assetToView = null;
	}
    
    // Helper to display a temporary global message
    function showGlobalMessage(message: { success: boolean, text: string, type: 'success' | 'error' }) {
        clearTimeout(messageTimeout);
        globalMessage = message;
        messageTimeout = setTimeout(() => { globalMessage = null; }, 5000);
    }

    // NEW FUNCTION: Handle print click and stop propagation manually
    function handlePrintClick(e: Event) {
        // Prevent the click event from propagating up to the <tr> element's onclick handler
        e.stopPropagation();
    }

	// This reactive block handles form submission results for the delete action
	$effect.pre(() => {
        if (form?.message && form.action === 'deleteAsset') {
            // If delete action fails (though it should redirect on success)
            showGlobalMessage({ 
                success: false, 
                text: form.message as string, 
                type: 'error' 
            });
        }
	});


	// FIX: Use $derived for reactive calculation instead of $:
	const paginationRange = $derived(() => {
		const delta = 1; // How many pages to show before and after the current page
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

	function getPageUrl(pageNum: number) {
		const params = new URLSearchParams();
		params.set('page', pageNum.toString());
		if (data.searchQuery) {
			params.set('search', data.searchQuery);
		}
		return `/assets?${params.toString()}`;
	}
</script>

<svelte:head>
	<title>การจัดการสินทรัพย์</title>
</svelte:head>

<!-- Global Notifications (NEW) -->
{#if globalMessage}
    <div 
        transition:fade 
        class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg shadow-xl p-4 font-semibold text-sm transform transition-transform"
        class:bg-green-100={globalMessage?.type === 'success'}
        class:text-green-800={globalMessage?.type === 'success'}
        class:bg-red-100={globalMessage?.type === 'error'}
        class:text-red-800={globalMessage?.type === 'error'}
    >
        <div class="flex items-center gap-2">
            {#if globalMessage?.type === 'success'}
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            {:else}
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            {/if}
            <p>{globalMessage?.text}</p>
        </div>
    </div>
{/if}

<!-- Main Header -->
<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">การจัดการสินทรัพย์</h1>
		<p class="mt-1 text-sm text-gray-500">ดู เพิ่ม และจัดการสินทรัพย์ทั้งหมดของบริษัท</p>
	</div>
	<!-- Action Buttons -->
	<div class="flex items-center gap-2">
		<!-- EXPORT TO CSV BUTTON: ACTION UPDATED to dedicated endpoint /assets/export -->
		<form method="POST" action="/assets/export">
			<input type="hidden" name="search" value={searchQuery} />
			<button
				type="submit"
				class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
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
					class="h-4 w-4"
					><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
						points="7 10 12 15 17 10"
					/><line x1="12" y1="15" x2="12" y2="3" /></svg
				>
				ส่งออกเป็น CSV
			</button>
		</form>

		<!-- ADD NEW ASSET BUTTON -->
		<button
			onclick={() => openModal('add')}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-4 w-4"
			>
				<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
			</svg>
			เพิ่มสินทรัพย์ใหม่
		</button>
	</div>
</div>

<!-- Search Input -->
<div class="mb-4">
	<form method="GET" class="relative">
		<input
			type="search"
			name="search"
			bind:value={searchQuery}
			placeholder="ค้นหาด้วยรหัสสินทรัพย์, รหัสย่อย, ชื่อ, ผู้รับผิดชอบ, หมวดหมู่, สถานที่..."
			class="w-full rounded-lg border-gray-300 py-2 pl-10 pr-4 focus:border-blue-500 focus:ring-blue-500"
		/>
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<svg
				class="h-5 w-5 text-gray-400"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
			>
				<path
					fill-rule="evenodd"
					d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
					clip-rule="evenodd"
				/>
			</svg>
		</div>
	</form>
</div>

<!-- Assets Table -->
<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">รูปภาพ</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">รหัสสินทรัพย์</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">รหัสย่อย</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">ชื่อ</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">หมวดหมู่</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">ผู้รับผิดชอบ</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">สถานะ</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">สถานที่</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">การดำเนินการ</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.assets.length === 0}
				<tr>
					<td colspan="9" class="py-12 text-center text-gray-500">
						{#if data.searchQuery}
							ไม่พบสินทรัพย์ที่ค้นหา: "{data.searchQuery}"
						{:else}
							ไม่พบสินทรัพย์
						{/if}
					</td>
				</tr>
			{:else}
				{#each data.assets as asset (asset.id)}
					<tr
						class="hover:bg-gray-50"
					>
						<td class="px-4 py-3">
							<div
								class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border bg-gray-100"
							>
								{#if asset.image_url}
									<img
										src={asset.image_url}
										alt={asset.name}
										class="h-full w-full object-cover"
										loading="lazy"
									/>
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										class="h-5 w-5 text-gray-400"
									>
										<rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
										<circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
										/>
									</svg>
								{/if}
							</div>
						</td>
						<td class="px-4 py-3 font-mono text-xs text-gray-700">{asset.asset_tag}</td>
						<td class="px-4 py-3 font-mono text-xs text-gray-700">{asset.asset_tag_sub ?? 'N/A'}</td>
						<!-- FIX: ย้าย Event Listener สำหรับเปิด Detail Modal มาที่ชื่อ Asset Name -->
						<td 
							class="px-4 py-3 font-medium text-gray-900 cursor-pointer hover:underline hover:text-blue-600"
							role="button"
							tabindex="0"
							onclick={() => openDetailModal(asset)}
							onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openDetailModal(asset)}
						>
							<div class="truncate-2-lines max-w-xs">{asset.name}</div>
						</td>
						<td class="px-4 py-3 text-gray-600">{asset.category_name ?? 'N/A'}</td>
						<td class="px-4 py-3 text-gray-600">{asset.assigned_user_name ?? 'N/A'}</td>
						<td class="px-4 py-3">
							<span
								class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {asset.status ===
								'In Use'
									? 'bg-green-100 text-green-800'
									: asset.status === 'In Storage'
									? 'bg-blue-100 text-blue-800'
									: asset.status === 'Under Maintenance'
									? 'bg-yellow-100 text-yellow-800'
									: 'bg-red-100 text-red-800'}"
							>
								{asset.status === 'In Use' ? 'ใช้งานอยู่' : 
								 asset.status === 'In Storage' ? 'ในคลังสินค้า' : 
								 asset.status === 'Under Maintenance' ? 'อยู่ระหว่างซ่อมบำรุง' : 'จำหน่าย/ทิ้ง'}
							</span>
						</td>
						<td class="px-4 py-3 text-gray-600">{asset.location_name ?? 'N/A'}</td>
						<td class="px-4 py-3">
							<div class="flex items-center gap-2">
								<button
									onclick={() => openModal('edit', asset)}
									class="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600"
									aria-label="แก้ไขสินทรัพย์"
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
										class="h-4 w-4"
										><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path
											d="m15 5 4 4"
										/></svg
									>
								</button>
								<button
									onclick={() => (assetToDelete = asset)}
									class="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600"
									aria-label="ลบสินทรัพย์"
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
										class="h-4 w-4"
										><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path
											d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
										/></svg
									>
								</button>
								<!-- NEW Print Button -->
								<a
									href="/assets/print/{asset.id}"
									target="_blank"
									class="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-green-600"
									aria-label="พิมพ์ฉลาก"
									title="พิมพ์ฉลาก"
									onclick={handlePrintClick}
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
										class="h-4 w-4"
									>
										<polyline points="6 9 6 2 18 2 18 9"></polyline>
										<path
											d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
										></path>
										<rect x="6" y="14" width="12" height="8"></rect>
									</svg>
								</a>
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
				class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 {data.currentPage ===
				1
					? 'pointer-events-none opacity-50'
					: ''}"
				aria-disabled={data.currentPage === 1}
			>
				<span class="sr-only">ก่อนหน้า</span>
				<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
					<path
						fill-rule="evenodd"
						d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
						clip-rule="evenodd"
					/>
				</svg>
			</a>
			{#each paginationRange as pageNum}
				{#if typeof pageNum === 'string'}
					<span
						class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300"
					>
						...
					</span>
				{:else}
					<a
						href={getPageUrl(pageNum)}
						class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum ===
						data.currentPage
							? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
							: 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'}"
						aria-current={pageNum === data.currentPage ? 'page' : undefined}
					>
						{pageNum}
					</a>
				{/if}
			{/each}
			<a
				href={data.currentPage < data.totalPages ? getPageUrl(data.currentPage + 1) : '#'}
				class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 {data.currentPage ===
				data.totalPages
					? 'pointer-events-none opacity-50'
					: ''}"
				aria-disabled={data.currentPage === data.totalPages}
			>
				<span class="sr-only">ถัดไป</span>
				<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
					<path
						fill-rule="evenodd"
						d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
						clip-rule="evenodd"
					/>
				</svg>
			</a>
		</nav>
	</div>
{/if}

<!-- Add/Edit Asset Modal -->
{#if modalMode && selectedAsset}
	<div
		transition:slide={{ duration: 150 }}
		class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16"
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
	>
		<div
			class="fixed inset-0"
			onclick={closeModal}
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && closeModal()}
			role="button"
			tabindex="0"
			aria-label="ปิด Modal"
		></div>

		<div
			class="relative flex w-full max-w-2xl transform flex-col rounded-xl bg-white shadow-2xl transition-all max-h-[90vh]"
		>
			<div class="flex-shrink-0 border-b border-gray-200 px-6 py-4">
				<h2 id="modal-title" class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? 'เพิ่มสินทรัพย์ใหม่' : 'แก้ไขสินทรัพย์'}
				</h2>
			</div>

			<form
				method="POST"
				action={modalMode === 'add' ? '?/addAsset' : '?/editAsset'}
				enctype="multipart/form-data"
				use:enhance={({ formData }) => {
					isLoading = true;
                    // --- NEW: Replace original image with compressed one ---
                    if (originalImageFile) {
                        formData.set('image', originalImageFile);
                    }

					return async ({ update }) => {
						await update();
						isLoading = false;
						
						// FIX: Check form result here to close modal reliably
						const isAssetAction = form?.action === 'addAsset' || form?.action === 'editAsset';
						if (isAssetAction) {
							if (form.success) {
								closeModal();
								showGlobalMessage({
									success: true,
									text: form.message as string,
									type: 'success'
								});
							} else if (form.message) {
								// This is for validation errors, etc.
								showGlobalMessage({
									success: false,
									text: form.message as string,
									type: 'error'
								});
							}
						}
					};
				}}
				class="flex flex-1 flex-col overflow-hidden"
			>
				<div class="space-y-6 overflow-y-auto p-6">
					<!-- Hidden fields for edit -->
					{#if modalMode === 'edit'}
						<input type="hidden" name="id" value={selectedAsset.id} />
						<input type="hidden" name="existing_image_url" value={selectedAsset.image_url ?? ''} />
					{/if}

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<!-- Asset Tag -->
						<div>
							<label for="asset_tag" class="mb-1 block text-sm font-medium text-gray-700"
								>รหัสสินทรัพย์ (Asset Tag)</label
							>
							<input
								type="text"
								value={modalMode === 'add' ? 'ระบบจะสร้างให้โดยอัตโนมัติ' : selectedAsset.asset_tag}
								class="w-full rounded-md border-gray-300 bg-gray-100"
								readonly
							/>
						</div>
						<!-- Asset Sub Tag -->
						<div>
							<label for="asset_tag_sub" class="mb-1 block text-sm font-medium text-gray-700"
								>รหัสสินทรัพย์ย่อย (Asset Sub Tag)</label
							>
							<input
								type="text"
								name="asset_tag_sub"
								id="asset_tag_sub"
								bind:value={selectedAsset.asset_tag_sub}
								class="w-full rounded-md border-gray-300"
							/>
						</div>
					</div>

					<!-- Asset Name -->
					<div>
						<label for="name" class="mb-1 block text-sm font-medium text-gray-700">ชื่อสินทรัพย์</label>
						<input
							type="text"
							name="name"
							id="name"
							required
							bind:value={selectedAsset.name}
							class="w-full rounded-md border-gray-300"
						/>
					</div>
					<!-- Status -->
					<div>
						<label for="status" class="mb-1 block text-sm font-medium text-gray-700">สถานะ</label>
						<select
							name="status"
							id="status"
							bind:value={selectedAsset.status}
							class="w-full rounded-md border-gray-300"
						>
							<option value="In Storage">ในคลังสินค้า</option> 
							<option value="In Use">ใช้งานอยู่</option>
							<option value="Under Maintenance">อยู่ระหว่างซ่อมบำรุง</option> 
							<option value="Disposed">จำหน่าย/ทิ้ง</option>
						</select>
					</div>

					<!-- Purchase Date & Cost -->
					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<div>
							<label for="purchase_date" class="mb-1 block text-sm font-medium text-gray-700"
								>วันที่ซื้อ</label
							>
							<input
								type="date"
								name="purchase_date"
								id="purchase_date"
								required
								bind:value={selectedAsset.purchase_date}
								class="w-full rounded-md border-gray-300"
							/>
						</div>
						<div>
							<label for="purchase_cost" class="mb-1 block text-sm font-medium text-gray-700"
								>มูลค่า (บาท)</label
							>
							<input
								type="number"
								name="purchase_cost"
								id="purchase_cost"
								step="0.01"
								required
								bind:value={selectedAsset.purchase_cost}
								class="w-full rounded-md border-gray-300"
							/>
						</div>
					</div>

					<!-- Category & Location -->
					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<div>
							<label for="category_id" class="mb-1 block text-sm font-medium text-gray-700"
								>หมวดหมู่</label
							>
							<select
								name="category_id"
								id="category_id"
								required
								bind:value={selectedAsset.category_id}
								class="w-full rounded-md border-gray-300"
							>
								<option disabled selected value={undefined}>เลือกหมวดหมู่</option>
								{#each data.categories as category}
									<option value={category.id}>{category.name}</option>
								{/each}
							</select>
						</div>
						<div>
							<label for="location_id" class="mb-1 block text-sm font-medium text-gray-700"
								>สถานที่</label
							>
							<select
								name="location_id"
								id="location_id"
								bind:value={selectedAsset.location_id}
								class="w-full rounded-md border-gray-300"
							>
								<option value={undefined}>N/A</option>
								{#each data.locations as location}
									<option value={location.id}>{location.name}</option>
								{/each}
							</select>
						</div>
					</div>
					<!-- Assigned User -->
					<div>
						<label for="assigned_to_user_id" class="mb-1 block text-sm font-medium text-gray-700"
							>ผู้รับผิดชอบ</label
						>
						<select
							name="assigned_to_user_id"
							id="assigned_to_user_id"
							bind:value={selectedAsset.assigned_to_user_id}
							class="w-full rounded-md border-gray-300"
						>
							<option value={undefined}>ไม่ได้กำหนด</option>
							{#each data.users as user}
								<option value={user.id}>{user.full_name} ({user.email})</option>
							{/each}
						</select>
					</div>

					<!-- Image Upload (with compression) -->
					<div>
						<label for="image" class="mb-1 block text-sm font-medium text-gray-700"
							>รูปภาพสินทรัพย์</label
						>
						<input
							type="file"
							name="image"
							id="image"
							accept="image/png, image/jpeg, image/webp"
							onchange={onFileSelected}
							class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2"
						/>
                        {#if isCompressing}
                            <p class="mt-2 text-sm text-blue-600">กำลังบีบอัดรูปภาพ...</p>
                        {/if}
                        {#if compressionError}
                            <p class="mt-2 text-sm text-red-600">{compressionError}</p>
                        {/if}
                        {#if originalImageFile && !isCompressing}
                             <p class="mt-2 text-sm text-green-600">รูปภาพพร้อมอัปโหลดแล้ว</p>
                        {/if}
					</div>

					<!-- Notes -->
					<div>
						<label for="notes" class="mb-1 block text-sm font-medium text-gray-700">บันทึก/หมายเหตุ</label>
						<textarea
							name="notes"
							id="notes"
							rows="3"
							bind:value={selectedAsset.notes}
							class="w-full rounded-md border-gray-300"
						></textarea>
					</div>

					{#if form?.message && !form?.success}
						<div class="mt-4 rounded-md bg-red-50 p-4">
							<p class="text-sm text-red-600">Error: {form.message}</p>
						</div>
					{/if}
				</div>

				<div class="flex flex-shrink-0 justify-end gap-3 border-t border-gray-200 p-4">
					<button
						type="button"
						onclick={closeModal}
						class="rounded-md border bg-white px-4 py-2 text-sm font-medium"
					>
						ยกเลิก
					</button>
					<button
						type="submit"
						disabled={isLoading || isCompressing}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-blue-400"
					>
						{#if isLoading} 
                            กำลังบันทึก... 
                        {:else if isCompressing}
                            กำลังบีบอัด...
                        {:else} 
                            บันทึกสินทรัพย์ 
                        {/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Asset Detail Modal -->
{#if assetToView}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="detail-modal-title"
	>
		<div
			class="fixed inset-0"
			onclick={closeDetailModal}
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && closeDetailModal()}
			role="button"
			tabindex="0"
			aria-label="ปิด Modal"
		></div>

		<div class="relative w-full max-w-2xl rounded-xl bg-white shadow-2xl" transition:slide>
			<div class="p-6">
				<div class="flex items-start justify-between">
					<div>
						<h2 id="detail-modal-title" class="text-xl font-bold text-gray-900">
							{assetToView.name}
						</h2>
						<p class="font-mono text-sm text-gray-500">{assetToView.asset_tag}</p>
					</div>
					<button
						onclick={closeDetailModal}
						class="-m-2 rounded-full p-2 text-gray-400 hover:text-gray-600"
						aria-label="ปิด"
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
							class="h-6 w-6"
						>
							<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line
							>
						</svg>
					</button>
				</div>
				<div class="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
					<div
						class="flex items-center justify-center rounded-lg border bg-gray-50 aspect-video overflow-hidden"
					>
						{#if assetToView.image_url}
							<img
								src={assetToView.image_url}
								alt={assetToView.name}
								class="h-full w-full object-contain"
							/>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								class="h-16 w-16 text-gray-400"
							>
								<rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
								<circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
								/>
							</svg>
						{/if}
					</div>
					<div class="space-y-4 text-sm">
						<div>
							<p class="font-semibold text-gray-700">สถานะ</p>
							<p class="text-gray-600">
								{assetToView.status === 'In Use' ? 'ใช้งานอยู่' : 
								 assetToView.status === 'In Storage' ? 'ในคลังสินค้า' : 
								 assetToView.status === 'Under Maintenance' ? 'อยู่ระหว่างซ่อมบำรุง' : 'จำหน่าย/ทิ้ง'}
							</p>
						</div>
						<div>
							<p class="font-semibold text-gray-700">ผู้รับผิดชอบ</p>
							<p class="text-gray-600">{assetToView.assigned_user_name ?? 'ไม่ได้กำหนด'}</p>
						</div>
						<div>
							<p class="font-semibold text-gray-700">สถานที่</p>
							<p class="text-gray-600">{assetToView.location_name ?? 'N/A'}</p>
						</div>
						<div>
							<p class="font-semibold text-gray-700">หมวดหมู่</p>
							<p class="text-gray-600">{assetToView.category_name ?? 'N/A'}</p>
						</div>
						<div>
							<p class="font-semibold text-gray-700">วันที่ซื้อ</p>
							<p class="text-gray-600">{assetToView.purchase_date}</p>
						</div>
						<div>
							<p class="font-semibold text-gray-700">มูลค่าที่ซื้อ</p>
							<p class="text-gray-600">
								{new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(
									assetToView.purchase_cost
								)}
							</p>
						</div>
					</div>
					<div class="md:col-span-2">
						<p class="font-semibold text-gray-700">บันทึก/หมายเหตุ</p>
						<p class="mt-1 text-gray-600 whitespace-pre-wrap">
							{assetToView.notes || 'ไม่มีบันทึก/หมายเหตุ'}
						</p>
					</div>
				</div>
			</div>
			<!-- Modal Footer with Buttons -->
			<div
				class="flex flex-shrink-0 items-center justify-end gap-3 rounded-b-xl border-t border-gray-200 bg-gray-50 p-4"
			>
				<button
					type="button"
					onclick={closeDetailModal}
					class="rounded-md border bg-white px-4 py-2 text-sm font-medium"
				>
					ปิด
				</button>
				<a
					href="/assets/print/{assetToView.id}"
					target="_blank"
					class="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700"
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
						class="h-4 w-4"
						><polyline points="6 9 6 2 18 2 18 9"></polyline><path
							d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
						></path><rect x="6" y="14" width="12" height="8"></rect></svg
					>
					พิมพ์ฉลาก
				</a>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if assetToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold text-gray-900">ยืนยันการลบ</h3>
			<p class="mt-2 text-sm text-gray-600">
				คุณแน่ใจหรือไม่ที่จะลบสินทรัพย์ "<strong>{assetToDelete.name}</strong>"? การดำเนินการนี้ไม่สามารถย้อนกลับได้
			</p>
			<form
				method="POST"
				action="?/deleteAsset"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						assetToDelete = null;
                        // Show global message after delete (redirect on success already handled)
                        if (form?.message) {
                            showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
                        }
					};
				}}
				class="mt-6 flex justify-end gap-3"
			>
				<input type="hidden" name="id" value={assetToDelete.id} />
				<button
					type="button"
					onclick={() => (assetToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm font-medium"
				>
					ยกเลิก
				</button>
				<button type="submit" class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white">
					ลบ
				</button>
			</form>
		</div>
	</div>
{/if}

<style>
	.truncate-2-lines {
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2; /* number of lines to show */
		-webkit-box-orient: vertical;
		word-break: break-word; /* Ensure long words without spaces can break */
	}
</style>