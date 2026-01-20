import WebSocket from 'ws';
import { 
  BaseMarketProvider,
  QuoteRequest,
  HistoricalDataRequest,
  SearchRequest,
  SearchResult,
} from './base';
import {
  MarketProvider,
  AssetType,
  Quote,
  Candle,
  Interval,
  MarketNews,
} from '../config';
import { logger } from '../../../utils/logger';

export class FinnhubProvider extends BaseMarketProvider {
  private ws?: WebSocket;

  constructor(apiKey: string) {
    super(
      MarketProvider.FINNHUB,
      apiKey,
      'https://finnhub.io/api/v1',
      'wss://ws.finnhub.io'
    );
  }

  async getQuotes(request: QuoteRequest): Promise<Quote[]> {
    const quotes: Quote[] = [];

    for (const symbol of request.symbols) {
      try {
        const normalizedSymbol = this.normalizeSymbol(symbol, request.assetType);
        const url = `${this.baseUrl}/quote?symbol=${normalizedSymbol}&token=${this.apiKey}`;
        
        const data = await this.fetchJson(url);

        if (data.c > 0) { // Current price exists
          quotes.push({
            symbol,
            assetType: request.assetType || AssetType.STOCK,
            price: data.c,
            change: data.d || 0,
            changePercent: data.dp || 0,
            high: data.h,
            low: data.l,
            open: data.o,
            previousClose: data.pc,
            volume: 0, // Finnhub doesn't provide volume in quote endpoint
            timestamp: new Date(data.t * 1000),
            provider: this.provider,
          });
        }
      } catch (error) {
        logger.error(`Failed to fetch quote for ${symbol}:`, error);
      }
    }

    return quotes;
  }

  async getHistoricalData(request: HistoricalDataRequest): Promise<Candle[]> {
    const resolution = this.mapIntervalToResolution(request.interval);
    const from = Math.floor((request.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).getTime() / 1000);
    const to = Math.floor((request.endDate || new Date()).getTime() / 1000);
    
    const endpoint = request.assetType === AssetType.CRYPTO ? 'crypto/candle' : 'stock/candle';
    const symbolParam = request.assetType === AssetType.CRYPTO ? 
      `symbol=BINANCE:${request.symbol}USDT` : 
      `symbol=${request.symbol}`;
    
    const url = `${this.baseUrl}/${endpoint}?${symbolParam}&resolution=${resolution}&from=${from}&to=${to}&token=${this.apiKey}`;
    
    const data = await this.fetchJson(url);

    if (data.s !== 'ok' || !data.t) {
      return [];
    }

    const candles: Candle[] = [];
    for (let i = 0; i < data.t.length; i++) {
      candles.push({
        timestamp: new Date(data.t[i] * 1000),
        open: data.o[i],
        high: data.h[i],
        low: data.l[i],
        close: data.c[i],
        volume: data.v[i],
      });
    }

    return candles;
  }

  async search(request: SearchRequest): Promise<SearchResult[]> {
    const url = `${this.baseUrl}/search?q=${encodeURIComponent(request.query)}&token=${this.apiKey}`;
    const data = await this.fetchJson(url);

    if (!data.result) {
      return [];
    }

    return data.result
      .slice(0, request.limit || 10)
      .map((item: any) => ({
        symbol: item.symbol,
        name: item.description,
        assetType: this.inferAssetType(item.type),
        exchange: item.exchange,
        currency: item.currency,
      }));
  }

  async getMarketNews(symbols?: string[]): Promise<MarketNews[]> {
    const category = 'general';
    const url = `${this.baseUrl}/news?category=${category}&token=${this.apiKey}`;
    
    const data = await this.fetchJson(url);

    return data
      .slice(0, 20)
      .map((item: any) => ({
        id: item.id.toString(),
        title: item.headline,
        summary: item.summary,
        url: item.url,
        source: item.source,
        symbols: item.related?.split(',') || [],
        publishedAt: new Date(item.datetime * 1000),
      }));
  }

  async subscribeToRealtime(symbols: string[], callback: (quote: Quote) => void): Promise<() => void> {
    if (!this.wsUrl || !this.apiKey) {
      throw new Error('WebSocket URL or API key not configured');
    }

    this.ws = new WebSocket(`${this.wsUrl}?token=${this.apiKey}`);

    this.ws.on('open', () => {
      logger.info('Finnhub WebSocket connected');
      
      // Subscribe to symbols
      for (const symbol of symbols) {
        this.ws!.send(JSON.stringify({ type: 'subscribe', symbol }));
      }
    });

    this.ws.on('message', (data: string) => {
      try {
        const message = JSON.parse(data);
        
        if (message.type === 'trade') {
          for (const trade of message.data) {
            callback({
              symbol: trade.s,
              assetType: AssetType.STOCK,
              price: trade.p,
              change: 0, // Not provided in real-time
              changePercent: 0,
              volume: trade.v,
              high: 0,
              low: 0,
              open: 0,
              previousClose: 0,
              timestamp: new Date(trade.t),
              provider: this.provider,
            });
          }
        }
      } catch (error) {
        logger.error('Failed to parse WebSocket message:', error);
      }
    });

    this.ws.on('error', (error) => {
      logger.error('Finnhub WebSocket error:', error);
    });

    this.ws.on('close', () => {
      logger.info('Finnhub WebSocket disconnected');
    });

    // Return unsubscribe function
    return () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        for (const symbol of symbols) {
          this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
        }
        this.ws.close();
      }
    };
  }

  private mapIntervalToResolution(interval: Interval): string {
    const mapping: Record<Interval, string> = {
      [Interval.MINUTE_1]: '1',
      [Interval.MINUTE_5]: '5',
      [Interval.MINUTE_15]: '15',
      [Interval.MINUTE_30]: '30',
      [Interval.HOUR_1]: '60',
      [Interval.HOUR_4]: '240',
      [Interval.DAY_1]: 'D',
      [Interval.WEEK_1]: 'W',
      [Interval.MONTH_1]: 'M',
    };
    return mapping[interval] || 'D';
  }

  private inferAssetType(type: string): AssetType {
    if (type.includes('Crypto')) return AssetType.CRYPTO;
    if (type.includes('Forex')) return AssetType.FOREX;
    if (type.includes('Index')) return AssetType.INDEX;
    return AssetType.STOCK;
  }
}