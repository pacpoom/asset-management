<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { slide } from 'svelte/transition';

	// --- Svelte 4 Props ---
	// รับข้อมูลเริ่มต้นจาก +page.server.ts
	export let data: PageData;
	export let form: ActionData | undefined = undefined;

	// --- Svelte 4 State ---
	// ข้อมูลหลัก (เราจะ re-assign ตัวแปร contracts เมื่อมีการ CUD)
	// **ปรับปรุง: เพิ่ม documents เข้าไปในโครงสร้างสัญญา**
	let contracts = data.contracts || [];
	let customers = data.customers || [];
	let users = data.users || [];
	let contractTypes = data.contractTypes || [];

	// State สำหรับ Modal และ Form
	let modalElement: HTMLDialogElement | null = null;
	let isEditing = false;
	let isLoading = false; // สำหรับแสดงสถานะตอนอัปโหลด
	let formError: string | null = form?.error || null;

	// Stateสำหรับ Contract ที่กำลังจะเพิ่มหรือแก้ไข
	const createEmptyContract = () => ({
		id: undefined,
		title: '',
		contract_number: '',
		customer_id: null,
		contract_type_id: null,
		status: 'Draft',
		start_date: new Date().toISOString().split('T')[0],
		end_date: '',
		contract_value: null,
		owner_user_id: null,
		renewal_notice_days: 30,
		documents: [] // เพิ่ม documents field
	});

	let currentContract = createEmptyContract();
	let fileInput: HTMLInputElement | null = null;

	// State สำหรับการกรอง
	let filterStatus = '';
	let filterCustomer = '';
	let filterSearch = '';

	// --- Derived State (Svelte 4) ---
	// กรองข้อมูลสัญญาแบบ Real-time
	$: filteredContracts = (() => {
		let filtered = contracts;

		if (filterStatus) {
			filtered = filtered.filter((c) => c.status === filterStatus);
		}
		if (filterCustomer) {
			// @ts-ignore
			filtered = filtered.filter((c) => c.customer_id === parseInt(filterCustomer));
		}
		if (filterSearch) {
			const lowerSearch = filterSearch.toLowerCase();
			filtered = filtered.filter(
				// @ts-ignore
				(c) =>
					c.title.toLowerCase().includes(lowerSearch) ||
					c.contract_number?.toLowerCase().includes(lowerSearch) ||
					c.customer_name?.toLowerCase().includes(lowerSearch)
			);
		}
		return filtered;
	})();

	// --- Functions ---
	function openAddModal() {
		isEditing = false;
		currentContract = createEmptyContract();
		formError = null;
		if (fileInput) fileInput.value = ''; // เคลียร์ไฟล์เก่า
		modalElement?.showModal();
	}

	function openEditModal(contract: (typeof contracts)[0]) {
		isEditing = true;
		// แปลงค่า null เป็น '' และจัดรูปแบบวันที่
		currentContract = {
			...createEmptyContract(), // ใช้ค่า default
			...contract, // ทับด้วยค่าจริง
			// @ts-ignore
			customer_id: contract.customer_id ?? null,
			// @ts-ignore
			contract_type_id: contract.contract_type_id ?? null,
			// @ts-ignore
			contract_value: contract.contract_value ?? null,
			// @ts-ignore
			owner_user_id: contract.owner_user_id ?? null,
			// @ts-ignore
			contract_number: contract.contract_number ?? '',
			// @ts-ignore
			start_date: contract.start_date ? new Date(contract.start_date).toISOString().split('T')[0] : '',
			// @ts-ignore
			end_date: contract.end_date ? new Date(contract.end_date).toISOString().split('T')[0] : '',
			// @ts-ignore
			documents: contract.documents || [] // โหลดเอกสารที่มีอยู่
		};
		formError = null;
		if (fileInput) fileInput.value = ''; // เคลียร์ไฟล์เก่า
		modalElement?.showModal();
	}

	function closeModal() {
		modalElement?.close();
	}

	// --- *** FIX: ลบฟังก์ชัน downloadDocument ที่ไม่จำเป็นออก *** ---
	// function downloadDocument(document: any) { ... }

	// ไอคอน SVG (ใช้แทน icon library)
	const Icon = {
		plus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>`,
		edit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 1 10 6H4.75A.25.25 0 0 0 4.5 6.25v10.5c0 .138.112.25.25.25h10.5A.25.25 0 0 0 15.5 16V9a.75.75 0 0 1 1.5 0v7A1.75 1.75 0 0 1 15.25 17.75H4.75A1.75 1.75 0 0 1 3 16V5.75Z" /></svg>`,
		delete: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.566 19h4.868a2.75 2.75 0 0 0 2.71-2.529l.841-10.518.149.022a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75a1.25 1.25 0 0 0-1.25-1.25h-2.5A1.25 1.25 0 0 0 7.5 3.75v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.84 0a.75.75 0 0 1-1.5-.06l-.3 7.5a.75.75 0 1 1 1.5.06l.3-7.5Z" clip-rule="evenodd" /></svg>`,
		search: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd" /></svg>`,
		download: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v5.19L7.47 8.22a.75.75 0 0 0-1.06 1.06l3.25 3.25a.75.75 0 0 0 1.06 0l3.25-3.25a.75.75 0 1 0-1.06-1.06l-1.78 1.78V4.75Z" /><path d="M4.5 14.5a.75.75 0 0 1 .75-.75h10a.75.75 0 0 1 0 1.5h-10a.75.75 0 0 1-.75-.75Zm-2 2.5a.75.75 0 0 1 .75-.75H16.5a.75.75 0 0 1 0 1.5H3.25a.75.75 0 0 1-.75-.75Z" /></svg>`
	};

	// --- Svelte 4 Reactive Effect (แทน $effect) ---
	// ใช้ $: {} เพื่อ react กับการเปลี่ยนแปลงของ `form` prop ที่มาจาก server
	$: {
		if (form) {
			if (form.error) {
				formError = form.error;
				isLoading = false; // หยุด loading ถ้ามี error
				// ถ้า error เกิดจากการ CUD, ให้เปิด modal ค้างไว้
				if (form.source === 'cud') {
					modalElement?.showModal();
				}
			}
			if (form.success) {
				if (form.source === 'delete') {
					// อัปเดต state เมื่อลบสำเร็จ (Svelte 4 re-assignment)
					contracts = contracts.filter((c) => c.id !== form.deletedId);
				} else if (form.source === 'cud') {
					// CUD สำเร็จ
					const newOrUpdated = form.newContract || form.updatedContract;
					if (newOrUpdated) {
						if (isEditing) {
							// อัปเดตสัญญาใน list
							contracts = contracts.map((c) => (c.id === newOrUpdated.id ? newOrUpdated : c));
						} else {
							// เพิ่มสัญญาใหม่ใน list
							contracts = [newOrUpdated, ...contracts];
						}
					}
					closeModal();
				}
			}
		}
	}
