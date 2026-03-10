<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { compressImage } from '$lib/utils/image-compressor';
	import { t } from '$lib/i18n';
	import { get } from 'svelte/store';

	type Asset = PageData['assets'][0];

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedAsset = $state<Partial<Asset> | null>(null);
	let assetToDelete = $state<Asset | null>(null);
	let assetToView = $state<Asset | null>(null);
	let isLoading = $state(false);
	let searchQuery = $state(data.searchQuery ?? '');

	let originalImageFile: File | null = $state(null);
	let isCompressing = $state(false);
	let compressionError = $state<string | null>(null);

	let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(
		null
	);
	let messageTimeout: NodeJS.Timeout;

	async function onFileSelected(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			const file = input.files[0];
			if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
				compressionError = get(t)('Please select an image file (JPG, PNG, WEBP) only.');
				originalImageFile = null;
				return;
			}

			isCompressing = true;
			compressionError = null;
			try {
				const compressedFile = await compressImage(file);
				originalImageFile = compressedFile;
			} catch (error) {
				console.error('Image compression failed:', error);
				compressionError = get(t)('Error compressing image.');
				originalImageFile = null;
			} finally {
				isCompressing = false;
			}
		}
	}

	function openModal(mode: 'add' | 'edit', asset: Asset | null = null) {
		modalMode = mode;
		globalMessage = null;
		originalImageFile = null;
		compressionError = null;
		isCompressing = false;
		isUserDropdownOpen = false;

		if (mode === 'edit' && asset) {
			selectedAsset = { ...asset };
			userSearchText =
				data.users?.find((u: any) => u.id === asset.assigned_to_user_id)?.full_name || '';
		} else {
			selectedAsset = { status: 'In Storage', asset_tag: '', asset_tag_sub: undefined };
			userSearchText = '';
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

	function showGlobalMessage(message: {
		success: boolean;
		text: string;
		type: 'success' | 'error';
	}) {
		clearTimeout(messageTimeout);
		globalMessage = message;
		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, 5000);
	}

	function handlePrintClick(e: Event) {
		e.stopPropagation();
	}

	$effect.pre(() => {
		if (form?.message && form.action === 'deleteAsset') {
			showGlobalMessage({
				success: false,
				text: form.message as string,
				type: 'error'
			});
		}
	});

	let userSearchText = $state('');
	let isUserDropdownOpen = $state(false);

	const filteredUsers = $derived.by(() => {
		return (
			data.users?.filter(
				(u: any) =>
					u.full_name.toLowerCase().includes(userSearchText.toLowerCase()) ||
					u.email.toLowerCase().includes(userSearchText.toLowerCase())
			) || []
		);
	});

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
	<title>{$t('Asset Management')}</title>
</svelte:head>

{#if globalMessage}
	<div
		transition:fade
		class="fixed top-4 right-4 z-[70] max-w-sm transform rounded-lg p-4 text-sm font-semibold shadow-xl transition-transform"
		class:bg-green-100={globalMessage?.type === 'success'}
		class:text-green-800={globalMessage?.type === 'success'}
		class:bg-red-100={globalMessage?.type === 'error'}
		class:text-red-800={globalMessage?.type === 'error'}
	>
		<div class="flex items-center gap-2">
			{#if globalMessage?.type === 'success'}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-5 w-5"
					><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline
						points="22 4 12 14.01 9 11.01"
					/></svg
				>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-5 w-5"
					><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line
						x1="9"
						y1="9"
						x2="15"
						y2="15"
					/></svg
				>
			{/if}
			<p>{globalMessage?.text}</p>
		</div>
	</div>
{/if}

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Asset Management')}</h1>
		<p class="mt-1 text-sm text-gray-500">{$t('View, add, and manage all company assets')}</p>
	</div>
	<div class="flex items-center gap-2">
		<form method="POST" action="/assets/export">
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
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-4 w-4"
					><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
						points="7 10 12 15 17 10"
					/><line x1="12" y1="15" x2="12" y2="3" /></svg
				>
				{$t('Export to CSV')}
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
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-4 w-4"
			>
				<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
			</svg>
			{$t('Add New Asset')}
		</button>
	</div>
</div>

<div class="mb-4">
	<form method="GET" class="relative">
		<input
			type="search"
			name="search"
			bind:value={searchQuery}
			placeholder={$t('Search Asset Placeholder')}
			class="w-full rounded-lg border-gray-300 py-2 pr-4 pl-10 focus:border-blue-500 focus:ring-blue-500"
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

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Image')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Asset Tag')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Sub Tag')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Name')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Category')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Assigned To')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Status')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Location')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Actions')}</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.assets.length === 0}
				<tr>
					<td colspan="9" class="py-12 text-center text-gray-500">
						{#if data.searchQuery}
							{$t('No assets found for:')} "{data.searchQuery}"
						{:else}
							{$t('No assets found')}
						{/if}
					</td>
				</tr>
			{:else}
				{#each data.assets as asset (asset.id)}
					<tr class="hover:bg-gray-50">
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
										<circle cx="9" cy="9" r="2" /><path
											d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
										/>
									</svg>
								{/if}
							</div>
						</td>
						<td class="px-4 py-3 font-mono text-xs text-gray-700">{asset.asset_tag}</td>
						<td class="px-4 py-3 font-mono text-xs text-gray-700">{asset.asset_tag_sub ?? 'N/A'}</td
						>
						<td
							class="cursor-pointer px-4 py-3 font-medium text-gray-900 hover:text-blue-600 hover:underline"
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
								{asset.status === 'In Use'
									? $t('In Use')
									: asset.status === 'In Storage'
										? $t('In Storage')
										: asset.status === 'Under Maintenance'
											? $t('Under Maintenance')
											: $t('Disposed')}
							</span>
						</td>
						<td class="px-4 py-3 text-gray-600">{asset.location_name ?? 'N/A'}</td>
						<td class="px-4 py-3">
							<div class="flex items-center gap-2">
								<button
									onclick={() => openModal('edit', asset)}
									class="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600"
									aria-label={$t('Edit Asset')}
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
									aria-label={$t('Delete Asset')}
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
								<a
									href="/assets/print/{asset.id}"
									target="_blank"
									class="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-green-600"
									aria-label={$t('Print Label')}
									title={$t('Print Label')}
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

{#if data.totalPages > 1}
	<div class="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
		<div>
			<p class="text-sm text-gray-700">
				{$t('Showing page')} <span class="font-medium">{data.currentPage}</span>
				{$t('of')}
				<span class="font-medium">{data.totalPages}</span>
				{$t('pages')}
			</p>
		</div>
		<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
			<a
				href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'}
				class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus:z-20 focus:outline-offset-0 {data.currentPage ===
				1
					? 'pointer-events-none opacity-50'
					: ''}"
				aria-disabled={data.currentPage === 1}
			>
				<span class="sr-only">{$t('Previous')}</span>
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
						class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 ring-inset"
					>
						...
					</span>
				{:else}
					<a
						href={getPageUrl(Number(pageNum))}
						class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum ===
						data.currentPage
							? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
							: 'text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus:z-20 focus:outline-offset-0'}"
						aria-current={pageNum === data.currentPage ? 'page' : undefined}
					>
						{pageNum}
					</a>
				{/if}
			{/each}
			<a
				href={data.currentPage < data.totalPages ? getPageUrl(data.currentPage + 1) : '#'}
				class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus:z-20 focus:outline-offset-0 {data.currentPage ===
				data.totalPages
					? 'pointer-events-none opacity-50'
					: ''}"
				aria-disabled={data.currentPage === data.totalPages}
			>
				<span class="sr-only">{$t('Next')}</span>
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
			aria-label={$t('Close')}
		></div>

		<div
			class="relative flex max-h-[90vh] w-full max-w-2xl transform flex-col rounded-xl bg-white shadow-2xl transition-all"
		>
			<div class="flex-shrink-0 border-b border-gray-200 px-6 py-4">
				<h2 id="modal-title" class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? $t('Add New Asset') : $t('Edit Asset')}
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
					{#if modalMode === 'edit'}
						<input type="hidden" name="id" value={selectedAsset.id} />
						<input type="hidden" name="existing_image_url" value={selectedAsset.image_url ?? ''} />
					{/if}

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<div>
							<label for="asset_tag" class="mb-1 block text-sm font-medium text-gray-700"
								>{$t('Asset Tag')}</label
							>
							<input
								type="text"
								value={modalMode === 'add'
									? $t('Auto-generated by system')
									: selectedAsset.asset_tag}
								class="w-full rounded-md border-gray-300 bg-gray-100"
								readonly
							/>
						</div>
						<div>
							<label for="asset_tag_sub" class="mb-1 block text-sm font-medium text-gray-700"
								>{$t('Asset Sub Tag')}</label
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

					<div>
						<label for="name" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Asset Name')}</label
						>
						<input
							type="text"
							name="name"
							id="name"
							required
							bind:value={selectedAsset.name}
							class="w-full rounded-md border-gray-300"
						/>
					</div>
					<div>
						<label for="status" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Status')}</label
						>
						<select
							name="status"
							id="status"
							bind:value={selectedAsset.status}
							class="w-full rounded-md border-gray-300"
						>
							<option value="In Storage">{$t('In Storage')}</option>
							<option value="In Use">{$t('In Use')}</option>
							<option value="Under Maintenance">{$t('Under Maintenance')}</option>
							<option value="Disposed">{$t('Disposed')}</option>
						</select>
					</div>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<div>
							<label for="purchase_date" class="mb-1 block text-sm font-medium text-gray-700"
								>{$t('Purchase Date')}</label
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
								>{$t('Cost (THB)')}</label
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

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<div>
							<label for="category_id" class="mb-1 block text-sm font-medium text-gray-700"
								>{$t('Category')}</label
							>
							<select
								name="category_id"
								id="category_id"
								required
								bind:value={selectedAsset.category_id}
								class="w-full rounded-md border-gray-300"
							>
								<option disabled selected value={undefined}>{$t('Select Category')}</option>
								{#each data.categories as category}
									<option value={category.id}>{category.name}</option>
								{/each}
							</select>
						</div>
						<div>
							<label for="location_id" class="mb-1 block text-sm font-medium text-gray-700"
								>{$t('Location')}</label
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
					<div class="relative">
						<label for="assigned_to_user_id" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Assigned To')}</label
						>
						<input
							type="hidden"
							name="assigned_to_user_id"
							value={selectedAsset?.assigned_to_user_id || ''}
						/>
						<input
							type="text"
							placeholder={$t('Search or select assignee')}
							bind:value={userSearchText}
							onfocus={() => (isUserDropdownOpen = true)}
							onblur={() => setTimeout(() => (isUserDropdownOpen = false), 200)}
							oninput={() => {
								selectedAsset!.assigned_to_user_id = undefined;
								isUserDropdownOpen = true;
							}}
							class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
						/>
						{#if isUserDropdownOpen}
							<ul
								class="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg focus:outline-none"
							>
								<li>
									<button
										type="button"
										class="w-full cursor-pointer px-3 py-2 text-left text-gray-900 hover:bg-blue-600 hover:text-white"
										onclick={() => {
											selectedAsset!.assigned_to_user_id = undefined;
											userSearchText = '';
											isUserDropdownOpen = false;
										}}
									>
										{$t('Unassigned')}
									</button>
								</li>
								{#each filteredUsers as user (user.id)}
									<li>
										<button
											type="button"
											class="w-full cursor-pointer px-3 py-2 text-left text-gray-900 hover:bg-blue-600 hover:text-white"
											onclick={() => {
												selectedAsset!.assigned_to_user_id = user.id;
												userSearchText = user.full_name;
												isUserDropdownOpen = false;
											}}
										>
											{user.full_name} <span class="text-xs opacity-75">({user.email})</span>
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>

					<div>
						<label for="image" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Asset Image')}</label
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
							<p class="mt-2 text-sm text-blue-600">{$t('Compressing image...')}</p>
						{/if}
						{#if compressionError}
							<p class="mt-2 text-sm text-red-600">{compressionError}</p>
						{/if}
						{#if originalImageFile && !isCompressing}
							<p class="mt-2 text-sm text-green-600">{$t('Image ready for upload')}</p>
						{/if}
					</div>

					<div>
						<label for="notes" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Notes/Remarks')}</label
						>
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
						{$t('Cancel')}
					</button>
					<button
						type="submit"
						disabled={isLoading || isCompressing}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-blue-400"
					>
						{#if isLoading}
							{$t('Saving...')}
						{:else if isCompressing}
							{$t('Compressing...')}
						{:else}
							{$t('Save Asset')}
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

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
			aria-label={$t('Close')}
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
						aria-label={$t('Close')}
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
							<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
						</svg>
					</button>
				</div>
				<div class="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
					<div
						class="flex aspect-video items-center justify-center overflow-hidden rounded-lg border bg-gray-50"
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
								<circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
							</svg>
						{/if}
					</div>
					<div class="space-y-4 text-sm">
						<div>
							<p class="font-semibold text-gray-700">{$t('Status')}</p>
							<p class="text-gray-600">
								{assetToView.status === 'In Use'
									? $t('In Use')
									: assetToView.status === 'In Storage'
										? $t('In Storage')
										: assetToView.status === 'Under Maintenance'
											? $t('Under Maintenance')
											: $t('Disposed')}
							</p>
						</div>
						<div>
							<p class="font-semibold text-gray-700">{$t('Assigned To')}</p>
							<p class="text-gray-600">{assetToView.assigned_user_name ?? $t('Unassigned')}</p>
						</div>
						<div>
							<p class="font-semibold text-gray-700">{$t('Location')}</p>
							<p class="text-gray-600">{assetToView.location_name ?? 'N/A'}</p>
						</div>
						<div>
							<p class="font-semibold text-gray-700">{$t('Category')}</p>
							<p class="text-gray-600">{assetToView.category_name ?? 'N/A'}</p>
						</div>
						<div>
							<p class="font-semibold text-gray-700">{$t('Purchase Date')}</p>
							<p class="text-gray-600">{assetToView.purchase_date}</p>
						</div>
						<div>
							<p class="font-semibold text-gray-700">{$t('Cost (THB)')}</p>
							<p class="text-gray-600">
								{new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(
									assetToView.purchase_cost
								)}
							</p>
						</div>
					</div>
					<div class="md:col-span-2">
						<p class="font-semibold text-gray-700">{$t('Notes/Remarks')}</p>
						<p class="mt-1 whitespace-pre-wrap text-gray-600">
							{assetToView.notes || $t('No notes/remarks')}
						</p>
					</div>
				</div>
			</div>
			<div
				class="flex flex-shrink-0 items-center justify-end gap-3 rounded-b-xl border-t border-gray-200 bg-gray-50 p-4"
			>
				<button
					type="button"
					onclick={closeDetailModal}
					class="rounded-md border bg-white px-4 py-2 text-sm font-medium"
				>
					{$t('Close')}
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
					{$t('Print Label')}
				</a>
			</div>
		</div>
	</div>
{/if}

{#if assetToDelete}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold text-gray-900">{$t('Confirm Delete')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				{$t('Are you sure you want to delete the asset')} "<strong>{assetToDelete.name}</strong>"?
				{$t('This action cannot be undone.')}
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
					{$t('Cancel')}
				</button>
				<button
					type="submit"
					class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white"
				>
					{$t('Delete')}
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
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		word-break: break-word;
	}
</style>
