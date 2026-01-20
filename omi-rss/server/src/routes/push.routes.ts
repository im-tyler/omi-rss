import { Router } from 'express';
import { pushService } from '../services/push';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Schemas
const registerDeviceSchema = z.object({
  body: z.object({
    deviceId: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(['web', 'mobile', 'extension']),
    pushToken: z.object({
      token: z.string(),
      provider: z.enum(['fcm', 'apns', 'web_push', 'expo']),
      platform: z.enum(['ios', 'android', 'web']),
      deviceId: z.string(),
      appVersion: z.string().optional(),
      osVersion: z.string().optional(),
    }).optional(),
    metadata: z.record(z.any()).optional(),
  }),
});

const updateTokenSchema = z.object({
  body: z.object({
    token: z.string(),
    provider: z.enum(['fcm', 'apns', 'web_push', 'expo']),
    platform: z.enum(['ios', 'android', 'web']),
    appVersion: z.string().optional(),
    osVersion: z.string().optional(),
  }),
});

const subscribeTopicSchema = z.object({
  body: z.object({
    topic: z.string().min(1),
  }),
});

const testNotificationSchema = z.object({
  body: z.object({
    title: z.string(),
    body: z.string(),
    data: z.record(z.any()).optional(),
    icon: z.string().optional(),
    image: z.string().optional(),
  }),
});

const updateSettingsSchema = z.object({
  body: z.object({
    newArticles: z.object({
      enabled: z.boolean(),
      frequency: z.enum(['instant', 'hourly', 'daily']),
      minPriority: z.enum(['low', 'normal', 'high']),
      quietHours: z.object({
        enabled: z.boolean(),
        start: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
        end: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      }),
    }).partial(),
    priceAlerts: z.object({
      enabled: z.boolean(),
      criticalOnly: z.boolean(),
    }).partial(),
    teamUpdates: z.object({
      enabled: z.boolean(),
      mentions: z.boolean(),
      comments: z.boolean(),
      sharedContent: z.boolean(),
    }).partial(),
    system: z.object({
      enabled: z.boolean(),
      maintenance: z.boolean(),
      security: z.boolean(),
      features: z.boolean(),
    }).partial(),
  }),
});

// Routes

// Register device
router.post('/devices', authenticateToken, validate(registerDeviceSchema), async (req, res, next) => {
  try {
    const device = await pushService.registerDevice(req.user!.id, req.body);
    res.status(201).json({ device });
  } catch (error) {
    next(error);
  }
});

// Unregister device
router.delete('/devices/:deviceId', authenticateToken, async (req, res, next) => {
  try {
    await pushService.unregisterDevice(req.user!.id, req.params.deviceId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Update push token
router.put('/devices/:deviceId/token', authenticateToken, validate(updateTokenSchema), async (req, res, next) => {
  try {
    const pushToken = {
      ...req.body,
      deviceId: req.params.deviceId,
    };
    await pushService.updatePushToken(req.user!.id, req.params.deviceId, pushToken);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Subscribe to topic
router.post('/devices/:deviceId/topics', authenticateToken, validate(subscribeTopicSchema), async (req, res, next) => {
  try {
    await pushService.subscribeToTopic(req.user!.id, req.params.deviceId, req.body.topic);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Unsubscribe from topic
router.delete('/devices/:deviceId/topics/:topic', authenticateToken, async (req, res, next) => {
  try {
    await pushService.unsubscribeFromTopic(req.user!.id, req.params.deviceId, req.params.topic);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get push settings
router.get('/settings', authenticateToken, async (req, res, next) => {
  try {
    const settings = await pushService.getPushSettings(req.user!.id);
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

// Update push settings
router.put('/settings', authenticateToken, validate(updateSettingsSchema), async (req, res, next) => {
  try {
    const settings = await pushService.updatePushSettings(req.user!.id, req.body);
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

// Send test notification
router.post('/test', authenticateToken, validate(testNotificationSchema), async (req, res, next) => {
  try {
    const notification = {
      ...req.body,
      data: {
        ...req.body.data,
        type: 'test',
        timestamp: new Date().toISOString(),
      },
    };

    const result = await pushService.sendToUser(req.user!.id, notification, {
      saveToDb: false,
    });

    res.json({ result });
  } catch (error) {
    next(error);
  }
});

// Get Web Push VAPID public key
router.get('/vapid-public-key', async (req, res, next) => {
  try {
    const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
    if (!publicKey) {
      throw new AppError('Web Push not configured', 501);
    }
    res.json({ publicKey });
  } catch (error) {
    next(error);
  }
});

export default router;