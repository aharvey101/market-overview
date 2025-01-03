<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		marketData,
		shortTimeframes,
		longTimeframes,
		initializeWebSockets,
		closeWebSockets,
		sortPairs,
		getColorClass,
		fetchPairData,
		type SortOption,
		type Timeframe
	} from '$lib/marketData';
	import type { TimeframeData } from '../routes/types';

	let currentSort: SortOption = 'symbol';
	let containerHeight: number;
	let scrollTop = 0;
	let showLongTimeframes = false;
	let showSignificantMovers = false;
	const ROW_HEIGHT = 28;
	const BUFFER_SIZE = 200;
	let loadedPairs = new Set<string>();

	$: activeTimeframes = showLongTimeframes ? longTimeframes : shortTimeframes;

	$: filteredPairs = showSignificantMovers
		? Object.entries($marketData).filter((entry): entry is [string, TimeframeData] => {
				const [_, data] = entry as [string, TimeframeData];
				const sortTimeframe = String(currentSort).replace('-desc', '');
				if (sortTimeframe === 'symbol') return true;
				const change = parseFloat(data[sortTimeframe as keyof TimeframeData] || '0');
				return Math.abs(change) >= 5;
			})
		: Object.entries($marketData);

	$: sortedPairs = sortPairs(filteredPairs, currentSort);

	$: startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_SIZE);
	$: endIndex = Math.min(
		sortedPairs.length,
		Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_SIZE
	);
	$: visiblePairs = sortedPairs.slice(startIndex, endIndex);
	$: {
		visiblePairs.forEach(([symbol]) => {
			if (!loadedPairs.has(symbol)) {
				loadedPairs.add(symbol);
				fetchPairData(symbol, showLongTimeframes);
			}
		});
	}

	onMount(() => {
		initializeWebSockets(false);
	});

	onDestroy(() => {
		closeWebSockets();
	});

	async function toggleTimeframes() {
		showLongTimeframes = !showLongTimeframes;
		if (showLongTimeframes) {
			await initializeWebSockets(true);
			loadedPairs.clear();
		} else {
			loadedPairs.clear();
		}
	}

	function downloadMovers(timeframe: string) {
		const significantPairs = Object.entries($marketData)
			.filter((entry): entry is [string, TimeframeData] => {
				const [_, data] = entry;
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
				{#each activeTimeframes as timeframe}
					<option value={timeframe}>{timeframe} % Change (Low to High)</option>
					<option value={`${timeframe}-desc`}>{timeframe} % Change (High to Low)</option>
				{/each}
			</select>
			<button
				on:click={toggleTimeframes}
				class="rounded border bg-gray-500 px-2 py-1 text-xs text-white hover:bg-gray-600"
			>
				{showLongTimeframes ? 'Show Short Timeframes' : 'Show Long Timeframes'}
			</button>
			<button
				on:click={() => (showSignificantMovers = !showSignificantMovers)}
				class="rounded border bg-yellow-500 px-2 py-1 text-xs text-white hover:bg-yellow-600"
			>
				{showSignificantMovers ? 'Show All Pairs' : 'Show ±5% Only'}
			</button>
			{#each activeTimeframes as timeframe}
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
					{#each activeTimeframes as timeframe}
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
						{#each activeTimeframes as timeframe}
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
