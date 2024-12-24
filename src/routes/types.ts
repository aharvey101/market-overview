export interface MarketData {
    [symbol: string]: TimeframeData;
}

export interface TimeframeData {
    '5m': string | null;
    '15m': string | null;
    '30m': string | null;
    '1h': string | null;
    '2h': string | null;
    '4h': string | null;
    '8h': string | null;
    '12h': string | null;
    '1d': string | null;
    '1w': string | null;
    '1M': string | null;
    lastPrice: number | null;
}

export interface KlineData {
    t: number;      // Kline start time
    T: number;      // Kline close time
    s: string;      // Symbol
    i: string;      // Interval
    f: number;      // First trade ID
    L: number;      // Last trade ID
    o: string;      // Open price
    c: string;      // Close price
    h: string;      // High price
    l: string;      // Low price
    v: string;      // Base asset volume
    n: number;      // Number of trades
    x: boolean;     // Is this kline closed?
    q: string;      // Quote asset volume
    V: string;      // Taker buy base asset volume
    Q: string;      // Taker buy quote asset volume
}

export interface BinanceSymbol {
    symbol: string;
    pair: string;
    contractType: string;
    deliveryDate: number;
    onboardDate: number;
    status: string;
    maintMarginPercent: string;
    requiredMarginPercent: string;
    baseAsset: string;
    quoteAsset: string;
    marginAsset: string;
    pricePrecision: number;
    quantityPrecision: number;
    baseAssetPrecision: number;
    quotePrecision: number;
    underlyingType: string;
    underlyingSubType: string[];
    settlePlan: number;
    triggerProtect: string;
    liquidationFee: string;
    marketTakeBound: string;
    filters: BinanceSymbolFilter[];
    orderTypes: string[];
    timeInForce: string[];
}

export interface BinanceSymbolFilter {
    filterType: string;
    maxPrice?: string;
    minPrice?: string;
    tickSize?: string;
    maxQty?: string;
    minQty?: string;
    stepSize?: string;
    limit?: number;
    notional?: string;
    multiplierDown?: string;
    multiplierUp?: string;
    multiplierDecimal?: string;
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