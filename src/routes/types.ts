export interface MarketData {
    [pair: string]: {
        '5m': string | null;
        '15m': string | null;
        '30m': string | null;
        '1h': string | null;
        lastPrice: number | null;
    }
}

export interface KlineData {
    e: string;  // Event type
    s: string;  // Symbol
    k: {
        c: string;  // Close price
        o: string;  // Open price
        h: string;  // High price
        l: string;  // Low price
        v: string;  // Volume
    }
}

export interface BinanceSymbol {
    symbol: string;
    status: string;
    quoteAsset: string;
}

export interface WebSocketMessage {
    e: string;      // Event type
    E: number;      // Event time
    s: string;      // Symbol
    k: KlineData;   // Kline data
}

export interface ExchangeInfo {
    symbols: BinanceSymbol[];
}

export type FlashClass = 'flash-green' | 'flash-red' | ''; 