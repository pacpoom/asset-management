<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import type { ActionData, PageData } from './$types';
	import { slide, fade } from 'svelte/transition';

	type Department = { id: string; name: string };
	type FreightDocument = {
		id: number;
		department: string;
		title: string;
		filename: string;
		original_name: string;
		file_path: string;
		description: string | null;
		uploader_name: string;
		created_at: string;
	};
	type GroupedDocuments = { [key: string]: FreightDocument[] };

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	const initialGrouped: GroupedDocuments = {};
	if (data.groupedDocuments) {
		for (const key in data.groupedDocuments) {
			initialGrouped[key] = data.groupedDocuments[key];
		}
	}
	let groupedDocuments = $state<GroupedDocuments>(initialGrouped);

	let selectedDepartmentId = $state<string>(data.departments?.[0]?.id || 'General');
	let description = $state('');
	let fileInputRef: HTMLInputElement | null = $state(null);
	let isUploading = $state(false);
	let uploadError = $state<string | null>(null);
	let uploadSuccessMessage = $state<string | null>(null);

	let documentToDelete = $state<FreightDocument | null>(null);
	let documentToRename = $state<FreightDocument | null>(null);
	let isDeleting = $state(false);
	let isRenaming = $state(false);
	let renameForm: { new_name: string; new_description: string | null } = $state({
		new_name: '',
		new_description: null
	});

	let activeDepartmentId = $state<string | null>(null);
	let searchQuery = $state('');
	let dateFrom = $state<string | null>(null);
	let dateTo = $state<string | null>(null);

	const activeDepartment = $derived(() => {
		if (activeDepartmentId === null) return null;
		return data.departments.find((d: Department) => d.id === activeDepartmentId);
	});

	function openDepartment(deptId: string) {
		activeDepartmentId = deptId;
		searchQuery = '';
	}
	function closeDepartment() {
		activeDepartmentId = null;
		searchQuery = '';
	}
	function openDeleteModal(doc: FreightDocument) {
		documentToDelete = doc;
	}
	function closeDeleteModal() {
		documentToDelete = null;
		isDeleting = false;
	}
	function openRenameModal(doc: FreightDocument) {
		documentToRename = doc;
		renameForm = { new_name: doc.title, new_description: doc.description };
	}
	function closeRenameModal() {
		documentToRename = null;
		isRenaming = false;
	}

	const filteredGroupedDocuments = $derived(() => {
		const lowerQuery = searchQuery.toLowerCase().trim();
		let fromDate: Date | null = null;
		if (dateFrom) fromDate = new Date(dateFrom);

		let toDate: Date | null = null;
		if (dateTo) {
			toDate = new Date(dateTo);
			toDate.setHours(23, 59, 59, 999);
		}

		const filtered: GroupedDocuments = {};

		Object.keys(groupedDocuments).forEach((deptKey) => {
			filtered[deptKey] = groupedDocuments[deptKey].filter((doc) => {
				if (lowerQuery) {
					const nameMatch = doc.title.toLowerCase().includes(lowerQuery);
					const descMatch = doc.description
						? doc.description.toLowerCase().includes(lowerQuery)
						: false;
					if (!nameMatch && !descMatch) return false;
				}

				const docDate = new Date(doc.created_at);
				if (fromDate && docDate < fromDate) return false;
				if (toDate && docDate > toDate) return false;

				return true;
			});
		});

		return filtered;
	});

	const handleSubmitUpload = () => {
		isUploading = true;
		uploadError = null;
		uploadSuccessMessage = null;
		return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
			isUploading = false;
			if (
				result.type === 'success' &&
				result.data?.action === 'uploadDocument' &&
				result.data.newDocuments
			) {
				const newDocs = result.data.newDocuments as FreightDocument[];
				newDocs.forEach((newDoc) => {
					const deptKey = newDoc.department;
					if (!groupedDocuments[deptKey]) groupedDocuments[deptKey] = [];
					groupedDocuments[deptKey] = [newDoc, ...groupedDocuments[deptKey]];
				});
				description = '';
				if (fileInputRef) fileInputRef.value = '';
				uploadSuccessMessage = `อัปโหลด ${newDocs.length} เอกสาร สำเร็จ!`;
				setTimeout(() => {
					uploadSuccessMessage = null;
				}, 3000);
			} else if (result.type === 'failure') {
				uploadError = result.data?.message ?? 'Upload error';
				await update();
			} else {
				await update();
			}
		};
	};

	const handleSubmitRename = () => {
		isRenaming = true;
		return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
			isRenaming = false;
			if (result.type === 'success' && result.data?.updatedDocument) {
				const updatedDoc = result.data.updatedDocument as FreightDocument;
				const deptKey = updatedDoc.department;
				if (groupedDocuments[deptKey]) {
					const index = groupedDocuments[deptKey].findIndex((doc) => doc.id === updatedDoc.id);
					if (index !== -1) groupedDocuments[deptKey][index] = updatedDoc;
				}
				closeRenameModal();
			} else if (result.type === 'failure') {
				await update();
				alert(result.data?.message ?? 'Rename failed');
			} else {
				await update();
			}
		};
	};

	const handleSubmitDelete = () => {
		isDeleting = true;
		return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
			isDeleting = false;
			if (result.type === 'success' && result.data?.deletedDocumentId) {
				const deletedId = result.data.deletedDocumentId as number;
				Object.keys(groupedDocuments).forEach((deptKey) => {
					groupedDocuments[deptKey] = groupedDocuments[deptKey].filter(
						(doc) => doc.id !== deletedId
					);
				});
				closeDeleteModal();
			} else if (result.type === 'failure') {
				await update();
				alert(result.data?.message ?? 'Delete failed');
			} else {
				await update();
			}
		};
	};
