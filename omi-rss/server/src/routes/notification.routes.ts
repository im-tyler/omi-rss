import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../database';
import { notifications, notificationPreferences, devices } from '../database/schema';
import { eq, and, desc, or, isNull, sql } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import { getRedis } from '../services/redis';
import { sendPushNotification } from '../services/push';

const router = Router();

// Validation schemas
const notificationPreferencesSchema = z.object({
  newArticles: z.boolean().optional(),
  readingReminders: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  securityAlerts: z.boolean().optional(),
  productUpdates: z.boolean().optional(),
  quietHours: z.object({
    enabled: z.boolean(),
    startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    timezone: z.string(),
  }).optional(),
  emailFrequency: z.enum(['instant', 'daily', 'weekly', 'never']).optional(),
});

const markReadSchema = z.object({
  notificationIds: z.array(z.string().uuid()).optional(),
  markAll: z.boolean().optional(),
});

// Get notifications
router.get('/', async (req, res, next) => {
  try {
    const { page = '1', limit = '20', unreadOnly = 'false' } = req.query;
    const db = getDb();

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    let query = db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, req.user!.id));

    if (unreadOnly === 'true') {
      query = query.where(
        and(
          eq(notifications.userId, req.user!.id),
          isNull(notifications.readAt)
        )
      );
    }

    const userNotifications = await query
      .orderBy(desc(notifications.createdAt))
      .limit(limitNum)
      .offset(offset);

    // Get unread count
    const [{ unreadCount }] = await db
      .select({
        unreadCount: sql<number>`COUNT(*)`,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, req.user!.id),
          isNull(notifications.readAt)
        )
      );

    res.json({
      notifications: userNotifications,
      pagination: {
        page: pageNum,
        limit: limitNum,
        unreadCount: Number(unreadCount),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get notification preferences
router.get('/preferences', async (req, res, next) => {
  try {
    const db = getDb();

    const [preferences] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, req.user!.id))
      .limit(1);

    if (!preferences) {
      // Return default preferences
      res.json({
        preferences: {
          newArticles: true,
          readingReminders: true,
          weeklyDigest: true,
          securityAlerts: true,
          productUpdates: false,
          quietHours: {
            enabled: false,
            startTime: '22:00',
            endTime: '08:00',
            timezone: 'UTC',
          },
          emailFrequency: 'daily',
        },
      });
      return;
    }

    res.json({ preferences });
  } catch (error) {
    next(error);
  }
});

// Update notification preferences
router.put('/preferences', async (req, res, next) => {
  try {
    const data = notificationPreferencesSchema.parse(req.body);
    const db = getDb();

    const updatedPreferences = await db
      .insert(notificationPreferences)
      .values({
        userId: req.user!.id,
        ...data,
      })
      .onConflictDoUpdate({
        target: [notificationPreferences.userId],
        set: {
          ...data,
          updatedAt: new Date(),
        },
      })
      .returning();

    res.json({ preferences: updatedPreferences[0] });
  } catch (error) {
    next(error);
  }
});

// Mark notifications as read
router.post('/mark-read', async (req, res, next) => {
  try {
    const { notificationIds, markAll } = markReadSchema.parse(req.body);
    const db = getDb();

    if (markAll) {
      // Mark all notifications as read
      await db
        .update(notifications)
        .set({
          readAt: new Date(),
        })
        .where(
          and(
            eq(notifications.userId, req.user!.id),
            isNull(notifications.readAt)
          )
        );

      res.json({ message: 'All notifications marked as read' });
    } else if (notificationIds && notificationIds.length > 0) {
      // Mark specific notifications as read
      await db
        .update(notifications)
        .set({
          readAt: new Date(),
        })
        .where(
          and(
            eq(notifications.userId, req.user!.id),
            or(...notificationIds.map(id => eq(notifications.id, id))),
            isNull(notifications.readAt)
          )
        );

      res.json({ 
        message: 'Notifications marked as read',
        count: notificationIds.length,
      });
    } else {
      throw new AppError('Either notificationIds or markAll must be provided', 400);
    }

    // Update unread count in cache
    const redis = getRedis();
    await redis.del(`notifications:unread:${req.user!.id}`);
  } catch (error) {
    next(error);
  }
});

// Delete notifications
router.delete('/:notificationId', async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const db = getDb();

    // Check ownership
    const [notification] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, req.user!.id)
        )
      )
      .limit(1);

    if (!notification) {
      throw new AppError('Notification not found', 404);
    }

    // Delete notification
    await db
      .delete(notifications)
      .where(eq(notifications.id, notificationId));

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Test push notification
router.post('/test-push', async (req, res, next) => {
  try {
    const { deviceId } = z.object({
      deviceId: z.string().uuid(),
    }).parse(req.body);

    const db = getDb();

    // Get device
    const [device] = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.id, deviceId),
          eq(devices.userId, req.user!.id)
        )
      )
      .limit(1);

    if (!device || !device.pushToken) {
      throw new AppError('Device not found or push token not set', 404);
    }

    // Send test notification
    await sendPushNotification({
      token: device.pushToken,
      title: 'Test Notification',
      body: 'This is a test notification from Omi RSS',
      data: {
        type: 'test',
        timestamp: new Date().toISOString(),
      },
    });

    res.json({ message: 'Test notification sent' });
  } catch (error) {
    next(error);
  }
});

// Create notification (internal use)
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  data?: any
) {
  const db = getDb();
  const redis = getRedis();

  // Check user preferences
  const [preferences] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  // Check if this type of notification is enabled
  const typeEnabled = {
    new_articles: preferences?.newArticles !== false,
    reading_reminder: preferences?.readingReminders !== false,
    weekly_digest: preferences?.weeklyDigest !== false,
    security_alert: preferences?.securityAlerts !== false,
    product_update: preferences?.productUpdates !== false,
  }[type] ?? true;

  if (!typeEnabled) {
    return;
  }

  // Check quiet hours
  if (preferences?.quietHours?.enabled) {
    const now = new Date();
    const timezone = preferences.quietHours.timezone || 'UTC';
    // TODO: Implement timezone-aware quiet hours check
  }

  // Create notification
  const [notification] = await db
    .insert(notifications)
    .values({
      userId,
      type,
      title,
      message,
      data,
    })
    .returning();

  // Update unread count cache
  await redis.incr(`notifications:unread:${userId}`);

  // Send push notification to all user devices
  const userDevices = await db
    .select()
    .from(devices)
    .where(
      and(
        eq(devices.userId, userId),
        devices.pushToken !== null
      )
    );

  for (const device of userDevices) {
    if (device.pushToken) {
      try {
        await sendPushNotification({
          token: device.pushToken,
          title,
          body: message,
          data: {
            notificationId: notification.id,
            type,
            ...data,
          },
        });
      } catch (error) {
        console.error('Failed to send push notification:', error);
      }
    }
  }

  // Send real-time notification via WebSocket
  const io = global.io;
  if (io) {
    io.to(`user:${userId}`).emit('notification', notification);
  }

  return notification;
}

export default router;