import {
  MarketProvider,
  AssetType,
  Quote,
  Candle,
  AlertType,
  getMarketConfig,
  watchlistItemSchema,
  priceAlertSchema,
} from './config';
import { BaseMarketProvider } from './providers/base';
import { FinnhubProvider } from './providers/finnhub';
import { AlphaVantageProvider } from './providers/alphavantage';
import { YahooFinanceProvider } from './providers/yahoo';
import { getDb } from '../../database';
import { 
  marketWatchlists, 
  priceAlerts, 
  marketQuoteCache,
  users,
} from '../../database/schema';
import { eq, and, gte, lte, or, sql } from 'drizzle-orm';
import { getRedis } from '../redis';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/errorHandler';
import { createNotification } from '../../routes/notification.routes';

export class MarketService {
  private providers: Map<MarketProvider, BaseMarketProvider> = new Map();
  private defaultProvider: MarketProvider = MarketProvider.YAHOO_FINANCE;
  private redis = getRedis();
  private realtimeSubscriptions: Map<string, () => void> = new Map();

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Initialize Yahoo Finance (no API key needed)
    this.providers.set(MarketProvider.YAHOO_FINANCE, new YahooFinanceProvider());
    logger.info('Yahoo Finance provider initialized');

    // Initialize Finnhub
    const finnhubConfig = getMarketConfig(MarketProvider.FINNHUB);
    if (finnhubConfig.apiKey) {
      this.providers.set(MarketProvider.FINNHUB, new FinnhubProvider(finnhubConfig.apiKey));
      logger.info('Finnhub provider initialized');
    }

    // Initialize Alpha Vantage
    const alphaVantageConfig = getMarketConfig(MarketProvider.ALPHA_VANTAGE);
    if (alphaVantageConfig.apiKey) {
      this.providers.set(MarketProvider.ALPHA_VANTAGE, new AlphaVantageProvider(alphaVantageConfig.apiKey));
      logger.info('Alpha Vantage provider initialized');
    }

