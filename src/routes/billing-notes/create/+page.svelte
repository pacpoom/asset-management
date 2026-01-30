<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from '../create/$types';

	export let data: PageData;
	$: ({ customers, products } = data);

	let billingDate = new Date().toISOString().split('T')[0];
	let dueDate = '';
	let selectedCustomerId: string | number = '';
	let notes = '';

	let searchQuery = '';
	let showDropdown = false;
	let selectedItems: any[] = [];
	let isSaving = false;

	$: filteredProducts = (products || []).filter(
		(p: any) =>
			p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			(p.code && p.code.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	function selectProduct(product: any) {
		selectedItems = [
			...selectedItems,
			{
				product_id: product.id,
				item_name: product.name,
				quantity: 1,
				unit_price: Number(product.price || 0),
				amount: Number(product.price || 0)
			}
		];
		searchQuery = '';
		showDropdown = false;
	}

	function removeItem(index: number) {
		selectedItems = selectedItems.filter((_, i) => i !== index);
	}

	function updateLineTotal(index: number) {
		const item = selectedItems[index];
		item.amount = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
		selectedItems = [...selectedItems];
	}

	$: totalAmount = selectedItems.reduce((sum, item) => sum + item.amount, 0);
	$: itemsJson = JSON.stringify(selectedItems);
</script>

<svelte:head>
	<title>สร้างใบวางบิลใหม่</title>
</svelte:head>

<div class="mx-auto max-w-4xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
	<h1 class="mb-6 text-2xl font-bold text-gray-800">สร้างใบวางบิล (New Billing Note)</h1>

	<form
		method="POST"
		action="?/create"
		use:enhance={() => {
			isSaving = true;
			return async ({ update }) => {
				await update();
				isSaving = false;
			};
		}}
	>
		<div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
			<div>
				<label for="customer_id" class="mb-1 block text-sm font-medium text-gray-700"
					>ลูกค้า <span class="text-red-500">*</span></label
				>
				<select
					id="customer_id"
					name="customer_id"
					bind:value={selectedCustomerId}
					required
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				>
					<option value="">-- เลือกลูกค้า --</option>
					{#each customers as customer}
						<option value={customer.id}>{customer.name}</option>
					{/each}
				</select>
			</div>
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="billing_date" class="mb-1 block text-sm font-medium text-gray-700"
						>วันที่วางบิล <span class="text-red-500">*</span></label
					>
					<input
						type="date"
						id="billing_date"
						name="billing_date"
						bind:value={billingDate}
						required
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="due_date" class="mb-1 block text-sm font-medium text-gray-700"
						>ครบกำหนดชำระ</label
					>
					<input
						type="date"
						id="due_date"
						name="due_date"
						bind:value={dueDate}
						class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
			</div>
		</div>

		<hr class="my-6 border-gray-200" />

		<div class="mb-6">
			<h3 class="mb-3 text-lg font-semibold text-gray-800">รายการสินค้า (Items)</h3>

			<div class="relative mb-4">
				<label for="product_search" class="mb-1 block text-sm font-medium text-gray-700"
					>ค้นหาและเพิ่มสินค้า</label
				>
				<input
					type="text"
					placeholder="พิมพ์ชื่อสินค้า..."
					class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					bind:value={searchQuery}
					on:focus={() => (showDropdown = true)}
					on:blur={() => setTimeout(() => (showDropdown = false), 200)}
				/>

				{#if showDropdown && searchQuery}
					<div
						class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white shadow-lg"
					>
						{#if filteredProducts.length === 0}
							<div class="p-3 text-sm text-gray-500">ไม่พบสินค้า</div>
						{:else}
							{#each filteredProducts as p}
								<button
									type="button"
									class="flex w-full justify-between px-4 py-2 text-left text-sm hover:bg-blue-50"
									on:mousedown={() => selectProduct(p)}
								>
									<span class="font-medium text-gray-800">{p.name}</span>
									<span class="text-gray-500">{Number(p.price).toLocaleString()} ฿</span>
								</button>
							{/each}
						{/if}
					</div>
				{/if}
			</div>

			<div class="overflow-x-auto rounded-md border border-gray-200">
				<table class="w-full text-sm">
					<thead class="bg-gray-50 text-gray-700">
						<tr>
							<th class="px-4 py-2 text-left">รายการ</th>
							<th class="w-24 px-4 py-2 text-center">จำนวน</th>
							<th class="w-32 px-4 py-2 text-right">ราคา/หน่วย</th>
							<th class="w-32 px-4 py-2 text-right">รวมเงิน</th>
							<th class="w-16 px-4 py-2 text-center">ลบ</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each selectedItems as item, i}
							<tr>
								<td class="px-4 py-2">
									<input
										type="text"
										bind:value={item.item_name}
										class="w-full rounded border-gray-300 px-2 py-1 text-sm"
									/>
								</td>
								<td class="px-4 py-2">
									<input
										type="number"
										bind:value={item.quantity}
										on:input={() => updateLineTotal(i)}
										class="w-full rounded border-gray-300 px-2 py-1 text-center text-sm"
										min="1"
									/>
								</td>
								<td class="px-4 py-2">
									<input
										type="number"
										bind:value={item.unit_price}
										on:input={() => updateLineTotal(i)}
										class="w-full rounded border-gray-300 px-2 py-1 text-right text-sm"
										step="0.01"
									/>
								</td>
								<td class="px-4 py-2 text-right font-medium text-gray-900">
									{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
								</td>
								<td class="px-4 py-2 text-center">
									<button
										type="button"
										class="text-red-500 hover:text-red-700"
										on:click={() => removeItem(i)}>✕</button
									>
								</td>
							</tr>
						{/each}
						{#if selectedItems.length === 0}
							<tr
								><td colspan="5" class="p-4 text-center text-gray-500">กรุณาเพิ่มรายการสินค้า</td
								></tr
							>
						{/if}
					</tbody>
					<tfoot class="bg-gray-50 font-bold">
						<tr>
							<td colspan="3" class="px-4 py-3 text-right text-gray-700">ยอดรวมทั้งสิ้น</td>
							<td class="px-4 py-3 text-right text-lg text-blue-700">
								{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
							</td>
							<td></td>
						</tr>
					</tfoot>
				</table>
			</div>
		</div>

		<div class="mb-6">
			<label for="notes" class="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ</label>
			<textarea
				id="notes"
				name="notes"
				bind:value={notes}
				rows="3"
				class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				placeholder="ระบุหมายเหตุ..."
			></textarea>
		</div>

		<input type="hidden" name="items" value={itemsJson} />

		<div class="flex justify-end gap-3">
			<a
				href="/billing-notes"
				class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
			>
				ยกเลิก
			</a>
			<button
				type="submit"
				class="flex items-center rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
				disabled={isSaving}
			>
				{#if isSaving}
					กำลังบันทึก...
				{:else}
					บันทึกใบวางบิล
				{/if}
			</button>
		</div>
	</form>
</div>
