import { writable, type Writable } from 'svelte/store';
import type { MarketData, BinanceSymbol, KlineData } from '../routes/types';

export const shortTimeframes = ['5m', '15m', '30m', '1h', '2h', '4h'] as const;
export const longTimeframes = ['8h', '12h', '1d', '1w', '1M'] as const;
export type ShortTimeframe = typeof shortTimeframes[number];
export type LongTimeframe = typeof longTimeframes[number];
export type Timeframe = ShortTimeframe | LongTimeframe;
export type SortOption =
    | 'symbol'
    | 'symbol-desc'
    | `${Timeframe}`
    | `${Timeframe}-desc`;

const STREAMS_PER_CONNECTION = 200;

export const marketData: Writable<MarketData> = writable({});
let websockets: WebSocket[] = [];
let longTimeframesInitialized = false;

// Rate limiting queue
let requestQueue: (() => Promise<void>)[] = [];
let isProcessingQueue = false;
const BATCH_SIZE = 100;
const BATCH_INTERVAL = 100; // 100 milliseconds

async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (requestQueue.length > 0) {
        const batch = requestQueue.splice(0, BATCH_SIZE);
        await Promise.all(batch.map(request => request()));
        if (requestQueue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, BATCH_INTERVAL));
        }
    }

    isProcessingQueue = false;
}

export async function fetchPairData(pair: string, includeLongTimeframes = false) {
    return new Promise<void>((resolve) => {
        const request = async () => {
            const timeframesToFetch = includeLongTimeframes
                ? [...shortTimeframes, ...longTimeframes]
                : shortTimeframes;

            const results = await Promise.all(
                timeframesToFetch.map(async (timeframe) => {
                    try {
                        const response = await fetch(
                            `https://fapi.binance.com/fapi/v1/klines?symbol=${pair}&interval=${timeframe}&limit=1`
                        );
                        const klineData = await response.json();
                        if (klineData && klineData[0]) {
                            const [openTime, open, high, low, close, volume, closeTime] = klineData[0];
                            return {
                                timeframe,
                                data: {
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
                                }
                            };
                        }
                    } catch (error) {
                        console.error(`Error fetching data for ${pair} ${timeframe}:`, error);
                    }
                    return null;
                })
            );

            results.forEach(result => {
                if (result) {
                    updateMarketData(pair, result.data);
                }
            });
            resolve();
        };

        requestQueue.push(request);
        processQueue();
    });
}

export async function initializeWebSockets(includeLongTimeframes = false) {
    try {
        if (includeLongTimeframes && longTimeframesInitialized) {
            return; // Long timeframes already initialized
        }

        const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
        const data = await response.json();
        const usdtPairs: string[] = data.symbols
            .filter(
                (symbol: BinanceSymbol) => symbol.quoteAsset === 'USDT' && symbol.status === 'TRADING'
            )
            .map((symbol: BinanceSymbol) => symbol.symbol);

        // Only initialize market data if it's empty or we're adding long timeframes
        if (!longTimeframesInitialized) {
            const initialData: MarketData = {};
            usdtPairs.forEach((pair: string) => {
                initialData[pair] = {
                    '5m': null,
                    '15m': null,
                    '30m': null,
                    '1h': null,
                    '2h': null,
                    '4h': null,
                    '8h': null,
                    '12h': null,
                    '1d': null,
                    '1w': null,
                    '1M': null,
                    lastPrice: null
                };
            });
            marketData.set(initialData);
        }

        // Create stream names based on the timeframe set
        const timeframesToStream = includeLongTimeframes ? longTimeframes : shortTimeframes;
        const allStreams = usdtPairs.flatMap((pair) =>
            timeframesToStream.map((timeframe) => `${pair.toLowerCase()}@kline_${timeframe}`)
        );

        // Split streams into chunks
        for (let i = 0; i < allStreams.length; i += STREAMS_PER_CONNECTION) {
            const streamChunk = allStreams.slice(i, i + STREAMS_PER_CONNECTION).join('/');
            const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streamChunk}`);

            ws.addEventListener('message', (event) => {
                const data = JSON.parse(event.data);
                if (data.data && data.data.e === 'kline') {
                    const k = data.data.k;
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
            });

            ws.addEventListener('error', (error) => {
                console.error('WebSocket error:', error);
            });

            websockets.push(ws);
        }

        if (includeLongTimeframes) {
            longTimeframesInitialized = true;
        }
    } catch (error) {
        console.error('Error initializing data:', error);
    }
}

function updateMarketData(symbol: string, kline: KlineData) {
    marketData.update((current) => {
        const timeframe = kline.i;
        if (current[symbol] &&
            ((shortTimeframes as readonly string[]).includes(timeframe) ||
                (longTimeframes as readonly string[]).includes(timeframe))) {
            const open = parseFloat(kline.o);
            const close = parseFloat(kline.c);
            const percentChange = ((close - open) / open) * 100;

            const data = current[symbol];
            if (timeframe in data) {
                (data[timeframe as keyof typeof data] as string | null) = percentChange.toFixed(2);
                data.lastPrice = close;
            }
        }
        return current;
    });
}

export function closeWebSockets() {
    websockets.forEach((ws) => ws.close());
    websockets = [];
}

export function sortPairs(pairs: [string, any][], sortBy: SortOption): [string, any][] {
    return [...pairs].sort(([symbolA, dataA], [symbolB, dataB]) => {
        if (sortBy === 'symbol') return symbolA.localeCompare(symbolB);
        if (sortBy === 'symbol-desc') return symbolB.localeCompare(symbolA);

        const timeframe = sortBy.replace('-desc', '') as Timeframe;
        const isDesc = sortBy.endsWith('-desc');

        const valueA = parseFloat(dataA[timeframe] || '0');
        const valueB = parseFloat(dataB[timeframe] || '0');

        return isDesc ? valueB - valueA : valueA - valueB;
    });
}

export function getColorClass(value: string | null): string {
    if (!value) return '';
    const numValue = parseFloat(value);
    if (numValue > 0) return 'text-green-600';
    if (numValue < 0) return 'text-red-600';
    return '';
} 