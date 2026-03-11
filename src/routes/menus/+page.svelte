<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { t } from '$lib/i18n';

	interface Menu {
		id: number;
		title: string;
		icon: string | null;
		route: string | null;
		parent_id: number | null;
		permission_name: string | null;
		order: number;
		children?: Menu[];
		level?: number;
	}

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	const menusData = $derived(data.menus as unknown as Menu[]);

	let modalMode = $state<'add' | 'edit' | null>(null);
	let selectedMenu = $state<Partial<Menu> | null>(null);
	let menuToDelete = $state<Menu | null>(null);
	let isLoading = $state(false);
	let globalMessage = $state<{ success: boolean; text: string } | null>(null);
	let messageTimeout: NodeJS.Timeout;

	const selectableParents = $derived(
		menusData
			.filter(
				(m: Menu) =>
					m.id !== selectedMenu?.id &&
					(!selectedMenu?.id || !isAncestor(m, selectedMenu.id!, menusData))
			)
			.sort((a: Menu, b: Menu) => a.order - b.order)
	);

	function isAncestor(potentialParent: Menu, childId: number, allMenus: Menu[]): boolean {
		let currentParentId = potentialParent.parent_id;

		const menuMap = new Map(allMenus.map((m) => [m.id, m]));

		while (currentParentId !== null) {
			if (currentParentId === childId) {
				return true;
			}
			const parentMenu = menuMap.get(currentParentId);
			currentParentId = parentMenu ? parentMenu.parent_id : null;
		}
		return false;
	}

	function renderMenuRows(menus: Menu[], level: number = 0) {
		const rows: Menu[] = [];
		const menuMap = new Map<number, Menu>();

		menus.forEach((menu: Menu) => {
			const menuCopy: Menu = { ...menu, children: [] as Menu[] };
			menuMap.set(menuCopy.id, menuCopy);
		});

		const rootItems: Menu[] = [];
		menuMap.forEach((menu) => {
			if (menu.parent_id && menuMap.has(menu.parent_id)) {
				const parent = menuMap.get(menu.parent_id);
				if (parent && parent.children) {
					parent.children.push(menu);
				} else {
					rootItems.push(menu);
				}
			} else {
				rootItems.push(menu);
			}
		});

		const sortMenus = (menuList: Menu[]) => {
			menuList.sort((a: Menu, b: Menu) => a.order - b.order);

			menuList.forEach((menu: Menu) => {
				if (menu.children && menu.children.length > 0) {
					sortMenus(menu.children);
				}
			});
		};
		sortMenus(rootItems);

		function flatten(menuList: Menu[], currentLevel: number) {
			menuList.forEach((menu: Menu) => {
				const menuWithLevel: Menu = { ...menu, level: currentLevel };
				rows.push(menuWithLevel);

				if (menu.children && menu.children.length > 0) {
					flatten(menu.children, currentLevel + 1);
				}
			});
		}
		flatten(rootItems, 0);

		return rows;
	}

	const displayMenus = $derived(renderMenuRows(menusData));

	function openModal(mode: 'add' | 'edit', menu: Menu | null = null) {
		modalMode = mode;

		if (mode === 'edit' && menu) {
			const originalMenu = menusData.find((m: Menu) => m.id === menu.id);

			selectedMenu = { ...menu, parent_id: originalMenu?.parent_id ?? null };
		} else {
			const maxOrder = menusData.length > 0 ? Math.max(...menusData.map((m: Menu) => m.order)) : 0;
			selectedMenu = {
				title: '',
				order: maxOrder + 1,
				parent_id: null,
				route: null,
				icon: null,
				permission_name: null
			};
		}
	}

	function closeModal() {
		modalMode = null;
		selectedMenu = null;
	}

	function showGlobalMessage(success: boolean, text: string) {
		clearTimeout(messageTimeout);
		globalMessage = { success, text };

		messageTimeout = setTimeout(() => {
			globalMessage = null;
		}, 5000);
	}

	$effect.pre(() => {
		if (form?.success) {
			closeModal();
			showGlobalMessage(true, form.message as string);
			setTimeout(() => window.location.reload(), 100);
			form.success = false;
		} else if (form?.message && form.action) {
			showGlobalMessage(false, form.message as string);
			form.action = undefined;
		}
	});
