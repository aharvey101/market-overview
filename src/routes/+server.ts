/// <reference types="bun-types" />

import type { RequestHandler } from './$types';
import { BinanceWebSocketServer } from '$lib/server';

// Store previous values to detect crossings
const previousValues = new Map();
const timeframes = ['5m', '15m', '30m', '1h'];

async function sendTelegramAlert(message: string) {
    try {
        const url = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: process.env.TELEGRAM_CHAT_ID,
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

// Initialize the server
const server = new BinanceWebSocketServer({
    timeframes,
    onThresholdCrossing: checkThresholdCrossing
});

console.log("SERVER INITIALIZED", server.isInitialized);
// Endpoint just returns success
export const GET: RequestHandler = async () => {
    return new Response(JSON.stringify({ status: 'Monitoring active via WebSocket' }));
}; 