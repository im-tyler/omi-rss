import { AIProvider } from '../config';

export interface SummarizeOptions {
  content: string;
  style: 'brief' | 'detailed' | 'bullet_points';
  maxLength: number;
  language: string;
}

export interface AnalyzeOptions {
  content: string;
  analysisTypes: ('sentiment' | 'topics' | 'entities' | 'keywords')[];
}

export interface GenerateOptions {
  prompt: string;
  context?: string;
  maxTokens: number;
  temperature: number;
}

export interface SummarizeResult {
  summary: string;
  tokensUsed: number;
  model: string;
  provider: AIProvider;
}

export interface AnalyzeResult {
  sentiment?: {
    label: 'positive' | 'negative' | 'neutral';
    score: number;
  };
  topics?: string[];
  entities?: {
    people: string[];
    organizations: string[];
    locations: string[];
  };
  keywords?: string[];
  tokensUsed: number;
  model: string;
  provider: AIProvider;
}

export interface GenerateResult {
  text: string;
  tokensUsed: number;
  model: string;
  provider: AIProvider;
}

export interface EmbeddingResult {
  embedding: number[];
  tokensUsed: number;
  model: string;
  provider: AIProvider;
}

export abstract class BaseAIProvider {
  protected provider: AIProvider;
  protected apiKey: string;
  protected timeout: number;

  constructor(provider: AIProvider, apiKey: string, timeout = 30000) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.timeout = timeout;
  }

  abstract summarize(options: SummarizeOptions): Promise<SummarizeResult>;
  abstract analyze(options: AnalyzeOptions): Promise<AnalyzeResult>;
  abstract generate(options: GenerateOptions): Promise<GenerateResult>;
  abstract createEmbedding(text: string): Promise<EmbeddingResult>;
  
  protected truncateContent(content: string, maxTokens: number): string {
    // Rough approximation: 1 token ≈ 4 characters
    const maxChars = maxTokens * 4;
    if (content.length <= maxChars) {
      return content;
    }
    return content.substring(0, maxChars) + '...';
  }

  protected estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
}