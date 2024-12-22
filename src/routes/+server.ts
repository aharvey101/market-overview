import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// Store previous values to detect crossings
const previousValues = new Map();
const timeframes = ['5m', '15m', '30m', '1h'];
const STREAMS_PER_CONNECTION = 200;
let wsConnections: WebSocket[] = [];

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
    console.info("CHECKING THRESHOLD CROSSING", key, value, previousValue);
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

async function initializeWebSocket() {
    try {
        // Close existing connections
        wsConnections = [];

        // Fetch available pairs
        const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
        const data = await response.json();
        const usdtPairs = data.symbols
            .filter((symbol: any) => symbol.quoteAsset === 'USDT' && symbol.status === 'TRADING')
            .map((symbol: any) => symbol.symbol);

        // Create all stream names
        const allStreams = usdtPairs.flatMap((pair: string) =>
            timeframes.map((timeframe) => `${pair.toLowerCase()}@kline_${timeframe}`)
        );

        // Split streams into chunks due to WebSocket limitations
        for (let i = 0; i < allStreams.length; i += STREAMS_PER_CONNECTION) {
            const streamChunk = allStreams.slice(i, i + STREAMS_PER_CONNECTION).join('/');
            const wsUrl = `wss://fstream.binance.com/stream?streams=${streamChunk}`;

            const ws = new WebSocket(wsUrl);

            ws.addEventListener('message', (event) => {
                try {
                    const message = JSON.parse(event.data);
                    if (message.data && message.data.e === 'kline') {
                        const kline = message.data.k;
                        const open = parseFloat(kline.o);
                        const close = parseFloat(kline.c);
                        const percentChange = ((close - open) / open) * 100;
                        console.info("CHECKING THRESHOLD CROSSING", message.data.s, kline.i, percentChange);
                        checkThresholdCrossing(message.data.s, kline.i, percentChange);

                    }
                } catch (error) {
                    console.error('Error processing WebSocket message:', error);
                }
            });

            ws.addEventListener('error', (error) => {
                console.error('WebSocket error:', error);
                // Attempt to reconnect after a delay
                setTimeout(() => initializeWebSocket(), 5000);
            });

            ws.addEventListener('close', () => {
                console.log('WebSocket connection closed. Reconnecting...');
                setTimeout(() => initializeWebSocket(), 5000);
            });

            wsConnections.push(ws);
        }
    } catch (error) {
        console.error('Error initializing WebSocket:', error);
        // Attempt to reconnect after a delay
        setTimeout(() => initializeWebSocket(), 5000);
    }
}

// Start the WebSocket connection when the server starts
initializeWebSocket();

// Endpoint just returns success
export const GET: RequestHandler = async () => {
    return new Response(JSON.stringify({ status: 'Monitoring active via WebSocket' }));
}; 