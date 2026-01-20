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

export class AlphaVantageProvider extends BaseMarketProvider {
  constructor(apiKey: string) {
    super(
      MarketProvider.ALPHA_VANTAGE,
      apiKey,
      'https://www.alphavantage.co/query'
    );
  }

  async getQuotes(request: QuoteRequest): Promise<Quote[]> {
    const quotes: Quote[] = [];

    for (const symbol of request.symbols) {
      try {
        const url = `${this.baseUrl}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.apiKey}`;
        const data = await this.fetchJson(url);

        if (data['Global Quote']) {
          const quote = data['Global Quote'];
          quotes.push({
            symbol,
            assetType: request.assetType || AssetType.STOCK,
            price: parseFloat(quote['05. price']),
            change: parseFloat(quote['09. change']),
            changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
            high: parseFloat(quote['03. high']),
            low: parseFloat(quote['04. low']),
            open: parseFloat(quote['02. open']),
            previousClose: parseFloat(quote['08. previous close']),
            volume: parseInt(quote['06. volume']),
            timestamp: this.parseTimestamp(quote['07. latest trading day']),
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
    const func = this.mapIntervalToFunction(request.interval);
    const interval = this.mapIntervalToParam(request.interval);
    
    let url = `${this.baseUrl}?function=${func}&symbol=${request.symbol}&apikey=${this.apiKey}`;
    
    if (interval) {
      url += `&interval=${interval}`;
    }

    if (func === 'TIME_SERIES_DAILY' && request.startDate) {
      url += '&outputsize=full'; // Get full historical data
    }

    const data = await this.fetchJson(url);

    // Find the time series key
    const timeSeriesKey = Object.keys(data).find(key => key.includes('Time Series'));
    if (!timeSeriesKey || !data[timeSeriesKey]) {
      return [];
    }

    const timeSeries = data[timeSeriesKey];
    const candles: Candle[] = [];

    for (const [timestamp, values] of Object.entries(timeSeries)) {
      const date = this.parseTimestamp(timestamp);
      
      // Filter by date range if provided
      if (request.startDate && date < request.startDate) continue;
      if (request.endDate && date > request.endDate) continue;

      candles.push({
        timestamp: date,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume']),
      });
    }

    // Sort by timestamp ascending
    return candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async search(request: SearchRequest): Promise<SearchResult[]> {
    const url = `${this.baseUrl}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(request.query)}&apikey=${this.apiKey}`;
    const data = await this.fetchJson(url);

    if (!data.bestMatches) {
      return [];
    }

    return data.bestMatches
      .slice(0, request.limit || 10)
      .map((match: any) => ({
        symbol: match['1. symbol'],
        name: match['2. name'],
        assetType: this.inferAssetType(match['3. type']),
        exchange: match['4. region'],
        currency: match['8. currency'],
      }));
  }

  private mapIntervalToFunction(interval: Interval): string {
    switch (interval) {
      case Interval.MINUTE_1:
      case Interval.MINUTE_5:
      case Interval.MINUTE_15:
      case Interval.MINUTE_30:
      case Interval.HOUR_1:
        return 'TIME_SERIES_INTRADAY';
      case Interval.DAY_1:
        return 'TIME_SERIES_DAILY';
      case Interval.WEEK_1:
        return 'TIME_SERIES_WEEKLY';
      case Interval.MONTH_1:
        return 'TIME_SERIES_MONTHLY';
      default:
        return 'TIME_SERIES_DAILY';
    }
  }

  private mapIntervalToParam(interval: Interval): string | null {
    switch (interval) {
      case Interval.MINUTE_1:
        return '1min';
      case Interval.MINUTE_5:
        return '5min';
      case Interval.MINUTE_15:
        return '15min';
      case Interval.MINUTE_30:
        return '30min';
      case Interval.HOUR_1:
        return '60min';
      default:
        return null;
    }
  }

  private inferAssetType(type: string): AssetType {
    if (type.includes('ETF')) return AssetType.INDEX;
    return AssetType.STOCK;
  }
}