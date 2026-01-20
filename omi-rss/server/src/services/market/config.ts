import { z } from 'zod';

// Market data providers
export enum MarketProvider {
  ALPHA_VANTAGE = 'alpha_vantage',
  FINNHUB = 'finnhub',
  POLYGON = 'polygon',
  YAHOO_FINANCE = 'yahoo_finance',
  COINBASE = 'coinbase',
}

// Asset types
export enum AssetType {
  STOCK = 'stock',
  CRYPTO = 'crypto',
  FOREX = 'forex',
  COMMODITY = 'commodity',
  INDEX = 'index',
}

// Market data intervals
export enum Interval {
  MINUTE_1 = '1min',
  MINUTE_5 = '5min',
  MINUTE_15 = '15min',
  MINUTE_30 = '30min',
  HOUR_1 = '1hour',
  HOUR_4 = '4hour',
  DAY_1 = '1day',
  WEEK_1 = '1week',
  MONTH_1 = '1month',
}

// Alert types
export enum AlertType {
  PRICE_ABOVE = 'price_above',
  PRICE_BELOW = 'price_below',
  PERCENT_CHANGE_UP = 'percent_change_up',
  PERCENT_CHANGE_DOWN = 'percent_change_down',
  VOLUME_ABOVE = 'volume_above',
  CROSSING_MA = 'crossing_ma',
}

// Provider configurations
export const MARKET_PROVIDERS = {
  [MarketProvider.ALPHA_VANTAGE]: {
    name: 'Alpha Vantage',
    baseUrl: 'https://www.alphavantage.co/query',
    wsUrl: null,
    supportedAssets: [AssetType.STOCK, AssetType.FOREX, AssetType.CRYPTO],
    rateLimit: {
      free: { callsPerMinute: 5, dailyLimit: 500 },
      premium: { callsPerMinute: 75, dailyLimit: null },
    },
  },
  [MarketProvider.FINNHUB]: {
    name: 'Finnhub',
    baseUrl: 'https://finnhub.io/api/v1',
    wsUrl: 'wss://ws.finnhub.io',
    supportedAssets: [AssetType.STOCK, AssetType.FOREX, AssetType.CRYPTO],
    rateLimit: {
      free: { callsPerMinute: 60, dailyLimit: null },
      premium: { callsPerMinute: 300, dailyLimit: null },
    },
  },
  [MarketProvider.POLYGON]: {
    name: 'Polygon.io',
    baseUrl: 'https://api.polygon.io',
    wsUrl: 'wss://socket.polygon.io',
    supportedAssets: [AssetType.STOCK, AssetType.FOREX, AssetType.CRYPTO],
    rateLimit: {
      free: { callsPerMinute: 5, dailyLimit: null },
      premium: { callsPerMinute: null, dailyLimit: null },
    },
  },
  [MarketProvider.YAHOO_FINANCE]: {
    name: 'Yahoo Finance',
    baseUrl: 'https://query1.finance.yahoo.com',
    wsUrl: null,
    supportedAssets: [AssetType.STOCK, AssetType.INDEX, AssetType.COMMODITY],
    rateLimit: {
      free: { callsPerMinute: 100, dailyLimit: null },
      premium: { callsPerMinute: 100, dailyLimit: null },
    },
  },
  [MarketProvider.COINBASE]: {
    name: 'Coinbase',
    baseUrl: 'https://api.coinbase.com/v2',
    wsUrl: 'wss://ws-feed.exchange.coinbase.com',
    supportedAssets: [AssetType.CRYPTO],
    rateLimit: {
      free: { callsPerMinute: 10, dailyLimit: null },
      premium: { callsPerMinute: 10, dailyLimit: null },
    },
  },
};

// Validation schemas
export const symbolSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  assetType: z.nativeEnum(AssetType),
  exchange: z.string().optional(),
  name: z.string().optional(),
});

export const watchlistItemSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  assetType: z.nativeEnum(AssetType),
  provider: z.nativeEnum(MarketProvider).optional(),
  addedAt: z.string().datetime().optional(),
});

export const priceAlertSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  assetType: z.nativeEnum(AssetType),
  alertType: z.nativeEnum(AlertType),
  value: z.number(),
  message: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const quoteRequestSchema = z.object({
  symbols: z.array(z.string().min(1).max(20).toUpperCase()).min(1).max(50),
  assetType: z.nativeEnum(AssetType).optional(),
  provider: z.nativeEnum(MarketProvider).optional(),
});

export const historicalDataSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  assetType: z.nativeEnum(AssetType),
  interval: z.nativeEnum(Interval),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  provider: z.nativeEnum(MarketProvider).optional(),
});

// Market data types
export interface Quote {
  symbol: string;
  assetType: AssetType;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  marketCap?: number;
  timestamp: Date;
  provider: MarketProvider;
}

export interface Candle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketNews {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  symbols: string[];
  publishedAt: Date;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

// Configuration
export function getMarketConfig(provider: MarketProvider) {
  const apiKeys = {
    [MarketProvider.ALPHA_VANTAGE]: process.env.ALPHA_VANTAGE_API_KEY,
    [MarketProvider.FINNHUB]: process.env.FINNHUB_API_KEY,
    [MarketProvider.POLYGON]: process.env.POLYGON_API_KEY,
    [MarketProvider.YAHOO_FINANCE]: null, // No API key needed
    [MarketProvider.COINBASE]: process.env.COINBASE_API_KEY,
  };

  return {
    provider,
    apiKey: apiKeys[provider],
    ...MARKET_PROVIDERS[provider],
  };
}