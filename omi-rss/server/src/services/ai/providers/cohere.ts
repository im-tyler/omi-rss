import { CohereClient } from 'cohere-ai';
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

export class CohereProvider extends BaseAIProvider {
  private client: CohereClient;
  private models = AI_MODELS[AIProvider.COHERE];

  constructor(apiKey: string, timeout = 30000) {
    super(AIProvider.COHERE, apiKey, timeout);
    this.client = new CohereClient({
      token: apiKey,
    });
  }

  async summarize(options: SummarizeOptions): Promise<SummarizeResult> {
    try {
      const truncatedContent = this.truncateContent(options.content, 4000);
      
      // Use Cohere's summarize endpoint
      const response = await this.client.summarize({
        text: truncatedContent,
        length: options.maxLength <= 100 ? 'short' : options.maxLength <= 300 ? 'medium' : 'long',
        format: 'paragraph',
        extractiveness: 'medium',
        temperature: 0.3,
        additional_command: `Provide summary in ${options.language}. Style: ${options.style}`,
      });

      const summary = response.summary;
      const tokensUsed = response.meta?.billedUnits?.inputTokens || 0 + 
                        response.meta?.billedUnits?.outputTokens || 0;

      return {
        summary,
        tokensUsed,
        model: this.models.summarization,
        provider: this.provider,
      };
    } catch (error) {
      logger.error('Cohere summarization error:', error);
      throw error;
    }
  }

  async analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
    try {
      const truncatedContent = this.truncateContent(options.content, 4000);
      const result: AnalyzeResult = {
        tokensUsed: 0,
        model: this.models.analysis,
        provider: this.provider,
      };

      for (const analysisType of options.analysisTypes) {
        const prompt = PROMPTS.analyze[analysisType];
        const fullPrompt = `${prompt}\n\nContent: ${truncatedContent}\n\nProvide structured analysis:`;
        
        const response = await this.client.generate({
          prompt: fullPrompt,
          model: this.models.analysis,
          maxTokens: 500,
          temperature: 0.3,
          k: 0,
          p: 0.75,
        });

        const responseText = response.generations[0].text;
        result.tokensUsed += response.meta?.billedUnits?.inputTokens || 0;
        result.tokensUsed += response.meta?.billedUnits?.outputTokens || 0;

        // Parse response based on analysis type
        switch (analysisType) {
          case 'sentiment':
            const sentimentMatch = responseText.match(/(positive|negative|neutral)/i);
            const scoreMatch = responseText.match(/score[:\s]+(\d+\.?\d*)/i);
            if (sentimentMatch) {
              result.sentiment = {
                label: sentimentMatch[1].toLowerCase() as 'positive' | 'negative' | 'neutral',
                score: scoreMatch ? parseFloat(scoreMatch[1]) : 0.5,
              };
            }
            break;

          case 'topics':
            result.topics = responseText
              .split('\n')
              .filter(line => line.trim().match(/^[-*•]\s*.+/))
              .map(line => line.replace(/^[-*•]\s*/, '').trim())
              .filter(t => t.length > 0)
              .slice(0, 5);
            break;

          case 'entities':
            result.entities = {
              people: [],
              organizations: [],
              locations: [],
            };
            
            // Use Cohere's classify endpoint for better entity extraction
            const entityResponse = await this.client.generate({
              prompt: `Extract named entities from this text. Format:
PEOPLE: [list names]
ORGANIZATIONS: [list organizations]
LOCATIONS: [list locations]

Text: ${truncatedContent.substring(0, 1000)}`,
              model: this.models.analysis,
              maxTokens: 200,
              temperature: 0.1,
            });
            
            const entityText = entityResponse.generations[0].text;
            const peopleMatch = entityText.match(/PEOPLE:\s*\[([^\]]+)\]/);
            const orgsMatch = entityText.match(/ORGANIZATIONS:\s*\[([^\]]+)\]/);
            const locsMatch = entityText.match(/LOCATIONS:\s*\[([^\]]+)\]/);
            
            if (peopleMatch) {
              result.entities.people = peopleMatch[1].split(',').map(e => e.trim());
            }
            if (orgsMatch) {
              result.entities.organizations = orgsMatch[1].split(',').map(e => e.trim());
            }
            if (locsMatch) {
              result.entities.locations = locsMatch[1].split(',').map(e => e.trim());
            }
            break;

          case 'keywords':
            // Use Cohere's keyword extraction capabilities
            const keywordResponse = await this.client.generate({
              prompt: `Extract the 10 most important keywords from this text: ${truncatedContent.substring(0, 1000)}`,
              model: this.models.analysis,
              maxTokens: 100,
              temperature: 0.2,
            });
            
            result.keywords = keywordResponse.generations[0].text
              .split(/[\n,]/)
              .map(k => k.trim())
              .filter(k => k.length > 0 && !k.includes(':'))
              .slice(0, 10);
            break;
        }
      }

      return result;
    } catch (error) {
      logger.error('Cohere analysis error:', error);
      throw error;
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    try {
      let prompt = options.prompt;
      if (options.context) {
        prompt = `Context: ${options.context}\n\nRequest: ${prompt}`;
      }

      const response = await this.client.generate({
        prompt,
        model: this.models.summarization,
        maxTokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        k: 0,
        p: 0.75,
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
        returnLikelihoods: 'NONE',
      });

      const text = response.generations[0].text;
      const tokensUsed = (response.meta?.billedUnits?.inputTokens || 0) +
                        (response.meta?.billedUnits?.outputTokens || 0);

      return {
        text,
        tokensUsed,
        model: this.models.summarization,
        provider: this.provider,
      };
    } catch (error) {
      logger.error('Cohere generation error:', error);
      throw error;
    }
  }

  async createEmbedding(text: string): Promise<EmbeddingResult> {
    try {
      const truncatedText = this.truncateContent(text, 4096);
      
      const response = await this.client.embed({
        texts: [truncatedText],
        model: this.models.embedding,
        inputType: 'search_document',
      });

      const embedding = response.embeddings[0];
      const tokensUsed = response.meta?.billedUnits?.inputTokens || this.estimateTokens(truncatedText);

      return {
        embedding,
        tokensUsed,
        model: this.models.embedding,
        provider: this.provider,
      };
    } catch (error) {
      logger.error('Cohere embedding error:', error);
      throw error;
    }
  }
}