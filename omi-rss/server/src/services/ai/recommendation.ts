import { getDb } from '../../database';
import { 
  articles, 
  userArticleStates, 
  feeds, 
  aiArticleEmbeddings 
} from '../../database/schema';
import { eq, and, desc, sql, inArray, notInArray } from 'drizzle-orm';
import { logger } from '../../utils/logger';
import { aiService } from './index';
import { AIProvider } from './config';

interface RecommendationOptions {
  limit?: number;
  excludeRead?: boolean;
  feedIds?: string[];
  timeRange?: 'day' | 'week' | 'month';
}

export class RecommendationEngine {
  async getRecommendations(
    userId: string,
    options: RecommendationOptions = {}
  ): Promise<any[]> {
    const {
      limit = 10,
      excludeRead = true,
      feedIds,
      timeRange = 'week',
    } = options;

    const db = getDb();

    try {
      // Get user's reading history
      const readingHistory = await this.getUserReadingHistory(userId, timeRange);
      
      if (readingHistory.length === 0) {
        // Return popular articles if no reading history
        return this.getPopularArticles(userId, limit, excludeRead);
      }

      // Extract topics and keywords from reading history
      const userInterests = await this.analyzeUserInterests(readingHistory);

      // Find similar articles
      const recommendations = await this.findSimilarArticles(
        userId,
        userInterests,
        {
          limit,
          excludeRead,
          feedIds,
          excludeArticleIds: readingHistory.map(h => h.articleId),
        }
      );

      return recommendations;
    } catch (error) {
      logger.error('Failed to generate recommendations:', error);
      return [];
    }
  }

  private async getUserReadingHistory(
    userId: string,
    timeRange: 'day' | 'week' | 'month'
  ): Promise<any[]> {
    const db = getDb();
    
    const timeRangeMs = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    };

    const since = new Date(Date.now() - timeRangeMs[timeRange]);

