<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { invalidateAll } from '$app/navigation';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let id = $state<number | ''>('');
	let title = $state('');
	let content = $state('');
	let isPinned = $state<'0' | '1'>('0');
	let isActive = $state<'0' | '1'>('1');
	let startAt = $state('');
	let endAt = $state('');

	function edit(a: PageData['announcements'][0]) {
		id = a.id;
		title = a.title;
		content = a.content;
		isPinned = a.is_pinned ? '1' : '0';
		isActive = a.is_active ? '1' : '0';
		startAt = a.start_at ? String(a.start_at).slice(0, 16) : '';
		endAt = a.end_at ? String(a.end_at).slice(0, 16) : '';
	}

	function reset() {
		id = '';
		title = '';
		content = '';
		isPinned = '0';
		isActive = '1';
		startAt = '';
		endAt = '';
	}
</script>

<div class="space-y-4">
	<h1 class="text-2xl font-bold text-gray-800">Company Announcements</h1>
	<p class="text-sm text-gray-500">จัดการข่าวสารหน้าแรกของบริษัท</p>

	{#if form?.message}
		<div class="rounded border px-3 py-2 text-sm {form.success ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}">
			{form.message}
		</div>
	{/if}

	<form
		method="POST"
		action="?/save"
		enctype="multipart/form-data"
		use:enhance={() => {
			return async ({ update }) => {
				await update();
				await invalidateAll();
			};
		}}
		class="space-y-3 rounded-xl border border-gray-200 bg-white p-4"
	>
		<input type="hidden" name="id" value={id} />
		<div>
			<label class="mb-1 block text-xs font-semibold uppercase text-gray-500">Title</label>
			<input name="title" bind:value={title} required class="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
		</div>
		<div>
			<label class="mb-1 block text-xs font-semibold uppercase text-gray-500">Content</label>
			<textarea name="content" bind:value={content} required rows="5" class="w-full rounded border border-gray-300 px-3 py-2 text-sm"></textarea>
		</div>
		<div class="grid grid-cols-1 gap-3 md:grid-cols-4">
			<div>
				<label class="mb-1 block text-xs font-semibold uppercase text-gray-500">Pinned</label>
				<select name="is_pinned" bind:value={isPinned} class="w-full rounded border border-gray-300 px-3 py-2 text-sm">
					<option value="0">No</option>
					<option value="1">Yes</option>
				</select>
			</div>
			<div>
				<label class="mb-1 block text-xs font-semibold uppercase text-gray-500">Status</label>
				<select name="is_active" bind:value={isActive} class="w-full rounded border border-gray-300 px-3 py-2 text-sm">
					<option value="1">Active</option>
					<option value="0">Inactive</option>
				</select>
			</div>
			<div>
				<label class="mb-1 block text-xs font-semibold uppercase text-gray-500">Start at</label>
				<input type="datetime-local" name="start_at" bind:value={startAt} class="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
			</div>
			<div>
				<label class="mb-1 block text-xs font-semibold uppercase text-gray-500">End at</label>
				<input type="datetime-local" name="end_at" bind:value={endAt} class="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
			</div>
		</div>
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			<div>
				<label class="mb-1 block text-xs font-semibold uppercase text-gray-500">Images (multiple)</label>
				<input type="file" name="image_files" accept="image/*" multiple class="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
			</div>
			<div>
				<label class="mb-1 block text-xs font-semibold uppercase text-gray-500">Attachments (multiple)</label>
				<input type="file" name="attachment_files" multiple class="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
			</div>
		</div>
		{#if id}
			<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
				<div>
					<p class="mb-1 text-xs font-semibold uppercase text-gray-500">Existing Images</p>
					<div class="flex flex-wrap gap-2">
						{#each data.announcements.find((x) => x.id === id)?.images ?? [] as img}
							<div class="rounded border border-gray-200 p-1">
								<a href={img.image_url} target="_blank" class="block">
									<img src={img.image_url} alt="img" class="h-16 w-16 object-cover" />
								</a>
								<form method="POST" action="?/deleteImage" use:enhance={() => { return async ({ update }) => { await update(); await invalidateAll(); }; }}>
									<input type="hidden" name="id" value={img.id} />
									<button type="submit" class="mt-1 w-full rounded bg-red-50 px-2 py-0.5 text-[11px] text-red-700">Remove</button>
								</form>
							</div>
						{/each}
					</div>
				</div>
				<div>
					<p class="mb-1 text-xs font-semibold uppercase text-gray-500">Existing Attachments</p>
					<div class="space-y-1">
						{#each data.announcements.find((x) => x.id === id)?.attachments ?? [] as f}
							<div class="flex items-center justify-between rounded border border-gray-200 px-2 py-1 text-xs">
								<a href={f.file_url} target="_blank" class="text-blue-600 hover:underline">{f.file_name}</a>
								<form method="POST" action="?/deleteAttachment" use:enhance={() => { return async ({ update }) => { await update(); await invalidateAll(); }; }}>
									<input type="hidden" name="id" value={f.id} />
									<button type="submit" class="rounded bg-red-50 px-2 py-0.5 text-red-700">Remove</button>
								</form>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}
		<div class="flex gap-2">
			<button type="submit" class="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{id ? 'Update' : 'Create'}</button>
			<button type="button" onclick={reset} class="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Reset</button>
		</div>
	</form>

	<div class="rounded-xl border border-gray-200 bg-white p-4">
		<h2 class="mb-3 text-lg font-semibold text-gray-800">Announcement List</h2>
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 text-sm">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-3 py-2 text-left">Title</th>
						<th class="px-3 py-2 text-left">Pinned</th>
						<th class="px-3 py-2 text-left">Status</th>
						<th class="px-3 py-2 text-left">Period</th>
						<th class="px-3 py-2 text-left">Files</th>
						<th class="px-3 py-2 text-left">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100">
					{#each data.announcements as a}
						<tr>
							<td class="px-3 py-2 font-medium text-gray-800">{a.title}</td>
							<td class="px-3 py-2">{a.is_pinned ? 'Yes' : 'No'}</td>
							<td class="px-3 py-2">{a.is_active ? 'Active' : 'Inactive'}</td>
							<td class="px-3 py-2 text-xs text-gray-600">{a.start_at || '-'} ~ {a.end_at || '-'}</td>
							<td class="px-3 py-2">
								<div class="flex flex-col gap-1 text-xs">
									<span>Images: {a.images?.length ?? 0}</span>
									<span>Files: {a.attachments?.length ?? 0}</span>
								</div>
							</td>
							<td class="px-3 py-2">
								<div class="flex gap-2">
									<button type="button" onclick={() => edit(a)} class="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">Edit</button>
									<form method="POST" action="?/delete" use:enhance={() => { return async ({ update }) => { await update(); await invalidateAll(); }; }}>
										<input type="hidden" name="id" value={a.id} />
										<button type="submit" class="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Delete</button>
									</form>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
