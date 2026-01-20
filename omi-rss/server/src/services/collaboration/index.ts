import { Server as SocketIOServer } from 'socket.io';
import { getDb } from '../../database';
import { 
  sharedFolders, 
  articles,
  users,
  folders,
} from '../../database/schema';
import {
  collaborationSessions,
  collaborationAnnotations,
  collaborationPresence,
} from '../../database/collaboration-schema';
import { eq, and, or, gte } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { getRedis } from '../redis';
import { emitToFolder, emitToUser } from '../socket.service';

interface CollaborationSession {
  id: string;
  folderId: string;
  hostUserId: string;
  participants: string[];
  articleId?: string;
  startedAt: Date;
  type: 'reading' | 'annotation' | 'discussion';
}

interface UserPresence {
  userId: string;
  userName: string;
  userAvatar?: string;
  status: 'online' | 'idle' | 'offline';
  lastActivity: Date;
  currentArticleId?: string;
  cursorPosition?: {
    articleId: string;
    paragraph: number;
    offset: number;
  };
}

interface Annotation {
  id: string;
  articleId: string;
  userId: string;
  sessionId: string;
  type: 'highlight' | 'comment' | 'reaction';
  content?: string;
  color?: string;
  emoji?: string;
  range?: {
    start: number;
    end: number;
    paragraphIndex: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export class CollaborationService {
  private redis = getRedis();
  private db = getDb();
  private activeSessions = new Map<string, CollaborationSession>();
  private userPresence = new Map<string, Map<string, UserPresence>>(); // folderId -> userId -> presence

  constructor(private io: SocketIOServer) {
    this.initializeEventHandlers();
    this.startPresenceMonitor();
  }

  private initializeEventHandlers() {
    // Clean up stale sessions on startup
    this.cleanupStaleSessions();
  }

  private async cleanupStaleSessions() {
    try {
      // Remove sessions older than 24 hours
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await this.db
        .delete(collaborationSessions)
        .where(gte(collaborationSessions.startedAt, yesterday));
    } catch (error) {
      logger.error('Failed to cleanup stale sessions:', error);
    }
  }

  private startPresenceMonitor() {
    // Check for idle/offline users every 30 seconds
    setInterval(() => {
      const now = Date.now();
      const idleThreshold = 5 * 60 * 1000; // 5 minutes
      const offlineThreshold = 15 * 60 * 1000; // 15 minutes

      this.userPresence.forEach((folderPresence, folderId) => {
        folderPresence.forEach((presence, userId) => {
          const timeSinceActivity = now - presence.lastActivity.getTime();
          
          if (timeSinceActivity > offlineThreshold && presence.status !== 'offline') {
            presence.status = 'offline';
            this.broadcastPresenceUpdate(folderId, userId, presence);
          } else if (timeSinceActivity > idleThreshold && presence.status === 'online') {
            presence.status = 'idle';
            this.broadcastPresenceUpdate(folderId, userId, presence);
          }
        });
      });
    }, 30000);
  }

  async createSession(
    hostUserId: string,
    folderId: string,
    type: 'reading' | 'annotation' | 'discussion',
    articleId?: string
  ): Promise<CollaborationSession> {
    const sessionId = uuidv4();
    const session: CollaborationSession = {
      id: sessionId,
      folderId,
      hostUserId,
      participants: [hostUserId],
      articleId,
      startedAt: new Date(),
      type,
    };

    // Save to database
    await this.db.insert(collaborationSessions).values({
      id: sessionId,
      folderId,
      hostUserId,
      type,
      articleId,
      startedAt: session.startedAt,
      isActive: true,
    });

    // Cache in memory
    this.activeSessions.set(sessionId, session);

    // Store in Redis for cross-server sync
    await this.redis.set(
      `collab:session:${sessionId}`,
      JSON.stringify(session),
      'EX',
      86400 // 24 hours
    );

    // Notify folder members
    emitToFolder(folderId, 'collaboration:session-started', {
      session,
      host: await this.getUserInfo(hostUserId),
    });

    logger.info(`Collaboration session created: ${sessionId}`);
    return session;
  }

  async joinSession(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session || session.participants.includes(userId)) {
      return false;
    }

    // Check if user has access to the folder
    const hasAccess = await this.checkFolderAccess(userId, session.folderId);
    if (!hasAccess) {
      return false;
    }

    // Add participant
    session.participants.push(userId);
    this.activeSessions.set(sessionId, session);

    // Update Redis
    await this.redis.set(
      `collab:session:${sessionId}`,
      JSON.stringify(session),
      'EX',
      86400
    );

    // Update database
    await this.db
      .update(collaborationSessions)
      .set({ 
        participants: session.participants,
        updatedAt: new Date(),
      })
      .where(eq(collaborationSessions.id, sessionId));

    // Notify other participants
    emitToFolder(session.folderId, 'collaboration:user-joined', {
      sessionId,
      user: await this.getUserInfo(userId),
      participantCount: session.participants.length,
    });

    return true;
  }

  async leaveSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    // Remove participant
    session.participants = session.participants.filter(id => id !== userId);
    
    if (session.participants.length === 0) {
      // End session if no participants
      await this.endSession(sessionId);
    } else {
      // Update session
      this.activeSessions.set(sessionId, session);
      await this.redis.set(
        `collab:session:${sessionId}`,
        JSON.stringify(session),
        'EX',
        86400
      );

      // Notify others
      emitToFolder(session.folderId, 'collaboration:user-left', {
        sessionId,
        userId,
        participantCount: session.participants.length,
      });
    }
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    // Remove from cache
    this.activeSessions.delete(sessionId);
    await this.redis.del(`collab:session:${sessionId}`);

    // Update database
    await this.db
      .update(collaborationSessions)
      .set({ 
        isActive: false,
        endedAt: new Date(),
      })
      .where(eq(collaborationSessions.id, sessionId));

    // Notify participants
    emitToFolder(session.folderId, 'collaboration:session-ended', {
      sessionId,
    });

    logger.info(`Collaboration session ended: ${sessionId}`);
  }

