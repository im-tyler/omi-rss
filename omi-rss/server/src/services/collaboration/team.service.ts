import { getDb } from '../../database';
import { 
  teams, 
  teamMembers, 
  users,
  sharedFolders,
  folders,
} from '../../database/schema';
import { eq, and, or, desc, sql } from 'drizzle-orm';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { sendNotificationToUser } from '../socket.service';

export interface CreateTeamData {
  name: string;
  description?: string;
  isPublic?: boolean;
}

export interface InviteMemberData {
  email: string;
  role?: 'admin' | 'member';
}

export class TeamService {
  async createTeam(userId: string, data: CreateTeamData) {
    const db = getDb();

    const [team] = await db
      .insert(teams)
      .values({
        name: data.name,
        description: data.description,
        isPublic: data.isPublic || false,
        ownerId: userId,
      })
      .returning();

    // Add owner as member
    await db
      .insert(teamMembers)
      .values({
        teamId: team.id,
        userId,
        role: 'owner',
      });

    logger.info(`Team created: ${team.id} by user ${userId}`);
    return team;
  }

  async getTeam(teamId: string, userId: string) {
    const db = getDb();

    // Check if user is member
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

    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      throw new AppError('Team not found', 404);
    }

    // If private team, user must be member
    if (!team.isPublic && !member) {
      throw new AppError('Access denied', 403);
    }

