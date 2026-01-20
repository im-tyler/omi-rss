import { jest } from '@jest/globals';

export const mockOpenAIClient = {
  chat: {
    completions: {
      create: jest.fn().mockResolvedValue({
        choices: [{
          message: {
            content: 'This is a test summary from OpenAI.',
          },
        }],
        usage: {
          total_tokens: 100,
        },
      }),
    },
  },
  embeddings: {
    create: jest.fn().mockResolvedValue({
      data: [{
        embedding: new Array(1536).fill(0.1),
      }],
      usage: {
        total_tokens: 50,
      },
    }),
  },
};

export const mockAnthropicClient = {
  messages: {
    create: jest.fn().mockResolvedValue({
      content: [{
        text: 'This is a test summary from Anthropic.',
      }],
      usage: {
        input_tokens: 50,
        output_tokens: 50,
      },
    }),
  },
};

export const mockGoogleGenerativeAI = {
  getGenerativeModel: jest.fn().mockReturnValue({
    generateContent: jest.fn().mockResolvedValue({
      response: {
        text: jest.fn().mockReturnValue('This is a test summary from Google AI.'),
      },
    }),
    embedContent: jest.fn().mockResolvedValue({
      embedding: {
        values: new Array(768).fill(0.1),
      },
    }),
  }),
};

export const mockCohereClient = {
  summarize: jest.fn().mockResolvedValue({
    summary: 'This is a test summary from Cohere.',
    meta: {
      billedUnits: {
        inputTokens: 50,
        outputTokens: 50,
      },
    },
  }),
  generate: jest.fn().mockResolvedValue({
    generations: [{
      text: 'This is generated text from Cohere.',
    }],
    meta: {
      billedUnits: {
        inputTokens: 50,
        outputTokens: 50,
      },
    },
  }),
  embed: jest.fn().mockResolvedValue({
    embeddings: [new Array(1024).fill(0.1)],
    meta: {
      billedUnits: {
        inputTokens: 50,
      },
    },
  }),
};

// Mock the actual SDK imports
jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => mockOpenAIClient),
}));

jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => mockAnthropicClient),
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => mockGoogleGenerativeAI),
}));

jest.mock('cohere-ai', () => ({
  CohereClient: jest.fn().mockImplementation(() => mockCohereClient),
}));