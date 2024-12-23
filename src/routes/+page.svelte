<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		marketData,
		timeframes,
		initializeWebSockets,
		closeWebSockets,
		sortPairs,
		getColorClass,
		fetchPairData,
		type SortOption
	} from '$lib/marketData';

	let currentSort: SortOption = 'symbol';
	let containerHeight: number;
	let scrollTop = 0;
	const ROW_HEIGHT = 28;
	const BUFFER_SIZE = 200;
	let loadedPairs = new Set<string>();

	onMount(() => {
		initializeWebSockets();
	});

	onDestroy(() => {
		closeWebSockets();
	});

	$: sortedPairs = sortPairs(Object.entries($marketData), currentSort);
	$: totalHeight = sortedPairs.length * ROW_HEIGHT;
	$: visibleRows = Math.ceil(containerHeight / ROW_HEIGHT);
	$: startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_SIZE);
	$: endIndex = Math.min(
		sortedPairs.length,
		Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_SIZE
	);
	$: visiblePairs = sortedPairs.slice(startIndex, endIndex);
	$: {
		// Load data for newly visible pairs
		visiblePairs.forEach(([symbol]) => {
			if (!loadedPairs.has(symbol)) {
				loadedPairs.add(symbol);
				fetchPairData(symbol);
			}
		});
	}

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

	function handleScroll(event: Event) {
		const target = event.target as HTMLElement;
		scrollTop = target.scrollTop;
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

	<div
		class="overflow-auto"
		style="height: 80vh;"
		bind:clientHeight={containerHeight}
		on:scroll={handleScroll}
	>
		<table class="relative w-full border border-gray-300 bg-white text-xs">
			<thead class="sticky top-0 z-10 bg-gray-100">
				<tr>
					<th class="border px-2 py-1">Symbol</th>
					{#each timeframes as timeframe}
						<th class="border px-2 py-1">{timeframe}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#if startIndex > 0}
					<tr style="height: {startIndex * ROW_HEIGHT}px;"></tr>
				{/if}
				{#each visiblePairs as [symbol, data]}
					<tr class="hover:bg-gray-50">
						<td class="border px-2 py-1 font-medium">
							<a
								href="https://www.bitget.com/futures/usdt/{symbol}"
								target="_blank"
								rel="noopener noreferrer"
								class="text-blue-600 hover:text-blue-800"
							>
								{symbol}
							</a>
						</td>
						{#each timeframes as timeframe}
							<td
								class={`whitespace-nowrap border px-2 py-1 text-right ${getColorClass(data[timeframe])}`}
							>
								{data[timeframe] ? `${data[timeframe]}%` : '-'}
							</td>
						{/each}
					</tr>
				{/each}
				{#if endIndex < sortedPairs.length}
					<tr style="height: {(sortedPairs.length - endIndex) * ROW_HEIGHT}px;"></tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>

<style>
	:global(body) {
		background-color: #f5f5f5;
	}

	/* Custom scrollbar styles */
	.overflow-auto {
		scrollbar-width: thin;
		scrollbar-color: rgba(156, 163, 175, 0.3) transparent;
		scroll-behavior: smooth;
		-webkit-overflow-scrolling: touch;
		scroll-snap-type: y proximity;
		will-change: transform;
	}

	/* Prevent scroll acceleration */
	.overflow-auto {
		overflow-y: scroll;
		overscroll-behavior-y: none;
	}

	/* For Webkit browsers (Chrome, Safari) */
	.overflow-auto::-webkit-scrollbar {
		width: 4px;
	}

	.overflow-auto::-webkit-scrollbar-track {
		background: transparent;
	}

	.overflow-auto::-webkit-scrollbar-thumb {
		background-color: rgba(156, 163, 175, 0.3);
		border-radius: 20px;
		transition: all 0.3s ease;
	}

	.overflow-auto::-webkit-scrollbar-thumb:hover {
		background-color: rgba(156, 163, 175, 0.5);
	}

	/* Add smooth transitions to rows */
	tr {
		transition: background-color 0.2s ease;
	}
</style>
