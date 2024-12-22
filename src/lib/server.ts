import type { ServerWebSocket } from 'bun';

interface WebSocketData {
    pairs: string[];
    timeframes: string[];
}

interface ServerConfig {
    timeframes: string[];
    onThresholdCrossing: (symbol: string, timeframe: string, value: number) => void;
}

export class BinanceWebSocketServer {
    private connections: WebSocket[] = [];
    public isInitialized: boolean = false;

    constructor(config: ServerConfig) {
        this.connect(config);
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    private async connect(config: ServerConfig) {
        try {
            const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
            const data = await response.json();
            if (!data.symbols) {
                throw new Error('No symbols found in response');
            }
            const usdtPairs = data.symbols
                .filter((symbol: any) => symbol.quoteAsset === 'USDT' && symbol.status === 'TRADING')
                .map((symbol: any) => symbol.symbol) as string[];

            // Split pairs into chunks of 20
            const pairChunks = this.chunkArray(usdtPairs, 20);

            // Create WebSocket connections for each chunk
            pairChunks.forEach((chunk, index) => {
                // Create stream names for this chunk
                const streams = chunk.flatMap((pair) =>
                    config.timeframes.map((timeframe) => `${pair.toLowerCase()}@kline_${timeframe}`)
                );

                const ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams.join('/')}`);

                ws.onopen = () => {
                    console.log(`WebSocket ${index + 1} connected`);
                    this.isInitialized = true;
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.data && data.data.e === 'kline') {
                            const kline = data.data.k;
                            const open = parseFloat(kline.o);
                            const close = parseFloat(kline.c);
                            const percentChange = ((close - open) / open) * 100;
                            config.onThresholdCrossing(data.data.s, kline.i, percentChange);
                        }
                    } catch (error) {
                        console.error('Error processing WebSocket message:', error);
                    }
                };

                ws.onclose = () => {
                    console.log(`WebSocket ${index + 1} disconnected`);
                    this.connections = this.connections.filter(conn => conn !== ws);
                    if (this.connections.length === 0) {
                        this.isInitialized = false;
                    }
                    // Reconnect this chunk after a delay
                    setTimeout(() => this.connectChunk(chunk, index, config), 5000);
                };

                this.connections.push(ws);
            });

        } catch (error) {
            console.error('Failed to initialize Binance connections:', error);
            this.isInitialized = false;
            // Retry connection after a delay
            setTimeout(() => this.connect(config), 5000);
        }
    }

    private connectChunk(pairs: string[], index: number, config: ServerConfig) {
        const streams = pairs.flatMap((pair: string) =>
            config.timeframes.map((timeframe) => `${pair.toLowerCase()}@kline_${timeframe}`)
        );

        const ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams.join('/')}`);

        ws.onopen = () => {
            console.log(`WebSocket ${index + 1} reconnected`);
            this.connections.push(ws);
            this.isInitialized = true;
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.data && data.data.e === 'kline') {
                    const kline = data.data.k;
                    const open = parseFloat(kline.o);
                    const close = parseFloat(kline.c);
                    const percentChange = ((close - open) / open) * 100;
                    config.onThresholdCrossing(data.data.s, kline.i, percentChange);
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        };

        ws.onclose = () => {
            console.log(`WebSocket ${index + 1} disconnected`);
            this.connections = this.connections.filter(conn => conn !== ws);
            if (this.connections.length === 0) {
                this.isInitialized = false;
            }
            // Reconnect this chunk after a delay
            setTimeout(() => this.connectChunk(pairs, index, config), 5000);
        };
    }

    public close() {
        this.connections.forEach(ws => ws.close());
        this.connections = [];
        this.isInitialized = false;
    }
}