</script>

<svelte:head>
	<title>{$t('Menu Management')}</title>
</svelte:head>

{#if globalMessage}
	<div
		transition:fade
		class="fixed top-4 right-4 z-[70] max-w-sm rounded-lg p-4 text-sm font-semibold shadow-xl {globalMessage.success
			? 'bg-green-100 text-green-800'
			: 'bg-red-100 text-red-800'}"
	>
		<p>{globalMessage.text}</p>
	</div>
{/if}

<div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
	<div>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Menu Management')}</h1>
		<p class="mt-1 text-sm text-gray-500">
			{$t("Organize the application's navigation sidebar.")}
			{$t('(Supports Sub Menus)')}
		</p>
	</div>
	<button
		onclick={() => openModal('add')}
		class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
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
		{$t('Add New Menu Item')}
	</button>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="w-1/3 px-4 py-3 text-left font-semibold tracking-wider text-gray-600 uppercase"
					>{$t('Title')}</th
				>
				<th class="px-4 py-3 text-left font-semibold tracking-wider text-gray-600 uppercase"
					>{$t('Route')}</th
				>
				<th class="px-4 py-3 text-left font-semibold tracking-wider text-gray-600 uppercase"
					>{$t('Required Permission')}</th
				>
				<th class="px-4 py-3 text-left font-semibold tracking-wider text-gray-600 uppercase"
					>{$t('Order')}</th
				>
				<th class="px-4 py-3 text-left font-semibold tracking-wider text-gray-600 uppercase"
					>{$t('Actions')}</th
				>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if displayMenus.length === 0}
				<tr>
					<td colspan="5" class="py-12 text-center text-gray-500">{$t('No menu items found.')}</td>
				</tr>
			{:else}
				{#each displayMenus as menu (menu.id)}
					<tr
						class="transition-colors hover:bg-gray-50 {(menu.level ?? 0) > 0
							? 'bg-gray-50/70'
							: ''}"
					>
						<td class="px-4 py-3 font-medium text-gray-900">
							<div class="flex items-center" style="padding-left: {(menu.level ?? 0) * 1.5}rem;">
								{#if (menu.level ?? 0) > 0}
									<span class="mr-2 text-gray-400">↳</span>
								{:else if menu.children && menu.children.length > 0}
									<span class="mr-2 text-gray-400">📁</span>
								{/if}
								{menu.title}
							</div>
						</td>
						<td class="px-4 py-3 font-mono text-xs text-gray-600">{menu.route ?? 'N/A'}</td>
						<td class="px-4 py-3 text-gray-600">{menu.permission_name ?? $t('(Public)')}</td>
						<td class="px-4 py-3 font-mono text-gray-600">{menu.order}</td>
						<td class="px-4 py-3 whitespace-nowrap">
							<div class="flex items-center gap-2">
								<button
									onclick={() => openModal('edit', menu)}
									class="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-yellow-600"
									aria-label={$t('Edit menu')}
									title={$t('Edit')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="20"
										height="20"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
									>
								</button>
								<button
									onclick={() => (menuToDelete = menu)}
									class="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600"
									aria-label={$t('Delete menu')}
									title={$t('Delete')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="20"
										height="20"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
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

{#if modalMode && selectedMenu}
	<div
		transition:slide={{ duration: 200 }}
		class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16 backdrop-blur-sm"
	>
		<div class="fixed inset-0" onclick={closeModal} role="presentation"></div>
		<div class="relative w-full max-w-lg transform rounded-xl bg-white shadow-2xl">
			<div class="border-b px-6 py-4">
				<h2 class="text-lg font-bold text-gray-900">
					{modalMode === 'add' ? $t('Add Menu Item') : $t('Edit Menu Item')}
				</h2>
			</div>
			<form
				method="POST"
				action="?/saveMenu"
				use:enhance={() => {
					isLoading = true;
					return async ({ update }) => {
						await update();
						isLoading = false;
					};
				}}
			>
				<div class="max-h-[70vh] space-y-5 overflow-y-auto p-6">
					{#if modalMode === 'edit'}<input type="hidden" name="id" value={selectedMenu.id} />{/if}

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="title" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Title *')}</label
							>
							<input
								type="text"
								name="title"
								id="title"
								required
								bind:value={selectedMenu.title}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>
						<div>
							<label for="order" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Order *')}</label
							>
							<input
								type="number"
								name="order"
								id="order"
								required
								bind:value={selectedMenu.order}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>
					</div>

					<div>
						<label for="parent_id" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('Parent Menu (For creating Sub Menus)')}</label
						>
						<select
							name="parent_id"
							id="parent_id"
							bind:value={selectedMenu.parent_id}
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
						>
							<option value={null}>{$t('-- None (Root Level) --')}</option>
							{#each selectableParents as menu}
								<option value={menu.id}>{menu.title}</option>
							{/each}
						</select>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="icon" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Icon Name')}</label
							>
							<input
								type="text"
								name="icon"
								id="icon"
								bind:value={selectedMenu.icon}
								placeholder={$t('e.g., assets, settings')}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
							<p class="mt-1 text-xs text-gray-500">
								{$t('Use names from')}
								<a
									href="https://fonts.google.com/icons"
									target="_blank"
									rel="noopener noreferrer"
									class="font-semibold text-blue-600 hover:underline"
								>
									{$t('Material Icons')}
								</a>
							</p>
						</div>
						<div>
							<label for="route" class="mb-1 block text-sm font-semibold text-gray-700"
								>{$t('Route')}</label
							>
							<input
								type="text"
								name="route"
								id="route"
								bind:value={selectedMenu.route}
								placeholder="/customers"
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>
					</div>

					<div>
						<label for="permission_name" class="mb-1 block text-sm font-semibold text-gray-700"
							>{$t('Required Permission')}</label
						>
						<select
							name="permission_name"
							id="permission_name"
							bind:value={selectedMenu.permission_name}
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
						>
							<option value={null}>{$t('-- None (Public) --')}</option>
							{#each data.availablePermissions as permission}
								<option value={permission}>{permission}</option>
							{/each}
						</select>
					</div>

					{#if form?.message && !form.success && form.action === 'saveMenu'}
						<div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
							<p><strong>{$t('Error:')}</strong> {form.message}</p>
						</div>
					{/if}
				</div>
				<div
					class="flex justify-end gap-3 rounded-b-xl border-t border-gray-200 bg-gray-50 px-6 py-4"
				>
					<button
						type="button"
						onclick={closeModal}
						class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
					>
						{$t('Cancel')}
					</button>
					<button
						type="submit"
						disabled={isLoading}
						class="rounded-md bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-70"
					>
						{#if isLoading}
							{$t('Saving...')}
						{:else}
							{$t('Save Menu')}
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if menuToDelete}
	{@const childrenCount = menusData.filter((m: Menu) => m.parent_id === menuToDelete!.id).length}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
	>
		<div class="animate-in fade-in zoom-in-95 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
			<div
				class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="h-6 w-6"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/></svg
				>
			</div>
			<h3 class="text-center text-lg font-bold text-gray-900">{$t('Confirm Deletion')}</h3>
			<p class="mt-2 text-center text-sm text-gray-600">
				{$t('Are you sure you want to delete "')}<strong class="text-gray-900"
					>{menuToDelete.title}</strong
				>"?
				{#if childrenCount > 0}
					<br />
					<span class="font-semibold text-red-600">
						{$t('This will also delete all')}
						{childrenCount}
						{$t('sub-menus under it.')}
					</span>
				{/if}
			</p>
			<form
				method="POST"
				action="?/deleteMenu"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						menuToDelete = null;
					};
				}}
				class="mt-6 flex justify-center gap-3"
			>
				<input type="hidden" name="id" value={menuToDelete.id} />
				<button
					type="button"
					onclick={() => (menuToDelete = null)}
					class="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
				>
					{$t('Cancel')}
				</button>
				<button
					type="submit"
					class="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-red-700"
				>
					{$t('Delete')}
				</button>
			</form>
		</div>
	</div>
{/if}
