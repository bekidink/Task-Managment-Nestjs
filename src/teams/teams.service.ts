// src/teams/teams.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  
  async create(
    userId: string,
    data: { name: string; avatar?: string; privacy?: 'private' | 'public' },
  ) {
    return this.prisma.team.create({
      data: {
        name: data.name,
        avatar: data.avatar,
        privacy: data.privacy || 'private',
        createdBy: userId,
        chatRoom: { create: {} },
      },
      include: {
        members: { include: { user: true } },
        chatRoom: true,
        projects: true,
      },
    });
  }

  async addMember(teamId: string, userId: string, role = 'member') {
    return this.prisma.teamMember.create({
      data: { teamId, userId, role },
    });
  }

  async getMyTeams(userId: string) {
    return this.prisma.team.findMany({
      where: { members: { some: { userId } } },
      include: { members: { include: { user: true } }, projects: true },
    });
  }
  // src/teams/teams.service.ts
  async findOne(id: string) {
    return this.prisma.team.findUnique({
      where: { id },
      include: { members: { include: { user: true } }, projects: true },
    });
  }

  async update(id: string, data: any) {
    return this.prisma.team.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.team.delete({ where: { id } });
  }

  async removeMember(teamId: string, userId: string) {
    return this.prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    });
  }
}
