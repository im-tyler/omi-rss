import { logger } from '../../utils/logger';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

interface PaywallBypassOptions {
  url: string;
  userAgent?: string;
}

interface BypassResult {
  success: boolean;
  method?: string;
  content?: string;
  title?: string;
  author?: string;
  excerpt?: string;
  imageUrl?: string;
  error?: string;
}

export class EthicalPaywallBypassService {
  private readonly userAgent = 'Mozilla/5.0 (compatible; OmiRSS/1.0; +https://github.com/omi-rss)';

  /**
   * Attempts to ethically bypass paywalls using various methods
   * Priority is given to methods that respect publisher intent
   */
  async attemptBypass(options: PaywallBypassOptions): Promise<BypassResult> {
    const { url, userAgent = this.userAgent } = options;

    try {
      // Method 1: Check Archive.org Wayback Machine
      const archiveResult = await this.checkWaybackMachine(url);
      if (archiveResult.success) {
        return archiveResult;
      }

      // Method 2: Try Google Cache
      const cacheResult = await this.checkGoogleCache(url);
      if (cacheResult.success) {
        return cacheResult;
      }

      // Method 3: Try RSS feed extraction (many paywalled sites provide full content in RSS)
      const rssResult = await this.checkRSSFeed(url);
      if (rssResult.success) {
        return rssResult;
      }

      // Method 4: Try reader mode extraction (only if content is already loaded)
      const readerResult = await this.tryReaderMode(url, userAgent);
      if (readerResult.success) {
        return readerResult;
      }

      // Method 5: Check if site offers free preview
      const previewResult = await this.checkFreePreview(url, userAgent);
      if (previewResult.success) {
        return previewResult;
      }

      return {
        success: false,
        error: 'Unable to access article content through ethical means',
      };
    } catch (error) {
      logger.error('Paywall bypass error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if article is archived on Wayback Machine
   */
  private async checkWaybackMachine(url: string): Promise<BypassResult> {
    try {
      // Check if URL is available in Wayback Machine
      const availabilityUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
      const response = await axios.get(availabilityUrl);
      
      if (response.data?.archived_snapshots?.closest?.available) {
        const archiveUrl = response.data.archived_snapshots.closest.url;
        
        // Fetch the archived content
        const archiveResponse = await axios.get(archiveUrl);
        const dom = new JSDOM(archiveResponse.data, { url: archiveUrl });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (article) {
          return {
            success: true,
            method: 'wayback_machine',
            content: article.content,
            title: article.title,
            author: article.byline,
            excerpt: article.excerpt,
          };
        }
      }
    } catch (error) {
      logger.debug('Wayback Machine check failed:', error);
    }

    return { success: false };
  }

  /**
   * Check Google Cache for the article
   */
  private async checkGoogleCache(url: string): Promise<BypassResult> {
    try {
      const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
      
      const response = await axios.get(cacheUrl, {
        headers: {
          'User-Agent': this.userAgent,
        },
      });

      const dom = new JSDOM(response.data, { url: cacheUrl });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article) {
        return {
          success: true,
          method: 'google_cache',
          content: article.content,
          title: article.title,
          author: article.byline,
          excerpt: article.excerpt,
        };
      }
    } catch (error) {
      logger.debug('Google Cache check failed:', error);
    }

    return { success: false };
  }

  /**
   * Check if the site provides full content in RSS feed
   */
  private async checkRSSFeed(url: string): Promise<BypassResult> {
    try {
      // Extract domain from URL
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      // Common RSS feed locations
      const feedUrls = [
        `${urlObj.protocol}//${domain}/feed`,
        `${urlObj.protocol}//${domain}/rss`,
        `${urlObj.protocol}//${domain}/feeds`,
        `${urlObj.protocol}//${domain}/feed.xml`,
        `${urlObj.protocol}//${domain}/rss.xml`,
      ];

      // Check each potential feed URL
      for (const feedUrl of feedUrls) {
        try {
          const response = await axios.get(feedUrl, {
            headers: { 'User-Agent': this.userAgent },
            timeout: 5000,
          });

          // Parse RSS and look for the article
          if (response.data.includes(urlObj.pathname)) {
            // Extract article content from RSS
            // This is a simplified version - in production, use a proper RSS parser
            const match = response.data.match(
              new RegExp(`<item>.*?<link>${url}.*?<\\/item>`, 's')
            );
            
            if (match) {
              const content = this.extractFromRSSItem(match[0]);
              if (content) {
                return {
                  success: true,
                  method: 'rss_feed',
                  ...content,
                };
              }
            }
          }
        } catch {
          // Continue to next feed URL
        }
      }
    } catch (error) {
      logger.debug('RSS feed check failed:', error);
    }

    return { success: false };
  }

  /**
   * Try to extract content using reader mode (Mozilla Readability)
   */
  private async tryReaderMode(url: string, userAgent: string): Promise<BypassResult> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: 10000,
      });

