<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	export let data;
	$: stats = data.stats;
	$: ownerStats = data.ownerStats || [];
	$: customerStats = data.customerStats || [];
	$: jobTypeStats = data.jobTypeStats || [];
	$: recentJobs = data.recentJobs || [];
	$: alerts = data.alerts || [];
	$: filters = data.filters || { month: '' };

	let selectedMonth = '';
	$: {
		selectedMonth = filters.month;
	}

	function applyFilter() {
		const url = new URL($page.url);
		if (selectedMonth) url.searchParams.set('month', selectedMonth);
		else url.searchParams.delete('month');
		goto(url.toString(), { keepFocus: true, noScroll: true });
	}

	function formatJobNumber(type: string, dateStr: string, id: number) {
		if (!type || !dateStr || !id) return `JOB-${id}`;
		const d = new Date(dateStr);
		const yy = String(d.getFullYear()).slice(-2);
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		return `${type}${yy}${mm}${String(id).padStart(4, '0')}`;
	}

	function getDaysLeft(expireDate: string) {
		const diffTime = Math.abs(new Date(expireDate).getTime() - new Date().getTime());
		return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
	}

	function formatDate(dateStr: string) {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString($locale === 'th' ? 'th-TH' : 'en-US');
	}

	function getOwnerInitials(name: string) {
		if (!name) return '?';
		return name
			.split(' ')
			.map((n: string) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	const ownerColors = [
		{
			bg: 'bg-violet-500',
			light: 'bg-violet-50',
			text: 'text-violet-700',
			border: 'border-violet-200'
		},
		{ bg: 'bg-blue-500', light: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
		{
			bg: 'bg-emerald-500',
			light: 'bg-emerald-50',
			text: 'text-emerald-700',
			border: 'border-emerald-200'
		},
		{
			bg: 'bg-amber-500',
			light: 'bg-amber-50',
			text: 'text-amber-700',
			border: 'border-amber-200'
		},
		{ bg: 'bg-rose-500', light: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
		{ bg: 'bg-cyan-500', light: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
		{ bg: 'bg-pink-500', light: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
		{
			bg: 'bg-indigo-500',
			light: 'bg-indigo-50',
			text: 'text-indigo-700',
			border: 'border-indigo-200'
		}
	];

	function getColor(index: number) {
		return ownerColors[index % ownerColors.length];
	}

	function getBarWidth(count: number, total: number) {
		if (!total) return '0%';
		return `${Math.round((count / total) * 100)}%`;
	}

	const jobTypeLabels: Record<string, string> = {
		SI: 'Sea Import',
		SE: 'Sea Export',
		AI: 'Air Import',
		AF: 'Air Freight',
		SP: 'Special'
	};
</script>

<svelte:head>
	<title>{$t('Dashboard (Freight Forwarder)')}</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-6">
	<!-- Header -->
	<div class="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">{$t('Dashboard (Freight Forwarder)')}</h1>
			<p class="mt-1 text-sm text-gray-500">{$t('Daily Freight Management Overview')}</p>
		</div>
		<div class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
			<label for="month-filter" class="text-sm font-medium text-gray-600">{$t('Month')}:</label>
			<input
				id="month-filter"
				type="month"
				bind:value={selectedMonth}
				onchange={applyFilter}
				class="rounded-md border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-blue-500"
			/>
		</div>
	</div>

	<!-- Summary Cards -->
	<div class="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
		<div
			class="col-span-2 overflow-hidden rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-600 to-indigo-700 p-5 text-white shadow-sm lg:col-span-1"
		>
			<p class="text-xs font-semibold tracking-wider uppercase opacity-80">
				{$t('Total Job Orders')}
			</p>
			<p class="mt-2 text-4xl font-bold">{stats.total_jobs}</p>
			<div class="mt-2 flex items-center gap-1 text-xs opacity-70">
				<span class="material-symbols-outlined" style="font-size:14px">calendar_month</span>
				<span>{selectedMonth}</span>
			</div>
		</div>

		<div class="overflow-hidden rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
			<div class="flex items-start justify-between">
				<p class="text-xs font-semibold tracking-wider text-blue-600 uppercase">{$t('Pending')}</p>
				<span
					class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-500"
				>
					<span class="material-symbols-outlined" style="font-size:18px">pending_actions</span>
				</span>
			</div>
			<p class="mt-2 text-3xl font-bold text-gray-900">{stats.pending_jobs || 0}</p>
			<div class="mt-2 h-1.5 w-full rounded-full bg-gray-100">
				<div
					class="h-1.5 rounded-full bg-blue-500"
					style="width:{getBarWidth(stats.pending_jobs || 0, stats.total_jobs)}"
				></div>
			</div>
		</div>

		<div class="overflow-hidden rounded-xl border border-yellow-100 bg-white p-5 shadow-sm">
			<div class="flex items-start justify-between">
				<p class="text-xs font-semibold tracking-wider text-yellow-600 uppercase">
					{$t('In Progress')}
				</p>
				<span
					class="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-50 text-yellow-500"
				>
					<span class="material-symbols-outlined" style="font-size:18px">local_shipping</span>
				</span>
			</div>
			<p class="mt-2 text-3xl font-bold text-gray-900">{stats.in_progress_jobs || 0}</p>
			<div class="mt-2 h-1.5 w-full rounded-full bg-gray-100">
				<div
					class="h-1.5 rounded-full bg-yellow-400"
					style="width:{getBarWidth(stats.in_progress_jobs || 0, stats.total_jobs)}"
				></div>
			</div>
		</div>

		<div class="overflow-hidden rounded-xl border border-green-100 bg-white p-5 shadow-sm">
			<div class="flex items-start justify-between">
				<p class="text-xs font-semibold tracking-wider text-green-600 uppercase">
					{$t('Completed')}
				</p>
				<span
					class="flex h-8 w-8 items-center justify-center rounded-full bg-green-50 text-green-500"
				>
					<span class="material-symbols-outlined" style="font-size:18px">check_circle</span>
				</span>
			</div>
			<p class="mt-2 text-3xl font-bold text-gray-900">{stats.completed_jobs || 0}</p>
			<div class="mt-2 h-1.5 w-full rounded-full bg-gray-100">
				<div
					class="h-1.5 rounded-full bg-green-500"
					style="width:{getBarWidth(stats.completed_jobs || 0, stats.total_jobs)}"
				></div>
			</div>
		</div>

		<div class="overflow-hidden rounded-xl border border-red-100 bg-white p-5 shadow-sm">
			<div class="flex items-start justify-between">
				<p class="text-xs font-semibold tracking-wider text-red-600 uppercase">{$t('Cancelled')}</p>
				<span class="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-400">
					<span class="material-symbols-outlined" style="font-size:18px">cancel</span>
				</span>
			</div>
			<p class="mt-2 text-3xl font-bold text-gray-900">{stats.cancelled_jobs || 0}</p>
			<div class="mt-2 h-1.5 w-full rounded-full bg-gray-100">
				<div
					class="h-1.5 rounded-full bg-red-400"
					style="width:{getBarWidth(stats.cancelled_jobs || 0, stats.total_jobs)}"
				></div>
			</div>
		</div>
	</div>

	<!-- Owner Status Breakdown + Alerts Row -->
	<div class="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
		<!-- Owner Status Breakdown — takes 2 cols -->
		<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm xl:col-span-2">
			<div class="flex items-center justify-between border-b border-gray-100 px-6 py-4">
				<div>
					<h2 class="text-base font-bold text-gray-800">{$t('Status by Owner')}</h2>
					<p class="mt-0.5 text-xs text-gray-400">{$t('Job status breakdown per team member')}</p>
				</div>
				<span class="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
					{ownerStats.length}
					{$t('members')}
				</span>
			</div>

			{#if ownerStats.length === 0}
				<div class="flex flex-col items-center justify-center py-16 text-gray-400">
					<span class="material-symbols-outlined mb-3" style="font-size:40px">group</span>
					<p class="text-sm">{$t('No data available')}</p>
				</div>
			{:else}
				<!-- Header row -->
				<div
					class="grid grid-cols-12 gap-2 border-b border-gray-100 bg-gray-50 px-6 py-2 text-[10px] font-bold tracking-wider text-gray-400 uppercase"
				>
					<div class="col-span-4">{$t('Owner')}</div>
					<div class="col-span-2 text-center">{$t('Total')}</div>
					<div class="col-span-2 text-center text-blue-500">{$t('Pending')}</div>
					<div class="col-span-2 text-center text-yellow-500">{$t('In Progress')}</div>
					<div class="col-span-1 text-center text-green-500">{$t('Done')}</div>
					<div class="col-span-1 text-center text-red-400">{$t('Cancel')}</div>
				</div>

				<div class="divide-y divide-gray-50">
					{#each ownerStats as owner, i}
						{@const color = getColor(i)}
						<div
							class="grid grid-cols-12 items-center gap-2 px-6 py-3.5 transition-colors hover:bg-gray-50"
						>
							<!-- Owner name + avatar -->
							<div class="col-span-4 flex min-w-0 items-center gap-3">
								<div
									class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full {color.bg} text-xs font-bold text-white shadow-sm"
								>
									{getOwnerInitials(owner.owner_name || 'Unknown')}
								</div>
								<div class="min-w-0">
									<p class="truncate text-sm font-semibold text-gray-800">
										{owner.owner_name || $t('Unknown')}
									</p>
									<!-- Mini stacked bar -->
									<div class="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
										{#if owner.pending > 0}
											<div
												class="h-full bg-blue-400"
												style="width:{getBarWidth(owner.pending, owner.total)}"
											></div>
										{/if}
										{#if owner.in_progress > 0}
											<div
												class="h-full bg-yellow-400"
												style="width:{getBarWidth(owner.in_progress, owner.total)}"
											></div>
										{/if}
										{#if owner.completed > 0}
											<div
												class="h-full bg-green-400"
												style="width:{getBarWidth(owner.completed, owner.total)}"
											></div>
										{/if}
										{#if owner.cancelled > 0}
											<div
												class="h-full bg-red-300"
												style="width:{getBarWidth(owner.cancelled, owner.total)}"
											></div>
										{/if}
									</div>
								</div>
							</div>

							<!-- Total -->
							<div class="col-span-2 text-center">
								<span class="text-lg font-bold text-gray-800">{owner.total}</span>
							</div>

							<!-- Pending -->
							<div class="col-span-2 text-center">
								{#if owner.pending > 0}
									<span
										class="inline-flex items-center justify-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700"
									>
										{owner.pending}
									</span>
								{:else}
									<span class="text-xs text-gray-300">—</span>
								{/if}
							</div>

							<!-- In Progress -->
							<div class="col-span-2 text-center">
								{#if owner.in_progress > 0}
									<span
										class="inline-flex items-center justify-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-bold text-yellow-700"
									>
										{owner.in_progress}
									</span>
								{:else}
									<span class="text-xs text-gray-300">—</span>
								{/if}
							</div>

							<!-- Completed -->
							<div class="col-span-1 text-center">
								{#if owner.completed > 0}
									<span
										class="inline-flex items-center justify-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700"
									>
										{owner.completed}
									</span>
								{:else}
									<span class="text-xs text-gray-300">—</span>
								{/if}
							</div>

							<!-- Cancelled -->
							<div class="col-span-1 text-center">
								{#if owner.cancelled > 0}
									<span
										class="inline-flex items-center justify-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600"
									>
										{owner.cancelled}
									</span>
								{:else}
									<span class="text-xs text-gray-300">—</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Alerts Panel -->
		<div class="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
			<div
				class="flex items-center justify-between border-b border-gray-100 bg-red-50/50 px-6 py-4"
			>
				<div class="flex items-center gap-2">
					<span class="relative flex h-3 w-3">
						{#if alerts.length > 0}
							<span
								class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"
							></span>
						{/if}
						<span class="relative inline-flex h-3 w-3 rounded-full bg-red-500"></span>
					</span>
					<h2 class="text-base font-bold text-gray-800">{$t('Alerts')}</h2>
				</div>
				{#if alerts.length > 0}
					<span class="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-600"
						>{alerts.length}</span
					>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto p-4" style="max-height: 520px;">
				<div class="space-y-3">
					{#each alerts as alert}
						<div
							class="flex items-start gap-3 rounded-lg border border-red-100 bg-white p-3 shadow-sm transition-all hover:bg-red-50"
						>
							<div class="mt-0.5 flex-shrink-0 rounded-full bg-red-100 p-1.5 text-red-600">
								<span class="material-symbols-outlined" style="font-size:16px">warning</span>
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex items-center justify-between gap-2">
									<a
										href="/freight-forwarder/job-orders/{alert.id}"
										class="truncate text-sm font-bold text-gray-900 hover:text-blue-600 hover:underline"
									>
										{formatJobNumber(alert.job_type, alert.job_date, alert.id)}
									</a>
									<span class="flex-shrink-0 text-[10px] font-bold text-red-600">
										{getDaysLeft(alert.expire_date)}d
									</span>
								</div>
								<p class="mt-0.5 text-xs text-gray-500">
									{$t('Expires')}
									{formatDate(alert.expire_date)}
								</p>
							</div>
						</div>
					{/each}

					{#if alerts.length === 0}
						<div class="flex flex-col items-center justify-center py-10 text-center">
							<div class="mb-3 rounded-full bg-green-50 p-3 text-green-500">
								<span class="material-symbols-outlined" style="font-size:32px"
									>notifications_active</span
								>
							</div>
							<h3 class="text-sm font-bold text-gray-900">{$t('Excellent!')}</h3>
							<p class="mt-1 text-xs text-gray-500">{$t('No urgent alerts right now.')}</p>
						</div>
					{/if}
				</div>
			</div>
			<div class="mt-auto border-t border-gray-100 bg-gray-50 px-6 py-2 text-center">
				<p class="text-[10px] text-gray-400">{$t('Real-time data updated from the database.')}</p>
			</div>
		</div>
	</div>

	<!-- Status by Customer Section -->
	<div class="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="flex items-center justify-between border-b border-gray-100 px-6 py-4">
			<div>
				<h2 class="text-base font-bold text-gray-800">{$t('Status by Customer')}</h2>
				<p class="mt-0.5 text-xs text-gray-400">{$t('Job status breakdown per customer')}</p>
			</div>
			<span class="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-600">
				{customerStats.length}
				{$t('customers')}
			</span>
		</div>

		{#if customerStats.length === 0}
			<div class="flex flex-col items-center justify-center py-16 text-gray-400">
				<span class="material-symbols-outlined mb-3" style="font-size:40px">groups</span>
				<p class="text-sm">{$t('No data available')}</p>
			</div>
		{:else}
			<!-- Header row -->
			<div
				class="grid grid-cols-12 gap-2 border-b border-gray-100 bg-gray-50 px-6 py-2 text-[10px] font-bold tracking-wider text-gray-400 uppercase"
			>
				<div class="col-span-4">{$t('Customer')}</div>
				<div class="col-span-2 text-center">{$t('Total')}</div>
				<div class="col-span-2 text-center text-blue-500">{$t('Pending')}</div>
				<div class="col-span-2 text-center text-yellow-500">{$t('In Progress')}</div>
				<div class="col-span-1 text-center text-green-500">{$t('Done')}</div>
				<div class="col-span-1 text-center text-red-400">{$t('Cancel')}</div>
			</div>

			<div class="divide-y divide-gray-50">
				{#each customerStats as customer, i}
					{@const color = getColor(i)}
					<div
						class="grid grid-cols-12 items-center gap-2 px-6 py-3.5 transition-colors hover:bg-gray-50"
					>
						<!-- Customer name + avatar -->
						<div class="col-span-4 flex min-w-0 items-center gap-3">
							<div
								class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full {color.bg} text-xs font-bold text-white shadow-sm"
							>
								{getOwnerInitials(customer.customer_name || 'Unknown')}
							</div>
							<div class="min-w-0">
								<p class="truncate text-sm font-semibold text-gray-800">
									{customer.customer_name || $t('Unknown')}
								</p>
								<!-- Mini stacked bar -->
								<div class="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
									{#if customer.pending > 0}
										<div
											class="h-full bg-blue-400"
											style="width:{getBarWidth(customer.pending, customer.total)}"
										></div>
									{/if}
									{#if customer.in_progress > 0}
										<div
											class="h-full bg-yellow-400"
											style="width:{getBarWidth(customer.in_progress, customer.total)}"
										></div>
									{/if}
									{#if customer.completed > 0}
										<div
											class="h-full bg-green-400"
											style="width:{getBarWidth(customer.completed, customer.total)}"
										></div>
									{/if}
									{#if customer.cancelled > 0}
										<div
											class="h-full bg-red-300"
											style="width:{getBarWidth(customer.cancelled, customer.total)}"
										></div>
									{/if}
								</div>
							</div>
						</div>

						<!-- Total -->
						<div class="col-span-2 text-center">
							<span class="text-lg font-bold text-gray-800">{customer.total}</span>
						</div>

						<!-- Pending -->
						<div class="col-span-2 text-center">
							{#if customer.pending > 0}
								<span
									class="inline-flex items-center justify-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700"
								>
									{customer.pending}
								</span>
							{:else}
								<span class="text-xs text-gray-300">—</span>
							{/if}
						</div>

						<!-- In Progress -->
						<div class="col-span-2 text-center">
							{#if customer.in_progress > 0}
								<span
									class="inline-flex items-center justify-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-bold text-yellow-700"
								>
									{customer.in_progress}
								</span>
							{:else}
								<span class="text-xs text-gray-300">—</span>
							{/if}
						</div>

						<!-- Completed -->
						<div class="col-span-1 text-center">
							{#if customer.completed > 0}
								<span
									class="inline-flex items-center justify-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700"
								>
									{customer.completed}
								</span>
							{:else}
								<span class="text-xs text-gray-300">—</span>
							{/if}
						</div>

						<!-- Cancelled -->
						<div class="col-span-1 text-center">
							{#if customer.cancelled > 0}
								<span
									class="inline-flex items-center justify-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600"
								>
									{customer.cancelled}
								</span>
							{:else}
								<span class="text-xs text-gray-300">—</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Job Type + Recent Jobs Row -->
	<div class="grid grid-cols-1 gap-6 xl:grid-cols-3">
		<!-- Job Type Breakdown -->
		<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
			<div class="border-b border-gray-100 px-6 py-4">
				<h2 class="text-base font-bold text-gray-800">{$t('By Job Type')}</h2>
				<p class="mt-0.5 text-xs text-gray-400">{$t('Status breakdown by job type')}</p>
			</div>
			<div class="space-y-3 p-4">
				{#each jobTypeStats as jt}
					<div class="rounded-lg border border-gray-100 p-3">
						<div class="mb-2 flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="rounded bg-gray-800 px-2 py-0.5 text-xs font-bold text-white"
									>{jt.job_type}</span
								>
								<span class="text-xs text-gray-500"
									>{jobTypeLabels[jt.job_type] || jt.job_type}</span
								>
							</div>
							<span class="text-sm font-bold text-gray-700">{jt.total}</span>
						</div>
						<div class="flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
							{#if jt.pending > 0}
								<div
									class="h-full bg-blue-400 transition-all"
									style="width:{getBarWidth(jt.pending, jt.total)}"
									title="Pending: {jt.pending}"
								></div>
							{/if}
							{#if jt.in_progress > 0}
								<div
									class="h-full bg-yellow-400 transition-all"
									style="width:{getBarWidth(jt.in_progress, jt.total)}"
									title="In Progress: {jt.in_progress}"
								></div>
							{/if}
							{#if jt.completed > 0}
								<div
									class="h-full bg-green-400 transition-all"
									style="width:{getBarWidth(jt.completed, jt.total)}"
									title="Completed: {jt.completed}"
								></div>
							{/if}
							{#if jt.cancelled > 0}
								<div
									class="h-full bg-red-300 transition-all"
									style="width:{getBarWidth(jt.cancelled, jt.total)}"
									title="Cancelled: {jt.cancelled}"
								></div>
							{/if}
						</div>
						<div class="mt-2 flex gap-3 text-[10px] text-gray-500">
							{#if jt.pending > 0}<span class="flex items-center gap-1"
									><span class="inline-block h-1.5 w-1.5 rounded-full bg-blue-400"
									></span>{jt.pending} P</span
								>{/if}
							{#if jt.in_progress > 0}<span class="flex items-center gap-1"
									><span class="inline-block h-1.5 w-1.5 rounded-full bg-yellow-400"
									></span>{jt.in_progress} IP</span
								>{/if}
							{#if jt.completed > 0}<span class="flex items-center gap-1"
									><span class="inline-block h-1.5 w-1.5 rounded-full bg-green-400"
									></span>{jt.completed} C</span
								>{/if}
							{#if jt.cancelled > 0}<span class="flex items-center gap-1"
									><span class="inline-block h-1.5 w-1.5 rounded-full bg-red-300"
									></span>{jt.cancelled} X</span
								>{/if}
						</div>
					</div>
				{/each}
				{#if jobTypeStats.length === 0}
					<p class="py-8 text-center text-sm text-gray-400">{$t('No data available')}</p>
				{/if}
			</div>
		</div>

		<!-- Recent Job Orders -->
		<div
			class="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm xl:col-span-2"
		>
			<div class="flex items-center justify-between border-b border-gray-100 px-6 py-4">
				<h2 class="text-base font-bold text-gray-800">{$t('Recent Job Orders')}</h2>
				<a
					href="/freight-forwarder/job-orders"
					class="text-sm font-semibold text-blue-600 hover:text-blue-800">{$t('View All')} &rarr;</a
				>
			</div>
			<div class="flex-1 overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-100 text-sm">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase"
								>{$t('Job No.')}</th
							>
							<th class="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase"
								>{$t('Customer')}</th
							>
							<th class="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase"
								>{$t('Owner')}</th
							>
							<th class="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase"
								>{$t('Status')}</th
							>
							<th class="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase"
								>{$t('Date')}</th
							>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100 bg-white">
						{#each recentJobs as job}
							<tr
								class="cursor-pointer transition-colors hover:bg-gray-50"
								onclick={() => (window.location.href = `/freight-forwarder/job-orders/${job.id}`)}
							>
								<td class="px-5 py-3.5">
									<div class="font-bold text-gray-900">
										{formatJobNumber(job.job_type, job.job_date, job.id)}
									</div>
									{#if job.service_type}<div class="mt-0.5 text-[10px] text-gray-400 uppercase">
											{job.service_type}
										</div>{/if}
								</td>
								<td class="px-5 py-3.5">
									<div class="max-w-[180px] truncate font-medium text-gray-800">
										{job.company_name || job.customer_name || $t('Unknown')}
									</div>
								</td>
								<td class="px-5 py-3.5">
									{#if job.owner_name}
										<div class="flex items-center gap-2">
											<div
												class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white"
											>
												{getOwnerInitials(job.owner_name)}
											</div>
											<span class="max-w-[100px] truncate text-xs text-gray-600"
												>{job.owner_name}</span
											>
										</div>
									{:else}
										<span class="text-xs text-gray-300">—</span>
									{/if}
								</td>
								<td class="px-5 py-3.5 text-center">
									{#if job.job_status === 'Pending'}
										<span
											class="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
											>{$t('Status_Pending') || job.job_status}</span
										>
									{:else if job.job_status === 'In Progress'}
										<span
											class="inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700"
											>{$t('Status_In Progress') || job.job_status}</span
										>
									{:else if job.job_status === 'Completed'}
										<span
											class="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
											>{$t('Status_Completed') || job.job_status}</span
										>
									{:else if job.job_status === 'Cancelled'}
										<span
											class="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600"
											>{$t('Status_Cancelled') || job.job_status}</span
										>
									{:else}
										<span
											class="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
											>{job.job_status}</span
										>
									{/if}
								</td>
								<td class="px-5 py-3.5 text-right text-xs text-gray-500"
									>{formatDate(job.job_date)}</td
								>
							</tr>
						{/each}
						{#if recentJobs.length === 0}
							<tr>
								<td colspan="5" class="py-10 text-center text-gray-400"
									>{$t('No recent job orders')}</td
								>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	</div>
</div>

<style>
	.material-symbols-outlined {
		font-variation-settings:
			'FILL' 1,
			'wght' 400,
			'GRAD' 0,
			'opsz' 24;
	}
</style>
