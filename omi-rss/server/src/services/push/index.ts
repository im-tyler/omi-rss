import { getDb } from '../../database';
import { users, devices, notifications } from '../../database/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { logger } from '../../utils/logger';
import { notificationQueue } from '../../workers';
import { 
  PushProviders, 
  PushNotification, 
  PushResult, 
  PushToken,
  PushTopics,
  DEFAULT_PUSH_SETTINGS,
} from './config';
import { FCMProvider } from './providers/fcm';
import { WebPushProvider } from './providers/web-push';
import { ExpoProvider } from './providers/expo';
import { BasePushProvider } from './providers/base';
import { AppError } from '../../middleware/errorHandler';

export class PushService {
  private providers: Map<string, BasePushProvider> = new Map();
  private initialized = false;

  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize FCM
      if (process.env.FCM_PROJECT_ID) {
        const fcm = new FCMProvider();
        await fcm.initialize();
        this.providers.set(PushProviders.FCM, fcm);
      }

      // Initialize Web Push
      if (process.env.WEB_PUSH_PUBLIC_KEY) {
        const webPush = new WebPushProvider();
        await webPush.initialize();
        this.providers.set(PushProviders.WEB_PUSH, webPush);
      }

      // Initialize Expo
      if (process.env.EXPO_ACCESS_TOKEN) {
        const expo = new ExpoProvider();
        await expo.initialize();
        this.providers.set(PushProviders.EXPO, expo);
      }