    // Get member count
    const [{ memberCount }] = await db
      .select({ memberCount: sql<number>`COUNT(*)` })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));

    return {
      ...team,
      memberCount: Number(memberCount),
      userRole: member?.role || null,
    };
  }

  async getUserTeams(userId: string) {
    const db = getDb();

    const userTeams = await db
      .select({
        id: teams.id,
        name: teams.name,
        description: teams.description,
        avatarUrl: teams.avatarUrl,
        isPublic: teams.isPublic,
        ownerId: teams.ownerId,
        createdAt: teams.createdAt,
        role: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
        memberCount: sql<number>`
          (SELECT COUNT(*) FROM ${teamMembers} tm WHERE tm.team_id = ${teams.id})
        `,
      })
      .from(teams)
      .innerJoin(teamMembers, eq(teams.id, teamMembers.teamId))
      .where(eq(teamMembers.userId, userId))
      .orderBy(desc(teamMembers.joinedAt));

    return userTeams;
  }

  async updateTeam(teamId: string, userId: string, data: Partial<CreateTeamData>) {
    const db = getDb();

    // Check if user is owner or admin
    const member = await this.checkTeamPermission(teamId, userId, ['owner', 'admin']);

    const [updatedTeam] = await db
      .update(teams)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId))
      .returning();

    return updatedTeam;
  }

  async deleteTeam(teamId: string, userId: string) {
    const db = getDb();

    // Only owner can delete team
    await this.checkTeamPermission(teamId, userId, ['owner']);

    await db
      .delete(teams)
      .where(eq(teams.id, teamId));

    logger.info(`Team deleted: ${teamId} by user ${userId}`);
  }

  async inviteMember(teamId: string, inviterId: string, data: InviteMemberData) {
    const db = getDb();

    // Check if inviter has permission
    await this.checkTeamPermission(teamId, inviterId, ['owner', 'admin']);

    // Find user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check if already member
    const [existingMember] = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, user.id)
        )
      )
      .limit(1);

    if (existingMember) {
      throw new AppError('User is already a team member', 409);
    }

    // Add member
    const [member] = await db
      .insert(teamMembers)
      .values({
        teamId,
        userId: user.id,
        role: data.role || 'member',
        invitedBy: inviterId,
      })
      .returning();

    // Get team details for notification
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    // Send notification
    await sendNotificationToUser(user.id, {
      type: 'team_invitation',
      title: 'Team Invitation',
      message: `You've been invited to join team "${team.name}"`,
      data: { teamId, inviterId },
    });

    return member;
  }

  async removeMember(teamId: string, userId: string, memberId: string) {
    const db = getDb();

    // Check permissions
    const member = await this.checkTeamPermission(teamId, userId, ['owner', 'admin']);

    // Can't remove owner
    const [targetMember] = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, memberId)
        )
      )
      .limit(1);

    if (!targetMember) {
      throw new AppError('Member not found', 404);
    }

    if (targetMember.role === 'owner') {
      throw new AppError('Cannot remove team owner', 403);
    }

    // Only owner can remove admins
    if (targetMember.role === 'admin' && member.role !== 'owner') {
      throw new AppError('Only owner can remove admins', 403);
    }

    await db
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, memberId)
        )
      );
  }

  async updateMemberRole(teamId: string, userId: string, memberId: string, newRole: 'admin' | 'member') {
    const db = getDb();

    // Only owner can update roles
    await this.checkTeamPermission(teamId, userId, ['owner']);

    const [updatedMember] = await db
      .update(teamMembers)
      .set({ role: newRole })
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, memberId),
          sql`${teamMembers.role} != 'owner'` // Can't change owner role
        )
      )
      .returning();

    if (!updatedMember) {
      throw new AppError('Member not found or cannot update owner role', 404);
    }

    return updatedMember;
  }

  async getTeamMembers(teamId: string, userId: string) {
    const db = getDb();

    // Check if user has access
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      throw new AppError('Team not found', 404);
    }

    if (!team.isPublic) {
      await this.checkTeamPermission(teamId, userId, ['owner', 'admin', 'member']);
    }

    const members = await db
      .select({
        id: teamMembers.id,
        userId: teamMembers.userId,
        role: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
        email: users.email,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        avatarUrl: users.avatarUrl,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(
        sql`CASE ${teamMembers.role} 
          WHEN 'owner' THEN 1 
          WHEN 'admin' THEN 2 
          ELSE 3 
        END`,
        teamMembers.joinedAt
      );

    return members;
  }

  async shareFolder(teamId: string, folderId: string, userId: string, permissions?: any) {
    const db = getDb();

    // Check if user owns the folder
    const [folder] = await db
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.id, folderId),
          eq(folders.userId, userId)
        )
      )
      .limit(1);

    if (!folder) {
      throw new AppError('Folder not found or access denied', 404);
    }

    // Check if user is team member
    await this.checkTeamPermission(teamId, userId, ['owner', 'admin', 'member']);

    // Share folder
    const [shared] = await db
      .insert(sharedFolders)
      .values({
        folderId,
        teamId,
        permissions: permissions || { read: true, write: false, admin: false },
        sharedBy: userId,
      })
      .onConflictDoUpdate({
        target: [sharedFolders.folderId, sharedFolders.teamId],
        set: {
          permissions: permissions || { read: true, write: false, admin: false },
          sharedAt: new Date(),
        },
      })
      .returning();

    // Notify team members
    const members = await this.getTeamMembers(teamId, userId);
    for (const member of members) {
      if (member.userId !== userId) {
        await sendNotificationToUser(member.userId, {
          type: 'folder_shared',
          title: 'Folder Shared',
          message: `${folder.name} has been shared with your team`,
          data: { teamId, folderId },
        });
      }
    }

    return shared;
  }

  async getSharedFolders(teamId: string, userId: string) {
    const db = getDb();

    // Check if user is team member
    await this.checkTeamPermission(teamId, userId, ['owner', 'admin', 'member']);

    const sharedFoldersList = await db
      .select({
        id: sharedFolders.id,
        folderId: sharedFolders.folderId,
        permissions: sharedFolders.permissions,
        sharedAt: sharedFolders.sharedAt,
        sharedBy: sharedFolders.sharedBy,
        folderName: folders.name,
        folderColor: folders.color,
        folderIcon: folders.icon,
        sharedByName: users.username,
      })
      .from(sharedFolders)
      .innerJoin(folders, eq(sharedFolders.folderId, folders.id))
      .innerJoin(users, eq(sharedFolders.sharedBy, users.id))
      .where(eq(sharedFolders.teamId, teamId))
      .orderBy(desc(sharedFolders.sharedAt));

    return sharedFoldersList;
  }

  private async checkTeamPermission(teamId: string, userId: string, allowedRoles: string[]) {
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

    if (!member || !allowedRoles.includes(member.role)) {
      throw new AppError('Insufficient permissions', 403);
    }

    return member;
  }
}

export const teamService = new TeamService();