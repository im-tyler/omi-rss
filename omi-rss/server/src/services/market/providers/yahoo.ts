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
} from '../config';
import { logger } from '../../../utils/logger';

export class YahooFinanceProvider extends BaseMarketProvider {
  constructor() {
    super(
      MarketProvider.YAHOO_FINANCE,
      undefined, // No API key needed
      'https://query1.finance.yahoo.com'
    );
  }

  async getQuotes(request: QuoteRequest): Promise<Quote[]> {
    const symbols = request.symbols.join(',');
    const url = `${this.baseUrl}/v7/finance/quote?symbols=${symbols}`;
    
    const data = await this.fetchJson(url);

    if (!data.quoteResponse?.result) {
      return [];
    }

    return data.quoteResponse.result
      .filter((quote: any) => quote.regularMarketPrice)
      .map((quote: any) => ({
        symbol: quote.symbol,
        assetType: this.inferAssetType(quote),
        price: quote.regularMarketPrice,
        change: quote.regularMarketChange || 0,
        changePercent: quote.regularMarketChangePercent || 0,
        high: quote.regularMarketDayHigh || 0,
        low: quote.regularMarketDayLow || 0,
        open: quote.regularMarketOpen || 0,
        previousClose: quote.regularMarketPreviousClose || 0,
        volume: quote.regularMarketVolume || 0,
        marketCap: quote.marketCap,
        timestamp: new Date(quote.regularMarketTime * 1000),
        provider: this.provider,
      }));
  }

  async getHistoricalData(request: HistoricalDataRequest): Promise<Candle[]> {
    const period1 = Math.floor((request.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).getTime() / 1000);
    const period2 = Math.floor((request.endDate || new Date()).getTime() / 1000);
    const interval = this.mapInterval(request.interval);
    
    const url = `${this.baseUrl}/v8/finance/chart/${request.symbol}?period1=${period1}&period2=${period2}&interval=${interval}&includePrePost=false`;
    
    const data = await this.fetchJson(url);

    if (!data.chart?.result?.[0]) {
      return [];
    }

    const result = data.chart.result[0];
    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};

    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quotes.open?.[i] && quotes.close?.[i]) {
        candles.push({
          timestamp: new Date(timestamps[i] * 1000),
          open: quotes.open[i],
          high: quotes.high[i],
          low: quotes.low[i],
          close: quotes.close[i],
          volume: quotes.volume[i] || 0,
        });
      }
    }

    return candles;
  }

  async search(request: SearchRequest): Promise<SearchResult[]> {
    const url = `${this.baseUrl}/v1/finance/search?q=${encodeURIComponent(request.query)}&quotesCount=${request.limit || 10}`;
    
    const data = await this.fetchJson(url);

    if (!data.quotes) {
      return [];
    }

    return data.quotes.map((quote: any) => ({
      symbol: quote.symbol,
      name: quote.longname || quote.shortname,
      assetType: this.mapQuoteType(quote.quoteType),
      exchange: quote.exchange,
      currency: quote.currency,
    }));
  }

  private mapInterval(interval: Interval): string {
    const mapping: Record<Interval, string> = {
      [Interval.MINUTE_1]: '1m',
      [Interval.MINUTE_5]: '5m',
      [Interval.MINUTE_15]: '15m',
      [Interval.MINUTE_30]: '30m',
      [Interval.HOUR_1]: '1h',
      [Interval.HOUR_4]: '1h', // Yahoo doesn't support 4h, use 1h
      [Interval.DAY_1]: '1d',
      [Interval.WEEK_1]: '1wk',
      [Interval.MONTH_1]: '1mo',
    };
    return mapping[interval] || '1d';
  }

  private inferAssetType(quote: any): AssetType {
    if (quote.quoteType === 'CRYPTOCURRENCY') return AssetType.CRYPTO;
    if (quote.quoteType === 'CURRENCY') return AssetType.FOREX;
    if (quote.quoteType === 'INDEX') return AssetType.INDEX;
    if (quote.quoteType === 'FUTURE') return AssetType.COMMODITY;
    return AssetType.STOCK;
  }

  private mapQuoteType(quoteType: string): AssetType {
    switch (quoteType) {
      case 'CRYPTOCURRENCY':
        return AssetType.CRYPTO;
      case 'CURRENCY':
        return AssetType.FOREX;
      case 'INDEX':
        return AssetType.INDEX;
      case 'FUTURE':
        return AssetType.COMMODITY;
      default:
        return AssetType.STOCK;
    }
  }
}