      this.initialized = true;
      logger.info('Push service initialized with providers:', Array.from(this.providers.keys()));
    } catch (error) {
      logger.error('Failed to initialize push service:', error);
      throw error;
    }
  }

  // Device & Token Management
  async registerDevice(userId: string, deviceData: {
    deviceId: string;
    name: string;
    type: 'web' | 'mobile' | 'extension';
    pushToken?: PushToken;
    metadata?: any;
  }) {
    const db = getDb();

    // Update or insert device
    const [device] = await db
      .insert(devices)
      .values({
        userId,
        deviceId: deviceData.deviceId,
        name: deviceData.name,
        type: deviceData.type,
        metadata: {
          ...deviceData.metadata,
          pushToken: deviceData.pushToken,
        },
      })
      .onConflictDoUpdate({
        target: devices.deviceId,
        set: {
          name: deviceData.name,
          metadata: {
            ...deviceData.metadata,
            pushToken: deviceData.pushToken,
          },
          updatedAt: new Date(),
        },
      })
      .returning();

    // Subscribe to default topics
    if (deviceData.pushToken) {
      await this.subscribeToUserTopics(userId, deviceData.pushToken);
    }

    return device;
  }

  async unregisterDevice(userId: string, deviceId: string) {
    const db = getDb();

    await db
      .update(devices)
      .set({ isActive: false })
      .where(
        and(
          eq(devices.userId, userId),
          eq(devices.deviceId, deviceId)
        )
      );
  }

  async updatePushToken(userId: string, deviceId: string, pushToken: PushToken) {
    const db = getDb();

    const [device] = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.userId, userId),
          eq(devices.deviceId, deviceId)
        )
      )
      .limit(1);

    if (!device) {
      throw new AppError('Device not found', 404);
    }

    // Validate token
    const provider = this.providers.get(pushToken.provider);
    if (!provider || !provider.validateToken(pushToken.token)) {
      throw new AppError('Invalid push token', 400);
    }

    // Update token
    await db
      .update(devices)
      .set({
        metadata: {
          ...device.metadata,
          pushToken,
        },
        updatedAt: new Date(),
      })
      .where(eq(devices.id, device.id));

    // Subscribe to user topics
    await this.subscribeToUserTopics(userId, pushToken);

    return true;
  }

  // Notification Sending
  async sendToUser(userId: string, notification: PushNotification, options?: {
    saveToDb?: boolean;
    channels?: string[];
    deviceTypes?: string[];
  }) {
    const db = getDb();

    // Get user's push settings
    const [user] = await db
      .select({ settings: users.settings })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || !this.shouldSendNotification(user.settings, notification)) {
      return { sent: 0, failed: 0 };
    }

    // Get active devices with push tokens
    const userDevices = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.userId, userId),
          eq(devices.isActive, true)
        )
      );

    const results: PushResult[] = [];

    for (const device of userDevices) {
      if (!device.metadata?.pushToken) continue;
      if (options?.deviceTypes && !options.deviceTypes.includes(device.type)) continue;

      const pushToken = device.metadata.pushToken as PushToken;
      const provider = this.providers.get(pushToken.provider);

      if (provider) {
        try {
          const result = await provider.sendNotification(
            pushToken.token,
            notification
          );
          results.push(result);

          if (result.invalidToken) {
            // Remove invalid token
            await this.handleInvalidToken(device.id);
          }
        } catch (error) {
          logger.error('Failed to send push notification:', error);
          results.push({ success: false, error: 'Send failed' });
        }
      }
    }

    // Save to database if requested
    if (options?.saveToDb !== false) {
      await this.saveNotification(userId, notification, {
        channels: options?.channels || ['push'],
        results,
      });
    }

    const sent = results.filter(r => r.success).length;
    const failed = results.length - sent;

    return { sent, failed, results };
  }

  async sendToUsers(userIds: string[], notification: PushNotification) {
    const results = await Promise.all(
      userIds.map(userId => this.sendToUser(userId, notification))
    );

    return {
      sent: results.reduce((sum, r) => sum + r.sent, 0),
      failed: results.reduce((sum, r) => sum + r.failed, 0),
    };
  }

  async sendToTopic(topic: string, notification: PushNotification) {
    // Get all devices subscribed to topic
    const db = getDb();
    
    const subscribedDevices = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.isActive, true),
          sql`${devices.metadata}->>'topics' ? ${topic}`
        )
      );

    const results: PushResult[] = [];

    // Group by provider for batch sending
    const tokensByProvider = new Map<string, string[]>();

    for (const device of subscribedDevices) {
      const pushToken = device.metadata?.pushToken as PushToken;
      if (!pushToken) continue;

      const tokens = tokensByProvider.get(pushToken.provider) || [];
      tokens.push(pushToken.token);
      tokensByProvider.set(pushToken.provider, tokens);
    }

    // Send batch notifications
    for (const [providerName, tokens] of tokensByProvider) {
      const provider = this.providers.get(providerName);
      if (provider) {
        try {
          const batchResults = await provider.sendBatch(tokens, notification);
          results.push(...batchResults);
        } catch (error) {
          logger.error(`Failed to send batch to ${providerName}:`, error);
        }
      }
    }

    const sent = results.filter(r => r.success).length;
    const failed = results.length - sent;

    return { sent, failed, topic };
  }

  // Topic Management
  async subscribeToTopic(userId: string, deviceId: string, topic: string) {
    const db = getDb();

    const [device] = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.userId, userId),
          eq(devices.deviceId, deviceId)
        )
      )
      .limit(1);

    if (!device || !device.metadata?.pushToken) {
      throw new AppError('Device or push token not found', 404);
    }

    const pushToken = device.metadata.pushToken as PushToken;
    const provider = this.providers.get(pushToken.provider);

    if (provider) {
      await provider.subscribeToTopic(pushToken.token, topic);
    }

    // Update device metadata
    const topics = device.metadata.topics || [];
    if (!topics.includes(topic)) {
      topics.push(topic);
      await db
        .update(devices)
        .set({
          metadata: {
            ...device.metadata,
            topics,
          },
        })
        .where(eq(devices.id, device.id));
    }

    return true;
  }

  async unsubscribeFromTopic(userId: string, deviceId: string, topic: string) {
    const db = getDb();

    const [device] = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.userId, userId),
          eq(devices.deviceId, deviceId)
        )
      )
      .limit(1);

    if (!device || !device.metadata?.pushToken) {
      throw new AppError('Device or push token not found', 404);
    }

    const pushToken = device.metadata.pushToken as PushToken;
    const provider = this.providers.get(pushToken.provider);

    if (provider) {
      await provider.unsubscribeFromTopic(pushToken.token, topic);
    }

    // Update device metadata
    const topics = device.metadata.topics || [];
    const index = topics.indexOf(topic);
    if (index > -1) {
      topics.splice(index, 1);
      await db
        .update(devices)
        .set({
          metadata: {
            ...device.metadata,
            topics,
          },
        })
        .where(eq(devices.id, device.id));
    }

    return true;
  }

  // Settings Management
  async updatePushSettings(userId: string, settings: any) {
    const db = getDb();

    await db
      .update(users)
      .set({
        settings: sql`${users.settings} || ${JSON.stringify({ push: settings })}::jsonb`,
      })
      .where(eq(users.id, userId));

    return settings;
  }

  async getPushSettings(userId: string) {
    const db = getDb();

    const [user] = await db
      .select({ settings: users.settings })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user?.settings?.push || DEFAULT_PUSH_SETTINGS;
  }

  // Helper Methods
  private async subscribeToUserTopics(userId: string, pushToken: PushToken) {
    const provider = this.providers.get(pushToken.provider);
    if (!provider) return;

    // Subscribe to user-specific topic
    await provider.subscribeToTopic(pushToken.token, `user_${userId}`);

    // Subscribe to default topics based on settings
    const settings = await this.getPushSettings(userId);
    
    if (settings.newArticles?.enabled) {
      await provider.subscribeToTopic(pushToken.token, PushTopics.NEW_ARTICLES);
    }
    if (settings.priceAlerts?.enabled) {
      await provider.subscribeToTopic(pushToken.token, PushTopics.PRICE_ALERTS);
    }
    if (settings.teamUpdates?.enabled) {
      await provider.subscribeToTopic(pushToken.token, PushTopics.TEAM_UPDATES);
    }
  }

  private shouldSendNotification(userSettings: any, notification: PushNotification): boolean {
    const pushSettings = userSettings?.push || DEFAULT_PUSH_SETTINGS;

    // Check quiet hours
    if (pushSettings.newArticles?.quietHours?.enabled) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const { start, end } = pushSettings.newArticles.quietHours;

      if (start <= end) {
        if (currentTime >= start && currentTime <= end) return false;
      } else {
        if (currentTime >= start || currentTime <= end) return false;
      }
    }

    // Check notification type settings
    const notificationType = notification.data?.type;
    switch (notificationType) {
      case 'new_articles':
        return pushSettings.newArticles?.enabled !== false;
      case 'price_alert':
        return pushSettings.priceAlerts?.enabled !== false;
      case 'team_update':
        return pushSettings.teamUpdates?.enabled !== false;
      default:
        return true;
    }
  }

  private async handleInvalidToken(deviceId: string) {
    const db = getDb();

    await db
      .update(devices)
      .set({
        isActive: false,
        metadata: sql`${devices.metadata} - 'pushToken'`,
      })
      .where(eq(devices.id, deviceId));
  }

  private async saveNotification(
    userId: string,
    notification: PushNotification,
    meta: { channels: string[]; results: PushResult[] }
  ) {
    const db = getDb();

    await db
      .insert(notifications)
      .values({
        userId,
        type: notification.data?.type || 'general',
        title: notification.title,
        body: notification.body,
        data: notification.data,
        channels: meta.channels,
        status: meta.results.some(r => r.success) ? 'sent' : 'failed',
        sentAt: new Date(),
      });
  }

  // Queue job for background processing
  async queueNotification(data: {
    userId?: string;
    userIds?: string[];
    topic?: string;
    notification: PushNotification;
    delay?: number;
  }) {
    await notificationQueue.add('send-push', data, {
      delay: data.delay,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });
  }
}

export const pushService = new PushService();