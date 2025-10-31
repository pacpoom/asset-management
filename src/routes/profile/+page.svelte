<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { slide } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let profileData = $state({
		full_name: data.profile.full_name || '',
		email: data.profile.email || ''
	});
	let new_password = $state('');

	let previewUrl = $state<string | null>(data.profile.profile_image_url);
	let isSaving = $state(false);

	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];

		if (file) {
			if (previewUrl && previewUrl.startsWith('blob:')) {
				URL.revokeObjectURL(previewUrl);
			}
			previewUrl = URL.createObjectURL(file);
		}
	}

	$effect.pre(() => {
		if (data.profile) {
			profileData.full_name = data.profile.full_name || '';
			profileData.email = data.profile.email || '';
			if (!previewUrl || !previewUrl.startsWith('blob:')) {
				previewUrl = data.profile.profile_image_url;
			}
		}
	});

	$effect.pre(() => {
		if (form) {
			if (form.success) {
				toast.success(form.message as string);
				new_password = '';
				invalidateAll();
			} else {
				toast.error(form.message as string);
			}
		}
	});
</script>

<svelte:head>
	<title>My Profile</title>
</svelte:head>

<div class="mx-auto max-w-4xl rounded-lg border border-gray-200 bg-white shadow-sm">
	<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
		<h1 class="text-xl font-bold text-gray-800">My Profile</h1>
		<form method="POST" action="/login?/logout">
			<button
				type="submit"
				class="rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-1 focus:outline-none"
			>
				Logout
			</button>
		</form>
	</div>

	<form
		method="POST"
		action="?/updateProfile"
		enctype="multipart/form-data"
		use:enhance={() => {
			isSaving = true;
			return async ({ result, update }) => {
				isSaving = false;
				await update({ reset: false });
			};
		}}
	>
		<div class="grid grid-cols-1 gap-8 p-6 md:grid-cols-3">
			<div class="flex flex-col items-center md:items-start">
				<label for="profile_image" class="mb-2 block text-sm font-medium text-gray-700"
					>Profile Image</label
				>

				<img
					src={previewUrl || '/default-avatar.jpg'}
					alt="Profile"
					class="mb-4 h-40 w-40 rounded-full border bg-gray-100 object-cover"
				/>
				<input
					type="file"
					name="profile_image"
					id="profile_image"
					accept="image/png, image/jpeg, image/webp"
					onchange={handleFileChange}
					class="w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
				/>
				<p class="mt-1 text-xs text-gray-500">Max 5MB (PNG, JPG, WEBP)</p>
			</div>

			<div class="space-y-6 md:col-span-2">
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div>
						<span class="block text-sm font-medium text-gray-500">Username</span>
						<p class="mt-1 font-mono text-sm text-gray-800">{data.profile.username}</p>
					</div>
					<div>
						<span class="block text-sm font-medium text-gray-500">Employee ID</span>
						<p class="mt-1 font-mono text-sm text-gray-800">{data.profile.emp_id || 'N/A'}</p>
					</div>
					<div>
						<span class="block text-sm font-medium text-gray-500">Department</span>
						<p class="mt-1 text-sm text-gray-800">{data.profile.department_name || 'N/A'}</p>
					</div>
					<div>
						<span class="block text-sm font-medium text-gray-500">Position</span>
						<p class="mt-1 text-sm text-gray-800">{data.profile.position_name || 'N/A'}</p>
					</div>
				</div>
				<hr />
				<div>
					<label for="full_name" class="mb-1 block text-sm font-medium text-gray-700"
						>Full Name *</label
					>
					<input
						type="text"
						name="full_name"
						id="full_name"
						required
						bind:value={profileData.full_name}
						class="w-full rounded-md border-gray-300 shadow-sm"
					/>
				</div>
				<div>
					<label for="email" class="mb-1 block text-sm font-medium text-gray-700"
						>Email Address *</label
					>
					<input
						type="email"
						name="email"
						id="email"
						required
						bind:value={profileData.email}
						class="w-full rounded-md border-gray-300 shadow-sm"
					/>
				</div>
				<div>
					<label for="new_password" class="mb-1 block text-sm font-medium text-gray-700"
						>New Password</label
					>
					<input
						type="password"
						name="new_password"
						id="new_password"
						bind:value={new_password}
						class="w-full rounded-md border-gray-300 shadow-sm"
					/>
					<p class="mt-1 text-xs text-gray-500">Leave blank to keep your current password.</p>
				</div>
			</div>
		</div>

		<div class="flex items-center justify-end border-t border-gray-200 bg-gray-50 px-6 py-4">
			<button
				type="submit"
				disabled={isSaving}
				class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-400"
			>
				{#if isSaving}
					Saving...
				{:else}
					Save Changes
				{/if}
			</button>
		</div>
	</form>
</div>
