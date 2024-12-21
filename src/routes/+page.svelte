<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { writable } from 'svelte/store';
	import type { MarketData } from './types';

	const marketData = writable<MarketData>({});
	let ws: WebSocket | null = null;
	let timeframes = ['5m', '15m', '30m', '1h'];

	function calculatePercentChange(open: number, close: number) {
		return (((close - open) / open) * 100).toFixed(2);
	}

	async function initializeWebSocket() {
		try {
			const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
			const data = await response.json();
			const usdtPairs = data.symbols
				.filter((symbol: any) => symbol.quoteAsset === 'USDT' && symbol.status === 'TRADING')
				.map((symbol: any) => symbol.symbol);

			const initialData = {};
			usdtPairs.forEach((pair) => {
				initialData[pair] = {
					'5m': null,
					'15m': null,
					'30m': null,
					'1h': null,
					lastPrice: null
				};
			});
			marketData.set(initialData);

			for (const pair of usdtPairs) {
				for (const timeframe of timeframes) {
					fetchKlines(pair, timeframe);
				}
			}

			ws = new WebSocket('wss://fstream.binance.com/ws');

			const subscribeMsg = {
				method: 'SUBSCRIBE',
				params: usdtPairs.map((pair) => `${pair.toLowerCase()}@kline_1m`),
				id: 1
			};

			ws.onopen = () => {
				ws.send(JSON.stringify(subscribeMsg));
			};

			ws.onmessage = (event) => {
				const data = JSON.parse(event.data);
				if (data.e === 'kline') {
					updateMarketData(data.s, data.k);
				}
			};

			ws.onerror = (error) => {
				console.error('WebSocket error:', error);
			};
		} catch (error) {
			console.error('Error initializing data:', error);
		}
	}

	async function fetchKlines(pair: string, timeframe: string) {
		try {
			const interval = timeframe;
			const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${pair}&interval=${interval}&limit=2`;
			const response = await fetch(url);
			const data = await response.json();

			if (data.length >= 2) {
				const [previousCandle, currentCandle] = data;
				const percentChange = calculatePercentChange(
					parseFloat(previousCandle[1]),
					parseFloat(currentCandle[4])
				);

				marketData.update((current) => {
					if (!current[pair]) current[pair] = {};
					current[pair][timeframe] = percentChange;
					return current;
				});
			}
		} catch (error) {
			console.error(`Error fetching klines for ${pair} ${timeframe}:`, error);
		}
	}

	function updateMarketData(symbol: string, kline: any) {
		marketData.update((current) => {
			if (current[symbol]) {
				current[symbol].lastPrice = parseFloat(kline.c);
			}
			return current;
		});
	}

	function startPeriodicUpdates() {
		const intervals = {
			'5m': 5 * 60 * 1000,
			'15m': 15 * 60 * 1000,
			'30m': 30 * 60 * 1000,
			'1h': 60 * 60 * 1000
		};

		Object.entries(intervals).forEach(([timeframe, interval]) => {
			setInterval(() => {
				$marketData &&
					Object.keys($marketData).forEach((pair) => {
						fetchKlines(pair, timeframe);
					});
			}, interval);
		});
	}

	onMount(() => {
		initializeWebSocket();
		startPeriodicUpdates();
	});

	onDestroy(() => {
		if (ws) {
			ws.close();
		}
	});

	$: sortedPairs = Object.entries($marketData).sort(([, a], [, b]) => {
		const aSum = timeframes.reduce((sum, tf) => sum + (parseFloat(a[tf]) || 0), 0);
		const bSum = timeframes.reduce((sum, tf) => sum + (parseFloat(b[tf]) || 0), 0);
		return bSum - aSum;
	});

	function getColorClass(value: string | null): string {
		if (!value) return '';
		const numValue = parseFloat(value);
		if (numValue > 0) return 'text-green-600';
		if (numValue < 0) return 'text-red-600';
		return '';
	}
</script>

<div class="container mx-auto p-4">
	<h1 class="mb-4 text-2xl font-bold">Crypto Price Movements</h1>

	<div class="grid grid-cols-4 gap-4">
		{#each Array(4) as _, columnIndex}
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
						{#each sortedPairs.slice(columnIndex * Math.ceil(sortedPairs.length / 4), (columnIndex + 1) * Math.ceil(sortedPairs.length / 4)) as [symbol, data]}
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
