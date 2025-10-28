<script lang="ts">
	import { navigating } from '$app/stores';
	import type { ActionData, PageData } from './$types'; // Use PageData

	// `form` คือ property ที่ SvelteKit ส่งกลับมาจาก server action
	// `data` คือ property ที่ได้จาก load function (มี companyLogoPath)
	export let form: ActionData;
	export let data: PageData; // Add data prop

	// `$navigating` คือ store ที่บอกสถานะการเปลี่ยนหน้า
	$: isLoading = $navigating?.type === 'form';
</script>

<!-- Container หลัก ใช้พื้นหลังสีเทาอ่อน -->
<div class="flex min-h-screen items-center justify-center bg-gray-50 p-4">
	<!-- การ์ด Login ที่ออกแบบใหม่ในธีมสว่าง -->
	<div class="w-full max-w-md space-y-8 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
		<!-- ส่วนหัวเรื่องและโลโก้ -->
	<div class="text-center">
		<div
			class="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full"
		>
			<!-- ไอคอน SVG สำหรับโลโก้ -->
            <!-- *** UPDATED IMG SRC *** -->
            {#if data.companyLogoPath}
                <img src={data.companyLogoPath} alt="Company Logo" class="h-20 w-20 object-contain" />
            {:else}
                <img src="/logo.png" alt="Default Logo" class="h-20 w-20 object-contain" /> <!-- Fallback -->
            {/if}
		</div>
		<h1 class="text-3xl font-bold text-gray-900">Welcome Back</h1>
		<p class="mt-2 text-gray-500">Login to your Core Business System</p> <!-- Updated System Name -->
	</div>

		<form method="POST" action="?/login" class="space-y-6">
			<!-- Input สำหรับ Email/Username พร้อมไอคอน -->
			<div>
				<label for="identifier" class="mb-2 block text-sm font-medium text-gray-700">Email or Username</label>
				<div class="relative">
					<span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
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
							class="h-5 w-5 text-gray-400"
							><rect width="20" height="16" x="2" y="4" rx="2" /><path
								d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"
							/></svg
						>
					</span>
					<input
						type="text"
						id="identifier"
						name="identifier"
						class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pl-10 pr-4 text-gray-900 transition duration-300 ease-in-out focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
						placeholder="your@email.com"
						value={form?.identifier ?? ''}
						required
					/>
				</div>
			</div>

			<!-- Input สำหรับรหัสผ่าน พร้อมไอคอนและลิงก์ลืมรหัสผ่าน -->
			<div>
				<div class="mb-2 flex items-center justify-between">
					<label for="password" class="block text-sm font-medium text-gray-700">Password</label>
					<a href="/forgot-password" class="text-sm text-blue-600 hover:underline">Forgot Password?</a>
				</div>
				<div class="relative">
					<span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
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
							class="h-5 w-5 text-gray-400"
							><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path
								d="M7 11V7a5 5 0 0 1 10 0v4"
							/></svg
						>
					</span>
					<input
						type="password"
						id="password"
						name="password"
						class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pl-10 pr-4 text-gray-900 transition duration-300 ease-in-out focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
						placeholder="••••••••"
						required
					/>
				</div>
			</div>

			<!-- แสดงข้อความ error ที่ถูกส่งกลับมาจาก server -->
			{#if form?.message}
				<p class="text-center text-sm text-red-500">{form.message}</p>
			{/if}

			<!-- ปุ่ม Submit -->
			<div>
				<button
					type="submit"
					disabled={isLoading}
					class="w-full transform rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white shadow-sm transition-all duration-300 ease-in-out hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:bg-blue-400 disabled:opacity-70"
				>
					{#if isLoading}
						<span class="flex items-center justify-center">
							<svg
								class="-ml-1 mr-3 h-5 w-5 animate-spin text-white"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
							>
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								/>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/>
							</svg>
							Signing In...
						</span>
					{:else}
						Sign In
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>

<svelte:head>
	<title>Login - Core Business</title> <!-- Updated Title -->
</svelte:head>