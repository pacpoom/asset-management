<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';

	// --- Types ---
	type Department = PageData['departments'][0];
	type DepartmentDocument = {
		id: number;
		department_id: number;
		department_name: string;
		file_name: string;
		file_path: string;
		description: string | null;
		uploader_name: string;
		uploaded_at: string;
	};
	type GroupedDocuments = { [key: string]: DepartmentDocument[] };

	// --- Props & State ---
	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	const initialGrouped: GroupedDocuments = {};
	for (const numKey in data.groupedDocuments) {
		initialGrouped[String(numKey)] = data.groupedDocuments[numKey as any];
	}
	let groupedDocuments = $state<GroupedDocuments>(initialGrouped);

	let selectedDepartmentId = $state<number | undefined>(data.departments?.[0]?.id);
	let description = $state('');
	let fileInputRef: HTMLInputElement | null = $state(null);
	let isUploading = $state(false);
	let uploadError = $state<string | null>(null);
	let uploadSuccessMessage = $state<string | null>(null);
	let documentToDelete = $state<DepartmentDocument | null>(null);
	let documentToRename = $state<DepartmentDocument | null>(null);
	let isDeleting = $state(false);
	let isRenaming = $state(false);
	let renameForm: { new_name: string; new_description: string | null } = $state({
		new_name: '',
		new_description: null
	});

	// State สำหรับจัดการ "โฟลเดอร์"
	let activeDepartmentId = $state<number | null>(null);
	let searchQuery = $state('');
	let dateFrom = $state<string | null>(null);
	let dateTo = $state<string | null>(null);

	// DERIVED STATE สำหรับหา "แผนกที่กำลังเปิด"
	const activeDepartment = $derived(() => {
		if (activeDepartmentId === null) return null;
		return data.departments.find((d: Department) => d.id === activeDepartmentId);
	});

	// Functions สำหรับจัดการ UI
	function openDepartment(deptId: number) {
		activeDepartmentId = deptId;
		searchQuery = '';
	}
	function closeDepartment() {
		activeDepartmentId = null;
		searchQuery = '';
	}
	function openDeleteModal(doc: DepartmentDocument) {
		documentToDelete = doc;
	}
	function closeDeleteModal() {
		documentToDelete = null;
		isDeleting = false;
	}
	function openRenameModal(doc: DepartmentDocument) {
		documentToRename = doc;
		renameForm = { new_name: doc.file_name, new_description: doc.description };
	}
	function closeRenameModal() {
		documentToRename = null;
		isRenaming = false;
	}

	const filteredGroupedDocuments = $derived(() => {
		const lowerQuery = searchQuery.toLowerCase().trim();

		// 1. Parse วันที่แค่ครั้งเดียว (เพื่อประสิทธิภาพ)
		let fromDate: Date | null = null;
		if (dateFrom) {
			fromDate = new Date(dateFrom); // จะได้วันที่ เช่น 28 ต.ค. @ 00:00:00
		}

		let toDate: Date | null = null;
		if (dateTo) {
			toDate = new Date(dateTo);
			toDate.setHours(23, 59, 59, 999); // 👈 ตั้งค่าเวลา 23.59 น."
		}

		const filtered: GroupedDocuments = {};

		// วนลูปทุกแผนก
		Object.keys(groupedDocuments).forEach((deptIdKey) => {
			filtered[deptIdKey] = groupedDocuments[deptIdKey].filter((doc) => {
				if (lowerQuery) {
					// ถ้ามีคำค้นหา
					const nameMatch = doc.file_name.toLowerCase().includes(lowerQuery);
					const descMatch = doc.description
						? doc.description.toLowerCase().includes(lowerQuery)
						: false;
					if (!nameMatch && !descMatch) {
						return false;
					}
				}

				const docDate = new Date(doc.uploaded_at);

				if (fromDate && docDate < fromDate) {
					return false;
				}

				if (toDate && docDate > toDate) {
					return false;
				}

				// --- ถ้าผ่านทุกเงื่อนไข ---
				return true;
			});
		});

		return filtered;
	});

	// --- Enhance Handlers ---
	const handleSubmitUpload = () => {
		isUploading = true;
		uploadError = null;
		uploadSuccessMessage = null; // ✅ 1. ล้างข้อความเก่า
		return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
			isUploading = false;
			if (
				result.type === 'success' &&
				result.data?.action === 'uploadDocument' &&
				result.data.newDocuments
			) {
				const newDocs = result.data.newDocuments as DepartmentDocument[];
				newDocs.forEach((newDoc) => {
					const deptIdKey = String(newDoc.department_id);
					if (!groupedDocuments[deptIdKey]) {
						groupedDocuments[deptIdKey] = [];
					}
					groupedDocuments[deptIdKey] = [newDoc, ...(groupedDocuments[deptIdKey] || [])];
				});
				description = '';
				if (fileInputRef) fileInputRef.value = '';

				// ✅ 2. ตั้งข้อความใหม่ และตั้งเวลาลบ
				const count = newDocs.length;
				uploadSuccessMessage = `อัปโหลด ${count} เอกสาร สำเร็จ!`;

				setTimeout(() => {
					uploadSuccessMessage = null;
				}, 3000); // (ข้อความจะหายไปใน 3 วินาที)
			} else if (result.type === 'failure' && result.data?.action === 'uploadDocument') {
				uploadError = result.data.message ?? 'Unknown upload error';
				await update();
			}
		};
	};

	const handleSubmitRename = () => {
		isRenaming = true;
		return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
			isRenaming = false;
			if (
				result.type === 'success' &&
				result.data?.action === 'renameDocument' &&
				result.data.updatedDocument
			) {
				const updatedDoc = result.data.updatedDocument as DepartmentDocument;
				const deptIdKey = String(updatedDoc.department_id);
				if (groupedDocuments[deptIdKey]) {
					const index = groupedDocuments[deptIdKey].findIndex((doc) => doc.id === updatedDoc.id);
					if (index !== -1) {
						groupedDocuments[deptIdKey][index] = updatedDoc;
					}
				}
				closeRenameModal();
			} else if (result.type === 'failure') {
				await update();
				alert(result.data?.message ?? 'Rename failed');
			}
		};
	};
	const handleSubmitDelete = () => {
		isDeleting = true;
		return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
			isDeleting = false;
			if (
				result.type === 'success' &&
				result.data?.action === 'deleteDocument' &&
				result.data.deletedDocumentId
			) {
				const deletedId = result.data.deletedDocumentId as number;
				Object.keys(groupedDocuments).forEach((deptIdKey) => {
					groupedDocuments[deptIdKey] = groupedDocuments[deptIdKey].filter(
						(doc) => doc.id !== deletedId
					);
				});
				closeDeleteModal();
			} else if (result.type === 'failure') {
				await update();
				alert(result.data?.message ?? 'Delete failed');
				closeDeleteModal();
			}
		};
	};
