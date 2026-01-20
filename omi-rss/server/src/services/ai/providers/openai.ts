import OpenAI from 'openai';
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

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;
  private models = AI_MODELS[AIProvider.OPENAI];

  constructor(apiKey: string, timeout = 30000) {
    super(AIProvider.OPENAI, apiKey, timeout);
    this.client = new OpenAI({
      apiKey,
      timeout,
    });
  }

  async summarize(options: SummarizeOptions): Promise<SummarizeResult> {
    try {
      const prompt = PROMPTS.summarize[options.style];
      const truncatedContent = this.truncateContent(options.content, 3000);
      
      const completion = await this.client.chat.completions.create({
        model: this.models.summarization,
        messages: [
          {
            role: 'system',
            content: `You are a professional summarizer. Provide summaries in ${options.language}. Maximum length: ${options.maxLength} words.`,
          },
          {
            role: 'user',
            content: `${prompt}\n\n${truncatedContent}`,
          },
        ],
        max_tokens: options.maxLength * 2, // Rough conversion
        temperature: 0.3,
      });

      const summary = completion.choices[0]?.message?.content || '';
      const tokensUsed = completion.usage?.total_tokens || 0;

      return {
        summary,
        tokensUsed,
        model: this.models.summarization,
        provider: this.provider,
      };
    } catch (error) {
      logger.error('OpenAI summarization error:', error);
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

      // Perform requested analyses
      for (const analysisType of options.analysisTypes) {
        const prompt = PROMPTS.analyze[analysisType];
        
        const completion = await this.client.chat.completions.create({
          model: this.models.analysis,
          messages: [
            {
              role: 'system',
              content: 'You are an expert content analyst. Provide accurate, structured analysis.',
            },
            {
              role: 'user',
              content: `${prompt}\n\n${truncatedContent}`,
            },
          ],
          max_tokens: 200,
          temperature: 0.1,
        });

        const response = completion.choices[0]?.message?.content || '';
        result.tokensUsed += completion.usage?.total_tokens || 0;

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
            // Simple parsing - in production, use structured output
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
      logger.error('OpenAI analysis error:', error);
      throw error;
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    try {
      const messages: any[] = [
        {
          role: 'system',
          content: 'You are a helpful AI assistant for an RSS reader application.',
        },
      ];

      if (options.context) {
        messages.push({
          role: 'system',
          content: `Context: ${options.context}`,
        });
      }

      messages.push({
        role: 'user',
        content: options.prompt,
      });

      const completion = await this.client.chat.completions.create({
        model: this.models.generation,
        messages,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
      });

      const text = completion.choices[0]?.message?.content || '';
      const tokensUsed = completion.usage?.total_tokens || 0;

      return {
        text,
        tokensUsed,
        model: this.models.generation,
        provider: this.provider,
      };
    } catch (error) {
      logger.error('OpenAI generation error:', error);
      throw error;
    }
  }

  async createEmbedding(text: string): Promise<EmbeddingResult> {
    try {
      const truncatedText = this.truncateContent(text, 8000);
      
      const response = await this.client.embeddings.create({
        model: this.models.embedding,
        input: truncatedText,
      });

      const embedding = response.data[0].embedding;
      const tokensUsed = response.usage?.total_tokens || 0;

      return {
        embedding,
        tokensUsed,
        model: this.models.embedding,
        provider: this.provider,
      };
    } catch (error) {
      logger.error('OpenAI embedding error:', error);
      throw error;
    }
  }
}