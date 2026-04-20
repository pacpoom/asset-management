<script lang="ts">
	import { deserialize } from '$app/forms';
	import type { PageData } from './$types';

	export let data: PageData;

	interface DocumentMaster {
		id: number;
		doc_code: string;
		doc_name: string;
		doc_type: string;
		department_id: number;
		department_name: string;
		iso_section_code: string | null;
		iso_section_name_th: string | null;
		iso_section_name_en: string | null;
		current_revision: string;
		effective_date: string;
		status: string;
		description: string;
		attached_file_original_name: string | null;
		attached_file_system_name: string | null;
	}

	let selectedDocType: string | null = null;
	let selectedDept: string | null = null;
	let tableSearchDraft = '';
	let appliedSearch = '';
	let displayLimitDraft: '20' | '50' | '100' | '200' | 'all' = '50';
	let appliedDisplayLimit: '20' | '50' | '100' | '200' | 'all' = '50';
	let isDeleting = false;
	let statusUpdatingId: number | null = null;
	let uploadingFileId: number | null = null;
	let removingFileId: number | null = null;
	let isCreating = false;
	let createAttachInput: HTMLInputElement | undefined;
	let showImportModal = false;
	let importFile: File | null = null;
	let importLoading = false;
	let importMessage = '';
	let createMessage = '';

	async function parseActionData(response: Response): Promise<Record<string, any>> {
		const raw = await response.text();
		try {
			const actionResult = deserialize(raw);
			if (actionResult && typeof actionResult === 'object' && 'data' in actionResult) {
				return (actionResult as { data?: Record<string, any> }).data || {};
			}
		} catch {
			// fallback below
		}

		try {
			return JSON.parse(raw);
		} catch {
			return {};
		}
	}

	let createForm = {
		doc_code: '',
		doc_name: '',
		current_revision: '00',
		effective_date: '',
		status: 'active',
		description: ''
	};

	$: filteredDocs = data.documents.filter((doc) => {
		const matchType = selectedDocType === null || doc.doc_type === selectedDocType;
		const matchDept = selectedDept === null || doc.iso_section_code === selectedDept;
		const q = appliedSearch.trim().toLowerCase();
		const nameAtt = (doc.attached_file_original_name || '').toLowerCase();
		const matchSearch =
			!q ||
			doc.doc_code.toLowerCase().includes(q) ||
			doc.doc_name.toLowerCase().includes(q) ||
			nameAtt.includes(q);
		return matchType && matchDept && matchSearch;
	});

	$: limitedFilteredDocs =
		appliedDisplayLimit === 'all'
			? filteredDocs
			: filteredDocs.slice(0, Number.parseInt(appliedDisplayLimit, 10));

	function runTableSearch() {
		appliedSearch = tableSearchDraft.trim();
		appliedDisplayLimit = displayLimitDraft;
	}

	function onTableSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			runTableSearch();
		}
	}

	$: exportHref = (() => {
		const p = new URLSearchParams();
		if (appliedSearch.trim()) p.set('search', appliedSearch.trim());
		if (selectedDocType) p.set('doc_type', selectedDocType);
		if (selectedDept) p.set('iso_section', selectedDept);
		p.set('limit', appliedDisplayLimit === 'all' ? 'all' : appliedDisplayLimit);
		return `/isodocs-control/document-list-export?${p.toString()}`;
	})();

	async function uploadMasterFile(docId: number, input: HTMLInputElement) {
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		uploadingFileId = docId;
		try {
			const formData = new FormData();
			formData.append('id', String(docId));
			formData.append('file', file);

			const response = await fetch('?/uploadFile', {
				method: 'POST',
				body: formData
			});

			const result = await parseActionData(response);
			if (result.success) {
				window.location.reload();
			} else {
				alert('Error: ' + (result.error || result.message || 'Upload failed'));
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			alert('Error: ' + message);
		} finally {
			uploadingFileId = null;
		}
	}

	async function removeMasterFile(docId: number) {
		if (!confirm('ลบไฟล์แนบออกจากรายการนี้?')) return;

		removingFileId = docId;
		try {
			const formData = new FormData();
			formData.append('id', String(docId));

			const response = await fetch('?/removeFile', {
				method: 'POST',
				body: formData
			});

			const result = await parseActionData(response);
			if (result.success) {
				window.location.reload();
			} else {
				alert('Error: ' + (result.error || result.message || 'Failed to remove file'));
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			alert('Error: ' + message);
		} finally {
			removingFileId = null;
		}
	}

	/** สำหรับ dropdown Active/Inactive — ค่า legacy (draft ฯลฯ) แสดงฝั่ง Inactive */
	function masterListStatusSelectValue(status: string): 'active' | 'inactive' {
		return (status || '').toLowerCase() === 'active' ? 'active' : 'inactive';
	}

	async function updateDocumentStatus(docId: number, docStatus: string, newValue: string) {
		const currentUi = masterListStatusSelectValue(docStatus);
		if (newValue === currentUi && ['active', 'inactive'].includes((docStatus || '').toLowerCase())) {
			return;
		}

		statusUpdatingId = docId;
		try {
			const formData = new FormData();
			formData.append('id', String(docId));
			formData.append('status', newValue);

			const response = await fetch('?/updateStatus', {
				method: 'POST',
				body: formData
			});

			const result = await parseActionData(response);
			if (result.success) {
				window.location.reload();
			} else {
				alert('Error: ' + (result.error || result.message || 'Failed to update status'));
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			alert('Error: ' + message);
		} finally {
			statusUpdatingId = null;
		}
	}

	async function deleteDocument(id: number) {
		if (!confirm('ต้องการลบเอกสารนี้ใช่ไหม?')) return;

		isDeleting = true;
		try {
			const formData = new FormData();
			formData.append('id', String(id));

			const response = await fetch('?/delete', {
				method: 'POST',
				body: formData
			});

			const result = await parseActionData(response);
			if (result.success) {
				// Reload page
				window.location.reload();
			} else {
				alert('Error: ' + (result.error || result.message || 'Failed to delete'));
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			alert('Error: ' + message);
		} finally {
			isDeleting = false;
		}
	}

	async function createDocumentMaster() {
		if (!createForm.doc_code.trim() || !createForm.doc_name.trim() || !createForm.effective_date.trim()) {
			createMessage = 'Error: กรุณากรอก Document Code, Document Name และ Effective Date';
			return;
		}

		isCreating = true;
		createMessage = '';

		try {
			const formData = new FormData();
			formData.append('doc_code', createForm.doc_code.trim());
			formData.append('doc_name', createForm.doc_name.trim());
			formData.append('current_revision', createForm.current_revision.trim() || '00');
			formData.append('effective_date', createForm.effective_date);
			formData.append('status', createForm.status);
			formData.append('description', createForm.description.trim());
			const att = createAttachInput?.files?.[0];
			if (att) formData.append('file', att);

			const response = await fetch('?/create', {
				method: 'POST',
				body: formData
			});

			const result = await parseActionData(response);
			if (result.success) {
				createMessage = result.message || 'Saved successfully';
				setTimeout(() => window.location.reload(), 800);
			} else {
				const errorMsg = typeof result.error === 'object' ? JSON.stringify(result.error) : (result.error || result.message || 'Failed to save');
				createMessage = 'Error: ' + errorMsg;
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			createMessage = 'Error: ' + message;
		} finally {
			isCreating = false;
		}
	}

	function escapeCsvCell(value: string): string {
		if (/[",\r\n]/.test(value)) {
			return `"${value.replace(/"/g, '""')}"`;
		}
		return value;
	}

	function downloadTextFile(filename: string, content: string) {
		const BOM = '\uFEFF';
		const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.rel = 'noopener';
		a.style.display = 'none';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		// Revoking immediately breaks downloads in Chrome/Safari — the navigation is async.
		setTimeout(() => URL.revokeObjectURL(url), 2000);
	}

	function downloadImportTemplate() {
		const rows: string[][] = [
			['Document code', 'Document Name', 'Rev', 'Effective Date'],
			['QP-IT-01', 'IT Security', '04', 'May 01, 2025'],
			['QP-IT-02', 'IT Data Backup', '03', 'May 31, 2025']
		];
		const content = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
		downloadTextFile('document_import_template.csv', content);
	}

	function downloadImportFileMaster() {
		const typeRefs = data.documentTypeRefs ?? [];
		const sections = data.isoSections ?? [];
		const lines: string[] = [
			'# FILE MASTER (reference only) — ไม่ใช่ไฟล์สำหรับกด Import',
			'# อ้างอิงรหัส AA (ประเภทเอกสาร) และ BB (Iso_Section) สำหรับสร้าง Document code เช่น QP-IT-01',
			'',
			'Document types (AA)',
			['Code', 'Name (EN)', 'Name (TH)'].map(escapeCsvCell).join(','),
			...typeRefs.map((t) =>
				[t.code, t.name_en, t.name_th].map(escapeCsvCell).join(',')
			),
			'',
			'Iso_Section (BB)',
			['Code', 'Name (TH)', 'Name (EN)'].map(escapeCsvCell).join(','),
			...sections.map((s) =>
				[
					s.code,
					s.name_th ?? '',
					s.name_en ?? ''
				].map(escapeCsvCell).join(',')
			)
		];
		downloadTextFile('document_import_file_master.csv', lines.join('\r\n'));
	}

	async function handleImport() {
		if (!importFile) {
			alert('กรุณาเลือกไฟล์');
			return;
		}

		importLoading = true;
		importMessage = '';

		try {
			const formData = new FormData();
			formData.append('file', importFile);

			const response = await fetch('?/import', {
				method: 'POST',
				body: formData
			});

			const result = await parseActionData(response);
			if (result.success) {
				importMessage = result.message;
				if (result.errors && result.errors.length > 0) {
					importMessage += '\n\nErrors:\n' + result.errors.join('\n');
				}
				setTimeout(() => {
					window.location.reload();
				}, 2000);
			} else {
				importMessage = 'Error: ' + (result.error || result.message || 'Failed to import');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			importMessage = 'Error: ' + message;
		} finally {
			importLoading = false;
		}
	}

	function formatEffectiveDate(dateString: string): string {
		if (!dateString) return '-';
		const date = new Date(dateString);
		if (Number.isNaN(date.getTime())) return '-';
		const months = [
			'January',
			'February',
			'March',
			'April',
			'May',
			'June',
			'July',
			'August',
			'September',
			'October',
			'November',
			'December'
		];
		// Use local date parts to avoid off-by-one from timezone conversion.
		const month = months[date.getMonth()];
		const day = String(date.getDate()).padStart(2, '0');
		const year = date.getFullYear();
		return `${month} ${day}, ${year}`;
	}

	function getDocTypeColor(type: string): string {
		const colors: Record<string, string> = {
			QM: 'bg-purple-100 text-purple-800',
			QP: 'bg-blue-100 text-blue-800',
			WI: 'bg-green-100 text-green-800',
			STD: 'bg-indigo-100 text-indigo-800',
			EIS: 'bg-cyan-100 text-cyan-800',
			FM: 'bg-yellow-100 text-yellow-800',
			SD: 'bg-orange-100 text-orange-800',
			ED: 'bg-red-100 text-red-800'
		};
		return colors[type] || 'bg-gray-100 text-gray-800';
	}

	// Get unique document types
	$: docTypes = [...new Set(data.documents.map((d) => d.doc_type))].sort();

	$: statusActiveCount = data.documents.filter(
		(d) => (d.status || '').toLowerCase() === 'active'
	).length;
	$: statusInactiveCount = data.documents.filter(
		(d) => (d.status || '').toLowerCase() === 'inactive'
	).length;

	$: docTypeTotals = data.documents.reduce<Record<string, number>>((acc, d) => {
		const t = (d.doc_type || '').trim();
		if (!t) return acc;
		acc[t] = (acc[t] || 0) + 1;
		return acc;
	}, {});
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
	<div class="mx-auto max-w-7xl">
		<!-- Header -->
		<div class="mb-8">
			<div class="flex items-center gap-3 mb-2">
				<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-white">
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
				</div>
				<div>
					<h1 class="text-3xl font-bold text-slate-900">Document Master List</h1>
					<p class="text-slate-600">รายการเอกสารระบบคุณภาพปัจจุบันของบริษัท</p>
				</div>
			</div>
		</div>

		<!-- Filters -->
		<div class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm mb-6">
			<h2 class="mb-4 text-lg font-semibold text-slate-900">Register Document Master</h2>
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<div>
					<label for="create-doc-code" class="block text-sm font-medium text-slate-900 mb-2">Document Code</label>
					<input
						id="create-doc-code"
						type="text"
						bind:value={createForm.doc_code}
						placeholder="เช่น QP-IT-01"
						class="w-full rounded-md border border-slate-300 px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="create-doc-name" class="block text-sm font-medium text-slate-900 mb-2">Document Name</label>
					<input
						id="create-doc-name"
						type="text"
						bind:value={createForm.doc_name}
						placeholder="ชื่อเอกสาร"
						class="w-full rounded-md border border-slate-300 px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="create-revision" class="block text-sm font-medium text-slate-900 mb-2">Revision</label>
					<input
						id="create-revision"
						type="text"
						bind:value={createForm.current_revision}
						placeholder="00"
						class="w-full rounded-md border border-slate-300 px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="create-effective-date" class="block text-sm font-medium text-slate-900 mb-2">Effective Date</label>
					<input
						id="create-effective-date"
						type="date"
						bind:value={createForm.effective_date}
						class="w-full rounded-md border border-slate-300 px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="create-status" class="block text-sm font-medium text-slate-900 mb-2">Status</label>
					<select
						id="create-status"
						bind:value={createForm.status}
						class="w-full rounded-md border border-slate-300 px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					>
						<option value="active">Active</option>
						<option value="inactive">Inactive</option>
					</select>
				</div>
				<div class="sm:col-span-2 lg:col-span-3">
					<label for="create-description" class="block text-sm font-medium text-slate-900 mb-2">Description</label>
					<textarea
						id="create-description"
						bind:value={createForm.description}
						rows="2"
						placeholder="รายละเอียดเพิ่มเติม"
						class="w-full rounded-md border border-slate-300 px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					></textarea>
				</div>
				<div class="sm:col-span-2 lg:col-span-3">
					<span class="block text-sm font-medium text-slate-900 mb-2">แนบไฟล์ (ไม่บังคับ)</span>
					<p class="text-xs text-slate-500 mb-2">รองรับ PDF, Word (.doc, .docx) สูงสุด 35 MB — เก็บที่ uploads/isodocs/document-master</p>
					<input
						bind:this={createAttachInput}
						id="create-attach"
						type="file"
						accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
						class="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
					/>
				</div>
			</div>

			<div class="mt-4 flex items-center gap-3">
				<button
					type="button"
					onclick={createDocumentMaster}
					disabled={isCreating}
					class="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{isCreating ? 'Saving...' : 'Register Document'}
				</button>
				{#if createMessage}
					<p class="text-sm {createMessage.startsWith('Error:') ? 'text-red-600' : 'text-green-600'}">{createMessage}</p>
				{/if}
			</div>
		</div>

		<!-- Filters -->
		<div class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm mb-6">
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label for="type-filter" class="block text-sm font-medium text-slate-900 mb-2">
						Filter by Type (AA)
					</label>
					<select
						id="type-filter"
						bind:value={selectedDocType}
						class="w-full rounded-md border border-slate-300 px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					>
						<option value={null}>-- All Types --</option>
						{#each docTypes as type (type)}
							<option value={type}>{type}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="dept-filter" class="block text-sm font-medium text-slate-900 mb-2">
						Filter by Iso_Section (BB)
					</label>
					<select
						id="dept-filter"
						bind:value={selectedDept}
						class="w-full rounded-md border border-slate-300 px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					>
						<option value={null}>-- All Iso_Sections --</option>
						{#each data.isoSections as sec (sec.id)}
							<option value={sec.code}>
								{sec.code}{sec.name_th ? ` - ${sec.name_th}` : ''}
							</option>
						{/each}
					</select>
				</div>
			</div>

			<!-- Action Buttons -->
			<div class="mt-4 flex gap-2">
				<button
					onclick={() => (showImportModal = true)}
					class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 transition-colors"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					Import Documents
				</button>
			</div>
		</div>

		<!-- Table toolbar (match IsoDocs Audit Log format) -->
		<div class="mb-3 flex flex-wrap items-end justify-between gap-3">
			<p class="text-sm text-gray-600">
				Showing <span class="font-bold text-gray-900">{limitedFilteredDocs.length}</span> of
				<span class="font-bold text-gray-900">{data.documents.length}</span> documents
				{#if appliedDisplayLimit !== 'all' && limitedFilteredDocs.length < filteredDocs.length}
					<span class="text-gray-500"> (display limit {appliedDisplayLimit})</span>
				{/if}
			</p>
			<div class="flex w-full flex-wrap items-end justify-end gap-2 lg:w-auto">
				<div>
					<label for="dml-toolbar-search" class="mb-1 block text-xs font-semibold text-gray-500">Search</label>
					<input
						id="dml-toolbar-search"
						type="text"
						bind:value={tableSearchDraft}
						onkeydown={onTableSearchKeydown}
						placeholder="Search..."
						class="w-52 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 lg:w-64"
					/>
				</div>
				<div>
					<label for="dml-display-limit" class="mb-1 block text-xs font-semibold text-gray-500">Display limit</label>
					<select
						id="dml-display-limit"
						bind:value={displayLimitDraft}
						class="min-w-[76px] rounded border border-gray-300 bg-white px-2 py-1 pr-7 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					>
						<option value="20">20</option>
						<option value="50">50</option>
						<option value="100">100</option>
						<option value="200">200</option>
						<option value="all">All</option>
					</select>
				</div>
				<button
					type="button"
					onclick={runTableSearch}
					class="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
				>
					Search
				</button>
				<a
					href={exportHref}
					class="inline-flex items-center rounded border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100"
				>
					Download Excel
				</a>
			</div>
		</div>

		<!-- Documents Table -->
		<div class="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-slate-100 border-b border-slate-200">
						<tr>
							<th class="px-6 py-4 text-left text-sm font-semibold text-slate-900">Document Code</th>
							<th class="px-6 py-4 text-left text-sm font-semibold text-slate-900">Document Name</th>
							<th class="px-6 py-4 text-left text-sm font-semibold text-slate-900">Type</th>
							<th
								class="whitespace-nowrap px-2 py-3 text-center text-xs font-semibold text-slate-900"
								title="Iso_Section (BB)"
							>
								Section
							</th>
							<th class="px-6 py-4 text-left text-sm font-semibold text-slate-900">Revision</th>
							<th class="whitespace-nowrap px-6 py-4 text-left text-sm font-semibold text-slate-900">Effective Date</th>
							<th class="w-[6.5rem] px-2 py-3 text-left text-xs font-semibold text-slate-900">Status</th>
							<th class="w-40 min-w-[9rem] max-w-[11rem] px-2 py-3 text-left text-sm font-semibold text-slate-900">File</th>
							<th class="px-6 py-4 text-center text-sm font-semibold text-slate-900">Action</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-200">
						{#if limitedFilteredDocs.length > 0}
							{#each limitedFilteredDocs as doc (doc.id)}
								<tr class="hover:bg-slate-50 transition-colors">
									<td class="px-6 py-4 whitespace-nowrap">
										<span class="font-mono font-bold text-blue-600 whitespace-nowrap">{doc.doc_code}</span>
									</td>
									<td class="px-6 py-4">
										<div>
											<p class="text-slate-900 font-medium">{doc.doc_name}</p>
											{#if doc.description}
												<p class="text-xs text-slate-500 mt-1">{doc.description}</p>
											{/if}
										</div>
									</td>
									<td class="px-6 py-4">
										<span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium {getDocTypeColor(doc.doc_type)}">
											{doc.doc_type}
										</span>
									</td>
									<td class="px-2 py-3 text-center text-sm text-slate-600 whitespace-nowrap">
										{doc.iso_section_code || '-'}
									</td>
									<td class="px-6 py-4">
										<span class="font-mono font-bold text-slate-900">Rev.{doc.current_revision}</span>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-slate-600">{formatEffectiveDate(doc.effective_date)}</td>
									<td class="w-[6.5rem] max-w-[6.5rem] px-2 py-3 whitespace-nowrap">
										<select
											class="w-full max-w-full rounded border border-slate-300 bg-white py-1 pl-1.5 pr-6 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
											value={masterListStatusSelectValue(doc.status)}
											disabled={statusUpdatingId === doc.id || isDeleting || uploadingFileId !== null}
											onchange={(e) =>
												updateDocumentStatus(
													doc.id,
													doc.status,
													(e.currentTarget as HTMLSelectElement).value
												)}
											aria-label="สถานะเอกสาร"
										>
											<option value="active">Active</option>
											<option value="inactive">Inactive</option>
										</select>
										{#if !['active', 'inactive'].includes((doc.status || '').toLowerCase())}
											<p class="mt-1 max-w-full truncate text-[10px] leading-tight text-amber-700" title={doc.status}>
												DB: {doc.status}
											</p>
										{/if}
									</td>
									<td class="min-w-0 max-w-[11rem] w-40 px-2 py-3 align-top text-xs">
										{#if doc.attached_file_system_name}
											<div class="flex min-w-0 max-w-full flex-col gap-1.5">
												<a
													href="/isodocs-control/document-list/download/{doc.id}"
													target="_blank"
													rel="noopener noreferrer"
													class="block min-w-0 truncate font-medium leading-snug text-blue-600 hover:underline"
													title={doc.attached_file_original_name ?? ''}
												>
													{doc.attached_file_original_name || 'เปิดไฟล์'}
												</a>
												<div class="flex flex-col gap-1">
													<label
														title="เปลี่ยนไฟล์"
														class="cursor-pointer rounded border border-slate-300 bg-white px-1.5 py-0.5 text-center text-[11px] font-semibold leading-tight text-slate-700 hover:bg-slate-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
													>
														{uploadingFileId === doc.id ? '…' : 'เปลี่ยน'}
														<input
															type="file"
															class="sr-only"
															accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
															disabled={uploadingFileId !== null || removingFileId !== null || isDeleting}
															onchange={(e) =>
																uploadMasterFile(doc.id, e.currentTarget as HTMLInputElement)}
														/>
													</label>
													<button
														type="button"
														title="ลบไฟล์แนบ"
														onclick={() => removeMasterFile(doc.id)}
														disabled={
															removingFileId === doc.id ||
															uploadingFileId !== null ||
															isDeleting
														}
														class="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-center text-[11px] font-semibold leading-tight text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
													>
														{removingFileId === doc.id ? '…' : 'ลบ'}
													</button>
												</div>
											</div>
										{:else}
											<label
												title="อัปโหลดไฟล์"
												class="flex min-w-0 cursor-pointer justify-center rounded border border-dashed border-slate-300 bg-slate-50 px-1.5 py-1.5 text-center text-[11px] font-semibold leading-tight text-slate-700 hover:bg-slate-100 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
											>
												{uploadingFileId === doc.id ? '…' : 'อัปโหลด'}
												<input
													type="file"
													class="sr-only"
													accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
													disabled={uploadingFileId !== null || removingFileId !== null || isDeleting}
													onchange={(e) =>
														uploadMasterFile(doc.id, e.currentTarget as HTMLInputElement)}
												/>
											</label>
										{/if}
									</td>
									<td class="px-6 py-4 text-center">
										<button
											type="button"
											onclick={() => deleteDocument(doc.id)}
											disabled={isDeleting || uploadingFileId !== null}
											class="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
										>
											Delete
										</button>
									</td>
								</tr>
							{/each}
						{:else}
							<tr>
								<td colspan="9" class="px-6 py-12 text-center">
									<div class="flex flex-col items-center justify-center text-slate-500">
										<svg class="h-12 w-12 mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
										</svg>
										<p class="text-sm">No documents found</p>
									</div>
								</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Statistics -->
		<div class="mt-8 grid gap-4 sm:grid-cols-4">
			<div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
				<div class="text-sm text-slate-600">Total Documents</div>
				<div class="text-2xl font-bold text-slate-900 mt-1">{data.documents.length}</div>
			</div>
			<div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
				<div class="text-sm text-slate-600">Iso_Sections</div>
				<div class="text-2xl font-bold text-slate-900 mt-1">{data.isoSections.length}</div>
			</div>
			<div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
				<div class="text-sm text-slate-600">Active / Inactive</div>
				<div class="mt-1 flex items-baseline gap-0.5 text-2xl font-bold tabular-nums">
					<span class="text-green-600" title="Active">{statusActiveCount}</span>
					<span class="text-slate-400 font-semibold">/</span>
					<span class="text-red-600" title="Inactive">{statusInactiveCount}</span>
				</div>
			</div>
			<div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
				<div class="text-sm text-slate-600">Document Types</div>
				<div class="text-2xl font-bold text-slate-900 mt-1">
					{new Set(data.documents.map((d) => d.doc_type)).size}
				</div>
			</div>
		</div>

		<!-- Legend -->
		<div class="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
			<h3 class="text-lg font-semibold text-slate-900 mb-4">Document Type Legend</h3>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div class="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5">
					<span class="inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium bg-purple-100 text-purple-800">QM</span>
					<span class="max-w-[11rem] truncate text-sm text-slate-600">Quality Manual</span>
					<span class="shrink-0 text-sm tabular-nums text-slate-600">
						Total <strong class="text-slate-900">{docTypeTotals['QM'] ?? 0}</strong>
					</span>
				</div>
				<div class="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5">
					<span class="inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium bg-blue-100 text-blue-800">QP</span>
					<span class="max-w-[11rem] truncate text-sm text-slate-600">Quality Procedure</span>
					<span class="shrink-0 text-sm tabular-nums text-slate-600">
						Total <strong class="text-slate-900">{docTypeTotals['QP'] ?? 0}</strong>
					</span>
				</div>
				<div class="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5">
					<span class="inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium bg-green-100 text-green-800">WI</span>
					<span class="max-w-[11rem] truncate text-sm text-slate-600">Work Instruction</span>
					<span class="shrink-0 text-sm tabular-nums text-slate-600">
						Total <strong class="text-slate-900">{docTypeTotals['WI'] ?? 0}</strong>
					</span>
				</div>
				<div class="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5">
					<span class="inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium bg-indigo-100 text-indigo-800">STD</span>
					<span class="max-w-[11rem] truncate text-sm text-slate-600">Standardized Work</span>
					<span class="shrink-0 text-sm tabular-nums text-slate-600">
						Total <strong class="text-slate-900">{docTypeTotals['STD'] ?? 0}</strong>
					</span>
				</div>
				<div class="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5">
					<span class="inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium bg-cyan-100 text-cyan-800">EIS</span>
					<span class="max-w-[11rem] truncate text-sm text-slate-600">Element Instruction</span>
					<span class="shrink-0 text-sm tabular-nums text-slate-600">
						Total <strong class="text-slate-900">{docTypeTotals['EIS'] ?? 0}</strong>
					</span>
				</div>
				<div class="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5">
					<span class="inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800">FM</span>
					<span class="max-w-[11rem] truncate text-sm text-slate-600">Form</span>
					<span class="shrink-0 text-sm tabular-nums text-slate-600">
						Total <strong class="text-slate-900">{docTypeTotals['FM'] ?? 0}</strong>
					</span>
				</div>
				<div class="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5">
					<span class="inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium bg-orange-100 text-orange-800">SD</span>
					<span class="max-w-[11rem] truncate text-sm text-slate-600">Support Document</span>
					<span class="shrink-0 text-sm tabular-nums text-slate-600">
						Total <strong class="text-slate-900">{docTypeTotals['SD'] ?? 0}</strong>
					</span>
				</div>
				<div class="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5">
					<span class="inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium bg-red-100 text-red-800">ED</span>
					<span class="max-w-[11rem] truncate text-sm text-slate-600">External Document</span>
					<span class="shrink-0 text-sm tabular-nums text-slate-600">
						Total <strong class="text-slate-900">{docTypeTotals['ED'] ?? 0}</strong>
					</span>
				</div>
			</div>
		</div>
	</div>
</div>

{#if showImportModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="w-full max-w-2xl rounded-xl bg-white shadow-2xl">
			<div class="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
				<div class="min-w-0 flex-1">
					<h2 class="text-xl font-bold text-slate-900">Import Documents</h2>
					<p class="text-sm text-slate-500">รองรับไฟล์ `.xlsx`, `.csv`, `.txt`</p>
				</div>
				<div class="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
					<button
						type="button"
						onclick={downloadImportTemplate}
						class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
					>
						Download template
					</button>
					<button
						type="button"
						onclick={downloadImportFileMaster}
						class="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 shadow-sm hover:bg-blue-100"
					>
						File Master
					</button>
					<button
						type="button"
						onclick={() => {
							showImportModal = false;
							importMessage = '';
							importFile = null;
						}}
						class="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
						aria-label="Close"
					>
						✕
					</button>
				</div>
			</div>

			<div class="space-y-4 px-6 py-5">
				<div class="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
					<p class="font-semibold">รูปแบบคอลัมน์ที่ต้องมี</p>
					<ul class="mt-2 space-y-1 text-sm">
						<li>- `Document code`</li>
						<li>- `Document Name` (optional)</li>
						<li>- `Rev` หรือ `Rev.00`</li>
						<li>- `Effective Date` เช่น `May 01, 2025`</li>
					</ul>
					<p class="mt-3 border-t border-blue-200 pt-3 text-xs leading-relaxed text-blue-950">
						<strong>Download template</strong> — ไฟล์ตัวอย่างพร้อมหัวคอลัมน์สำหรับกรอกแล้วนำไป Import<br />
						<strong>File Master</strong> — ไฟล์อ้างอิงรหัสประเภทเอกสาร (AA) และ Iso_Section (BB) เปิดดูเท่านั้น
						<span class="text-blue-800">ไม่ใช่ไฟล์ที่กด Import</span>
					</p>
				</div>

				<div class="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
					<p class="font-semibold text-slate-900">ตัวอย่าง</p>
					<div class="mt-2 overflow-x-auto">
						<table class="min-w-full text-xs">
							<thead>
								<tr class="text-left text-slate-600">
									<th class="pr-4 pb-2">Document code</th>
									<th class="pr-4 pb-2">Document Name</th>
									<th class="pr-4 pb-2">Rev.</th>
									<th class="pb-2">Effective Date</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td class="pr-4 py-1 font-mono">QP-IT-01</td>
									<td class="pr-4 py-1">IT Security</td>
									<td class="pr-4 py-1">04</td>
									<td class="py-1">May 01, 2025</td>
								</tr>
								<tr>
									<td class="pr-4 py-1 font-mono">QP-IT-02</td>
									<td class="pr-4 py-1">IT Data Backup</td>
									<td class="pr-4 py-1">03</td>
									<td class="py-1">May 31, 2025</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>

				<div>
					<label for="import-file" class="mb-2 block text-sm font-medium text-slate-900">เลือกไฟล์</label>
					<input
						id="import-file"
						type="file"
						accept=".xlsx,.csv,.txt"
						onchange={(event) => {
							const target = event.currentTarget as HTMLInputElement;
							importFile = target.files?.[0] || null;
						}}
						class="block w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
					/>
				</div>

				{#if importMessage}
					<div class="whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
						{importMessage}
					</div>
				{/if}
			</div>

			<div class="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
				<button
					type="button"
					onclick={() => {
						showImportModal = false;
						importMessage = '';
						importFile = null;
					}}
					class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={handleImport}
					disabled={importLoading}
					class="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{importLoading ? 'Importing...' : 'Import'}
				</button>
			</div>
		</div>
	</div>
{/if}
