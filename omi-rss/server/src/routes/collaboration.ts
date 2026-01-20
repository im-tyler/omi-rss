import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/authentication';
import { validate } from '../middleware/validation';
import { asyncHandler } from '../middleware/asyncHandler';
import { getCollaborationService } from '../services/collaboration';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

// Create a new collaboration session
router.post(
  '/sessions',
  authenticate,
  [
    body('folderId').isUUID().withMessage('Invalid folder ID'),
    body('type').isIn(['reading', 'annotation', 'discussion']).withMessage('Invalid session type'),
    body('articleId').optional().isUUID().withMessage('Invalid article ID'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { folderId, type, articleId } = req.body;
    const userId = req.user!.id;

    const collaborationService = getCollaborationService();
    const session = await collaborationService.createSession(
      userId,
      folderId,
      type,
      articleId
    );

    res.status(201).json({
      success: true,
      data: session,
    });
  })
);

// Join an existing session
router.post(
  '/sessions/:sessionId/join',
  authenticate,
  [
    param('sessionId').isUUID().withMessage('Invalid session ID'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    const collaborationService = getCollaborationService();
    const joined = await collaborationService.joinSession(sessionId, userId);

    if (!joined) {
      throw new AppError('Unable to join session', 400);
    }

    res.json({
      success: true,
      message: 'Successfully joined session',
    });
  })
);

// Leave a session
router.post(
  '/sessions/:sessionId/leave',
  authenticate,
  [
    param('sessionId').isUUID().withMessage('Invalid session ID'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    const collaborationService = getCollaborationService();
    await collaborationService.leaveSession(sessionId, userId);

    res.json({
      success: true,
      message: 'Left session',
    });
  })
);

// End a session (host only)
router.post(
  '/sessions/:sessionId/end',
  authenticate,
  [
    param('sessionId').isUUID().withMessage('Invalid session ID'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    const collaborationService = getCollaborationService();
    
    // Verify user is host
    const session = await collaborationService.getSession(sessionId);
    if (!session || session.hostUserId !== userId) {
      throw new AppError('Unauthorized to end session', 403);
    }

    await collaborationService.endSession(sessionId);

    res.json({
      success: true,
      message: 'Session ended',
    });
  })
);

// Get active sessions for a folder
router.get(
  '/folders/:folderId/sessions',
  authenticate,
  [
    param('folderId').isUUID().withMessage('Invalid folder ID'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { folderId } = req.params;

    const collaborationService = getCollaborationService();
    const sessions = await collaborationService.getActiveSessions(folderId);

    res.json({
      success: true,
      data: sessions,
    });
  })
);

// Update presence
router.post(
  '/presence',
  authenticate,
  [
    body('folderId').isUUID().withMessage('Invalid folder ID'),
    body('status').isIn(['online', 'idle', 'offline']).withMessage('Invalid status'),
    body('currentArticleId').optional().isUUID().withMessage('Invalid article ID'),
    body('cursorPosition').optional().isObject(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { folderId, status, currentArticleId, cursorPosition } = req.body;
    const userId = req.user!.id;

    const collaborationService = getCollaborationService();
    await collaborationService.updatePresence(
      userId,
      folderId,
      status,
      currentArticleId,
      cursorPosition
    );

    res.json({
      success: true,
      message: 'Presence updated',
    });
  })
);

// Get folder presence
router.get(
  '/folders/:folderId/presence',
  authenticate,
  [
    param('folderId').isUUID().withMessage('Invalid folder ID'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { folderId } = req.params;

    const collaborationService = getCollaborationService();
    const presence = await collaborationService.getFolderPresence(folderId);

    res.json({
      success: true,
      data: presence,
    });
  })
);

// Create annotation
router.post(
  '/annotations',
  authenticate,
  [
    body('sessionId').isUUID().withMessage('Invalid session ID'),
    body('articleId').isUUID().withMessage('Invalid article ID'),
    body('type').isIn(['highlight', 'comment', 'reaction']).withMessage('Invalid annotation type'),
    body('content').optional().isString(),
    body('color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Invalid color format'),
    body('emoji').optional().isString(),
    body('range').optional().isObject(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { sessionId, articleId, ...annotationData } = req.body;

    const collaborationService = getCollaborationService();
    const annotation = await collaborationService.createAnnotation(
      sessionId,
      userId,
      articleId,
      annotationData
    );

    res.status(201).json({
      success: true,
      data: annotation,
    });
  })
);

// Update annotation
router.put(
  '/annotations/:annotationId',
  authenticate,
  [
    param('annotationId').isUUID().withMessage('Invalid annotation ID'),
    body('content').optional().isString(),
    body('color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Invalid color format'),
    body('emoji').optional().isString(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { annotationId } = req.params;
    const userId = req.user!.id;
    const updates = req.body;

    const collaborationService = getCollaborationService();
    await collaborationService.updateAnnotation(annotationId, userId, updates);

    res.json({
      success: true,
      message: 'Annotation updated',
    });
  })
);

// Delete annotation
router.delete(
  '/annotations/:annotationId',
  authenticate,
  [
    param('annotationId').isUUID().withMessage('Invalid annotation ID'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { annotationId } = req.params;
    const userId = req.user!.id;

    const collaborationService = getCollaborationService();
    await collaborationService.deleteAnnotation(annotationId, userId);

    res.json({
      success: true,
      message: 'Annotation deleted',
    });
  })
);

// Get article annotations
router.get(
  '/articles/:articleId/annotations',
  authenticate,
  [
    param('articleId').isUUID().withMessage('Invalid article ID'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { articleId } = req.params;

    const collaborationService = getCollaborationService();
    const annotations = await collaborationService.getArticleAnnotations(articleId);

    res.json({
      success: true,
      data: annotations,
    });
  })
);

// Broadcast reading progress
router.post(
  '/reading-progress',
  authenticate,
  [
    body('sessionId').isUUID().withMessage('Invalid session ID'),
    body('articleId').isUUID().withMessage('Invalid article ID'),
    body('progress').isFloat({ min: 0, max: 100 }).withMessage('Invalid progress value'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { sessionId, articleId, progress } = req.body;
    const userId = req.user!.id;

    const collaborationService = getCollaborationService();
    await collaborationService.broadcastReadingProgress(
      sessionId,
      userId,
      articleId,
      progress
    );

    res.json({
      success: true,
      message: 'Progress broadcasted',
    });
  })
);

// Get session reading progress
router.get(
  '/sessions/:sessionId/reading-progress',
  authenticate,
  [
    param('sessionId').isUUID().withMessage('Invalid session ID'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const collaborationService = getCollaborationService();
    const progress = await collaborationService.getSessionReadingProgress(sessionId);

    res.json({
      success: true,
      data: Object.fromEntries(progress),
    });
  })
);

// Invite users to session
router.post(
  '/sessions/:sessionId/invite',
  authenticate,
  [
    param('sessionId').isUUID().withMessage('Invalid session ID'),
    body('userIds').isArray().withMessage('User IDs must be an array'),
    body('userIds.*').isUUID().withMessage('Invalid user ID in array'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { userIds } = req.body;
    const inviterId = req.user!.id;

    const collaborationService = getCollaborationService();
    await collaborationService.inviteToSession(sessionId, inviterId, userIds);

    res.json({
      success: true,
      message: 'Invitations sent',
    });
  })
);

export default router;