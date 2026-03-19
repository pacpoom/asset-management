<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { fade, slide } from 'svelte/transition';
	import { t } from '$lib/i18n';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	// --- References for Autofocus ---
	let locationInputEl = $state<HTMLInputElement>();
	let barcodeInputEl = $state<HTMLInputElement>();
	let qtyInputEl = $state<HTMLInputElement>();

	// --- State variables ---
	let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(null);
	let messageTimeout: NodeJS.Timeout;

	// Location State (ต้นทาง)
	let inputLocationCode = $state('');
	let isLocationLocked = $state(false);
	let selectedLocationId = $state<number | null>(null);

	// Barcode State
	let inputBarcode = $state('');

	// Modal State
	let showConfirmModal = $state(false);
	let isSaving = $state(false);
	let parsedData = $state<{
		itemId: number;
		itemCode: string;
		itemName: string;
		serialNumber: string;
		qty: number;
	} | null>(null);

	// --- Helper Functions ---
	function showToast(message: string, type: 'success' | 'error') {
		clearTimeout(messageTimeout);
		globalMessage = { success: type === 'success', text: message, type };
		messageTimeout = setTimeout(() => { globalMessage = null; }, 5000);
	}

	// 1. ตรวจสอบ Location ต้นทาง
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
				showToast(`เลือก Location ต้นทาง: ${foundLoc.location_code} สำเร็จ`, 'success');
				
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

			// Format digit: mid(8, 7) เป็น item code, mid(15, 10) คือ Serial Number
			const extractedItemCode = rawBarcode.substring(7, 14).trim();
			const extractedSerial = rawBarcode.substring(14, 24).trim();

			// ตรวจสอบ Item Code
			const foundItem = data.items.find((i: any) => i.item_code.toUpperCase() === extractedItemCode.toUpperCase());

			if (foundItem) {
				parsedData = {
					itemId: foundItem.id,
					itemCode: foundItem.item_code,
					itemName: foundItem.item_name,
					serialNumber: extractedSerial,
					qty: 1 // Default ให้อยากตัด 1 ชิ้น
				};
				showConfirmModal = true;

				setTimeout(() => {
					qtyInputEl?.focus();
					qtyInputEl?.select();
				}, 100);
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
		if (form?.action === 'saveOutbound') {
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
	<title>{$t('Scan to Deduct Stock')}</title>
</svelte:head>

<!-- Global Toast -->
{#if globalMessage}
	<div transition:fade class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 text-sm font-semibold shadow-xl {globalMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
		{globalMessage.text}
	</div>
{/if}

<div class="mx-auto max-w-3xl">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-800">{$t('Scan to Deduct Stock')}</h1>
		<p class="mt-1 text-sm text-gray-500">{$t('สแกนตัดสต็อกออก / จ่ายของ (Location ต้นทาง -> Barcode)')}</p>
	</div>

	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		
		<!-- Step 1: Source Location -->
		<div class="mb-8">
			<label for="location_input" class="mb-2 block text-sm font-semibold text-gray-700">
				1. สแกน Location <span class="text-red-600 font-bold">ต้นทาง</span> <span class="text-xs font-normal text-gray-500">(กด Enter เพื่อยืนยัน)</span>
			</label>
			<div class="flex items-center gap-3">
				<div class="relative flex-1">
					<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
						<svg class="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
					</div>
					<input
						bind:this={locationInputEl}
						type="text"
						id="location_input"
						bind:value={inputLocationCode}
						onkeydown={handleLocationKeydown}
						disabled={isLocationLocked}
						placeholder="ระบุรหัส Location ที่จะไปหยิบของ (เช่น A-01-01)"
						class="w-full rounded-lg border-gray-300 py-3 pl-10 pr-4 text-lg focus:border-red-500 focus:ring-red-500 disabled:bg-gray-100 disabled:text-gray-500 uppercase"
					/>
				</div>
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
				2. สแกน Barcode สินค้า <span class="text-xs font-normal text-gray-500">(กด Enter เพื่อยืนยัน)</span>
			</label>
			<div class="relative">
				<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
					<svg class="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5v14M21 5v14M7 5v14M11 5v14M15 5v14M19 5v14"/></svg>
				</div>
				<input
					bind:this={barcodeInputEl}
					type="text"
					id="barcode_input"
					bind:value={inputBarcode}
					onkeydown={handleBarcodeKeydown}
					disabled={!isLocationLocked}
					placeholder={isLocationLocked ? "สแกนบาร์โค้ดสินค้าที่ต้องการตัดสต็อกที่นี่..." : "กรุณายืนยัน Location ต้นทางก่อน"}
					class="w-full rounded-lg border-gray-300 py-4 pl-10 pr-4 text-lg font-mono focus:border-red-500 focus:ring-red-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
				/>
			</div>
		</div>

	</div>
</div>

<!-- Step 3: Confirm Modal -->
{#if showConfirmModal && parsedData}
	<div transition:slide class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
		<div class="fixed inset-0" onclick={closeConfirmModal} role="presentation"></div>
		<div class="relative flex w-full max-w-md transform flex-col rounded-xl bg-white shadow-2xl transition-all">
			<div class="border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">ยืนยันการตัดสต็อก (Outbound Issue)</h2>
			</div>

			<form
				method="POST"
				action="?/saveOutbound"
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
				<div class="mb-5 rounded-lg bg-red-50 p-4 border border-red-100">
					<div class="mb-3 flex flex-col gap-1 border-b border-red-200 pb-3">
						<span class="text-xs text-red-600 font-bold uppercase tracking-wider">ตัดสินค้าออกจาก (Source)</span>
						<span class="text-xl font-black text-gray-900">{inputLocationCode}</span>
					</div>
					<div class="mb-2 flex justify-between">
						<span class="text-sm text-gray-500">Item:</span>
						<span class="font-bold text-red-700">{parsedData.itemCode}</span>
					</div>
					<div class="mb-2 text-right text-xs text-gray-500">({parsedData.itemName})</div>
					<div class="flex justify-between border-t border-red-200 pt-2">
						<span class="text-sm text-gray-500">Serial Number:</span>
						<span class="font-mono font-bold text-indigo-700">{parsedData.serialNumber}</span>
					</div>
				</div>

				<!-- Qty Input -->
				<div class="mb-2">
					<label for="qty" class="mb-2 block text-sm font-semibold text-gray-700">จำนวนที่ต้องการตัด (Qty) *</label>
					<input
						bind:this={qtyInputEl}
						type="number"
						name="qty"
						id="qty"
						step="any"
						min="0.01"
						required
						bind:value={parsedData.qty}
						class="w-full rounded-lg border-gray-300 py-3 px-4 text-xl font-bold text-center text-red-600 focus:border-red-500 focus:ring-red-500"
					/>
				</div>

				{#if form?.message && !form.success && form.action === 'saveOutbound'}
					<div class="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600 border border-red-200">
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
						class="flex-1 rounded-lg bg-red-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:bg-red-400"
					>
						{isSaving ? 'กำลังบันทึก...' : 'ยืนยันการตัดสต็อก'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}