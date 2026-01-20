import * as webpush from 'web-push';
import { BasePushProvider } from './base';
import { PushNotification, PushResult, getPushConfig } from '../config';

export class WebPushProvider extends BasePushProvider {
  protected providerName = 'WebPush';

  async initialize(): Promise<void> {
    try {
      const config = getPushConfig();
      if (!config.webPush) {
        throw new Error('Web Push configuration not found');
      }

      webpush.setVapidDetails(
        config.webPush.email,
        config.webPush.publicKey,
        config.webPush.privateKey
      );

      this.logInfo('Initialized successfully');
    } catch (error) {
      this.logError('initialize', error);
      throw error;
    }
  }

  async sendNotification(token: string, notification: PushNotification): Promise<PushResult> {
    await this.ensureInitialized();

    try {
      const subscription = JSON.parse(token);
      
      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        icon: notification.icon || '/icon-192.png',
        badge: notification.badge || '/badge-72.png',
        image: notification.image,
        tag: notification.tag,
        data: notification.data,
        requireInteraction: notification.requiresInteraction,
        actions: notification.actions,
        vibrate: notification.sound ? [200, 100, 200] : undefined,
      });

      const options: webpush.RequestOptions = {
        TTL: notification.ttl || 60 * 60 * 24, // 24 hours default
        urgency: notification.priority === 'high' ? 'high' : 'normal',
        topic: notification.collapseId,
      };

      const response = await webpush.sendNotification(subscription, payload, options);
      
      return this.createSuccessResult(
        response.headers['x-message-id'] || Date.now().toString()
      );
    } catch (error: any) {
      this.logError('sendNotification', error);
      
      // Check if subscription is invalid
      if (error.statusCode === 410 || error.statusCode === 404) {
        return this.createErrorResult('Subscription expired', true);
      }
      
      return this.createErrorResult(error.message);
    }
  }

  async sendBatch(tokens: string[], notification: PushNotification): Promise<PushResult[]> {
    // Web Push doesn't have native batch support, send individually
    const promises = tokens.map(token => this.sendNotification(token, notification));
    return Promise.all(promises);
  }

  validateToken(token: string): boolean {
    try {
      const subscription = JSON.parse(token);
      return !!(
        subscription.endpoint &&
        subscription.keys &&
        subscription.keys.p256dh &&
        subscription.keys.auth
      );
    } catch {
      return false;
    }
  }

  async subscribeToTopic(token: string, topic: string): Promise<boolean> {
    // Topics are handled server-side for web push
    // Store topic subscription in database
    return true;
  }

  async unsubscribeFromTopic(token: string, topic: string): Promise<boolean> {
    // Topics are handled server-side for web push
    // Remove topic subscription from database
    return true;
  }

  generateVAPIDKeys(): { publicKey: string; privateKey: string } {
    return webpush.generateVAPIDKeys();
  }
}