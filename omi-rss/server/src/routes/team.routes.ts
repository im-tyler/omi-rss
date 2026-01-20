import { Router } from 'express';
import { teamService } from '../services/collaboration/team.service';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Schemas
const createTeamSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    isPublic: z.boolean().optional(),
  }),
});

const inviteMemberSchema = z.object({
  body: z.object({
    email: z.string().email(),
    role: z.enum(['admin', 'member']).optional(),
  }),
});

const updateRoleSchema = z.object({
  body: z.object({
    role: z.enum(['admin', 'member']),
  }),
});

const shareFolderSchema = z.object({
  body: z.object({
    folderId: z.string().uuid(),
    permissions: z.object({
      read: z.boolean(),
      write: z.boolean(),
      admin: z.boolean(),
    }).optional(),
  }),
});

// Routes

// Get user's teams
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const teams = await teamService.getUserTeams(req.user!.id);
    res.json({ teams });
  } catch (error) {
    next(error);
  }
});

// Create new team
router.post('/', authenticateToken, validate(createTeamSchema), async (req, res, next) => {
  try {
    const team = await teamService.createTeam(req.user!.id, req.body);
    res.status(201).json({ team });
  } catch (error) {
    next(error);
  }
});

// Get team details
router.get('/:teamId', authenticateToken, async (req, res, next) => {
  try {
    const team = await teamService.getTeam(req.params.teamId, req.user!.id);
    res.json({ team });
  } catch (error) {
    next(error);
  }
});

// Update team
router.patch('/:teamId', authenticateToken, validate(createTeamSchema), async (req, res, next) => {
  try {
    const team = await teamService.updateTeam(req.params.teamId, req.user!.id, req.body);
    res.json({ team });
  } catch (error) {
    next(error);
  }
});

// Delete team
router.delete('/:teamId', authenticateToken, async (req, res, next) => {
  try {
    await teamService.deleteTeam(req.params.teamId, req.user!.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get team members
router.get('/:teamId/members', authenticateToken, async (req, res, next) => {
  try {
    const members = await teamService.getTeamMembers(req.params.teamId, req.user!.id);
    res.json({ members });
  } catch (error) {
    next(error);
  }
});

// Invite member
router.post('/:teamId/members/invite', authenticateToken, validate(inviteMemberSchema), async (req, res, next) => {
  try {
    const member = await teamService.inviteMember(req.params.teamId, req.user!.id, req.body);
    res.status(201).json({ member });
  } catch (error) {
    next(error);
  }
});

// Remove member
router.delete('/:teamId/members/:memberId', authenticateToken, async (req, res, next) => {
  try {
    await teamService.removeMember(req.params.teamId, req.user!.id, req.params.memberId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Update member role
router.patch('/:teamId/members/:memberId/role', authenticateToken, validate(updateRoleSchema), async (req, res, next) => {
  try {
    const member = await teamService.updateMemberRole(
      req.params.teamId,
      req.user!.id,
      req.params.memberId,
      req.body.role
    );
    res.json({ member });
  } catch (error) {
    next(error);
  }
});

// Share folder with team
router.post('/:teamId/shared-folders', authenticateToken, validate(shareFolderSchema), async (req, res, next) => {
  try {
    const sharedFolder = await teamService.shareFolder(
      req.params.teamId,
      req.body.folderId,
      req.user!.id,
      req.body.permissions
    );
    res.status(201).json({ sharedFolder });
  } catch (error) {
    next(error);
  }
});

// Get shared folders
router.get('/:teamId/shared-folders', authenticateToken, async (req, res, next) => {
  try {
    const sharedFolders = await teamService.getSharedFolders(req.params.teamId, req.user!.id);
    res.json({ sharedFolders });
  } catch (error) {
    next(error);
  }
});

export default router;