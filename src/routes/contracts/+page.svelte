<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { slide, fade } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import Select from 'svelte-select'; // [NEW] นำเข้า Select
	import { browser } from '$app/environment'; // [NEW] นำเข้า browser

	// --- Types ---
	type Customer = { id: number; name: string };
	type ContractType = { id: number; name: string };
	type User = { id: number; username: string };
	type ContractDocument = {
		id: number;
		name: string;
		system_name: string;
		version: number;
		uploaded_at: string | Date;
	};
	type Contract = {
		id?: number;
		title: string;
		contract_number: string | null;
		customer_id: number | null;
		owner_user_id: number | null;
		contract_type_id: number | null;
		start_date: string | Date | null;
		end_date: string | Date | null;
		contract_value: number | null;
		status: string;
		customer_name?: string;
		type_name?: string;
		documents: ContractDocument[];
	};

	// --- Props & State (Svelte 5) ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	let contracts = $state<Contract[]>(data.contracts || []);
	let customers = $state<Customer[]>(data.customers || []);
	let users = $state<User[]>(data.users || []);
	let contractTypes = $state<ContractType[]>(data.contractTypes || []);

	let modalElement = $state<HTMLDialogElement | null>(null);
	let isEditing = $state(false);
	let isLoading = $state(false);
	let formError = $state<string | null>(null);

	// --- [NEW] Logic สำหรับ Searchable Dropdowns ---
	const customerOptions = $derived(
		customers.map((c: Customer) => ({ value: c.id, label: c.name }))
	);
	const contractTypeOptions = $derived(
		contractTypes.map((ct: ContractType) => ({ value: ct.id, label: ct.name }))
	);

	let selectedCustomerObj = $state<any>(null);
	let selectedContractTypeObj = $state<any>(null);

	function handleCustomerChange(event: any) {
		const selected = event?.detail || null;
		selectedCustomerObj = selected;
		currentContract.customer_id = selected ? selected.value : null;
	}

	function handleContractTypeChange(event: any) {
		const selected = event?.detail || null;
		selectedContractTypeObj = selected;
		currentContract.contract_type_id = selected ? selected.value : null;
	}

	// --- Contract Form State ---
	const createEmptyContract = (): Contract => ({
		title: '',
		contract_number: '',
		customer_id: null,
		contract_type_id: null,
		status: 'Draft',
		start_date: new Date().toISOString().split('T')[0],
		end_date: '',
		contract_value: null,
		owner_user_id: null,
		documents: []
	});

	let currentContract = $state<Contract>(createEmptyContract());
	let fileInput = $state<HTMLInputElement | null>(null);

	// State สำหรับการกรองตาราง
	let filterStatus = $state('');
	let filterCustomer = $state('');
	let filterSearch = $state('');

	const filteredContracts = $derived.by(() => {
		let filtered = contracts;
		if (filterStatus) filtered = filtered.filter((c) => c.status === filterStatus);
		if (filterCustomer)
			filtered = filtered.filter((c) => c.customer_id === parseInt(filterCustomer));
		if (filterSearch) {
			const lowerSearch = filterSearch.toLowerCase();
			filtered = filtered.filter(
				(c) =>
					c.title.toLowerCase().includes(lowerSearch) ||
					c.contract_number?.toLowerCase().includes(lowerSearch) ||
					c.customer_name?.toLowerCase().includes(lowerSearch)
			);
		}
		return filtered;
	});

	// --- Functions ---
	function openAddModal() {
		isEditing = false;
		currentContract = createEmptyContract();
		selectedCustomerObj = null;
		selectedContractTypeObj = null;
		formError = null;
		if (fileInput) fileInput.value = '';
		modalElement?.showModal();
	}

	function openEditModal(contract: Contract) {
		isEditing = true;
		currentContract = {
			...contract,
			start_date: contract.start_date
				? new Date(contract.start_date).toISOString().split('T')[0]
				: '',
			end_date: contract.end_date ? new Date(contract.end_date).toISOString().split('T')[0] : ''
		};

		// ตั้งค่าเริ่มต้นให้ Searchable Dropdowns
		selectedCustomerObj = customerOptions.find((opt: any) => opt.value === contract.customer_id);
		selectedContractTypeObj = contractTypeOptions.find(
			(opt: any) => opt.value === contract.contract_type_id
		);

		formError = null;
		if (fileInput) fileInput.value = '';
		modalElement?.showModal();
	}

	function closeModal() {
		modalElement?.close();
	}

	const Icon = {
		plus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>`,
		edit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 1 10 6H4.75A.25.25 0 0 0 4.5 6.25v10.5c0 .138.112.25.25.25h10.5A.25.25 0 0 0 15.5 16V9a.75.75 0 0 1 1.5 0v7A1.75 1.75 0 0 1 15.25 17.75H4.75A1.75 1.75 0 0 1 3 16V5.75Z" /></svg>`,
		delete: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.566 19h4.868a2.75 2.75 0 0 0 2.71-2.529l.841-10.518.149.022a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75a1.25 1.25 0 0 0-1.25-1.25h-2.5A1.25 1.25 0 0 0 7.5 3.75v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.84 0a.75.75 0 0 1-1.5-.06l-.3 7.5a.75.75 0 1 1 1.5.06l.3-7.5Z" clip-rule="evenodd" /></svg>`,
		search: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd" /></svg>`,
		download: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v5.19L7.47 8.22a.75.75 0 0 0-1.06 1.06l3.25 3.25a.75.75 0 0 0 1.06 0l3.25-3.25a.75.75 0 1 0-1.06-1.06l-1.78 1.78V4.75Z" /><path d="M4.5 14.5a.75.75 0 0 1 .75-.75h10a.75.75 0 0 1 0 1.5h-10a.75.75 0 0 1-.75-.75Zm-2 2.5a.75.75 0 0 1 .75-.75H16.5a.75.75 0 0 1 0 1.5H3.25a.75.75 0 0 1-.75-.75Z" /></svg>`
	};

	$effect(() => {
		if (form) {
			if (form.error) {
				formError = form.error as string;
				isLoading = false;
				if (form.source === 'cud') modalElement?.showModal();
			}
			if (form.success) {
				if (form.source === 'delete') {
					contracts = contracts.filter((c) => c.id !== form.deletedId);
				} else if (form.source === 'cud') {
					const newOrUpdated = (form.newContract || form.updatedContract) as Contract;
					if (newOrUpdated) {
						if (isEditing) {
							contracts = contracts.map((c) => (c.id === newOrUpdated.id ? newOrUpdated : c));
						} else {
							contracts = [newOrUpdated, ...contracts];
						}
					}
					closeModal();
				}
				invalidateAll();
			}
		}
	});
