import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  // CREATE Project
  async create(
    userId: string,
    data: {
      name: string;
      description?: string;
      startDate?: string;
      endDate?: string;
      flag?: 'NORMAL' | 'URGENT' | 'CRITICAL';
      teamId?: string;
    },
  ) {
    // 1. Verify user actually exists (this prevents the "owner null" error)
    const userExists = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!userExists) {
      throw new BadRequestException('Invalid user ID');
    }

    // 2. If teamId provided → verify membership
    if (data.teamId) {
      const membership = await this.prisma.teamMember.findUnique({
        where: {
          teamId_userId: {
            teamId: data.teamId,
            userId: userId,
          },
        },
      });

      if (!membership) {
        throw new ForbiddenException('You are not a member of this team');
      }
    }

    // 3. Create project — SAFE include with fallback
    const project = await this.prisma.project.create({
      data: {
        name: data.name,
        description: data.description || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        flag: data.flag || 'NORMAL',
        teamId: data.teamId || null,
        ownerId: userId,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        team: data.teamId
          ? {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            }
          : false, // ← Only include team if teamId exists
        tasks: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return project;
  }
  // Get all my projects (personal + team)
  async findAllByUser(userId: string) {
    return this.prisma.project.findMany({
      where: {
        OR: [
          { ownerId: userId }, // My personal projects
          { team: { members: { some: { userId } } } }, // Projects in teams I'm in
        ],
      },
      include: {
        owner: {
          select: { id: true, name: true, avatar: true },
        },
        team: {
          select: { id: true, name: true },
        },
        _count: { select: { tasks: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
  // READ: Get all projects in a team
  async findAllByTeam(teamId: string, userId: string) {
    const isMember = await this.prisma.teamMember.count({
      where: { teamId, userId },
    });

    if (!isMember) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.project.findMany({
      where: { teamId },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        tasks: {
          include: { assignee: { select: { name: true, avatar: true } } },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // READ: Get single project
  async findOne(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        owner: true,
        team: { include: { members: { include: { user: true } } } },
        tasks: {
          include: {
            assignee: true,
            comments: { include: { author: true } },
            files: true,
          },
        },
      },
    });

    if (!project) throw new NotFoundException('Project not found');

    const isMember = await this.prisma.teamMember.count({
      where: { teamId: project.teamId!, userId },
    });

    if (!isMember) throw new ForbiddenException('Access denied');

    return project;
  }
 
  /**
   * GET ALL MEMBERS OF A PROJECT
   * Works for both team projects & personal projects
   * Returns rich user data + role in team
   */
  async getProjectMembers(projectId: string, requesterId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        teamId: true,
        ownerId: true,
      },
    });

    if (!project) throw new NotFoundException('Project not found');

    // Permission check
    const isOwner = project.ownerId === requesterId;
    const isTeamMember = project.teamId
      ? await this.prisma.teamMember.count({
          where: { teamId: project.teamId, userId: requesterId },
        })
      : 0;

    if (!isOwner && !isTeamMember) {
      throw new ForbiddenException('You do not have access to this project');
    }

    // CASE 1: Personal project → only owner
    if (!project.teamId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: project.ownerId },
        select: { id: true, name: true, avatar: true, email: true },
      });

      return {
        total: 1,
        members: [
          {
            ...owner!,
            role: 'Owner',
            joinedAt: null,
            isOnline: false, // optional: add later with Redis
          },
        ],
      };
    }

    // CASE 2: Team project → get all team members
    const teamMembers = await this.prisma.teamMember.findMany({
      where: { teamId: project.teamId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            email: true,
            // expoPushToken: true, // optional
          },
        },
      },
      orderBy: { role: 'asc' }, // admin → manager → member
    });

    const members = teamMembers.map((tm) => ({
      ...tm.user,
      role: tm.role.charAt(0).toUpperCase() + tm.role.slice(1), // "admin" → "Admin"
      joinedAt: tm.joinedAt,
      isOwner: tm.userId === project.ownerId,
    }));

    return {
      total: members.length,
      members,
      project: {
        id: project.id,
        name: project.name,
        isTeamProject: true,
      },
    };
  }
  //.UPDATE Project
  async update(id: string, userId: string, data: any) {
    const project = await this.prisma.project.findUnique({ where: { id } });

    if (!project) throw new NotFoundException('Project not found');

    const isMember = await this.prisma.teamMember.findFirst({
      where: {
        teamId: project.teamId!,
        userId,
        role: { in: ['admin', 'manager'] },
      },
    });

    if (!isMember && project.ownerId !== userId) {
      throw new ForbiddenException('Only owner or admin/manager can update');
    }

    return this.prisma.project.update({
      where: { id },
      data,
      include: { owner: true, tasks: true },
    });
  }

  // DELETE Project
  async remove(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });

    if (!project) throw new NotFoundException('Project not found');

    const isAdmin = await this.prisma.teamMember.findFirst({
      where: { teamId: project.teamId!, userId, role: 'admin' },
    });

    if (!isAdmin && project.ownerId !== userId) {
      throw new ForbiddenException('Only owner or team admin can delete');
    }

    return this.prisma.project.delete({ where: { id } });
  }
}
