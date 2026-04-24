<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { DAR_UI_WORKFLOW_LINE } from '$lib/darWorkflowLabels';
	import type { PageData } from './$types';

	export let data: PageData;

	const fieldClass =
		'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
	const fieldReadonlyClass =
		'w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600';
	const compactFieldClass =
		'w-full min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

	type RequestItem = {
		document_master_id: number | null;
		document_code: string;
		document_name: string;
		revision: string;
		effective_date: string;
		request_reason: string;
		copies_requested: number | null;
	};

	const documentTypeOptions = ['QM', 'QP', 'WI', 'STD', 'EIS', 'FM', 'SD', 'ED'];
	const revisionOptions = [''].concat(
		Array.from({ length: 31 }, (_, i) => String(i).padStart(2, '0'))
	);
	const newDocCodeOptions = Array.from(new Set(data.documents.map((d) => String(d.doc_code || '').trim())))
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

	function revisionToNumber(rev: string | null | undefined): number {
		const n = Number(String(rev || '').replace(/[^\d]/g, ''));
		return Number.isFinite(n) ? n : -1;
	}

	function findLatestDocumentByCode(docCode: string) {
		const code = docCode.trim().toUpperCase();
		const sameCode = data.documents.filter((d) => String(d.doc_code || '').trim().toUpperCase() === code);
		if (!sameCode.length) return null;
		return [...sameCode].sort(
			(a, b) => revisionToNumber(String(b.current_revision || '')) - revisionToNumber(String(a.current_revision || ''))
		)[0];
	}

	function createDefaultRow(): RequestItem {
		return {
			document_master_id: null,
			document_code: '',
			document_name: '',
			revision: '',
			effective_date: '',
			request_reason: '',
			copies_requested: null
		};
	}

	let requestType = 'new_document';
	let requestDate = data.today;
	let selectedDocumentTypes: string[] = [];
	let remark = '';

	let rows: RequestItem[] = [createDefaultRow()];

	let submitMessage = '';
	let submitError = '';
	let isSubmitting = false;

	/** When request type changes, clear line items — values from the previous mode are rarely valid. */
	let previousRequestType: string | null = null;
	$: {
		if (previousRequestType === null) {
			previousRequestType = requestType;
		} else if (requestType !== previousRequestType) {
			rows = [createDefaultRow()];
			submitMessage = '';
			submitError = '';
			previousRequestType = requestType;
		}
	}

	function addRow() {
		rows = [...rows, createDefaultRow()];
	}

	function removeRow(index: number) {
		if (rows.length === 1) return;
		rows = rows.filter((_, i) => i !== index);
	}

	function onSelectDocument(index: number, docIdValue: string) {
		const docId = Number(docIdValue);
		const selected = data.documents.find((doc) => doc.id === docId);
		if (!selected) {
			rows[index] = {
				...rows[index],
				document_master_id: null,
				document_code: '',
				document_name: '',
				revision: '',
				effective_date: ''
			};
			rows = rows;
			return;
		}

		rows[index] = {
			...rows[index],
			document_master_id: selected.id,
			document_code: selected.doc_code,
			document_name: selected.doc_name,
			revision: selected.current_revision,
			effective_date: toDateInputValue(selected.effective_date || '')
		};
		rows = rows;
	}

	function onSelectNewDocumentCode(index: number, selectedCode: string) {
		if (!selectedCode) {
			rows[index] = {
				...rows[index],
				document_code: '',
				document_name: '',
				revision: '',
				effective_date: ''
			};
			rows = rows;
			return;
		}

		const latest = findLatestDocumentByCode(selectedCode);
		rows[index] = {
			...rows[index],
			document_code: selectedCode,
			document_name: latest?.doc_name || rows[index].document_name || '',
			revision: latest?.current_revision || rows[index].revision || '',
			effective_date: toDateInputValue(latest?.effective_date || rows[index].effective_date || '')
		};
		rows = rows;
	}

	/** Normalize DB/ISO strings to YYYY-MM-DD for `<input type="date">` */
	function toDateInputValue(raw: string | null | undefined): string {
		const s = String(raw ?? '').trim();
		if (!s) return '';
		if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
		const iso = s.match(/^(\d{4}-\d{2}-\d{2})[T ]/);
		if (iso) return iso[1];
		const d = new Date(s);
		if (Number.isNaN(d.getTime())) return '';
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd}`;
	}

	$: itemsPayload = JSON.stringify(
		rows.map((row, index) => ({
			line_no: index + 1,
			document_master_id: row.document_master_id,
			document_code: row.document_code,
			document_name: row.document_name,
			revision: row.revision,
			effective_date: row.effective_date || null,
			request_reason: row.request_reason,
			copies_requested:
				requestType === 'request_copy' ? Number(row.copies_requested || 0) || null : null
		}))
	);
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
	<div class="mx-auto max-w-7xl space-y-6">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
			<div class="flex items-start gap-3">
				<div
					class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm"
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
				</div>
				<div>
					<h1 class="text-3xl font-bold text-slate-900">ใบร้องขอดำเนินการเอกสาร</h1>
					<p class="mt-1 text-slate-600">Document Action Request (DAR)</p>
					<p class="mt-1 text-sm text-slate-500">{DAR_UI_WORKFLOW_LINE}</p>
				</div>
			</div>
			<div class="flex flex-col items-start gap-3 sm:items-end">
				<div class="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-sm sm:w-auto sm:text-right">
					<div class="text-xs font-medium uppercase tracking-wide text-slate-500">DAR No.</div>
					<div class="font-mono text-lg font-semibold text-slate-400">Auto-assigned</div>
				</div>
				<a
					href="/isodocs-control/dar-list"
					class="text-sm font-semibold text-blue-600 hover:text-blue-800"
				>
					← Back to DAR List
				</a>
			</div>
		</div>

		<form
			method="POST"
			action="?/submitDar"
			enctype="multipart/form-data"
			class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
			use:enhance={() => {
				submitMessage = '';
				submitError = '';
				isSubmitting = true;
				return async ({ result }) => {
					isSubmitting = false;
					if (result.type === 'success') {
						submitMessage =
							typeof result.data?.message === 'string'
								? result.data.message
								: 'DAR submitted successfully';
						await invalidateAll();
					} else if (result.type === 'failure') {
						submitError =
							typeof result.data?.message === 'string'
								? result.data.message
								: 'Failed to submit DAR';
					} else {
						submitError = 'Unexpected response from server';
					}
				};
			}}
		>
			<input type="hidden" name="items_json" value={itemsPayload} />

			<div class="rounded-lg border border-slate-200 bg-slate-50/60 p-5">
				<div class="border-b border-slate-200 pb-3">
					<h2 class="text-lg font-semibold text-slate-900">ส่วนที่ 1 — ผู้ร้องขอ</h2>
					<p class="mt-0.5 text-sm text-slate-600">For requestor · เลือกประเภทคำขอและขอบเขตเอกสาร</p>
				</div>
				<div class="mt-5 grid gap-8 md:grid-cols-2">
					<div class="space-y-3">
						<p class="text-sm font-medium text-slate-900">ชนิดดำเนินการขอ (Request for)</p>
						<div class="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800">
							<label class="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50">
								<input
									type="radio"
									name="request_type"
									value="new_document"
									bind:group={requestType}
									class="mt-0.5 border-slate-300 text-blue-600 focus:ring-blue-500"
								/>
								<span>ขึ้นทะเบียนเอกสารใหม่ (Issue new document)</span>
							</label>
							<label class="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50">
								<input
									type="radio"
									name="request_type"
									value="revise_document"
									bind:group={requestType}
									class="mt-0.5 border-slate-300 text-blue-600 focus:ring-blue-500"
								/>
								<span>ขอแก้ไขเปลี่ยนแปลง (Revision)</span>
							</label>
							<label class="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50">
								<input
									type="radio"
									name="request_type"
									value="cancel_document"
									bind:group={requestType}
									class="mt-0.5 border-slate-300 text-blue-600 focus:ring-blue-500"
								/>
								<span>ยกเลิกเอกสาร (Cancel document)</span>
							</label>
							<label class="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50">
								<input
									type="radio"
									name="request_type"
									value="request_copy"
									bind:group={requestType}
									class="mt-0.5 border-slate-300 text-blue-600 focus:ring-blue-500"
								/>
								<span>สำเนาเอกสาร (Request copy document)</span>
							</label>
						</div>
					</div>
					<div class="space-y-4">
						<div>
							<p class="text-sm font-medium text-slate-900">ประเภทของเอกสาร (Type of document)</p>
							<div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
								{#each documentTypeOptions as type (type)}
									<label
										class="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:border-slate-300"
									>
										<input
											type="checkbox"
											name="document_type_scope"
											value={type}
											bind:group={selectedDocumentTypes}
											class="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
										/>
										{type}
									</label>
								{/each}
							</div>
						</div>
						<div>
							<label for="dar-request-date" class="mb-2 block text-sm font-medium text-slate-900">
								วันที่และเวลาร้องขอ (Request date and time)
							</label>
							<input
								id="dar-request-date"
								type="datetime-local"
								name="request_date"
								bind:value={requestDate}
								required
								class={fieldClass}
							/>
							<p class="mt-1 text-xs text-slate-500">เลือกวันที่และเวลาที่ทำคำขอ (เก็บตามเวลาเครื่องของคุณ)</p>
						</div>
					</div>
				</div>
			</div>

			<div class="mt-6 overflow-hidden rounded-lg border border-slate-200">
				<div class="border-b border-slate-200 bg-slate-50 px-5 py-4">
					<h2 class="text-lg font-semibold text-slate-900">รายละเอียดเอกสาร</h2>
					<p class="mt-0.5 text-sm text-slate-600">Details of documents requested</p>
				</div>
				<div class="overflow-x-auto">
					<table class="w-full min-w-[880px] table-fixed text-sm">
						<thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
							<tr>
								<th class="w-10 border-b border-slate-200 px-2 py-3">No.</th>
								<th class="w-[7.5rem] border-b border-slate-200 px-2 py-3">Document Code</th>
								<th class="border-b border-slate-200 px-2 py-3">Document Name</th>
								<th class="w-20 border-b border-slate-200 px-2 py-3">Revision</th>
								<th class="w-[9.25rem] border-b border-slate-200 px-2 py-3">Effective Date</th>
								<th class="border-b border-slate-200 px-2 py-3">Request Reason</th>
								<th class="w-36 border-b border-slate-200 px-2 py-3">Attachment</th>
								{#if requestType === 'request_copy'}
									<th class="w-16 border-b border-slate-200 px-2 py-3">Copies</th>
								{/if}
								<th class="w-24 border-b border-slate-200 px-2 py-3 text-center">Action</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-200 bg-white">
							{#each rows as row, index}
								<tr class="hover:bg-slate-50/80">
									<td class="px-2 py-2 text-center text-xs text-slate-600">{index + 1}</td>
									<td class="max-w-[7.5rem] px-2 py-2 align-top">
										{#if requestType === 'new_document'}
											<select
												value={row.document_code}
												on:change={(e) =>
													onSelectNewDocumentCode(index, (e.currentTarget as HTMLSelectElement).value)}
												class={`${compactFieldClass} font-mono`}
											>
												<option value="">-- Auto --</option>
												{#each newDocCodeOptions as code (code)}
													<option value={code}>{code}</option>
												{/each}
											</select>
										{:else}
											<select
												value={row.document_master_id || ''}
												on:change={(e) =>
													onSelectDocument(index, (e.currentTarget as HTMLSelectElement).value)}
												class={`${compactFieldClass} font-mono`}
											>
												<option value="">--</option>
												{#each data.documents as doc (doc.id)}
													<option value={doc.id}>{doc.doc_code}</option>
												{/each}
											</select>
										{/if}
									</td>
									<td class="min-w-0 px-2 py-2 align-top">
										<input
											type="text"
											bind:value={row.document_name}
											on:input={() => {
												row.document_code = row.document_code || '';
												rows = rows;
											}}
											class={compactFieldClass}
										/>
									</td>
									<td class="w-20 px-2 py-2 align-top text-center">
										{#if requestType === 'new_document'}
											<select
												bind:value={row.revision}
												class={`${compactFieldClass} mx-auto block w-14 text-center font-mono`}
											>
												<option value="">--</option>
												{#each revisionOptions as rev (rev)}
													{#if rev}
														<option value={rev}>{rev}</option>
													{/if}
												{/each}
											</select>
										{:else}
											<input
												type="text"
												bind:value={row.revision}
												readonly
												class={`${fieldReadonlyClass} mx-auto block w-14 text-center font-mono`}
											/>
										{/if}
									</td>
									<td class="w-[9.25rem] px-2 py-2 align-top">
										<input
											type="date"
											bind:value={row.effective_date}
											class={`${compactFieldClass} font-mono`}
										/>
									</td>
									<td class="min-w-0 px-2 py-2 align-top">
										<input type="text" bind:value={row.request_reason} class={compactFieldClass} />
									</td>
									<td class="px-2 py-2 align-top">
										<input
											type="file"
											name={`item_attachment_${index}`}
											class="block w-full min-w-0 text-[10px] text-slate-600 file:mr-1 file:rounded file:border-0 file:bg-slate-100 file:px-1.5 file:py-1 file:text-[10px] file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
										/>
									</td>
									{#if requestType === 'request_copy'}
										<td class="px-2 py-2 align-top">
											<input
												type="number"
												min="1"
												bind:value={row.copies_requested}
												class={`${compactFieldClass} text-center`}
											/>
										</td>
									{/if}
									<td class="px-2 py-2 align-top text-center">
										<button
											type="button"
											on:click={() => removeRow(index)}
											class="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
										>
											Delete
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div
					class="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
				>
					<button
						type="button"
						on:click={addRow}
						class="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100"
					>
						+ Add Row
					</button>
					<p class="text-xs text-slate-500">
						{#if requestType === 'new_document'}
							You may enter Document Code and Revision. Leave as `--`/blank to auto-generate at QMR register.
						{:else}
							Revision pre-fills from the master list. Effective date pre-fills when you select a code; you can
							edit it before submit.
						{/if}
					</p>
				</div>
			</div>

			<div class="mt-6 grid gap-6 lg:grid-cols-2">
				<div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
					<label for="dar-remark" class="mb-2 block text-sm font-medium text-slate-900">
						หมายเหตุ (Remark)
					</label>
					<textarea
						id="dar-remark"
						name="remark"
						bind:value={remark}
						rows="5"
						class={`${fieldClass} resize-y`}
						placeholder="ระบุหมายเหตุเพิ่มเติม (ถ้ามี)"
					></textarea>
				</div>
				<div class="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
					<h3 class="text-sm font-semibold text-slate-900">ผู้ร้องขอดำเนินการ (Requestor)</h3>
					<dl class="mt-4 space-y-2 text-sm text-slate-700">
						<div class="flex gap-2">
							<dt class="w-24 shrink-0 font-medium text-slate-600">ชื่อ</dt>
							<dd>{data.requester.full_name}</dd>
						</div>
						<div class="flex gap-2">
							<dt class="w-24 shrink-0 font-medium text-slate-600">ตำแหน่ง</dt>
							<dd>{data.requester.position_name || '—'}</dd>
						</div>
						<div class="flex gap-2">
							<dt class="w-24 shrink-0 font-medium text-slate-600">ฝ่าย</dt>
							<dd>{data.requester.department_name || '—'}</dd>
						</div>
						<div class="flex gap-2 border-t border-slate-200 pt-3">
							<dt class="w-24 shrink-0 font-medium text-slate-600">วันที่/เวลา</dt>
							<dd class="font-mono text-xs">{requestDate.replace('T', ' ')}</dd>
						</div>
					</dl>
				</div>
			</div>

			<div class="mt-8 flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
				<div class="min-h-[1.5rem] space-y-1">
					{#if submitMessage}
						<p class="text-sm font-semibold text-green-600">{submitMessage}</p>
					{/if}
					{#if submitError}
						<p class="text-sm font-semibold text-red-600">{submitError}</p>
					{/if}
				</div>
				<button
					type="submit"
					disabled={isSubmitting}
					class="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{isSubmitting ? 'Submitting...' : 'Submit DAR'}
				</button>
			</div>
		</form>
	</div>
</div>
