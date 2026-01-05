<script lang="ts">
	import { enhance } from '$app/forms';
	import { fade, slide } from 'svelte/transition';

	let { form } = $props();
	let isSearching = $state(false);

	function getStatusColor(status: string) {
		const colors: Record<string, string> = {
			Pending: 'bg-amber-100 text-amber-700 border-amber-200',
			'In Progress': 'bg-blue-100 text-blue-700 border-blue-200',
			Completed: 'bg-green-100 text-green-700 border-green-200',
			Cancelled: 'bg-red-100 text-red-700 border-red-200'
		};
		return colors[status] || 'bg-gray-100 text-gray-700';
	}

	function getStatusLabel(status: string) {
		const map: Record<string, string> = {
			Pending: 'รอดำเนินการ',
			'In Progress': 'กำลังซ่อม',
			Completed: 'เสร็จสิ้น',
			Cancelled: 'ยกเลิก'
		};
		return map[status] || status;
	}
</script>

<div class="mx-auto max-w-xl p-4 sm:p-8">
	<div class="mb-8 text-center">
		<h1 class="text-3xl font-black text-gray-900">🔍 ติดตามสถานะแจ้งซ่อม</h1>
		<p class="mt-2 text-gray-500">กรอกเลข Ticket หรือ เบอร์โทรศัพท์ เพื่อค้นหา</p>
	</div>

	<div class="mb-8 rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
		<form
			method="POST"
			action="?/search"
			use:enhance={() => {
				isSearching = true;
				return async ({ update }) => {
					await update();
					isSearching = false;
				};
			}}
		>
			<div class="relative">
				<input
					type="text"
					name="keyword"
					placeholder="เช่น 251225-001 หรือ 0812345678"
					required
					value={form?.keyword ?? ''}
					class="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 py-4 pr-4 pl-12 text-lg font-bold text-gray-700 transition-all placeholder:font-normal focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
				/>
				<svg
					class="absolute top-1/2 left-4 h-6 w-6 -translate-y-1/2 text-gray-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/></svg
				>
			</div>

			<button
				type="submit"
				disabled={isSearching}
				class="mt-4 w-full rounded-2xl bg-blue-600 py-4 font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-50"
			>
				{isSearching ? 'กำลังค้นหา...' : 'ตรวจสอบสถานะ'}
			</button>
		</form>

		{#if form?.message}
			<div
				class="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-center text-sm font-bold text-red-600"
				transition:slide
			>
				{form.message}
			</div>
		{/if}
	</div>

	{#if form?.success && form?.results}
		<div class="space-y-6" transition:fade>
			<div class="mb-4 flex items-center gap-2">
				<span class="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700"
					>ผลลัพธ์: {form.results.length} รายการ</span
				>
			</div>

			{#each form.results as item}
				<div
					class="relative overflow-hidden rounded-3xl border border-gray-100 bg-white p-6 shadow-md"
				>
					<div class="absolute top-6 right-6">
						<span
							class={`rounded-full px-3 py-1 text-xs font-black tracking-wider uppercase ${getStatusColor(item.repair_status)}`}
						>
							{getStatusLabel(item.repair_status)}
						</span>
					</div>

					<div class="pr-20">
						<p class="mb-1 text-xs font-bold tracking-widest text-gray-400 uppercase">Ticket ID</p>
						<h3 class="font-mono text-2xl font-black text-blue-600">{item.ticket_code}</h3>
						<p class="mt-1 text-xs font-bold text-gray-400">{item.created_at_formatted}</p>
					</div>

					<div class="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-4">
						<p class="mb-1 text-xs font-bold text-gray-400 uppercase">อุปกรณ์ / อาการเสีย</p>
						<p class="text-lg font-bold text-gray-800">{item.asset_name}</p>
						<p class="mt-1 text-gray-600 italic">"{item.issue_description}"</p>
					</div>

					{#if item.completion_image_url || item.admin_notes}
						<div class="mt-4 rounded-2xl border border-green-100 bg-green-50 p-4">
							<p class="mb-3 flex items-center gap-1 text-xs font-black text-green-600 uppercase">
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 13l4 4L19 7"
									/></svg
								>
								การแก้ไขเสร็จสิ้น
							</p>

							{#if item.completion_image_url}
								<img
									src={item.completion_image_url}
									alt="Fixed"
									class="mb-3 w-full rounded-xl border-4 border-white shadow-sm"
								/>
							{/if}

							{#if item.admin_notes}
								<div class="rounded-xl bg-white/60 p-3 text-sm font-medium text-green-800">
									<span class="font-bold">ช่างแจ้งว่า:</span>
									{item.admin_notes}
								</div>
							{/if}
						</div>
					{:else if item.repair_status === 'In Progress'}
						<div class="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-center">
							<p class="text-sm font-bold text-blue-600">กำลังดำเนินการซ่อม...</p>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