    return db
      .select({
        articleId: userArticleStates.articleId,
        readAt: userArticleStates.readAt,
        isStarred: userArticleStates.isStarred,
        tags: userArticleStates.tags,
        title: articles.title,
        content: articles.content,
        categories: articles.categories,
      })
      .from(userArticleStates)
      .innerJoin(articles, eq(userArticleStates.articleId, articles.id))
      .where(
        and(
          eq(userArticleStates.userId, userId),
          eq(userArticleStates.isRead, true),
          sql`${userArticleStates.readAt} >= ${since}`
        )
      )
      .orderBy(desc(userArticleStates.readAt))
      .limit(50);
  }

  private async analyzeUserInterests(readingHistory: any[]): Promise<{
    topics: string[];
    keywords: string[];
    categories: string[];
    preferredAuthors: string[];
  }> {
    // Aggregate topics from reading history
    const topicCounts = new Map<string, number>();
    const keywordCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    const authorCounts = new Map<string, number>();

    // Process each article
    for (const article of readingHistory) {
      // Count categories
      if (article.categories) {
        for (const category of article.categories) {
          categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
        }
      }

      // Count tags (user-applied)
      if (article.tags) {
        for (const tag of article.tags) {
          keywordCounts.set(tag, (keywordCounts.get(tag) || 0) + 1);
        }
      }

      // Weight starred articles more heavily
      const weight = article.isStarred ? 2 : 1;
      
      // You could also analyze content with AI here for better topic extraction
    }

    // Sort and get top items
    const getTopItems = (map: Map<string, number>, limit: number) => {
      return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([item]) => item);
    };

    return {
      topics: getTopItems(topicCounts, 5),
      keywords: getTopItems(keywordCounts, 10),
      categories: getTopItems(categoryCounts, 3),
      preferredAuthors: getTopItems(authorCounts, 5),
    };
  }

  private async findSimilarArticles(
    userId: string,
    interests: any,
    options: {
      limit: number;
      excludeRead: boolean;
      feedIds?: string[];
      excludeArticleIds: string[];
    }
  ): Promise<any[]> {
    const db = getDb();

    // Build query
    let query = db
      .select({
        id: articles.id,
        feedId: articles.feedId,
        title: articles.title,
        description: articles.description,
        author: articles.author,
        publishedAt: articles.publishedAt,
        imageUrl: articles.imageUrl,
        categories: articles.categories,
        feedTitle: feeds.title,
        feedFavicon: feeds.favicon,
        score: sql<number>`0`, // Placeholder for relevance score
      })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .leftJoin(
        userArticleStates,
        and(
          eq(userArticleStates.articleId, articles.id),
          eq(userArticleStates.userId, userId)
        )
      );

    // Apply filters
    const conditions = [
      eq(feeds.userId, userId),
      notInArray(articles.id, options.excludeArticleIds),
    ];

    if (options.excludeRead) {
      conditions.push(
        sql`${userArticleStates.isRead} IS NULL OR ${userArticleStates.isRead} = false`
      );
    }

    if (options.feedIds) {
      conditions.push(inArray(articles.feedId, options.feedIds));
    }

    // Add relevance conditions
    if (interests.categories.length > 0) {
      // Match categories
      conditions.push(
        sql`${articles.categories} && ARRAY[${interests.categories.map(c => `'${c}'`).join(',')}]`
      );
    }

    query = query.where(and(...conditions));

    // Order by relevance and recency
    query = query
      .orderBy(desc(articles.publishedAt))
      .limit(options.limit);

    const recommendations = await query;

    // Calculate relevance scores
    return recommendations.map(rec => {
      let score = 0;
      
      // Score based on category match
      if (rec.categories) {
        const matchingCategories = rec.categories.filter(c => 
          interests.categories.includes(c)
        );
        score += matchingCategories.length * 10;
      }

      // Score based on keyword match in title
      for (const keyword of interests.keywords) {
        if (rec.title.toLowerCase().includes(keyword.toLowerCase())) {
          score += 5;
        }
      }

      return {
        ...rec,
        score,
        reason: this.generateRecommendationReason(rec, interests),
      };
    }).sort((a, b) => b.score - a.score);
  }

  private generateRecommendationReason(
    article: any,
    interests: any
  ): string {
    const reasons = [];

    if (article.categories) {
      const matchingCategories = article.categories.filter(c => 
        interests.categories.includes(c)
      );
      if (matchingCategories.length > 0) {
        reasons.push(`You frequently read ${matchingCategories.join(', ')} articles`);
      }
    }

    if (reasons.length === 0) {
      reasons.push('Based on your reading history');
    }

    return reasons[0];
  }

  private async getPopularArticles(
    userId: string,
    limit: number,
    excludeRead: boolean
  ): Promise<any[]> {
    const db = getDb();

    // Get popular articles from user's feeds
    let query = db
      .select({
        id: articles.id,
        feedId: articles.feedId,
        title: articles.title,
        description: articles.description,
        author: articles.author,
        publishedAt: articles.publishedAt,
        imageUrl: articles.imageUrl,
        feedTitle: feeds.title,
        feedFavicon: feeds.favicon,
      })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .leftJoin(
        userArticleStates,
        and(
          eq(userArticleStates.articleId, articles.id),
          eq(userArticleStates.userId, userId)
        )
      );

    const conditions = [
      eq(feeds.userId, userId),
      sql`${articles.publishedAt} >= NOW() - INTERVAL '7 days'`,
    ];

    if (excludeRead) {
      conditions.push(
        sql`${userArticleStates.isRead} IS NULL OR ${userArticleStates.isRead} = false`
      );
    }

    query = query
      .where(and(...conditions))
      .orderBy(desc(articles.publishedAt))
      .limit(limit);

    const popular = await query;

    return popular.map(article => ({
      ...article,
      score: 0,
      reason: 'Recent article from your feeds',
    }));
  }

  async generateEmbeddingForArticle(articleId: string): Promise<void> {
    const db = getDb();

    try {
      // Get article content
      const [article] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, articleId))
        .limit(1);

      if (!article) {
        throw new Error('Article not found');
      }

      // Generate embedding
      const text = `${article.title}\n\n${article.description || ''}\n\n${article.content || ''}`;
      const embeddingResult = await aiService.createEmbedding(text);

      // Store embedding
      await db
        .insert(aiArticleEmbeddings)
        .values({
          articleId,
          embedding: embeddingResult.embedding,
          model: embeddingResult.model,
          provider: embeddingResult.provider,
        })
        .onConflictDoUpdate({
          target: [aiArticleEmbeddings.articleId],
          set: {
            embedding: embeddingResult.embedding,
            model: embeddingResult.model,
            provider: embeddingResult.provider,
            updatedAt: new Date(),
          },
        });

      logger.info(`Generated embedding for article ${articleId}`);
    } catch (error) {
      logger.error(`Failed to generate embedding for article ${articleId}:`, error);
      throw error;
    }
  }

  async findSimilarArticlesByEmbedding(
    articleId: string,
    limit = 10
  ): Promise<any[]> {
    const db = getDb();

    // Get source article embedding
    const [sourceEmbedding] = await db
      .select()
      .from(aiArticleEmbeddings)
      .where(eq(aiArticleEmbeddings.articleId, articleId))
      .limit(1);

    if (!sourceEmbedding) {
      throw new Error('No embedding found for article');
    }

    // Find similar articles using cosine similarity
    // Note: This is a simplified version. In production, use pgvector or similar
    const similarArticles = await db
      .select({
        id: articles.id,
        title: articles.title,
        description: articles.description,
        publishedAt: articles.publishedAt,
        feedTitle: feeds.title,
        similarity: sql<number>`1 - (${aiArticleEmbeddings.embedding} <=> ${sourceEmbedding.embedding})`,
      })
      .from(articles)
      .innerJoin(aiArticleEmbeddings, eq(articles.id, aiArticleEmbeddings.articleId))
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .where(
        and(
          sql`${articles.id} != ${articleId}`,
          sql`${aiArticleEmbeddings.provider} = ${sourceEmbedding.provider}`
        )
      )
      .orderBy(desc(sql`1 - (${aiArticleEmbeddings.embedding} <=> ${sourceEmbedding.embedding})`))
      .limit(limit);

    return similarArticles;
  }
}

export const recommendationEngine = new RecommendationEngine();