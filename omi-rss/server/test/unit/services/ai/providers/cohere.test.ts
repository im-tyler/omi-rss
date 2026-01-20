import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { CohereProvider } from '../../../../../src/services/ai/providers/cohere';
import { mockCohereClient } from '../../../../mocks/ai-providers';
import {
  SummarizeOptions,
  AnalyzeOptions,
  GenerateOptions,
} from '../../../../../src/services/ai/providers/base';
import { AIProvider } from '../../../../../src/services/ai/config';

// Mock the CohereClient
jest.mock('cohere-ai', () => ({
  CohereClient: jest.fn().mockImplementation(() => mockCohereClient),
}));

describe('CohereProvider', () => {
  let provider: CohereProvider;
  const testApiKey = 'test-cohere-api-key';

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new CohereProvider(testApiKey);
  });

  describe('constructor', () => {
    it('should initialize with correct provider type', () => {
      expect(provider['provider']).toBe(AIProvider.COHERE);
    });

    it('should initialize with API key', () => {
      expect(provider['apiKey']).toBe(testApiKey);
    });
  });

  describe('summarize', () => {
    const testContent = 'This is a long article about artificial intelligence and its impact on society. It discusses various aspects including machine learning, neural networks, and ethical considerations.';
    
    it('should generate summary with brief style', async () => {
      const options: SummarizeOptions = {
        content: testContent,
        style: 'brief',
        maxLength: 100,
        language: 'en',
      };

      const result = await provider.summarize(options);

      expect(mockCohereClient.summarize).toHaveBeenCalledWith({
        text: expect.any(String),
        length: 'short',
        format: 'paragraph',
        extractiveness: 'medium',
        temperature: 0.3,
        additional_command: 'Provide summary in en. Style: brief',
      });

      expect(result).toEqual({
        summary: 'This is a test summary from Cohere.',
        tokensUsed: 100,
        model: 'command',
        provider: AIProvider.COHERE,
      });
    });

    it('should handle different summary lengths', async () => {
      const options: SummarizeOptions = {
        content: testContent,
        style: 'detailed',
        maxLength: 350,
        language: 'en',
      };

      await provider.summarize(options);

      expect(mockCohereClient.summarize).toHaveBeenCalledWith({
        text: expect.any(String),
        length: 'long',
        format: 'paragraph',
        extractiveness: 'medium',
        temperature: 0.3,
        additional_command: 'Provide summary in en. Style: detailed',
      });
    });

    it('should truncate long content', async () => {
      const longContent = 'x'.repeat(5000);
      const options: SummarizeOptions = {
        content: longContent,
        style: 'brief',
        maxLength: 100,
        language: 'en',
      };

      await provider.summarize(options);

      const call = mockCohereClient.summarize.mock.calls[0][0];
      expect(call.text.length).toBeLessThanOrEqual(4000);
    });

    it('should handle API errors', async () => {
      mockCohereClient.summarize.mockRejectedValueOnce(new Error('API Error'));

      const options: SummarizeOptions = {
        content: testContent,
        style: 'brief',
        maxLength: 100,
        language: 'en',
      };

      await expect(provider.summarize(options)).rejects.toThrow('API Error');
    });
  });

  describe('analyze', () => {
    const testContent = 'Apple announced record profits today. The tech giant continues to dominate the market.';

    it('should perform sentiment analysis', async () => {
      mockCohereClient.generate.mockResolvedValueOnce({
        generations: [{
          text: 'Positive sentiment with high confidence. Score: 0.85',
        }],
        meta: {
          billedUnits: {
            inputTokens: 50,
            outputTokens: 20,
          },
        },
      });

      const options: AnalyzeOptions = {
        content: testContent,
        analysisTypes: ['sentiment'],
      };

      const result = await provider.analyze(options);

      expect(result.sentiment).toEqual({
        label: 'positive',
        score: 0.85,
      });
      expect(result.tokensUsed).toBe(70);
    });

    it('should extract entities', async () => {
      mockCohereClient.generate
        .mockResolvedValueOnce({
          generations: [{
            text: 'Analyzing...',
          }],
          meta: { billedUnits: { inputTokens: 50, outputTokens: 20 } },
        })
        .mockResolvedValueOnce({
          generations: [{
            text: `PEOPLE: [Tim Cook, Steve Jobs]
ORGANIZATIONS: [Apple, Microsoft]
LOCATIONS: [Cupertino, Silicon Valley]`,
          }],
          meta: { billedUnits: { inputTokens: 50, outputTokens: 30 } },
        });

      const options: AnalyzeOptions = {
        content: testContent,
        analysisTypes: ['entities'],
      };

      const result = await provider.analyze(options);

      expect(result.entities).toEqual({
        people: ['Tim Cook', 'Steve Jobs'],
        organizations: ['Apple', 'Microsoft'],
        locations: ['Cupertino', 'Silicon Valley'],
      });
    });

    it('should extract topics', async () => {
      mockCohereClient.generate.mockResolvedValueOnce({
        generations: [{
          text: `- Technology
- Business Performance
- Market Dominance
- Financial Results
- Corporate Success`,
        }],
        meta: { billedUnits: { inputTokens: 50, outputTokens: 30 } },
      });

      const options: AnalyzeOptions = {
        content: testContent,
        analysisTypes: ['topics'],
      };

      const result = await provider.analyze(options);

      expect(result.topics).toEqual([
        'Technology',
        'Business Performance',
        'Market Dominance',
        'Financial Results',
        'Corporate Success',
      ]);
    });

    it('should extract keywords', async () => {
      mockCohereClient.generate
        .mockResolvedValueOnce({
          generations: [{
            text: 'Analyzing...',
          }],
          meta: { billedUnits: { inputTokens: 50, outputTokens: 20 } },
        })
        .mockResolvedValueOnce({
          generations: [{
            text: `Apple, profits, tech giant, market, dominance, record, announced`,
          }],
          meta: { billedUnits: { inputTokens: 50, outputTokens: 20 } },
        });

      const options: AnalyzeOptions = {
        content: testContent,
        analysisTypes: ['keywords'],
      };

      const result = await provider.analyze(options);

      expect(result.keywords).toEqual([
        'Apple',
        'profits',
        'tech giant',
        'market',
        'dominance',
        'record',
        'announced',
      ]);
    });

    it('should handle multiple analysis types', async () => {
      const options: AnalyzeOptions = {
        content: testContent,
        analysisTypes: ['sentiment', 'topics'],
      };

      mockCohereClient.generate
        .mockResolvedValueOnce({
          generations: [{
            text: 'Positive sentiment',
          }],
          meta: { billedUnits: { inputTokens: 50, outputTokens: 20 } },
        })
        .mockResolvedValueOnce({
          generations: [{
            text: '- Technology\n- Business',
          }],
          meta: { billedUnits: { inputTokens: 50, outputTokens: 20 } },
        });

      const result = await provider.analyze(options);

      expect(result.sentiment).toBeDefined();
      expect(result.topics).toBeDefined();
      expect(result.tokensUsed).toBeGreaterThan(0);
    });
  });

  describe('generate', () => {
    it('should generate content with prompt', async () => {
      const options: GenerateOptions = {
        prompt: 'Write a brief introduction about RSS feeds',
        maxTokens: 200,
        temperature: 0.7,
      };

      const result = await provider.generate(options);

      expect(mockCohereClient.generate).toHaveBeenCalledWith({
        prompt: options.prompt,
        model: 'command',
        maxTokens: 200,
        temperature: 0.7,
        k: 0,
        p: 0.75,
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
        returnLikelihoods: 'NONE',
      });

      expect(result).toEqual({
        text: 'This is generated text from Cohere.',
        tokensUsed: 100,
        model: 'command',
        provider: AIProvider.COHERE,
      });
    });

    it('should include context when provided', async () => {
      const options: GenerateOptions = {
        prompt: 'Summarize the key points',
        context: 'Article about climate change and renewable energy',
        maxTokens: 300,
        temperature: 0.5,
      };

      await provider.generate(options);

      const expectedPrompt = 'Context: Article about climate change and renewable energy\n\nRequest: Summarize the key points';
      expect(mockCohereClient.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expectedPrompt,
        })
      );
    });

    it('should use default values when not provided', async () => {
      const options: GenerateOptions = {
        prompt: 'Test prompt',
      };

      await provider.generate(options);

      expect(mockCohereClient.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: 1000,
          temperature: 0.7,
        })
      );
    });
  });

  describe('createEmbedding', () => {
    it('should create embeddings for text', async () => {
      const testText = 'This is a test sentence for embedding.';

      const result = await provider.createEmbedding(testText);

      expect(mockCohereClient.embed).toHaveBeenCalledWith({
        texts: [testText],
        model: 'embed-english-v3.0',
        inputType: 'search_document',
      });

      expect(result).toEqual({
        embedding: expect.any(Array),
        tokensUsed: 50,
        model: 'embed-english-v3.0',
        provider: AIProvider.COHERE,
      });
      expect(result.embedding).toHaveLength(1024);
    });

    it('should truncate long text for embeddings', async () => {
      const longText = 'x'.repeat(5000);

      await provider.createEmbedding(longText);

      const call = mockCohereClient.embed.mock.calls[0][0];
      expect(call.texts[0].length).toBeLessThanOrEqual(4096);
    });

    it('should handle embedding errors', async () => {
      mockCohereClient.embed.mockRejectedValueOnce(new Error('Embedding API Error'));

      await expect(provider.createEmbedding('test')).rejects.toThrow('Embedding API Error');
    });
  });

  describe('error handling', () => {
    it('should log and throw errors from summarize', async () => {
      const error = new Error('Cohere API Error');
      mockCohereClient.summarize.mockRejectedValueOnce(error);

      const options: SummarizeOptions = {
        content: 'test',
        style: 'brief',
        maxLength: 100,
        language: 'en',
      };

      await expect(provider.summarize(options)).rejects.toThrow('Cohere API Error');
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      mockCohereClient.generate.mockRejectedValueOnce(rateLimitError);

      const options: GenerateOptions = {
        prompt: 'test',
      };

      await expect(provider.generate(options)).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens when not provided by API', async () => {
      mockCohereClient.embed.mockResolvedValueOnce({
        embeddings: [new Array(1024).fill(0.1)],
        meta: {},
      });

      const result = await provider.createEmbedding('This is a test text');

      expect(result.tokensUsed).toBeGreaterThan(0);
    });
  });
});