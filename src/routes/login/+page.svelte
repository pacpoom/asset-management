<script lang="ts">
	import { navigating } from '$app/stores';
	import type { ActionData, PageData } from './$types';
	import { onMount } from 'svelte';
	import { slide, fade } from 'svelte/transition';

	const { form, data } = $props<{ form: ActionData; data: PageData }>();

	const isLoading = $derived($navigating?.type === 'form');

	let isMounted = $state(false);
	onMount(() => {
		isMounted = true;
	});

	// 🔽🔽🔽 [เพิ่ม] State สำหรับสลับการแสดงรหัสผ่าน 🔽🔽🔽
	let showPassword = $state(false);
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50 p-4">
	{#if isMounted}
		<div
			class="w-full max-w-md space-y-8 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
			transition:fade={{ duration: 300, delay: 100 }}
		>
			<div class="text-center">
				<div class="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full">
					{#if data.companyLogoPath}
						<img src={data.companyLogoPath} alt="Company Logo" class="h-20 w-20 object-contain" />
					{:else}
						<img src="/logo.png" alt="Default Logo" class="h-20 w-20 object-contain" />
					{/if}
				</div>
				<h1 class="text-3xl font-bold text-gray-900">Welcome Back</h1>
				<p class="mt-2 text-gray-500">Login to your Core Business System</p>
			</div>

			<form method="POST" action="?/login" class="space-y-6">
				<div>
					<label for="identifier" class="mb-2 block text-sm font-medium text-gray-700"
						>Email or Username</label
					>
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
							class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pr-4 pl-10 text-gray-900 transition duration-300 ease-in-out focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 focus:outline-none"
							placeholder="your@email.com"
							value={form?.identifier ?? ''}
							required
						/>
					</div>
				</div>

				<div>
					<!-- <div class="mb-2 flex items-center justify-between">
						<label for="password" class="block text-sm font-medium text-gray-700">Password</label>
						<a href="/forgot-password" class="text-sm text-blue-600 hover:underline"
							>Forgot Password?</a
						>
					</div> -->

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
							type={showPassword ? 'text' : 'password'}
							id="password"
							name="password"
							class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pr-10 pl-10 text-gray-900 transition duration-300 ease-in-out focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 focus:outline-none"
							placeholder="••••••••"
							required
						/>
						<button
							type="button"
							class="absolute inset-y-0 right-0 flex items-center pr-3"
							onclick={() => (showPassword = !showPassword)}
							aria-label={showPassword ? 'Hide password' : 'Show password'}
						>
							{#if showPassword}
								<span class="material-symbols-outlined h-5 w-5 text-gray-500 hover:text-gray-700"
									>visibility_off</span
								>
							{:else}
								<span class="material-symbols-outlined h-5 w-5 text-gray-500 hover:text-gray-700"
									>visibility</span
								>
							{/if}
						</button>
					</div>
				</div>

				{#if form?.message}
					<div transition:slide={{ duration: 200 }}>
						<p class="text-center text-sm text-red-500">{form.message}</p>
					</div>
				{/if}

				<div>
					<button
						type="submit"
						disabled={isLoading}
						class="w-full transform rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white shadow-sm transition-all duration-300 ease-in-out hover:bg-blue-700 focus:ring-4 focus:ring-blue-500/50 focus:outline-none disabled:cursor-not-allowed disabled:bg-blue-400 disabled:opacity-70"
					>
						{#if isLoading}
							<span class="flex items-center justify-center">
								<svg
									class="mr-3 -ml-1 h-5 w-5 animate-spin text-white"
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
	{/if}
</div>

<svelte:head>
	<title>Login - Core Business</title>
</svelte:head>