    // Set default provider preference
    if (this.providers.has(MarketProvider.FINNHUB)) {
      this.defaultProvider = MarketProvider.FINNHUB;
    }
  }

  async getQuotes(
    symbols: string[],
    userId?: string,
    options: {
      assetType?: AssetType;
      provider?: MarketProvider;
      useCache?: boolean;
    } = {}
  ): Promise<Quote[]> {
    const { 
      assetType = AssetType.STOCK, 
      provider = this.defaultProvider,
      useCache = true,
    } = options;

    // Check cache first
    if (useCache) {
      const cachedQuotes = await this.getCachedQuotes(symbols);
      const missingSymbols = symbols.filter(s => !cachedQuotes.find(q => q.symbol === s));
      
      if (missingSymbols.length === 0) {
        return cachedQuotes;
      }

      // Fetch only missing symbols
      symbols = missingSymbols;
    }

    const marketProvider = this.providers.get(provider);
    if (!marketProvider) {
      throw new AppError('Market provider not configured', 503);
    }

    // Check rate limit
    if (userId) {
      await this.checkRateLimit(provider, userId);
    }

    // Fetch quotes
    const quotes = await marketProvider.getQuotes({ symbols, assetType });

    // Cache results
    if (quotes.length > 0) {
      await this.cacheQuotes(quotes);
    }

    // Store in database for historical tracking
    await this.storeQuotes(quotes);

    return quotes;
  }

  async getHistoricalData(
    symbol: string,
    options: {
      assetType?: AssetType;
      interval?: string;
      startDate?: Date;
      endDate?: Date;
      provider?: MarketProvider;
    } = {}
  ): Promise<Candle[]> {
    const provider = options.provider || this.defaultProvider;
    const marketProvider = this.providers.get(provider);
    
    if (!marketProvider) {
      throw new AppError('Market provider not configured', 503);
    }

    return marketProvider.getHistoricalData({
      symbol,
      assetType: options.assetType || AssetType.STOCK,
      interval: options.interval as any || 'DAY_1',
      startDate: options.startDate,
      endDate: options.endDate,
    });
  }

  async searchSymbols(
    query: string,
    options: {
      assetType?: AssetType;
      limit?: number;
      provider?: MarketProvider;
    } = {}
  ): Promise<any[]> {
    const provider = options.provider || this.defaultProvider;
    const marketProvider = this.providers.get(provider);
    
    if (!marketProvider) {
      throw new AppError('Market provider not configured', 503);
    }

    return marketProvider.search({
      query,
      assetType: options.assetType,
      limit: options.limit || 10,
    });
  }

  // Watchlist management
  async getWatchlist(userId: string): Promise<any[]> {
    const db = getDb();
    
    const watchlist = await db
      .select()
      .from(marketWatchlists)
      .where(eq(marketWatchlists.userId, userId))
      .orderBy(marketWatchlists.sortOrder);

    // Get current quotes for watchlist
    const symbols = watchlist.map(item => item.symbol);
    if (symbols.length > 0) {
      const quotes = await this.getQuotes(symbols, userId);
      
      // Merge watchlist with quotes
      return watchlist.map(item => {
        const quote = quotes.find(q => q.symbol === item.symbol);
        return {
          ...item,
          quote,
        };
      });
    }

    return watchlist;
  }

  async addToWatchlist(userId: string, item: any): Promise<any> {
    const db = getDb();
    const validated = watchlistItemSchema.parse(item);

    // Get max sort order
    const [maxOrder] = await db
      .select({ max: sql<number>`MAX(${marketWatchlists.sortOrder})` })
      .from(marketWatchlists)
      .where(eq(marketWatchlists.userId, userId));

    const [newItem] = await db
      .insert(marketWatchlists)
      .values({
        userId,
        ...validated,
        sortOrder: (maxOrder?.max || 0) + 1,
      })
      .returning();

    return newItem;
  }

  async removeFromWatchlist(userId: string, symbol: string): Promise<void> {
    const db = getDb();
    
    await db
      .delete(marketWatchlists)
      .where(
        and(
          eq(marketWatchlists.userId, userId),
          eq(marketWatchlists.symbol, symbol)
        )
      );
  }

  // Price alerts
  async getAlerts(userId: string): Promise<any[]> {
    const db = getDb();
    
    return db
      .select()
      .from(priceAlerts)
      .where(
        and(
          eq(priceAlerts.userId, userId),
          eq(priceAlerts.isActive, true)
        )
      )
      .orderBy(priceAlerts.createdAt);
  }

  async createAlert(userId: string, alert: any): Promise<any> {
    const db = getDb();
    const validated = priceAlertSchema.parse(alert);

    const [newAlert] = await db
      .insert(priceAlerts)
      .values({
        userId,
        ...validated,
        isActive: true,
      })
      .returning();

    // Start monitoring this alert
    await this.startAlertMonitoring(newAlert);

    return newAlert;
  }

  async deleteAlert(userId: string, alertId: string): Promise<void> {
    const db = getDb();
    
    await db
      .update(priceAlerts)
      .set({ isActive: false })
      .where(
        and(
          eq(priceAlerts.id, alertId),
          eq(priceAlerts.userId, userId)
        )
      );
  }

  // Alert monitoring
  private async startAlertMonitoring(alert: any) {
    // In production, this would be handled by a background job
    // For now, add to monitoring queue
    const key = `market:alerts:active`;
    await this.redis.sadd(key, alert.id);
  }

  async checkAlerts(): Promise<void> {
    const db = getDb();
    
    // Get all active alerts
    const alerts = await db
      .select()
      .from(priceAlerts)
      .where(eq(priceAlerts.isActive, true));

    // Group by symbol for efficient quote fetching
    const symbolGroups = new Map<string, any[]>();
    for (const alert of alerts) {
      if (!symbolGroups.has(alert.symbol)) {
        symbolGroups.set(alert.symbol, []);
      }
      symbolGroups.get(alert.symbol)!.push(alert);
    }

    // Check each symbol
    for (const [symbol, symbolAlerts] of symbolGroups) {
      try {
        const [quote] = await this.getQuotes([symbol]);
        if (!quote) continue;

        for (const alert of symbolAlerts) {
          const triggered = this.checkAlertCondition(alert, quote);
          
          if (triggered) {
            await this.triggerAlert(alert, quote);
          }
        }
      } catch (error) {
        logger.error(`Failed to check alerts for ${symbol}:`, error);
      }
    }
  }

  private checkAlertCondition(alert: any, quote: Quote): boolean {
    switch (alert.alertType) {
      case AlertType.PRICE_ABOVE:
        return quote.price >= alert.value;
      
      case AlertType.PRICE_BELOW:
        return quote.price <= alert.value;
      
      case AlertType.PERCENT_CHANGE_UP:
        return quote.changePercent >= alert.value;
      
      case AlertType.PERCENT_CHANGE_DOWN:
        return quote.changePercent <= -alert.value;
      
      case AlertType.VOLUME_ABOVE:
        return quote.volume >= alert.value;
      
      default:
        return false;
    }
  }

  private async triggerAlert(alert: any, quote: Quote) {
    const db = getDb();
    
    // Deactivate alert
    await db
      .update(priceAlerts)
      .set({ 
        isActive: false,
        triggeredAt: new Date(),
        triggeredPrice: quote.price,
      })
      .where(eq(priceAlerts.id, alert.id));

    // Send notification
    await createNotification(
      alert.userId,
      'price_alert',
      `Price Alert: ${alert.symbol}`,
      alert.message || `${alert.symbol} has triggered your ${alert.alertType} alert at $${quote.price}`,
      {
        alertId: alert.id,
        symbol: alert.symbol,
        price: quote.price,
        alertType: alert.alertType,
      }
    );
  }

  // Real-time subscriptions
  async subscribeToRealtime(
    symbols: string[],
    userId: string,
    callback: (quote: Quote) => void
  ): Promise<string> {
    const provider = MarketProvider.FINNHUB; // Only Finnhub supports WebSocket
    const marketProvider = this.providers.get(provider);
    
    if (!marketProvider) {
      throw new AppError('Real-time provider not configured', 503);
    }

    const subscriptionId = `${userId}:${symbols.join(',')}`;
    
    // Unsubscribe existing if any
    if (this.realtimeSubscriptions.has(subscriptionId)) {
      this.realtimeSubscriptions.get(subscriptionId)!();
    }

    const unsubscribe = await marketProvider.subscribeToRealtime(symbols, callback);
    this.realtimeSubscriptions.set(subscriptionId, unsubscribe);

    return subscriptionId;
  }

  async unsubscribeFromRealtime(subscriptionId: string): Promise<void> {
    const unsubscribe = this.realtimeSubscriptions.get(subscriptionId);
    if (unsubscribe) {
      unsubscribe();
      this.realtimeSubscriptions.delete(subscriptionId);
    }
  }

  // Helper methods
  private async checkRateLimit(provider: MarketProvider, userId: string): Promise<void> {
    const config = getMarketConfig(provider);
    const limits = config.rateLimit.free;
    
    if (!limits.callsPerMinute) return;

    const key = `market:ratelimit:${provider}:${userId}`;
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.expire(key, 60);
    }

    if (current > limits.callsPerMinute) {
      throw new AppError(`Rate limit exceeded for ${provider}`, 429);
    }
  }

  private async getCachedQuotes(symbols: string[]): Promise<Quote[]> {
    const quotes: Quote[] = [];
    
    for (const symbol of symbols) {
      const cached = await this.redis.get(`market:quote:${symbol}`);
      if (cached) {
        quotes.push(JSON.parse(cached));
      }
    }

    return quotes;
  }

  private async cacheQuotes(quotes: Quote[]): Promise<void> {
    for (const quote of quotes) {
      await this.redis.set(
        `market:quote:${quote.symbol}`,
        JSON.stringify(quote),
        'EX',
        60 // Cache for 1 minute
      );
    }
  }

  private async storeQuotes(quotes: Quote[]): Promise<void> {
    const db = getDb();
    
    for (const quote of quotes) {
      await db
        .insert(marketQuoteCache)
        .values({
          symbol: quote.symbol,
          assetType: quote.assetType,
          price: quote.price,
          change: quote.change,
          changePercent: quote.changePercent,
          volume: quote.volume,
          high: quote.high,
          low: quote.low,
          open: quote.open,
          previousClose: quote.previousClose,
          marketCap: quote.marketCap,
          provider: quote.provider,
          timestamp: quote.timestamp,
        })
        .onConflictDoNothing();
    }
  }
}

// Export singleton instance
export const marketService = new MarketService();