import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';

@Injectable()
export class InvitesService {
  constructor(private prisma: PrismaService) {}

  // CREATE INVITE (Admin/Owner only)
  async createInvite(
    teamId: string,
    inviterId: string,
    data: { email: string; role: 'admin' | 'manager' | 'member' },
  ) {
    // Check if inviter is admin/manager in the team
    const membership = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: inviterId } },
    });

    if (!membership || !['admin', 'manager'].includes(membership.role)) {
      throw new ForbiddenException('Only admin/manager can invite');
    }

    // Prevent duplicate pending invites
    const existing = await this.prisma.teamInvite.findFirst({
      where: { teamId, email: data.email, used: false },
    });

    if (existing) {
      throw new BadRequestException('Invite already sent to this email');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await this.prisma.teamInvite.create({
      data: {
        teamId,
        email: data.email,
        token,
        role: data.role,
        invitedBy: inviterId,
        expiresAt,
      },
      include: {
        team: { select: { name: true } },
      },
    });

    // Generate invite link
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/join/${token}`;

    return {
      ...invite,
      inviteLink,
      message: `Invite sent to ${data.email} – Link expires in 7 days`,
    };
  }

  // ACCEPT INVITE (via token link)
  async acceptInvite(token: string, userId: string) {
    const invite = await this.prisma.teamInvite.findUnique({
      where: { token },
      include: { team: true },
    });

    if (!invite) throw new NotFoundException('Invalid or expired invite');
    if (invite.used) throw new BadRequestException('Invite already used');
    if (invite.expiresAt < new Date())
      throw new BadRequestException('Invite expired');

    // Check if user is already in team
    const alreadyMember = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: invite.teamId, userId } },
    });

    if (alreadyMember) {
      // Just mark as used
      await this.prisma.teamInvite.update({
        where: { id: invite.id },
        data: { used: true },
      });
      return { message: 'You are already a member', team: invite.team };
    }

    // Add user to team
    const member = await this.prisma.teamMember.create({
      data: {
        teamId: invite.teamId,
        userId,
        role: invite.role,
      },
    });

    // Mark invite as used
    await this.prisma.teamInvite.update({
      where: { id: invite.id },
      data: { used: true },
    });

    return {
      message: 'Successfully joined team!',
      team: invite.team,
      role: member.role,
    };
  }

  // GET PENDING INVITES (for team admin)
  async getPendingInvites(teamId: string, userId: string) {
    const isAdmin = await this.prisma.teamMember.findFirst({
      where: { teamId, userId, role: { in: ['admin', 'manager'] } },
    });

    if (!isAdmin) throw new ForbiddenException('Access denied');

    return this.prisma.teamInvite.findMany({
      where: { teamId, used: false },
      include: { team: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // CANCEL INVITE (admin only)
  async cancelInvite(inviteId: string, userId: string) {
    const invite = await this.prisma.teamInvite.findUnique({
      where: { id: inviteId },
    });

    if (!invite) throw new NotFoundException('Invite not found');

    const isAdmin = await this.prisma.teamMember.findFirst({
      where: {
        teamId: invite.teamId,
        userId,
        role: { in: ['admin', 'manager'] },
      },
    });

    if (!isAdmin) throw new ForbiddenException('Only admin/manager can cancel');

    await this.prisma.teamInvite.delete({ where: { id: inviteId } });

    return { message: 'Invite cancelled' };
  }
}
