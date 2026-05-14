<script lang="ts">
	import { enhance } from '$app/forms';
	import { t, locale } from '$lib/i18n';
	import { tick } from 'svelte';

	export let data;
	$: advance = data.advance;
	$: attachments = data.attachments || [];

	let isSaving = false;
	let updateStatusForm: HTMLFormElement;
	let statusToUpdate = '';

	const formatDate = (dateStr: string | null | undefined) => {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString($locale === 'th' ? 'th-TH' : 'en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	};

	function getStatusClass(status: string) {
		const statusMap: Record<string, string> = {
			Pending: 'bg-yellow-100 text-yellow-800',
			Approved: 'bg-blue-100 text-blue-800',
			Completed: 'bg-green-100 text-green-800',
			Rejected: 'bg-red-100 text-red-800'
		};
		return statusMap[status] || 'bg-gray-100 text-gray-800';
	}

	async function updateStatus(e: Event) {
		const newStatus = (e.currentTarget as HTMLSelectElement).value;
		if (!newStatus) return;
		statusToUpdate = newStatus;
		isSaving = true;
		await tick();
		if (updateStatusForm) updateStatusForm.requestSubmit();
	}

	const availableStatuses = ['Pending', 'Approved', 'Completed', 'Rejected'];

</script>

<svelte:head>
	<title>{$t('Advance Application')} {advance.document_number}</title>
</svelte:head>

<!-- Hidden form สำหรับ update status -->
<form
	method="POST"
	action="?/updateStatus"
	use:enhance={() => async ({ update }) => {
		await update();
		isSaving = false;
	}}
	class="hidden"
	bind:this={updateStatusForm}
>
	<input type="hidden" name="status" bind:value={statusToUpdate} />
</form>

<div class="min-h-screen bg-gray-50 p-6 pb-20">
	<div class="mx-auto max-w-5xl mb-6 flex flex-col items-start justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
		<div class="flex items-center">
			<a
				href="/freight-forwarder/advance-control"
				aria-label={$t('Back')}
				class="mr-3 text-gray-500 hover:text-blue-600 transition-colors"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"></path></svg>
			</a>
			<div>
				<h1 class="text-2xl font-bold text-gray-800">
					{$t('Advance Application')} #{advance.document_number}
				</h1>
				<p class="mt-1 text-sm text-gray-500">
					{$t('Requested By')}: <span class="font-medium text-gray-700">{advance.created_by_name || '-'}</span> | 
					{$t('Date')}: <span class="font-medium text-gray-700">{formatDate(advance.document_date)}</span>
				</p>
			</div>
		</div>

		<div class="flex flex-shrink-0 items-center gap-2">
			<span class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold {getStatusClass(advance.status)}">
				{$t(advance.status)}
			</span>
			<a
				href="/freight-forwarder/advance-control/{advance.id}/edit"
				class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
			>
				{$t('Edit')}
			</a>
			<div class="relative">
				<select
					aria-label={$t('Change Status')}
					onchange={updateStatus}
					disabled={isSaving}
					class="rounded-lg bg-gray-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
				>
					<option value="" disabled selected>{$t('Change Status')}</option>
					{#each availableStatuses as status (status)}
						{#if status !== advance.status}
							<option value={status} class="bg-white text-gray-800">{$t(status)}</option>
						{/if}
					{/each}
				</select>
			</div>
		</div>
	</div>

	<div class="mx-auto max-w-5xl space-y-6">
		
		<!-- รายละเอียดการเบิก -->
		<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
			<div class="border-b bg-gray-50 px-6 py-4">
				<h2 class="text-lg font-bold text-gray-800">{$t('Application Details')}</h2>
			</div>
			<div class="p-6">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
					<div class="space-y-4">
						<div>
							<div class="text-[11px] font-bold tracking-wider text-gray-400 uppercase">{$t('Application Title')}</div>
							<div class="text-base font-semibold text-gray-900">{advance.application_title}</div>
						</div>
						<div>
							<div class="text-[11px] font-bold tracking-wider text-gray-400 uppercase">{$t('Reason for Advance')}</div>
							<div class="text-sm font-medium text-gray-800 whitespace-pre-wrap leading-relaxed">{advance.reason}</div>
						</div>
						{#if advance.remark}
							<div class="rounded-lg bg-gray-50 p-3 border border-gray-100">
								<div class="text-[11px] font-bold tracking-wider text-gray-500 uppercase">{$t('Remarks')}</div>
								<div class="text-sm text-gray-700 whitespace-pre-wrap mt-1">{advance.remark}</div>
							</div>
						{/if}
					</div>

					<div class="space-y-6">
						<div class="rounded-xl bg-blue-50 border border-blue-100 p-5">
							<div class="text-xs font-bold tracking-wider text-blue-600 uppercase mb-1">{$t('Amount Requested (THB)')}</div>
							<div class="text-3xl font-mono font-bold text-blue-700">
								{Number(advance.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
							</div>
						</div>

						<div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
							<div class="text-[11px] font-bold tracking-wider text-gray-400 uppercase mb-3 border-b pb-2">{$t('Transfer To (Bank A/C)')}</div>
							{#if advance.bank_name}
								<div class="text-sm font-bold text-gray-900">[{advance.bank_code}] {advance.bank_name}</div>
								<div class="mt-1 flex items-center gap-2">
									<div class="text-xs text-gray-500">{$t('A/C No.')}</div>
									<div class="font-mono text-sm font-bold text-blue-600">{advance.account_number}</div>
								</div>
								<div class="mt-1 flex items-center gap-2">
									<div class="text-xs text-gray-500">{$t('A/C Name')}</div>
									<div class="text-sm font-semibold text-gray-800">{advance.account_name}</div>
								</div>
								{#if advance.branch}
									<div class="mt-1 flex items-center gap-2 text-xs text-gray-500">
										<span>{$t('Branch')}:</span> <span>{advance.branch}</span>
									</div>
								{/if}
							{:else}
								<div class="text-sm text-gray-500 italic">{$t('No bank details provided')}</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- ไฟล์แนบ -->
		{#if attachments && attachments.length > 0}
			<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
				<div class="flex items-center justify-between border-b bg-gray-50 p-4 px-6">
					<h2 class="text-lg font-bold text-gray-800">{$t('Attachments')}</h2>
					<span class="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-bold text-gray-600">{attachments.length} files</span>
				</div>
				<div class="p-6">
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
						{#each attachments as file (file.id)}
							<div class="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-blue-400 hover:shadow-md">
								<div class="flex items-center gap-3 overflow-hidden">
									<div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
									</div>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-bold text-gray-800" title={file.file_original_name}>{file.file_original_name}</p>
										<p class="text-xs text-gray-500">{(Number(file.file_size_bytes) / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB</p>
									</div>
								</div>
								<div class="ml-4 flex flex-shrink-0 items-center gap-2">
									<a href={file.url} target="_blank" rel="noopener noreferrer" class="rounded-full bg-gray-50 p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600" title={$t('View File')}>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
									</a>
									<a href={file.url} download={file.file_original_name} class="rounded-full bg-blue-50 p-2 text-blue-600 transition-colors hover:bg-blue-100" title={$t('Download')}>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
									</a>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}

	</div>
</div>