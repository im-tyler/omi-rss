import { aiService } from '../ai';
import { getDb } from '../../database';
import { articles, feeds, users, aiAnalysis } from '../../database/schema';
import { eq, and, desc, gte, sql, inArray } from 'drizzle-orm';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/errorHandler';
import { ContentType, GenerationOptions, GeneratedContent } from './types';

export class ContentGenerator {
  // Generate newsletter from recent articles
  async generateNewsletter(userId: string, options: {
    feedIds?: string[];
    timeRange?: number; // hours
    maxArticles?: number;
    style?: 'formal' | 'casual' | 'technical';
    sections?: string[];
  }): Promise<GeneratedContent> {
    const db = getDb();
    
    // Get recent articles
    const since = new Date();
    since.setHours(since.getHours() - (options.timeRange || 24));

    let query = db
      .select({
        id: articles.id,
        title: articles.title,
        summary: articles.summary,
        content: articles.content,
        url: articles.url,
        publishedAt: articles.publishedAt,
        feedTitle: feeds.title,
        feedId: articles.feedId,
      })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .where(
        and(
          eq(feeds.userId, userId),
          gte(articles.publishedAt, since),
          options.feedIds ? inArray(articles.feedId, options.feedIds) : sql`true`
        )
      )
      .orderBy(desc(articles.publishedAt))
      .limit(options.maxArticles || 20);

    const recentArticles = await query;

    if (recentArticles.length === 0) {
      throw new AppError('No recent articles found', 404);
    }

    // Get AI summaries if available
    const articleIds = recentArticles.map(a => a.id);
    const summaries = await db
      .select()
      .from(aiAnalysis)
      .where(
        and(
          inArray(aiAnalysis.articleId, articleIds),
          eq(aiAnalysis.analysisType, 'summary')
        )
      );

    const summaryMap = new Map(
      summaries.map(s => [s.articleId, s.result])
    );

    // Prepare content for generation
    const articleData = recentArticles.map(article => ({
      title: article.title,
      summary: summaryMap.get(article.id)?.summary || article.summary,
      url: article.url,
      feedTitle: article.feedTitle,
      publishedAt: article.publishedAt,
    }));

    // Generate newsletter
    const prompt = this.buildNewsletterPrompt(articleData, options);
    const result = await aiService.generateContent(prompt, {
      maxTokens: 2000,
      temperature: 0.7,
      format: 'markdown',
    });

    return {
      type: ContentType.NEWSLETTER,
      title: `Your ${options.style || 'Daily'} Newsletter`,
      content: result.content,
      format: 'markdown',
      metadata: {
        articleCount: recentArticles.length,
        timeRange: options.timeRange || 24,
        style: options.style || 'casual',
        generatedAt: new Date(),
      },
    };
  }

  // Generate podcast script from articles
  async generatePodcastScript(userId: string, options: {
    articleIds: string[];
    duration?: number; // minutes
    style?: 'conversational' | 'news' | 'educational';
    includeIntro?: boolean;
    includeOutro?: boolean;
  }): Promise<GeneratedContent> {
    const db = getDb();

    // Get articles
    const selectedArticles = await db
      .select({
        id: articles.id,
        title: articles.title,
        content: articles.content,
        summary: articles.summary,
        author: articles.author,
        publishedAt: articles.publishedAt,
        feedTitle: feeds.title,
      })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .where(
        and(
          eq(feeds.userId, userId),
          inArray(articles.id, options.articleIds)
        )
      );

    if (selectedArticles.length === 0) {
      throw new AppError('Articles not found', 404);
    }

    // Generate script
    const prompt = this.buildPodcastPrompt(selectedArticles, options);
    const result = await aiService.generateContent(prompt, {
      maxTokens: 3000,
      temperature: 0.8,
      format: 'text',
    });

    // Estimate reading time
    const wordCount = result.content.split(' ').length;
    const estimatedDuration = Math.ceil(wordCount / 150); // 150 words per minute

    return {
      type: ContentType.PODCAST_SCRIPT,
      title: 'Podcast Script: ' + selectedArticles.map(a => a.title).join(', '),
      content: result.content,
      format: 'text',
      metadata: {
        articleCount: selectedArticles.length,
        style: options.style || 'conversational',
        estimatedDuration,
        wordCount,
        generatedAt: new Date(),
      },
    };
  }

