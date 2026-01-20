import * as tf from '@tensorflow/tfjs-node';
import natural from 'natural';
import { ChromaClient, Collection } from 'chromadb';

// Type definitions
interface Article {
  id: string;
  title: string;
  summary?: string;
  content?: string;
  author?: string;
  feedId: string;
  feedTitle?: string;
  publishedAt?: Date;
  isRead: boolean;
  isStarred: boolean;
  categories?: string[];
  wordCount?: number;
}

// Search result types
export interface SearchResult {
  id: string;
  type: 'article' | 'feed' | 'highlight' | 'annotation';
  title: string;
  snippet: string;
  score: number;
  metadata: Record<string, any>;
  highlights: TextHighlight[];
}

export interface TextHighlight {
  field: string;
  snippets: string[];
  positions: Array<{ start: number; end: number }>;
}

export interface SearchFilters {
  feedIds?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  isRead?: boolean;
  isStarred?: boolean;
  hasAnnotations?: boolean;
  categories?: string[];
  minScore?: number;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  includeContent?: boolean;
  semanticSearch?: boolean;
  fuzzySearch?: boolean;
  fields?: string[];
  sortBy?: 'relevance' | 'date' | 'title';
  sortOrder?: 'asc' | 'desc';
}

// Semantic search service
export class SemanticSearchService {
  private embedder: UniversalSentenceEncoder;
  private chroma: ChromaClient;
  private collection: Collection | null = null;
  private tokenizer: natural.WordTokenizer;
  private tfidf: natural.TfIdf;
  
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.tfidf = new natural.TfIdf();
    this.chroma = new ChromaClient({ path: process.env.CHROMA_URL || 'http://localhost:8000' });
    this.embedder = new UniversalSentenceEncoder();
  }
  
  async initialize() {
    // Load Universal Sentence Encoder
    await this.embedder.load();
    
    // Initialize or get Chroma collection
    try {
      this.collection = await this.chroma.getOrCreateCollection({
        name: 'omi_rss_articles',
        metadata: { 'hnsw:space': 'cosine' }
      });
    } catch (error) {
      console.error('Failed to initialize Chroma collection:', error);
    }
  }
  
  // Index an article
  async indexArticle(article: Article) {
    if (!this.collection) {
      throw new Error('Search collection not initialized');
    }
    
    const content = this.extractContent(article);
    const embedding = await this.embedder.embed(content);
    
    await this.collection.add({
      ids: [article.id],
      embeddings: [Array.from(embedding)],
      metadatas: [{
        type: 'article',
        title: article.title,
        feedId: article.feedId,
        feedTitle: article.feedTitle,
        author: article.author,
        publishedAt: article.publishedAt?.toISOString(),
        isRead: article.isRead,
        isStarred: article.isStarred,
        categories: article.categories,
        wordCount: article.wordCount,
      }],
      documents: [content]
    });
    
    // Also index in TF-IDF for keyword search
    this.tfidf.addDocument(content, article.id);
  }
  
  // Search articles
  async search(
    query: string,
    filters?: SearchFilters,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      limit = 20,
      offset = 0,
      semanticSearch = true,
      fuzzySearch = true,
      sortBy = 'relevance'
    } = options;
    
    let results: SearchResult[] = [];
    
    if (semanticSearch && this.collection) {
      // Semantic search using embeddings
      results = await this.semanticSearch(query, filters, limit, offset);
    } else {
      // Fallback to keyword search
      results = await this.keywordSearch(query, filters, limit, offset, fuzzySearch);
    }
    
    // Apply additional filters
    results = this.applyFilters(results, filters);
    
    // Sort results
    results = this.sortResults(results, sortBy);
    
    // Add text highlights
    results = this.addHighlights(results, query);
    
    return results;
  }
  
  // Semantic search using vector embeddings
  private async semanticSearch(
    query: string,
    filters?: SearchFilters,
    limit: number = 20,
    offset: number = 0
  ): Promise<SearchResult[]> {
    if (!this.collection) {
      return [];
    }
    
    const queryEmbedding = await this.embedder.embed(query);
    
    // Build where clause for filters
    const where: Record<string, any> = {};
    if (filters?.feedIds) {
      where.feedId = { $in: filters.feedIds };
    }
    if (filters?.isRead !== undefined) {
      where.isRead = filters.isRead;
    }
    if (filters?.isStarred !== undefined) {
      where.isStarred = filters.isStarred;
    }
    if (filters?.categories?.length) {
      where.categories = { $contains: filters.categories };
    }
    
    const results = await this.collection.query({
      queryEmbeddings: [Array.from(queryEmbedding)],
      nResults: limit + offset,
      where: Object.keys(where).length > 0 ? where : undefined
    });
    
    return results.ids[0].slice(offset, offset + limit).map((id, index) => ({
      id: id,
      type: 'article' as const,
      title: results.metadatas[0][index + offset].title as string,
      snippet: this.generateSnippet(results.documents[0][index + offset] || '', query),
      score: 1 - (results.distances?.[0][index + offset] || 0), // Convert distance to similarity
      metadata: results.metadatas[0][index + offset],
      highlights: []
    }));
  }
  
  // Keyword-based search with TF-IDF
  private async keywordSearch(
    query: string,
    filters?: SearchFilters,
    limit: number = 20,
    offset: number = 0,
    fuzzy: boolean = true
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    // Tokenize query
    const queryTokens = this.tokenizer.tokenize(query.toLowerCase());
    
    // Search using TF-IDF
    this.tfidf.tfidfs(query, (i, measure) => {
      if (measure > 0) {
        // Get article from database
        const articleId = this.tfidf.documents[i].__key;
        // This would fetch from database in real implementation
        results.push({
          id: articleId,
          type: 'article',
          title: 'Article Title', // Would be fetched from DB
          snippet: this.generateSnippet(this.tfidf.documents[i], query),
          score: measure,
          metadata: {},
          highlights: []
        });
      }
    });
    
    // Sort by score and apply pagination
    return results
      .sort((a, b) => b.score - a.score)
      .slice(offset, offset + limit);
  }
  
  // Apply search filters
  private applyFilters(results: SearchResult[], filters?: SearchFilters): SearchResult[] {
    if (!filters) return results;
    
    return results.filter(result => {
      if (filters.minScore && result.score < filters.minScore) {
        return false;
      }
      
      if (filters.dateFrom || filters.dateTo) {
        const publishedAt = result.metadata.publishedAt 
          ? new Date(result.metadata.publishedAt) 
          : null;
        
        if (publishedAt) {
          if (filters.dateFrom && publishedAt < filters.dateFrom) {
            return false;
          }
          if (filters.dateTo && publishedAt > filters.dateTo) {
            return false;
          }
        }
      }
      
      return true;
    });
  }
  
  // Sort search results
  private sortResults(
    results: SearchResult[],
    sortBy: 'relevance' | 'date' | 'title'
  ): SearchResult[] {
    switch (sortBy) {
      case 'relevance':
        return results.sort((a, b) => b.score - a.score);
      
      case 'date':
        return results.sort((a, b) => {
          const dateA = new Date(a.metadata.publishedAt || 0);
          const dateB = new Date(b.metadata.publishedAt || 0);
          return dateB.getTime() - dateA.getTime();
        });
      
      case 'title':
        return results.sort((a, b) => a.title.localeCompare(b.title));
      
      default:
        return results;
    }
  }
  
  // Add text highlights to results
  private addHighlights(results: SearchResult[], query: string): SearchResult[] {
    const queryTokens = this.tokenizer.tokenize(query.toLowerCase());
    
    return results.map(result => {
      const highlights: TextHighlight[] = [];
      
      // Highlight in title
      const titleHighlights = this.findHighlights(result.title, queryTokens);
      if (titleHighlights.length > 0) {
        highlights.push({
          field: 'title',
          snippets: [result.title],
          positions: titleHighlights
        });
      }
      
      // Highlight in snippet
      const snippetHighlights = this.findHighlights(result.snippet, queryTokens);
      if (snippetHighlights.length > 0) {
        highlights.push({
          field: 'content',
          snippets: [result.snippet],
          positions: snippetHighlights
        });
      }
      
      return { ...result, highlights };
    });
  }
  
  // Find highlight positions in text
  private findHighlights(
    text: string,
    queryTokens: string[]
  ): Array<{ start: number; end: number }> {
    const positions: Array<{ start: number; end: number }> = [];
    const lowerText = text.toLowerCase();
    
    for (const token of queryTokens) {
      let index = 0;
      while ((index = lowerText.indexOf(token, index)) !== -1) {
        positions.push({
          start: index,
          end: index + token.length
        });
        index += token.length;
      }
    }
    
    // Merge overlapping positions
    return this.mergePositions(positions);
  }
  
  // Merge overlapping highlight positions
  private mergePositions(
    positions: Array<{ start: number; end: number }>
  ): Array<{ start: number; end: number }> {
    if (positions.length === 0) return [];
    
    const sorted = positions.sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [sorted[0]];
    
    for (let i = 1; i < sorted.length; i++) {
      const last = merged[merged.length - 1];
      const current = sorted[i];
      
      if (current.start <= last.end) {
        last.end = Math.max(last.end, current.end);
      } else {
        merged.push(current);
      }
    }
    
    return merged;
  }
  
  // Extract searchable content from article
  private extractContent(article: Article): string {
    const parts = [
      article.title,
      article.summary,
      article.content,
      article.author,
      ...(article.categories || [])
    ].filter(Boolean);
    
    return parts.join(' ');
  }
  
  // Generate snippet from content
  private generateSnippet(content: string, query: string, maxLength: number = 200): string {
    const queryTokens = this.tokenizer.tokenize(query.toLowerCase());
    const contentLower = content.toLowerCase();
    
    // Find best matching position
    let bestPosition = 0;
    let bestScore = 0;
    
    for (let i = 0; i < content.length - maxLength; i++) {
      const window = contentLower.substring(i, i + maxLength);
      let score = 0;
      
      for (const token of queryTokens) {
        if (window.includes(token)) {
          score++;
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestPosition = i;
      }
    }
    
    // Extract snippet
    let snippet = content.substring(bestPosition, bestPosition + maxLength);
    
    // Trim to word boundaries
    const firstSpace = snippet.indexOf(' ');
    const lastSpace = snippet.lastIndexOf(' ');
    
    if (firstSpace > 0 && bestPosition > 0) {
      snippet = '...' + snippet.substring(firstSpace);
    }
    
    if (lastSpace > 0 && bestPosition + maxLength < content.length) {
      snippet = snippet.substring(0, lastSpace) + '...';
    }
    
    return snippet.trim();
  }
  
  // Suggest search queries based on partial input
  async suggest(partial: string, limit: number = 5): Promise<string[]> {
    // This would implement query suggestion logic
    // Could use:
    // - Previous search history
    // - Popular search terms
    // - Article titles/tags
    // - Fuzzy matching
    
    const suggestions: string[] = [];
    
    // Simple implementation: match article titles
    // In production, this would query from a proper index
    
    return suggestions.slice(0, limit);
  }
  
  // Get related articles using semantic similarity
  async findRelated(articleId: string, limit: number = 5): Promise<SearchResult[]> {
    if (!this.collection) {
      return [];
    }
    
    // Get article embedding
    const article = await this.collection.get({
      ids: [articleId]
    });
    
    if (!article.embeddings || article.embeddings.length === 0) {
      return [];
    }
    
    // Find similar articles
    const results = await this.collection.query({
      queryEmbeddings: article.embeddings,
      nResults: limit + 1, // +1 to exclude self
      where: { id: { $ne: articleId } }
    });
    
    return results.ids[0].slice(0, limit).map((id, index) => ({
      id: id,
      type: 'article' as const,
      title: results.metadatas[0][index].title as string,
      snippet: '',
      score: 1 - (results.distances?.[0][index] || 0),
      metadata: results.metadatas[0][index],
      highlights: []
    }));
  }
}

// Universal Sentence Encoder wrapper
class UniversalSentenceEncoder {
  private model: tf.GraphModel | null = null;
  
  async load() {
    // In production, load actual USE model
    // this.model = await tf.loadGraphModel('path/to/use/model');
  }
  
  async embed(text: string): Promise<Float32Array> {
    // Simplified implementation
    // In production, use actual USE model
    const embedding = new Float32Array(512);
    
    // Simple hash-based embedding for demo
    for (let i = 0; i < text.length; i++) {
      const index = i % 512;
      embedding[index] += text.charCodeAt(i) / 1000;
    }
    
    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= norm;
    }
    
    return embedding;
  }
}