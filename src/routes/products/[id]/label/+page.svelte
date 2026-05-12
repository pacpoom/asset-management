<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';

	const { data } = $props<{ data: PageData }>();
	const labels = $derived(Array.from({ length: data.copies }, (_, i) => i));

	onMount(() => {
		// Auto-trigger print on load for convenience
		setTimeout(() => window.print(), 400);
	});

	function formatPrice(v: number | null | undefined) {
		if (v === null || v === undefined) return '';
		return new Intl.NumberFormat('th-TH', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(v);
	}
</script>

<svelte:head>
	<title>{data.product.name} — Label</title>
</svelte:head>

<div class="screen-only sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-white px-4 py-2 shadow-sm">
	<div class="text-sm">
		<strong>{data.product.sku}</strong> — {data.product.name}
		<span class="ml-2 text-gray-500">({data.copies} labels)</span>
	</div>
	<button
		type="button"
		onclick={() => window.print()}
		class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
	>
		{$t('Print')}
	</button>
</div>

<div class="label-sheet">
	{#each labels as _}
		<div class="label">
			<img src={data.qrDataUrl} alt="QR" class="qr" />
			<div class="meta">
				<div class="sku">{data.product.sku}</div>
				<div class="name">{data.product.name}</div>
				{#if data.product.barcode}
					<div class="barcode">📊 {data.product.barcode}</div>
				{/if}
				{#if data.product.selling_price !== null && data.product.selling_price !== undefined}
					<div class="price">฿ {formatPrice(data.product.selling_price)}</div>
				{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	.label-sheet {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4mm;
		padding: 6mm;
	}
	.label {
		display: flex;
		align-items: center;
		gap: 3mm;
		border: 1px dashed #cbd5e1;
		padding: 3mm;
		height: 30mm;
		page-break-inside: avoid;
		border-radius: 2mm;
	}
	.qr {
		width: 22mm;
		height: 22mm;
		flex-shrink: 0;
	}
	.meta {
		flex: 1;
		min-width: 0;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	.sku {
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: 9pt;
		color: #475569;
	}
	.name {
		font-size: 10pt;
		font-weight: 600;
		line-height: 1.2;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.barcode {
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: 8pt;
		color: #64748b;
	}
	.price {
		font-size: 10pt;
		font-weight: 700;
		color: #047857;
	}

	@media print {
		:global(body) {
			margin: 0;
		}
		.screen-only {
			display: none !important;
		}
		.label-sheet {
			padding: 4mm;
		}
		.label {
			border-color: transparent;
		}
	}
</style>
