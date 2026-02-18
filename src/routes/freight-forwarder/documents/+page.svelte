<script lang="ts">
	import { enhance } from '$app/forms';
	import { fade, slide } from 'svelte/transition';

	export let data;
	$: documents = data.documents || [];

	let searchQuery = '';

	$: filteredDocuments = documents.filter(
		(doc: any) =>
			doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
			(doc.original_name && doc.original_name.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	let showUploadModal = false;
	let isUploading = false;
	let selectedFile: File | null = null;
	let fileNameDisplay = '';

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			selectedFile = input.files[0];
			fileNameDisplay = selectedFile.name;
		}
	}

	function closeUploadModal() {
		showUploadModal = false;
		selectedFile = null;
		fileNameDisplay = '';
		isUploading = false;
	}

	let showDeleteModal = false;
	let deleteId: number | null = null;
	let deleteTitle = '';
	let isDeleting = false;

	function openDeleteModal(doc: any) {
		deleteId = doc.id;
		deleteTitle = doc.title;
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
		isDeleting = false;
	}

	function getFileIcon(type: string) {
		const t = type.toLowerCase();
		if (['pdf'].includes(t)) return 'picture_as_pdf';
		if (['doc', 'docx'].includes(t)) return 'description';
		if (['xls', 'xlsx', 'csv'].includes(t)) return 'table_view';
		if (['jpg', 'jpeg', 'png', 'gif'].includes(t)) return 'image';
		if (['zip', 'rar'].includes(t)) return 'folder_zip';
		return 'insert_drive_file';
	}

	function getIconColor(type: string) {
		const t = type.toLowerCase();
		if (['pdf'].includes(t)) return 'text-red-500 bg-red-50';
		if (['doc', 'docx'].includes(t)) return 'text-blue-500 bg-blue-50';
		if (['xls', 'xlsx', 'csv'].includes(t)) return 'text-green-500 bg-green-50';
		if (['jpg', 'jpeg', 'png', 'gif'].includes(t)) return 'text-purple-500 bg-purple-50';
		return 'text-gray-500 bg-gray-50';
	}

	function formatBytes(bytes: number, decimals = 2) {
		if (!+bytes) return '0 Bytes';
		const k = 1024;
		const dm = decimals < 0 ? 0 : decimals;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
	}
