<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    // --- NEW: Import the image compressor utility ---
    import { compressImage } from '$lib/utils/image-compressor';

	// --- Component Types ---
	interface Activity {
		id: number; name: string; start_date: string; end_date: string | null;
		status: 'Pending' | 'In Progress' | 'Completed';
		full_name: string; location_name: string | null; category_name: string | null;
	}
	interface Location { id: number; name: string; }
	interface Category { id: number; name: string; }
    interface User { id: number; full_name: string; }

	interface ScanDetailData {
		activity: Omit<Activity, 'full_name' | 'end_date' | 'status'> & { start_date: string };
		expected: number; scanned: number; missing: number;
		scanList: { asset_tag: string; scanned_at: string; full_name: string;
			found_status: 'Found' | 'Unrecorded' | 'Duplicate'; asset_name: string | null;
		}[];
		missingList: { asset_tag: string; name: string }[];
	}

	interface ScannedAsset {
        id: number; name: string; image_url: string | null;
        category_name: string | null; location_name: string | null; assigned_user_name: string | null;
        category_id: number | null; location_id: number | null; assigned_to_user_id: number | null;
    }

	// --- PROPS ---
	const { data, form } = $props<{ data: PageData; form: ActionData; }>();

	// --- State Management ---
	let isCreateModalOpen = $state(false);
	let isScanModalOpen = $state(false);
	let isScanDetailModalOpen = $state(false);
	let isLoading = $state(false);
	let newActivity = $state({ name: '', location_id: undefined as number | undefined });
	let activeActivityId: number | null = $state(null);
	let assetTagInput = $state<HTMLInputElement | undefined>();
	let currentScanTag = $state('');
    let scanMessage: { success: boolean, text: string, type: 'success' | 'warning' | 'error' } | null = $state(null);
    let scanTimeout: NodeJS.Timeout;
	let scanDetailData: ScanDetailData | null = $state(null);
    let detailLoadError: string | null = $state(null);
    let activeTab = $state<'scans' | 'missing'>('scans');
	let activityToSettle: Activity | null = $state(null); // For Settle Modal
	let isSettling = $state(false); // For Settle Modal

	// --- State for Modals ---
	let scannedAsset: ScannedAsset | null = $state(null);
	let isUpdatingAsset = $state(false);
	let updateAssetMessage: { success: boolean, text: string, type: 'success' | 'error' } | null = $state(null);
	let unrecordedAssetTag = $state<string | null>(null);
	let isAddingUnrecorded = $state(false);
    let addUnrecordedMessage: { success: boolean, text: string, type: 'success' | 'error' } | null = $state(null);
    
    // --- NEW: State for image compression ---
    let compressedImageFile = $state<File | null>(null);
    let isCompressing = $state(false);
    let compressionError = $state<string | null>(null);

    // --- Camera scanner states ---
    let isCameraScanning = $state(false);
    let html5QrCode: any;
    let scanFormElement = $state<HTMLFormElement | null>(null);

	// --- Lifecycle/Reactivity ---
    onMount(() => {
        // Scanner instance is now created on-demand in startCameraScanner
    });

    onDestroy(() => {
        stopCameraScanner();
    });

	$effect.pre(() => {
        updateAssetMessage = null; 
        addUnrecordedMessage = null;

        if (form?.success && form?.activityId) {
            isCreateModalOpen = false;
            openScanModal(form.activityId);
        }

        if (form?.assetTag) {
            let type: 'success' | 'warning' | 'error' = 'error';
            let text = form.message as string;

            if (form.success) {
                if (form.foundStatus === 'Found') {
					type = 'success';
					if (form.scannedAsset) {
						scannedAsset = form.scannedAsset as ScannedAsset;
                        isScanModalOpen = false;
                        setTimeout(() => { openAssetDetailModal(scannedAsset); }, 150);
					}
				} else if (form.foundStatus === 'Unrecorded') {
                    type = 'warning';
                    text = `แท็กไม่พบในระบบ: ${form.assetTag}. กรุณาเพิ่มรายละเอียด`;
					unrecordedAssetTag = form.assetTag;
                    // --- NEW: Reset compression state when opening add unrecorded modal ---
                    compressedImageFile = null;
                    compressionError = null;
                    isCompressing = false;
                    isScanModalOpen = false;
                }
            } else {
                if (form.isDuplicate) {
                    type = 'error';
                    text = `สแกนซ้ำ: ${form.assetTag} ถูกนับไปแล้ว`;
                } else {
                    text = (form.message as string) || 'เกิดข้อผิดพลาด';
                }
            }
            
            scanMessage = { success: form.success, text: text, type: type };
            clearTimeout(scanTimeout);
            scanTimeout = setTimeout(() => { scanMessage = null; }, 5000);
            currentScanTag = '';
        }

		if (form?.detailsUpdated) {
			scannedAsset = null;
            updateAssetMessage = { success: true, text: form.message as string, type: 'success' };
            setTimeout(() => { updateAssetMessage = null; }, 4000);
		} else if (form?.updateError) {
            updateAssetMessage = { success: false, text: form.message as string, type: 'error' };
        }

		if (form?.unrecordedAdded) {
			unrecordedAssetTag = null;
            addUnrecordedMessage = { success: true, text: form.message as string, type: 'success' };
            setTimeout(() => { addUnrecordedMessage = null; }, 4000);
            scanMessage = null;
		} else if (form?.unrecordedAddError) {
            addUnrecordedMessage = { success: false, text: form.message as string, type: 'error' };
        }
		
		if (form?.settleSuccess) {
			activityToSettle = null;
		}
    });
    
    $effect(() => {
        if (isScanModalOpen && assetTagInput) {
             assetTagInput.focus();
        }
    });
    
    // --- Helper Functions ---
    function getActivityById(id: number): Activity | undefined {
        return data.activities.find(a => a.id === id);
    }
    
    // --- NEW: Function to handle file selection and compression ---
    async function onFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const file = input.files[0];
            
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                compressionError = 'กรุณาเลือกไฟล์รูปภาพ (JPG, PNG, WEBP) เท่านั้น';
                compressedImageFile = null;
                return;
            }

            isCompressing = true;
            compressionError = null;
            try {
                const compressed = await compressImage(file);
                compressedImageFile = compressed;
            } catch (error) {
                console.error('Image compression failed:', error);
                compressionError = 'เกิดข้อผิดพลาดในการบีบอัดรูปภาพ';
                compressedImageFile = null;
            } finally {
                isCompressing = false;
            }
        }
    }
    
    function openAssetDetailModal(asset: ScannedAsset) {
        scannedAsset = asset;
        updateAssetMessage = null; 
        // --- NEW: Reset compression state ---
        compressedImageFile = null;
        compressionError = null;
        isCompressing = false;
    }

    async function openScanDetail(activityId: number) {
        detailLoadError = null;
        scanDetailData = null;
        isScanDetailModalOpen = true;
        const formData = new FormData();
        formData.append('activity_id', activityId.toString());
        
        try {
            const response = await fetch('?/loadScans', { method: 'POST', body: formData });
            const result = await response.json();

			if (!response.ok) {
                detailLoadError = result?.message || `เกิดข้อผิดพลาด: ${response.statusText}`;
                return;
			}
			
            if (result && typeof result.expected === 'number') {
                scanDetailData = result as ScanDetailData;
            } else {
                 detailLoadError = 'รูปแบบข้อมูลที่ได้รับไม่ถูกต้อง';
            }

        } catch (error) {
            console.error("Fetch error:", error);
            detailLoadError = 'เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์';
        }
    }

	function openScanModal(activityId: number) {
		activeActivityId = activityId;
		isScanModalOpen = true;
        scanMessage = null;
	}

	function closeScanModal() {
        stopCameraScanner();
		isScanModalOpen = false;
		activeActivityId = null;
        scanMessage = null;
        html5QrCode = null;
	}
    
    function closeScanDetailModal() {
        isScanDetailModalOpen = false;
        scanDetailData = null;
        detailLoadError = null;
    }
    
    function startCameraScanner() {
        if (!html5QrCode) {
            if (typeof Html5Qrcode !== 'undefined') {
                try {
                    html5QrCode = new Html5Qrcode("qr-reader", { verbose: true });
                } catch (err) {
                    console.error("Error initializing Html5Qrcode:", err);
                    scanMessage = { success: false, text: "ไม่สามารถเริ่มต้นสแกนเนอร์ได้", type: 'error' };
                    return;
                }
            } else {
                scanMessage = { success: false, text: "Library สำหรับสแกนยังไม่พร้อมใช้งาน", type: 'error' };
                return;
            }
        }

        isCameraScanning = true;
        const config = { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true
        };
        
        const onScanSuccess = (decodedText: string, decodedResult: any) => {
            if (navigator.vibrate) { navigator.vibrate(100); }
            currentScanTag = decodedText;
            stopCameraScanner();
            setTimeout(() => { if (scanFormElement) { scanFormElement.requestSubmit(); } }, 100);
        };

        const onScanFailure = (error: any) => { /* Ignore */ };
        
        html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure)
            .catch((err: any) => {
                console.error("Unable to start scanning.", err);
                scanMessage = { success: false, text: `ไม่สามารถเปิดกล้องได้: ${err}`, type: 'error' };
                isCameraScanning = false;
            });
    }

    function stopCameraScanner() {
        if (html5QrCode && html5QrCode.isScanning) {
            try {
                html5QrCode.stop().then(() => { isCameraScanning = false; })
                .catch((err: any) => { console.error("Error stopping scanner.", err); isCameraScanning = false; });
            } catch (e) {
                console.warn("Scanner failed to stop.", e);
                isCameraScanning = false;
            }
        } else {
            isCameraScanning = false;
        }
    }

    // --- UI Helpers ---
	function getStatusClass(status: Activity['status']) {
        return {'In Progress':'bg-yellow-100 text-yellow-800','Completed':'bg-green-100 text-green-800','Pending':'bg-blue-100 text-blue-800'}[status] || 'bg-gray-100 text-gray-800';
    }
    function getFoundStatusClass(status: ScanDetailData['scanList'][0]['found_status']) {
		return {'Found':'bg-green-100 text-green-800','Unrecorded':'bg-orange-100 text-orange-800','Duplicate':'bg-red-100 text-red-800'}[status] || 'bg-gray-100 text-gray-800';
    }
    function formatDateTime(isoString: string) {
        if (!isoString) return 'N/A';
        return new Date(isoString).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    }
