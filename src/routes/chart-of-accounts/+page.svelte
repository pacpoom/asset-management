<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll, goto } from '$app/navigation'; // For refreshing data and navigation

	// --- Types ---
	type ChartOfAccount = PageData['accounts'][0];

	// --- Props & State (Svelte 5 Runes) ---
	// data.accounts คือข้อมูลที่ถูกกรองแล้วจาก Server
	// data.filters คือสถานะฟิลเตอร์ปัจจุบันที่ Server ส่งกลับมา
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedAccount = $state<Partial<ChartOfAccount> | null>(null);
	let accountToDelete = $state<ChartOfAccount | null>(null);
	let isSaving = $state(false);
	let globalMessage = $state<{ success: boolean; text: string; type: 'success' | 'error' } | null>(
		null
	);
	let messageTimeout: NodeJS.Timeout;

	// --- SERVER-SIDE FILTER STATE (Derived from load data) ---
	// ใช้ตัวแปร $state สำหรับ UI input, โดยตั้งค่าเริ่มต้นจากค่าที่ Server ส่งมา (data.filters)
	let currentSearch = $state(data.filters.search);
	let currentType = $state(data.filters.type);
	let currentActive = $state(data.filters.activeStatus);

	// --- Functions ---
	function openModal(mode: 'add' | 'edit', account: ChartOfAccount | null = null) {
		modalMode = mode;
		globalMessage = null; // Clear message on open
		if (mode === 'edit' && account) {
			selectedAccount = { ...account }; // Copy for editing
		} else {
			selectedAccount = {
				account_code: '',
				account_name: '',
				account_type: data.accountTypes?.[0] || '',
				description: '',
				is_active: true
			} as Partial<ChartOfAccount>;
		}
	}

	function closeModal() {
		modalMode = null;
		selectedAccount = null;
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

	// --- NEW: Function to apply filters by updating the URL ---
	// การเปลี่ยนแปลง URL จะ trigger ให้ load function บน Server ทำงานซ้ำ
	function applyFilters() {
		const url = new URL(window.location.href);

		// Update Search
		if (currentSearch) {
			url.searchParams.set('search', currentSearch);
		} else {
			url.searchParams.delete('search');
		}

		// Update Type
		if (currentType) {
			url.searchParams.set('type', currentType);
		} else {
			url.searchParams.delete('type');
		}

		// Update Active Status
		if (currentActive !== 'all') {
			url.searchParams.set('active', currentActive);
		} else {
			url.searchParams.delete('active');
		}

		// Navigate, which triggers the server load function
		goto(url.toString(), { keepFocus: true, replaceState: true });
	}

	// --- REMOVED: Derived State for Filtering (Now Server-Side) ---
	// const filteredAccounts = $derived(() => { ... });
	// เราจะใช้ data.accounts โดยตรงเนื่องจากถูกกรองโดย Server แล้ว

	// --- Reactive Effects (Svelte 5 Runes) ---
	$effect.pre(() => {
		// Handle saveAccount results
		if (form?.action === 'saveAccount') {
			if (form.success) {
				closeModal();
				showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
				invalidateAll(); // Refresh account list data (which also re-runs the load function)
			} else if (form.message) {
				// Keep modal open, show error globally
				showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
			}
			form.action = undefined; // Consume the action state
		}

		// Handle deleteAccount results
		if (form?.action === 'deleteAccount') {
			if (form.success) {
				showGlobalMessage({ success: true, text: form.message as string, type: 'success' });
				invalidateAll(); // Refresh data after delete
			} else if (form.message) {
				// Show error message if delete failed (e.g., due to FK constraint)
				showGlobalMessage({ success: false, text: form.message as string, type: 'error' });
			}
			accountToDelete = null; // Close confirmation modal regardless of outcome
			form.action = undefined;
		}
	});
</script>

<svelte:head>
	<title>Chart of Accounts</title>
</svelte:head>

<!-- Global Notifications -->
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

<!-- Main Header -->
<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">Chart of Accounts</h1>
		<p class="mt-1 text-sm text-gray-500">จัดการผังบัญชีสำหรับระบบ</p>
	</div>
	<button
		onclick={() => openModal('add')}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			class="h-4 w-4"
			><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg
		>
		เพิ่มบัญชีใหม่
	</button>
</div>

<!-- Filters -->
<div
	class="mb-4 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-3"
>
	<div class="relative">
		<label for="search" class="sr-only">Search</label>
		<input
			type="search"
			id="search"
			bind:value={currentSearch}
			oninput={applyFilters}
			placeholder="ค้นหารหัสบัญชี หรือ ชื่อบัญชี..."
			class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 text-sm focus:border-blue-500 focus:ring-blue-500"
		/>
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<svg
				class="h-4 w-4 text-gray-400"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				><path
					fill-rule="evenodd"
					d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
					clip-rule="evenodd"
				/></svg
			>
		</div>
	</div>
	<div>
		<label for="filterType" class="sr-only">Account Type</label>
		<select
			id="filterType"
			bind:value={currentType}
			onchange={applyFilters}
			class="w-full rounded-lg border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
		>
			<option value="">-- ทุกประเภทบัญชี --</option>
			{#each data.accountTypes as type}
				<option value={type}>{type}</option>
			{/each}
		</select>
	</div>
	<div>
		<label for="filterActive" class="sr-only">Status</label>
		<select
			id="filterActive"
			bind:value={currentActive}
			onchange={applyFilters}
			class="w-full rounded-lg border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
		>
			<option value="all">-- ทุกสถานะ --</option>
			<option value="active">Active</option>
			<option value="inactive">Inactive</option>
		</select>
	</div>
</div>

<!-- Accounts Table -->
<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Code</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Name</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Description</th>
				<th class="px-4 py-3 text-center font-semibold text-gray-600">Active</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.accounts.length === 0}
				<tr>
					<td colspan="6" class="py-12 text-center text-gray-500">
						{#if data.filters.search || data.filters.type || data.filters.activeStatus !== 'all'}
							ไม่พบข้อมูลบัญชีตามเงื่อนไขที่กำหนด
						{:else}
							ไม่พบข้อมูลผังบัญชี
						{/if}
					</td>
				</tr>
			{:else}
				{#each data.accounts as account (account.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-3 font-mono text-xs text-gray-700">{account.account_code}</td>
						<td class="px-4 py-3 font-medium text-gray-900">{account.account_name}</td>
						<td class="px-4 py-3 text-gray-600">{account.account_type}</td>
						<td class="max-w-xs truncate px-4 py-3 text-gray-600" title={account.description ?? ''}
							>{account.description ?? '-'}</td
						>
						<td class="px-4 py-3 text-center">
							{#if account.is_active}
								<span
									class="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
									>✓</span
								>
							{:else}
								<span
									class="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
									>✕</span
								>
							{/if}
						</td>
						<td class="px-4 py-3 whitespace-nowrap">
							<div class="flex items-center gap-2">
								<button
									onclick={() => openModal('edit', account)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
									aria-label="Edit account"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="24"
										height="24"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										class="h-4 w-4"
										><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
									>
								</button>
								<button
									onclick={() => (accountToDelete = account)}
									class="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
									aria-label="Delete account"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="24"
										height="24"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										class="h-4 w-4"
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

<!-- Add/Edit Account Modal -->
{#if modalMode && selectedAccount}
	<div
		transition:slide
		class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
	>
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div class="relative w-full max-w-lg transform rounded-xl bg-white shadow-2xl">
			<div class="border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? 'เพิ่มบัญชีใหม่' : 'แก้ไขบัญชี'}
				</h2>
			</div>

			<form
				method="POST"
				action="?/saveAccount"
				use:enhance={() => {
					isSaving = true;
					return async ({ update }) => {
						await update();
						isSaving = false;
					};
				}}
			>
				<div class="max-h-[70vh] space-y-4 overflow-y-auto p-6">
					{#if modalMode === 'edit'}<input
							type="hidden"
							name="id"
							value={selectedAccount.id}
						/>{/if}

					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<label for="account_code" class="mb-1 block text-sm font-medium text-gray-700"
								>Account Code *</label
							>
							<input
								type="text"
								name="account_code"
								id="account_code"
								required
								bind:value={selectedAccount.account_code}
								class="w-full rounded-md border-gray-300"
							/>
						</div>
						<div>
							<label for="account_name" class="mb-1 block text-sm font-medium text-gray-700"
								>Account Name *</label
							>
							<input
								type="text"
								name="account_name"
								id="account_name"
								required
								bind:value={selectedAccount.account_name}
								class="w-full rounded-md border-gray-300"
							/>
						</div>
					</div>

					<div>
						<label for="account_type" class="mb-1 block text-sm font-medium text-gray-700"
							>Account Type *</label
						>
						<select
							name="account_type"
							id="account_type"
							bind:value={selectedAccount.account_type}
							required
							class="w-full rounded-md border-gray-300"
						>
							<option value="" disabled>-- Select Type --</option>
							{#each data.accountTypes as type}
								<option value={type}>{type}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="description" class="mb-1 block text-sm font-medium text-gray-700"
							>Description</label
						>
						<textarea
							name="description"
							id="description"
							rows="3"
							bind:value={selectedAccount.description}
							class="w-full rounded-md border-gray-300"
						></textarea>
					</div>

					<div class="flex items-center">
						<input
							type="checkbox"
							name="is_active"
							id="is_active"
							bind:checked={selectedAccount.is_active}
							class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
						/>
						<label for="is_active" class="ml-2 block text-sm text-gray-900">Active</label>
					</div>

					<!-- Display form error messages -->
					{#if form?.message && !form.success && form.action === 'saveAccount'}
						<div class="rounded-md bg-red-50 p-3 text-sm text-red-600">
							<p><strong>Error:</strong> {form.message}</p>
						</div>
					{/if}
				</div>
				<div class="flex justify-end gap-3 border-t bg-gray-50 p-4">
					<button
						type="button"
						onclick={closeModal}
						class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
						>Cancel</button
					>
					<button
						type="submit"
						disabled={isSaving}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-400"
					>
						{#if isSaving}
							Saving...
						{:else}
							Save Account
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if accountToDelete}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="alertdialog"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="text-lg font-bold">ยืนยันการลบ</h3>
			<p class="mt-2 text-sm text-gray-600">
				คุณแน่ใจหรือไม่ที่จะลบบัญชี: <br />
				<strong class="font-mono text-xs"
					>{accountToDelete.account_code} - {accountToDelete.account_name}</strong
				>?
				<br />การดำเนินการนี้ไม่สามารถย้อนกลับได้
			</p>
			{#if form?.message && !form.success && form.action === 'deleteAccount'}
				<p class="mt-2 text-sm text-red-600"><strong>Error:</strong> {form.message}</p>
			{/if}
			<form method="POST" action="?/deleteAccount" use:enhance class="mt-6 flex justify-end gap-3">
				<input type="hidden" name="id" value={accountToDelete.id} />
				<button
					type="button"
					onclick={() => (accountToDelete = null)}
					class="rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
					>Cancel</button
				>
				<button
					type="submit"
					class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
					>Delete</button
				>
			</form>
		</div>
	</div>
{/if}
