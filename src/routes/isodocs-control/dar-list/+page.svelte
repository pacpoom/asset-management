<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { formatDarNoDisplay } from '$lib/darNoFormat';
	import { formatOptionalDateTime } from '$lib/formatDateTime';
	import {
		DAR_UI_MGR_TITLE,
		DAR_UI_QMR_TITLE,
		DAR_UI_VP_TITLE,
		DAR_UI_WORKFLOW_LINE
	} from '$lib/darWorkflowLabels';
	import type { PageData } from './$types';
	import { get } from 'svelte/store';

	export let data: PageData;
	let searchDraft = '';
	let appliedSearch = '';
	let displayLimitDraft: '10' | '20' | '50' | '100' | '200' | 'all' = '20';
	let appliedDisplayLimit: '10' | '20' | '50' | '100' | '200' | 'all' = '20';

	const statusColors: Record<string, string> = {
		submitted: 'bg-yellow-100 text-yellow-800',
		reviewed: 'bg-blue-100 text-blue-800',
		approved: 'bg-green-100 text-green-800',
		rejected: 'bg-red-100 text-red-800',
		registered: 'bg-purple-100 text-purple-800'
	};

	function formatDate(dateString: string | null): string {
		if (!dateString) return '-';
		const raw = String(dateString).trim();
		if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
		const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T]/);
		if (match) return match[1];
		const d = new Date(raw);
		if (Number.isNaN(d.getTime())) return '-';
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd}`;
	}

	function parseScope(value: string | null): string[] {
		if (!value) return [];
		try {
			const parsed = JSON.parse(value);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	function requestTypeLabel(type: string): string {
		const map: Record<string, string> = {
			new_document: 'New Document',
			revise_document: 'Revise',
			cancel_document: 'Cancel',
			request_copy: 'Request Copy'
		};
		return map[type] || type;
	}

	$: itemsByRequest = data.items.reduce(
		(map, item) => {
			if (!map[item.dar_request_id]) map[item.dar_request_id] = [];
			map[item.dar_request_id].push(item);
			return map;
		},
		{} as Record<number, typeof data.items>
	);

	$: filteredRequests = data.requests.filter((request) => {
		const q = appliedSearch.trim().toLowerCase();
		if (!q) return true;
		const firstItem = (itemsByRequest[request.id] || [])[0];
		const hay = [
			request.dar_no,
			request.requester_name,
			request.request_type,
			request.status,
			firstItem?.document_name,
			firstItem?.document_code,
			firstItem?.revision
		]
			.map((v) => String(v || '').toLowerCase())
			.join(' ');
		return hay.includes(q);
	});

	$: limitedRequests =
		appliedDisplayLimit === 'all'
			? filteredRequests
			: filteredRequests.slice(0, Number.parseInt(appliedDisplayLimit, 10));

	function applyFilters() {
		appliedSearch = searchDraft.trim();
		appliedDisplayLimit = displayLimitDraft;
	}

	$: attachmentsByItem = data.attachments.reduce(
		(map, att) => {
			if (!map[att.dar_request_item_id]) map[att.dar_request_item_id] = [];
			map[att.dar_request_item_id].push(att);
			return map;
		},
		{} as Record<number, typeof data.attachments>
	);

	/** Expanded row driven by `?request=` so LINE/deep links survive login redirect */
	$: expandedRequestId = (() => {
		const raw = $page.url.searchParams.get('request');
		const n = raw ? Number(raw) : NaN;
		if (!Number.isInteger(n) || n <= 0) return null;
		if (!data.requests.some((r) => r.id === n)) return null;
		return n;
	})();

	function toggleRequest(id: number) {
		const u = new URL(get(page).url);
		const cur = u.searchParams.get('request');
		const curN = cur ? Number(cur) : NaN;
		if (curN === id) u.searchParams.delete('request');
		else u.searchParams.set('request', String(id));
		goto(`${u.pathname}${u.search}`, { replaceState: true, noScroll: true });
	}
</script>

<div class="mx-auto max-w-7xl space-y-4 p-4">
	<div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
		<div class="grid grid-cols-1 gap-3 md:grid-cols-4">
			<div class="md:col-span-2">
				<label for="dar-search" class="mb-1 block text-xs font-semibold text-slate-500">Search</label>
				<input
					id="dar-search"
					type="text"
					bind:value={searchDraft}
					placeholder="Search DAR no, requestor, document name, revision..."
					class="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					on:keydown={(e) => e.key === 'Enter' && applyFilters()}
				/>
			</div>
			<div>
				<label for="dar-limit" class="mb-1 block text-xs font-semibold text-slate-500">Display limit</label>
				<select
					id="dar-limit"
					bind:value={displayLimitDraft}
					class="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				>
					<option value="10">10</option>
					<option value="20">20</option>
					<option value="50">50</option>
					<option value="100">100</option>
					<option value="200">200</option>
					<option value="all">All</option>
				</select>
			</div>
			<div class="flex items-end gap-2">
				<button
					type="button"
					on:click={applyFilters}
					class="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
				>
					Apply
				</button>
				<button
					type="button"
					on:click={() => {
						searchDraft = '';
						appliedSearch = '';
						displayLimitDraft = '20';
						appliedDisplayLimit = '20';
					}}
					class="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
				>
					Reset
				</button>
			</div>
		</div>
	</div>

	<div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold text-slate-900">DAR List & Approval</h1>
				<p class="text-sm text-slate-600">{DAR_UI_WORKFLOW_LINE}</p>
			</div>
			<a
				href="/isodocs-control/dar-request"
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
			>
				+ New DAR
			</a>
		</div>
	</div>

	{#if limitedRequests.length === 0}
		<div class="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
			No DAR requests found.
		</div>
	{:else}
		<div class="rounded-lg border border-slate-200 bg-slate-50 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
			<div class="grid grid-cols-12 gap-2">
				<div class="col-span-3">DAR No.</div>
				<div class="col-span-4">Document Name</div>
				<div class="col-span-2">Revision</div>
				<div class="col-span-2">Status</div>
				<div class="col-span-1 text-right">Action</div>
			</div>
		</div>
		{#each limitedRequests as request (request.id)}
			<div class="rounded-lg border border-slate-200 bg-white shadow-sm">
				<button
					type="button"
					on:click={() => toggleRequest(request.id)}
					class="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50"
				>
					<div class="w-full">
						<div class="grid grid-cols-12 items-center gap-2">
							<div class="col-span-3 font-mono font-bold text-slate-900">{formatDarNoDisplay(request.dar_no)}</div>
							<div class="col-span-4 truncate text-sm text-slate-800">
								{(itemsByRequest[request.id] || [])[0]?.document_name || '-'}
							</div>
							<div class="col-span-2 text-sm text-slate-700">
								Rev.{(itemsByRequest[request.id] || [])[0]?.revision || '-'}
							</div>
							<div class="col-span-2">
								<span class={`rounded-full px-3 py-1 text-xs font-semibold ${statusColors[request.status] || 'bg-slate-100 text-slate-700'}`}>
									{request.status}
								</span>
							</div>
							<div class="col-span-1 text-right text-sm text-slate-500">
								{expandedRequestId === request.id ? 'Hide' : 'Show'}
							</div>
						</div>
						<p class="mt-1 text-sm text-slate-600">
							{requestTypeLabel(request.request_type)} • Requestor: {request.requester_name || '-'} • {formatOptionalDateTime(request.request_date)}
						</p>
					</div>
				</button>

				{#if expandedRequestId === request.id}
					<div class="border-t border-slate-200 px-5 py-4">
						<div class="mb-3 flex justify-end gap-2">
							<a
								href={`/isodocs-control/dar-list/${request.id}/print`}
								target="_blank"
								class="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
							>
								Print DAR
							</a>
							<form
								method="POST"
								action="?/deleteDar"
								use:enhance={() => {
									return async () => {
										await invalidateAll();
									};
								}}
								on:submit={(e) => {
									if (!confirm(`Delete ${formatDarNoDisplay(request.dar_no)}? This cannot be undone.`)) {
										e.preventDefault();
									}
								}}
							>
								<input type="hidden" name="id" value={request.id} />
								<button
									type="submit"
									class="rounded border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
								>
									Delete
								</button>
							</form>
						</div>

						<div class="mb-3 text-sm text-slate-700">
							<span class="font-semibold">Scope:</span>
							{#if parseScope(request.document_type_scope).length > 0}
								{parseScope(request.document_type_scope).join(', ')}
							{:else}
								-
							{/if}
						</div>

						<div class="overflow-x-auto rounded border border-slate-200">
							<table class="w-full text-sm">
								<thead class="bg-slate-100">
									<tr>
										<th class="border border-slate-300 px-2 py-1 text-left">No.</th>
										<th class="border border-slate-300 px-2 py-1 text-left">Doc Code</th>
										<th class="border border-slate-300 px-2 py-1 text-left">Document Name</th>
										<th class="border border-slate-300 px-2 py-1 text-left">Rev.</th>
										<th class="border border-slate-300 px-2 py-1 text-left">Effective</th>
										<th class="border border-slate-300 px-2 py-1 text-left">Reason</th>
										<th class="border border-slate-300 px-2 py-1 text-left">Attachments</th>
									</tr>
								</thead>
								<tbody>
									{#each itemsByRequest[request.id] || [] as item (item.id)}
										<tr>
											<td class="border border-slate-300 px-2 py-1">{item.line_no}</td>
											<td class="border border-slate-300 px-2 py-1 font-mono">{item.document_code}</td>
											<td class="border border-slate-300 px-2 py-1">{item.document_name}</td>
											<td class="border border-slate-300 px-2 py-1">Rev.{item.revision}</td>
											<td class="border border-slate-300 px-2 py-1">{formatDate(item.effective_date)}</td>
											<td class="border border-slate-300 px-2 py-1">{item.request_reason || '-'}</td>
											<td class="border border-slate-300 px-2 py-1">
												{#if (attachmentsByItem[item.id] || []).length > 0}
													<div class="space-y-1">
														{#each attachmentsByItem[item.id] || [] as att (att.id)}
															<a
																href={`/uploads/isodocs/dar/${att.file_system_name}`}
																target="_blank"
																class="block text-xs text-blue-600 underline"
															>
																{att.file_original_name}
															</a>
														{/each}
													</div>
												{:else}
													-
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

						<div class="mt-4 grid gap-4 lg:grid-cols-3">
							<form
								method="POST"
								action="?/reviewDar"
								use:enhance={() => {
									return async () => {
										await invalidateAll();
									};
								}}
								class="rounded border border-slate-200 p-3"
							>
								<h3 class="mb-2 font-semibold text-slate-900">{DAR_UI_MGR_TITLE}</h3>
								<input type="hidden" name="id" value={request.id} />
								<textarea
									name="reviewer_comment"
									rows="3"
									placeholder="Comment (ISO_DOCS_MGR)"
									disabled={!request.darPermissions.canReview}
									class="w-full rounded border border-slate-300 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
								>{request.reviewer_comment || ''}</textarea>
								{#if request.darPermissions.canReview}
									{@const mgrStageOpen = request.status === 'submitted'}
									<div class="mt-2 flex gap-2">
										<button
											type="submit"
											name="reviewer_decision"
											value="approve"
											disabled={!mgrStageOpen}
											class="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
										>
											Approve
										</button>
										<button
											type="submit"
											name="reviewer_decision"
											value="reject"
											disabled={!mgrStageOpen}
											class="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
										>
											Reject
										</button>
									</div>
								{/if}
								<p class="mt-2 text-xs text-slate-500">
									By: {request.reviewer_name || '-'} • {formatOptionalDateTime(request.reviewer_date)}
								</p>
							</form>

							<form
								method="POST"
								action="?/approveDar"
								use:enhance={() => {
									return async () => {
										await invalidateAll();
									};
								}}
								class="rounded border border-slate-200 p-3"
							>
								<h3 class="mb-2 font-semibold text-slate-900">{DAR_UI_VP_TITLE}</h3>
								<input type="hidden" name="id" value={request.id} />
								<textarea
									name="approver_comment"
									rows="3"
									placeholder="Comment (ISO_DOCS_VP)"
									disabled={!request.darPermissions.canApprove}
									class="w-full rounded border border-slate-300 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
								>{request.approver_comment || ''}</textarea>
								{#if request.darPermissions.canApprove}
									{@const vpStageOpen = request.status === 'reviewed'}
									<div class="mt-2 flex gap-2">
										<button
											type="submit"
											name="approver_decision"
											value="approve"
											disabled={!vpStageOpen}
											class="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
										>
											Approve
										</button>
										<button
											type="submit"
											name="approver_decision"
											value="reject"
											disabled={!vpStageOpen}
											class="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
										>
											Reject
										</button>
									</div>
								{/if}
								<p class="mt-2 text-xs text-slate-500">
									By: {request.approver_name || '-'} • {formatOptionalDateTime(request.approver_date)}
								</p>
							</form>

							<form
								method="POST"
								action="?/registerDar"
								use:enhance={() => {
									return async () => {
										await invalidateAll();
									};
								}}
								class="rounded border border-slate-200 p-3"
							>
								<h3 class="mb-2 font-semibold text-slate-900">{DAR_UI_QMR_TITLE}</h3>
								<input type="hidden" name="id" value={request.id} />
								<textarea
									name="document_controller_comment"
									rows="3"
									placeholder="Comment (ISODOCS_QMR)"
									disabled={!request.darPermissions.canRegister}
									class="w-full rounded border border-slate-300 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
								></textarea>
								{#if request.darPermissions.canRegister}
									{@const qmrStageOpen = request.status === 'approved'}
									<div class="mt-2 flex gap-2">
										<button
											type="submit"
											name="qmr_decision"
											value="approve"
											disabled={!qmrStageOpen}
											class="rounded bg-purple-600 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
										>
											Approve
										</button>
										<button
											type="submit"
											name="qmr_decision"
											value="reject"
											disabled={!qmrStageOpen}
											class="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
										>
											Reject
										</button>
									</div>
								{/if}
								<p class="mt-2 text-xs text-slate-500">
									By: {request.register_name || '-'} • {formatOptionalDateTime(request.register_date)}
								</p>
							</form>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</div>
