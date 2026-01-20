import { Router } from 'express';
import { contentGenerator } from '../services/content/generator';
import { contentExporter } from '../services/content/exporter';
import { getTemplateById, getTemplatesByType } from '../services/content/templates';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { z } from 'zod';
import { ContentType } from '../services/content/types';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Schemas
const generateNewsletterSchema = z.object({
  body: z.object({
    feedIds: z.array(z.string().uuid()).optional(),
    timeRange: z.number().min(1).max(168).optional(), // max 1 week
    maxArticles: z.number().min(1).max(50).optional(),
    style: z.enum(['formal', 'casual', 'technical']).optional(),
    sections: z.array(z.string()).optional(),
  }),
});

const generatePodcastSchema = z.object({
  body: z.object({
    articleIds: z.array(z.string().uuid()).min(1).max(10),
    duration: z.number().min(5).max(60).optional(),
    style: z.enum(['conversational', 'news', 'educational']).optional(),
    includeIntro: z.boolean().optional(),
    includeOutro: z.boolean().optional(),
  }),
});

const generateSocialSchema = z.object({
  body: z.object({
    articleId: z.string().uuid(),
    platforms: z.array(z.enum(['twitter', 'linkedin', 'facebook', 'instagram'])).min(1),
    tone: z.enum(['professional', 'casual', 'humorous', 'informative']).optional(),
    includeHashtags: z.boolean().optional(),
    includeEmojis: z.boolean().optional(),
  }),
});

const generateThreadSchema = z.object({
  body: z.object({
    feedId: z.string().uuid().optional(),
    topic: z.string().optional(),
    articleCount: z.number().min(1).max(20).optional(),
    threadLength: z.number().min(3).max(25).optional(),
    style: z.enum(['academic', 'business', 'casual']).optional(),
  }),
});

const generateNotesSchema = z.object({
  body: z.object({
    articleId: z.string().uuid(),
    style: z.enum(['cornell', 'outline', 'mindmap', 'summary']).optional(),
    includeQuotes: z.boolean().optional(),
    includeQuestions: z.boolean().optional(),
    includeActionItems: z.boolean().optional(),
  }),
});

const exportContentSchema = z.object({
  body: z.object({
    format: z.enum(['pdf', 'docx', 'html', 'markdown', 'epub']),
    styling: z.object({
      font: z.string().optional(),
      fontSize: z.number().optional(),
      lineHeight: z.number().optional(),
      margins: z.record(z.number()).optional(),
      colors: z.record(z.string()).optional(),
    }).optional(),
    metadata: z.object({
      title: z.string().optional(),
      author: z.string().optional(),
      subject: z.string().optional(),
      keywords: z.array(z.string()).optional(),
    }).optional(),
    includeImages: z.boolean().optional(),
    includeLinks: z.boolean().optional(),
    watermark: z.string().optional(),
  }),
});

// Routes

// Get available templates
router.get('/templates', authenticateToken, async (req, res, next) => {
  try {
    const { type } = req.query;
    
    let templates;
    if (type) {
      templates = getTemplatesByType(type as ContentType);
    } else {
      // Return all public templates
      templates = require('../services/content/templates').defaultTemplates.filter((t: any) => t.isPublic);
    }

    res.json({ templates });
  } catch (error) {
    next(error);
  }
});

// Generate newsletter
router.post('/generate/newsletter', authenticateToken, validate(generateNewsletterSchema), async (req, res, next) => {
  try {
    const content = await contentGenerator.generateNewsletter(req.user!.id, req.body);
    res.json({ content });
  } catch (error) {
    next(error);
  }
});

// Generate podcast script
router.post('/generate/podcast', authenticateToken, validate(generatePodcastSchema), async (req, res, next) => {
  try {
    const content = await contentGenerator.generatePodcastScript(req.user!.id, req.body);
    res.json({ content });
  } catch (error) {
    next(error);
  }
});

// Generate social media posts
router.post('/generate/social', authenticateToken, validate(generateSocialSchema), async (req, res, next) => {
  try {
    const posts = await contentGenerator.generateSocialPosts(req.user!.id, req.body);
    res.json({ posts });
  } catch (error) {
    next(error);
  }
});

// Generate thread summary
router.post('/generate/thread', authenticateToken, validate(generateThreadSchema), async (req, res, next) => {
  try {
    const content = await contentGenerator.generateThreadSummary(req.user!.id, req.body);
    res.json({ content });
  } catch (error) {
    next(error);
  }
});

// Generate reading notes
router.post('/generate/notes', authenticateToken, validate(generateNotesSchema), async (req, res, next) => {
  try {
    const content = await contentGenerator.generateReadingNotes(req.user!.id, req.body);
    res.json({ content });
  } catch (error) {
    next(error);
  }
});

// Export content
router.post('/export', authenticateToken, validate(exportContentSchema), async (req, res, next) => {
  try {
    const { content, ...exportOptions } = req.body;
    
    if (!content || !content.type || !content.title || !content.content) {
      throw new AppError('Invalid content object', 400);
    }

    const filepath = await contentExporter.export(content, exportOptions);
    res.json({ filepath });
  } catch (error) {
    next(error);
  }
});

// Get content generation history
router.get('/history', authenticateToken, async (req, res, next) => {
  try {
    // TODO: Implement content history tracking
    res.json({ 
      history: [],
      message: 'Content history tracking coming soon' 
    });
  } catch (error) {
    next(error);
  }
});

// Generate content with template
router.post('/generate/template/:templateId', authenticateToken, async (req, res, next) => {
  try {
    const template = getTemplateById(req.params.templateId);
    if (!template) {
      throw new AppError('Template not found', 404);
    }

    // TODO: Implement template-based generation
    res.json({ 
      message: 'Template-based generation coming soon',
      template 
    });
  } catch (error) {
    next(error);
  }
});

export default router;