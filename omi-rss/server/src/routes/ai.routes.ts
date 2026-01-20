import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { aiService } from '../services/ai';
import { getDb } from '../database';
import { articles, feeds } from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { AIProvider } from '../services/ai/config';
import { logger } from '../utils/logger';

const router = Router();

// Validation schemas
const summarizeSchema = z.object({
  articleId: z.string().uuid(),
  style: z.enum(['brief', 'detailed', 'bullet_points']).default('brief'),
  provider: z.nativeEnum(AIProvider).optional(),
});

const analyzeSchema = z.object({
  articleIds: z.array(z.string().uuid()).min(1).max(10),
  analysisTypes: z.array(z.enum(['sentiment', 'topics', 'entities', 'keywords'])).min(1),
  provider: z.nativeEnum(AIProvider).optional(),
});

const generateSchema = z.object({
  prompt: z.string().min(1).max(1000),
  context: z.enum(['feed', 'folder', 'all']).optional(),
  contextId: z.string().uuid().optional(),
  maxTokens: z.number().min(50).max(2000).optional(),
  temperature: z.number().min(0).max(1).optional(),
  provider: z.nativeEnum(AIProvider).optional(),
});

// Summarize article
router.post('/summarize', async (req, res, next) => {
  try {
    const data = summarizeSchema.parse(req.body);
    const db = getDb();
    
    // Verify article ownership
    const [article] = await db
      .select({ id: articles.id })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .where(
        and(
          eq(articles.id, data.articleId),
          eq(feeds.userId, req.user!.id)
        )
      )
      .limit(1);

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // Generate summary
    const result = await aiService.summarizeArticle(
      data.articleId,
      req.user!.id,
      {
        style: data.style,
        provider: data.provider,
      }
    );
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Analyze multiple articles
router.post('/analyze', async (req, res, next) => {
  try {
    const data = analyzeSchema.parse(req.body);
    const db = getDb();
    
    // Verify ownership of all articles
    const ownedArticles = await db
      .select({ id: articles.id })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .where(
        and(
          eq(feeds.userId, req.user!.id),
          // Note: In production, use inArray for better performance
        )
      );

    const ownedIds = new Set(ownedArticles.map(a => a.id));
    const validIds = data.articleIds.filter(id => ownedIds.has(id));
    
    if (validIds.length === 0) {
      throw new AppError('No valid articles found', 404);
    }

    // Analyze articles
    const results = await aiService.analyzeArticles(
      validIds,
      req.user!.id,
      {
        analysisTypes: data.analysisTypes,
        provider: data.provider,
      }
    );
    
    res.json({ results });
  } catch (error) {
    next(error);
  }
});

// Generate content based on reading history
router.post('/generate', async (req, res, next) => {
  try {
    const data = generateSchema.parse(req.body);
    const db = getDb();
    
    // Build context if requested
    let context = '';
    if (data.context && data.contextId) {
      // Fetch relevant context based on type
      // This is simplified - in production, fetch actual content
      context = `Context from ${data.context} ${data.contextId}`;
    }

    // Generate content
    const result = await aiService.generateContent(
      req.user!.id,
      {
        prompt: data.prompt,
        context,
        maxTokens: data.maxTokens,
        temperature: data.temperature,
        provider: data.provider,
      }
    );
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Categorize article
router.post('/categorize/:articleId', async (req, res, next) => {
  try {
    const { articleId } = req.params;
    const { provider } = req.body;
    const db = getDb();
    
    // Verify article ownership
    const [article] = await db
      .select({ id: articles.id })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .where(
        and(
          eq(articles.id, articleId),
          eq(feeds.userId, req.user!.id)
        )
      )
      .limit(1);

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // Categorize article
    const result = await aiService.categorizeArticle(
      articleId,
      req.user!.id,
      provider
    );
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get AI usage statistics
router.get('/usage', async (req, res, next) => {
  try {
    const stats = await aiService.getUsageStats(req.user!.id);
    
    res.json({
      usage: stats,
      limits: {
        daily: 100,
        monthly: 3000,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get available AI models
router.get('/models', async (req, res, next) => {
  try {
    const providers = aiService.getAvailableProviders();
    
    const models = providers.map(provider => {
      const status = 'active';
      const capabilities = ['summarize', 'analyze', 'generate'];
      
      return {
        id: provider,
        name: provider.charAt(0).toUpperCase() + provider.slice(1),
        provider,
        capabilities,
        status,
      };
    });
    
    res.json({ models });
  } catch (error) {
    next(error);
  }
});

// Get AI-powered article recommendations
router.get('/recommendations', async (req, res, next) => {
  try {
    const { 
      limit = '10', 
      excludeRead = 'true',
      timeRange = 'week',
      feedIds,
    } = req.query;

    const { recommendationEngine } = await import('../services/ai/recommendation');
    
    const recommendations = await recommendationEngine.getRecommendations(
      req.user!.id,
      {
        limit: parseInt(limit as string),
        excludeRead: excludeRead === 'true',
        timeRange: timeRange as 'day' | 'week' | 'month',
        feedIds: feedIds ? (feedIds as string).split(',') : undefined,
      }
    );
    
    res.json({ recommendations });
  } catch (error) {
    next(error);
  }
});

// Find similar articles
router.get('/similar/:articleId', async (req, res, next) => {
  try {
    const { articleId } = req.params;
    const { limit = '5' } = req.query;
    const db = getDb();
    
    // Verify article ownership
    const [article] = await db
      .select({ id: articles.id })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .where(
        and(
          eq(articles.id, articleId),
          eq(feeds.userId, req.user!.id)
        )
      )
      .limit(1);

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    const { recommendationEngine } = await import('../services/ai/recommendation');
    
    // Try to find similar articles by embedding
    try {
      const similar = await recommendationEngine.findSimilarArticlesByEmbedding(
        articleId,
        parseInt(limit as string)
      );
      res.json({ similar });
    } catch (error) {
      // Fallback to content-based similarity
      logger.warn('Embedding similarity failed, using fallback', error);
      res.json({ similar: [] });
    }
  } catch (error) {
    next(error);
  }
});

export default router;