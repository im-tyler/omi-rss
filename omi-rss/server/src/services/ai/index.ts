import { 
  AIProvider, 
  getAIConfig, 
  AI_RATE_LIMITS,
  AI_COSTS,
  summarizeRequestSchema,
  analyzeRequestSchema,
  generateRequestSchema,
} from './config';
import { BaseAIProvider } from './providers/base';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GoogleAIProvider } from './providers/google';
import { CohereProvider } from './providers/cohere';
import { getRedis } from '../redis';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/errorHandler';
import { getDb } from '../../database';
import { articles } from '../../database/schema';
import { eq } from 'drizzle-orm';

export class AIService {
  private providers: Map<AIProvider, BaseAIProvider> = new Map();
  private defaultProvider: AIProvider = AIProvider.OPENAI;
  private redis = getRedis();

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Initialize OpenAI
    const openaiConfig = getAIConfig(AIProvider.OPENAI);
    if (openaiConfig.apiKey) {
      this.providers.set(AIProvider.OPENAI, new OpenAIProvider(openaiConfig.apiKey));
      logger.info('OpenAI provider initialized');
    }

    // Initialize Anthropic
    const anthropicConfig = getAIConfig(AIProvider.ANTHROPIC);
    if (anthropicConfig.apiKey) {
      this.providers.set(AIProvider.ANTHROPIC, new AnthropicProvider(anthropicConfig.apiKey));
      logger.info('Anthropic provider initialized');
    }

    // Initialize Google
    const googleConfig = getAIConfig(AIProvider.GOOGLE);
    if (googleConfig.apiKey) {
      this.providers.set(AIProvider.GOOGLE, new GoogleAIProvider(googleConfig.apiKey));
      logger.info('Google AI provider initialized');
    }

    // Initialize Cohere
    const cohereConfig = getAIConfig(AIProvider.COHERE);
    if (cohereConfig.apiKey) {
      this.providers.set(AIProvider.COHERE, new CohereProvider(cohereConfig.apiKey));
      logger.info('Cohere provider initialized');
    }

