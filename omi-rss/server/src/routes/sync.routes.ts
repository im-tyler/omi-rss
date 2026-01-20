import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../database';
import { devices, syncLogs, feeds, folders, userArticleStates } from '../database/schema';
import { eq, and, gt, desc } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';
import { getRedis } from '../services/redis';

const router = Router();

// Validation schemas
const registerDeviceSchema = z.object({
  name: z.string().min(1).max(100),
  platform: z.string(),
  osVersion: z.string().optional(),
  appVersion: z.string(),
  pushToken: z.string().optional(),
});

const syncDataSchema = z.object({
  lastSyncTimestamp: z.string().datetime().optional(),
  changes: z.object({
    feeds: z.array(z.object({
      id: z.string().uuid(),
      action: z.enum(['create', 'update', 'delete']),
      data: z.any().optional(),
      timestamp: z.string().datetime(),
    })).optional(),
    folders: z.array(z.object({
      id: z.string().uuid(),
      action: z.enum(['create', 'update', 'delete']),
      data: z.any().optional(),
      timestamp: z.string().datetime(),
    })).optional(),
    articleStates: z.array(z.object({
      articleId: z.string().uuid(),
      isRead: z.boolean().optional(),
      isStarred: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      timestamp: z.string().datetime(),
    })).optional(),
  }),
});

// Get all devices
router.get('/devices', async (req, res, next) => {
  try {
    const db = getDb();

    const userDevices = await db
      .select()
      .from(devices)
      .where(eq(devices.userId, req.user!.id))
      .orderBy(desc(devices.lastSeenAt));

    res.json({ devices: userDevices });
  } catch (error) {
    next(error);
  }
});

