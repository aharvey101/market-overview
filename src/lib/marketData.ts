import { writable, type Writable } from 'svelte/store';
import type { MarketData, BinanceSymbol, KlineData } from '../routes/types';

export const timeframes = ['5m', '15m', '30m', '1h', '2h', '4h', '8h', '1d'] as const;
export type Timeframe = typeof timeframes[number];
export type SortOption = 'symbol' | 'symbol-desc' | '5m' | '5m-desc' | '15m' | '15m-desc' | '30m' | '30m-desc' | '1h' | '1h-desc' | '2h' | '2h-desc' | '4h' | '4h-desc' | '8h' | '8h-desc' | '1d' | '1d-desc';

const STREAMS_PER_CONNECTION = 200;

export const marketData: Writable<MarketData> = writable({});
let websockets: WebSocket[] = [];

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

async function fetchInitialKlines(pairs: string[], timeframe: string, batchSize = 100) {
    const results = [];
    for (let i = 0; i < pairs.length; i += batchSize) {
        const batch = pairs.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(async (pair) => {
                try {
                    const response = await fetch(
                        `https://fapi.binance.com/fapi/v1/klines?symbol=${pair}&interval=${timeframe}&limit=1`
                    );
                    const klineData = await response.json();
                    if (klineData && klineData[0]) {
                        const [openTime, open, high, low, close, volume, closeTime] = klineData[0];
                        return {
                            pair,
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
                    console.error(`Error fetching initial data for ${pair} ${timeframe}:`, error);
                }
                return null;
            })
        );
        results.push(...batchResults.filter(Boolean));
        // Add a delay between batches
        if (i + batchSize < pairs.length) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    return results;
}

export async function fetchPairData(pair: string) {
    return new Promise<void>((resolve) => {
        const request = async () => {
            const results = await Promise.all(
                timeframes.map(async (timeframe) => {
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

export async function initializeWebSockets() {
    try {
        // Fetch available pairs
        const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
        const data = await response.json();
        const usdtPairs: string[] = data.symbols
            .filter(
                (symbol: BinanceSymbol) => symbol.quoteAsset === 'USDT' && symbol.status === 'TRADING'
            )
            .map((symbol: BinanceSymbol) => symbol.symbol);

        // Initialize market data structure with null values
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
                '1d': null,
                lastPrice: null
            };
        });
        marketData.set(initialData);

        // Close existing WebSockets if they exist
        closeWebSockets();

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