</script>

<svelte:head>
	<title>ระบบจัดการสัญญา</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-6 font-sans">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-3xl font-bold text-gray-800">ระบบจัดการสัญญา (Contract Management)</h1>
		<button
			onclick={openAddModal}
			class="flex transform items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white shadow-md transition duration-300 hover:-translate-y-0.5 hover:bg-blue-700"
			aria-label="เพิ่มสัญญาใหม่"
		>
			{@html Icon.plus}
			<span>เพิ่มสัญญาใหม่</span>
		</button>
	</div>

	<div class="mb-6 grid grid-cols-1 gap-4 rounded-lg bg-white p-4 shadow md:grid-cols-3">
		<div class="relative">
			<label for="search" class="mb-1 block text-sm font-medium text-gray-700">ค้นหา</label>
			<input
				type="text"
				id="search"
				bind:value={filterSearch}
				placeholder="ค้นหาชื่อ, เลขที่, หรือลูกค้า..."
				class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 focus:border-blue-500 focus:ring-blue-500"
			/>
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pt-6 pl-3">
				{@html Icon.search}
			</div>
		</div>
		<div>
			<label for="filterStatus" class="mb-1 block text-sm font-medium text-gray-700">สถานะ</label>
			<select
				id="filterStatus"
				bind:value={filterStatus}
				class="w-full rounded-lg border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
			>
				<option value="">-- ทุกสถานะ --</option>
				<option value="Draft">Draft</option>
				<option value="In Review">In Review</option>
				<option value="Active">Active</option>
				<option value="Expired">Expired</option>
				<option value="Terminated">Terminated</option>
			</select>
		</div>
		<div>
			<label for="filterCustomer" class="mb-1 block text-sm font-medium text-gray-700">ลูกค้า</label
			>
			<select
				id="filterCustomer"
				bind:value={filterCustomer}
				class="w-full rounded-lg border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
			>
				<option value="">-- ทุกลูกค้า --</option>
				{#each customers as customer (customer.id)}
					<option value={customer.id}>{customer.name}</option>
				{/each}
			</select>
		</div>
	</div>

	<div class="overflow-x-auto rounded-lg bg-white shadow-lg">
		<table class="min-w-full divide-y divide-gray-200">
			<thead class="bg-gray-100">
				<tr>
					<th class="px-6 py-3 text-left text-xs font-bold tracking-wider text-gray-600 uppercase"
						>ชื่อสัญญา</th
					>
					<th class="px-6 py-3 text-left text-xs font-bold tracking-wider text-gray-600 uppercase"
						>ลูกค้า</th
					>
					<th class="px-6 py-3 text-left text-xs font-bold tracking-wider text-gray-600 uppercase"
						>ประเภท</th
					>
					<th class="px-6 py-3 text-left text-xs font-bold tracking-wider text-gray-600 uppercase"
						>สถานะ</th
					>
					<th class="px-6 py-3 text-left text-xs font-bold tracking-wider text-gray-600 uppercase"
						>วันเริ่มต้น</th
					>
					<th class="px-6 py-3 text-left text-xs font-bold tracking-wider text-gray-600 uppercase"
						>วันสิ้นสุด</th
					>
					<th class="px-6 py-3 text-left text-xs font-bold tracking-wider text-gray-600 uppercase"
						>เอกสาร</th
					>
					<th class="px-6 py-3 text-center text-xs font-bold tracking-wider text-gray-600 uppercase"
						>จัดการ</th
					>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#each filteredContracts as contract (contract.id)}
					<tr class="transition-colors hover:bg-gray-50">
						<td class="px-6 py-4 whitespace-nowrap">
							<div class="text-sm font-medium text-gray-900">{contract.title}</div>
							<div class="text-xs text-gray-500">{contract.contract_number}</div>
						</td>
						<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-700"
							>{contract.customer_name ?? '-'}</td
						>
						<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-700"
							>{contract.type_name ?? '-'}</td
						>
						<td class="px-6 py-4 whitespace-nowrap">
							<span
								class="inline-flex rounded-full px-3 py-1 text-xs leading-5 font-semibold {contract.status ===
								'Draft'
									? 'bg-yellow-100 text-yellow-800'
									: contract.status === 'Active'
										? 'bg-green-100 text-green-800'
										: 'bg-red-100 text-red-800'}"
							>
								{contract.status}
							</span>
						</td>
						<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-700"
							>{contract.start_date
								? new Date(contract.start_date).toLocaleDateString('th-TH')
								: '-'}</td
						>
						<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-700"
							>{contract.end_date
								? new Date(contract.end_date).toLocaleDateString('th-TH')
								: '-'}</td
						>
						<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-700"
							>{contract.documents.length} ไฟล์</td
						>
						<td class="px-6 py-4 text-center text-sm font-medium whitespace-nowrap">
							<div class="flex items-center justify-center gap-2">
								<button
									onclick={() => openEditModal(contract)}
									class="text-blue-600 transition hover:text-blue-900"
									aria-label="แก้ไขสัญญา">{@html Icon.edit}</button
								>
								<form
									method="POST"
									action="?/delete"
									use:enhance
									onsubmit={(e) => {
										if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบสัญญานี้?')) e.preventDefault();
									}}
								>
									<input type="hidden" name="id" value={contract.id} />
									<button
										type="submit"
										class="text-red-600 transition hover:text-red-900"
										aria-label="ลบสัญญา">{@html Icon.delete}</button
									>
								</form>
							</div>
						</td>
					</tr>
				{:else}
					<tr
						><td colspan="8" class="px-6 py-12 text-center text-gray-500">ไม่พบข้อมูลสัญญา...</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<dialog
	bind:this={modalElement}
	class="w-full max-w-4xl rounded-lg p-0 shadow-2xl backdrop:bg-black/50"
