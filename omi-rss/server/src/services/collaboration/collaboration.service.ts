import { getDb } from '../../database';
import { 
  articleComments,
  articleAnnotations,
  readingSessions,
  articles,
  feeds,
  users,
  teamMembers,
} from '../../database/schema';
import { eq, and, desc, isNull, sql, gte, or } from 'drizzle-orm';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { getIO } from '../socket.service';

export interface CreateCommentData {
  articleId: string;
  content: string;
  parentId?: string;
  teamId?: string;
}

export interface CreateAnnotationData {
  articleId: string;
  type: 'highlight' | 'note';
  content?: string;
  selection: {
    start: number;
    end: number;
    text: string;
  };
  color?: string;
  teamId?: string;
  isPublic?: boolean;
}

export class CollaborationService {
  // Comments
  async createComment(userId: string, data: CreateCommentData) {
    const db = getDb();

    // Verify article access
    await this.verifyArticleAccess(data.articleId, userId);

    // If team comment, verify membership
    if (data.teamId) {
      await this.verifyTeamMembership(data.teamId, userId);
    }

    const [comment] = await db
      .insert(articleComments)
      .values({
        articleId: data.articleId,
        userId,
        content: data.content,
        parentId: data.parentId,
        teamId: data.teamId,
      })
      .returning();

    // Get user info for response
    const [user] = await db
      .select({
        username: users.username,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const commentWithUser = {
      ...comment,
      user,
      replies: [],
    };

    // Broadcast to team or article subscribers
    const io = getIO();
    if (data.teamId) {
      io.to(`team:${data.teamId}`).emit('comment:created', commentWithUser);
    } else {
      io.to(`article:${data.articleId}`).emit('comment:created', commentWithUser);
    }

    return commentWithUser;
  }

  async getComments(articleId: string, userId: string, teamId?: string) {
    const db = getDb();

    // Verify article access
    await this.verifyArticleAccess(articleId, userId);

    // Build query
    let query = db
      .select({
        id: articleComments.id,
        content: articleComments.content,
        parentId: articleComments.parentId,
        isEdited: articleComments.isEdited,
        createdAt: articleComments.createdAt,
        userId: articleComments.userId,
        username: users.username,
        userAvatar: users.avatarUrl,
      })
      .from(articleComments)
      .innerJoin(users, eq(articleComments.userId, users.id))
      .where(
        and(
          eq(articleComments.articleId, articleId),
          teamId ? eq(articleComments.teamId, teamId) : isNull(articleComments.teamId)
        )
      )
      .orderBy(articleComments.createdAt);

    const comments = await query;

    // Build comment tree
    const commentMap = new Map();
    const rootComments: any[] = [];

    comments.forEach(comment => {
      const commentObj = {
        ...comment,
        user: {
          id: comment.userId,
          username: comment.username,
          avatarUrl: comment.userAvatar,
        },
        replies: [],
      };
      
      commentMap.set(comment.id, commentObj);
      
      if (!comment.parentId) {
        rootComments.push(commentObj);
      }
    });

    // Build reply structure
    comments.forEach(comment => {
      if (comment.parentId && commentMap.has(comment.parentId)) {
        commentMap.get(comment.parentId).replies.push(commentMap.get(comment.id));
      }
    });

    return rootComments;
  }

  async updateComment(commentId: string, userId: string, content: string) {
    const db = getDb();

    const [updated] = await db
      .update(articleComments)
      .set({
        content,
        isEdited: true,
        editedAt: new Date(),
      })
      .where(
        and(
          eq(articleComments.id, commentId),
          eq(articleComments.userId, userId)
        )
      )
      .returning();

    if (!updated) {
      throw new AppError('Comment not found or access denied', 404);
    }

    // Broadcast update
    const io = getIO();
    if (updated.teamId) {
      io.to(`team:${updated.teamId}`).emit('comment:updated', updated);
    } else {
      io.to(`article:${updated.articleId}`).emit('comment:updated', updated);
    }

    return updated;
  }

  async deleteComment(commentId: string, userId: string) {
    const db = getDb();

    // Get comment to check ownership
    const [comment] = await db
      .select()
      .from(articleComments)
      .where(eq(articleComments.id, commentId))
      .limit(1);

    if (!comment || comment.userId !== userId) {
      throw new AppError('Comment not found or access denied', 404);
    }

    // Soft delete by updating content
    const [deleted] = await db
      .update(articleComments)
      .set({
        content: '[deleted]',
        isEdited: true,
        editedAt: new Date(),
      })
      .where(eq(articleComments.id, commentId))
      .returning();

    // Broadcast deletion
    const io = getIO();
    if (comment.teamId) {
      io.to(`team:${comment.teamId}`).emit('comment:deleted', { id: commentId });
    } else {
      io.to(`article:${comment.articleId}`).emit('comment:deleted', { id: commentId });
    }

    return { success: true };
  }

  // Annotations
  async createAnnotation(userId: string, data: CreateAnnotationData) {
    const db = getDb();

    // Verify article access
    await this.verifyArticleAccess(data.articleId, userId);

    // If team annotation, verify membership
    if (data.teamId) {
      await this.verifyTeamMembership(data.teamId, userId);
    }

    const [annotation] = await db
      .insert(articleAnnotations)
      .values({
        articleId: data.articleId,
        userId,
        type: data.type,
        content: data.content,
        selection: data.selection,
        color: data.color || '#FFFF00',
        teamId: data.teamId,
        isPublic: data.isPublic || false,
      })
      .returning();

    // Get user info
    const [user] = await db
      .select({
        username: users.username,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const annotationWithUser = {
      ...annotation,
      user,
    };

    // Broadcast to team or article subscribers
    const io = getIO();
    if (data.teamId) {
      io.to(`team:${data.teamId}`).emit('annotation:created', annotationWithUser);
    } else if (data.isPublic) {
      io.to(`article:${data.articleId}`).emit('annotation:created', annotationWithUser);
    }

    return annotationWithUser;
  }

  async getAnnotations(articleId: string, userId: string, teamId?: string) {
    const db = getDb();

    // Verify article access
    await this.verifyArticleAccess(articleId, userId);

    // Build query
    let conditions = [
      eq(articleAnnotations.articleId, articleId),
    ];

    if (teamId) {
      // Team annotations
      await this.verifyTeamMembership(teamId, userId);
      conditions.push(eq(articleAnnotations.teamId, teamId));
    } else {
      // Personal or public annotations
      conditions.push(
        or(
          eq(articleAnnotations.userId, userId),
          eq(articleAnnotations.isPublic, true)
        )
      );
    }

    const annotations = await db
      .select({
        id: articleAnnotations.id,
        type: articleAnnotations.type,
        content: articleAnnotations.content,
        selection: articleAnnotations.selection,
        color: articleAnnotations.color,
        isPublic: articleAnnotations.isPublic,
        createdAt: articleAnnotations.createdAt,
        userId: articleAnnotations.userId,
        username: users.username,
        userAvatar: users.avatarUrl,
      })
      .from(articleAnnotations)
      .innerJoin(users, eq(articleAnnotations.userId, users.id))
      .where(and(...conditions))
      .orderBy(articleAnnotations.createdAt);

    return annotations.map(annotation => ({
      ...annotation,
      user: {
        id: annotation.userId,
        username: annotation.username,
        avatarUrl: annotation.userAvatar,
      },
    }));
  }

  async updateAnnotation(annotationId: string, userId: string, data: Partial<CreateAnnotationData>) {
    const db = getDb();

    const [updated] = await db
      .update(articleAnnotations)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(articleAnnotations.id, annotationId),
          eq(articleAnnotations.userId, userId)
        )
      )
      .returning();

    if (!updated) {
      throw new AppError('Annotation not found or access denied', 404);
    }

    // Broadcast update
    const io = getIO();
    if (updated.teamId) {
      io.to(`team:${updated.teamId}`).emit('annotation:updated', updated);
    } else if (updated.isPublic) {
      io.to(`article:${updated.articleId}`).emit('annotation:updated', updated);
    }

    return updated;
  }

  async deleteAnnotation(annotationId: string, userId: string) {
    const db = getDb();

    const [annotation] = await db
      .select()
      .from(articleAnnotations)
      .where(
        and(
          eq(articleAnnotations.id, annotationId),
          eq(articleAnnotations.userId, userId)
        )
      )
      .limit(1);

    if (!annotation) {
      throw new AppError('Annotation not found or access denied', 404);
    }

    await db
      .delete(articleAnnotations)
      .where(eq(articleAnnotations.id, annotationId));

    // Broadcast deletion
    const io = getIO();
    if (annotation.teamId) {
      io.to(`team:${annotation.teamId}`).emit('annotation:deleted', { id: annotationId });
    } else if (annotation.isPublic) {
      io.to(`article:${annotation.articleId}`).emit('annotation:deleted', { id: annotationId });
    }

    return { success: true };
  }

  // Reading Sessions & Presence
  async startReadingSession(userId: string, articleId: string, teamId?: string) {
    const db = getDb();

    // End any existing session for this article
    await db
      .update(readingSessions)
      .set({ endedAt: new Date() })
      .where(
        and(
          eq(readingSessions.userId, userId),
          eq(readingSessions.articleId, articleId),
          isNull(readingSessions.endedAt)
        )
      );

    // Start new session
    const [session] = await db
      .insert(readingSessions)
      .values({
        userId,
        articleId,
        teamId,
      })
      .returning();

    // Get user info for presence
    const [user] = await db
      .select({
        username: users.username,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Broadcast presence
    const io = getIO();
    const presence = {
      userId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      articleId,
      startedAt: session.startedAt,
    };

    if (teamId) {
      io.to(`team:${teamId}`).emit('presence:joined', presence);
    }
    io.to(`article:${articleId}`).emit('presence:joined', presence);

    return session;
  }

  async updateReadingSession(sessionId: string, userId: string, scrollPosition: number) {
    const db = getDb();

    const [updated] = await db
      .update(readingSessions)
      .set({
        scrollPosition,
        readingTime: sql`EXTRACT(EPOCH FROM (NOW() - ${readingSessions.startedAt}))::INTEGER`,
      })
      .where(
        and(
          eq(readingSessions.id, sessionId),
          eq(readingSessions.userId, userId),
          isNull(readingSessions.endedAt)
        )
      )
      .returning();

    if (updated) {
      // Broadcast scroll position
      const io = getIO();
      const update = {
        userId,
        articleId: updated.articleId,
        scrollPosition,
      };

      if (updated.teamId) {
        io.to(`team:${updated.teamId}`).emit('presence:scroll', update);
      }
    }

    return updated;
  }

  async endReadingSession(sessionId: string, userId: string) {
    const db = getDb();

    const [session] = await db
      .update(readingSessions)
      .set({
        endedAt: new Date(),
        readingTime: sql`EXTRACT(EPOCH FROM (NOW() - ${readingSessions.startedAt}))::INTEGER`,
      })
      .where(
        and(
          eq(readingSessions.id, sessionId),
          eq(readingSessions.userId, userId)
        )
      )
      .returning();

    if (session) {
      // Broadcast departure
      const io = getIO();
      const departure = {
        userId,
        articleId: session.articleId,
      };

      if (session.teamId) {
        io.to(`team:${session.teamId}`).emit('presence:left', departure);
      }
      io.to(`article:${session.articleId}`).emit('presence:left', departure);
    }

    return session;
  }

  async getActiveReaders(articleId: string, teamId?: string) {
    const db = getDb();

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    let conditions = [
      eq(readingSessions.articleId, articleId),
      isNull(readingSessions.endedAt),
      gte(readingSessions.startedAt, fiveMinutesAgo),
    ];

    if (teamId) {
      conditions.push(eq(readingSessions.teamId, teamId));
    }

    const readers = await db
      .select({
        userId: readingSessions.userId,
        startedAt: readingSessions.startedAt,
        scrollPosition: readingSessions.scrollPosition,
        username: users.username,
        avatarUrl: users.avatarUrl,
      })
      .from(readingSessions)
      .innerJoin(users, eq(readingSessions.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(readingSessions.startedAt));

    return readers;
  }

  // Helper methods
  private async verifyArticleAccess(articleId: string, userId: string) {
    const db = getDb();

    const [article] = await db
      .select({ id: articles.id })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .where(
        and(
          eq(articles.id, articleId),
          eq(feeds.userId, userId)
        )
      )
      .limit(1);

    if (!article) {
      throw new AppError('Article not found or access denied', 404);
    }
  }

  private async verifyTeamMembership(teamId: string, userId: string) {
    const db = getDb();

    const [member] = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, userId)
        )
      )
      .limit(1);

    if (!member) {
      throw new AppError('Not a team member', 403);
    }

    return member;
  }
}

export const collaborationService = new CollaborationService();