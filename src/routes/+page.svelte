<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { writable } from 'svelte/store';
	import type { MarketData, KlineData, BinanceSymbol, FlashClass } from './types';
	import { sendTelegramAlert } from '$lib/telegram';

	// Store for tracking all pairs and their data
	const marketData = writable<MarketData>({});
	let ws: WebSocket | null = null;
	let timeframes = ['5m', '15m', '30m', '1h'];

	// Store previous values to detect crossings
	let previousValues = new Map();

	// Helper function to calculate percent change
	function calculatePercentChange(open: number, close: number) {
		return (((close - open) / open) * 100).toFixed(2);
	}

	// Initialize WebSocket connection and data fetching
	async function initializeWebSocket() {
		// First, get all USDT futures pairs
		try {
			const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
			const data = await response.json();
			const usdtPairs = data.symbols
				.filter((symbol: any) => symbol.quoteAsset === 'USDT' && symbol.status === 'TRADING')
				.map((symbol: any) => symbol.symbol);

			// Initialize market data structure
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

			// Fetch initial klines data for each pair and timeframe
			for (const pair of usdtPairs) {
				for (const timeframe of timeframes) {
					fetchKlines(pair, timeframe);
				}
			}

			// Set up WebSocket connection for price updates
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

	// Fetch klines (candlestick) data for a specific pair and timeframe
	async function fetchKlines(pair, timeframe) {
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

	// Update market data when new WebSocket message arrives
	function updateMarketData(symbol, kline) {
		marketData.update((current) => {
			if (current[symbol]) {
				current[symbol].lastPrice = parseFloat(kline.c);
			}
			return current;
		});
	}

	// Refresh klines data periodically
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

	// Sort function for the table
	$: sortedPairs = Object.entries($marketData).sort(([, a], [, b]) => {
		const aSum = timeframes.reduce((sum, tf) => sum + (parseFloat(a[tf]) || 0), 0);
		const bSum = timeframes.reduce((sum, tf) => sum + (parseFloat(b[tf]) || 0), 0);
		return bSum - aSum;
	});

	function shouldFlash(symbol: string, timeframe: string, value: string | null): string {
		const key = `${symbol}-${timeframe}`;
		const previousValue = previousValues.get(key) || 0;
		const currentValue = parseFloat(value || '0');

		previousValues.set(key, currentValue);

		if (Math.abs(previousValue) <= 5 && currentValue > 5) {
			sendTelegramAlert(
				`🟢 ${symbol} crossed above 5% on ${timeframe} timeframe (${currentValue.toFixed(2)}%)`
			);
			return 'flash-green';
		}
		if (Math.abs(previousValue) <= 5 && currentValue < -5) {
			sendTelegramAlert(
				`🔴 ${symbol} crossed below -5% on ${timeframe} timeframe (${currentValue.toFixed(2)}%)`
			);
			return 'flash-red';
		}
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
										class={`whitespace-nowrap border px-2 py-1 text-right text-sm ${data[timeframe] > 0 ? 'text-green-600' : ''} ${data[timeframe] < 0 ? 'text-red-600' : ''} ${shouldFlash(symbol, timeframe, data[timeframe])}`}
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

	@keyframes flash-green {
		0% {
			background-color: transparent;
		}
		50% {
			background-color: rgba(16, 185, 129, 0.2);
		}
		100% {
			background-color: transparent;
		}
	}

	@keyframes flash-red {
		0% {
			background-color: transparent;
		}
		50% {
			background-color: rgba(239, 68, 68, 0.2);
		}
		100% {
			background-color: transparent;
		}
	}

	.flash-green {
		animation: flash-green 2s 1; /* Note the "1" here for single animation */
	}

	.flash-red {
		animation: flash-red 2s 1; /* Note the "1" here for single animation */
	}
</style>
