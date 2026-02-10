<script lang="ts">
	import { enhance } from '$app/forms';
	import { fade, fly, slide } from 'svelte/transition';

	let { data, form } = $props(); // รับ data จาก server
	let isSubmitting = $state(false);
	let previewUrl = $state<string | null>(null);

	// --- State สำหรับสถานที่และ GPS ---
	let locationText = $state('');
	let lat = $state<number | null>(null);
	let lng = $state<number | null>(null);
	let locationStatus = $state<'idle' | 'loading' | 'success' | 'error'>('idle');
	let locationError = $state('');

	// --- State สำหรับค้นหา Asset ---
	let assetSearchTerm = $state('');
	let isAssetDropdownOpen = $state(false);
	let selectedAsset = $state<any>(null);
	let manualAssetName = $state(''); // กรณีไม่เลือก Asset จาก list

	// Filter Assets ตามคำค้นหา (Asset Tag หรือ ชื่อ)
	let filteredAssets = $derived(
		data.assets.filter(
			(a: any) =>
				a.asset_tag.toLowerCase().includes(assetSearchTerm.toLowerCase()) ||
				a.name.toLowerCase().includes(assetSearchTerm.toLowerCase())
		)
	);

	function selectAsset(asset: any) {
		selectedAsset = asset;
		assetSearchTerm = asset.asset_tag; // แสดง Tag ในช่องค้นหา
		manualAssetName = asset.name; // Auto-fill ชื่ออุปกรณ์
		if (asset.location_name) {
			locationText = asset.location_name; // Auto-fill สถานที่ถ้ามี
		}
		isAssetDropdownOpen = false;
	}

	function clearAssetSelection() {
		selectedAsset = null;
		assetSearchTerm = '';
		manualAssetName = '';
		locationText = '';
	}

	// กำหนดค่าเริ่มต้นชื่อผู้แจ้งซ่อมจาก User Login
	let reporterName = $state(data.user?.full_name || '');

	function handleImageChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (ev) => (previewUrl = ev.target?.result as string);
			reader.readAsDataURL(file);
		}
	}

	function getLocation() {
		if (!navigator.geolocation) {
			locationStatus = 'error';
			locationError = 'เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง';
			return;
		}

		locationStatus = 'loading';

		navigator.geolocation.getCurrentPosition(
			(position) => {
				lat = position.coords.latitude;
				lng = position.coords.longitude;
				locationStatus = 'success';
				
				// ถ้ามีข้อความเดิมอยู่แล้ว ให้ต่อท้ายด้วยพิกัด
				const coordText = `(GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)})`;
				if (locationText && !locationText.includes('GPS:')) {
					locationText = `${locationText} ${coordText}`;
				} else if (!locationText) {
					locationText = coordText;
				}
			},
			(error) => {
				locationStatus = 'error';
				locationError = 'กรุณาอนุญาตให้เข้าถึงพิกัด (GPS) ในการตั้งค่า';
			},
			{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
		);
	}
</script>

<div class="mx-auto max-w-2xl p-4 sm:p-8">
	{#if form?.success}
		<div
			class="rounded-3xl border-2 border-green-100 bg-white p-10 text-center shadow-2xl"
			transition:fly={{ y: 30 }}
		>
			<div
				class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600"
			>
				<svg class="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="3"
						d="M5 13l4 4L19 7"
					/></svg
				>
			</div>
			<h2 class="text-3xl font-black text-gray-900">บันทึกสำเร็จ!</h2>
			<div class="my-8 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 px-4 py-8">
				<p class="text-xs font-bold tracking-widest text-blue-400 uppercase">เลขที่ใบแจ้งซ่อม</p>
				<p class="mt-2 font-mono text-5xl font-black text-blue-700">{form.ticketId}</p>
			</div>
			<div class="flex gap-3">
				<a href="/repairs" class="flex-1 rounded-xl bg-gray-100 py-4 font-bold text-gray-700"
					>ดูรายการ</a
				>
				<button
					onclick={() => window.location.reload()}
					class="flex-1 rounded-xl bg-blue-600 py-4 font-bold text-white shadow-lg"
					>แจ้งเพิ่ม</button
				>
			</div>
		</div>
	{:else}
		<div class="mb-8 text-center sm:text-left">
			<h1 class="text-3xl font-black text-gray-900">แจ้งซ่อม (Repair)</h1>
			<p class="mt-1 font-medium text-gray-500">กรอกรายละเอียดเพื่อให้ทีมช่างเข้าแก้ไขได้ตรงจุด</p>
		</div>

		<form
			method="POST"
			action="?/createRepair"
			use:enhance={() => {
				isSubmitting = true;
				return async ({ update }) => {
					await update();
					isSubmitting = false;
				};
			}}
			enctype="multipart/form-data"
			class="space-y-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-xl sm:p-10"
		>
			<!-- 1. ชื่อผู้แจ้งซ่อม (ดึงจาก Login) -->
			<div>
				<label for="reporter_name" class="mb-2 block text-sm font-bold text-gray-700"
					>ชื่อผู้แจ้งซ่อม *</label
				>
				<input
					type="text"
					name="reporter_name"
					id="reporter_name"
					required
					bind:value={reporterName}
					placeholder="ระบุชื่อ-นามสกุลของคุณ"
					class="w-full rounded-2xl border-gray-200 bg-gray-50 p-4 font-medium transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
				/>
				{#if data.user}
					<p class="mt-1 text-xs text-green-600 font-medium">✓ ดึงข้อมูลจากบัญชีผู้ใช้: {data.user.username || data.user.email}</p>
				{/if}
			</div>

			<!-- 2. ค้นหา Asset Tag -->
			<div class="rounded-2xl border border-gray-200 bg-gray-50/50 p-5">
				<label for="asset_search" class="mb-2 block text-sm font-bold text-blue-800"
					>ค้นหาจากรหัสทรัพย์สิน (Asset Tag) *</label
				>
				<div class="relative">
					<div class="flex gap-2">
						<input
							type="text"
							id="asset_search"
							placeholder="พิมพ์รหัส Tag หรือ ชื่ออุปกรณ์..."
							autocomplete="off"
							class="w-full rounded-xl border-gray-300 p-4 font-mono text-sm shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
							bind:value={assetSearchTerm}
							onfocus={() => (isAssetDropdownOpen = true)}
						/>
						{#if selectedAsset}
							<button 
								type="button" 
								onclick={clearAssetSelection}
								class="rounded-xl border border-red-200 bg-white px-4 text-red-600 hover:bg-red-50"
							>
								เคลียร์
							</button>
						{/if}
					</div>

					<input type="hidden" name="asset_id" value={selectedAsset?.id || ''} />

					<!-- Dropdown ผลลัพธ์การค้นหา -->
					{#if isAssetDropdownOpen && assetSearchTerm.length > 0 && !selectedAsset}
						<div
							class="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-2xl"
							transition:slide
						>
							{#each filteredAssets as asset}
								<button
									type="button"
									class="w-full border-b border-gray-50 px-4 py-3 text-left last:border-0 hover:bg-blue-50"
									onclick={() => selectAsset(asset)}
								>
									<div class="flex justify-between items-center">
										<span class="font-bold text-blue-600 font-mono">{asset.asset_tag}</span>
										<span class="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{asset.location_name || 'ไม่ระบุที่ตั้ง'}</span>
									</div>
									<div class="text-xs text-gray-600 mt-1">{asset.name}</div>
								</button>
							{:else}
								<div class="px-4 py-3 text-sm text-gray-400 italic text-center">
									ไม่พบข้อมูล (คุณสามารถกรอกชื่อเองด้านล่าง)
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- ชื่ออุปกรณ์ (Auto-fill หรือ กรอกเอง) -->
				<div class="mt-4">
					<label for="asset_name" class="mb-1 block text-xs font-bold text-gray-500 uppercase"
						>ชื่ออุปกรณ์ (Asset Name)</label
					>
					<input
						type="text"
						name="asset_name"
						id="asset_name"
						required
						bind:value={manualAssetName}
						placeholder="เช่น แอร์ห้อง IT, ปั๊มน้ำชั้น 1"
						class="w-full rounded-xl border-gray-200 bg-white p-3 text-sm font-medium transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
					/>
				</div>
			</div>

			<!-- 3. สถานที่ -->
			<div class="rounded-2xl border border-blue-100 bg-blue-50/30 p-5">
				<label for="location_name" class="mb-2 block text-sm font-bold text-gray-700"
					>สถานที่ / พิกัด GPS *</label
				>

				<div class="flex flex-col gap-3">
					<input
						type="text"
						name="location_name"
						id="location_name"
						bind:value={locationText}
						required
						placeholder="พิมพ์ชื่อตึก แผนก หรือกดปุ่มแชร์พิกัด"
						class="w-full rounded-xl border-blue-200 bg-white p-4 font-medium shadow-sm transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
					/>

					<button
						type="button"
						onclick={getLocation}
						class="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-6 py-3 font-bold text-blue-600 shadow-sm transition-all hover:bg-blue-600 hover:text-white active:scale-95"
					>
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
							/><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
							/></svg
						>
						{locationStatus === 'loading' ? 'กำลังดึงพิกัด...' : 'แนบพิกัด GPS ปัจจุบัน'}
					</button>
				</div>

				{#if locationStatus === 'error'}
					<p class="mt-2 text-xs font-bold text-red-500" transition:slide>{locationError}</p>
				{/if}

				<input type="hidden" name="latitude" value={lat} />
				<input type="hidden" name="longitude" value={lng} />
			</div>

			<!-- 4. อาการเสีย -->
			<div>
				<label for="issue_description" class="mb-2 block text-sm font-bold text-gray-700"
					>รายละเอียดอาการเสีย *</label
				>
				<textarea
					name="issue_description"
					id="issue_description"
					rows="3"
					required
					placeholder="บอกอาการที่พบ..."
					class="w-full rounded-2xl border-gray-200 bg-gray-50 p-4 font-medium transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
				></textarea>
			</div>

			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
				<div>
					<label for="contact_info" class="mb-2 block text-sm font-bold text-gray-700"
						>เบอร์โทรศัพท์ / Line</label
					>
					<input
						type="text"
						name="contact_info"
						id="contact_info"
						placeholder="ระบุเพื่อติดต่อกลับ"
						class="w-full rounded-2xl border-gray-200 bg-gray-50 p-4 font-medium transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
					/>
				</div>
				<div>
					<label for="repair_image" class="mb-2 block text-sm font-bold text-gray-700"
						>ถ่ายรูปอุปกรณ์ที่เสีย</label
					>
					<input
						type="file"
						name="repair_image"
						id="repair_image"
						accept="image/*"
						onchange={handleImageChange}
						class="w-full text-sm text-gray-400 file:mr-4 file:rounded-xl file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:font-bold file:text-blue-700"
					/>
				</div>
			</div>

			{#if previewUrl}
				<div
					transition:slide
					class="overflow-hidden rounded-2xl border-2 border-gray-100 shadow-inner"
				>
					<img src={previewUrl} alt="Preview" class="h-48 w-full object-cover" />
				</div>
			{/if}

			<button
				type="submit"
				disabled={isSubmitting || locationStatus === 'loading'}
				class="w-full rounded-2xl bg-blue-600 py-5 text-xl font-black text-white shadow-xl shadow-blue-200 transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
			>
				{isSubmitting ? 'กำลังบันทึกข้อมูล...' : 'ส่งแจ้งซ่อม'}
			</button>
		</form>
	{/if}
</div>