  async updatePresence(
    userId: string,
    folderId: string,
    status: 'online' | 'idle' | 'offline',
    currentArticleId?: string,
    cursorPosition?: any
  ): Promise<void> {
    if (!this.userPresence.has(folderId)) {
      this.userPresence.set(folderId, new Map());
    }

    const folderPresence = this.userPresence.get(folderId)!;
    const userInfo = await this.getUserInfo(userId);
    
    const presence: UserPresence = {
      userId,
      userName: userInfo.name,
      userAvatar: userInfo.avatar,
      status,
      lastActivity: new Date(),
      currentArticleId,
      cursorPosition,
    };

    folderPresence.set(userId, presence);

    // Store in Redis for cross-server sync
    await this.redis.hset(
      `presence:folder:${folderId}`,
      userId,
      JSON.stringify(presence)
    );
    await this.redis.expire(`presence:folder:${folderId}`, 3600); // 1 hour

    // Save to database
    await this.db
      .insert(collaborationPresence)
      .values({
        userId,
        folderId,
        status,
        currentArticleId,
        lastActivity: presence.lastActivity,
      })
      .onConflictDoUpdate({
        target: [collaborationPresence.userId, collaborationPresence.folderId],
        set: {
          status,
          currentArticleId,
          lastActivity: presence.lastActivity,
        },
      });

    // Broadcast to folder members
    this.broadcastPresenceUpdate(folderId, userId, presence);
  }

  private broadcastPresenceUpdate(
    folderId: string,
    userId: string,
    presence: UserPresence
  ) {
    emitToFolder(folderId, 'collaboration:presence-update', {
      userId,
      presence,
    });
  }

  async getFolderPresence(folderId: string): Promise<UserPresence[]> {
    const folderPresence = this.userPresence.get(folderId);
    if (folderPresence) {
      return Array.from(folderPresence.values());
    }

    // Load from Redis if not in memory
    const redisData = await this.redis.hgetall(`presence:folder:${folderId}`);
    const presenceList: UserPresence[] = [];
    
    for (const [userId, data] of Object.entries(redisData)) {
      try {
        presenceList.push(JSON.parse(data));
      } catch (error) {
        logger.error(`Failed to parse presence data for user ${userId}:`, error);
      }
    }

    return presenceList;
  }

