import { Server as SocketIOServer } from 'socket.io';
import { marketService } from './index';
import { Quote } from './config';
import { logger } from '../../utils/logger';
import jwt from 'jsonwebtoken';

interface MarketSocket {
  userId: string;
  symbols: Set<string>;
  subscriptionId?: string;
}

export function initializeMarketWebSocket(io: SocketIOServer) {
  const marketNamespace = io.of('/market');
  const activeSockets = new Map<string, MarketSocket>();

  marketNamespace.use(async (socket, next) => {
    try {
      // Authenticate socket connection
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      socket.data.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  marketNamespace.on('connection', (socket) => {
    const userId = socket.data.userId;
    logger.info(`Market WebSocket connected: ${socket.id} (user: ${userId})`);

    // Initialize socket data
    activeSockets.set(socket.id, {
      userId,
      symbols: new Set(),
    });

    // Handle symbol subscription
    socket.on('subscribe', async (data: { symbols: string[] }) => {
      try {
        const socketData = activeSockets.get(socket.id);
        if (!socketData) return;

        // Validate symbols
        if (!Array.isArray(data.symbols) || data.symbols.length === 0) {
          socket.emit('error', { message: 'Invalid symbols' });
          return;
        }

        // Update subscribed symbols
        data.symbols.forEach(symbol => socketData.symbols.add(symbol.toUpperCase()));

        // If already subscribed, update subscription
        if (socketData.subscriptionId) {
          await marketService.unsubscribeFromRealtime(socketData.subscriptionId);
        }

        // Subscribe to real-time updates
        const subscriptionId = await marketService.subscribeToRealtime(
          Array.from(socketData.symbols),
          userId,
          (quote: Quote) => {
            // Send quote update to this specific socket
            socket.emit('quote', quote);
          }
        );

        socketData.subscriptionId = subscriptionId;
        socket.emit('subscribed', { symbols: Array.from(socketData.symbols) });

        logger.info(`Socket ${socket.id} subscribed to: ${Array.from(socketData.symbols).join(', ')}`);
      } catch (error) {
        logger.error('Subscription error:', error);
        socket.emit('error', { message: 'Subscription failed' });
      }
    });

    // Handle symbol unsubscription
    socket.on('unsubscribe', async (data: { symbols: string[] }) => {
      try {
        const socketData = activeSockets.get(socket.id);
        if (!socketData) return;

        // Remove symbols from subscription
        data.symbols.forEach(symbol => socketData.symbols.delete(symbol.toUpperCase()));

        // Update subscription
        if (socketData.subscriptionId) {
          await marketService.unsubscribeFromRealtime(socketData.subscriptionId);
        }

        if (socketData.symbols.size > 0) {
          // Re-subscribe with remaining symbols
          const subscriptionId = await marketService.subscribeToRealtime(
            Array.from(socketData.symbols),
            userId,
            (quote: Quote) => {
              socket.emit('quote', quote);
            }
          );
          socketData.subscriptionId = subscriptionId;
        }

        socket.emit('unsubscribed', { symbols: data.symbols });
      } catch (error) {
        logger.error('Unsubscription error:', error);
        socket.emit('error', { message: 'Unsubscription failed' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      try {
        const socketData = activeSockets.get(socket.id);
        if (socketData?.subscriptionId) {
          await marketService.unsubscribeFromRealtime(socketData.subscriptionId);
        }
        activeSockets.delete(socket.id);
        logger.info(`Market WebSocket disconnected: ${socket.id}`);
      } catch (error) {
        logger.error('Disconnect cleanup error:', error);
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`Market WebSocket error for ${socket.id}:`, error);
    });
  });

  // Broadcast market alerts to all connected users
  setInterval(async () => {
    try {
      await marketService.checkAlerts();
    } catch (error) {
      logger.error('Alert check error:', error);
    }
  }, 60000); // Check every minute

  return marketNamespace;
}