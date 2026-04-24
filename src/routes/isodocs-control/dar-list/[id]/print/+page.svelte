<script lang="ts">
	import { DAR_ROLE_MGR, DAR_ROLE_QMR, DAR_ROLE_VP } from '$lib/darWorkflowLabels';
	import { formatDarNoDisplay } from '$lib/darNoFormat';
	import { formatOptionalDateTime } from '$lib/formatDateTime';
	import type { PageData } from './$types';

	export let data: PageData;

	$: darNoLabel = formatDarNoDisplay(data.request.dar_no);

	const requestTypeMap: Record<string, string> = {
		new_document: 'ขึ้นทะเบียนเอกสารใหม่ (Issue new document)',
		revise_document: 'ขอแก้ไขเปลี่ยนแปลง (Revision)',
		cancel_document: 'ยกเลิกเอกสาร (Cancel document)',
		request_copy: 'สำเนาเอกสาร (Request copy document)'
	};

	const docTypes = ['QM', 'QP', 'WI', 'STD', 'EIS', 'FM', 'SD', 'ED'];

	function parseScope(raw: string | null): string[] {
		if (!raw) return [];
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	function formatDate(dateString: string | null): string {
		if (!dateString) return '____/____/________';
		const raw = String(dateString).trim();
		if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
		const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T]/);
		if (match) return match[1];
		const d = new Date(raw);
		if (Number.isNaN(d.getTime())) return '____/____/________';
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd}`;
	}

	$: scope = parseScope(data.request.document_type_scope);
	$: attachmentMap = data.attachments.reduce(
		(map, attachment) => {
			if (!map[attachment.dar_request_item_id]) map[attachment.dar_request_item_id] = [];
			map[attachment.dar_request_item_id].push(attachment);
			return map;
		},
		{} as Record<number, typeof data.attachments>
	);
</script>

<svelte:head>
	<title>DAR Print - {darNoLabel}</title>
</svelte:head>

<div class="print-toolbar no-print">
	<button type="button" onclick={() => window.print()}>Print</button>
	<a href="/isodocs-control/dar-list">Back to DAR List</a>
</div>

<div class="a4-page">
	<div class="dar-sheet">
		<header class="dar-header">
			<div>
				<div class="th">ใบร้องขอดำเนินการเอกสาร</div>
				<div class="en">(Document Action Request : DAR)</div>
			</div>
			<div class="dar-no">
				<div>DAR No.</div>
				<div class="value">{darNoLabel}</div>
			</div>
		</header>

		<section class="box">
			<div class="box-title">ส่วนที่ 1 : สำหรับผู้ร้องขอ (For Requestor)</div>
			<div class="grid two">
				<div>
					<div class="label">ชนิดดำเนินการขอ (Request for)</div>
					<ul class="check-list">
						{#each Object.entries(requestTypeMap) as [key, label]}
							<li>{data.request.request_type === key ? '☑' : '☐'} {label}</li>
						{/each}
					</ul>
				</div>
				<div>
					<div class="label">ประเภทของเอกสาร (Type of document)</div>
					<ul class="check-list compact">
						{#each docTypes as type}
							<li>{scope.includes(type) ? '☑' : '☐'} {type}</li>
						{/each}
					</ul>
				</div>
			</div>

			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>No.</th>
							<th>Document Code</th>
							<th>Document Name</th>
							<th>Revision</th>
							<th>Effective date</th>
							<th>Request Reason</th>
							<th>Attachments</th>
						</tr>
					</thead>
					<tbody>
						{#each data.items as item}
							<tr>
								<td>{item.line_no}</td>
								<td>{item.document_code}</td>
								<td>{item.document_name}</td>
								<td>Rev.{item.revision}</td>
								<td>{formatDate(item.effective_date)}</td>
								<td>{item.request_reason || '-'}</td>
								<td>
									{#if (attachmentMap[item.id] || []).length > 0}
										{#each attachmentMap[item.id] || [] as file}
											<div>{file.file_original_name}</div>
										{/each}
									{:else}
										-
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="grid two signatures">
				<div>
					<div class="label">หมายเหตุ (Remark):</div>
					<div class="line-block">{data.request.remark || '-'}</div>
				</div>
				<div>
					<div>ผู้ร้องดำเนินการ: {data.request.requester_name || '-'}</div>
					<div>ตำแหน่ง: {data.request.requester_position || '-'}</div>
					<div>ฝ่าย: {data.request.requester_department || '-'}</div>
					<div>วันที่: {formatOptionalDateTime(data.request.request_date)}</div>
				</div>
			</div>
		</section>

		<section class="box">
			<div class="box-title">
				ส่วนที่ 2 : {DAR_ROLE_MGR} (Reviewed By) / {DAR_ROLE_VP} (Approved By)
			</div>
			<div class="grid two signatures">
				<div>
					<div class="label">ข้อเสนอแนะ ({DAR_ROLE_MGR}):</div>
					<div class="line-block">{data.request.reviewer_comment || '-'}</div>
				</div>
				<div>
					<div>ผู้ลงนาม ({DAR_ROLE_MGR}): {data.request.reviewer_name || '-'}</div>
					<div>ตำแหน่ง: {data.request.reviewer_position || '-'}</div>
					<div>วันที่/เวลา: {data.request.reviewer_date ? formatOptionalDateTime(data.request.reviewer_date) : '____/____/________'}</div>
				</div>
			</div>
			<div class="grid two signatures">
				<div>
					<div class="label">ข้อเสนอแนะ ({DAR_ROLE_VP}):</div>
					<div class="line-block">{data.request.approver_comment || '-'}</div>
				</div>
				<div>
					<div>ผู้ลงนาม ({DAR_ROLE_VP}): {data.request.approver_name || '-'}</div>
					<div>ตำแหน่ง: {data.request.approver_position || '-'}</div>
					<div>วันที่/เวลา: {data.request.approver_date ? formatOptionalDateTime(data.request.approver_date) : '____/____/________'}</div>
				</div>
			</div>
		</section>

		<section class="box">
			<div class="box-title">ส่วนที่ 3 : {DAR_ROLE_QMR} (Notify QMR)</div>
			<div class="grid two signatures">
				<div>
					<div class="label">ข้อเสนอแนะ ({DAR_ROLE_QMR}):</div>
					<div class="line-block">{data.request.document_controller_comment || '-'}</div>
				</div>
				<div>
					<div>ผู้ลงนาม ({DAR_ROLE_QMR}): {data.request.register_name || '-'}</div>
					<div>ตำแหน่ง: {data.request.register_position || '-'}</div>
					<div>วันที่/เวลา: {data.request.register_date ? formatOptionalDateTime(data.request.register_date) : '____/____/________'}</div>
				</div>
			</div>
		</section>
	</div>
</div>

<style>
	.print-toolbar {
		display: flex;
		gap: 8px;
		padding: 12px;
		justify-content: center;
	}

	.print-toolbar button,
	.print-toolbar a {
		border: 1px solid #334155;
		padding: 8px 12px;
		border-radius: 6px;
		text-decoration: none;
		color: #0f172a;
		background: #fff;
		font-size: 14px;
	}

	.a4-page {
		display: flex;
		justify-content: center;
		padding: 8px 0 24px;
		background: #e5e7eb;
	}

	.dar-sheet {
		width: 210mm;
		min-height: 297mm;
		background: #fff;
		padding: 10mm;
		box-sizing: border-box;
		font-size: 11px;
		color: #111827;
		border: 1px solid #111827;
	}

	.dar-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 6px;
	}

	.dar-header .th {
		font-size: 24px;
		font-weight: 800;
	}

	.dar-header .en {
		font-size: 20px;
		font-weight: 700;
	}

	.dar-no {
		text-align: right;
		font-weight: 700;
	}

	.dar-no .value {
		font-family: monospace;
		font-size: 13px;
	}

	.box {
		border: 1px solid #111827;
		margin-bottom: 8px;
	}

	.box-title {
		background: #22d3ee;
		padding: 4px 6px;
		font-weight: 700;
		border-bottom: 1px solid #111827;
	}

	.grid.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		padding: 6px;
	}

	.label {
		font-weight: 700;
		margin-bottom: 2px;
	}

	.check-list {
		list-style: none;
		padding: 0;
		margin: 0;
		line-height: 1.55;
	}

	.check-list.compact {
		columns: 2;
	}

	.table-wrap {
		padding: 0 6px 6px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		border: 1px solid #111827;
		padding: 3px 4px;
		vertical-align: top;
	}

	th {
		background: #f3f4f6;
		font-weight: 700;
	}

	.signatures {
		border-top: 1px solid #d1d5db;
	}

	.line-block {
		min-height: 30px;
		border: 1px dashed #9ca3af;
		padding: 4px;
	}

	@media print {
		.no-print {
			display: none !important;
		}

		.a4-page {
			padding: 0;
			background: none;
		}

		.dar-sheet {
			border: none;
			width: 100%;
			min-height: auto;
			padding: 6mm;
		}

		@page {
			size: A4;
			margin: 0;
		}
	}
</style>
