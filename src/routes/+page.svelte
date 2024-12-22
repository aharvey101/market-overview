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

	function downloadMovers(timeframe: string) {
		const significantPairs = Object.entries($marketData)
			.filter(([_, data]) => {
				const change = parseFloat(data[timeframe] || '0');
				return Math.abs(change) >= 5;
			})
			.map(([symbol]) => `BINANCE:${symbol}.P`)
			.join('\n');

		const blob = new Blob([significantPairs], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${timeframe}_movers.txt`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
</script>

<div class="container mx-auto p-4">
	<div class="mb-4">
		<h1 class="mb-2 text-2xl font-bold">Crypto Price Movements</h1>
		<div class="flex flex-wrap items-center gap-2">
			<select class="rounded border px-2 py-1 text-xs" bind:value={currentSort}>
				<option value="symbol">Symbol (A-Z)</option>
				<option value="symbol-desc">Symbol (Z-A)</option>
				{#each timeframes as timeframe}
					<option value={timeframe}>{timeframe} % Change (Low to High)</option>
					<option value={`${timeframe}-desc`}>{timeframe} % Change (High to Low)</option>
				{/each}
			</select>
			{#each timeframes as timeframe}
				<button
					on:click={() => downloadMovers(timeframe)}
					class="rounded border bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600"
				>
					{timeframe} >5%
				</button>
			{/each}
		</div>
	</div>

	<div class="overflow-x-auto">
		<table class="w-full border border-gray-300 bg-white text-xs">
			<thead>
				<tr class="bg-gray-100">
					<th class="border px-2 py-1">Symbol</th>
					{#each timeframes as timeframe}
						<th class="border px-2 py-1">{timeframe}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each sortedPairs as [symbol, data]}
					<tr class="hover:bg-gray-50">
						<td class="border px-2 py-1 font-medium">{symbol}</td>
						{#each timeframes as timeframe}
							<td
								class={`whitespace-nowrap border px-2 py-1 text-right ${getColorClass(data[timeframe])}`}
							>
								{data[timeframe] ? `${data[timeframe]}%` : '-'}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	:global(body) {
		background-color: #f5f5f5;
	}
</style>