</script>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
		<div>
			<h1 class="text-2xl font-bold text-gray-800">Documents Center</h1>
			<p class="text-sm text-gray-500">คลังเอกสารและแบบฟอร์ม (Freight Forwarder)</p>
		</div>

		<div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
			<div class="relative w-full sm:w-64">
				<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
					<svg
						class="h-4 w-4 text-gray-400"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
							clip-rule="evenodd"
						/>
					</svg>
				</div>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="ค้นหาชื่อเอกสาร..."
					class="block w-full rounded-lg border-0 py-2 pr-3 pl-10 text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-blue-600 focus:ring-inset sm:text-sm sm:leading-6"
				/>
			</div>

			<button
				onclick={() => (showUploadModal = true)}
				class="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold whitespace-nowrap text-white shadow-sm transition-all hover:bg-blue-700"
			>
				<span class="material-symbols-outlined text-[20px]">cloud_upload</span>
				อัปโหลดเอกสาร
			</button>
		</div>
	</div>

	{#if filteredDocuments.length > 0}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{#each filteredDocuments as doc}
				<div
					class="group relative flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
				>
					<div class="flex items-start justify-between">
						<div class="flex items-start gap-3 overflow-hidden">
							<div
								class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg {getIconColor(
									doc.file_type
								)}"
							>
								<span class="material-symbols-outlined">{getFileIcon(doc.file_type)}</span>
							</div>
							<div class="min-w-0">
								<h3 class="truncate text-sm font-bold text-gray-800" title={doc.title}>
									{doc.title}
								</h3>
								<p class="truncate text-xs text-gray-500">{doc.original_name}</p>
							</div>
						</div>

						<button
							onclick={() => openDeleteModal(doc)}
							class="p-1 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
							title="ลบเอกสาร"
						>
							<span class="material-symbols-outlined text-[18px]">delete</span>
						</button>
					</div>

					{#if doc.description}
						<p class="mt-3 line-clamp-2 min-h-[2.5em] text-xs text-gray-500">{doc.description}</p>
					{:else}
						<div class="mt-3 min-h-[2.5em]"></div>
					{/if}

					<div class="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
						<div class="text-[10px] text-gray-400">
							{formatBytes(doc.file_size)} • {new Date(doc.created_at).toLocaleDateString('th-TH')}
						</div>
						<a
							href={doc.file_path}
							target="_blank"
							download
							class="flex items-center gap-1 rounded bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-600 transition-colors hover:bg-blue-50 hover:text-blue-600"
						>
							<span class="material-symbols-outlined text-[14px]">download</span>
							Download
						</a>
					</div>
				</div>
			{/each}
		</div>
	{:else if searchQuery}
		<div
			class="flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-center"
		>
			<div class="rounded-full bg-white p-3 shadow-sm">
				<span class="material-symbols-outlined text-3xl text-gray-400">search_off</span>
			</div>
			<h3 class="mt-3 text-sm font-semibold text-gray-900">ไม่พบเอกสารที่ค้นหา</h3>
			<p class="mt-1 text-xs text-gray-500">ลองค้นหาด้วยคำอื่น หรือตรวจสอบตัวสะกด</p>
		</div>
	{:else}
		<div
			class="flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-center"
		>
			<div class="rounded-full bg-white p-3 shadow-sm">
				<span class="material-symbols-outlined text-4xl text-gray-400">folder_open</span>
			</div>
			<h3 class="mt-3 text-sm font-semibold text-gray-900">ยังไม่มีเอกสาร</h3>
			<p class="mt-1 text-xs text-gray-500">เริ่มอัปโหลดเอกสารฉบับแรกของคุณได้เลย</p>
		</div>
	{/if}
</div>

{#if showUploadModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity"
		transition:fade={{ duration: 150 }}
	>
		<div
			class="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
			transition:slide={{ axis: 'y', duration: 200 }}
		>
			<div class="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
				<h3 class="text-lg font-bold text-gray-800">อัปโหลดเอกสารใหม่</h3>
				<button
					type="button"
					onclick={closeUploadModal}
					class="text-gray-400 hover:text-gray-600"
					aria-label="Close"
					title="ปิด"
				>
					<span class="material-symbols-outlined">close</span>
				</button>
			</div>

			<form
				method="POST"
				action="?/upload"
				enctype="multipart/form-data"
				use:enhance={() => {
					isUploading = true;
					return async ({ update, result }) => {
						await update();
						if (result.type === 'success') closeUploadModal();
						else isUploading = false;
					};
				}}
			>
				<div class="space-y-4 p-6">
					<div class="relative">
						<label
							for="file-upload"
							class="flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 transition-colors hover:border-blue-300 hover:bg-blue-50"
						>
							{#if selectedFile}
								<div class="flex flex-col items-center text-blue-600">
									<span class="material-symbols-outlined mb-1 text-3xl">check_circle</span>
									<span class="w-64 truncate px-4 text-center text-sm font-medium"
										>{fileNameDisplay}</span
									>
									<span class="mt-1 text-xs text-gray-400">{formatBytes(selectedFile.size)}</span>
								</div>
							{:else}
								<div class="flex flex-col items-center pt-5 pb-6 text-gray-500">
									<span class="material-symbols-outlined mb-2 text-3xl">cloud_upload</span>
									<p class="text-sm"><span class="font-semibold">คลิกเพื่อเลือกไฟล์</span></p>
									<p class="text-xs text-gray-400">PDF, DOCX, XLSX, JPG (Max 10MB)</p>
								</div>
							{/if}
							<input
								id="file-upload"
								name="file"
								type="file"
								class="hidden"
								onchange={handleFileSelect}
								required
							/>
						</label>
					</div>

					<div>
						<label for="title" class="mb-1 block text-sm font-semibold text-gray-700"
							>ชื่อเอกสาร <span class="text-red-500">*</span></label
						>
						<input
							type="text"
							id="title"
							name="title"
							required
							placeholder="เช่น แบบฟอร์มใบงาน, ตารางค่าระวางเรือ 2024"
							class="w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label for="description" class="mb-1 block text-sm font-medium text-gray-700"
							>รายละเอียด (Optional)</label
						>
						<textarea
							id="description"
							name="description"
							rows="2"
							class="w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
							placeholder="คำอธิบายเพิ่มเติม..."
						></textarea>
					</div>
				</div>

				<div class="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
					<button
						type="button"
						onclick={closeUploadModal}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						>ยกเลิก</button
					>
					<button
						type="submit"
						disabled={isUploading || !selectedFile}
						class="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
					>
						{#if isUploading}
							<svg
								class="h-4 w-4 animate-spin text-white"
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
							Uploading...
						{:else}
							บันทึก
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if showDeleteModal}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		transition:fade={{ duration: 150 }}
	>
		<div
			class="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl"
			transition:slide={{ axis: 'y', duration: 200 }}
		>
			<div class="p-6 text-center">
				<div
					class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600"
				>
					<span class="material-symbols-outlined text-2xl">delete</span>
				</div>
				<h3 class="text-lg font-bold text-gray-900">ยืนยันการลบไฟล์</h3>
				<p class="mt-2 text-sm text-gray-500">
					คุณแน่ใจหรือไม่ที่จะลบเอกสาร <br />"<span class="font-bold text-gray-800"
						>{deleteTitle}</span
					>"?
				</p>
			</div>
			<div class="flex justify-center gap-3 bg-gray-50 px-6 py-4">
				<button
					type="button"
					onclick={closeDeleteModal}
					class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
					>ยกเลิก</button
				>
				<form
					method="POST"
					action="?/delete"
					class="w-full"
					use:enhance={() => {
						isDeleting = true;
						return async ({ update }) => {
							await update();
							closeDeleteModal();
						};
					}}
				>
					<input type="hidden" name="id" value={deleteId} />
					<button
						type="submit"
						disabled={isDeleting}
						class="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
					>
						{isDeleting ? 'ลบ...' : 'ลบเลย'}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
