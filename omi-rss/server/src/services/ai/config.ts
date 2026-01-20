import { z } from 'zod';

// AI Provider types
export enum AIProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  COHERE = 'cohere',
}

// Model configurations
export const AI_MODELS = {
  [AIProvider.OPENAI]: {
    summarization: 'gpt-4-turbo-preview',
    analysis: 'gpt-4-turbo-preview',
    generation: 'gpt-4-turbo-preview',
    embedding: 'text-embedding-3-small',
  },
  [AIProvider.ANTHROPIC]: {
    summarization: 'claude-3-sonnet-20240229',
    analysis: 'claude-3-sonnet-20240229',
    generation: 'claude-3-opus-20240229',
  },
  [AIProvider.GOOGLE]: {
    summarization: 'gemini-pro',
    analysis: 'gemini-pro',
    embedding: 'embedding-001',
  },
  [AIProvider.COHERE]: {
    summarization: 'command',
    analysis: 'command',
    generation: 'command',
    embedding: 'embed-english-v3.0',
  },
};

// Cost tracking (per 1K tokens)
export const AI_COSTS = {
  [AIProvider.OPENAI]: {
    'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
    'text-embedding-3-small': { input: 0.00002 },
  },
  [AIProvider.ANTHROPIC]: {
    'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
    'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
  },
  [AIProvider.GOOGLE]: {
    'gemini-pro': { input: 0.00025, output: 0.0005 },
    'embedding-001': { input: 0.0001 },
  },
  [AIProvider.COHERE]: {
    'command': { input: 0.0015, output: 0.002 },
    'embed-english-v3.0': { input: 0.0001 },
  },
};

// Request/response schemas
export const summarizeRequestSchema = z.object({
  content: z.string().min(1).max(50000),
  style: z.enum(['brief', 'detailed', 'bullet_points']).default('brief'),
  maxLength: z.number().min(50).max(500).default(150),
  language: z.string().default('en'),
});

export const analyzeRequestSchema = z.object({
  content: z.string().min(1).max(50000),
  analysisTypes: z.array(z.enum(['sentiment', 'topics', 'entities', 'keywords'])),
});

export const generateRequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
  context: z.string().optional(),
  maxTokens: z.number().min(50).max(2000).default(500),
  temperature: z.number().min(0).max(1).default(0.7),
});

// Configuration
export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export function getAIConfig(provider: AIProvider): AIConfig {
  const configs: Record<AIProvider, AIConfig> = {
    [AIProvider.OPENAI]: {
      provider: AIProvider.OPENAI,
      apiKey: process.env.OPENAI_API_KEY || '',
      timeout: 30000,
    },
    [AIProvider.ANTHROPIC]: {
      provider: AIProvider.ANTHROPIC,
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      timeout: 30000,
    },
    [AIProvider.GOOGLE]: {
      provider: AIProvider.GOOGLE,
      apiKey: process.env.GOOGLE_AI_API_KEY || '',
      timeout: 30000,
    },
    [AIProvider.COHERE]: {
      provider: AIProvider.COHERE,
      apiKey: process.env.COHERE_API_KEY || '',
      timeout: 30000,
    },
  };

  return configs[provider];
}

// Rate limiting
export const AI_RATE_LIMITS = {
  [AIProvider.OPENAI]: {
    requestsPerMinute: 60,
    tokensPerMinute: 90000,
  },
  [AIProvider.ANTHROPIC]: {
    requestsPerMinute: 50,
    tokensPerMinute: 100000,
  },
  [AIProvider.GOOGLE]: {
    requestsPerMinute: 60,
    tokensPerMinute: 60000,
  },
  [AIProvider.COHERE]: {
    requestsPerMinute: 100,
    tokensPerMinute: 100000,
  },
};

// Prompts
export const PROMPTS = {
  summarize: {
    brief: `Summarize the following article in 2-3 sentences, capturing the key points:`,
    detailed: `Provide a comprehensive summary of the following article, including main points, supporting details, and conclusions:`,
    bullet_points: `Summarize the following article as a bulleted list of key points:`,
  },
  analyze: {
    sentiment: `Analyze the sentiment of the following text. Return: positive, negative, or neutral with a confidence score:`,
    topics: `Extract the main topics from the following text. Return up to 5 topics:`,
    entities: `Extract named entities (people, organizations, locations) from the following text:`,
    keywords: `Extract the most important keywords from the following text. Return up to 10 keywords:`,
  },
  categorize: `Based on the following article content, suggest up to 3 categories from this list: Technology, Business, Politics, Science, Health, Entertainment, Sports, World News, Opinion. Also suggest up to 5 relevant tags:`,
};