  async createAnnotation(
    sessionId: string,
    userId: string,
    articleId: string,
    annotation: Omit<Annotation, 'id' | 'userId' | 'sessionId' | 'createdAt' | 'updatedAt'>
  ): Promise<Annotation> {
    const session = await this.getSession(sessionId);
    if (!session || !session.participants.includes(userId)) {
      throw new Error('User not in session');
    }

    const annotationId = uuidv4();
    const fullAnnotation: Annotation = {
      id: annotationId,
      userId,
      sessionId,
      articleId,
      ...annotation,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Save to database
    await this.db.insert(collaborationAnnotations).values({
      id: annotationId,
      sessionId,
      articleId,
      userId,
      type: annotation.type,
      content: annotation.content,
      data: {
        color: annotation.color,
        emoji: annotation.emoji,
        range: annotation.range,
      },
      createdAt: fullAnnotation.createdAt,
    });

    // Cache in Redis
    const key = `annotations:article:${articleId}`;
    await this.redis.zadd(
      key,
      fullAnnotation.createdAt.getTime(),
      JSON.stringify(fullAnnotation)
    );
    await this.redis.expire(key, 86400); // 24 hours

    // Broadcast to session participants
    emitToFolder(session.folderId, 'collaboration:annotation-created', {
      sessionId,
      annotation: fullAnnotation,
      user: await this.getUserInfo(userId),
    });

    return fullAnnotation;
  }

  async updateAnnotation(
    annotationId: string,
    userId: string,
    updates: Partial<Annotation>
  ): Promise<void> {
    // Get annotation from database
    const [annotation] = await this.db
      .select()
      .from(collaborationAnnotations)
      .where(eq(collaborationAnnotations.id, annotationId))
      .limit(1);

    if (!annotation || annotation.userId !== userId) {
      throw new Error('Annotation not found or unauthorized');
    }

    // Update database
    await this.db
      .update(collaborationAnnotations)
      .set({
        content: updates.content,
        data: {
          ...annotation.data,
          color: updates.color,
          emoji: updates.emoji,
          range: updates.range,
        },
        updatedAt: new Date(),
      })
      .where(eq(collaborationAnnotations.id, annotationId));

    // Get session for broadcasting
    const session = await this.getSession(annotation.sessionId);
    if (session) {
      emitToFolder(session.folderId, 'collaboration:annotation-updated', {
        sessionId: session.id,
        annotationId,
        updates,
        userId,
      });
    }
  }

  async deleteAnnotation(annotationId: string, userId: string): Promise<void> {
    // Get annotation
    const [annotation] = await this.db
      .select()
      .from(collaborationAnnotations)
      .where(eq(collaborationAnnotations.id, annotationId))
      .limit(1);

    if (!annotation || annotation.userId !== userId) {
      throw new Error('Annotation not found or unauthorized');
    }

    // Delete from database
    await this.db
      .delete(collaborationAnnotations)
      .where(eq(collaborationAnnotations.id, annotationId));

    // Remove from Redis
    const key = `annotations:article:${annotation.articleId}`;
    const annotations = await this.redis.zrange(key, 0, -1);
    for (const data of annotations) {
      const parsed = JSON.parse(data);
      if (parsed.id === annotationId) {
        await this.redis.zrem(key, data);
        break;
      }
    }

    // Broadcast deletion
    const session = await this.getSession(annotation.sessionId);
    if (session) {
      emitToFolder(session.folderId, 'collaboration:annotation-deleted', {
        sessionId: session.id,
        annotationId,
        userId,
      });
    }
  }

  async getArticleAnnotations(articleId: string): Promise<Annotation[]> {
    // Try Redis cache first
    const key = `annotations:article:${articleId}`;
    const cached = await this.redis.zrange(key, 0, -1);
    
    if (cached.length > 0) {
      return cached.map(data => JSON.parse(data));
    }

    // Load from database
    const annotations = await this.db
      .select()
      .from(collaborationAnnotations)
      .where(eq(collaborationAnnotations.articleId, articleId))
      .orderBy(collaborationAnnotations.createdAt);

    return annotations.map(ann => ({
      id: ann.id,
      articleId: ann.articleId,
      userId: ann.userId,
      sessionId: ann.sessionId,
      type: ann.type as 'highlight' | 'comment' | 'reaction',
      content: ann.content || undefined,
      color: ann.data?.color,
      emoji: ann.data?.emoji,
      range: ann.data?.range,
      createdAt: ann.createdAt,
      updatedAt: ann.updatedAt || ann.createdAt,
    }));
  }

  async broadcastReadingProgress(
    sessionId: string,
    userId: string,
    articleId: string,
    progress: number
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session || !session.participants.includes(userId)) {
      return;
    }

    // Store progress in Redis
    await this.redis.hset(
      `reading:progress:${sessionId}`,
      userId,
      JSON.stringify({ articleId, progress, timestamp: Date.now() })
    );

    // Broadcast to other participants
    emitToFolder(session.folderId, 'collaboration:reading-progress', {
      sessionId,
      userId,
      articleId,
      progress,
    });
  }

