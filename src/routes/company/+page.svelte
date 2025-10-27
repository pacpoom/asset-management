<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	// ใช้ตัวแปรนี้เพื่อบังคับให้เบราว์เซอร์โหลดรูปภาพใหม่หลังอัปโหลด
	let logoCacheBuster = Date.now();

	$: company = data.company;
	$: if (form?.success) {
		// ถ้าบันทึกสำเร็จ และมีการอัปเดต logo_path
		if (form.logo_path) {
			company.logo_path = form.logo_path;
		}
		// อัปเดต cache buster เพื่อโหลดรูปใหม่
		logoCacheBuster = Date.now();
	}
</script>

<div class="container mx-auto p-8 max-w-4xl">
	<h1 class="text-3xl font-bold mb-6">ข้อมูลบริษัท</h1>

	<!-- แสดงข้อความแจ้งเตือน -->
	{#if form?.message}
		<div
			class={`alert ${form?.success ? 'alert-success' : 'alert-error'} shadow-lg mb-4`}
		>
			<div>
				{#if form?.success}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="stroke-current flex-shrink-0 h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="stroke-current flex-shrink-0 h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				{/if}
				<span>{form.message}</span>
			</div>
		</div>
	{/if}

	<form
		method="POST"
		action="?/save"
		enctype="multipart/form-data"
		use:enhance
		class="bg-white p-6 rounded-lg shadow-md"
	>
		<!-- ซ่อน path โลโก้ปัจจุบันไว้สำหรับส่งกลับไปที่ server -->
		<input type="hidden" name="current_logo_path" value={company.logo_path || ''} />

		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<!-- ส่วนของโลโก้ -->
			<div class="md:col-span-1">
				<label for="logo" class="block text-sm font-medium text-gray-700 mb-2">โลโก้บริษัท</label
				>
				{#if company.logo_path}
					<div class_name="mb-4">
						<img
							src="{company.logo_path}?v={logoCacheBuster}"
							alt="Company Logo"
							class="w-40 h-40 object-contain border rounded-md p-2"
						/>
					</div>
				{:else}
					<div
						class="w-40 h-40 border rounded-md p-2 flex items-center justify-center bg-gray-50 text-gray-400 mb-4"
					>
						ไม่มีโลโก้
					</div>
				{/if}
				<input
					type="file"
					name="logo"
					id="logo"
					accept="image/png, image/jpeg, image/gif, image/svg+xml"
					class="file-input file-input-bordered file-input-sm w-full"
				/>
				<p class="text-xs text-gray-500 mt-1">
					อัปโหลดไฟล์ใหม่ (PNG, JPG, SVG).
				</p>
			</div>

			<!-- ส่วนของข้อมูล -->
			<div class="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
				<div class="form-control md:col-span-2">
					<label for="name" class="label">
						<span class="label-text">ชื่อบริษัท *</span>
					</label>
					<input
						type="text"
						id="name"
						name="name"
						bind:value={company.name}
						class="input input-bordered w-full"
						required
					/>
				</div>

				<div class="form-control md:col-span-2">
					<label for="address_line_1" class="label">
						<span class="label-text">ที่อยู่ (บรรทัด 1)</span>
					</label>
					<input
						type="text"
						id="address_line_1"
						name="address_line_1"
						bind:value={company.address_line_1}
						class="input input-bordered w-full"
					/>
				</div>

				<div class="form-control md:col-span-2">
					<label for="address_line_2" class="label">
						<span class="label-text">ที่อยู่ (บรรทัด 2)</span>
					</label>
					<input
						type="text"
						id="address_line_2"
						name="address_line_2"
						bind:value={company.address_line_2}
						class="input input-bordered w-full"
					/>
				</div>

				<div class="form-control">
					<label for="city" class="label">
						<span class="label-text">อำเภอ/เขต</span>
					</label>
					<input
						type="text"
						id="city"
						name="city"
						bind:value={company.city}
						class="input input-bordered w-full"
					/>
				</div>

				<div class="form-control">
					<label for="state_province" class="label">
						<span class="label-text">จังหวัด</span>
					</label>
					<input
						type="text"
						id="state_province"
						name="state_province"
						bind:value={company.state_province}
						class="input input-bordered w-full"
					/>
				</div>

				<div class="form-control">
					<label for="postal_code" class="label">
						<span class="label-text">รหัสไปรษณีย์</span>
					</label>
					<input
						type="text"
						id="postal_code"
						name="postal_code"
						bind:value={company.postal_code}
						class="input input-bordered w-full"
					/>
				</div>

				<div class="form-control">
					<label for="country" class="label">
						<span class="label-text">ประเทศ</span>
					</label>
					<input
						type="text"
						id="country"
						name="country"
						bind:value={company.country}
						class="input input-bordered w-full"
					/>
				</div>

				<div class="form-control">
					<label for="phone" class="label">
						<span class="label-text">เบอร์โทรศัพท์</span>
					</label>
					<input
						type="tel"
						id="phone"
						name="phone"
						bind:value={company.phone}
						class="input input-bordered w-full"
					/>
				</div>

				<div class="form-control">
					<label for="email" class="label">
						<span class="label-text">อีเมล</span>
					</label>
					<input
						type="email"
						id="email"
						name="email"
						bind:value={company.email}
						class="input input-bordered w-full"
					/>
				</div>

				<div class="form-control">
					<label for="website" class="label">
						<span class="label-text">เว็บไซต์</span>
					</label>
					<input
						type="url"
						id="website"
						name="website"
						bind:value={company.website}
						class="input input-bordered w-full"
					/>
				</div>

				<div class="form-control">
					<label for="tax_id" class="label">
						<span class="label-text">เลขประจำตัวผู้เสียภาษี</span>
					</label>
					<input
						type="text"
						id="tax_id"
						name="tax_id"
						bind:value={company.tax_id}
						class="input input-bordered w-full"
					/>
				</div>
			</div>
		</div>

		<!-- ปุ่มบันทึก -->
		<div class="mt-8 flex justify-end">
			<button type="submit" class="btn btn-primary">
				บันทึกข้อมูล
			</button>
		</div>
	</form>
</div>