</script>

<svelte:head>
	<title>Freight Forwarder Documents</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<h1 class="mb-6 text-3xl font-bold text-gray-800">Documents Center (Freight Forwarder)</h1>

	<form
		method="POST"
		action="?/uploadDocument"
		use:enhance={handleSubmitUpload}
		enctype="multipart/form-data"
		class="mb-8 rounded-lg border bg-white p-6 shadow-sm"
	>
		<h2 class="mb-4 text-xl font-semibold text-gray-700">อัปโหลดเอกสารใหม่</h2>

		{#if uploadError}
			<div class="mb-4 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">
				<strong>Error:</strong>
				{uploadError}
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

		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div>
				<label for="department_id" class="mb-2 block text-sm font-medium text-gray-700"
					>เลือกแผนก*</label
				>
				<select
					id="department_id"
					name="department_id"
					bind:value={selectedDepartmentId}
					required
					class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
				>
					{#each data.departments as dept}
						<option value={dept.id}>{dept.name}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="document" class="mb-2 block text-sm font-medium text-gray-700"
					>เลือกไฟล์* (Multiple)</label
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
		</div>
		<div class="mt-4">
			<label for="description" class="mb-2 block text-sm font-medium text-gray-700"
				>ชื่อเอกสาร / คำอธิบาย (Optional)</label
			>
			<input
				type="text"
				id="description"
				name="description"
				bind:value={description}
				placeholder="ระบุชื่อเอกสาร (ถ้าไม่ระบุจะใช้ชื่อไฟล์)"
				class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
			/>
		</div>

		<div class="mt-6 flex justify-end">
			<button
				type="submit"
				disabled={isUploading}
				class="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:bg-blue-300"
			>
				{#if isUploading}
					<svg
						class="mr-2 h-4 w-4 animate-spin"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						><circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
						></circle><path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path></svg
					>
					กำลังอัปโหลด...
				{:else}
					<span class="material-symbols-outlined mr-2 text-[18px]">cloud_upload</span> อัปโหลดเอกสาร
				{/if}
			</button>
		</div>
	</form>

	<hr class="my-8 border-gray-200" />

	<div>
		{#if activeDepartment()}
			{@const docs = filteredGroupedDocuments()[activeDepartment().id] || []}
			<div transition:fade={{ duration: 200 }}>
				<div class="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
					<div class="flex items-center gap-3">
						<button
							type="button"
							onclick={closeDepartment}
							class="rounded-full bg-gray-100 p-2 text-gray-600 transition hover:bg-gray-200 hover:text-gray-900"
							title="ย้อนกลับ"
						>
							<span class="material-symbols-outlined block h-5 w-5">arrow_back</span>
						</button>
						<div>
							<h2 class="text-2xl font-bold text-gray-800">{activeDepartment().name}</h2>
							<p class="text-sm text-gray-500">{docs.length} ไฟล์ในโฟลเดอร์นี้</p>
						</div>
					</div>

					<div class="flex flex-wrap items-end gap-2">
						<div>
							<label for="date_from" class="mb-1 block text-xs font-medium text-gray-500"
								>จากวันที่</label
							>
							<input
								type="date"
								id="date_from"
								bind:value={dateFrom}
								class="block w-full rounded-md border-gray-300 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>
						<div>
							<label for="date_to" class="mb-1 block text-xs font-medium text-gray-500"
								>ถึงวันที่</label
							>
							<input
								type="date"
								id="date_to"
								bind:value={dateTo}
								class="block w-full rounded-md border-gray-300 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
							/>
						</div>
						<div class="w-full min-w-[200px] md:w-auto">
							<label for="search_box" class="mb-1 block text-xs font-medium text-gray-500"
								>ค้นหา</label
							>
							<div class="relative">
								<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
									<span class="material-symbols-outlined text-[18px] text-gray-400">search</span>
								</div>
								<input
									type="search"
									id="search_box"
									bind:value={searchQuery}
									placeholder="ค้นหาชื่อไฟล์..."
									class="block w-full rounded-md border-gray-300 py-1.5 pl-9 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
								/>
							</div>
						</div>
					</div>
				</div>

				{#if docs.length > 0}
					<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
						<ul class="divide-y divide-gray-100">
							{#each docs as doc (doc.id)}
								<li
									class="group flex flex-col items-start justify-between gap-4 p-4 transition hover:bg-blue-50/50 sm:flex-row sm:items-center"
									transition:slide|local
								>
									<div class="flex items-start gap-4">
										<div
											class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600"
										>
											<span class="material-symbols-outlined">description</span>
										</div>
										<div>
											<p class="font-medium text-gray-900 group-hover:text-blue-700">{doc.title}</p>
											{#if doc.description && doc.description !== doc.title}
												<p class="text-sm text-gray-500">{doc.description}</p>
											{/if}
											<div class="mt-1 flex items-center gap-2 text-xs text-gray-400">
												<span>{doc.uploader_name}</span>
												<span>•</span>
												<span>{new Date(doc.created_at).toLocaleString('th-TH')}</span>
											</div>
										</div>
									</div>

									<div class="flex flex-shrink-0 gap-2 self-end sm:self-center">
										<a
											href={doc.file_path}
											target="_blank"
											download={doc.original_name}
											class="rounded-md p-2 text-gray-400 transition hover:bg-white hover:text-blue-600 hover:shadow-sm"
											title="Download"
										>
											<span class="material-symbols-outlined block h-5 w-5">download</span>
										</a>
										<button
											onclick={() => openRenameModal(doc)}
											class="rounded-md p-2 text-gray-400 transition hover:bg-white hover:text-yellow-600 hover:shadow-sm"
											title="Rename"
										>
											<span class="material-symbols-outlined block h-5 w-5">edit</span>
										</button>
										<button
											onclick={() => openDeleteModal(doc)}
											class="rounded-md p-2 text-gray-400 transition hover:bg-white hover:text-red-600 hover:shadow-sm"
											title="Delete"
										>
											<span class="material-symbols-outlined block h-5 w-5">delete</span>
										</button>
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{:else}
					<div
						class="flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 text-center"
					>
						<span class="material-symbols-outlined mb-2 text-4xl text-gray-300">folder_open</span>
						<p class="text-gray-500">
							{searchQuery ? 'ไม่พบเอกสารที่ตรงกับการค้นหา' : 'โฟลเดอร์นี้ว่างเปล่า'}
						</p>
					</div>
				{/if}
			</div>
		{:else}
			<div>
				<h2 class="mb-4 text-xl font-bold text-gray-800">แผนกทั้งหมด</h2>
				<div class="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each data.departments as department (department.id)}
						<button
							type="button"
							onclick={() => openDepartment(department.id)}
							class="group flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm transition-all hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg"
						>
							<div
								class="mb-4 rounded-full bg-blue-50 p-4 transition-colors group-hover:bg-blue-100"
							>
								<span
									class="material-symbols-outlined text-4xl text-blue-500 group-hover:text-blue-600"
									>folder</span
								>
							</div>
							<span class="font-bold text-gray-700 group-hover:text-blue-700"
								>{department.name}</span
							>
							<span class="mt-1 text-xs text-gray-400"
								>{groupedDocuments[department.id]?.length || 0} ไฟล์</span
							>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	{#if documentToRename}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
		>
			<div class="animate-in fade-in zoom-in-95 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
				<h3 class="text-lg font-bold text-gray-900">แก้ไขชื่อเอกสาร</h3>
				<form
					method="POST"
					action="?/renameDocument"
					use:enhance={handleSubmitRename}
					class="mt-4 space-y-4"
				>
					<input type="hidden" name="document_id" value={documentToRename.id} />
					<div>
						<label for="new_name" class="mb-1 block text-sm font-medium text-gray-700"
							>ชื่อเอกสารใหม่</label
						>
						<input
							type="text"
							id="new_name"
							name="new_name"
							bind:value={renameForm.new_name}
							required
							class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
						/>
					</div>
					<div>
						<label for="new_description" class="mb-1 block text-sm font-medium text-gray-700"
							>คำอธิบาย</label
						>
						<textarea
							id="new_description"
							name="new_description"
							bind:value={renameForm.new_description}
							rows={3}
							class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
						></textarea>
					</div>
					<div class="mt-6 flex justify-end gap-3">
						<button
							type="button"
							onclick={closeRenameModal}
							disabled={isRenaming}
							class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
							>Cancel</button
						>
						<button
							type="submit"
							disabled={isRenaming}
							class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
							>Save Changes</button
						>
					</div>
				</form>
			</div>
		</div>
	{/if}

	{#if documentToDelete}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
			role="alertdialog"
		>
			<div class="animate-in fade-in zoom-in-95 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
				<div
					class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600"
				>
					<span class="material-symbols-outlined">delete</span>
				</div>
				<h3 class="text-center text-lg font-bold text-gray-900">ยืนยันการลบ</h3>
				<p class="mt-2 text-center text-sm text-gray-500">
					คุณแน่ใจหรือไม่ที่จะลบเอกสาร <span class="font-bold text-gray-800"
						>"{documentToDelete.title}"</span
					>?
				</p>
				<form
					method="POST"
					action="?/deleteDocument"
					use:enhance={handleSubmitDelete}
					class="mt-6 flex justify-center gap-3"
				>
					<input type="hidden" name="document_id" value={documentToDelete.id} />
					<button
						type="button"
						onclick={closeDeleteModal}
						disabled={isDeleting}
						class="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						>ยกเลิก</button
					>
					<button
						type="submit"
						disabled={isDeleting}
						class="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
						>ยืนยันลบ</button
					>
				</form>
			</div>
		</div>
	{/if}
</div>
