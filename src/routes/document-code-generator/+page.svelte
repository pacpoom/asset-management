<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	type AaRow = PageData['documentTypes'][number];
	type BbRow = PageData['departments'][number];

	type SegmentRunRow = PageData['runningCc'][number];
	type GgRunRow = PageData['runningGg'][number];

	let searchAa = '';
	let searchBb = '';
	let searchCc = '';
	let searchEe = '';
	let searchFf = '';
	let searchGg = '';

	let aaModal: 'add' | 'edit' | null = null;
	let bbModal: 'add' | 'edit' | null = null;

	let aaForm = { id: '', code: '', name_th: '', name_en: '', format: '' };
	let bbForm = { id: '', code: '', name_th: '', name_en: '' };

	$: crudEnabled =
		data.documentTypes.some((r) => r.id != null) && data.departments.some((r) => r.id != null);

	const segTableTitle = {
		cc: 'ตารางอ้างอิง - ลำดับของเอกสารในระเบียบปฏิบัติ (CC)',
		ee: 'ตารางอ้างอิง - กระบวนการทำงาน / พื้นที่การทำงาน (EE)',
		ff: 'ตารางอ้างอิง - ลำดับกระบวนการหรือพื้นที่การทำงาน (FF)',
		gg: 'ตารางอ้างอิง - เลขลำดับ / รันของเอกสาร (GG)'
	} as const;

	function openAaAdd() {
		aaModal = 'add';
		aaForm = { id: '', code: '', name_th: '', name_en: '', format: '' };
	}

	function openAaEdit(row: AaRow) {
		if (row.id == null) return;
		aaModal = 'edit';
		aaForm = {
			id: String(row.id),
			code: row.code,
			name_th: row.name_th,
			name_en: row.name_en,
			format: row.format
		};
	}

	function openBbAdd() {
		bbModal = 'add';
		bbForm = { id: '', code: '', name_th: '', name_en: '' };
	}

	function openBbEdit(row: BbRow) {
		if (row.id == null) return;
		bbModal = 'edit';
		bbForm = {
			id: String(row.id),
			code: row.code,
			name_th: row.name_th,
			name_en: row.name_en
		};
	}

	function closeModals() {
		aaModal = null;
		bbModal = null;
	}

	const enhanceReload: import('@sveltejs/kit').SubmitFunction = () => {
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') {
				closeModals();
				await invalidateAll();
			}
		};
	};

	const enhanceReloadQuiet: import('@sveltejs/kit').SubmitFunction = () => {
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') await invalidateAll();
		};
	};

	function padRun(n: number): string {
		const v = Math.max(0, Math.min(9999, Number(n) || 0));
		return String(v).padStart(2, '0');
	}

	$: canEditSegmentRunning = crudEnabled && data.segmentRunningSchemaOk;
	$: canEditGgRunning = crudEnabled;

	function confirmDelete(ev: SubmitEvent) {
		if (!confirm('ยืนยันการลบรายการนี้?')) ev.preventDefault();
	}

	function normQ(q: string): string {
		return q.trim().toLowerCase();
	}

	function matchesSearch(q: string, parts: (string | number)[]): boolean {
		const t = normQ(q);
		if (!t) return true;
		const blob = parts.map((p) => String(p)).join(' ').toLowerCase();
		return blob.includes(t);
	}

	/** แต่ละคำ (คั่นวรรค) ต้องพบในอย่างน้อยหนึ่งฟิลด์ — กันค้นหา STD แล้วไป match ผ่าน blob รวมที่ผิดพลาด */
	function matchesRunningRow(q: string, row: SegmentRunRow | GgRunRow): boolean {
		const t = normQ(q);
		if (!t) return true;
		const tokens = t.split(/\s+/).filter(Boolean);
		const fields = [
			row.doc_type,
			row.department_code,
			row.bb_name_th,
			row.bb_name_en,
			padRun(row.last_running_no)
		].map((x) => String(x).toLowerCase());
		return tokens.every((tok) => fields.some((f) => f.includes(tok)));
	}

	$: filteredDocumentTypes = data.documentTypes.filter((r) =>
		matchesSearch(searchAa, [r.code, r.name_th, r.name_en, r.format])
	);

	$: filteredDepartments = data.departments.filter((r) =>
		matchesSearch(searchBb, [r.code, r.name_th, r.name_en])
	);

	$: filteredRunningCc = data.runningCc.filter((r) => matchesRunningRow(searchCc, r));
	$: filteredRunningEe = data.runningEe.filter((r) => matchesRunningRow(searchEe, r));
	$: filteredRunningFf = data.runningFf.filter((r) => matchesRunningRow(searchFf, r));
	$: filteredRunningGg = data.runningGg.filter((r) => matchesRunningRow(searchGg, r));

	function segmentSearchQ(seg: 'cc' | 'ee' | 'ff'): string {
		return seg === 'cc' ? searchCc : seg === 'ee' ? searchEe : searchFf;
	}
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
	<div class="mx-auto max-w-7xl">
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
					<h1 class="text-3xl font-bold text-slate-900">ระบบกำหนดรหัสเอกสาร</h1>
					<p class="text-slate-600">
						ตารางอ้างอิง AA–GG ตามข้อกำหนดรหัสเอกสาร — การออกรหัส running ใช้ที่
						<a href="/isodocs-control/document-list" class="font-medium text-blue-600 underline"
							>Document Master List</a
						>
					</p>
				</div>
			</div>
		</div>

		{#if !data.refSchemaOk}
			<div
				class="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
			>
				<strong>หมายเหตุ:</strong> ยังไม่พบตาราง master ในฐานข้อมูล — แสดงค่าเริ่มต้น AA/BB จากระบบเท่านั้น
				และยังจัดการตาราง CC–GG ไม่ได้ ให้รันไฟล์
				<code class="rounded bg-amber-100 px-1">sql/document_code_reference_masters.sql</code> บน MySQL
			</div>
		{/if}

		<!-- ข้อกำหนดรหัสเอกสาร — PDF (วางไฟล์ที่ static/isodocs/document-code-coding-spec.pdf) -->
		{#if data.codingSpecPdfAvailable}
			<div class="mb-8 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
				<div class="mb-2 flex justify-end">
					<a
						href="/isodocs/document-code-coding-spec.pdf"
						target="_blank"
						rel="noopener noreferrer"
						class="text-sm font-medium text-blue-600 hover:underline"
					>
						เปิด PDF แท็บใหม่
					</a>
				</div>
				<div class="overflow-hidden rounded-md border border-slate-200 bg-slate-100">
					<iframe
						title="ข้อกำหนดรหัสเอกสาร (PDF)"
						src="/isodocs/document-code-coding-spec.pdf#view=FitH"
						class="h-[72vh] w-full min-h-[28rem] border-0 sm:min-h-[36rem]"
					></iframe>
				</div>
				<p class="mt-2 text-center text-xs text-slate-500">
					ถ้าไม่เห็นเนื้อหาในกรอบ ให้กดลิงก์ด้านบน หรือใช้เบราว์เซอร์อื่น
				</p>
			</div>
		{:else}
			<div
				class="mb-8 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
			>
				<strong>ข้อกำหนดรหัสเอกสาร (PDF):</strong>
				ยังไม่มีไฟล์ในโปรเจกต์ — คัดลอก PDF ไปที่
				<code class="rounded bg-slate-200 px-1">static/isodocs/document-code-coding-spec.pdf</code>
				แล้วรีเฟรชหน้านี้
			</div>
		{/if}

		<!-- AA table -->
		<div class="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
			<div class="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
				<h2 class="flex items-center gap-2 text-lg font-semibold text-slate-900">
					<svg class="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
						/>
					</svg>
					ตารางอ้างอิง - ประเภทเอกสาร (AA)
				</h2>
				<div class="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto lg:max-w-2xl">
					<div class="relative min-w-0 flex-1">
						<svg
							class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
						<input
							id="search-aa"
							type="search"
							bind:value={searchAa}
							placeholder="ค้นหา รหัส / ชื่อ / รูปแบบรหัส…"
							class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
					</div>
					<div class="flex shrink-0 gap-2">
						<button
							type="button"
							on:click={() => document.getElementById('search-aa')?.focus()}
							class="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
						>
							ค้นหา
						</button>
						<button
							type="button"
							on:click={() => (searchAa = '')}
							class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
						>
							ล้าง
						</button>
						<button
							type="button"
							disabled={!crudEnabled}
							on:click={openAaAdd}
							class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							เพิ่ม
						</button>
					</div>
				</div>
			</div>
			<p class="mb-2 text-xs text-slate-500">กรองรายการทันทีขณะพิมพ์</p>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b-2 border-slate-300 bg-slate-100">
							<th class="px-4 py-3 text-left font-semibold text-slate-900">รหัส</th>
							<th class="px-4 py-3 text-left font-semibold text-slate-900">ชื่อภาษาไทย</th>
							<th class="px-4 py-3 text-left font-semibold text-slate-900">ชื่อภาษาอังกฤษ</th>
							<th class="px-4 py-3 text-left font-semibold text-slate-900">รูปแบบรหัส</th>
							<th class="px-4 py-3 text-right font-semibold text-slate-900 w-36">จัดการ</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredDocumentTypes as docType (docType.code)}
							<tr class="border-b border-slate-200 hover:bg-slate-50">
								<td class="px-4 py-3 font-mono font-bold text-blue-600">{docType.code}</td>
								<td class="px-4 py-3 text-slate-900">{docType.name_th}</td>
								<td class="px-4 py-3 text-slate-600">{docType.name_en}</td>
								<td class="px-4 py-3 font-mono text-sm text-slate-700">{docType.format}</td>
								<td class="px-4 py-3 text-right whitespace-nowrap">
									<button
										type="button"
										disabled={!crudEnabled || docType.id == null}
										on:click={() => openAaEdit(docType)}
										class="mr-2 text-sm font-medium text-blue-600 hover:underline disabled:opacity-40"
									>
										แก้ไข
									</button>
									<form
										method="POST"
										action="?/deleteAaType"
										use:enhance={enhanceReload}
										on:submit={confirmDelete}
										class="inline"
									>
										<input type="hidden" name="id" value={docType.id ?? ''} />
										<button
											type="submit"
											disabled={!crudEnabled || docType.id == null}
											class="text-sm font-medium text-red-600 hover:underline disabled:opacity-40"
										>
											ลบ
										</button>
									</form>
								</td>
							</tr>
						{/each}
						{#if filteredDocumentTypes.length === 0}
							<tr>
								<td colspan="5" class="px-4 py-8 text-center text-sm text-slate-500">
									ไม่พบรายการที่ตรงกับการค้นหา
								</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
			{#if form?.deleteAa === true && form?.error}
				<p class="mt-2 text-sm text-red-600">{form.error}</p>
			{/if}
		</div>

		<!-- BB table -->
		<div class="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
			<div class="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
				<h2 class="flex items-center gap-2 text-lg font-semibold text-slate-900">
					<svg class="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5.581m0 0H9m0 0h-.581m0 0H2m0 0h5.581M9 21m0-63v.581m0 0H3.409M9 12v-8.581M0 0h24v24H0z"
						/>
					</svg>
					ตารางอ้างอิง - หน่วยงาน/กระบวนการ (BB)
				</h2>
				<div class="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto lg:max-w-2xl">
					<div class="relative min-w-0 flex-1">
						<svg
							class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
						<input
							id="search-bb"
							type="search"
							bind:value={searchBb}
							placeholder="ค้นหา รหัส BB / ชื่อหน่วยงาน…"
							class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
					</div>
					<div class="flex shrink-0 gap-2">
						<button
							type="button"
							on:click={() => document.getElementById('search-bb')?.focus()}
							class="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
						>
							ค้นหา
						</button>
						<button
							type="button"
							on:click={() => (searchBb = '')}
							class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
						>
							ล้าง
						</button>
						<button
							type="button"
							disabled={!crudEnabled}
							on:click={openBbAdd}
							class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							เพิ่ม
						</button>
					</div>
				</div>
			</div>
			<p class="mb-2 text-xs text-slate-500">กรองรายการทันทีขณะพิมพ์</p>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b-2 border-slate-300 bg-slate-100">
							<th class="px-4 py-3 text-left font-semibold text-slate-900">รหัส</th>
							<th class="px-4 py-3 text-left font-semibold text-slate-900">ชื่อภาษาไทย</th>
							<th class="px-4 py-3 text-left font-semibold text-slate-900">ชื่อภาษาอังกฤษ</th>
							<th class="px-4 py-3 text-right font-semibold text-slate-900 w-36">จัดการ</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredDepartments as dept (dept.code)}
							<tr class="border-b border-slate-200 hover:bg-slate-50">
								<td class="px-4 py-3 font-mono font-bold text-blue-600">{dept.code}</td>
								<td class="px-4 py-3 text-slate-900">{dept.name_th}</td>
								<td class="px-4 py-3 text-slate-600">{dept.name_en}</td>
								<td class="px-4 py-3 text-right whitespace-nowrap">
									<button
										type="button"
										disabled={!crudEnabled || dept.id == null}
										on:click={() => openBbEdit(dept)}
										class="mr-2 text-sm font-medium text-blue-600 hover:underline disabled:opacity-40"
									>
										แก้ไข
									</button>
									<form
										method="POST"
										action="?/deleteBbProcess"
										use:enhance={enhanceReload}
										on:submit={confirmDelete}
										class="inline"
									>
										<input type="hidden" name="id" value={dept.id ?? ''} />
										<button
											type="submit"
											disabled={!crudEnabled || dept.id == null}
											class="text-sm font-medium text-red-600 hover:underline disabled:opacity-40"
										>
											ลบ
										</button>
									</form>
								</td>
							</tr>
						{/each}
						{#if filteredDepartments.length === 0}
							<tr>
								<td colspan="4" class="px-4 py-8 text-center text-sm text-slate-500">
									ไม่พบรายการที่ตรงกับการค้นหา
								</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
			{#if form?.deleteBb === true && form?.error}
				<p class="mt-2 text-sm text-red-600">{form.error}</p>
			{/if}
		</div>

		{#each (['cc', 'ee', 'ff'] as const) as seg (seg)}
			<div class="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
				<div class="mb-4">
					<h2 class="flex items-center gap-2 text-lg font-semibold text-slate-900">
						<svg class="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 6h16M4 10h16M4 14h16M4 18h16"
							/>
						</svg>
						{segTableTitle[seg]}
					</h2>
					<p class="mt-2 max-w-3xl text-sm text-slate-600">
						{#if seg === 'cc'}
							แสดงทุกคู่ <span class="font-semibold text-slate-800">AA × BB</span> สำหรับประเภท
							<span class="font-mono text-blue-700">WI, STD, EIS, FM</span> — เลขคอลัมน์
							<span class="font-mono">CC</span> ล่าสุดที่ใช้แล้ว (เริ่มที่ 00 หากยังไม่เคยรัน)
						{:else if seg === 'ee'}
							สำหรับ <span class="font-mono text-blue-700">STD, EIS</span> เท่านั้น — เลข segment
							<span class="font-mono">EE</span> ล่าสุดต่อคู่ AA×BB
						{:else}
							สำหรับ <span class="font-mono text-blue-700">STD, EIS</span> เท่านั้น — เลข segment
							<span class="font-mono">FF</span> ล่าสุดต่อคู่ AA×BB
						{/if}
					</p>
				</div>

				<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
					<div class="relative min-w-0 flex-1 max-w-xl">
						<svg
							class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
						{#if seg === 'cc'}
							<input
								id="search-seg-cc"
								type="search"
								bind:value={searchCc}
								placeholder="ค้นหา AA, BB, ชื่อ Section, เลขรัน…"
								class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							/>
						{:else if seg === 'ee'}
							<input
								id="search-seg-ee"
								type="search"
								bind:value={searchEe}
								placeholder="ค้นหา AA, BB, ชื่อ Section, เลขรัน…"
								class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							/>
						{:else}
							<input
								id="search-seg-ff"
								type="search"
								bind:value={searchFf}
								placeholder="ค้นหา AA, BB, ชื่อ Section, เลขรัน…"
								class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							/>
						{/if}
					</div>
					<div class="flex shrink-0 gap-2">
						<button
							type="button"
							on:click={() => document.getElementById(`search-seg-${seg}`)?.focus()}
							class="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
						>
							ค้นหา
						</button>
						<button
							type="button"
							on:click={() => {
								if (seg === 'cc') searchCc = '';
								else if (seg === 'ee') searchEe = '';
								else searchFf = '';
							}}
							class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
						>
							ล้าง
						</button>
					</div>
				</div>
				<p class="mb-2 text-xs text-slate-500">
					กรองตาม <strong>AA</strong>, <strong>BB</strong>, ชื่อ Section และเลขรัน (หลายคำคั่นวรรค = ต้องตรงทุกคำ)
				</p>

				{#if !data.segmentRunningSchemaOk}
					<div
						class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
					>
						ยังไม่มีตาราง <code class="rounded bg-amber-100 px-1">document_iso_segment_running</code> —
						รันสคริปต์ <code class="rounded bg-amber-100 px-1">sql/document_code_reference_masters.sql</code>
						แล้วรีเฟรชหน้า เพื่อบันทึกเลขรัน
					</div>
				{/if}

				<div class="mb-6 overflow-hidden rounded-lg border border-slate-200">
					<h3 class="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
						เลขรันล่าสุด ({seg.toUpperCase()}) — ทุก Section (BB)
					</h3>
					<div
						class="hidden gap-2 border-b-2 border-slate-300 bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-900 sm:grid sm:grid-cols-12"
					>
						<div class="sm:col-span-1">AA</div>
						<div class="sm:col-span-1">BB</div>
						<div class="sm:col-span-4">ชื่อ Section</div>
						<div class="sm:col-span-2">เลขล่าสุด</div>
						<div class="sm:col-span-2 sm:text-right">บันทึก</div>
					</div>
					<div class="max-h-[28rem] overflow-y-auto bg-white">
						{#each (seg === 'cc' ? filteredRunningCc : seg === 'ee' ? filteredRunningEe : filteredRunningFf) as row (`${seg}-${row.doc_type}-${row.department_code}`)}
							<form
								method="POST"
								action="?/saveSegmentRunning"
								use:enhance={enhanceReloadQuiet}
								class="grid grid-cols-1 gap-2 border-b border-slate-200 px-4 py-3 last:border-0 hover:bg-slate-50 sm:grid-cols-12 sm:items-center"
							>
								<input type="hidden" name="segment" value={seg} />
								<input type="hidden" name="doc_type" value={row.doc_type} />
								<input type="hidden" name="department_code" value={row.department_code} />
								<div class="font-mono text-sm font-bold text-blue-600 sm:col-span-1">{row.doc_type}</div>
								<div class="font-mono text-sm font-bold text-violet-600 sm:col-span-1">{row.department_code || '—'}</div>
								<div class="text-sm text-slate-700 sm:col-span-4">
									{row.bb_name_th}
									<span class="text-slate-500"> / {row.bb_name_en}</span>
								</div>
								<div class="sm:col-span-2">
									<input
										name="last_running_no"
										type="text"
										inputmode="numeric"
										maxlength="4"
										value={padRun(row.last_running_no)}
										class="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
										aria-label="เลขรันล่าสุด"
									/>
								</div>
								<div class="sm:col-span-2 sm:flex sm:justify-end">
									<button
										type="submit"
										disabled={!canEditSegmentRunning}
										class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
									>
										บันทึก
									</button>
								</div>
							</form>
						{/each}
						{#if (seg === 'cc' ? filteredRunningCc : seg === 'ee' ? filteredRunningEe : filteredRunningFf).length === 0 && normQ(segmentSearchQ(seg))}
							<p class="py-6 text-center text-sm text-slate-500">ไม่พบแถวเลขรันที่ตรงกับการค้นหา</p>
						{/if}
					</div>
					{#if form?.saveSegmentRunning === true && form?.error}
						<p class="mt-2 px-4 pb-3 text-sm text-red-600">{form.error}</p>
					{/if}
				</div>
			</div>
		{/each}

		<!-- GG: running from document_running_masters -->
		<div class="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
			<div class="mb-4">
				<h2 class="flex items-center gap-2 text-lg font-semibold text-slate-900">
					<svg class="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 6h16M4 10h16M4 14h16M4 18h16"
						/>
					</svg>
					{segTableTitle.gg}
				</h2>
				<p class="mt-2 max-w-3xl text-sm text-slate-600">
					เลข <span class="font-mono">GG</span> (ลำดับเอกสารปลายรหัส) เก็บใน
					<span class="font-mono">document_running_masters</span> — แสดง
					<span class="font-semibold">QM</span> (ไม่มี BB) และประเภทที่มีรูปแบบ
					<span class="font-mono">…-BB-…-GG</span>
				</p>
			</div>

			<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
				<div class="relative min-w-0 flex-1 max-w-xl">
					<svg
						class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
					<input
						id="search-gg"
						type="search"
						bind:value={searchGg}
						placeholder="ค้นหา AA, BB, ชื่อ Section, เลขรัน…"
						class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
				<div class="flex shrink-0 gap-2">
					<button
						type="button"
						on:click={() => document.getElementById('search-gg')?.focus()}
						class="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
					>
						ค้นหา
					</button>
					<button
						type="button"
						on:click={() => (searchGg = '')}
						class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
					>
						ล้าง
					</button>
				</div>
			</div>
			<p class="mb-2 text-xs text-slate-500">
				กรองตาม <strong>AA</strong>, <strong>BB</strong>, ชื่อ Section และเลขรัน (หลายคำคั่นวรรค = ต้องตรงทุกคำ)
			</p>

			<div class="mb-6 overflow-hidden rounded-lg border border-slate-200">
				<h3 class="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
					เลขรันล่าสุด (GG)
				</h3>
				<div
					class="hidden gap-2 border-b-2 border-slate-300 bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-900 sm:grid sm:grid-cols-12"
				>
					<div class="sm:col-span-1">AA</div>
					<div class="sm:col-span-1">BB</div>
					<div class="sm:col-span-4">ชื่อ Section</div>
					<div class="sm:col-span-2">เลขล่าสุด</div>
					<div class="sm:col-span-2 sm:text-right">บันทึก</div>
				</div>
				<div class="max-h-[28rem] overflow-y-auto bg-white">
					{#each filteredRunningGg as row (`gg-${row.doc_type}-${row.department_code || 'QM'}`)}
						<form
							method="POST"
							action="?/saveGgRunning"
							use:enhance={enhanceReloadQuiet}
							class="grid grid-cols-1 gap-2 border-b border-slate-200 px-4 py-3 last:border-0 hover:bg-slate-50 sm:grid-cols-12 sm:items-center"
						>
							<input type="hidden" name="doc_type" value={row.doc_type} />
							<input type="hidden" name="department_code" value={row.department_code} />
							<div class="font-mono text-sm font-bold text-blue-600 sm:col-span-1">{row.doc_type}</div>
							<div class="font-mono text-sm font-bold text-violet-600 sm:col-span-1">
								{row.department_code || '—'}
							</div>
							<div class="text-sm text-slate-700 sm:col-span-4">
								{row.bb_name_th}
								<span class="text-slate-500"> / {row.bb_name_en}</span>
							</div>
							<div class="sm:col-span-2">
								<input
									name="last_running_no"
									type="text"
									inputmode="numeric"
									maxlength="4"
									value={padRun(row.last_running_no)}
									class="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
									aria-label="เลข GG ล่าสุด"
								/>
							</div>
							<div class="sm:col-span-2 sm:flex sm:justify-end">
								<button
									type="submit"
									disabled={!canEditGgRunning}
									class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
								>
									บันทึก
								</button>
							</div>
						</form>
					{/each}
					{#if filteredRunningGg.length === 0 && normQ(searchGg)}
						<p class="py-6 text-center text-sm text-slate-500">ไม่พบแถวเลข GG ที่ตรงกับการค้นหา</p>
					{/if}
				</div>
				{#if form?.saveGgRunning === true && form?.error}
					<p class="mt-2 px-4 pb-3 text-sm text-red-600">{form.error}</p>
				{/if}
			</div>
		</div>

		<!-- Examples -->
		<div class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
			<h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
				<svg class="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 10V3L4 14h7v7l9-11h-7z"
					/>
				</svg>
				ตัวอย่างรหัสเอกสาร
			</h3>
			<p class="mb-3 text-sm text-slate-600">
				ตัวอย่างด้านล่างแสดงการต่อโค้ดจริง (AA-BB-CC-EE-FF-GG) โดย GG เป็นเลขลำดับเอกสาร
			</p>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
					<p class="mb-1 text-xs text-slate-600">Quality Manual (QM)</p>
					<p class="font-mono font-bold text-slate-900">QM-01</p>
				</div>
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
					<p class="mb-1 text-xs text-slate-600">Quality Procedure (QP)</p>
					<p class="font-mono font-bold text-slate-900">QP-HR-01</p>
				</div>
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
					<p class="mb-1 text-xs text-slate-600">Work Instruction (WI)</p>
					<p class="font-mono font-bold text-slate-900">WI-IT-02-01</p>
				</div>
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
					<p class="mb-1 text-xs text-slate-600">Standardized Work (STD)</p>
					<p class="font-mono font-bold text-slate-900">STD-QC-01-01-01-01</p>
				</div>
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
					<p class="mb-1 text-xs text-slate-600">Element Instruction Sheet (EIS)</p>
					<p class="font-mono font-bold text-slate-900">EIS-IE-01-02-03-01</p>
				</div>
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
					<p class="mb-1 text-xs text-slate-600">Form (FM)</p>
					<p class="font-mono font-bold text-slate-900">FM-GA-02-03</p>
				</div>
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
					<p class="mb-1 text-xs text-slate-600">Support Document (SD)</p>
					<p class="font-mono font-bold text-slate-900">SD-GA-01</p>
				</div>
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
					<p class="mb-1 text-xs text-slate-600">External Document (ED)</p>
					<p class="font-mono font-bold text-slate-900">ED-BD-02</p>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- AA modal -->
{#if aaModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="presentation"
		on:click|self={closeModals}
	>
		<div
			class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="aa-modal-title"
		>
			<h3 id="aa-modal-title" class="text-lg font-bold text-slate-900">
				{aaModal === 'add' ? 'เพิ่มประเภทเอกสาร (AA)' : 'แก้ไขประเภทเอกสาร (AA)'}
			</h3>
			<form method="POST" action="?/saveAaType" use:enhance={enhanceReload} class="mt-4 space-y-3">
				<input type="hidden" name="id" value={aaForm.id} />
				<div>
					<label class="mb-1 block text-sm font-medium text-slate-700" for="aa-code">รหัส (AA)</label>
					<input
						id="aa-code"
						name="code"
						bind:value={aaForm.code}
						required
						maxlength="50"
						class="w-full rounded-md border border-slate-300 px-3 py-2"
					/>
				</div>
				<div>
					<label class="mb-1 block text-sm font-medium text-slate-700" for="aa-th">ชื่อภาษาไทย</label>
					<input
						id="aa-th"
						name="name_th"
						bind:value={aaForm.name_th}
						required
						class="w-full rounded-md border border-slate-300 px-3 py-2"
					/>
				</div>
				<div>
					<label class="mb-1 block text-sm font-medium text-slate-700" for="aa-en">ชื่อภาษาอังกฤษ</label>
					<input
						id="aa-en"
						name="name_en"
						bind:value={aaForm.name_en}
						required
						class="w-full rounded-md border border-slate-300 px-3 py-2"
					/>
				</div>
				<div>
					<label class="mb-1 block text-sm font-medium text-slate-700" for="aa-fmt">รูปแบบรหัส</label>
					<input
						id="aa-fmt"
						name="format"
						bind:value={aaForm.format}
						required
						placeholder="เช่น AA(QP)-BB-GG"
						class="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
					/>
				</div>
				{#if form?.saveAa === true && form?.error}
					<p class="text-sm text-red-600">{form.error}</p>
				{/if}
				<div class="flex justify-end gap-2 pt-2">
					<button
						type="button"
						on:click={closeModals}
						class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
					>
						ยกเลิก
					</button>
					<button type="submit" class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
						บันทึก
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if bbModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="presentation"
		on:click|self={closeModals}
	>
		<div
			class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="bb-modal-title"
		>
			<h3 id="bb-modal-title" class="text-lg font-bold text-slate-900">
				{bbModal === 'add' ? 'เพิ่มหน่วยงาน/กระบวนการ (BB)' : 'แก้ไขหน่วยงาน/กระบวนการ (BB)'}
			</h3>
			<form method="POST" action="?/saveBbProcess" use:enhance={enhanceReload} class="mt-4 space-y-3">
				<input type="hidden" name="id" value={bbForm.id} />
				<div>
					<label class="mb-1 block text-sm font-medium text-slate-700" for="bb-code">รหัส (BB)</label>
					<input
						id="bb-code"
						name="code"
						bind:value={bbForm.code}
						required
						maxlength="50"
						class="w-full rounded-md border border-slate-300 px-3 py-2"
					/>
				</div>
				<div>
					<label class="mb-1 block text-sm font-medium text-slate-700" for="bb-th">ชื่อภาษาไทย</label>
					<input
						id="bb-th"
						name="name_th"
						bind:value={bbForm.name_th}
						required
						class="w-full rounded-md border border-slate-300 px-3 py-2"
					/>
				</div>
				<div>
					<label class="mb-1 block text-sm font-medium text-slate-700" for="bb-en">ชื่อภาษาอังกฤษ</label>
					<input
						id="bb-en"
						name="name_en"
						bind:value={bbForm.name_en}
						required
						class="w-full rounded-md border border-slate-300 px-3 py-2"
					/>
				</div>
				{#if form?.saveBb === true && form?.error}
					<p class="text-sm text-red-600">{form.error}</p>
				{/if}
				<div class="flex justify-end gap-2 pt-2">
					<button
						type="button"
						on:click={closeModals}
						class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
					>
						ยกเลิก
					</button>
					<button type="submit" class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
						บันทึก
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