    // Set default provider
    if (this.providers.size === 0) {
      logger.warn('No AI providers configured');
    } else {
      // Prefer OpenAI > Anthropic > Google
      if (this.providers.has(AIProvider.OPENAI)) {
        this.defaultProvider = AIProvider.OPENAI;
      } else if (this.providers.has(AIProvider.ANTHROPIC)) {
        this.defaultProvider = AIProvider.ANTHROPIC;
      } else {
        this.defaultProvider = AIProvider.GOOGLE;
      }
    }
  }

  private async checkRateLimit(provider: AIProvider, userId: string): Promise<void> {
    const limits = AI_RATE_LIMITS[provider];
    const key = `ai:ratelimit:${provider}:${userId}`;
    
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, 60); // 1 minute window
    }

    if (current > limits.requestsPerMinute) {
      throw new AppError(`Rate limit exceeded for ${provider}`, 429);
    }
  }

  private async trackUsage(
    userId: string,
    provider: AIProvider,
    model: string,
    tokensUsed: number,
    operation: string
  ): Promise<void> {
    try {
      // Track usage in Redis for real-time monitoring
      const date = new Date().toISOString().split('T')[0];
      const key = `ai:usage:${userId}:${date}`;
      
      await this.redis.hincrby(key, `${provider}:${operation}:requests`, 1);
      await this.redis.hincrby(key, `${provider}:${operation}:tokens`, tokensUsed);
      await this.redis.expire(key, 86400 * 30); // Keep for 30 days

      // Calculate cost
      const modelCosts = AI_COSTS[provider][model];
      if (modelCosts) {
        const cost = modelCosts.input ? (tokensUsed / 1000) * modelCosts.input : 0;
        await this.redis.hincrbyfloat(key, `${provider}:${operation}:cost`, cost);
      }

      // Log for monitoring
      logger.info('AI usage tracked', {
        userId,
        provider,
        model,
        operation,
        tokensUsed,
      });
    } catch (error) {
      logger.error('Failed to track AI usage:', error);
    }
  }

  async summarizeArticle(
    articleId: string,
    userId: string,
    options: {
      style?: 'brief' | 'detailed' | 'bullet_points';
      provider?: AIProvider;
    } = {}
  ): Promise<any> {
    const provider = options.provider || this.defaultProvider;
    const aiProvider = this.providers.get(provider);
    
    if (!aiProvider) {
      throw new AppError('AI provider not configured', 503);
    }

    // Check rate limit
    await this.checkRateLimit(provider, userId);

    // Check cache
    const cacheKey = `ai:summary:${articleId}:${options.style || 'brief'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get article content (this would normally fetch from database)
    // For now, we'll assume it's passed in the options
    const content = await this.getArticleContent(articleId);

    // Generate summary
    const result = await aiProvider.summarize({
      content,
      style: options.style || 'brief',
      maxLength: 150,
      language: 'en',
    });

    // Track usage
    await this.trackUsage(userId, provider, result.model, result.tokensUsed, 'summarize');

    // Cache result
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 86400); // 24 hours

    return result;
  }

  async analyzeArticles(
    articleIds: string[],
    userId: string,
    options: {
      analysisTypes: ('sentiment' | 'topics' | 'entities' | 'keywords')[];
      provider?: AIProvider;
    }
  ): Promise<any[]> {
    const provider = options.provider || this.defaultProvider;
    const aiProvider = this.providers.get(provider);
    
    if (!aiProvider) {
      throw new AppError('AI provider not configured', 503);
    }

    // Check rate limit
    await this.checkRateLimit(provider, userId);

    const results = [];
    
    for (const articleId of articleIds.slice(0, 10)) { // Limit to 10 articles
      const content = await this.getArticleContent(articleId);
      
      const result = await aiProvider.analyze({
        content,
        analysisTypes: options.analysisTypes,
      });

      // Track usage
      await this.trackUsage(userId, provider, result.model, result.tokensUsed, 'analyze');

      results.push({
        articleId,
        ...result,
      });
    }

    return results;
  }

  async generateContent(
    userId: string,
    options: {
      prompt: string;
      context?: string;
      maxTokens?: number;
      temperature?: number;
      provider?: AIProvider;
    }
  ): Promise<any> {
    const provider = options.provider || this.defaultProvider;
    const aiProvider = this.providers.get(provider);
    
    if (!aiProvider) {
      throw new AppError('AI provider not configured', 503);
    }

    // Check rate limit
    await this.checkRateLimit(provider, userId);

    // Generate content
    const result = await aiProvider.generate({
      prompt: options.prompt,
      context: options.context,
      maxTokens: options.maxTokens || 500,
      temperature: options.temperature || 0.7,
    });

    // Track usage
    await this.trackUsage(userId, provider, result.model, result.tokensUsed, 'generate');

    return result;
  }

  async categorizeArticle(
    articleId: string,
    userId: string,
    provider?: AIProvider
  ): Promise<{ categories: string[]; tags: string[] }> {
    const selectedProvider = provider || this.defaultProvider;
    const aiProvider = this.providers.get(selectedProvider);
    
    if (!aiProvider) {
      throw new AppError('AI provider not configured', 503);
    }

    // Check cache
    const cacheKey = `ai:categorize:${articleId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const content = await this.getArticleContent(articleId);
    
    const result = await aiProvider.generate({
      prompt: `Based on the following article content, suggest up to 3 categories from this list: Technology, Business, Politics, Science, Health, Entertainment, Sports, World News, Opinion. Also suggest up to 5 relevant tags. Format your response as JSON with "categories" and "tags" arrays.`,
      context: content,
      maxTokens: 200,
      temperature: 0.3,
    });

    // Parse response
    let categorization = { categories: [], tags: [] };
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        categorization = JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.error('Failed to parse categorization response:', error);
    }

    // Cache result
    await this.redis.set(cacheKey, JSON.stringify(categorization), 'EX', 86400 * 7); // 7 days

    return categorization;
  }

  async getUsageStats(userId: string): Promise<any> {
    const date = new Date().toISOString().split('T')[0];
    const key = `ai:usage:${userId}:${date}`;
    
    const usage = await this.redis.hgetall(key);
    
    // Parse and structure usage data
    const stats = {
      daily: {
        requests: 0,
        tokens: 0,
        cost: 0,
      },
      byProvider: {},
      byOperation: {},
    };

    for (const [field, value] of Object.entries(usage)) {
      const [provider, operation, metric] = field.split(':');
      
      if (!stats.byProvider[provider]) {
        stats.byProvider[provider] = { requests: 0, tokens: 0, cost: 0 };
      }
      
      if (!stats.byOperation[operation]) {
        stats.byOperation[operation] = { requests: 0, tokens: 0, cost: 0 };
      }

      const numValue = parseFloat(value);
      stats.byProvider[provider][metric] += numValue;
      stats.byOperation[operation][metric] += numValue;
      stats.daily[metric] += numValue;
    }

    return stats;
  }

  getAvailableProviders(): AIProvider[] {
    return Array.from(this.providers.keys());
  }

  async createEmbedding(text: string, provider?: AIProvider): Promise<any> {
    const selectedProvider = provider || AIProvider.OPENAI; // OpenAI is best for embeddings
    const aiProvider = this.providers.get(selectedProvider);
    
    if (!aiProvider) {
      throw new AppError('AI provider not configured for embeddings', 503);
    }

    return aiProvider.createEmbedding(text);
  }

  private async getArticleContent(articleId: string): Promise<string> {
    const db = getDb();
    
    const [article] = await db
      .select({
        title: articles.title,
        description: articles.description,
        content: articles.content,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      throw new Error('Article not found');
    }

    // Combine title, description, and content
    return `${article.title}\n\n${article.description || ''}\n\n${article.content || ''}`;
  }
}

// Export singleton instance
export const aiService = new AIService();