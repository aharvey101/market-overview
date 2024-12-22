<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { writable } from 'svelte/store';
	import type { MarketData, BinanceSymbol, KlineData } from './types';

	const marketData = writable<MarketData>({});
	let ws: WebSocket | null = null;
	let timeframes = ['5m', '15m', '30m', '1h'];

	async function initializeWebSocket() {
		try {
			const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
			const data = await response.json();
			const usdtPairs: string[] = data.symbols
				.filter(
					(symbol: BinanceSymbol) => symbol.quoteAsset === 'USDT' && symbol.status === 'TRADING'
				)
				.map((symbol: BinanceSymbol) => symbol.symbol);

			// Initialize market data structure
			const initialData: MarketData = {};
			usdtPairs.forEach((pair: string) => {
				initialData[pair] = {
					'5m': null,
					'15m': null,
					'30m': null,
					'1h': null,
					lastPrice: null
				};
			});
			marketData.set(initialData);

			// Set up WebSocket connection for all timeframes
			ws = new WebSocket('wss://fstream.binance.com/ws');

			const subscribeMsg: {
				method: string;
				params: string[];
				id: number;
			} = {
				method: 'SUBSCRIBE',
				params: usdtPairs.flatMap((pair) =>
					timeframes.map((timeframe) => `${pair.toLowerCase()}@kline_${timeframe}`)
				),
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

	function updateMarketData(symbol: string, kline: KlineData) {
		marketData.update((current) => {
			if (current[symbol]) {
				const timeframe = kline.i;
				const open = parseFloat(kline.o);
				const close = parseFloat(kline.c);
				const percentChange = ((close - open) / open) * 100;

				current[symbol][timeframe] = percentChange.toFixed(2);
				current[symbol].lastPrice = close;
			}
			return current;
		});
	}

	onMount(() => {
		initializeWebSocket();
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