  async getSessionReadingProgress(sessionId: string): Promise<Map<string, number>> {
    const progressData = await this.redis.hgetall(`reading:progress:${sessionId}`);
    const progressMap = new Map<string, number>();

    for (const [userId, data] of Object.entries(progressData)) {
      try {
        const { progress } = JSON.parse(data);
        progressMap.set(userId, progress);
      } catch (error) {
        logger.error(`Failed to parse progress for user ${userId}:`, error);
      }
    }

    return progressMap;
  }

  async inviteToSession(
    sessionId: string,
    inviterId: string,
    inviteeIds: string[]
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session || session.hostUserId !== inviterId) {
      throw new Error('Session not found or unauthorized');
    }

    // Send invitations
    for (const inviteeId of inviteeIds) {
      emitToUser(inviteeId, 'collaboration:session-invite', {
        sessionId,
        session: {
          type: session.type,
          articleId: session.articleId,
        },
        inviter: await this.getUserInfo(inviterId),
        folder: await this.getFolderInfo(session.folderId),
      });
    }
  }

  async getSession(sessionId: string): Promise<CollaborationSession | null> {
    // Check memory cache
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!;
    }

    // Check Redis
    const data = await this.redis.get(`collab:session:${sessionId}`);
    if (data) {
      const session = JSON.parse(data);
      this.activeSessions.set(sessionId, session);
      return session;
    }

    // Load from database
    const [dbSession] = await this.db
      .select()
      .from(collaborationSessions)
      .where(
        and(
          eq(collaborationSessions.id, sessionId),
          eq(collaborationSessions.isActive, true)
        )
      )
      .limit(1);

    if (dbSession) {
      const session: CollaborationSession = {
        id: dbSession.id,
        folderId: dbSession.folderId,
        hostUserId: dbSession.hostUserId,
        participants: dbSession.participants || [dbSession.hostUserId],
        articleId: dbSession.articleId || undefined,
        startedAt: dbSession.startedAt,
        type: dbSession.type as 'reading' | 'annotation' | 'discussion',
      };
      this.activeSessions.set(sessionId, session);
      return session;
    }

    return null;
  }

  private async checkFolderAccess(userId: string, folderId: string): Promise<boolean> {
    // Check if user owns the folder
    const [folder] = await this.db
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.id, folderId),
          eq(folders.userId, userId)
        )
      )
      .limit(1);

    if (folder) return true;

    // Check if folder is shared with user
    const [share] = await this.db
      .select()
      .from(sharedFolders)
      .where(
        and(
          eq(sharedFolders.folderId, folderId),
          eq(sharedFolders.sharedWithUserId, userId)
        )
      )
      .limit(1);

    return !!share;
  }

  private async getUserInfo(userId: string): Promise<any> {
    const [user] = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.profileImage,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user || { id: userId, name: 'Unknown User' };
  }

  private async getFolderInfo(folderId: string): Promise<any> {
    const [folder] = await this.db
      .select({
        id: folders.id,
        name: folders.name,
        color: folders.color,
      })
      .from(folders)
      .where(eq(folders.id, folderId))
      .limit(1);

    return folder || { id: folderId, name: 'Unknown Folder' };
  }

  async getActiveSessions(folderId: string): Promise<CollaborationSession[]> {
    const sessions: CollaborationSession[] = [];
    
    // Get from database
    const dbSessions = await this.db
      .select()
      .from(collaborationSessions)
      .where(
        and(
          eq(collaborationSessions.folderId, folderId),
          eq(collaborationSessions.isActive, true)
        )
      );

    for (const dbSession of dbSessions) {
      sessions.push({
        id: dbSession.id,
        folderId: dbSession.folderId,
        hostUserId: dbSession.hostUserId,
        participants: dbSession.participants || [dbSession.hostUserId],
        articleId: dbSession.articleId || undefined,
        startedAt: dbSession.startedAt,
        type: dbSession.type as 'reading' | 'annotation' | 'discussion',
      });
    }

    return sessions;
  }
}

// Export singleton instance
let collaborationService: CollaborationService;

export function initializeCollaboration(io: SocketIOServer): CollaborationService {
  collaborationService = new CollaborationService(io);
  return collaborationService;
}

export function getCollaborationService(): CollaborationService {
  if (!collaborationService) {
    throw new Error('Collaboration service not initialized');
  }
  return collaborationService;
}