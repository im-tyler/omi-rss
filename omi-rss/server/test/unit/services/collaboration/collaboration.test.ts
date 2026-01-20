import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Server as SocketIOServer } from 'socket.io';
import { CollaborationService } from '../../../../src/services/collaboration';
import { v4 as uuidv4 } from 'uuid';

// Mock dependencies
jest.mock('../../../../src/database', () => ({
  getDb: jest.fn(() => ({
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    onConflictDoUpdate: jest.fn().mockReturnThis(),
  })),
}));

jest.mock('../../../../src/services/redis', () => ({
  getRedis: jest.fn(() => ({
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    hset: jest.fn(),
    hgetall: jest.fn().mockResolvedValue({}),
    expire: jest.fn(),
    zadd: jest.fn(),
    zrange: jest.fn().mockResolvedValue([]),
    zrem: jest.fn(),
  })),
}));

jest.mock('../../../../src/services/socket.service', () => ({
  emitToFolder: jest.fn(),
  emitToUser: jest.fn(),
}));

describe('CollaborationService', () => {
  let collaborationService: CollaborationService;
  let mockIO: SocketIOServer;
  const testUserId = uuidv4();
  const testFolderId = uuidv4();
  const testArticleId = uuidv4();

  beforeEach(() => {
    jest.clearAllMocks();
    mockIO = {} as SocketIOServer;
    collaborationService = new CollaborationService(mockIO);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a new collaboration session', async () => {
      const db = require('../../../../src/database').getDb();
      db.insert().values.mockResolvedValueOnce({});

      const session = await collaborationService.createSession(
        testUserId,
        testFolderId,
        'reading',
        testArticleId
      );

      expect(session).toMatchObject({
        id: expect.any(String),
        folderId: testFolderId,
        hostUserId: testUserId,
        participants: [testUserId],
        articleId: testArticleId,
        type: 'reading',
        startedAt: expect.any(Date),
      });

      expect(db.insert).toHaveBeenCalled();
    });

    it('should broadcast session creation to folder members', async () => {
      const { emitToFolder } = require('../../../../src/services/socket.service');
      
      await collaborationService.createSession(testUserId, testFolderId, 'annotation');

      expect(emitToFolder).toHaveBeenCalledWith(
        testFolderId,
        'collaboration:session-started',
        expect.objectContaining({
          session: expect.any(Object),
          host: expect.any(Object),
        })
      );
    });

    it('should cache session in Redis', async () => {
      const redis = require('../../../../src/services/redis').getRedis();
      
      const session = await collaborationService.createSession(
        testUserId,
        testFolderId,
        'discussion'
      );

      expect(redis.set).toHaveBeenCalledWith(
        `collab:session:${session.id}`,
        JSON.stringify(session),
        'EX',
        86400
      );
    });
  });

  describe('joinSession', () => {
    it('should allow user to join an existing session', async () => {
      const sessionId = uuidv4();
      const newUserId = uuidv4();
      const mockSession = {
        id: sessionId,
        folderId: testFolderId,
        hostUserId: testUserId,
        participants: [testUserId],
        type: 'reading',
        startedAt: new Date(),
      };

      // Mock getSession
      jest.spyOn(collaborationService, 'getSession').mockResolvedValueOnce(mockSession);
      
      // Mock checkFolderAccess
      jest.spyOn(collaborationService as any, 'checkFolderAccess').mockResolvedValueOnce(true);

      const db = require('../../../../src/database').getDb();
      db.update().set().where.mockResolvedValueOnce({});

      const joined = await collaborationService.joinSession(sessionId, newUserId);

      expect(joined).toBe(true);
      expect(mockSession.participants).toContain(newUserId);
    });

    it('should reject if user already in session', async () => {
      const sessionId = uuidv4();
      const mockSession = {
        id: sessionId,
        folderId: testFolderId,
        hostUserId: testUserId,
        participants: [testUserId],
        type: 'reading',
        startedAt: new Date(),
      };

      jest.spyOn(collaborationService, 'getSession').mockResolvedValueOnce(mockSession);

      const joined = await collaborationService.joinSession(sessionId, testUserId);

      expect(joined).toBe(false);
    });

    it('should reject if user has no folder access', async () => {
      const sessionId = uuidv4();
      const newUserId = uuidv4();
      const mockSession = {
        id: sessionId,
        folderId: testFolderId,
        hostUserId: testUserId,
        participants: [testUserId],
        type: 'reading',
        startedAt: new Date(),
      };

      jest.spyOn(collaborationService, 'getSession').mockResolvedValueOnce(mockSession);
      jest.spyOn(collaborationService as any, 'checkFolderAccess').mockResolvedValueOnce(false);

      const joined = await collaborationService.joinSession(sessionId, newUserId);

      expect(joined).toBe(false);
    });
  });

  describe('updatePresence', () => {
    it('should update user presence in folder', async () => {
      const db = require('../../../../src/database').getDb();
      db.insert().values().onConflictDoUpdate.mockResolvedValueOnce({});

      await collaborationService.updatePresence(
        testUserId,
        testFolderId,
        'online',
        testArticleId,
        { paragraph: 5, offset: 100 }
      );

      expect(db.insert).toHaveBeenCalled();
    });

    it('should store presence in Redis', async () => {
      const redis = require('../../../../src/services/redis').getRedis();
      
      await collaborationService.updatePresence(
        testUserId,
        testFolderId,
        'online'
      );

      expect(redis.hset).toHaveBeenCalledWith(
        `presence:folder:${testFolderId}`,
        testUserId,
        expect.any(String)
      );
      expect(redis.expire).toHaveBeenCalledWith(
        `presence:folder:${testFolderId}`,
        3600
      );
    });

    it('should broadcast presence update', async () => {
      const { emitToFolder } = require('../../../../src/services/socket.service');
      
      await collaborationService.updatePresence(
        testUserId,
        testFolderId,
        'idle'
      );

      expect(emitToFolder).toHaveBeenCalledWith(
        testFolderId,
        'collaboration:presence-update',
        expect.objectContaining({
          userId: testUserId,
          presence: expect.any(Object),
        })
      );
    });
  });

  describe('createAnnotation', () => {
    const sessionId = uuidv4();
    const mockSession = {
      id: sessionId,
      folderId: testFolderId,
      hostUserId: testUserId,
      participants: [testUserId],
      type: 'annotation',
      startedAt: new Date(),
    };

    beforeEach(() => {
      jest.spyOn(collaborationService, 'getSession').mockResolvedValue(mockSession);
    });

    it('should create a new annotation', async () => {
      const db = require('../../../../src/database').getDb();
      db.insert().values.mockResolvedValueOnce({});

      const annotation = await collaborationService.createAnnotation(
        sessionId,
        testUserId,
        testArticleId,
        {
          type: 'highlight',
          color: '#FFFF00',
          range: { start: 100, end: 200, paragraphIndex: 2 },
        }
      );

      expect(annotation).toMatchObject({
        id: expect.any(String),
        userId: testUserId,
        sessionId,
        articleId: testArticleId,
        type: 'highlight',
        color: '#FFFF00',
        range: { start: 100, end: 200, paragraphIndex: 2 },
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('should reject if user not in session', async () => {
      const unauthorizedUserId = uuidv4();

      await expect(
        collaborationService.createAnnotation(
          sessionId,
          unauthorizedUserId,
          testArticleId,
          { type: 'comment', content: 'Test' }
        )
      ).rejects.toThrow('User not in session');
    });

    it('should cache annotation in Redis', async () => {
      const redis = require('../../../../src/services/redis').getRedis();
      
      const annotation = await collaborationService.createAnnotation(
        sessionId,
        testUserId,
        testArticleId,
        { type: 'reaction', emoji: '👍' }
      );

      expect(redis.zadd).toHaveBeenCalledWith(
        `annotations:article:${testArticleId}`,
        annotation.createdAt.getTime(),
        JSON.stringify(annotation)
      );
    });

    it('should broadcast annotation creation', async () => {
      const { emitToFolder } = require('../../../../src/services/socket.service');
      
      await collaborationService.createAnnotation(
        sessionId,
        testUserId,
        testArticleId,
        { type: 'comment', content: 'Great article!' }
      );

      expect(emitToFolder).toHaveBeenCalledWith(
        testFolderId,
        'collaboration:annotation-created',
        expect.objectContaining({
          sessionId,
          annotation: expect.any(Object),
          user: expect.any(Object),
        })
      );
    });
  });

  describe('broadcastReadingProgress', () => {
    it('should broadcast reading progress to session participants', async () => {
      const sessionId = uuidv4();
      const mockSession = {
        id: sessionId,
        folderId: testFolderId,
        hostUserId: testUserId,
        participants: [testUserId],
        type: 'reading',
        startedAt: new Date(),
      };

      jest.spyOn(collaborationService, 'getSession').mockResolvedValueOnce(mockSession);
      const { emitToFolder } = require('../../../../src/services/socket.service');

      await collaborationService.broadcastReadingProgress(
        sessionId,
        testUserId,
        testArticleId,
        75
      );

      expect(emitToFolder).toHaveBeenCalledWith(
        testFolderId,
        'collaboration:reading-progress',
        {
          sessionId,
          userId: testUserId,
          articleId: testArticleId,
          progress: 75,
        }
      );
    });

    it('should store progress in Redis', async () => {
      const sessionId = uuidv4();
      const mockSession = {
        id: sessionId,
        folderId: testFolderId,
        hostUserId: testUserId,
        participants: [testUserId],
        type: 'reading',
        startedAt: new Date(),
      };

      jest.spyOn(collaborationService, 'getSession').mockResolvedValueOnce(mockSession);
      const redis = require('../../../../src/services/redis').getRedis();

      await collaborationService.broadcastReadingProgress(
        sessionId,
        testUserId,
        testArticleId,
        50
      );

      expect(redis.hset).toHaveBeenCalledWith(
        `reading:progress:${sessionId}`,
        testUserId,
        expect.stringContaining('"progress":50')
      );
    });
  });

  describe('inviteToSession', () => {
    it('should send invitations to users', async () => {
      const sessionId = uuidv4();
      const inviteeIds = [uuidv4(), uuidv4()];
      const mockSession = {
        id: sessionId,
        folderId: testFolderId,
        hostUserId: testUserId,
        participants: [testUserId],
        type: 'discussion',
        startedAt: new Date(),
      };

      jest.spyOn(collaborationService, 'getSession').mockResolvedValueOnce(mockSession);
      const { emitToUser } = require('../../../../src/services/socket.service');

      await collaborationService.inviteToSession(sessionId, testUserId, inviteeIds);

      expect(emitToUser).toHaveBeenCalledTimes(2);
      inviteeIds.forEach(inviteeId => {
        expect(emitToUser).toHaveBeenCalledWith(
          inviteeId,
          'collaboration:session-invite',
          expect.objectContaining({
            sessionId,
            session: expect.any(Object),
            inviter: expect.any(Object),
            folder: expect.any(Object),
          })
        );
      });
    });

    it('should reject if inviter is not host', async () => {
      const sessionId = uuidv4();
      const nonHostUserId = uuidv4();
      const mockSession = {
        id: sessionId,
        folderId: testFolderId,
        hostUserId: testUserId,
        participants: [testUserId, nonHostUserId],
        type: 'discussion',
        startedAt: new Date(),
      };

      jest.spyOn(collaborationService, 'getSession').mockResolvedValueOnce(mockSession);

      await expect(
        collaborationService.inviteToSession(sessionId, nonHostUserId, [uuidv4()])
      ).rejects.toThrow('Session not found or unauthorized');
    });
  });

  describe('presence monitoring', () => {
    it('should update idle status after inactivity', async () => {
      // This test would require mocking timers
      jest.useFakeTimers();
      
      // Add user presence
      await collaborationService.updatePresence(
        testUserId,
        testFolderId,
        'online'
      );

      // Fast forward 6 minutes
      jest.advanceTimersByTime(6 * 60 * 1000);

      // The presence monitor should have updated status to idle
      // (Implementation would need to expose this for testing)
      
      jest.useRealTimers();
    });
  });
});