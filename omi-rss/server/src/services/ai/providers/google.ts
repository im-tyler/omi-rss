import { GoogleGenerativeAI } from '@google/generative-ai';
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

export class GoogleAIProvider extends BaseAIProvider {
  private client: GoogleGenerativeAI;
  private models = AI_MODELS[AIProvider.GOOGLE];

  constructor(apiKey: string, timeout = 30000) {
    super(AIProvider.GOOGLE, apiKey, timeout);
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async summarize(options: SummarizeOptions): Promise<SummarizeResult> {
    try {
      const model = this.client.getGenerativeModel({ model: this.models.summarization });
      const prompt = PROMPTS.summarize[options.style];
      const truncatedContent = this.truncateContent(options.content, 3000);
      
      const fullPrompt = `You are a professional summarizer. Provide summaries in ${options.language}. Maximum length: ${options.maxLength} words.\n\n${prompt}\n\n${truncatedContent}`;
      
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const summary = response.text();
      
      // Estimate tokens (Google doesn't provide token count directly)
      const tokensUsed = this.estimateTokens(fullPrompt + summary);

      return {
        summary,
        tokensUsed,
        model: this.models.summarization,
        provider: this.provider,
      };
    } catch (error) {
      logger.error('Google AI summarization error:', error);
      throw error;
    }
  }

  async analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
    try {
      const model = this.client.getGenerativeModel({ model: this.models.analysis });
      const truncatedContent = this.truncateContent(options.content, 3000);
      const result: AnalyzeResult = {
        tokensUsed: 0,
        model: this.models.analysis,
        provider: this.provider,
      };

      for (const analysisType of options.analysisTypes) {
        const prompt = PROMPTS.analyze[analysisType];
        const fullPrompt = `You are an expert content analyst. Provide accurate, structured analysis.\n\n${prompt}\n\n${truncatedContent}`;
        
        const genResult = await model.generateContent(fullPrompt);
        const response = await genResult.response;
        const responseText = response.text();
        
        result.tokensUsed += this.estimateTokens(fullPrompt + responseText);

        // Parse response based on analysis type
        switch (analysisType) {
          case 'sentiment':
            const sentimentMatch = responseText.match(/(positive|negative|neutral)/i);
            const scoreMatch = responseText.match(/(\d+\.?\d*)/);
            if (sentimentMatch) {
              result.sentiment = {
                label: sentimentMatch[1].toLowerCase() as 'positive' | 'negative' | 'neutral',
                score: scoreMatch ? parseFloat(scoreMatch[1]) / 100 : 0.5,
              };
            }
            break;

          case 'topics':
            result.topics = responseText
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
            const lines = responseText.split('\n');
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
            result.keywords = responseText
              .split(/[\n,]/)
              .map(k => k.trim())
              .filter(k => k.length > 0)
              .slice(0, 10);
            break;
        }
      }

      return result;
    } catch (error) {
      logger.error('Google AI analysis error:', error);
      throw error;
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    try {
      const model = this.client.getGenerativeModel({ 
        model: this.models.summarization,
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
        },
      });

      let prompt = 'You are a helpful AI assistant for an RSS reader application.\n\n';
      if (options.context) {
        prompt += `Context: ${options.context}\n\n`;
      }
      prompt += options.prompt;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const tokensUsed = this.estimateTokens(prompt + text);

      return {
        text,
        tokensUsed,
        model: this.models.summarization,
        provider: this.provider,
      };
    } catch (error) {
      logger.error('Google AI generation error:', error);
      throw error;
    }
  }

  async createEmbedding(text: string): Promise<EmbeddingResult> {
    try {
      // Google's embedding model requires different setup
      const model = this.client.getGenerativeModel({ model: this.models.embedding });
      const truncatedText = this.truncateContent(text, 8000);
      
      // Note: This is a placeholder - Google's embedding API works differently
      // In production, you'd use the proper embedding endpoint
      const result = await model.embedContent(truncatedText);
      const embedding = result.embedding.values;
      
      const tokensUsed = this.estimateTokens(truncatedText);

      return {
        embedding,
        tokensUsed,
        model: this.models.embedding,
        provider: this.provider,
      };
    } catch (error) {
      logger.error('Google AI embedding error:', error);
      throw error;
    }
  }
}