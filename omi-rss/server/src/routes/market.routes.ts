import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { marketService } from '../services/market';
import { AssetType, MarketProvider } from '../services/market/config';

const router = Router();

// Validation schemas
const watchlistSchema = z.object({
  symbols: z.array(z.string().toUpperCase()).min(1).max(50),
});

const watchlistItemSchema = z.object({
  symbol: z.string().toUpperCase(),
  assetType: z.nativeEnum(AssetType),
  name: z.string().optional(),
});

const alertSchema = z.object({
  symbol: z.string().toUpperCase(),
  assetType: z.nativeEnum(AssetType),
  alertType: z.enum(['price_above', 'price_below', 'percent_change_up', 'percent_change_down', 'volume_above']),
  value: z.number(),
  message: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

// Get market overview
router.get('/overview', async (req, res, next) => {
  try {
    // Get major indices
    const indices = ['SPY', 'QQQ', 'DIA', 'IWM', 'VTI'];
    const quotes = await marketService.getQuotes(indices, req.user!.id, {
      assetType: AssetType.INDEX,
    });
    
    // Get top gainers/losers from watchlist
    const watchlist = await marketService.getWatchlist(req.user!.id);
    const watchlistQuotes = watchlist
      .filter(item => item.quote)
      .sort((a, b) => b.quote.changePercent - a.quote.changePercent);
    
    const topGainers = watchlistQuotes.slice(0, 5);
    const topLosers = watchlistQuotes.slice(-5).reverse();
    
    res.json({
      marketStatus: getMarketStatus(),
      indices: quotes,
      topGainers,
      topLosers,
      lastUpdate: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Get user's watchlist
router.get('/watchlist', async (req, res, next) => {
  try {
    const watchlist = await marketService.getWatchlist(req.user!.id);
    res.json({ watchlist });
  } catch (error) {
    next(error);
  }
});

// Add to watchlist
router.post('/watchlist', async (req, res, next) => {
  try {
    const data = watchlistItemSchema.parse(req.body);
    const item = await marketService.addToWatchlist(req.user!.id, data);
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

// Remove from watchlist
router.delete('/watchlist/:symbol', async (req, res, next) => {
  try {
    const { symbol } = req.params;
    await marketService.removeFromWatchlist(req.user!.id, symbol);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Get price alerts
router.get('/alerts', async (req, res, next) => {
  try {
    const alerts = await marketService.getAlerts(req.user!.id);
    res.json({ alerts });
  } catch (error) {
    next(error);
  }
});

// Create price alert
router.post('/alerts', async (req, res, next) => {
  try {
    const data = alertSchema.parse(req.body);
    const alert = await marketService.createAlert(req.user!.id, data);
    res.status(201).json({ alert });
  } catch (error) {
    next(error);
  }
});

// Delete price alert
router.delete('/alerts/:alertId', async (req, res, next) => {
  try {
    const { alertId } = req.params;
    await marketService.deleteAlert(req.user!.id, alertId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Get quotes
router.get('/quotes', async (req, res, next) => {
  try {
    const { symbols, assetType, provider } = req.query;
    
    if (!symbols || typeof symbols !== 'string') {
      throw new AppError('Symbols required', 400);
    }
    
    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
    const quotes = await marketService.getQuotes(
      symbolList,
      req.user!.id,
      {
        assetType: assetType as AssetType,
        provider: provider as MarketProvider,
      }
    );
    
    res.json({ quotes });
  } catch (error) {
    next(error);
  }
});

// Get historical data
router.get('/historical/:symbol', async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const { interval, startDate, endDate, assetType, provider } = req.query;
    
    const candles = await marketService.getHistoricalData(symbol, {
      assetType: assetType as AssetType,
      interval: interval as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      provider: provider as MarketProvider,
    });
    
    res.json({ symbol, candles });
  } catch (error) {
    next(error);
  }
});

// Search symbols
router.get('/search', async (req, res, next) => {
  try {
    const { q, assetType, limit, provider } = req.query;
    
    if (!q || typeof q !== 'string') {
      throw new AppError('Search query required', 400);
    }
    
    const results = await marketService.searchSymbols(q, {
      assetType: assetType as AssetType,
      limit: limit ? parseInt(limit as string) : 10,
      provider: provider as MarketProvider,
    });
    
    res.json({ results });
  } catch (error) {
    next(error);
  }
});

// Subscribe to real-time updates (WebSocket endpoint)
router.post('/subscribe', async (req, res, next) => {
  try {
    const { symbols } = req.body;
    
    if (!symbols || !Array.isArray(symbols)) {
      throw new AppError('Symbols array required', 400);
    }
    
    // Real-time subscription is handled via WebSocket
    // This endpoint just validates the request
    res.json({ 
      message: 'Use WebSocket connection for real-time updates',
      wsUrl: '/market',
      symbols,
    });
  } catch (error) {
    next(error);
  }
});

// Helper function to get market status
function getMarketStatus() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  
  // Market hours: Mon-Fri 9:30 AM - 4:00 PM EST (14:30 - 21:00 UTC)
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const marketOpen = hour > 14 || (hour === 14 && minute >= 30);
  const marketClose = hour < 21;
  
  if (!isWeekday) {
    return { status: 'closed', message: 'Weekend - Markets Closed' };
  }
  
  if (marketOpen && marketClose) {
    return { status: 'open', message: 'Markets Open' };
  }
  
  if (hour < 14) {
    return { status: 'pre-market', message: 'Pre-Market Trading' };
  }
  
  return { status: 'after-hours', message: 'After-Hours Trading' };
}

export default router;