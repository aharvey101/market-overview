/// <reference types="bun-types" />

import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import type { ServerWebSocket } from 'bun';

// Store previous values to detect crossings
const previousValues = new Map();
const timeframes = ['5m', '15m', '30m', '1h'];

interface WebSocketData {
    pairs: string[];
    timeframes: string[];
}

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

const server = Bun.serve<WebSocketData>({
    port: 3001,
    fetch(req, server) {
        const success = server.upgrade(req, {
            data: {
                pairs: [],
                timeframes
            }
        });
        return success
            ? undefined
            : new Response('Upgrade failed', { status: 500 });
    },
    websocket: {
        perMessageDeflate: true,
        maxPayloadLength: 16 * 1024 * 1024, // 16MB
        idleTimeout: 120, // 2 minutes
        open(ws) {
            // Create subscription streams for each pair and timeframe
            fetch('https://fapi.binance.com/fapi/v1/exchangeInfo')
                .then(res => res.json())
                .then(data => {
                    const usdtPairs = data.symbols
                        .filter((symbol: any) => symbol.quoteAsset === 'USDT' && symbol.status === 'TRADING')
                        .map((symbol: any) => symbol.symbol);

                    // Create all stream names
                    const allStreams = usdtPairs.flatMap((pair: string) =>
                        timeframes.map((timeframe) => `${pair.toLowerCase()}@kline_${timeframe}`)
                    );

                    // Subscribe to each stream
                    allStreams.forEach((stream: string) => {
                        ws.subscribe(stream);
                    });

                    // Store pairs in ws.data
                    ws.data.pairs = usdtPairs;
                });
        },
        message(ws, message) {
            try {
                const data = JSON.parse(message as string);
                if (data.data && data.data.e === 'kline') {
                    const kline = data.data.k;
                    const open = parseFloat(kline.o);
                    const close = parseFloat(kline.c);
                    const percentChange = ((close - open) / open) * 100;
                    console.info("CHECKING THRESHOLD CROSSING", data.data.s, kline.i, percentChange);
                    checkThresholdCrossing(data.data.s, kline.i, percentChange);
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        },
        close(ws, code, message) {
            console.log('WebSocket connection closed:', code, message);
            // Unsubscribe from all streams
            ws.data.pairs.forEach((pair: string) => {
                timeframes.forEach(timeframe => {
                    ws.unsubscribe(`${pair.toLowerCase()}@kline_${timeframe}`);
                });
            });
        }
    }
});

console.log(`WebSocket server listening on ${server.hostname}:${server.port}`);

// Endpoint just returns success
export const GET: RequestHandler = async () => {
    return new Response(JSON.stringify({ status: 'Monitoring active via WebSocket' }));
}; 