// Register/update device
router.post('/devices', async (req, res, next) => {
  try {
    const data = registerDeviceSchema.parse(req.body);
    const db = getDb();

    // Generate device ID
    const deviceId = uuidv4();

    // Upsert device
    const [device] = await db
      .insert(devices)
      .values({
        id: deviceId,
        userId: req.user!.id,
        ...data,
        lastSeenAt: new Date(),
        lastSyncAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [devices.id],
        set: {
          ...data,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    res.status(201).json({ device });
  } catch (error) {
    next(error);
  }
});

// Delete device
router.delete('/devices/:deviceId', async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const db = getDb();

    // Check ownership
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

    if (!device) {
      throw new AppError('Device not found', 404);
    }

    // Delete device
    await db
      .delete(devices)
      .where(eq(devices.id, deviceId));

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Get sync status
router.get('/status', async (req, res, next) => {
  try {
    const db = getDb();
    const redis = getRedis();
    const deviceId = req.headers['x-device-id'] as string;

    if (!deviceId) {
      throw new AppError('Device ID required', 400);
    }

    // Update device last seen
    await db
      .update(devices)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(devices.id, deviceId),
          eq(devices.userId, req.user!.id)
        )
      );

    // Get last sync log
    const [lastSync] = await db
      .select()
      .from(syncLogs)
      .where(
        and(
          eq(syncLogs.userId, req.user!.id),
          eq(syncLogs.deviceId, deviceId),
          eq(syncLogs.status, 'completed')
        )
      )
      .orderBy(desc(syncLogs.createdAt))
      .limit(1);

    // Check if there are pending changes
    const pendingChangesKey = `sync:pending:${req.user!.id}`;
    const hasPendingChanges = await redis.exists(pendingChangesKey);

    res.json({
      lastSyncAt: lastSync?.createdAt || null,
      hasPendingChanges: hasPendingChanges === 1,
      deviceId,
    });
  } catch (error) {
    next(error);
  }
});

// Sync data
router.post('/sync', async (req, res, next) => {
  try {
    const data = syncDataSchema.parse(req.body);
    const db = getDb();
    const redis = getRedis();
    const deviceId = req.headers['x-device-id'] as string;

    if (!deviceId) {
      throw new AppError('Device ID required', 400);
    }

    // Create sync log
    const [syncLog] = await db
      .insert(syncLogs)
      .values({
        userId: req.user!.id,
        deviceId,
        status: 'in_progress',
        changes: data.changes as any,
      })
      .returning();

    try {
      // Apply incoming changes
      if (data.changes.feeds) {
        for (const change of data.changes.feeds) {
          await applyFeedChange(db, req.user!.id, change);
        }
      }

      if (data.changes.folders) {
        for (const change of data.changes.folders) {
          await applyFolderChange(db, req.user!.id, change);
        }
      }

      if (data.changes.articleStates) {
        for (const change of data.changes.articleStates) {
          await applyArticleStateChange(db, req.user!.id, change);
        }
      }

      // Get changes since last sync
      const lastSyncTime = data.lastSyncTimestamp 
        ? new Date(data.lastSyncTimestamp)
        : new Date(0);

      const changedFeeds = await db
        .select()
        .from(feeds)
        .where(
          and(
            eq(feeds.userId, req.user!.id),
            gt(feeds.updatedAt, lastSyncTime)
          )
        );

      const changedFolders = await db
        .select()
        .from(folders)
        .where(
          and(
            eq(folders.userId, req.user!.id),
            gt(folders.updatedAt, lastSyncTime)
          )
        );

      const changedArticleStates = await db
        .select()
        .from(userArticleStates)
        .where(
          and(
            eq(userArticleStates.userId, req.user!.id),
            gt(userArticleStates.updatedAt, lastSyncTime)
          )
        );

      // Update device last sync
      await db
        .update(devices)
        .set({
          lastSyncAt: new Date(),
          lastSeenAt: new Date(),
        })
        .where(eq(devices.id, deviceId));

      // Update sync log
      await db
        .update(syncLogs)
        .set({
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(syncLogs.id, syncLog.id));

      // Clear pending changes flag
      const pendingChangesKey = `sync:pending:${req.user!.id}`;
      await redis.del(pendingChangesKey);

      // Notify other devices via WebSocket
      const io = req.app.get('io');
      io.to(`user:${req.user!.id}`).emit('sync:changes', {
        timestamp: new Date().toISOString(),
        deviceId,
      });

      res.json({
        syncId: syncLog.id,
        timestamp: new Date().toISOString(),
        changes: {
          feeds: changedFeeds,
          folders: changedFolders,
          articleStates: changedArticleStates,
        },
      });
    } catch (error) {
      // Update sync log with error
      await db
        .update(syncLogs)
        .set({
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date(),
        })
        .where(eq(syncLogs.id, syncLog.id));

      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Get sync history
router.get('/history', async (req, res, next) => {
  try {
    const db = getDb();
    const deviceId = req.headers['x-device-id'] as string;

    let query = db
      .select({
        id: syncLogs.id,
        deviceId: syncLogs.deviceId,
        status: syncLogs.status,
        changes: syncLogs.changes,
        error: syncLogs.error,
        createdAt: syncLogs.createdAt,
        completedAt: syncLogs.completedAt,
        deviceName: devices.name,
      })
      .from(syncLogs)
      .leftJoin(devices, eq(syncLogs.deviceId, devices.id))
      .where(eq(syncLogs.userId, req.user!.id))
      .orderBy(desc(syncLogs.createdAt))
      .limit(50);

    if (deviceId) {
      query = query.where(
        and(
          eq(syncLogs.userId, req.user!.id),
          eq(syncLogs.deviceId, deviceId)
        )
      );
    }

    const history = await query;

    res.json({ history });
  } catch (error) {
    next(error);
  }
});

// Helper functions
async function applyFeedChange(db: any, userId: string, change: any) {
  switch (change.action) {
    case 'create':
      await db
        .insert(feeds)
        .values({
          ...change.data,
          userId,
          id: change.id,
        })
        .onConflictDoNothing();
      break;

    case 'update':
      await db
        .update(feeds)
        .set(change.data)
        .where(
          and(
            eq(feeds.id, change.id),
            eq(feeds.userId, userId)
          )
        );
      break;

    case 'delete':
      await db
        .delete(feeds)
        .where(
          and(
            eq(feeds.id, change.id),
            eq(feeds.userId, userId)
          )
        );
      break;
  }
}

async function applyFolderChange(db: any, userId: string, change: any) {
  switch (change.action) {
    case 'create':
      await db
        .insert(folders)
        .values({
          ...change.data,
          userId,
          id: change.id,
        })
        .onConflictDoNothing();
      break;

    case 'update':
      await db
        .update(folders)
        .set(change.data)
        .where(
          and(
            eq(folders.id, change.id),
            eq(folders.userId, userId)
          )
        );
      break;

    case 'delete':
      await db
        .delete(folders)
        .where(
          and(
            eq(folders.id, change.id),
            eq(folders.userId, userId)
          )
        );
      break;
  }
}

async function applyArticleStateChange(db: any, userId: string, change: any) {
  const stateData: any = {
    userId,
    articleId: change.articleId,
    updatedAt: new Date(change.timestamp),
  };

  if (change.isRead !== undefined) {
    stateData.isRead = change.isRead;
    if (change.isRead) {
      stateData.readAt = new Date(change.timestamp);
    }
  }

  if (change.isStarred !== undefined) {
    stateData.isStarred = change.isStarred;
  }

  if (change.tags !== undefined) {
    stateData.tags = change.tags;
  }

  await db
    .insert(userArticleStates)
    .values(stateData)
    .onConflictDoUpdate({
      target: [userArticleStates.userId, userArticleStates.articleId],
      set: stateData,
    });
}

export default router;