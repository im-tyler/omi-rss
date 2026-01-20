import Queue from 'bull';
import { contentGenerator } from '../services/content/generator';
import { contentExporter } from '../services/content/exporter';
import { logger } from '../utils/logger';
import { getDb } from '../database';
import { ContentType, ContentJob } from '../services/content/types';

export function contentWorker(queue: Queue.Queue) {
  // Process content generation jobs
  queue.process('generate', async (job) => {
    const { type, userId, options } = job.data;

    try {
      logger.info(`Processing content generation job ${job.id} - Type: ${type}`);

      let result;

      switch (type) {
        case ContentType.NEWSLETTER:
          result = await contentGenerator.generateNewsletter(userId, options);
          break;
        case ContentType.PODCAST_SCRIPT:
          result = await contentGenerator.generatePodcastScript(userId, options);
          break;
        case ContentType.SOCIAL_MEDIA:
          result = await contentGenerator.generateSocialPosts(userId, options);
          break;
        case ContentType.THREAD:
          result = await contentGenerator.generateThreadSummary(userId, options);
          break;
        case ContentType.NOTES:
          result = await contentGenerator.generateReadingNotes(userId, options);
          break;
        default:
          throw new Error(`Unsupported content type: ${type}`);
      }

      logger.info(`Content generation completed for job ${job.id}`);
      return result;
    } catch (error) {
      logger.error('Content generation job failed:', error);
      throw error;
    }
  });

  // Process content export jobs
  queue.process('export', async (job) => {
    const { content, options } = job.data;

    try {
      logger.info(`Processing content export job ${job.id} - Format: ${options.format}`);

      const filepath = await contentExporter.export(content, options);

      logger.info(`Content export completed: ${filepath}`);
      return { filepath };
    } catch (error) {
      logger.error('Content export job failed:', error);
      throw error;
    }
  });

  // Process scheduled content generation
  queue.process('scheduled-generate', async (job) => {
    const { type, userId, options, schedule } = job.data;

    try {
      logger.info(`Processing scheduled content generation: ${type} for user ${userId}`);

      // Generate content based on schedule
      let result;
      
      switch (type) {
        case 'daily-newsletter':
          result = await contentGenerator.generateNewsletter(userId, {
            timeRange: 24,
            style: options.style || 'casual',
            maxArticles: 10,
          });
          break;
        case 'weekly-digest':
          result = await contentGenerator.generateNewsletter(userId, {
            timeRange: 168, // 7 days
            style: options.style || 'formal',
            maxArticles: 20,
            sections: ['highlights', 'analysis', 'recommendations'],
          });
          break;
        default:
          throw new Error(`Unknown scheduled content type: ${type}`);
      }

      // Queue notification to user
      if (result && options.notifyOnComplete) {
        await job.queue.add('send-notification', {
          userId,
          type: 'content-ready',
          title: `Your ${type} is ready`,
          content: result,
        });
      }

      return result;
    } catch (error) {
      logger.error('Scheduled content generation failed:', error);
      throw error;
    }
  });

  // Process content cleanup
  queue.process('cleanup-exports', async (job) => {
    try {
      const deletedCount = await contentExporter.cleanupOldExports(7);
      logger.info(`Cleaned up ${deletedCount} old export files`);
      return { deletedCount };
    } catch (error) {
      logger.error('Export cleanup failed:', error);
      throw error;
    }
  });

  // Error handling
  queue.on('failed', (job, err) => {
    logger.error(`Content job ${job.id} failed:`, err);
  });

  queue.on('completed', (job) => {
    logger.info(`Content job ${job.id} completed`);
  });

  queue.on('stalled', (job) => {
    logger.warn(`Content job ${job.id} stalled`);
  });

  logger.info('Content worker initialized');
}

// Schedule recurring content generation
export async function scheduleContentJobs(queue: Queue.Queue) {
  // Daily newsletter at 8 AM
  await queue.add(
    'scheduled-generate',
    {
      type: 'daily-newsletter',
      schedule: 'daily',
    },
    {
      repeat: {
        cron: '0 8 * * *',
      },
    }
  );

  // Weekly digest on Sundays at 9 AM
  await queue.add(
    'scheduled-generate',
    {
      type: 'weekly-digest',
      schedule: 'weekly',
    },
    {
      repeat: {
        cron: '0 9 * * 0',
      },
    }
  );

  // Cleanup old exports daily at 3 AM
  await queue.add(
    'cleanup-exports',
    {},
    {
      repeat: {
        cron: '0 3 * * *',
      },
    }
  );

  logger.info('Scheduled content jobs configured');
}