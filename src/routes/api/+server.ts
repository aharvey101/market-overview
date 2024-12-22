import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import type { BinanceSymbol } from '../types';

// Store previous values to detect crossings
const previousValues = new Map();
const timeframes = ['5m', '15m', '30m', '1h'] as const;
const STREAMS_PER_CONNECTION = 200;
let websockets: WebSocket[] = [];

async function sendTelegramAlert(message: string) {
    try {
        const url = `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: env.TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
    } catch (error) {
        console.error('Failed to send Telegram message:', error);
    }
}

function checkThresholdCrossing(symbol: string, timeframe: string, value: number) {
    const key = `${symbol}-${timeframe}`;
    const previousValue = previousValues.get(key) || 0;

    previousValues.set(key, value);

    if (Math.abs(previousValue) <= 5 && value > 5) {
        sendTelegramAlert(
            `🟢 ${symbol} crossed above 5% on ${timeframe} timeframe (${value.toFixed(2)}%)`
        );
    }
    if (Math.abs(previousValue) <= 5 && value < -5) {
        sendTelegramAlert(
            `🔴 ${symbol} crossed below -5% on ${timeframe} timeframe (${value.toFixed(2)}%)`
        );
    }
}

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

        // Close existing WebSockets if they exist
        websockets.forEach(ws => ws.close());
        websockets = [];

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
                    const open = parseFloat(k.o);
                    const close = parseFloat(k.c);
                    const percentChange = ((close - open) / open) * 100;

                    checkThresholdCrossing(data.data.s, k.i, percentChange);
                }
            });

            ws.addEventListener('error', (error) => {
                console.error('WebSocket error:', error);
            });

            websockets.push(ws);
        }
    } catch (error) {
        console.error('Error initializing data:', error);
        // Attempt to reconnect after a delay
        setTimeout(() => initializeWebSockets(), 5000);
    }
}

// Start the WebSocket connection when the server starts
initializeWebSockets();

// Endpoint just returns success
export const GET: RequestHandler = async () => {
    return new Response(JSON.stringify({ status: 'Monitoring active via WebSocket' }));
};
