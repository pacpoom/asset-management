<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { fade, slide } from 'svelte/transition';
	import { t } from '$lib/i18n';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	// --- References for Autofocus ---
	let locationInputEl = $state<HTMLInputElement>();
	let barcodeInputEl = $state<HTMLInputElement>();

	// --- State variables ---
	let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(
		null
	);
	let messageTimeout: NodeJS.Timeout;

	// Location State (ปลายทาง)
	let inputLocationCode = $state('');
	let isLocationLocked = $state(false);
	let selectedLocationId = $state<number | null>(null);

	// Barcode State
	let inputBarcode = $state('');

	// --- Modal Location Selection State ---
	let showLocationModal = $state(false);
	let filterZone = $state('');
	let filterArea = $state('');
	let filterBin = $state('');
	
	// State สำหรับควบคุม Custom Dropdown
	let activeDropdown = $state<'zone' | 'area' | 'bin' | null>(null);

	// --- Derived filters (แสดงผลการค้นหาแบบ Partial Match และจำกัดแค่ 5 รายการ) ---
	const availableZones = $derived(
		[...new Set(data.locations.map((l: any) => String(l.zone)).filter(Boolean))]
			.filter((z: unknown): z is string => typeof z === 'string' && z.toLowerCase().includes(filterZone.toLowerCase()))
			.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
			.slice(0, 5)
	);

	const availableAreas = $derived(
		[
			...new Set(
				data.locations
					.filter(
						(l: any) =>
							!filterZone || String(l.zone).toLowerCase().includes(filterZone.toLowerCase())
					)
					.map((l: any) => String(l.area))
					.filter(Boolean)
			)
		]
			.filter((a: unknown): a is string => typeof a === 'string' && a.toLowerCase().includes(filterArea.toLowerCase()))
			.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
			.slice(0, 5)
	);

	const availableBins = $derived(
		[
			...new Set(
				data.locations
					.filter(
						(l: any) =>
							(!filterZone || String(l.zone).toLowerCase().includes(filterZone.toLowerCase())) &&
							(!filterArea || String(l.area).toLowerCase().includes(filterArea.toLowerCase()))
					)
					.map((l: any) => String(l.bin))
					.filter(Boolean)
			)
		]
			.filter((b: unknown): b is string => typeof b === 'string' && b.toLowerCase().includes(filterBin.toLowerCase()))
			.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
			.slice(0, 5)
	);

	const filteredLocations = $derived(
		data.locations
			.filter((l: any) => {
				return (
					(!filterZone || String(l.zone).toLowerCase().includes(filterZone.toLowerCase())) &&
					(!filterArea || String(l.area).toLowerCase().includes(filterArea.toLowerCase())) &&
					(!filterBin || String(l.bin).toLowerCase().includes(filterBin.toLowerCase()))
				);
			})
			.sort((a: any, b: any) => {
				const z = String(a.zone).localeCompare(String(b.zone), undefined, { numeric: true });
				if (z !== 0) return z;
				const ar = String(a.area).localeCompare(String(b.area), undefined, { numeric: true });
				if (ar !== 0) return ar;
				return String(a.bin).localeCompare(String(b.bin), undefined, { numeric: true });
			})
			.slice(0, 5) // แสดง 5 รายการล่าสุดในตารางตามคำค้นหา
	);

	// Modal State (Put-Away Confirm)
	let showConfirmModal = $state(false);
	let isSaving = $state(false);
	let parsedData = $state<{
		itemId: number;
		itemCode: string;
		itemName: string;
		serialNumber: string;
	} | null>(null);

	// --- Helper Functions ---
	function showToast(message: string, type: 'success' | 'error') {
		clearTimeout(messageTimeout);
		globalMessage = { success: type === 'success', text: message, type };
		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, 5000);
	}

	// 1. ตรวจสอบ Location ปลายทาง
	function handleLocationKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			const locStr = inputLocationCode.trim().toUpperCase();

			if (!locStr) {
				showToast('กรุณาระบุ Location Code', 'error');
				return;
			}

			// ค้นหาใน Location Master
			const foundLoc = data.locations.find((l: any) => l.location_code.toUpperCase() === locStr);

			if (foundLoc) {
				selectedLocationId = foundLoc.id;
				inputLocationCode = foundLoc.location_code;
				isLocationLocked = true;
				showToast(`เลือก Location ปลายทาง: ${foundLoc.location_code} สำเร็จ`, 'success');

				setTimeout(() => barcodeInputEl?.focus(), 100);
			} else {
				showToast(`ไม่พบ Location Code: "${locStr}" ในระบบ`, 'error');
				inputLocationCode = '';
			}
		}
	}

	function resetLocation() {
		isLocationLocked = false;
		selectedLocationId = null;
		inputLocationCode = '';
		inputBarcode = '';
		setTimeout(() => locationInputEl?.focus(), 100);
	}

	// Modal Location Actions
	function openLocationModal() {
		showLocationModal = true;
		filterZone = '';
		filterArea = '';
		filterBin = '';
		activeDropdown = null;
	}

	function selectLocationFromModal(loc: any) {
		selectedLocationId = loc.id;
		inputLocationCode = loc.location_code;
		isLocationLocked = true;
		showLocationModal = false;
		showToast(`เลือก Location ปลายทาง: ${loc.location_code} สำเร็จ`, 'success');
		setTimeout(() => barcodeInputEl?.focus(), 100);
	}

	// 2. ตรวจสอบ Barcode
	function handleBarcodeKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			const rawBarcode = inputBarcode.trim();

			if (!rawBarcode) return;

			if (rawBarcode.length < 24) {
				showToast('รูปแบบบาร์โค้ดไม่ถูกต้อง (ความยาวไม่ถึงกำหนด)', 'error');
				inputBarcode = '';
				return;
			}

			// Format digit ตามที่กำหนด: mid(8, 7) เป็น item code, mid(15, 10) คือ Serial Number
			const extractedItemCode = rawBarcode.substring(7, 14).trim();
			const extractedSerial = rawBarcode.substring(14, 24).trim();

			// ตรวจสอบ Item Code
			const foundItem = data.items.find(
				(i: any) => i.item_code.toUpperCase() === extractedItemCode.toUpperCase()
			);

			if (foundItem) {
				parsedData = {
					itemId: foundItem.id,
					itemCode: foundItem.item_code,
					itemName: foundItem.item_name,
					serialNumber: extractedSerial
				};
				showConfirmModal = true;
			} else {
				showToast(`ไม่พบ Item Code: "${extractedItemCode}" ในระบบ Master`, 'error');
				inputBarcode = '';
			}
		}
	}

	function closeConfirmModal() {
		showConfirmModal = false;
		parsedData = null;
		inputBarcode = '';
		setTimeout(() => barcodeInputEl?.focus(), 100);
	}

	// --- Effects ---
	$effect.pre(() => {
		if (form?.action === 'savePutAway') {
			if (form.success) {
				showToast(form.message as string, 'success');
				showConfirmModal = false;
				parsedData = null;
				inputBarcode = '';
				setTimeout(() => barcodeInputEl?.focus(), 100);
			} else if (form.message) {
				showToast(form.message as string, 'error');
			}
			form.action = undefined;
		}
	});
