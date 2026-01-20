import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { BasePushProvider } from './base';
import { PushNotification, PushResult, getPushConfig } from '../config';

export class ExpoProvider extends BasePushProvider {
  protected providerName = 'Expo';
  private expo?: Expo;

  async initialize(): Promise<void> {
    try {
      const config = getPushConfig();
      
      this.expo = new Expo({
        accessToken: config.expo?.accessToken,
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
      if (!Expo.isExpoPushToken(token)) {
        return this.createErrorResult('Invalid Expo push token', true);
      }

      const message: ExpoPushMessage = {
        to: token,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        sound: notification.sound === true ? 'default' : notification.sound as any,
        badge: notification.badge,
        ttl: notification.ttl,
        priority: notification.priority === 'high' ? 'high' : 'default',
        channelId: notification.data?.channelId,
        categoryId: notification.threadId,
        mutableContent: notification.mutableContent,
      };

      const chunks = this.expo!.chunkPushNotifications([message]);
      const tickets: ExpoPushTicket[] = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await this.expo!.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          this.logError('sendNotification chunk', error);
        }
      }

      if (tickets.length > 0 && tickets[0].status === 'ok') {
        return this.createSuccessResult(tickets[0].id!);
      } else if (tickets.length > 0 && tickets[0].status === 'error') {
        const ticket = tickets[0];
        return this.createErrorResult(
          ticket.message || 'Unknown error',
          ticket.details?.error === 'DeviceNotRegistered'
        );
      }

      return this.createErrorResult('No tickets returned');
    } catch (error: any) {
      this.logError('sendNotification', error);
      return this.createErrorResult(error.message);
    }
  }

  async sendBatch(tokens: string[], notification: PushNotification): Promise<PushResult[]> {
    await this.ensureInitialized();

    try {
      const messages: ExpoPushMessage[] = tokens
        .filter(token => Expo.isExpoPushToken(token))
        .map(token => ({
          to: token,
          title: notification.title,
          body: notification.body,
          data: notification.data,
          sound: notification.sound === true ? 'default' : notification.sound as any,
          badge: notification.badge,
          ttl: notification.ttl,
          priority: notification.priority === 'high' ? 'high' : 'default',
          channelId: notification.data?.channelId,
          categoryId: notification.threadId,
          mutableContent: notification.mutableContent,
        }));

      const chunks = this.expo!.chunkPushNotifications(messages);
      const results: PushResult[] = [];

      for (const chunk of chunks) {
        try {
          const tickets = await this.expo!.sendPushNotificationsAsync(chunk);
          
          results.push(...tickets.map((ticket): PushResult => {
            if (ticket.status === 'ok') {
              return this.createSuccessResult(ticket.id!);
            } else {
              return this.createErrorResult(
                ticket.message || 'Unknown error',
                ticket.details?.error === 'DeviceNotRegistered'
              );
            }
          }));
        } catch (error: any) {
          this.logError('sendBatch chunk', error);
          // Add error results for this chunk
          results.push(...chunk.map(() => this.createErrorResult(error.message)));
        }
      }

      return results;
    } catch (error: any) {
      this.logError('sendBatch', error);
      return tokens.map(() => this.createErrorResult(error.message));
    }
  }

  validateToken(token: string): boolean {
    return Expo.isExpoPushToken(token);
  }

  async subscribeToTopic(token: string, topic: string): Promise<boolean> {
    // Expo doesn't support topics directly
    // Handle topic subscriptions in database
    return true;
  }

  async unsubscribeFromTopic(token: string, topic: string): Promise<boolean> {
    // Expo doesn't support topics directly
    // Handle topic unsubscriptions in database
    return true;
  }

  async getReceipts(receiptIds: string[]): Promise<any> {
    await this.ensureInitialized();

    try {
      const receiptIdChunks = this.expo!.chunkPushNotificationReceiptIds(receiptIds);
      const receipts: any = {};

      for (const chunk of receiptIdChunks) {
        try {
          const chunkReceipts = await this.expo!.getPushNotificationReceiptsAsync(chunk);
          Object.assign(receipts, chunkReceipts);
        } catch (error) {
          this.logError('getReceipts chunk', error);
        }
      }

      return receipts;
    } catch (error) {
      this.logError('getReceipts', error);
      return {};
    }
  }
}