<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t, locale } from '$lib/i18n';

	// นำเข้า Library สำหรับทำ PDF และ QR Code
	import { jsPDF } from 'jspdf';
	import QRCode from 'qrcode';

	// --- Types ---
	type Item = PageData['items'][0];
	type Unit = PageData['units'][0];

	// --- Props & State ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedItem = $state<Partial<Item> | null>(null);
	let itemToDelete = $state<Item | null>(null);
	let isSaving = $state(false);

	let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(
		null
	);
	let messageTimeout: NodeJS.Timeout;

	// Search State
	let searchQuery = $state(data.searchQuery ?? '');
	let searchTimer: NodeJS.Timeout;

	// --- Label Print State ---
	let selectedItemIds = $state<number[]>([]);
	let showPrintModal = $state(false);
	let isGeneratingPDF = $state(false);

	let printCount = $state(1);
	let qtyPerLabel = $state(100);

	// ค่าจาก Database
	let companyName = $state(data.companyName || 'MY COMPANY CO., LTD.');
	let companyLogo = $state(data.companyLogo);

	// Paper, QR Size, Logo Size & Font Size State
	let paperWidth = $state(5);
	let paperHeight = $state(3);
	let qrSize = $state(1.5);
	let logoSize = $state(0.8); // ขนาดโลโก้เริ่มต้น (ความกว้างนิ้ว)
	let fontSize = $state(12);

	// Default Lot = วันนี้ (YYYYMMDD)
	const today = new Date();
	const defaultLot = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
	let lotNumber = $state(defaultLot);

	const isAllSelected = $derived(
		data.items.length > 0 && selectedItemIds.length === data.items.length
	);

	// โหลดค่าขนาดกระดาษ, QR Code, Logo และ Font จาก Local Storage
	$effect(() => {
		const savedWidth = localStorage.getItem('labelPaperWidth');
		const savedHeight = localStorage.getItem('labelPaperHeight');
		const savedQrSize = localStorage.getItem('labelQrSize');
		const savedLogoSize = localStorage.getItem('labelLogoSize');
		const savedFontSize = localStorage.getItem('labelFontSize');

		if (savedWidth) paperWidth = parseFloat(savedWidth);
		if (savedHeight) paperHeight = parseFloat(savedHeight);
		if (savedQrSize) qrSize = parseFloat(savedQrSize);
		if (savedLogoSize) logoSize = parseFloat(savedLogoSize);
		if (savedFontSize) fontSize = parseFloat(savedFontSize);
	});

	// --- Functions ---
	function toggleSelectAll(e: Event) {
		const checked = (e.target as HTMLInputElement).checked;
		if (checked) {
			selectedItemIds = data.items.map((i: Item) => i.id);
		} else {
			selectedItemIds = [];
		}
	}

	function handleSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			const params = new URLSearchParams();
			if (searchQuery) params.set('search', searchQuery);
			params.set('limit', data.limit.toString());
			params.set('page', '1');

			goto(`${$page.url.pathname}?${params.toString()}`, {
				keepFocus: true,
				noScroll: true,
				replaceState: true
			});
		}, 400);
	}

	function changeLimit(newLimit: string) {
		const params = new URLSearchParams();
		if (searchQuery) params.set('search', searchQuery);
		params.set('limit', newLimit);
		params.set('page', '1');

		goto(`${$page.url.pathname}?${params.toString()}`, {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	function openModal(mode: 'add' | 'edit', item: Item | null = null) {
		modalMode = mode;
		globalMessage = null;

		if (mode === 'edit' && item) {
			selectedItem = { ...item };
		} else {
			selectedItem = {
				item_code: '',
				item_name: '',
				item_name_eng: '',
				min_stock: 0,
				max_stock: 0
			} as any;
		}
	}

	function closeModal() {
		modalMode = null;
		selectedItem = null;
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

	function formatQuantity(value: number | null | undefined) {
		if (value === null || value === undefined) return '-';
		return new Intl.NumberFormat($locale === 'th' ? 'th-TH' : 'en-US', {
			style: 'decimal',
			minimumFractionDigits: 0,
			maximumFractionDigits: 2
		}).format(value);
	}

	// --- Generate PDF Function ---
	async function generatePDF() {
		if (selectedItemIds.length === 0) return;
		isGeneratingPDF = true;

		try {
			// บันทึกขนาดลง Local Storage สำหรับใช้ครั้งต่อไป
			localStorage.setItem('labelPaperWidth', paperWidth.toString());
			localStorage.setItem('labelPaperHeight', paperHeight.toString());
			localStorage.setItem('labelQrSize', qrSize.toString());
			localStorage.setItem('labelLogoSize', logoSize.toString());
			localStorage.setItem('labelFontSize', fontSize.toString());

			// 0. โหลด Logo เป็น Base64 ถ้ามี Logo Path
			let loadedLogo: { base64: string; ratio: number } | null = null;
			if (companyLogo) {
				try {
					const response = await fetch(companyLogo);
					const blob = await response.blob();
					loadedLogo = await new Promise((resolve, reject) => {
						const reader = new FileReader();
						reader.onload = () => {
							const img = new Image();
							img.onload = () =>
								resolve({ base64: reader.result as string, ratio: img.height / img.width });
							img.onerror = reject;
							img.src = reader.result as string;
						};
						reader.onerror = reject;
						reader.readAsDataURL(blob);
					});
				} catch (e) {
					console.error('Failed to load company logo for PDF', e);
				}
			}

			// 1. เรียก API เพื่อขอ Box ID และ Data ของ Label
			const res = await fetch('/warehouse/items/generate-labels', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					itemIds: selectedItemIds,
					printCount: printCount,
					qtyPerLabel: qtyPerLabel,
					lot: lotNumber
				})
			});

			const result = await res.json();

			if (!result.success) {
				throw new Error(result.message || 'Failed to generate labels data');
			}

			// 2. สร้าง PDF ตามขนาดที่ผู้ใช้กำหนด
			const doc = new jsPDF({
				orientation: paperWidth >= paperHeight ? 'landscape' : 'portrait',
				unit: 'in',
				format: [paperWidth, paperHeight]
			});

			// 3. วนลูปวาด Label ทีละหน้า
			for (let i = 0; i < result.labels.length; i++) {
				const label = result.labels[i];

				if (i > 0) doc.addPage();

				// กรอบนอก (Margin 0.15 นิ้วจากขอบกระดาษ)
				doc.setLineWidth(0.02);
				doc.rect(0.15, 0.15, paperWidth - 0.3, paperHeight - 0.3);

				// ตำแหน่ง Margin เริ่มต้นของฝั่งซ้าย
				const leftX = 0.3;
				let currentY = 0.45; // เริ่มต้นที่ Y = 0.45 นิ้วจากขอบบน

				// --- 1. Item Code (มุมซ้ายบน) ---
				doc.setFont('helvetica', 'bold');
				doc.setFontSize(fontSize + 4);
				doc.text(`${label.item_code}`, leftX, currentY);

				// --- 2. QR Code (มุมขวาบน) ---
				const qrXPos = paperWidth - qrSize - 0.25; // ห่างขอบขวาเล็กน้อย
				const qrYPos = 0.25; // วางชิดมุมขวาบน

				const qrDataUrl = await QRCode.toDataURL(label.qr_text, {
					errorCorrectionLevel: 'M',
					margin: 1,
					width: 250
				});
				doc.addImage(qrDataUrl, 'PNG', qrXPos, qrYPos, qrSize, qrSize);

				// นำส่วนของข้อความใต้ QR Code ออกแล้ว

				// --- 3. Item Name (ต่อจาก Item Code) ---
				currentY += 0.35; // ขยับลงมาจาก Item Code
				doc.setFont('helvetica', 'normal');
				doc.setFontSize(fontSize);

				const maxChars = 35; // เพิ่มจำนวนตัวอักษรเพราะเว้นพื้นที่ให้ฝั่งซ้ายได้มากขึ้น
				const displayName =
					label.item_name.length > maxChars
						? label.item_name.substring(0, maxChars) + '...'
						: label.item_name;

				const textMaxWidth = paperWidth - qrSize - 0.5; // ไม่ให้ทับ QR Code
				const splitName = doc.splitTextToSize(displayName, textMaxWidth > 1 ? textMaxWidth : 1);
				doc.text(splitName, leftX, currentY);

				// คำนวณ Y ถัดไปตามจำนวนบรรทัดที่ Item Name ใช้
				const lineHeightInches = (fontSize * 1.15) / 72; // แปลง Point เป็น นิ้ว คร่าวๆ
				currentY += splitName.length * lineHeightInches + 0.25;

				// --- 4. Box ID, Lot, Qty (ต่อจาก Item Name) ---
				doc.setFontSize(fontSize + 2);
				doc.setFont('helvetica', 'bold');
				doc.text(`Box ID: ${label.box_id}`, leftX, currentY);

				currentY += 0.3;
				doc.setFont('helvetica', 'normal');
				doc.setFontSize(fontSize);
				doc.text(`Lot: ${label.lot}`, leftX, currentY);

				currentY += 0.35;
				doc.setFontSize(fontSize + 2);
				doc.setFont('helvetica', 'bold');
				doc.text(`Qty: ${label.qty}`, leftX, currentY);

				// --- 5. Company Name & Logo (มุมขวาล่าง) ---
				const companyY = paperHeight - 0.25; // ตำแหน่งบรรทัดของชื่อบริษัท
				doc.setFontSize(fontSize - 2);
				doc.setFont('helvetica', 'bolditalic');
				doc.setTextColor(100, 100, 100); // สีเทาเข้ม

				// วาดชื่อบริษัท ชิดขวา
				doc.text(companyName, paperWidth - 0.25, companyY, { align: 'right' });

				// ถ้าระบบมี Logo ให้วาดเหนือชื่อบริษัท ชิดขวา
				if (loadedLogo) {
					const calcLogoHeight = logoSize * loadedLogo.ratio;
					const logoX = paperWidth - 0.25 - logoSize; // คำนวณ X ให้ชิดขวาพอดีกับขอบข้อความ

					// คำนวณ Y: ความสูงบรรทัด (คร่าวๆ pt => inch) และลบด้วยความสูงของรูป
					const textHeightInches = (fontSize - 2) * 0.014;
					const logoY = companyY - textHeightInches - calcLogoHeight - 0.05;

					// ตรวจสอบ format อย่างง่าย (ถ้ามี png ให้ใช้ PNG ไม่งั้น JPEG)
					const imgFormat = loadedLogo.base64.includes('image/png') ? 'PNG' : 'JPEG';

					doc.addImage(loadedLogo.base64, imgFormat, logoX, logoY, logoSize, calcLogoHeight);
				}

				doc.setTextColor(0, 0, 0); // รีเซ็ตสีกลับเป็นสีดำ
			}

			// 4. สั่งเปิด PDF ในแท็บใหม่
			const pdfUrl = doc.output('bloburl');
			window.open(pdfUrl, '_blank');

			showGlobalMessage({ success: true, text: 'PDF Generated Successfully!', type: 'success' });
			showPrintModal = false;
			selectedItemIds = [];
		} catch (error: any) {
			console.error(error);
			showGlobalMessage({ success: false, text: error.message, type: 'error' });
		} finally {
			isGeneratingPDF = false;
		}
	}

	// --- Reactive Effects ---
	$effect.pre(() => {
		if (form?.action === 'saveItem') {
			if (form.success) {
				closeModal();
				showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
			}
			form.action = undefined;
		}

		if (form?.action === 'deleteItem') {
			if (form.success) {
				showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
				invalidateAll();
			} else if (form.message) {
				showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
			}
			itemToDelete = null;
			form.action = undefined;
		}
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

	function getPageUrl(pageNum: number) {
		const params = new URLSearchParams();
		if (searchQuery) params.set('search', searchQuery);
		params.set('limit', data.limit.toString());
		params.set('page', pageNum.toString());
		return `${$page.url.pathname}?${params.toString()}`;
	}
</script>

<svelte:head>
	<title>{$t('Items Master')}</title>
</svelte:head>

<!-- Global Message Toast -->
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

<!-- Header & Action Buttons -->
<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Items Master')}</h1>
		<p class="mt-1 text-sm text-gray-500">{$t('Manage warehouse item list and configurations')}</p>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<!-- ปุ่ม Print Labels -->
		<button
			onclick={() => (showPrintModal = true)}
			disabled={selectedItemIds.length === 0}
			class="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-purple-700 focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				><path d="M6 9V2h12v7" /><path
					d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
				/><rect width="12" height="8" x="6" y="14" /></svg
			>
			{$t('Print Label')}
			{selectedItemIds.length > 0 ? `(${selectedItemIds.length})` : ''}
		</button>

		<form method="POST" action="{$page.url.pathname}/export">
			<input type="hidden" name="search" value={searchQuery} />
			<button
				type="submit"
				class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:outline-none"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
						points="7 10 12 15 17 10"
					/><line x1="12" y1="15" x2="12" y2="3" /></svg
				>
				{$t('Export to Excel')}
			</button>
		</form>
		<button
			onclick={() => openModal('add')}
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg
			>
			{$t('Add New Item')}
		</button>
	</div>
</div>

<!-- Search Bar -->
<div class="mb-4">
	<form method="GET" action={$page.url.pathname} class="relative">
		<input type="hidden" name="page" value="1" />
		<input type="hidden" name="limit" value={data.limit} />
		<input
			type="search"
			name="search"
			bind:value={searchQuery}
			oninput={handleSearchInput}
			placeholder={$t('Search by Item Code or Name...')}
			class="w-full rounded-lg border-gray-300 py-2 pr-4 pl-10 text-sm focus:border-blue-500 focus:ring-blue-500"
		/>
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<svg
				class="h-4 w-4 text-gray-400"
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

<!-- Data Table -->
<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="w-12 px-4 py-3 text-center">
					<input
						type="checkbox"
						class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
						checked={isAllSelected}
						onchange={toggleSelectAll}
					/>
				</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Item Code')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Item Name')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Name (Eng)')}</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Unit')}</th>
				<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('Min')}</th>
				<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('Max')}</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">{$t('Actions')}</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.items.length === 0}
				<tr>
					<td colspan="8" class="py-12 text-center text-gray-500">
						{#if data.searchQuery}{$t('No items found for:')} "{data.searchQuery}"{:else}{$t(
								'No items data found'
							)}{/if}
					</td>
				</tr>
			{:else}
				{#each data.items as item (item.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 text-center">
							<input
								type="checkbox"
								class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
								value={item.id}
								bind:group={selectedItemIds}
							/>
						</td>
						<td class="px-4 py-3 font-mono font-medium text-gray-800">{item.item_code}</td>
						<td class="px-4 py-3 text-gray-700">{item.item_name}</td>
						<td class="px-4 py-3 text-gray-500">{item.item_name_eng || '-'}</td>
						<td class="px-4 py-3 text-center text-gray-600">
							<span class="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
								{item.unit_symbol || item.unit_name || '-'}
							</span>
						</td>
						<td class="px-4 py-3 text-right font-medium text-orange-600"
							>{formatQuantity(item.min_stock)}</td
						>
						<td class="px-4 py-3 text-right font-medium text-green-600"
							>{formatQuantity(item.max_stock)}</td
						>
						<td class="px-4 py-3 text-center whitespace-nowrap">
							<div class="flex items-center justify-center gap-2">
								<button
									onclick={() => openModal('edit', item)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
									title={$t('Edit')}
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
									onclick={() => (itemToDelete = item)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
									title={$t('Delete')}
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

<!-- Pagination & Paging Size -->
{#if data.items.length > 0 || data.searchQuery}
	<div class="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
		<div class="flex items-center gap-4">
			<div class="flex items-center gap-2">
				<span class="text-sm text-gray-700">{$t('Show')}</span>
				<select
					class="rounded-md border-gray-300 py-1 pr-8 pl-3 text-sm focus:border-blue-500 focus:ring-blue-500"
					value={data.limit.toString()}
					onchange={(e) => changeLimit(e.currentTarget.value)}
				>
					<option value="10">10</option>
					<option value="20">20</option>
					<option value="50">50</option>
					<option value="200">200</option>
				</select>
				<span class="text-sm text-gray-700">{$t('entries')}</span>
			</div>
			{#if data.totalPages > 0}
				<p class="hidden text-sm text-gray-700 sm:block">
					{$t('Showing page')} <span class="font-medium">{data.currentPage}</span>
					{$t('of')} <span class="font-medium">{data.totalPages}</span>
				</p>
			{/if}
		</div>
		{#if data.totalPages > 1}
			<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
				<a
					href={data.currentPage > 1 ? getPageUrl(data.currentPage - 1) : '#'}
					class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 {data.currentPage ===
					1
						? 'pointer-events-none opacity-50'
						: ''}"
				>
					<span class="sr-only">{$t('Previous')}</span>
					<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"
						><path
							fill-rule="evenodd"
							d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
							clip-rule="evenodd"
						/></svg
					>
				</a>
				{#each paginationRange as pageNum}
					{#if typeof pageNum === 'string'}
						<span
							class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 ring-inset"
							>...</span
						>
					{:else}
						<a
							href={getPageUrl(pageNum)}
							class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pageNum ===
							data.currentPage
								? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
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
				>
					<span class="sr-only">{$t('Next')}</span>
					<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"
						><path
							fill-rule="evenodd"
							d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
							clip-rule="evenodd"
						/></svg
					>
				</a>
			</nav>
		{/if}
	</div>
{/if}

<!-- ---------------------------------------------------- -->
<!--                   PRINT LABELS MODAL                 -->
<!-- ---------------------------------------------------- -->
{#if showPrintModal}
	<div transition:fade class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="fixed inset-0" onclick={() => (showPrintModal = false)} role="presentation"></div>
		<div class="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
			<h3 class="mb-2 text-lg font-bold text-gray-900">{$t('Print Item Labels')}</h3>
			<p class="mb-6 text-sm text-gray-500">
				สร้าง Label สำหรับสินค้าที่เลือกจำนวน <strong class="text-purple-600"
					>{selectedItemIds.length}</strong
				> รายการ
			</p>

			<div class="space-y-4">
				<div
					class="grid grid-cols-2 gap-4 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:grid-cols-5"
				>
					<div class="col-span-full text-xs font-semibold text-gray-600">
						ตั้งค่าหน้ากระดาษ, QR Code, ตัวอักษร และ Logo
					</div>
					<div>
						<label for="paperWidth" class="mb-1 block text-xs font-medium text-gray-700"
							>กว้าง (นิ้ว)</label
						>
						<input
							type="number"
							id="paperWidth"
							step="0.1"
							min="2"
							bind:value={paperWidth}
							class="w-full rounded-md border-gray-300 text-sm focus:border-purple-500 focus:ring-purple-500"
						/>
					</div>
					<div>
						<label for="paperHeight" class="mb-1 block text-xs font-medium text-gray-700"
							>สูง (นิ้ว)</label
						>
						<input
							type="number"
							id="paperHeight"
							step="0.1"
							min="2"
							bind:value={paperHeight}
							class="w-full rounded-md border-gray-300 text-sm focus:border-purple-500 focus:ring-purple-500"
						/>
					</div>
					<div>
						<label for="qrSize" class="mb-1 block text-xs font-medium text-gray-700"
							>QR (นิ้ว)</label
						>
						<input
							type="number"
							id="qrSize"
							step="0.1"
							min="0.5"
							bind:value={qrSize}
							class="w-full rounded-md border-gray-300 text-sm focus:border-purple-500 focus:ring-purple-500"
						/>
					</div>
					<div>
						<label for="fontSize" class="mb-1 block text-xs font-medium text-gray-700"
							>อักษร (pt)</label
						>
						<input
							type="number"
							id="fontSize"
							step="1"
							min="6"
							bind:value={fontSize}
							class="w-full rounded-md border-gray-300 text-sm focus:border-purple-500 focus:ring-purple-500"
						/>
					</div>
					<div>
						<label for="logoSize" class="mb-1 block text-xs font-medium text-gray-700"
							>Logo (นิ้ว)</label
						>
						<input
							type="number"
							id="logoSize"
							step="0.1"
							min="0.2"
							bind:value={logoSize}
							class="w-full rounded-md border-gray-300 text-sm focus:border-purple-500 focus:ring-purple-500"
						/>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="printCount" class="mb-1 block text-sm font-medium text-gray-700"
							>จำนวน Print/Item</label
						>
						<input
							type="number"
							id="printCount"
							min="1"
							bind:value={printCount}
							class="w-full rounded-md border-gray-300 text-sm focus:border-purple-500 focus:ring-purple-500"
						/>
					</div>
					<div>
						<label for="qtyPerLabel" class="mb-1 block text-sm font-medium text-gray-700"
							>จำนวน (QTY)/Label</label
						>
						<input
							type="number"
							id="qtyPerLabel"
							min="1"
							bind:value={qtyPerLabel}
							class="w-full rounded-md border-gray-300 text-sm focus:border-purple-500 focus:ring-purple-500"
						/>
					</div>
				</div>

				<div>
					<label for="lotNumber" class="mb-1 block text-sm font-medium text-gray-700"
						>Lot (Format: YYYYMMDD)</label
					>
					<input
						type="text"
						id="lotNumber"
						bind:value={lotNumber}
						class="w-full rounded-md border-gray-300 font-mono text-sm uppercase focus:border-purple-500 focus:ring-purple-500"
						placeholder="20260325"
					/>
				</div>

				<div>
					<label for="companyName" class="mb-1 block text-sm font-medium text-gray-700"
						>Company Name (มุมขวาล่าง)</label
					>
					<input
						type="text"
						id="companyName"
						bind:value={companyName}
						class="w-full rounded-md border-gray-300 text-sm uppercase focus:border-purple-500 focus:ring-purple-500"
						placeholder="MY COMPANY CO., LTD."
					/>
				</div>
			</div>

			<div class="mt-8 flex justify-end gap-3">
				<button
					type="button"
					onclick={() => (showPrintModal = false)}
					class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
				>
					{$t('Cancel')}
				</button>
				<button
					type="button"
					onclick={generatePDF}
					disabled={isGeneratingPDF}
					class="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
				>
					{#if isGeneratingPDF}
						<svg
							class="h-4 w-4 animate-spin text-white"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							><circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							></circle><path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							></path></svg
						>
						{$t('Generating PDF...')}
					{:else}
						{$t('Generate PDF')}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Add/Edit Modal (โค้ดเดิม) -->
{#if modalMode && selectedItem}
	<div
		transition:slide
		class="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
	>
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div
			class="relative flex max-h-[90vh] w-full max-w-2xl transform flex-col rounded-xl bg-white shadow-2xl transition-all"
		>
			<div class="flex-shrink-0 border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? $t('Add New Item') : $t('Edit Item')}
				</h2>
			</div>

			<form
				method="POST"
				action="?/saveItem"
				use:enhance={() => {
					isSaving = true;
					return async ({ update }) => {
						await update({ reset: false });
						isSaving = false;
					};
				}}
				class="flex-1 overflow-y-auto p-6"
			>
				{#if modalMode === 'edit'}
					<input type="hidden" name="id" value={selectedItem.id} />
				{/if}

				<div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
					<div>
						<label for="item_code" class="mb-1 block text-sm font-medium"
							>{$t('Item Code')}
							<span class="font-normal text-gray-500">({$t('Leave blank to auto-generate')})</span
							></label
						>
						<input
							type="text"
							name="item_code"
							id="item_code"
							bind:value={selectedItem.item_code}
							class="w-full rounded-md border-gray-300 text-sm uppercase focus:border-blue-500 focus:ring-blue-500"
							placeholder={$t('Auto-generate if blank')}
						/>
					</div>
					<div>
						<label for="unit_id" class="mb-1 block text-sm font-medium">{$t('Unit *')}</label>
						<select
							name="unit_id"
							id="unit_id"
							required
							bind:value={selectedItem.unit_id}
							class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
						>
							<option value={undefined} disabled>{$t('Select Unit')}</option>
							{#each data.units as unit (unit.id)}
								<option value={unit.id}>{unit.name} ({unit.symbol})</option>
							{/each}
						</select>
					</div>
					<div class="sm:col-span-2">
						<label for="item_name" class="mb-1 block text-sm font-medium">{$t('Item Name *')}</label
						>
						<input
							type="text"
							name="item_name"
							id="item_name"
							required
							bind:value={selectedItem.item_name}
							class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
						/>
					</div>
					<div class="sm:col-span-2">
						<label for="item_name_eng" class="mb-1 block text-sm font-medium"
							>{$t('Item Name (Eng)')}</label
						>
						<input
							type="text"
							name="item_name_eng"
							id="item_name_eng"
							bind:value={selectedItem.item_name_eng}
							class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label for="min_stock" class="mb-1 block text-sm font-medium">{$t('Min Level')}</label>
						<input
							type="number"
							step="any"
							name="min_stock"
							id="min_stock"
							bind:value={selectedItem.min_stock}
							class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label for="max_stock" class="mb-1 block text-sm font-medium">{$t('Max Level')}</label>
						<input
							type="number"
							step="any"
							name="max_stock"
							id="max_stock"
							bind:value={selectedItem.max_stock}
							class="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
						/>
					</div>
				</div>

				{#if form?.message && !form.success && form.action === 'saveItem'}
					<div class="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
						<p><strong>{$t('Error:')}</strong> {form.message}</p>
					</div>
				{/if}

				<div class="mt-8 flex justify-end gap-3 border-t pt-4">
					<button
						type="button"
						onclick={closeModal}
						class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
						>{$t('Cancel')}</button
					>
					<button
						type="submit"
						disabled={isSaving}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-400"
					>
						{isSaving ? $t('Saving...') : $t('Save Item')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal (โค้ดเดิม) -->
{#if itemToDelete}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">{$t('Confirm Delete')}</h3>
			<p class="mt-2 text-sm text-gray-600">
				{$t('Are you sure you want to delete item:')} <br />
				<strong class="font-mono text-sm text-gray-800">{itemToDelete.item_code}</strong> - {itemToDelete.item_name}?
				<br /><br />
				<span class="text-red-600">{$t('This action cannot be undone.')}</span>
			</p>

			{#if form?.message && !form.success && form.action === 'deleteItem'}
				<p class="mt-3 text-sm text-red-600"><strong>{$t('Error:')}</strong> {form.message}</p>
			{/if}

			<form method="POST" action="?/deleteItem" use:enhance class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="id" value={itemToDelete.id} />
				<button
					type="button"
					onclick={() => (itemToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
					>{$t('Cancel')}</button
				>
				<button
					type="submit"
					class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
					>{$t('Delete')}</button
				>
			</form>
		</div>
	</div>
{/if}