</script>

<svelte:head>
	<title>{$t('Put-Away')}</title>
</svelte:head>

<!-- Global Toast -->
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

<div class="mx-auto max-w-3xl">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-800">{$t('Put-Away')}</h1>
		<p class="mt-1 text-sm text-gray-500">
			{$t('สแกนจัดเก็บ/ย้ายตำแหน่งสินค้า (Location ปลายทาง -> Barcode)')}
		</p>
	</div>

	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		<!-- Step 1: Destination Location -->
		<div class="mb-8">
			<label for="location_input" class="mb-2 block text-sm font-semibold text-gray-700">
				1. {$t('สแกน Location')} <span class="font-bold text-blue-600">{$t('ปลายทาง')}</span>
				<span class="text-xs font-normal text-gray-500">{$t('กด Enter เพื่อยืนยัน')}</span>
			</label>
			<div class="flex items-center gap-3">
				<div class="relative flex-1">
					<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
						<svg
							class="h-5 w-5 text-gray-400"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle
								cx="12"
								cy="10"
								r="3"
							/></svg
						>
					</div>
					<input
						bind:this={locationInputEl}
						type="text"
						id="location_input"
						bind:value={inputLocationCode}
						onkeydown={handleLocationKeydown}
						disabled={isLocationLocked}
						placeholder={$t('ระบุรหัส Location ปลายทาง (เช่น B-02-05)')}
						class="w-full rounded-lg border-gray-300 py-3 pr-4 pl-10 text-lg uppercase focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
					/>
				</div>

				{#if !isLocationLocked}
					<button
						type="button"
						onclick={openLocationModal}
						class="flex h-[50px] items-center justify-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-4 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							class="text-gray-500"
							><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle
								cx="12"
								cy="10"
								r="3"
							/></svg
						>
						{$t('เลือก')}
					</button>
				{/if}

				{#if isLocationLocked}
					<button
						type="button"
						onclick={resetLocation}
						class="flex h-[50px] items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
					>
						เปลี่ยน
					</button>
				{/if}
			</div>
		</div>

		<!-- Step 2: Barcode -->
		<div class="mb-4">
			<label for="barcode_input" class="mb-2 block text-sm font-semibold text-gray-700">
				2. {$t('สแกน Barcode สินค้า')}
				<span class="text-xs font-normal text-gray-500">{$t('กด Enter เพื่อยืนยัน')}</span>
			</label>
			<div class="relative">
				<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
					<svg
						class="h-5 w-5 text-gray-400"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"><path d="M3 5v14M21 5v14M7 5v14M11 5v14M15 5v14M19 5v14" /></svg
					>
				</div>
				<input
					bind:this={barcodeInputEl}
					type="text"
					id="barcode_input"
					bind:value={inputBarcode}
					onkeydown={handleBarcodeKeydown}
					disabled={!isLocationLocked}
					placeholder={isLocationLocked
						? $t('สแกนบาร์โค้ดสินค้าที่ต้องการย้ายที่นี่...')
						: $t('กรุณายืนยัน Location ปลายทางก่อน')}
					class="w-full rounded-lg border-gray-300 py-4 pr-4 pl-10 font-mono text-lg focus:border-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
				/>
			</div>
		</div>
	</div>
</div>

<!-- Modal สำหรับเลือก Location แบบ List -->
{#if showLocationModal}
	<div
		transition:slide
		class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
	>
		<div
			class="fixed inset-0"
			onclick={() => (showLocationModal = false)}
			role="presentation"
		></div>
		<div
			class="relative flex max-h-[90vh] w-full max-w-2xl transform flex-col rounded-xl bg-white shadow-2xl transition-all"
		>
			<div class="flex items-center justify-between border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">{$t('ค้นหาและเลือก Location ปลายทาง')}</h2>
				<button
					type="button"
					onclick={() => (showLocationModal = false)}
					class="rounded-full p-1 hover:bg-gray-100"
					aria-label={$t('ปิด')}
					title={$t('ปิด')}
				>
					<svg
						class="h-5 w-5 text-gray-500"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"><path d="M18 6L6 18M6 6l12 12" /></svg
					>
				</button>
			</div>

			<div class="flex-1 overflow-y-auto p-6">
				<!-- Filters (Custom Dropdown) -->
				<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
					
					<!-- Zone Filter -->
					<div class="relative">
						<label for="filterZone" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Zone')}</label
						>
						<input
							type="search"
							id="filterZone"
							bind:value={filterZone}
							oninput={() => {
								filterArea = '';
								filterBin = '';
								activeDropdown = 'zone';
							}}
							onfocus={() => (activeDropdown = 'zone')}
							onblur={() => setTimeout(() => (activeDropdown = null), 200)}
							placeholder={$t('ทั้งหมด (พิมพ์ค้นหา)')}
							class="w-full rounded-lg border-gray-300 bg-white text-sm focus:border-blue-500 focus:ring-blue-500"
							autocomplete="off"
						/>
						{#if activeDropdown === 'zone'}
							<ul class="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<li
									class="cursor-pointer px-4 py-2 text-sm text-gray-900 hover:bg-blue-600 hover:text-white"
									onmousedown={() => {
										filterZone = '';
										filterArea = '';
										filterBin = '';
										activeDropdown = null;
									}}
								>
									{$t('ทั้งหมด')}
								</li>
								{#each availableZones as z}
									<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
									<li
										class="cursor-pointer px-4 py-2 text-sm text-gray-900 hover:bg-blue-600 hover:text-white"
										onmousedown={() => {
											filterZone = z;
											filterArea = '';
											filterBin = '';
											activeDropdown = null;
										}}
									>
										{z}
									</li>
								{/each}
							</ul>
						{/if}
					</div>

					<!-- Area Filter -->
					<div class="relative">
						<label for="filterArea" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Area')}</label
						>
						<input
							type="search"
							id="filterArea"
							bind:value={filterArea}
							oninput={() => {
								filterBin = '';
								activeDropdown = 'area';
							}}
							onfocus={() => (activeDropdown = 'area')}
							onblur={() => setTimeout(() => (activeDropdown = null), 200)}
							disabled={!filterZone}
							placeholder={$t('ทั้งหมด (พิมพ์ค้นหา)')}
							class="w-full rounded-lg border-gray-300 bg-white text-sm focus:border-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
							autocomplete="off"
						/>
						{#if activeDropdown === 'area' && filterZone}
							<ul class="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<li
									class="cursor-pointer px-4 py-2 text-sm text-gray-900 hover:bg-blue-600 hover:text-white"
									onmousedown={() => {
										filterArea = '';
										filterBin = '';
										activeDropdown = null;
									}}
								>
									{$t('ทั้งหมด')}
								</li>
								{#each availableAreas as a}
									<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
									<li
										class="cursor-pointer px-4 py-2 text-sm text-gray-900 hover:bg-blue-600 hover:text-white"
										onmousedown={() => {
											filterArea = a;
											filterBin = '';
											activeDropdown = null;
										}}
									>
										{a}
									</li>
								{/each}
							</ul>
						{/if}
					</div>

					<!-- Bin Filter -->
					<div class="relative">
						<label for="filterBin" class="mb-1 block text-sm font-medium text-gray-700"
							>{$t('Bin')}</label
						>
						<input
							type="search"
							id="filterBin"
							bind:value={filterBin}
							oninput={() => (activeDropdown = 'bin')}
							onfocus={() => (activeDropdown = 'bin')}
							onblur={() => setTimeout(() => (activeDropdown = null), 200)}
							disabled={!filterArea}
							placeholder={$t('ทั้งหมด (พิมพ์ค้นหา)')}
							class="w-full rounded-lg border-gray-300 bg-white text-sm focus:border-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
							autocomplete="off"
						/>
						{#if activeDropdown === 'bin' && filterArea}
							<ul class="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<li
									class="cursor-pointer px-4 py-2 text-sm text-gray-900 hover:bg-blue-600 hover:text-white"
									onmousedown={() => {
										filterBin = '';
										activeDropdown = null;
									}}
								>
									{$t('ทั้งหมด')}
								</li>
								{#each availableBins as b}
									<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
									<li
										class="cursor-pointer px-4 py-2 text-sm text-gray-900 hover:bg-blue-600 hover:text-white"
										onmousedown={() => {
											filterBin = b;
											activeDropdown = null;
										}}
									>
										{b}
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>

				<!-- Location List Table -->
				<div class="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
					<table class="min-w-full divide-y divide-gray-200 text-sm">
						<thead class="sticky top-0 bg-gray-50 shadow-sm">
							<tr>
								<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Location Code')}</th
								>
								<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Zone')}</th>
								<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Area')}</th>
								<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Bin')}</th>
								<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('Action')}</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200 bg-white">
							{#each filteredLocations as loc}
								<tr
									class="cursor-pointer transition-colors hover:bg-blue-50"
									onclick={() => selectLocationFromModal(loc)}
								>
									<td class="px-4 py-3 font-mono font-bold text-blue-700">{loc.location_code}</td>
									<td class="px-4 py-3 text-center text-gray-600">{loc.zone}</td>
									<td class="px-4 py-3 text-center text-gray-600">{loc.area}</td>
									<td class="px-4 py-3 text-center text-gray-600">{loc.bin}</td>
									<td class="px-4 py-3 text-right">
										<button
											type="button"
											class="rounded bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200"
										>
											{$t('เลือก')}
										</button>
									</td>
								</tr>
							{:else}
								<tr>
									<td colspan="5" class="py-8 text-center text-gray-500">
										{$t('ไม่พบ Location ที่ตรงกับเงื่อนไข')}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Step 3: Confirm Modal -->
{#if showConfirmModal && parsedData}
	<div
		transition:slide
		class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
	>
		<div class="fixed inset-0" onclick={closeConfirmModal} role="presentation"></div>
		<div
			class="relative flex w-full max-w-md transform flex-col rounded-xl bg-white shadow-2xl transition-all"
		>
			<div class="border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">ยืนยันการจัดเก็บ (Put-Away)</h2>
			</div>

			<form
				method="POST"
				action="?/savePutAway"
				use:enhance={() => {
					isSaving = true;
					return async ({ update }) => {
						await update({ reset: false });
						isSaving = false;
					};
				}}
				class="p-6"
			>
				<!-- Hidden values -->
				<input type="hidden" name="location_id" value={selectedLocationId} />
				<input type="hidden" name="item_id" value={parsedData.itemId} />
				<input type="hidden" name="serial_number" value={parsedData.serialNumber} />

				<!-- Info Display -->
				<div class="mb-5 rounded-lg border border-blue-100 bg-blue-50 p-4">
					<div class="mb-3 flex flex-col gap-1 border-b border-blue-200 pb-3">
						<span class="text-xs font-bold tracking-wider text-blue-600 uppercase"
							>ย้ายสินค้าไปที่ (Destination)</span
						>
						<span class="text-xl font-black text-gray-900">{inputLocationCode}</span>
					</div>
					<div class="mb-2 flex justify-between">
						<span class="text-sm text-gray-500">Item:</span>
						<span class="font-bold text-blue-700">{parsedData.itemCode}</span>
					</div>
					<div class="mb-2 text-right text-xs text-gray-500">({parsedData.itemName})</div>
					<div class="flex justify-between border-t border-blue-200 pt-2">
						<span class="text-sm text-gray-500">Serial Number:</span>
						<span class="font-mono font-bold text-indigo-700">{parsedData.serialNumber}</span>
					</div>
				</div>

				{#if form?.message && !form.success && form.action === 'savePutAway'}
					<div class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
						<p><strong>Error:</strong> {form.message}</p>
					</div>
				{/if}

				<div class="mt-6 flex gap-3">
					<button
						type="button"
						onclick={closeConfirmModal}
						class="flex-1 rounded-lg border border-gray-300 bg-white py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
					>
						ยกเลิก
					</button>
					<button
						type="submit"
						disabled={isSaving}
						class="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:bg-blue-400"
					>
						{isSaving ? 'กำลังบันทึก...' : 'ยืนยันการจัดเก็บ'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}