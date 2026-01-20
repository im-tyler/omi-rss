import { PushNotification, PushResult, PushToken } from '../config';
import { logger } from '../../../utils/logger';

export abstract class BasePushProvider {
  protected abstract providerName: string;
  protected isInitialized: boolean = false;

  abstract initialize(): Promise<void>;
  abstract sendNotification(token: string, notification: PushNotification): Promise<PushResult>;
  abstract sendBatch(tokens: string[], notification: PushNotification): Promise<PushResult[]>;
  abstract validateToken(token: string): boolean;
  abstract subscribeToTopic(token: string, topic: string): Promise<boolean>;
  abstract unsubscribeFromTopic(token: string, topic: string): Promise<boolean>;

  protected logError(method: string, error: any): void {
    logger.error(`[${this.providerName}] ${method} error:`, error);
  }

  protected logInfo(message: string): void {
    logger.info(`[${this.providerName}] ${message}`);
  }

  protected async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
      this.isInitialized = true;
    }
  }

  protected createSuccessResult(messageId: string): PushResult {
    return {
      success: true,
      messageId,
    };
  }

  protected createErrorResult(error: string, invalidToken = false): PushResult {
    return {
      success: false,
      error,
      invalidToken,
    };
  }

  protected isTokenInvalid(error: any): boolean {
    const invalidTokenErrors = [
      'invalid registration token',
      'not registered',
      'invalid token',
      'unregistered',
      'bad device token',
      'invalid apns token',
    ];

    const errorMessage = error.message?.toLowerCase() || '';
    return invalidTokenErrors.some(msg => errorMessage.includes(msg));
  }

  protected shouldRetry(error: any): boolean {
    const retryableErrors = [
      'unavailable',
      'internal server error',
      'timeout',
      'service unavailable',
      'too many requests',
    ];

    const errorMessage = error.message?.toLowerCase() || '';
    return retryableErrors.some(msg => errorMessage.includes(msg));
  }
}