      const dom = new JSDOM(response.data, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article && article.content) {
        // Check if content seems complete (not just a preview)
        const wordCount = article.textContent.split(/\s+/).length;
        if (wordCount > 300) {
          return {
            success: true,
            method: 'reader_mode',
            content: article.content,
            title: article.title,
            author: article.byline,
            excerpt: article.excerpt,
          };
        }
      }
    } catch (error) {
      logger.debug('Reader mode extraction failed:', error);
    }

    return { success: false };
  }

  /**
   * Check if the site offers a free preview
   */
  private async checkFreePreview(url: string, userAgent: string): Promise<BypassResult> {
    try {
      // Some sites offer free previews with specific parameters
      const previewUrls = [
        `${url}?preview=true`,
        `${url}?free=true`,
        `${url}?amp=1`, // AMP versions sometimes have full content
      ];

      for (const previewUrl of previewUrls) {
        try {
          const response = await axios.get(previewUrl, {
            headers: {
              'User-Agent': userAgent,
              'Referer': 'https://www.google.com/', // Some sites allow access from search engines
            },
            timeout: 5000,
          });

          const dom = new JSDOM(response.data, { url: previewUrl });
          const reader = new Readability(dom.window.document);
          const article = reader.parse();

          if (article && article.content) {
            const wordCount = article.textContent.split(/\s+/).length;
            if (wordCount > 300) {
              return {
                success: true,
                method: 'free_preview',
                content: article.content,
                title: article.title,
                author: article.byline,
                excerpt: article.excerpt,
              };
            }
          }
        } catch {
          // Continue to next preview URL
        }
      }
    } catch (error) {
      logger.debug('Free preview check failed:', error);
    }

    return { success: false };
  }

  /**
   * Extract content from RSS item
   */
  private extractFromRSSItem(itemXml: string): Partial<BypassResult> | null {
    try {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1];
      const description = itemXml.match(/<description>(.*?)<\/description>/s)?.[1];
      const content = itemXml.match(/<content:encoded>(.*?)<\/content:encoded>/s)?.[1] || description;
      
      if (content) {
        return {
          title: title ? this.decodeHtml(title) : undefined,
          content: this.decodeHtml(content),
        };
      }
    } catch (error) {
      logger.debug('RSS extraction error:', error);
    }

    return null;
  }

  /**
   * Decode HTML entities
   */
  private decodeHtml(html: string): string {
    const doc = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
    return doc.window.document.body.textContent || '';
  }

  /**
   * Get bypass suggestions for a URL
   */
  async getBypassSuggestions(url: string): Promise<string[]> {
    const suggestions: string[] = [];

    try {
      // Check Archive.org availability
      const availabilityUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
      const response = await axios.get(availabilityUrl);
      
      if (response.data?.archived_snapshots?.closest?.available) {
        suggestions.push('This article is available on Archive.org');
      }

      // Check if site has known RSS feeds
      const urlObj = new URL(url);
      suggestions.push(`Try checking ${urlObj.hostname}/rss for full content`);

      // Suggest browser extensions
      suggestions.push('Browser extensions like "Bypass Paywalls Clean" may help');
      
      // Suggest legitimate alternatives
      suggestions.push('Consider subscribing to support quality journalism');
      suggestions.push('Check if your library offers free digital access');

    } catch (error) {
      logger.debug('Failed to get bypass suggestions:', error);
    }

    return suggestions;
  }
}