</script>

<svelte:head>
	<title>การนับสินทรัพย์ (Stock Count)</title>
    <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
</svelte:head>

<!-- Global Notifications -->
{#if updateAssetMessage || addUnrecordedMessage}
    {@const message = updateAssetMessage || addUnrecordedMessage}
    <div 
        transition:fade 
        class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg shadow-xl p-4 font-semibold text-sm transform transition-transform"
        class:bg-green-100={message?.type === 'success'}
        class:text-green-800={message?.type === 'success'}
        class:bg-red-100={message?.type === 'error'}
        class:text-red-800={message?.type === 'error'}
    >
        <div class="flex items-center gap-2">
            {#if message?.type === 'success'}
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            {:else}
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            {/if}
            <p>{message?.text}</p>
        </div>
    </div>
{/if}

<!-- Main Header -->
<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">การนับสินทรัพย์ (Stock Count)</h1>
		<p class="mt-1 text-sm text-gray-500">จัดการกิจกรรมการนับสต็อกและบันทึกผลการสแกน Asset Tag</p>
	</div>
    <div class="flex items-center gap-2">
        <a href="/counting/report" class="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
            ดูรายงาน
        </a>
        <button onclick={() => (isCreateModalOpen = true)} class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
		    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
		    สร้างกิจกรรมการนับใหม่
	    </button>
    </div>
</div>

<!-- Activities Table -->
<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">กิจกรรม</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">สถานที่ (Filter)</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">วันที่เริ่ม</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">สถานะ</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">ดำเนินการ</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.activities.length === 0}
				<tr><td colspan="7" class="py-12 text-center text-gray-500">ไม่พบกิจกรรมการนับ</td></tr>
			{:else}
				{#each data.activities as activity (activity.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 font-medium text-gray-900">{activity.name}</td>
						<td class="px-4 py-3 text-gray-600">{activity.location_name ?? 'ทั้งหมด'}</td>
						<td class="px-4 py-3 text-gray-600">{new Date(activity.start_date).toLocaleDateString('th-TH')}</td>
						<td class="px-4 py-3">
							<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusClass(activity.status)}">
								{activity.status === 'In Progress' ? 'กำลังดำเนินการ' : activity.status === 'Completed' ? 'เสร็จสมบูรณ์' : 'รอดำเนินการ'}
							</span>
						</td>
						<td class="px-4 py-3">
                            <div class="flex items-center gap-2">
                                {#if activity.status === 'In Progress'}
                                    <button onclick={() => openScanModal(activity.id)} class="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-green-600" title="เริ่มสแกน">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /><path d="M10.9 11.2h.1" /><path d="M15 11.2h.1" /></svg>
                                    </button>
                                    <button onclick={() => (activityToSettle = activity)} class="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-teal-600" title="ปิดกิจกรรม (Settle)">
                                         <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                                    </button>
                                {/if}
                            </div>
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

<!-- MODALS -->

<!-- Create Activity Modal -->
{#if isCreateModalOpen}
	<div transition:slide={{ duration: 150 }} class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16" role="dialog">
		<div class="fixed inset-0" role="button" tabindex="0" aria-label="Close modal" onclick={() => (isCreateModalOpen = false)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') isCreateModalOpen = false; }}></div>
		<div class="relative w-full max-w-lg transform rounded-xl bg-white shadow-2xl transition-all">
			<div class="border-b border-gray-200 px-6 py-4"><h2 class="text-lg font-bold text-gray-900">สร้างกิจกรรมการนับสินทรัพย์ใหม่</h2></div>
			<form method="POST" action="?/createActivity" use:enhance={() => { isLoading = true; return async ({ update }) => { await update(); isLoading = false; }; }}>
				<div class="space-y-6 p-6">
					<div><label for="name" class="mb-1 block text-sm font-medium text-gray-700">ชื่อกิจกรรมการนับ <span class="text-red-500">*</span></label><input type="text" name="name" id="name" required bind:value={newActivity.name} class="w-full rounded-md border-gray-300" placeholder="เช่น นับประจำปี 2025 แผนกบัญชี"/></div>
					<p class="text-sm text-gray-500 border-b pb-2">กำหนดขอบเขตสินทรัพย์ที่จะนับ (Filter)</p>
					<div><label for="location_id" class="mb-1 block text-sm font-medium text-gray-700">สถานที่</label><select name="location_id" id="location_id" bind:value={newActivity.location_id} class="w-full rounded-md border-gray-300"><option value={undefined}>-- ทั้งหมด --</option>{#each data.locations as location}<option value={location.id}>{location.name}</option>{/each}</select></div>
					{#if form?.message && !form?.success && !form?.assetTag}<div class="mt-4 rounded-md bg-red-50 p-4"><p class="text-sm text-red-600">{form.message}</p></div>{/if}
				</div>
				<div class="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 p-4">
					<button type="button" onclick={() => (isCreateModalOpen = false)} class="rounded-md border bg-white px-4 py-2 text-sm font-medium">ยกเลิก</button>
					<button type="submit" disabled={isLoading} class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-blue-400">{#if isLoading} กำลังสร้าง... {:else} เริ่มกิจกรรม {/if}</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Scan Asset Modal -->
{#if isScanModalOpen && activeActivityId !== null}
	{@const activeActivity = getActivityById(activeActivityId)}
	<div transition:slide={{ duration: 150 }} class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16" role="dialog">
		<div class="fixed inset-0" role="button" tabindex="0" aria-label="Close modal" onclick={closeScanModal} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeScanModal(); }}></div>
		<div class="relative w-full max-w-2xl transform rounded-xl bg-white shadow-2xl transition-all">
			<div class="border-b border-gray-200 px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">กำลังนับ: {activeActivity?.name ?? ''}</h2>
				<p class="text-sm text-gray-500 mt-1"><span class="font-semibold">Filter:</span> สถานที่: {activeActivity?.location_name ?? 'ทั้งหมด'}, หมวดหมู่: {activeActivity?.category_name ?? 'ทั้งหมด'}</p>
			</div>
			<div class="space-y-6 p-6">
                <form method="POST" action="?/scanAsset" bind:this={scanFormElement} use:enhance={() => { isLoading = true; return async ({ update }) => { await update(); isLoading = false; assetTagInput?.focus(); }; }}>
				    <input type="hidden" name="activity_id" value={activeActivityId} />
				    <div>
                        <label for="asset_tag" class="mb-1 block text-sm font-medium text-gray-700">สแกน Asset Tag (หรือกรอก)</label>
                        <input type="text" name="asset_tag" id="asset_tag" required bind:value={currentScanTag} bind:this={assetTagInput} class="w-full rounded-md border-gray-300 text-lg font-mono tracking-widest uppercase" placeholder="สแกน Asset Tag..." autocomplete="off" />
						<div class="mt-4">
                            <button type="button" onclick={isCameraScanning ? stopCameraScanner : startCameraScanner} class="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all {isCameraScanning ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}">
                                {#if isCameraScanning}
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v8M8 12h8"/></svg>
                                    <span>หยุด</span>
                                {:else}
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                                    <span>ใช้กล้อง</span>
                                {/if}
                            </button>
                        </div>
                    </div>
                </form>
                <div id="qr-reader" class:hidden={!isCameraScanning} class="w-full aspect-video bg-gray-900 rounded-md overflow-hidden border-4 border-gray-300"></div>
                {#if scanMessage}<div transition:fade class="rounded-lg p-4 font-semibold {scanMessage.type === 'success' ? 'bg-green-100 text-green-700' : scanMessage.type === 'warning' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}"><p>{scanMessage.text}</p></div>{/if}
            </div>
			<div class="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 p-4">
                <button type="button" onclick={() => openScanDetail(activeActivityId!)} class="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">ดูผลลัพธ์</button>
                <button type="button" onclick={closeScanModal} class="rounded-md border bg-white px-4 py-2 text-sm font-medium">ปิด/กลับไป</button>
            </div>
		</div>
	</div>
{/if}

<!-- Scanned Asset Detail & Update Modal -->
{#if scannedAsset}
	<div transition:fade={{ duration: 150 }} class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog">
		<div class="fixed inset-0" role="button" tabindex="0" aria-label="Close modal" onclick={() => (scannedAsset = null)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') scannedAsset = null; }}></div>
		<div class="relative w-full max-w-lg transform rounded-xl bg-white shadow-2xl transition-all" transition:slide={{duration: 200}}>
			<div class="border-b border-gray-200 px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">{scannedAsset.name}</h2>
				<p class="font-mono text-sm text-gray-500">{form?.assetTag}</p>
			</div>
			<form method="POST" action="?/updateScannedAsset" enctype="multipart/form-data" use:enhance={({ formData }) => { isUpdatingAsset = true; if (compressedImageFile) { formData.set('image', compressedImageFile); } return async ({ update }) => { await update(); isUpdatingAsset = false; }; }}>
				<div class="space-y-4 p-6 max-h-[60vh] overflow-y-auto">
					<input type="hidden" name="asset_id" value={scannedAsset.id}>
                    <div class="flex aspect-video items-center justify-center overflow-hidden rounded-lg border bg-gray-100">
						{#if scannedAsset.image_url}<img src={scannedAsset.image_url} alt={scannedAsset.name} class="h-full w-full object-contain" />{:else}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-12 w-12 text-gray-400"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>{/if}
					</div>
                    <div><label for="category_id_modal" class="mb-1 block text-sm font-medium text-gray-700">หมวดหมู่</label><select name="category_id" id="category_id_modal" bind:value={scannedAsset.category_id} class="w-full rounded-md border-gray-300"><option value={null}>-- ไม่ระบุ --</option>{#each data.categories as category (category.id)}<option value={category.id}>{category.name}</option>{/each}</select></div>
                    <div><label for="location_id_modal" class="mb-1 block text-sm font-medium text-gray-700">สถานที่</label><select name="location_id" id="location_id_modal" bind:value={scannedAsset.location_id} class="w-full rounded-md border-gray-300"><option value={null}>-- ไม่ระบุ --</option>{#each data.locations as location (location.id)}<option value={location.id}>{location.name}</option>{/each}</select></div>
                    <div><label for="assigned_to_user_id_modal" class="mb-1 block text-sm font-medium text-gray-700">ผู้รับผิดชอบ</label><select name="assigned_to_user_id" id="assigned_to_user_id_modal" bind:value={scannedAsset.assigned_to_user_id} class="w-full rounded-md border-gray-300"><option value={null}>-- ไม่ได้กำหนด --</option>{#each data.users as user (user.id)}<option value={user.id}>{user.full_name}</option>{/each}</select></div>
                    <div>
                        <label for="image_upload" class="mb-1 block text-sm font-medium text-gray-700">อัปโหลดรูปภาพใหม่</label>
                        <input type="file" name="image" id="image_upload" accept="image/png, image/jpeg, image/webp" onchange={onFileSelected} class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100" />
                        {#if isCompressing}
                            <p class="mt-2 text-sm text-blue-600">กำลังบีบอัดรูปภาพ...</p>
                        {/if}
                        {#if compressionError}
                            <p class="mt-2 text-sm text-red-600">{compressionError}</p>
                        {/if}
                        {#if compressedImageFile && !isCompressing}
                             <p class="mt-2 text-sm text-green-600">รูปภาพพร้อมอัปโหลดแล้ว</p>
                        {/if}
                    </div>
                    {#if form?.message && form?.updateError}<div class="rounded-md bg-red-50 p-3 text-sm text-red-600"><p>Error: {form.message}</p></div>{/if}
				</div>
				<div class="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 p-4">
					<button type="button" onclick={() => (scannedAsset = null)} class="rounded-md border bg-white px-4 py-2 text-sm font-medium">ข้าม</button>
					<button type="submit" disabled={isUpdatingAsset || isCompressing} class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-blue-400">
						{#if isUpdatingAsset}กำลังบันทึก...{:else if isCompressing}กำลังบีบอัด...{:else}ยืนยันและอัปเดต{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Scan Detail Modal -->
{#if isScanDetailModalOpen}
	<div transition:slide class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16">
		<div class="fixed inset-0" role="button" tabindex="0" aria-label="Close modal" onclick={closeScanDetailModal} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeScanDetailModal(); }}></div>
		<div class="relative w-full max-w-4xl transform flex-col rounded-xl bg-white shadow-2xl transition-all max-h-[90vh] overflow-hidden">
			<div class="flex-shrink-0 border-b border-gray-200 px-6 py-4"><h2 class="text-xl font-bold text-gray-900">รายละเอียดผลการนับ</h2><p class="text-sm text-gray-500 mt-1">{#if scanDetailData}กิจกรรม: <span class="font-semibold">{scanDetailData.activity.name}</span> | เริ่มเมื่อ: {scanDetailData.activity.start_date}{:else}กำลังโหลด...{/if}</p></div>
			<div class="flex-1 overflow-y-auto p-6">
                {#if detailLoadError}<div class="rounded-lg bg-red-50 p-4 text-center text-red-600"><p>Error: {detailLoadError}</p></div>{:else if !scanDetailData}<div class="flex items-center justify-center p-12 text-gray-500"><svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>กำลังดึงข้อมูล...</div>
                {:else}
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div class="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200"><p class="text-sm font-medium text-blue-700">สินทรัพย์ที่คาดหวัง</p><p class="text-2xl font-bold text-blue-900">{scanDetailData.expected}</p></div>
                        <div class="bg-green-50 p-4 rounded-lg shadow-sm border border-green-200"><p class="text-sm font-medium text-green-700">สินทรัพย์ที่สแกนพบ</p><p class="text-2xl font-bold text-green-900">{scanDetailData.scanned}</p></div>
                        <div class="bg-red-50 p-4 rounded-lg shadow-sm border border-red-200"><p class="text-sm font-medium text-red-700">สินทรัพย์ที่ยังขาด</p><p class="text-2xl font-bold text-red-900">{scanDetailData.missing}</p></div>
                    </div>
                    <div class="border-b border-gray-200 mb-4"><nav class="-mb-px flex space-x-8"><button onclick={() => activeTab = 'scans'} class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'scans' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">ผลการสแกนทั้งหมด ({scanDetailData.scanList.length})</button><button onclick={() => activeTab = 'missing'} class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'missing' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">รายการสินทรัพย์ที่ขาด ({scanDetailData.missingList.length})</button></nav></div>
                    <div class="max-h-96 overflow-y-auto">
                        {#if activeTab === 'scans'}
                            <table class="min-w-full divide-y divide-gray-200 text-sm"><thead class="bg-gray-50 sticky top-0"><tr><th class="px-4 py-3 text-left font-semibold text-gray-600">Asset Tag</th><th class="px-4 py-3 text-left font-semibold text-gray-600">ชื่อสินทรัพย์ในระบบ</th><th class="px-4 py-3 text-left font-semibold text-gray-600">สถานะ</th><th class="px-4 py-3 text-left font-semibold text-gray-600">สแกนโดย</th><th class="px-4 py-3 text-left font-semibold text-gray-600">เวลาสแกน</th></tr></thead><tbody class="divide-y divide-gray-200">{#each scanDetailData.scanList as scan}<tr class="hover:bg-gray-50"><td class="px-4 py-3 font-mono text-xs text-gray-900">{scan.asset_tag}</td><td class="px-4 py-3 text-gray-700">{scan.asset_name ?? 'N/A'}</td><td class="px-4 py-3"><span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getFoundStatusClass(scan.found_status)}">{scan.found_status === 'Found' ? 'พบ/นับสำเร็จ' : scan.found_status === 'Unrecorded' ? 'เกิน (ไม่อยู่ในระบบ)' : 'สแกนซ้ำ'}</span></td><td class="px-4 py-3 text-gray-600">{scan.full_name}</td><td class="px-4 py-3 text-gray-600">{formatDateTime(scan.scanned_at)}</td></tr>{/each}</tbody></table>
                        {:else}
                             <table class="min-w-full divide-y divide-gray-200 text-sm"><thead class="bg-gray-50 sticky top-0"><tr><th class="px-4 py-3 text-left font-semibold text-gray-600">Asset Tag</th><th class="px-4 py-3 text-left font-semibold text-gray-600">ชื่อสินทรัพย์</th></tr></thead><tbody class="divide-y divide-gray-200">{#each scanDetailData.missingList as asset}<tr class="bg-red-50 hover:bg-red-100"><td class="px-4 py-3 font-mono text-xs text-red-900">{asset.asset_tag}</td><td class="px-4 py-3 text-red-700">{asset.name}</td></tr>{/each}</tbody></table>
                            {#if scanDetailData.missingList.length === 0}<div class="p-4 text-center text-gray-500">ไม่พบสินทรัพย์ที่ขาดในขอบเขตการนับนี้</div>{/if}
                        {/if}
                    </div>
                {/if}
			</div>
			<div class="flex flex-shrink-0 justify-end gap-3 border-t border-gray-200 bg-gray-50 p-4"><button type="button" onclick={closeScanDetailModal} class="rounded-md border bg-white px-4 py-2 text-sm font-medium">ปิด</button></div>
		</div>
	</div>
{/if}

<!-- Add Unrecorded Asset Modal -->
{#if unrecordedAssetTag}
	<div transition:fade={{ duration: 150 }} class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog">
		<div class="fixed inset-0" role="button" tabindex="0" aria-label="Close modal" onclick={() => (unrecordedAssetTag = null)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') unrecordedAssetTag = null; }}></div>
		<div class="relative w-full max-w-2xl transform rounded-xl bg-white shadow-2xl transition-all" transition:slide={{duration: 200}}>
			<div class="border-b border-gray-200 px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">เพิ่มสินทรัพย์ใหม่ (สินทรัพย์เกิน)</h2>
				<p class="font-mono text-sm text-gray-500">{unrecordedAssetTag}</p>
			</div>
			<form method="POST" action="?/addUnrecordedAsset" enctype="multipart/form-data" use:enhance={({ formData }) => { isAddingUnrecorded = true; if (compressedImageFile) { formData.set('image', compressedImageFile); } return async ({ update }) => { await update(); isAddingUnrecorded = false; }; }}>
				<div class="space-y-4 p-6 max-h-[70vh] overflow-y-auto">
					<input type="hidden" name="activity_id" value={activeActivityId}>
					<input type="hidden" name="asset_tag" value={unrecordedAssetTag}>

					<div><label for="name_unrecorded" class="mb-1 block text-sm font-medium text-gray-700">ชื่อสินทรัพย์ <span class="text-red-500">*</span></label><input type="text" name="name" id="name_unrecorded" required class="w-full rounded-md border-gray-300"/></div>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div><label for="purchase_date_unrecorded" class="mb-1 block text-sm font-medium text-gray-700">วันที่ซื้อ <span class="text-red-500">*</span></label><input type="date" name="purchase_date" id="purchase_date_unrecorded" required class="w-full rounded-md border-gray-300"/></div>
						<div><label for="purchase_cost_unrecorded" class="mb-1 block text-sm font-medium text-gray-700">มูลค่า (บาท) <span class="text-red-500">*</span></label><input type="number" name="purchase_cost" id="purchase_cost_unrecorded" step="0.01" required class="w-full rounded-md border-gray-300"/></div>
					</div>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div><label for="category_id_unrecorded" class="mb-1 block text-sm font-medium text-gray-700">หมวดหมู่ <span class="text-red-500">*</span></label><select name="category_id" id="category_id_unrecorded" required class="w-full rounded-md border-gray-300"><option disabled selected value="">เลือกหมวดหมู่</option>{#each data.categories as category (category.id)}<option value={category.id}>{category.name}</option>{/each}</select></div>
						<div><label for="location_id_unrecorded" class="mb-1 block text-sm font-medium text-gray-700">สถานที่</label><select name="location_id" id="location_id_unrecorded" class="w-full rounded-md border-gray-300"><option value={null}>-- ไม่ระบุ --</option>{#each data.locations as location (location.id)}<option value={location.id}>{location.name}</option>{/each}</select></div>
					</div>
					<div><label for="assigned_to_user_id_unrecorded" class="mb-1 block text-sm font-medium text-gray-700">ผู้รับผิดชอบ</label><select name="assigned_to_user_id" id="assigned_to_user_id_unrecorded" class="w-full rounded-md border-gray-300"><option value={null}>-- ไม่ได้กำหนด --</option>{#each data.users as user (user.id)}<option value={user.id}>{user.full_name}</option>{/each}</select></div>
                    <div>
                        <label for="image_upload_unrecorded" class="mb-1 block text-sm font-medium text-gray-700">รูปภาพ</label>
                        <input type="file" name="image" id="image_upload_unrecorded" accept="image/png, image/jpeg, image/webp" onchange={onFileSelected} class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100" />
                        {#if isCompressing}
                            <p class="mt-2 text-sm text-blue-600">กำลังบีบอัดรูปภาพ...</p>
                        {/if}
                        {#if compressionError}
                            <p class="mt-2 text-sm text-red-600">{compressionError}</p>
                        {/if}
                        {#if compressedImageFile && !isCompressing}
                             <p class="mt-2 text-sm text-green-600">รูปภาพพร้อมอัปโหลดแล้ว</p>
                        {/if}
                    </div>
					<div><label for="notes_unrecorded" class="mb-1 block text-sm font-medium text-gray-700">บันทึก/หมายเหตุ</label><textarea name="notes" id="notes_unrecorded" rows="2" class="w-full rounded-md border-gray-300"></textarea></div>

                    {#if form?.message && form?.unrecordedAddError}<div class="rounded-md bg-red-50 p-3 text-sm text-red-600"><p>Error: {form.message}</p></div>{/if}
				</div>
				<div class="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 p-4">
					<button type="button" onclick={() => (unrecordedAssetTag = null)} class="rounded-md border bg-white px-4 py-2 text-sm font-medium">ยกเลิก</button>
					<button type="submit" disabled={isAddingUnrecorded || isCompressing} class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-blue-400">
						{#if isAddingUnrecorded}กำลังบันทึก...{:else if isCompressing}กำลังบีบอัด...{:else}บันทึกสินทรัพย์{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Settle Activity Confirmation Modal -->
{#if activityToSettle}
	<div transition:fade class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="alertdialog">
		<div class="w-full max-w-md rounded-xl bg-white shadow-2xl" transition:slide>
			<div class="p-6">
				<div class="text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto h-12 w-12 text-teal-500"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
					<h3 class="mt-4 text-xl font-bold text-gray-900">ยืนยันการปิดกิจกรรม</h3>
					<p class="mt-2 text-sm text-gray-600">
						คุณต้องการปิดกิจกรรมการนับ "<strong>{activityToSettle.name}</strong>" ใช่หรือไม่?
                        <br>
                        <span class="font-semibold text-red-600">สินทรัพย์ที่นับไม่พบจะถูกปรับสถานะเป็น "Disposed" และไม่สามารถแก้ไขได้อีก</span>
					</p>
				</div>
			</div>
            <form
				method="POST"
				action="?/settleActivity"
				use:enhance={() => {
					isSettling = true;
					return async ({ update }) => {
						await update();
						isSettling = false;
                        activityToSettle = null;
					};
				}}
				class="flex justify-end gap-3 rounded-b-xl bg-gray-50 p-4"
			>
				<input type="hidden" name="activity_id" value={activityToSettle.id} />
				<button type="button" onclick={() => (activityToSettle = null)} class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"> ยกเลิก </button>
				<button type="submit" disabled={isSettling} class="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700 disabled:bg-teal-400">
                    {#if isSettling} กำลังประมวลผล... {:else} ยืนยันและปิดกิจกรรม {/if}
                </button>
			</form>
		</div>
	</div>
{/if}

<style>
.max-h-96 { max-height: 24rem; }
#qr-reader {
    position: relative;
}
:global(#qr-reader video) {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
</style>