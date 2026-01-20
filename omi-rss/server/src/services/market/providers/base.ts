import { 
  MarketProvider, 
  AssetType, 
  Quote, 
  Candle, 
  Interval,
  MarketNews 
} from '../config';

export interface QuoteRequest {
  symbols: string[];
  assetType?: AssetType;
}

export interface HistoricalDataRequest {
  symbol: string;
  assetType: AssetType;
  interval: Interval;
  startDate?: Date;
  endDate?: Date;
}

export interface SearchRequest {
  query: string;
  assetType?: AssetType;
  limit?: number;
}

export interface SearchResult {
  symbol: string;
  name: string;
  assetType: AssetType;
  exchange?: string;
  currency?: string;
}

export abstract class BaseMarketProvider {
  protected provider: MarketProvider;
  protected apiKey?: string;
  protected baseUrl: string;
  protected wsUrl?: string;

  constructor(provider: MarketProvider, apiKey?: string, baseUrl: string, wsUrl?: string) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.wsUrl = wsUrl;
  }

  // Required methods
  abstract getQuotes(request: QuoteRequest): Promise<Quote[]>;
  abstract getHistoricalData(request: HistoricalDataRequest): Promise<Candle[]>;
  abstract search(request: SearchRequest): Promise<SearchResult[]>;
  
  // Optional methods with default implementations
  async getMarketNews(symbols?: string[]): Promise<MarketNews[]> {
    // Default: no news implementation
    return [];
  }

  async subscribeToRealtime(symbols: string[], callback: (quote: Quote) => void): Promise<() => void> {
    // Default: no real-time support
    return () => {};
  }

  // Helper methods
  protected async fetchJson(url: string, options?: RequestInit): Promise<any> {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Market data request failed: ${response.statusText}`);
    }

    return response.json();
  }

  protected normalizeSymbol(symbol: string, assetType?: AssetType): string {
    // Provider-specific symbol normalization
    return symbol.toUpperCase();
  }

  protected parseTimestamp(timestamp: any): Date {
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp === 'number') {
      // Unix timestamp (seconds or milliseconds)
      return new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
    }
    if (typeof timestamp === 'string') {
      return new Date(timestamp);
    }
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }
}