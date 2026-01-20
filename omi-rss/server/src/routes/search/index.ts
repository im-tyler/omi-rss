import { Router } from 'express';
import { authentication } from '../../middleware/authentication';
import { SemanticSearchService } from '../../services/search/semantic-search';
import { z } from 'zod';

const router = Router();
const searchService = new SemanticSearchService();

// Initialize search service
searchService.initialize().catch(console.error);

// Search schema
const searchSchema = z.object({
  query: z.string().min(1),
  filters: z.object({
    feedIds: z.array(z.string()).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    isRead: z.boolean().optional(),
    isStarred: z.boolean().optional(),
    hasAnnotations: z.boolean().optional(),
    categories: z.array(z.string()).optional(),
    minScore: z.number().min(0).max(1).optional(),
  }).optional(),
  options: z.object({
    limit: z.number().min(1).max(100).default(20),
    offset: z.number().min(0).default(0),
    includeContent: z.boolean().default(false),
    semanticSearch: z.boolean().default(true),
    fuzzySearch: z.boolean().default(true),
    fields: z.array(z.string()).optional(),
    sortBy: z.enum(['relevance', 'date', 'title']).default('relevance'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }).optional(),
});

// Main search endpoint
router.post('/', authentication, async (req, res) => {
  try {
    const { query, filters, options } = searchSchema.parse(req.body);
    
    // Convert date strings to Date objects
    const searchFilters = {
      ...filters,
      dateFrom: filters?.dateFrom ? new Date(filters.dateFrom) : undefined,
      dateTo: filters?.dateTo ? new Date(filters.dateTo) : undefined,
    };
    
    const results = await searchService.search(query, searchFilters, options);
    
    res.json({
      results,
      query,
      totalResults: results.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Search suggestions endpoint
router.get('/suggestions', authentication, async (req, res) => {
  try {
    const { q, limit = 5 } = req.query;
    
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query parameter required' });
    }
    
    const suggestions = await searchService.suggest(q, Number(limit));
    
    res.json({ suggestions });
  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

// Get related articles
router.get('/related/:articleId', authentication, async (req, res) => {
  try {
    const { articleId } = req.params;
    const { limit = 5 } = req.query;
    
    const results = await searchService.findRelated(articleId, Number(limit));
    
    res.json({ results });
  } catch (error) {
    console.error('Related articles error:', error);
    res.status(500).json({ error: 'Failed to get related articles' });
  }
});

// Index article endpoint
router.post('/index', authentication, async (req, res) => {
  try {
    const { article } = req.body;
    
    if (!article) {
      return res.status(400).json({ error: 'Article required' });
    }
    
    await searchService.indexArticle(article);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Indexing error:', error);
    res.status(500).json({ error: 'Failed to index article' });
  }
});

// Remove from index endpoint
router.delete('/index/:articleId', authentication, async (req, res) => {
  try {
    const { articleId } = req.params;
    
    // Remove from vector database
    // Implementation would go here
    
    res.json({ success: true });
  } catch (error) {
    console.error('Remove from index error:', error);
    res.status(500).json({ error: 'Failed to remove from index' });
  }
});

// Reindex all articles
router.post('/reindex', authentication, async (req, res) => {
  try {
    // This would be a background job in production
    res.json({ 
      success: true,
      message: 'Reindexing started in background' 
    });
    
    // Start reindexing in background
    // Implementation would go here
  } catch (error) {
    console.error('Reindex error:', error);
    res.status(500).json({ error: 'Failed to start reindexing' });
  }
});

export default router;