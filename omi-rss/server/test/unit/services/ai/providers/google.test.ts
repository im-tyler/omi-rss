import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { GoogleAIProvider } from '../../../../../src/services/ai/providers/google';
import { mockGoogleGenerativeAI } from '../../../../mocks/ai-providers';
import {
  SummarizeOptions,
  AnalyzeOptions,
  GenerateOptions,
} from '../../../../../src/services/ai/providers/base';
import { AIProvider } from '../../../../../src/services/ai/config';

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => mockGoogleGenerativeAI),
}));

describe('GoogleAIProvider', () => {
  let provider: GoogleAIProvider;
  const testApiKey = 'test-google-api-key';

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new GoogleAIProvider(testApiKey);
  });

  describe('constructor', () => {
    it('should initialize with correct provider type', () => {
      expect(provider['provider']).toBe(AIProvider.GOOGLE);
    });
  });

  describe('summarize', () => {
    const testContent = 'This is a test article about Google AI and its capabilities in natural language processing.';

    it('should generate summary', async () => {
      const options: SummarizeOptions = {
        content: testContent,
        style: 'brief',
        maxLength: 100,
        language: 'en',
      };

      const result = await provider.summarize(options);

      expect(mockGoogleGenerativeAI.getGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-pro',
      });

      expect(result).toMatchObject({
        summary: 'This is a test summary from Google AI.',
        tokensUsed: expect.any(Number),
        model: 'gemini-pro',
        provider: AIProvider.GOOGLE,
      });
    });

    it('should handle different styles', async () => {
      const options: SummarizeOptions = {
        content: testContent,
        style: 'bullet_points',
        maxLength: 200,
        language: 'en',
      };

      await provider.summarize(options);

      const generateContent = mockGoogleGenerativeAI.getGenerativeModel().generateContent;
      expect(generateContent).toHaveBeenCalledWith(
        expect.stringContaining('bullet_points')
      );
    });

    it('should truncate long content', async () => {
      const longContent = 'x'.repeat(4000);
      const options: SummarizeOptions = {
        content: longContent,
        style: 'brief',
        maxLength: 100,
        language: 'en',
      };

      await provider.summarize(options);

      const generateContent = mockGoogleGenerativeAI.getGenerativeModel().generateContent;
      const prompt = generateContent.mock.calls[0][0];
      expect(prompt.length).toBeLessThan(longContent.length + 200);
    });
  });

  describe('analyze', () => {
    const testContent = 'Google announced new AI features. The company is investing heavily in machine learning.';

    it('should perform sentiment analysis', async () => {
      mockGoogleGenerativeAI.getGenerativeModel().generateContent.mockResolvedValueOnce({
        response: {
          text: jest.fn().mockReturnValue('Positive sentiment with 85% confidence'),
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
    });

    it('should extract topics', async () => {
      mockGoogleGenerativeAI.getGenerativeModel().generateContent.mockResolvedValueOnce({
        response: {
          text: jest.fn().mockReturnValue('AI Technology\nMachine Learning\nBusiness Investment'),
        },
      });

      const options: AnalyzeOptions = {
        content: testContent,
        analysisTypes: ['topics'],
      };

      const result = await provider.analyze(options);

      expect(result.topics).toEqual([
        'AI Technology',
        'Machine Learning',
        'Business Investment',
      ]);
    });

    it('should extract entities', async () => {
      mockGoogleGenerativeAI.getGenerativeModel().generateContent.mockResolvedValueOnce({
        response: {
          text: jest.fn().mockReturnValue(`People:
- Sundar Pichai
Organizations:
- Google
- Alphabet
Locations:
- Mountain View`),
        },
      });

      const options: AnalyzeOptions = {
        content: testContent,
        analysisTypes: ['entities'],
      };

      const result = await provider.analyze(options);

      expect(result.entities).toEqual({
        people: ['Sundar Pichai'],
        organizations: ['Google', 'Alphabet'],
        locations: ['Mountain View'],
      });
    });

    it('should handle multiple analysis types', async () => {
      const options: AnalyzeOptions = {
        content: testContent,
        analysisTypes: ['sentiment', 'keywords'],
      };

      mockGoogleGenerativeAI.getGenerativeModel().generateContent
        .mockResolvedValueOnce({
          response: { text: jest.fn().mockReturnValue('Neutral sentiment') },
        })
        .mockResolvedValueOnce({
          response: { text: jest.fn().mockReturnValue('Google, AI, features, investment') },
        });

      const result = await provider.analyze(options);

      expect(result.sentiment).toBeDefined();
      expect(result.keywords).toHaveLength(4);
    });
  });

  describe('generate', () => {
    it('should generate content with configuration', async () => {
      const options: GenerateOptions = {
        prompt: 'Explain Gemini AI',
        maxTokens: 300,
        temperature: 0.5,
      };

      const result = await provider.generate(options);

      expect(mockGoogleGenerativeAI.getGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-pro',
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 300,
        },
      });

      expect(result).toMatchObject({
        text: 'This is a test summary from Google AI.',
        tokensUsed: expect.any(Number),
        model: 'gemini-pro',
        provider: AIProvider.GOOGLE,
      });
    });

    it('should include context', async () => {
      const options: GenerateOptions = {
        prompt: 'What are the benefits?',
        context: 'Discussion about Google Cloud AI services',
        maxTokens: 200,
      };

      await provider.generate(options);

      const generateContent = mockGoogleGenerativeAI.getGenerativeModel().generateContent;
      expect(generateContent).toHaveBeenCalledWith(
        expect.stringContaining('Context: Discussion about Google Cloud AI services')
      );
    });
  });

  describe('createEmbedding', () => {
    it('should create embeddings', async () => {
      const testText = 'Google AI embedding test';

      const result = await provider.createEmbedding(testText);

      expect(result).toMatchObject({
        embedding: expect.any(Array),
        tokensUsed: expect.any(Number),
        model: 'embedding-001',
        provider: AIProvider.GOOGLE,
      });
      expect(result.embedding).toHaveLength(768);
    });

    it('should handle embedding errors', async () => {
      mockGoogleGenerativeAI.getGenerativeModel().embedContent
        .mockRejectedValueOnce(new Error('Embedding error'));

      await expect(provider.createEmbedding('test'))
        .rejects.toThrow('Embedding error');
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      mockGoogleGenerativeAI.getGenerativeModel().generateContent
        .mockRejectedValueOnce(new Error('Gemini API Error'));

      const options: SummarizeOptions = {
        content: 'test',
        style: 'brief',
        maxLength: 100,
        language: 'en',
      };

      await expect(provider.summarize(options))
        .rejects.toThrow('Gemini API Error');
    });
  });
});