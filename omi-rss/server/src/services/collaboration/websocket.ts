import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../../utils/logger';
import { collaborationService } from './collaboration.service';
import { teamService } from './team.service';
import { verifySocketToken } from '../../middleware/auth';

export function initializeCollaborationWebSocket(io: SocketIOServer) {
  const collaborationNamespace = io.of('/collaboration');

  // Middleware for authentication
  collaborationNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const user = await verifySocketToken(token);
      
      if (!user) {
        return next(new Error('Authentication failed'));
      }
      
      socket.data.user = user;
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  collaborationNamespace.on('connection', (socket: Socket) => {
    const userId = socket.data.user.id;
    logger.info(`User ${userId} connected to collaboration namespace`);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Handle team subscription
    socket.on('subscribe:team', async (teamId: string) => {
      try {
        // Verify team membership
        const members = await teamService.getTeamMembers(teamId, userId);
        const isMember = members.some(m => m.userId === userId);
        
        if (isMember) {
          socket.join(`team:${teamId}`);
          socket.emit('subscribed:team', { teamId });
        } else {
          socket.emit('error', { message: 'Not a team member' });
        }
      } catch (error) {
        logger.error('Team subscription error:', error);
        socket.emit('error', { message: 'Failed to join team' });
      }
    });

    // Handle article subscription
    socket.on('subscribe:article', async (articleId: string) => {
      try {
        socket.join(`article:${articleId}`);
        socket.emit('subscribed:article', { articleId });
        
        // Get current readers
        const readers = await collaborationService.getActiveReaders(articleId);
        socket.emit('presence:current', { articleId, readers });
      } catch (error) {
        logger.error('Article subscription error:', error);
        socket.emit('error', { message: 'Failed to join article' });
      }
    });

    // Handle reading session events
    socket.on('reading:start', async (data: { articleId: string; teamId?: string }) => {
      try {
        const session = await collaborationService.startReadingSession(
          userId,
          data.articleId,
          data.teamId
        );
        socket.emit('reading:started', { session });
      } catch (error) {
        logger.error('Reading session start error:', error);
        socket.emit('error', { message: 'Failed to start reading session' });
      }
    });

    socket.on('reading:scroll', async (data: { sessionId: string; scrollPosition: number }) => {
      try {
        const session = await collaborationService.updateReadingSession(
          data.sessionId,
          userId,
          data.scrollPosition
        );
        
        if (session) {
          // Broadcast to other users
          socket.broadcast.to(`article:${session.articleId}`).emit('presence:scroll', {
            userId,
            articleId: session.articleId,
            scrollPosition: data.scrollPosition,
          });
        }
      } catch (error) {
        logger.error('Reading session update error:', error);
      }
    });

    socket.on('reading:end', async (data: { sessionId: string }) => {
      try {
        await collaborationService.endReadingSession(data.sessionId, userId);
      } catch (error) {
        logger.error('Reading session end error:', error);
      }
    });

    // Handle typing indicators for comments
    socket.on('comment:typing:start', (data: { articleId: string; teamId?: string }) => {
      const room = data.teamId ? `team:${data.teamId}` : `article:${data.articleId}`;
      socket.broadcast.to(room).emit('comment:typing', {
        userId,
        username: socket.data.user.username,
        isTyping: true,
      });
    });

    socket.on('comment:typing:stop', (data: { articleId: string; teamId?: string }) => {
      const room = data.teamId ? `team:${data.teamId}` : `article:${data.articleId}`;
      socket.broadcast.to(room).emit('comment:typing', {
        userId,
        username: socket.data.user.username,
        isTyping: false,
      });
    });

    // Handle cursor position for collaborative annotations
    socket.on('cursor:move', (data: { articleId: string; position: any }) => {
      socket.broadcast.to(`article:${data.articleId}`).emit('cursor:position', {
        userId,
        username: socket.data.user.username,
        position: data.position,
      });
    });

    // Clean up on disconnect
    socket.on('disconnect', async () => {
      logger.info(`User ${userId} disconnected from collaboration namespace`);
      
      // End any active reading sessions
      // This would need to be tracked in memory or Redis
    });
  });

  return collaborationNamespace;
}