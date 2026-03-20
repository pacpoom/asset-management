<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { fade, slide } from 'svelte/transition';
	import { t } from '$lib/i18n';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let locationInputEl = $state<HTMLInputElement>();
	let barcodeInputEl = $state<HTMLInputElement>();
	let qtyInputEl = $state<HTMLInputElement>();

	let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(
		null
	);
	let messageTimeout: NodeJS.Timeout;

	let inputLocationCode = $state('');
	let isLocationLocked = $state(false);
	let selectedLocationId = $state<number | null>(null);

	let inputBarcode = $state('');

	let showQtyModal = $state(false);
	let isSaving = $state(false);
	let parsedData = $state<{
		itemId: number;
		itemCode: string;
		itemName: string;
		serialNumber: string;
		qty: number;
	} | null>(null);

	function showToast(message: string, type: 'success' | 'error') {
		clearTimeout(messageTimeout);
		globalMessage = { success: type === 'success', text: message, type };
		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, 5000);
	}

	function handleLocationKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			const locStr = inputLocationCode.trim().toUpperCase();

			if (!locStr) {
				showToast('กรุณาระบุ Location Code', 'error');
				return;
			}

			const foundLoc = data.locations.find((l: any) => l.location_code.toUpperCase() === locStr);

			if (foundLoc) {
				selectedLocationId = foundLoc.id;
				inputLocationCode = foundLoc.location_code;
				isLocationLocked = true;
				showToast(`เลือก Location: ${foundLoc.location_code} สำเร็จ`, 'success');

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

			const extractedItemCode = rawBarcode.substring(7, 14).trim();
			const extractedSerial = rawBarcode.substring(14, 24).trim();

			const foundItem = data.items.find(
				(i: any) => i.item_code.toUpperCase() === extractedItemCode.toUpperCase()
			);

			if (foundItem) {
				parsedData = {
					itemId: foundItem.id,
					itemCode: foundItem.item_code,
					itemName: foundItem.item_name,
					serialNumber: extractedSerial,
					qty: 1
				};
				showQtyModal = true;

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

	function closeQtyModal() {
		showQtyModal = false;
		parsedData = null;
		inputBarcode = '';
		setTimeout(() => barcodeInputEl?.focus(), 100);
	}

	$effect.pre(() => {
		if (form?.action === 'saveInbound') {
			if (form.success) {
				showToast(form.message as string, 'success');
				showQtyModal = false;
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
	<title>{$t('Inbound Receive')}</title>
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

<div class="mx-auto max-w-3xl">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-800">{$t('Inbound Receive')}</h1>
		<p class="mt-1 text-sm text-gray-500">{$t('สแกนรับสินค้าเข้าคลัง (Location -> Barcode)')}</p>
	</div>

	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		<div class="mb-8">
			<label for="location_input" class="mb-2 block text-sm font-semibold text-gray-700">
				1. {$t('สแกน Location')}
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
						placeholder={$t('ระบุรหัส Location (เช่น A-01-01)')}
						class="w-full rounded-lg border-gray-300 py-3 pr-4 pl-10 text-lg uppercase focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
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

		<div class="mb-4">
			<label for="barcode_input" class="mb-2 block text-sm font-semibold text-gray-700">
				2. {$t('สแกน Barcode')}
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
						? $t('สแกนบาร์โค้ดสินค้าที่นี่...')
						: $t('กรุณายืนยัน Location ก่อน')}
					class="w-full rounded-lg border-gray-300 py-4 pr-4 pl-10 font-mono text-lg focus:border-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
				/>
			</div>
		</div>
	</div>
</div>

{#if showQtyModal && parsedData}
	<div
		transition:slide
		class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
	>
		<div class="fixed inset-0" onclick={closeQtyModal} role="presentation"></div>
		<div
			class="relative flex w-full max-w-md transform flex-col rounded-xl bg-white shadow-2xl transition-all"
		>
			<div class="border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">ตรวจสอบการรับเข้า</h2>
			</div>

			<form
				method="POST"
				action="?/saveInbound"
				use:enhance={() => {
					isSaving = true;
					return async ({ update }) => {
						await update({ reset: false });
						isSaving = false;
					};
				}}
				class="p-6"
			>
				<input type="hidden" name="location_id" value={selectedLocationId} />
				<input type="hidden" name="item_id" value={parsedData.itemId} />
				<input type="hidden" name="serial_number" value={parsedData.serialNumber} />

				<div class="mb-5 rounded-lg border border-gray-100 bg-gray-50 p-4">
					<div class="mb-2 flex justify-between">
						<span class="text-sm text-gray-500">Location:</span>
						<span class="font-bold text-gray-900">{inputLocationCode}</span>
					</div>
					<div class="mb-2 flex justify-between">
						<span class="text-sm text-gray-500">Item:</span>
						<span class="font-bold text-blue-700">{parsedData.itemCode}</span>
					</div>
					<div class="mb-2 text-right text-xs text-gray-500">({parsedData.itemName})</div>
					<div class="flex justify-between border-t border-gray-200 pt-2">
						<span class="text-sm text-gray-500">Serial Number:</span>
						<span class="font-mono font-bold text-indigo-700">{parsedData.serialNumber}</span>
					</div>
				</div>

				<div class="mb-2">
					<label for="qty" class="mb-2 block text-sm font-semibold text-gray-700"
						>จำนวนที่รับเข้า (Qty) *</label
					>
					<input
						bind:this={qtyInputEl}
						type="number"
						name="qty"
						id="qty"
						step="any"
						min="0.01"
						required
						bind:value={parsedData.qty}
						class="w-full rounded-lg border-gray-300 px-4 py-3 text-center text-xl font-bold focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>

				{#if form?.message && !form.success && form.action === 'saveInbound'}
					<div class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
						<p><strong>Error:</strong> {form.message}</p>
					</div>
				{/if}

				<div class="mt-6 flex gap-3">
					<button
						type="button"
						onclick={closeQtyModal}
						class="flex-1 rounded-lg border border-gray-300 bg-white py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
					>
						ยกเลิก
					</button>
					<button
						type="submit"
						disabled={isSaving}
						class="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:bg-blue-400"
					>
						{isSaving ? 'กำลังบันทึก...' : 'บันทึกรับเข้า'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