  // Generate social media posts
  async generateSocialPosts(userId: string, options: {
    articleId: string;
    platforms: ('twitter' | 'linkedin' | 'facebook' | 'instagram')[];
    tone?: 'professional' | 'casual' | 'humorous' | 'informative';
    includeHashtags?: boolean;
    includeEmojis?: boolean;
  }): Promise<GeneratedContent[]> {
    const db = getDb();

    // Get article
    const [article] = await db
      .select({
        title: articles.title,
        summary: articles.summary,
        content: articles.content,
        url: articles.url,
        categories: articles.categories,
      })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .where(
        and(
          eq(articles.id, options.articleId),
          eq(feeds.userId, userId)
        )
      )
      .limit(1);

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    const posts: GeneratedContent[] = [];

    for (const platform of options.platforms) {
      const prompt = this.buildSocialMediaPrompt(article, platform, options);
      const result = await aiService.generateContent(prompt, {
        maxTokens: 500,
        temperature: 0.9,
        format: 'text',
      });

      posts.push({
        type: ContentType.SOCIAL_MEDIA,
        title: `${platform} Post`,
        content: result.content,
        format: 'text',
        metadata: {
          platform,
          articleId: options.articleId,
          tone: options.tone || 'casual',
          characterCount: result.content.length,
          includesHashtags: options.includeHashtags,
          includesEmojis: options.includeEmojis,
          generatedAt: new Date(),
        },
      });
    }

    return posts;
  }

  // Generate summary thread
  async generateThreadSummary(userId: string, options: {
    feedId?: string;
    topic?: string;
    articleCount?: number;
    threadLength?: number;
    style?: 'academic' | 'business' | 'casual';
  }): Promise<GeneratedContent> {
    const db = getDb();

    // Get related articles
    let query = db
      .select({
        title: articles.title,
        summary: articles.summary,
        content: articles.content,
        publishedAt: articles.publishedAt,
        categories: articles.categories,
      })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .where(
        and(
          eq(feeds.userId, userId),
          options.feedId ? eq(articles.feedId, options.feedId) : sql`true`
        )
      )
      .orderBy(desc(articles.publishedAt))
      .limit(options.articleCount || 10);

    const relatedArticles = await query;

    if (relatedArticles.length === 0) {
      throw new AppError('No articles found for thread', 404);
    }

    // Generate thread
    const prompt = this.buildThreadPrompt(relatedArticles, options);
    const result = await aiService.generateContent(prompt, {
      maxTokens: 2500,
      temperature: 0.7,
      format: 'markdown',
    });

    return {
      type: ContentType.THREAD,
      title: options.topic || 'Summary Thread',
      content: result.content,
      format: 'markdown',
      metadata: {
        articleCount: relatedArticles.length,
        style: options.style || 'casual',
        threadLength: options.threadLength || 5,
        generatedAt: new Date(),
      },
    };
  }

  // Generate reading notes
  async generateReadingNotes(userId: string, options: {
    articleId: string;
    style?: 'cornell' | 'outline' | 'mindmap' | 'summary';
    includeQuotes?: boolean;
    includeQuestions?: boolean;
    includeActionItems?: boolean;
  }): Promise<GeneratedContent> {
    const db = getDb();

    // Get article with highlights
    const [article] = await db
      .select({
        title: articles.title,
        content: articles.content,
        author: articles.author,
        url: articles.url,
        highlights: sql<any>`
          (SELECT array_agg(highlights) 
           FROM ${userArticleStates} 
           WHERE article_id = ${articles.id} 
           AND user_id = ${userId})
        `,
      })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .where(
        and(
          eq(articles.id, options.articleId),
          eq(feeds.userId, userId)
        )
      )
      .limit(1);

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // Generate notes
    const prompt = this.buildNotesPrompt(article, options);
    const result = await aiService.generateContent(prompt, {
      maxTokens: 1500,
      temperature: 0.6,
      format: 'markdown',
    });

    return {
      type: ContentType.NOTES,
      title: `Reading Notes: ${article.title}`,
      content: result.content,
      format: 'markdown',
      metadata: {
        articleId: options.articleId,
        style: options.style || 'summary',
        includesQuotes: options.includeQuotes,
        includesQuestions: options.includeQuestions,
        includesActionItems: options.includeActionItems,
        generatedAt: new Date(),
      },
    };
  }