</script>

<svelte:head>
	<title>Department Documents</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<h1 class="mb-6 text-3xl font-bold">จัดการเอกสารตามแผนก</h1>

	<form
		method="POST"
		action="?/uploadDocument"
		use:enhance={handleSubmitUpload}
		enctype="multipart/form-data"
		class="mb-8 rounded-lg border bg-white p-6 shadow"
	>
		<h2 class="mb-4 text-xl font-semibold">อัปโหลดเอกสารใหม่</h2>

		{#if form?.action === 'uploadDocument' && form?.success === false}
			<div class="mb-4 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">
				<strong>Error:</strong>
				{form.message}
			</div>
		{/if}

		{#if uploadSuccessMessage}
			<div
				class="mb-4 rounded-md border border-green-300 bg-green-50 p-4 text-sm text-green-700"
				transition:fade
			>
				{uploadSuccessMessage}
			</div>
		{/if}
		<div class="mb-4">
			<label for="department_id" class="mb-2 block text-sm font-medium text-gray-700"
				>เลือกแผนก*</label
			>
			<select
				id="department_id"
				name="department_id"
				bind:value={selectedDepartmentId}
				required
				class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
			>
				{#each data.departments as dept}
					<option value={dept.id}>{dept.name}</option>
				{/each}
			</select>
		</div>
		<div class="mb-4">
			<label for="description" class="mb-2 block text-sm font-medium text-gray-700"
				>คำอธิบาย (ถ้ามี)</label
			>
			<textarea
				id="description"
				name="description"
				bind:value={description}
				rows={2}
				class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
			></textarea>
		</div>
		<div class="mb-6">
			<label for="document" class="mb-2 block text-sm font-medium text-gray-700"
				>เลือกไฟล์เอกสาร* (เลือกได้หลายไฟล์)</label
			>
			<input
				type="file"
				id="document"
				name="document"
				multiple
				required
				bind:this={fileInputRef}
				class="block w-full text-sm text-gray-900 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
			/>
		</div>
		<button
			type="submit"
			disabled={isUploading}
			class="flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:bg-blue-300 sm:w-auto"
		>
			{#if isUploading}
				<span>
					<svg
						aria-hidden="true"
						role="status"
						class="mr-2 inline h-4 w-4 animate-spin text-white"
						viewBox="0 0 100 101"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
							fill="#E5E7EB"
						/>
						<path
							d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
							fill="currentColor"
						/>
					</svg>
					กำลังอัปโหลด...
				</span>
			{:else}
				อัปโหลดเอกสาร
			{/if}
		</button>
	</form>
	<hr class="my-8" />

	<div>
		{#if activeDepartment()}
			{@const docs = filteredGroupedDocuments()[String(activeDepartment().id)] || []}
			<div>
				<div>
					<div class="mb-4 flex flex-wrap items-end justify-between gap-4">
						<div class="flex items-center gap-3">
							<button
								type="button"
								onclick={closeDepartment}
								class="rounded-full p-2 text-gray-600 hover:bg-gray-100"
								title="ย้อนกลับ"
							>
								<svg
									class="h-5 w-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									xmlns="http://www.w3.org/2000/svg"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M10 19l-7-7m0 0l7-7m-7 7h18"
									></path></svg
								>
							</button>
							<h2 class="text-2xl font-semibold">{activeDepartment().name}</h2>
						</div>

						<div class="flex flex-wrap items-end gap-2">
							<div>
								<label for="date_from" class="mb-1 block text-xs font-medium text-gray-600"
									>ค้นหาตั้งแต่วันที่</label
								>
								<input
									type="date"
									id="date_from"
									bind:value={dateFrom}
									class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
								/>
							</div>
							<div>
								<label for="date_to" class="mb-1 block text-xs font-medium text-gray-600"
									>ถึงวันที่</label
								>
								<input
									type="date"
									id="date_to"
									bind:value={dateTo}
									class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
								/>
							</div>
							<div class="w-full max-w-xs">
								<label for="search_box" class="mb-1 block text-xs font-medium text-gray-600"
									>ค้นหาตามชื่อไฟล์</label
								>
								<input
									type="search"
									id="search_box"
									bind:value={searchQuery}
									placeholder="ค้นหาในโฟลเดอร์นี้..."
									class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
						</div>
					</div>
					{#if docs.length > 0}{:else}{/if}
				</div>

				{#if docs.length > 0}
					<ul class="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
						{#each docs as doc (doc.id)}
							<li
								class="flex flex-col items-start justify-between gap-2 border-b pb-3 last:border-b-0 sm:flex-row sm:items-center"
								transition:slide
							>
								<div class="flex-1">
									<p class="font-medium">{doc.file_name}</p>
									{#if doc.description}
										<p class="text-sm text-gray-600">{doc.description}</p>
									{/if}
									<p class="text-xs text-gray-500">
										Uploaded by {doc.uploader_name} on {new Date(doc.uploaded_at).toLocaleString()}
									</p>
								</div>
								<div class="flex flex-shrink-0 gap-2">
									<a
										href={doc.file_path}
										target="_blank"
										download={doc.file_name}
										class="rounded-md p-1.5 text-blue-600 hover:bg-blue-100"
										title="Download"
									>
										<svg
											class="h-5 w-5"
											fill="currentColor"
											viewBox="0 0 20 20"
											xmlns="http://www.w3.org/2000/svg"
											><path
												fill-rule="evenodd"
												d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
												clip-rule="evenodd"
											></path></svg
										>
									</a>
									<button
										onclick={() => openRenameModal(doc)}
										class="rounded-md p-1.5 text-yellow-600 hover:bg-yellow-100"
										title="Rename"
									>
										<svg
											class="h-5 w-5"
											fill="currentColor"
											viewBox="0 0 20 20"
											xmlns="http://www.w3.org/2000/svg"
											><path
												d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z"
											></path><path
												fill-rule="evenodd"
												d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
												clip-rule="evenodd"
											></path></svg
										>
									</button>
									<button
										onclick={() => openDeleteModal(doc)}
										class="rounded-md p-1.5 text-red-600 hover:bg-red-100"
										title="Delete"
									>
										<svg
											class="h-5 w-5"
											fill="currentColor"
											viewBox="0 0 20 20"
											xmlns="http://www.w3.org/2000/svg"
											><path
												fill-rule="evenodd"
												d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z"
												clip-rule="evenodd"
											></path></svg
										>
									</button>
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="rounded-lg border bg-white p-12 text-center text-gray-500 shadow-sm">
						{#if searchQuery}
							ไม่พบเอกสารที่ตรงกับการค้นหา
						{:else}
							โฟลเดอร์นี้ว่าง
						{/if}
					</div>
				{/if}
			</div>
		{:else}
			<div>
				<h2 class="mb-4 text-2xl font-semibold">แผนกทั้งหมด</h2>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each data.departments as department (department.id)}
						<button
							type="button"
							onclick={() => openDepartment(department.id)}
							class="flex flex-col items-center justify-center rounded-lg border bg-white p-6 text-center shadow-sm transition hover:bg-gray-50 hover:shadow-md"
						>
							<svg
								class="h-16 w-16 text-blue-500"
								fill="currentColor"
								viewBox="0 0 20 20"
								xmlns="http://www.w3.org/2000/svg"
								><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
								></path></svg
							>
							<span class="mt-2 block font-medium text-gray-700">{department.name}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	{#if documentToRename}
		<div
			class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
			role="dialog"
			aria-modal="true"
		>
			<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
				<h3 class="text-lg font-bold">แก้ไขรายละเอียดเอกสาร</h3>
				<form
					method="POST"
					action="?/renameDocument"
					use:enhance={handleSubmitRename}
					class="mt-4 space-y-4"
				>
					<input type="hidden" name="document_id" value={documentToRename.id} />
					<div>
						<label for="new_name" class="mb-2 block text-sm font-medium text-gray-900"
							>ชื่อไฟล์ใหม่*</label
						>
						<input
							type="text"
							id="new_name"
							name="new_name"
							bind:value={renameForm.new_name}
							required
							class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label for="new_description" class="mb-2 block text-sm font-medium text-gray-900"
							>คำอธิบายใหม่ (ถ้ามี)</label
						>
						<textarea
							id="new_description"
							name="new_description"
							bind:value={renameForm.new_description}
							rows={3}
							class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
						></textarea>
					</div>
					{#if form?.action === 'renameDocument' && form?.success === false}
						<div class="text-sm text-red-600">{form.message}</div>
					{/if}
					<div class="mt-6 flex justify-end gap-3">
						<button
							type="button"
							onclick={closeRenameModal}
							disabled={isRenaming}
							class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={isRenaming}
							class="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:bg-blue-400"
						>
							{#if isRenaming}
								Saving...
							{:else}
								Save Changes
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	{#if documentToDelete}
		<div
			class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
			role="alertdialog"
		>
			<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
				<h3 class="text-lg font-bold">ยืนยันการลบเอกสาร</h3>
				<p class="mt-2 text-sm text-gray-600">
					คุณแน่ใจหรือไม่ที่จะลบเอกสาร "{documentToDelete.file_name}"?
					การดำเนินการนี้ไม่สามารถย้อนกลับได้
				</p>
				<form
					method="POST"
					action="?/deleteDocument"
					use:enhance={handleSubmitDelete}
					class="mt-6 flex justify-end gap-3"
				>
					<input type="hidden" name="document_id" value={documentToDelete.id} />
					<button
						type="button"
						onclick={closeDeleteModal}
						disabled={isDeleting}
						class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
					>
						ยกเลิก
					</button>
					<button
						type="submit"
						disabled={isDeleting}
						class="rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:bg-red-400"
					>
						{#if isDeleting}
							กำลังลบ...
						{:else}
							ยืนยันการลบ
						{/if}
					</button>
				</form>
			</div>
		</div>
	{/if}
</div>
