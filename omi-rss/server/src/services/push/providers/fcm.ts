import * as admin from 'firebase-admin';
import { BasePushProvider } from './base';
import { PushNotification, PushResult, getPushConfig } from '../config';

export class FCMProvider extends BasePushProvider {
  protected providerName = 'FCM';
  private app?: admin.app.App;

  async initialize(): Promise<void> {
    try {
      const config = getPushConfig();
      if (!config.fcm) {
        throw new Error('FCM configuration not found');
      }

      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.fcm.projectId,
          privateKey: config.fcm.privateKey,
          clientEmail: config.fcm.clientEmail,
        }),
      });

      this.logInfo('Initialized successfully');
    } catch (error) {
      this.logError('initialize', error);
      throw error;
    }
  }

  async sendNotification(token: string, notification: PushNotification): Promise<PushResult> {
    await this.ensureInitialized();

    try {
      const message: admin.messaging.Message = {
        token,
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.image,
        },
        data: notification.data ? this.stringifyData(notification.data) : undefined,
        android: {
          priority: notification.priority === 'high' ? 'high' : 'normal',
          ttl: notification.ttl ? notification.ttl * 1000 : undefined,
          collapseKey: notification.collapseId,
          notification: {
            icon: notification.icon,
            color: notification.color,
            sound: notification.sound === true ? 'default' : notification.sound as string,
            tag: notification.tag,
            clickAction: notification.data?.action,
          },
        },
        apns: {
          payload: {
            aps: {
              badge: notification.badge,
              sound: notification.sound === true ? 'default' : notification.sound as string,
              threadId: notification.threadId,
              mutableContent: notification.mutableContent,
              contentAvailable: notification.contentAvailable,
            },
          },
        },
        webpush: notification.actions ? {
          notification: {
            requireInteraction: notification.requiresInteraction,
            actions: notification.actions.map(action => ({
              action: action.action,
              title: action.title,
              icon: action.icon,
            })),
          },
        } : undefined,
      };

      const messageId = await this.app!.messaging().send(message);
      return this.createSuccessResult(messageId);
    } catch (error: any) {
      this.logError('sendNotification', error);
      return this.createErrorResult(
        error.message,
        this.isTokenInvalid(error)
      );
    }
  }

  async sendBatch(tokens: string[], notification: PushNotification): Promise<PushResult[]> {
    await this.ensureInitialized();

    try {
      const messages: admin.messaging.Message[] = tokens.map(token => ({
        token,
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.image,
        },
        data: notification.data ? this.stringifyData(notification.data) : undefined,
        android: {
          priority: notification.priority === 'high' ? 'high' : 'normal',
          ttl: notification.ttl ? notification.ttl * 1000 : undefined,
          collapseKey: notification.collapseId,
          notification: {
            icon: notification.icon,
            color: notification.color,
            sound: notification.sound === true ? 'default' : notification.sound as string,
            tag: notification.tag,
          },
        },
        apns: {
          payload: {
            aps: {
              badge: notification.badge,
              sound: notification.sound === true ? 'default' : notification.sound as string,
              threadId: notification.threadId,
              mutableContent: notification.mutableContent,
              contentAvailable: notification.contentAvailable,
            },
          },
        },
      }));

      const response = await this.app!.messaging().sendAll(messages);
      
      return response.responses.map((resp, index) => {
        if (resp.success) {
          return this.createSuccessResult(resp.messageId!);
        } else {
          const error = resp.error!;
          return this.createErrorResult(
            error.message,
            this.isTokenInvalid(error)
          );
        }
      });
    } catch (error: any) {
      this.logError('sendBatch', error);
      return tokens.map(() => this.createErrorResult(error.message));
    }
  }

  validateToken(token: string): boolean {
    // FCM tokens are typically 152+ characters
    return token.length > 100 && /^[a-zA-Z0-9\-_:]+$/.test(token);
  }

  async subscribeToTopic(token: string, topic: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      await this.app!.messaging().subscribeToTopic(token, topic);
      return true;
    } catch (error) {
      this.logError('subscribeToTopic', error);
      return false;
    }
  }

  async unsubscribeFromTopic(token: string, topic: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      await this.app!.messaging().unsubscribeFromTopic(token, topic);
      return true;
    } catch (error) {
      this.logError('unsubscribeFromTopic', error);
      return false;
    }
  }

  private stringifyData(data: Record<string, any>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return result;
  }
}