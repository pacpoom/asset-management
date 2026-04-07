<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	$: groupTitles = data.groupTitles;

	$: grouped = (() => {
		const m = new Map<string, PageData['fields'][0][]>();
		for (const f of data.fields) {
			const list = m.get(f.group) ?? [];
			list.push(f);
			m.set(f.group, list);
		}
		return [...m.entries()] as [keyof typeof groupTitles, PageData['fields'][0][]][];
	})();

	let saving = false;
</script>

<svelte:head>
	<title>Environment configuration (.env)</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-slate-900">Environment configuration</h1>
		<p class="mt-2 text-sm text-slate-600">
			แก้ค่าจากไฟล์ <code class="rounded bg-slate-100 px-1">.env</code> สำหรับบทบาท
			ต้องมีสิทธิ์ <strong>manage env config</strong> (หรือ role <strong>admin</strong>) - ค่าลับจะไม่แสดงในเบราว์เซอร์ หากไม่กรอกจะคงค่าเดิม
		</p>
	</div>

	{#if form?.message}
		<div
			class="mb-6 rounded-lg border px-4 py-3 text-sm {form?.success === true
				? 'border-green-200 bg-green-50 text-green-800'
				: 'border-red-200 bg-red-50 text-red-800'}"
		>
			{form.message}
		</div>
	{/if}

	<form
		method="POST"
		action="?/save"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				await update();
				saving = false;
			};
		}}
		class="space-y-8"
	>
		{#each grouped as [group, fields] (group)}
			<section class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
				<h2 class="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
					<span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
						{#if group === 'database'}
							<span class="material-symbols-outlined text-xl">database</span>
						{:else if group === 'smtp'}
							<span class="material-symbols-outlined text-xl">mail</span>
						{:else if group === 'app'}
							<span class="material-symbols-outlined text-xl">language</span>
						{:else}
							<span class="material-symbols-outlined text-xl">chat</span>
						{/if}
					</span>
					{groupTitles[group]}
				</h2>
				<div class="grid gap-5 sm:grid-cols-1">
					{#each fields as field (field.key)}
						<div>
							<label for={field.key} class="mb-1 block text-sm font-medium text-slate-700">
								{field.label}
								<span class="font-mono text-xs text-slate-500">({field.key})</span>
								{#if field.secret}
									<span
										class="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900"
										>ลับ</span
									>
								{/if}
							</label>
							{#if field.secret}
								<input
									id={field.key}
									name={field.key}
									type="password"
									autocomplete="off"
									placeholder={field.hasValue ? '•••••••• (มีค่าตั้งแล้ว - เว้นว่างเพื่อคงเดิม)' : 'ยังไม่ตั้งค่า'}
									class="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
								/>
							{:else}
								<input
									id={field.key}
									name={field.key}
									type="text"
									autocomplete="off"
									value={field.inputValue}
									class="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
								/>
							{/if}
							{#if field.hint}
								<p class="mt-1 text-xs text-slate-500">{field.hint}</p>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/each}

		<div class="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6">
			<button
				type="submit"
				disabled={saving}
				class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
			>
				{saving ? 'กำลังบันทึก...' : 'บันทึกไปที่ .env'}
			</button>
			<a
				href="/"
				class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
			>
				กลับ
			</a>
			<p class="w-full text-xs text-slate-500 sm:w-auto">
				ควรสำรองไฟล์ .env ก่อนแก้ production - ตรวจสิทธิ์เขียนไฟล์ในโฟลเดอร์โปรเจกต์
			</p>
		</div>
	</form>
</div>
