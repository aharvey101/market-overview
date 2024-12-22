<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { writable } from 'svelte/store';
	import type { MarketData, BinanceSymbol, KlineData } from './types';

	const marketData = writable<MarketData>({});
	let websockets: WebSocket[] = [];
	const timeframes = ['5m', '15m', '30m', '1h'] as const;
	type Timeframe = (typeof timeframes)[number];
	const STREAMS_PER_CONNECTION = 200; // Safe limit to stay well under the 1024 max

	async function initializeWebSockets() {
		try {
			// Fetch available pairs
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

			// Close existing WebSockets if they exist
			websockets.forEach((ws) => ws.close());
			websockets = [];

			// Fetch initial kline data for each pair and timeframe
			await Promise.all(
				usdtPairs.flatMap((pair) =>
					timeframes.map(async (timeframe) => {
						try {
							const response = await fetch(
								`https://fapi.binance.com/fapi/v1/klines?symbol=${pair}&interval=${timeframe}&limit=1`
							);
							const klineData = await response.json();
							if (klineData && klineData[0]) {
								// Kline data format: [openTime, open, high, low, close, volume, closeTime, ...]
								const [openTime, open, high, low, close, volume, closeTime] = klineData[0];
								updateMarketData(pair, {
									t: openTime,
									T: closeTime,
									s: pair,
									i: timeframe,
									f: 0,
									L: 0,
									o: open,
									c: close,
									h: high,
									l: low,
									v: volume,
									n: 0,
									x: true,
									q: '0',
									V: '0',
									Q: '0'
								});
							}
						} catch (error) {
							console.error(`Error fetching initial data for ${pair} ${timeframe}:`, error);
						}
					})
				)
			);

			// Create all stream names
			const allStreams = usdtPairs.flatMap((pair) =>
				timeframes.map((timeframe) => `${pair.toLowerCase()}@kline_${timeframe}`)
			);

			// Split streams into chunks
			for (let i = 0; i < allStreams.length; i += STREAMS_PER_CONNECTION) {
				const streamChunk = allStreams.slice(i, i + STREAMS_PER_CONNECTION).join('/');
				const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streamChunk}`);

				ws.addEventListener('message', (event) => {
					const data = JSON.parse(event.data);

					// Combined stream events are wrapped as {"stream":"<streamName>","data":<rawPayload>}
					if (data.data && data.data.e === 'kline') {
						const k = data.data.k;
						// Only update if it's the final kline update for the interval
						if (k.x) {
							updateMarketData(data.data.s, {
								t: k.t,
								T: k.T,
								s: k.s,
								i: k.i,
								f: k.f,
								L: k.L,
								o: k.o,
								c: k.c,
								h: k.h,
								l: k.l,
								v: k.v,
								n: k.n,
								x: k.x,
								q: k.q,
								V: k.V,
								Q: k.Q
							});
						}
					}
				});

				ws.addEventListener('error', (error) => {
					console.error('WebSocket error:', error);
				});

				websockets.push(ws);
			}
		} catch (error) {
			console.error('Error initializing data:', error);
		}
	}

	function updateMarketData(symbol: string, kline: KlineData) {
		marketData.update((current) => {
			if (current[symbol] && timeframes.includes(kline.i as Timeframe)) {
				const timeframe = kline.i as Timeframe;
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
		initializeWebSockets();
	});

	onDestroy(() => {
		websockets.forEach((ws) => ws.close());
	});

	$: sortedPairs = Object.entries($marketData).sort(([, a], [, b]) => {
		const aSum = timeframes.reduce((sum, tf) => sum + (parseFloat(a[tf] || '0') || 0), 0);
		const bSum = timeframes.reduce((sum, tf) => sum + (parseFloat(b[tf] || '0') || 0), 0);
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
