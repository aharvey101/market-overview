import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// Store previous values to detect crossings
const previousValues = new Map();
const timeframes = ['5m', '15m', '30m', '1h'];

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

async function fetchKlines(pair: string, timeframe: string) {
    try {
        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${pair}&interval=${timeframe}&limit=2`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.length >= 2) {
            const [previousCandle, currentCandle] = data;
            const open = parseFloat(previousCandle[1]);
            const close = parseFloat(currentCandle[4]);
            const percentChange = ((close - open) / open) * 100;

            checkThresholdCrossing(pair, timeframe, percentChange);
        }
    } catch (error) {
        console.error(`Error fetching klines for ${pair} ${timeframe}:`, error);
    }
}

// Start monitoring in the background
async function startMonitoring() {
    try {
        const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
        const data = await response.json();
        const usdtPairs = data.symbols
            .filter((symbol: any) => symbol.quoteAsset === 'USDT' && symbol.status === 'TRADING')
            .map((symbol: any) => symbol.symbol);

        // Set up intervals for each timeframe
        const intervals = {
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000
        };

        // Initial fetch for all pairs and timeframes
        for (const pair of usdtPairs) {
            for (const timeframe of timeframes) {
                await fetchKlines(pair, timeframe);
            }
        }

        // Set up periodic updates
        Object.entries(intervals).forEach(([timeframe, interval]) => {
            setInterval(() => {
                usdtPairs.forEach((pair) => {
                    fetchKlines(pair, timeframe);
                });
            }, interval);
        });

    } catch (error) {
        console.error('Error initializing monitoring:', error);
    }
}

// Start the monitoring when the server starts
startMonitoring();

// Endpoint just returns success (we don't actually need this for the monitoring)
export const GET: RequestHandler = async () => {
    return new Response(JSON.stringify({ status: 'Monitoring active' }));
}; 