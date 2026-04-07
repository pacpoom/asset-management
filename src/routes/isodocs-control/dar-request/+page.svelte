<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

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

	let requestType = 'new_document';
	let requestDate = data.today;
	let selectedDocumentTypes: string[] = [];
	let remark = '';

	let rows: RequestItem[] = [
		{
			document_master_id: null,
			document_code: '',
			document_name: '',
			revision: '00',
			effective_date: '',
			request_reason: '',
			copies_requested: null
		}
	];

	let submitMessage = '';
	let submitError = '';
	let isSubmitting = false;

	function addRow() {
		rows = [
			...rows,
			{
				document_master_id: null,
				document_code: '',
				document_name: '',
				revision: '00',
				effective_date: '',
				request_reason: '',
				copies_requested: null
			}
		];
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
				revision: '00',
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
			effective_date: selected.effective_date || ''
		};
		rows = rows;
	}

	function formatDateForDisplay(dateString: string): string {
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
		return `${months[date.getUTCMonth()]} ${String(date.getUTCDate()).padStart(2, '0')}, ${date.getUTCFullYear()}`;
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

<div class="mx-auto max-w-[1100px] p-4">
	<div class="rounded-md border-2 border-slate-700 bg-white p-4 shadow">
		<div class="border-b border-slate-400 pb-3">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-center text-3xl font-black text-slate-900">ใบร้องขอดำเนินการเอกสาร</h1>
					<h2 class="text-center text-xl font-bold text-slate-800">(Document Action Request : DAR)</h2>
				</div>
				<div class="text-right text-sm font-semibold text-slate-700">
					<div>DAR No. (Auto)</div>
					<div>____________</div>
				</div>
			</div>
		</div>

		<form
			method="POST"
			action="?/submitDar"
			enctype="multipart/form-data"
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

			<div class="mt-3 border border-slate-400">
				<div class="bg-cyan-300 px-2 py-1 text-sm font-bold text-slate-900">
					ส่วนที่ 1 : สำหรับผู้ร้องขอ (For Requestor)
				</div>
				<div class="grid gap-4 p-3 md:grid-cols-2">
					<div class="space-y-2 text-sm">
						<p class="font-semibold">ชนิดดำเนินการขอ (Request for)</p>
						<label class="flex items-center gap-2">
							<input type="radio" name="request_type" value="new_document" bind:group={requestType} />
							ขึ้นทะเบียนเอกสารใหม่ (Issue new document)
						</label>
						<label class="flex items-center gap-2">
							<input type="radio" name="request_type" value="revise_document" bind:group={requestType} />
							ขอแก้ไขเปลี่ยนแปลง (Revision)
						</label>
						<label class="flex items-center gap-2">
							<input type="radio" name="request_type" value="cancel_document" bind:group={requestType} />
							ยกเลิกเอกสาร (Cancel document)
						</label>
						<label class="flex items-center gap-2">
							<input type="radio" name="request_type" value="request_copy" bind:group={requestType} />
							สำเนาเอกสาร (Request copy document)
						</label>
					</div>
					<div class="space-y-2 text-sm">
						<p class="font-semibold">ประเภทของเอกสาร (Type of document)</p>
						<div class="grid grid-cols-2 gap-1">
							{#each documentTypeOptions as type (type)}
								<label class="flex items-center gap-2">
									<input type="checkbox" name="document_type_scope" value={type} bind:group={selectedDocumentTypes} />
									{type}
								</label>
							{/each}
						</div>
						<div>
							<label for="dar-request-date" class="mb-1 block font-semibold">วันที่ร้องขอ</label>
							<input
								id="dar-request-date"
								type="date"
								name="request_date"
								bind:value={requestDate}
								required
								class="w-full rounded border border-slate-400 px-2 py-1"
							/>
						</div>
					</div>
				</div>
			</div>

			<div class="mt-3 border border-slate-400">
				<div class="bg-slate-200 px-2 py-1 text-sm font-bold text-slate-900">
					รายละเอียดเอกสารที่ขอดำเนินการ (Details of document that request)
				</div>
				<div class="overflow-x-auto">
					<table class="w-full border-collapse text-sm">
						<thead>
							<tr class="bg-slate-100">
								<th class="border border-slate-400 px-2 py-1">No.</th>
								<th class="border border-slate-400 px-2 py-1">Document Code</th>
								<th class="border border-slate-400 px-2 py-1">Document Name</th>
								<th class="border border-slate-400 px-2 py-1">Revision</th>
								<th class="border border-slate-400 px-2 py-1">Effective Date</th>
								<th class="border border-slate-400 px-2 py-1">Request Reason</th>
								<th class="border border-slate-400 px-2 py-1">Attachment</th>
								{#if requestType === 'request_copy'}
									<th class="border border-slate-400 px-2 py-1">Copies</th>
								{/if}
								<th class="border border-slate-400 px-2 py-1">Action</th>
							</tr>
						</thead>
						<tbody>
							{#each rows as row, index}
								<tr>
									<td class="border border-slate-300 px-2 py-1 text-center">{index + 1}</td>
									<td class="border border-slate-300 px-2 py-1">
										{#if requestType === 'new_document'}
											<div class="rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs text-slate-600">
												Auto generate when Registered
											</div>
										{:else}
											<select
												value={row.document_master_id || ''}
												on:change={(e) => onSelectDocument(index, (e.currentTarget as HTMLSelectElement).value)}
												class="w-full rounded border border-slate-300 px-2 py-1"
											>
												<option value="">-- Select --</option>
												{#each data.documents as doc (doc.id)}
													<option value={doc.id}>{doc.doc_code}</option>
												{/each}
											</select>
										{/if}
									</td>
									<td class="border border-slate-300 px-2 py-1">
										<input
											type="text"
											bind:value={row.document_name}
											on:input={() => {
												row.document_code = row.document_code || '';
												rows = rows;
											}}
											class="w-full rounded border border-slate-300 px-2 py-1"
										/>
									</td>
									<td class="border border-slate-300 px-2 py-1 text-center">
										<input
											type="text"
											bind:value={row.revision}
											readonly
											class="w-20 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-center font-mono"
										/>
									</td>
									<td class="border border-slate-300 px-2 py-1 text-center text-xs">
										{formatDateForDisplay(row.effective_date)}
									</td>
									<td class="border border-slate-300 px-2 py-1">
										<input
											type="text"
											bind:value={row.request_reason}
											class="w-full rounded border border-slate-300 px-2 py-1"
										/>
									</td>
									<td class="border border-slate-300 px-2 py-1">
										<input type="file" name={`item_attachment_${index}`} class="w-full text-xs" />
									</td>
									{#if requestType === 'request_copy'}
										<td class="border border-slate-300 px-2 py-1">
											<input
												type="number"
												min="1"
												bind:value={row.copies_requested}
												class="w-full rounded border border-slate-300 px-2 py-1 text-center"
											/>
										</td>
									{/if}
									<td class="border border-slate-300 px-2 py-1 text-center">
										<button
											type="button"
											on:click={() => removeRow(index)}
											class="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
										>
											Delete
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="flex justify-between border-t border-slate-300 p-2">
					<button
						type="button"
						on:click={addRow}
						class="rounded border border-blue-300 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700 hover:bg-blue-100"
					>
						+ Add Row
					</button>
					<div class="text-xs text-slate-500">
						{#if requestType === 'new_document'}
							Document Code will be generated automatically when QMR registers.
						{:else}
							Revision will be auto-filled from document master list.
						{/if}
					</div>
				</div>
			</div>

			<div class="mt-3 grid gap-3 md:grid-cols-2">
				<div class="border border-slate-400 p-3">
					<label for="dar-remark" class="mb-1 block text-sm font-semibold">หมายเหตุ (Remark)</label>
					<textarea
						id="dar-remark"
						name="remark"
						bind:value={remark}
						rows="4"
						class="w-full rounded border border-slate-300 px-2 py-1"
					></textarea>
				</div>
				<div class="border border-slate-400 p-3 text-sm">
					<div class="font-semibold">ผู้ร้องขอดำเนินการ (Requestor)</div>
					<div class="mt-2">ชื่อ: {data.requester.full_name}</div>
					<div>ตำแหน่ง: {data.requester.position_name || '-'}</div>
					<div>ฝ่าย: {data.requester.department_name || '-'}</div>
					<div>วันที่: {requestDate}</div>
				</div>
			</div>

			<div class="mt-4 flex items-center justify-between">
				<div>
					{#if submitMessage}
						<p class="text-sm font-semibold text-green-700">{submitMessage}</p>
					{/if}
					{#if submitError}
						<p class="text-sm font-semibold text-red-700">{submitError}</p>
					{/if}
				</div>
				<button
					type="submit"
					disabled={isSubmitting}
					class="rounded bg-slate-900 px-5 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{isSubmitting ? 'Submitting...' : 'Submit DAR'}
				</button>
			</div>
		</form>
	</div>
</div>
