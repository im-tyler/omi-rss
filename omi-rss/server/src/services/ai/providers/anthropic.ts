import Anthropic from '@anthropic-ai/sdk';
import {
  BaseAIProvider,
  SummarizeOptions,
  SummarizeResult,
  AnalyzeOptions,
  AnalyzeResult,
  GenerateOptions,
  GenerateResult,
  EmbeddingResult,
} from './base';
import { AIProvider, AI_MODELS, PROMPTS } from '../config';
import { logger } from '../../../utils/logger';

export class AnthropicProvider extends BaseAIProvider {
  private client: Anthropic;
  private models = AI_MODELS[AIProvider.ANTHROPIC];

  constructor(apiKey: string, timeout = 30000) {
    super(AIProvider.ANTHROPIC, apiKey, timeout);
    this.client = new Anthropic({
      apiKey,
      timeout,
    });
  }

  async summarize(options: SummarizeOptions): Promise<SummarizeResult> {
    try {
      const prompt = PROMPTS.summarize[options.style];
      const truncatedContent = this.truncateContent(options.content, 3000);
      
      const message = await this.client.messages.create({
        model: this.models.summarization,
        max_tokens: options.maxLength * 2,
        temperature: 0.3,
        system: `You are a professional summarizer. Provide summaries in ${options.language}. Maximum length: ${options.maxLength} words.`,
        messages: [
          {
            role: 'user',
            content: `${prompt}\n\n${truncatedContent}`,
          },
        ],
      });

      const summary = message.content[0].type === 'text' ? message.content[0].text : '';
      const tokensUsed = (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0);

      return {
        summary,
        tokensUsed,
        model: this.models.summarization,
        provider: this.provider,
      };
    } catch (error) {
      logger.error('Anthropic summarization error:', error);
      throw error;
    }
  }

  async analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
    try {
      const truncatedContent = this.truncateContent(options.content, 3000);
      const result: AnalyzeResult = {
        tokensUsed: 0,
        model: this.models.analysis,
        provider: this.provider,
      };

      for (const analysisType of options.analysisTypes) {
        const prompt = PROMPTS.analyze[analysisType];
        
        const message = await this.client.messages.create({
          model: this.models.analysis,
          max_tokens: 200,
          temperature: 0.1,
          system: 'You are an expert content analyst. Provide accurate, structured analysis.',
          messages: [
            {
              role: 'user',
              content: `${prompt}\n\n${truncatedContent}`,
            },
          ],
        });

        const response = message.content[0].type === 'text' ? message.content[0].text : '';
        result.tokensUsed += (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0);

        // Parse response based on analysis type
        switch (analysisType) {
          case 'sentiment':
            const sentimentMatch = response.match(/(positive|negative|neutral)/i);
            const scoreMatch = response.match(/(\d+\.?\d*)/);
            if (sentimentMatch) {
              result.sentiment = {
                label: sentimentMatch[1].toLowerCase() as 'positive' | 'negative' | 'neutral',
                score: scoreMatch ? parseFloat(scoreMatch[1]) / 100 : 0.5,
              };
            }
            break;

          case 'topics':
            result.topics = response
              .split(/[\n,]/)
              .map(t => t.trim())
              .filter(t => t.length > 0)
              .slice(0, 5);
            break;

          case 'entities':
            result.entities = {
              people: [],
              organizations: [],
              locations: [],
            };
            const lines = response.split('\n');
            let currentType = '';
            for (const line of lines) {
              if (line.toLowerCase().includes('people') || line.toLowerCase().includes('person')) {
                currentType = 'people';
              } else if (line.toLowerCase().includes('organization')) {
                currentType = 'organizations';
              } else if (line.toLowerCase().includes('location')) {
                currentType = 'locations';
              } else if (currentType && line.trim()) {
                const entity = line.replace(/^[-*•]\s*/, '').trim();
                if (entity && result.entities[currentType as keyof typeof result.entities]) {
                  result.entities[currentType as keyof typeof result.entities].push(entity);
                }
              }
            }
            break;

          case 'keywords':
            result.keywords = response
              .split(/[\n,]/)
              .map(k => k.trim())
              .filter(k => k.length > 0)
              .slice(0, 10);
            break;
        }
      }

      return result;
    } catch (error) {
      logger.error('Anthropic analysis error:', error);
      throw error;
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    try {
      let systemMessage = 'You are a helpful AI assistant for an RSS reader application.';
      if (options.context) {
        systemMessage += `\n\nContext: ${options.context}`;
      }

      const message = await this.client.messages.create({
        model: this.models.generation,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        system: systemMessage,
        messages: [
          {
            role: 'user',
            content: options.prompt,
          },
        ],
      });

      const text = message.content[0].type === 'text' ? message.content[0].text : '';
      const tokensUsed = (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0);

      return {
        text,
        tokensUsed,
        model: this.models.generation,
        provider: this.provider,
      };
    } catch (error) {
      logger.error('Anthropic generation error:', error);
      throw error;
    }
  }

  async createEmbedding(text: string): Promise<EmbeddingResult> {
    // Anthropic doesn't provide embeddings directly
    // In production, you might want to use a different service or fallback to OpenAI
    throw new Error('Embeddings not supported by Anthropic. Use OpenAI or Google for embeddings.');
  }
}