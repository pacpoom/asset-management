<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { t, locale } from '$lib/i18n';

	const { data } = $props<{ data: PageData }>();

	let typeFilter = $state(data.typeFilter ?? '');

	function navigate(p: number) {
		const u = new URLSearchParams();
		u.set('page', String(p));
		if (typeFilter) u.set('type', typeFilter);
		goto(`/products/${data.product.id}/movements?${u.toString()}`, {
			noScroll: true,
			keepFocus: true,
			replaceState: true
		});
	}

	function changeFilter(v: string) {
		typeFilter = v;
		const u = new URLSearchParams();
		u.set('page', '1');
		if (typeFilter) u.set('type', typeFilter);
		goto(`/products/${data.product.id}/movements?${u.toString()}`, {
			noScroll: true,
			keepFocus: true,
			replaceState: true
		});
	}

	function formatQty(v: number | null | undefined) {
		if (v === null || v === undefined) return '-';
		return new Intl.NumberFormat($locale === 'th' ? 'th-TH' : 'en-US', {
			minimumFractionDigits: 0,
			maximumFractionDigits: 4
		}).format(v);
	}
	function formatDate(s: string | null | undefined) {
		if (!s) return '-';
		const d = new Date(s);
		if (isNaN(d.getTime())) return '-';
		return d.toLocaleString($locale === 'th' ? 'th-TH' : 'en-US');
	}

	function movementBadge(type: string) {
		const map: Record<string, { label: string; cls: string }> = {
			adjustment: { label: $t('Adjustment'), cls: 'bg-amber-100 text-amber-800' },
			opening: { label: $t('Opening'), cls: 'bg-slate-100 text-slate-700' },
			purchase: { label: $t('Purchase'), cls: 'bg-emerald-100 text-emerald-800' },
			sale: { label: $t('Sale'), cls: 'bg-blue-100 text-blue-800' },
			return_in: { label: $t('Return In'), cls: 'bg-cyan-100 text-cyan-800' },
			return_out: { label: $t('Return Out'), cls: 'bg-pink-100 text-pink-800' },
			transfer_in: { label: $t('Transfer In'), cls: 'bg-indigo-100 text-indigo-800' },
			transfer_out: { label: $t('Transfer Out'), cls: 'bg-fuchsia-100 text-fuchsia-800' },
			count: { label: $t('Count'), cls: 'bg-purple-100 text-purple-800' },
			other: { label: $t('Other'), cls: 'bg-gray-100 text-gray-700' }
		};
		return map[type] || { label: type, cls: 'bg-gray-100 text-gray-700' };
	}
</script>

<svelte:head>
	<title>{$t('Stock History')} — {data.product.name}</title>
</svelte:head>

<div class="mb-4 flex items-center justify-between gap-4">
	<div>
		<a href="/products" class="text-sm text-blue-600 hover:underline">← {$t('Back to Products')}</a>
		<h1 class="text-2xl font-bold text-gray-800">{$t('Stock History')}</h1>
		<p class="mt-1 text-sm text-gray-600">
			<span class="font-mono">{data.product.sku}</span> — {data.product.name}
		</p>
		<p class="mt-1 text-sm">
			{$t('Current')}: <strong class="text-blue-700">{formatQty(data.product.quantity_on_hand)}</strong>
			{data.product.unit_symbol ?? ''}
		</p>
	</div>
	<div class="flex items-center gap-2">
		<select
			value={typeFilter}
			onchange={(e) => changeFilter((e.target as HTMLSelectElement).value)}
			class="rounded-md border-gray-300 text-sm"
		>
			<option value="">{$t('All Types')}</option>
			<option value="opening">{$t('Opening')}</option>
			<option value="adjustment">{$t('Adjustment')}</option>
			<option value="purchase">{$t('Purchase')}</option>
			<option value="sale">{$t('Sale')}</option>
			<option value="return_in">{$t('Return In')}</option>
			<option value="return_out">{$t('Return Out')}</option>
			<option value="transfer_in">{$t('Transfer In')}</option>
			<option value="transfer_out">{$t('Transfer Out')}</option>
			<option value="count">{$t('Count')}</option>
			<option value="other">{$t('Other')}</option>
		</select>
	</div>
</div>

<div class="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-gray-200 text-sm">
		<thead class="bg-gray-50">
			<tr>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Date')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Type')}</th>
				<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('Before')}</th>
				<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('Change')}</th>
				<th class="px-4 py-3 text-right font-semibold text-gray-600">{$t('After')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Reference')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('Notes')}</th>
				<th class="px-4 py-3 text-left font-semibold text-gray-600">{$t('User')}</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#if data.movements.length === 0}
				<tr>
					<td colspan="8" class="py-10 text-center text-gray-500">{$t('No movements recorded.')}</td>
				</tr>
			{:else}
				{#each data.movements as m (m.id)}
					{@const b = movementBadge(m.movement_type)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-2 text-xs text-gray-600">{formatDate(m.created_at)}</td>
						<td class="px-4 py-2">
							<span class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold {b.cls}">{b.label}</span>
						</td>
						<td class="px-4 py-2 text-right text-gray-600">{formatQty(m.qty_before)}</td>
						<td class="px-4 py-2 text-right font-semibold {Number(m.qty_change) >= 0 ? 'text-emerald-700' : 'text-red-600'}">
							{Number(m.qty_change) >= 0 ? '+' : ''}{formatQty(m.qty_change)}
						</td>
						<td class="px-4 py-2 text-right font-medium text-blue-700">{formatQty(m.qty_after)}</td>
						<td class="px-4 py-2 text-xs text-gray-500">
							{#if m.reference_type}
								{m.reference_type}{m.reference_id ? `#${m.reference_id}` : ''}
							{:else}-{/if}
						</td>
						<td class="max-w-xs truncate px-4 py-2 text-xs text-gray-600" title={m.notes ?? ''}>{m.notes ?? '-'}</td>
						<td class="px-4 py-2 text-xs text-gray-600">{m.user_name ?? '-'}</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

{#if data.totalPages > 1}
	<div class="mt-4 flex items-center justify-end gap-2">
		<button
			type="button"
			disabled={data.page <= 1}
			onclick={() => navigate(data.page - 1)}
			class="rounded-md border bg-white px-3 py-1.5 text-xs disabled:opacity-50"
		>
			{$t('Previous')}
		</button>
		<span class="text-xs text-gray-600">{data.page} / {data.totalPages}</span>
		<button
			type="button"
			disabled={data.page >= data.totalPages}
			onclick={() => navigate(data.page + 1)}
			class="rounded-md border bg-white px-3 py-1.5 text-xs disabled:opacity-50"
		>
			{$t('Next')}
		</button>
	</div>
{/if}