  // Helper methods for building prompts
  private buildNewsletterPrompt(articles: any[], options: any): string {
    const style = options.style || 'casual';
    const sections = options.sections || ['highlights', 'summaries', 'recommendations'];

    return `Create a ${style} newsletter summarizing the following articles.

Articles:
${articles.map(a => `- "${a.title}" from ${a.feedTitle}`).join('\n')}

Requirements:
- Write in a ${style} tone
- Include these sections: ${sections.join(', ')}
- Keep summaries concise but informative
- Highlight key insights and trends
- Add a brief introduction and conclusion
- Format in Markdown with clear sections

Generate the newsletter:`;
  }

  private buildPodcastPrompt(articles: any[], options: any): string {
    const style = options.style || 'conversational';
    const duration = options.duration || 10;

    return `Create a ${duration}-minute podcast script discussing these articles in a ${style} style.

Articles:
${articles.map(a => `"${a.title}" - ${a.summary}`).join('\n\n')}

Requirements:
- Write for spoken delivery
- ${options.includeIntro ? 'Include an engaging introduction' : 'Start with the main content'}
- Use a ${style} tone throughout
- Include transitions between topics
- Add speaking cues [PAUSE], [EMPHASIS], etc.
- ${options.includeOutro ? 'Include a call-to-action outro' : 'End naturally'}
- Target duration: ${duration} minutes

Generate the script:`;
  }

  private buildSocialMediaPrompt(article: any, platform: string, options: any): string {
    const constraints: Record<string, any> = {
      twitter: { chars: 280, style: 'concise' },
      linkedin: { chars: 1300, style: 'professional' },
      facebook: { chars: 500, style: 'engaging' },
      instagram: { chars: 2200, style: 'visual' },
    };

    const platformConfig = constraints[platform];
    const tone = options.tone || 'casual';

    return `Create a ${platform} post about this article in a ${tone} tone.

Article: "${article.title}"
Summary: ${article.summary}
URL: ${article.url}

Requirements:
- Maximum ${platformConfig.chars} characters
- ${tone} tone suitable for ${platform}
- ${options.includeHashtags ? 'Include 3-5 relevant hashtags' : 'No hashtags'}
- ${options.includeEmojis ? 'Use appropriate emojis' : 'No emojis'}
- Include a call-to-action
- Make it ${platformConfig.style}

Generate the post:`;
  }

  private buildThreadPrompt(articles: any[], options: any): string {
    const style = options.style || 'casual';
    const threadLength = options.threadLength || 5;

    return `Create a ${threadLength}-part thread summarizing these articles on "${options.topic || 'Recent Developments'}".

Articles:
${articles.map(a => `- ${a.title}: ${a.summary}`).join('\n')}

Requirements:
- Write in ${style} style
- Create ${threadLength} connected parts
- Each part should be 2-3 paragraphs
- Number each part (1/${threadLength}, 2/${threadLength}, etc.)
- Include key insights and connections
- End with conclusions or implications

Generate the thread:`;
  }

  private buildNotesPrompt(article: any, options: any): string {
    const style = options.style || 'summary';
    const highlights = article.highlights || [];

    return `Create ${style}-style reading notes for this article.

Article: "${article.title}"
Author: ${article.author || 'Unknown'}
Content: ${article.content.substring(0, 2000)}...
${highlights.length > 0 ? `User Highlights: ${highlights.join('; ')}` : ''}

Requirements:
- Use ${style} note-taking format
- Focus on key concepts and insights
- ${options.includeQuotes ? 'Include important quotes' : ''}
- ${options.includeQuestions ? 'Add thought-provoking questions' : ''}
- ${options.includeActionItems ? 'List actionable takeaways' : ''}
- Keep it organized and scannable

Generate the notes:`;
  }
}

export const contentGenerator = new ContentGenerator();