>
	<form
		method="POST"
		enctype="multipart/form-data"
		action={isEditing ? '?/update' : '?/create'}
		use:enhance={() => {
			isLoading = true;
			formError = null;
			return async ({ update }) => {
				await update({ reset: false });
				isLoading = false;
			};
		}}
		class="p-6"
	>
		<h2 class="mb-6 text-2xl font-bold text-gray-800">
			{isEditing ? 'แก้ไขสัญญา' : 'เพิ่มสัญญาใหม่'}
		</h2>
		{#if formError}<div
				class="relative mb-4 rounded-lg border border-red-400 bg-red-100 px-4 py-3 text-red-700"
				transition:slide
			>
				<strong>Error:</strong>
				{formError}
			</div>{/if}
		{#if isEditing}<input type="hidden" name="id" value={currentContract.id} />{/if}

		<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
			<div class="space-y-4 lg:col-span-2">
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div>
						<label for="title" class="block text-sm font-medium text-gray-700">ชื่อสัญญา *</label
						><input
							type="text"
							id="title"
							name="title"
							bind:value={currentContract.title}
							required
							class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
						/>
					</div>
					<div>
						<label for="contract_number" class="block text-sm font-medium text-gray-700"
							>เลขที่สัญญา</label
						><input
							type="text"
							id="contract_number"
							name="contract_number"
							bind:value={currentContract.contract_number}
							class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div>
						<label for="customer_id" class="block text-sm font-medium text-gray-700">ลูกค้า *</label
						>
						<input type="hidden" name="customer_id" value={currentContract.customer_id} />
						<Select
							items={customerOptions}
							value={selectedCustomerObj}
							on:change={handleCustomerChange}
							on:clear={() => handleCustomerChange(null)}
							placeholder="-- ค้นหา/เลือกลูกค้า --"
							floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
							container={browser ? document.body : null}
							--inputStyles="padding: 2px 0; font-size: 0.875rem;"
							--list="border-radius: 6px; font-size: 0.875rem;"
							--itemIsActive="background: #e0f2fe;"
						/>
					</div>
					<div>
						<label for="contract_type_id" class="block text-sm font-medium text-gray-700"
							>ประเภทสัญญา *</label
						>
						<input type="hidden" name="contract_type_id" value={currentContract.contract_type_id} />
						<Select
							items={contractTypeOptions}
							value={selectedContractTypeObj}
							on:change={handleContractTypeChange}
							on:clear={() => handleContractTypeChange(null)}
							placeholder="-- ค้นหา/เลือกประเภท --"
							floatingConfig={{ placement: 'bottom-start', strategy: 'fixed' }}
							container={browser ? document.body : null}
							--inputStyles="padding: 2px 0; font-size: 0.875rem;"
							--list="border-radius: 6px; font-size: 0.875rem;"
							--itemIsActive="background: #e0f2fe;"
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div>
						<label for="status" class="block text-sm font-medium text-gray-700">สถานะ *</label>
						<select
							id="status"
							name="status"
							bind:value={currentContract.status}
							required
							class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
						>
							<option value="Draft">Draft</option><option value="In Review">In Review</option
							><option value="Active">Active</option><option value="Expired">Expired</option><option
								value="Terminated">Terminated</option
							>
						</select>
					</div>
					<div>
						<label for="contract_value" class="block text-sm font-medium text-gray-700"
							>มูลค่าสัญญา (บาท)</label
						><input
							type="number"
							step="0.01"
							id="contract_value"
							name="contract_value"
							bind:value={currentContract.contract_value}
							class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div>
						<label for="start_date" class="block text-sm font-medium text-gray-700"
							>วันเริ่มต้น</label
						><input
							type="date"
							id="start_date"
							name="start_date"
							bind:value={currentContract.start_date}
							class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
						/>
					</div>
					<div>
						<label for="end_date" class="block text-sm font-medium text-gray-700">วันสิ้นสุด</label
						><input
							type="date"
							id="end_date"
							name="end_date"
							bind:value={currentContract.end_date}
							class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
						/>
					</div>
				</div>

				<div>
					<label for="owner_user_id" class="block text-sm font-medium text-gray-700"
						>ผู้รับผิดชอบ</label
					>
					<select
						id="owner_user_id"
						name="owner_user_id"
						bind:value={currentContract.owner_user_id}
						class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
					>
						<option value={null}>-- ไม่ระบุ --</option>
						{#each users as user (user.id)}<option value={user.id}>{user.username}</option>{/each}
					</select>
				</div>

				<div class="pt-2">
					<label for="contractFiles" class="block text-sm font-medium text-gray-700"
						>ไฟล์เอกสารสัญญา {#if !isEditing}<span class="text-red-500">*</span>{/if}</label
					>
					<input
						type="file"
						id="contractFiles"
						name="contractFiles"
						multiple
						accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png"
						class="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
					/>
				</div>
			</div>

			<div class="max-h-96 overflow-y-auto rounded-lg border bg-gray-50 p-4 lg:col-span-1">
				<h3 class="mb-3 text-lg font-semibold text-gray-700">
					เอกสารที่อัปโหลดแล้ว ({currentContract.documents.length})
				</h3>
				{#if currentContract.documents.length > 0}
					<ul class="space-y-3">
						{#each currentContract.documents as doc (doc.id)}
							<li
								class="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 text-sm"
							>
								<div class="mr-2 truncate">
									<div class="truncate font-medium text-gray-800">{doc.name}</div>
									<div class="text-xs text-gray-500">
										เวอร์ชัน: {doc.version} | {new Date(doc.uploaded_at).toLocaleDateString(
											'th-TH'
										)}
									</div>
								</div>
								<a
									href="/uploads/contracts/{doc.system_name}"
									target="_blank"
									rel="noopener noreferrer"
									download={doc.name}
									class="rounded-full p-1 text-green-600 transition hover:bg-green-50 hover:text-green-800"
									aria-label="ดาวน์โหลดไฟล์">{@html Icon.download}</a
								>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-gray-500 italic">ยังไม่มีเอกสารอัปโหลด</p>
				{/if}
			</div>
		</div>

		<div class="mt-8 flex justify-end gap-4 border-t border-gray-200 pt-4">
			<button
				type="button"
				onclick={closeModal}
				class="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 transition hover:bg-gray-300"
				>ยกเลิก</button
			>
			<button
				type="submit"
				disabled={isLoading}
				class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white shadow-md transition hover:bg-blue-700 disabled:bg-gray-400"
			>
				{#if isLoading}<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
					></div>
					<span>กำลังบันทึก...</span>{:else}{@html Icon.plus}<span
						>{isEditing ? 'บันทึกการเปลี่ยนแปลง' : 'สร้างสัญญา'}</span
					>{/if}
			</button>
		</div>
	</form>
</dialog>

<style>
	dialog.max-w-4xl {
		margin: 4rem auto 0;
		overflow-y: auto;
		max-height: calc(100vh - 8rem);
	}
	@media (max-width: 768px) {
		dialog.max-w-4xl {
			margin-top: 2rem;
			width: calc(100% - 2rem);
			max-height: calc(100vh - 4rem);
		}
	}

	:global(div.svelte-select) {
		min-height: 38px;
		border: 1px solid #d1d5db !important;
		border-radius: 0.375rem !important;
		margin-top: 0.25rem;
	}
	:global(div.svelte-select .input) {
		font-size: 0.875rem;
	}
	:global(div.svelte-select .list) {
		border-radius: 0.375rem;
		border-color: #d1d5db;
		z-index: 9999 !important;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}
</style>
