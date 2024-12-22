<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		marketData,
		timeframes,
		initializeWebSockets,
		closeWebSockets,
		sortPairs,
		getColorClass,
		type SortOption
	} from '$lib/marketData';

	let currentSort: SortOption = 'symbol';

	onMount(() => {
		initializeWebSockets();
	});

	onDestroy(() => {
		closeWebSockets();
	});

	$: sortedPairs = sortPairs(Object.entries($marketData), currentSort);
</script>

<div class="container mx-auto p-4">
	<div class="mb-4">
		<h1 class="mb-2 text-2xl font-bold">Crypto Price Movements</h1>
		<div class="flex gap-2">
			<select class="rounded border px-2 py-1" bind:value={currentSort}>
				<option value="symbol">Symbol (A-Z)</option>
				<option value="symbol-desc">Symbol (Z-A)</option>
				{#each timeframes as timeframe}
					<option value={timeframe}>{timeframe} % Change (Low to High)</option>
					<option value={`${timeframe}-desc`}>{timeframe} % Change (High to Low)</option>
				{/each}
			</select>
		</div>
	</div>

	<div class="grid grid-cols-2 gap-4">
		{#each Array(2) as _, columnIndex}
			<div class="overflow-x-auto">
				<table class="w-full border border-gray-300 bg-white">
					<thead>
						<tr class="bg-gray-100">
							<th class="border px-2 py-1 text-xs">Symbol</th>
							<th class="border px-2 py-1 text-xs">Price</th>
							{#each timeframes as timeframe}
								<th class="border px-2 py-1 text-xs">{timeframe}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each sortedPairs.slice(columnIndex * Math.ceil(sortedPairs.length / 2), (columnIndex + 1) * Math.ceil(sortedPairs.length / 2)) as [symbol, data]}
							<tr class="hover:bg-gray-50">
								<td class="border px-2 py-1 text-sm font-medium">{symbol}</td>
								<td class="border px-2 py-1 text-right text-xs">
									{data.lastPrice ? data.lastPrice.toFixed(4) : '-'}
								</td>
								{#each timeframes as timeframe}
									<td
										class={`whitespace-nowrap border px-2 py-1 text-right text-sm ${getColorClass(data[timeframe])}`}
									>
										{data[timeframe] ? `${data[timeframe]}%` : '-'}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/each}
	</div>
</div>

<style>
	:global(body) {
		background-color: #f5f5f5;
	}
</style>