</script>

<svelte:head>
	<title>ระบบจัดการสัญญา</title>
</svelte:head>

<div class="p-6 bg-gray-50 min-h-screen font-sans">
	<!-- Header -->
	<div class="flex justify-between items-center mb-6">
		<h1 class="text-3xl font-bold text-gray-800">ระบบจัดการสัญญา (Contract Management)</h1>
		<button
			onclick={openAddModal}
			class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition duration-300 transform hover:-translate-y-0.5"
		>
			{@html Icon.plus}
			<span>เพิ่มสัญญาใหม่</span>
		</button>
	</div>

	<!-- Filters -->
	<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-white rounded-lg shadow">
		<div class="relative">
			<label for="search" class="block text-sm font-medium text-gray-700 mb-1">ค้นหา</label>
			<input
				type="text"
				id="search"
				bind:value={filterSearch}
				placeholder="ค้นหาชื่อ, เลขที่, หรือลูกค้า..."
				class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
			/>
			<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none pt-6">
				{@html Icon.search}
			</div>
		</div>
		<div>
			<label for="filterStatus" class="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
			<select
				id="filterStatus"
				bind:value={filterStatus}
				class="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
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
			<label for="filterCustomer" class="block text-sm font-medium text-gray-700 mb-1"
				>ลูกค้า</label
			>
			<select
				id="filterCustomer"
				bind:value={filterCustomer}
				class="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
			>
				<option value="">-- ทุกลูกค้า --</option>
				{#each customers as customer (customer.id)}
					<option value={customer.id}>{customer.name}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- Contracts Table -->
	<div class="bg-white shadow-lg rounded-lg overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200">
			<thead class="bg-gray-100">
				<tr>
					<th
						scope="col"
						class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider"
						>ชื่อสัญญา</th
					>
					<th
						scope="col"
						class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider"
						>ลูกค้า</th
					>
					<th
						scope="col"
						class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider"
						>ประเภท</th
					>
					<th
						scope="col"
						class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider"
						>สถานะ</th
					>
					<th
						scope="col"
						class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider"
						>วันเริ่มต้น</th
					>
					<th
						scope="col"
						class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider"
						>วันสิ้นสุด</th
					>
					<th
						scope="col"
						class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider"
						>เอกสาร ({currentContract.documents.length})</th
					>
					<th
						scope="col"
						class="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider"
						>จัดการ</th
					>
				</tr>
			</thead>
			<tbody class="bg-white divide-y divide-gray-200">
				{#each filteredContracts as contract (contract.id)}
					<tr class="hover:bg-gray-50 transition-colors">
						<td class="px-6 py-4 whitespace-nowrap">
							<div class="text-sm font-medium text-gray-900">{contract.title}</div>
							<div class="text-xs text-gray-500">{contract.contract_number}</div>
						</td>
						<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700"
							>{contract.customer_name ?? '-'}</td
						>
						<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700"
							>{contract.type_name ?? '-'}</td
						>
						<td class="px-6 py-4 whitespace-nowrap">
							<span
								class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
								class:bg-yellow-100={contract.status === 'Draft' || contract.status === 'In Review'}
								class:text-yellow-800={contract.status === 'Draft' || contract.status === 'In Review'}
								class:bg-green-100={contract.status === 'Active'}
								class:text-green-800={contract.status === 'Active'}
								class:bg-red-100={contract.status === 'Expired' || contract.status === 'Terminated'}
								class:text-red-800={contract.status === 'Expired' || contract.status === 'Terminated'}
							>
								{contract.status}
							</span>
						</td>
						<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
							{contract.start_date
								? new Date(contract.start_date).toLocaleDateString('th-TH', {
										year: 'numeric',
										month: 'short',
										day: 'numeric'
									})
								: '-'}
						</td>
						<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
							{contract.end_date
								? new Date(contract.end_date).toLocaleDateString('th-TH', {
										year: 'numeric',
										month: 'short',
										day: 'numeric'
									})
								: '-'}
						</td>
						<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
							{#if contract.documents && contract.documents.length > 0}
								<span class="text-blue-600 font-medium">{contract.documents.length} ไฟล์</span>
							{:else}
								-
							{/if}
						</td>
						<td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
							<div class="flex items-center justify-center gap-2">
								<button
									onclick={() => openEditModal(contract)}
									class="text-blue-600 hover:text-blue-900 transition"
									title="แก้ไข"
								>
									{@html Icon.edit}
								</button>
								<form
									method="POST"
									action="?/delete"
									use:enhance
									onsubmit={() => {
										if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบสัญญานี้?')) {
											event.preventDefault();
										}
									}}
								>
									<input type="hidden" name="id" value={contract.id} />
									<button type="submit" class="text-red-600 hover:text-red-900 transition" title="ลบ">
										{@html Icon.delete}
									</button>
								</form>
							</div>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="8" class="px-6 py-12 text-center text-gray-500">
							ไม่พบข้อมูลสัญญา...
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<!-- Add/Edit Modal -->
<!-- **แก้ไข 1: ลบ m-auto และใช้ CSS ด้านล่างเพื่อจัดตำแหน่ง** -->
<dialog
	bind:this={modalElement}
	class="p-0 rounded-lg shadow-2xl w-full max-w-4xl backdrop:bg-black/50"
>
	<form
		method="POST"
		enctype="multipart/form-data"
		action={isEditing ? '?/update' : '?/create'}
		use:enhance={() => {
			isLoading = true;
			formError = null; // เคลียร์ error เก่าก่อน submit
			return async ({ result, update }) => {
				isLoading = false;
				if (result.type === 'failure' || result.type === 'error') {
					// formError จะถูกตั้งค่าโดย Svelte 4 $: {} block
				} else if (result.type === 'success') {
					// การจัดการ success ถูกย้ายไปที่ $: block เพื่อใช้ newContract/updatedContract
				}
				// ต้องเรียก update() เพื่อให้ SvelteKit อัปเดต `form` prop
				update({ reset: false });
			};
		}}
		class="p-6"
	>
		<h2 class="text-2xl font-bold text-gray-800 mb-6">
			{isEditing ? 'แก้ไขสัญญา' : 'เพิ่มสัญญาใหม่'}
		</h2>

		<!-- แสดงผล Error -->
		{#if formError}
			<div
				class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4"
				role="alert"
				transition:slide
			>
				<strong class="font-bold">เกิดข้อผิดพลาด:</strong>
				<span class="block sm:inline">{formError}</span>
			</div>
		{/if}

		<!-- Hidden ID for Edit -->
		{#if isEditing}
			<input type="hidden" name="id" value={currentContract.id} />
		{/if}

		<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
			<!-- Column 1: Contract Details -->
			<div class="lg:col-span-2 space-y-4">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label for="title" class="block text-sm font-medium text-gray-700">ชื่อสัญญา *</label>
						<input
							type="text"
							id="title"
							name="title"
							bind:value={currentContract.title}
							required
							class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
					<div>
						<label for="contract_number" class="block text-sm font-medium text-gray-700"
							>เลขที่สัญญา</label
						>
						<input
							type="text"
							id="contract_number"
							name="contract_number"
							bind:value={currentContract.contract_number}
							class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label for="customer_id" class="block text-sm font-medium text-gray-700">ลูกค้า *</label>
						<select
							id="customer_id"
							name="customer_id"
							bind:value={currentContract.customer_id}
							required
							class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
						>
							<option value={null} disabled>-- เลือกลูกค้า --</option>
							{#each customers as customer (customer.id)}
								<option value={customer.id}>{customer.name}</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="contract_type_id" class="block text-sm font-medium text-gray-700"
							>ประเภทสัญญา *</label
						>
						<select
							id="contract_type_id"
							name="contract_type_id"
							bind:value={currentContract.contract_type_id}
							required
							class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
						>
							<option value={null} disabled>-- เลือกประเภทสัญญา --</option>
							{#each contractTypes as type (type.id)}
								<option value={type.id}>{type.name}</option>
							{/each}
						</select>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label for="status" class="block text-sm font-medium text-gray-700">สถานะ *</label>
						<select
							id="status"
							name="status"
							bind:value={currentContract.status}
							required
							class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
						>
							<option value="Draft">Draft</option>
							<option value="In Review">In Review</option>
							<option value="Active">Active</option>
							<option value="Expired">Expired</option>
							<option value="Terminated">Terminated</option>
						</select>
					</div>
					<div>
						<label for="contract_value" class="block text-sm font-medium text-gray-700"
							>มูลค่าสัญญา (บาท)</label
						>
						<input
							type="number"
							step="0.01"
							id="contract_value"
							name="contract_value"
							bind:value={currentContract.contract_value}
							class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label for="start_date" class="block text-sm font-medium text-gray-700">วันเริ่มต้น</label>
						<input
							type="date"
							id="start_date"
							name="start_date"
							bind:value={currentContract.start_date}
							class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
					<div>
						<label for="end_date" class="block text-sm font-medium text-gray-700">วันสิ้นสุด</label>
						<input
							type="date"
							id="end_date"
							name="end_date"
							bind:value={currentContract.end_date}
							class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
						class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
					>
						<option value={null}>-- ไม่ระบุ --</option>
						{#each users as user (user.id)}
							<option value={user.id}>{user.name}</option>
						{/each}
					</select>
				</div>

				<!-- **แก้ไข 4: รองรับ Multiple File Uploads** -->
				<div class="pt-2">
					<label for="contractFiles" class="block text-sm font-medium text-gray-700"
						>ไฟล์เอกสารสัญญา
						{#if !isEditing}
							<span class="text-red-500">* (ต้องมีอย่างน้อย 1 ไฟล์)</span>
						{:else}
							<span class="text-xs text-gray-500">(อัปโหลดเพื่อเพิ่มไฟล์/เวอร์ชันใหม่)</span>
						{/if}
					</label>
					<input
						type="file"
						id="contractFiles"
						name="contractFiles"
						bind:this={fileInput}
						required={!isEditing && (!currentContract.documents || currentContract.documents.length === 0)}
						multiple
						accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png"
						class="mt-1 block w-full text-sm text-gray-500
                   file:mr-4 file:py-2 file:px-4
                   file:rounded-lg file:border-0
                   file:text-sm file:font-semibold
                   file:bg-blue-50 file:text-blue-700
                   hover:file:bg-blue-100"
					/>
				</div>
			</div>

			<!-- Column 2: Document History / List -->
			<div class="lg:col-span-1 bg-gray-50 p-4 border rounded-lg overflow-y-auto max-h-96">
				<h3 class="text-lg font-semibold text-gray-700 mb-3">
					เอกสารที่อัปโหลดแล้ว ({currentContract.documents.length})
				</h3>

				{#if currentContract.documents && currentContract.documents.length > 0}
					<ul class="space-y-3">
						{#each currentContract.documents as doc (doc.id)}
							<li
								class="p-3 bg-white border border-gray-200 rounded-lg flex justify-between items-center text-sm"
							>
								<div class="truncate mr-2">
									<div class="font-medium text-gray-800 truncate" title={doc.name}>
										{doc.name}
									</div>
									<div class="text-xs text-gray-500">
										เวอร์ชัน: {doc.version} | {new Date(doc.uploaded_at).toLocaleDateString('th-TH')}
									</div>
								</div>

								<!-- *** FIX: เปลี่ยนเป็น <a> tag (direct link) ให้เหมือน customers *** -->
								<a
									href="/uploads/contracts/{doc.system_name}"
									target="_blank"
									rel="noopener noreferrer"
									download={doc.name}
									class="text-green-600 hover:text-green-800 transition p-1 rounded-full hover:bg-green-50"
									title="ดาวน์โหลดไฟล์: {doc.name}"
								>
									{@html Icon.download}
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-gray-500">ยังไม่มีเอกสารอัปโหลดสำหรับสัญญานี้</p>
				{/if}
			</div>
		</div>

		<!-- Form Actions -->
		<div class="flex justify-end items-center gap-4 mt-8 pt-4 border-t border-gray-200">
			<button
				type="button"
				onclick={closeModal}
				class="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
			>
				ยกเลิก
			</button>
			<button
				type="submit"
				disabled={isLoading}
				class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 disabled:bg-gray-400"
			>
				{#if isLoading}
					<div
						class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
					></div>
					<span>กำลังบันทึก...</span>
				{:else}
					{@html Icon.plus}
					<span>{isEditing ? 'บันทึกการเปลี่ยนแปลง' : 'สร้างสัญญา'}</span>
				{/if}
			</button>
		</div>
	</form>
</dialog>

<!-- **แก้ไข 2: เพิ่ม CSS สำหรับจัดตำแหน่ง Modal ให้อยู่ด้านบน** -->
<style>
	dialog.max-w-4xl {
		/* Override default modal centering to position from top */
		margin: 0;
		margin-top: 4rem; /* 64px, similar to customer modal pt-16 */
		margin-left: auto;
		margin-right: auto;

		/* Add padding for scrollbar if content overflows */
		overflow-y: auto;
		/* ตั้งค่า max-height เพื่อให้ scroll ได้ */
		max-height: calc(100vh - 8rem); /* 4rem top + 4rem bottom padding */
	}

	/* Optional: for smaller screens, use less margin */
	@media (max-width: 768px) {
		dialog.max-w-4xl {
			margin-top: 2rem; /* 32px, similar to customer modal pt-8 */
			width: calc(100% - 2rem); /* Add some horizontal padding */
			max-height: calc(100vh - 4rem); /* 2rem top + 2rem bottom padding */
		}
	}
</style>