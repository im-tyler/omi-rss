import Queue from 'bull';
import { marketService } from '../services/market';
import { logger } from '../utils/logger';

export function priceAlertWorker(queue: Queue.Queue) {
  // Check price alerts periodically
  queue.process('check-price-alerts', async (job) => {
    logger.info('Starting price alert check');
    
    try {
      await marketService.checkAlerts();
      logger.info('Price alert check completed');
      
      return { 
        success: true, 
        timestamp: new Date() 
      };
    } catch (error) {
      logger.error('Price alert check failed:', error);
      throw error;
    }
  });

  // Schedule periodic checks (every minute during market hours)
  queue.add(
    'check-price-alerts',
    {},
    {
      repeat: {
        cron: '* * * * *', // Every minute
      },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  logger.info('Price alert worker initialized');
}