import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';
import * as nodemailer from 'nodemailer';
@Injectable()
export class InvitesService {
  private transporter;
  constructor(private prisma: PrismaService) {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER, // your@gmail.com
        pass: process.env.SMTP_PASS, // App Password (16 chars)
      },
    });
  }

  async createInvite(
    teamId: string,
    inviterId: string,
    data: { email: string; role: 'admin' | 'manager' | 'member' },
  ) {
    const membership = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: inviterId } },
    });

    if (!membership || !['admin', 'manager'].includes(membership.role)) {
      throw new ForbiddenException('Only admin/manager can invite');
    }

    const existing = await this.prisma.teamInvite.findFirst({
      where: { teamId, email: data.email, used: false },
    });

    if (existing) {
      throw new BadRequestException('Invite already sent to this email');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await this.prisma.teamInvite.create({
      data: {
        teamId,
        email: data.email.toLowerCase(),
        token,
        role: data.role,
        invitedBy: inviterId,
        expiresAt,
      },
      include: {
        team: { select: { name: true } },
      },
    });

    // MOBILE DEEP LINK (tasker://join/token) + Web fallback
    const mobileLink = `tasker://join/${token}`;
    const webLink = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/join/${token}`;
    const inviteLink = mobileLink; // Primary for mobile

    // SEND REAL EMAIL (Beautiful HTML)
    try {
      await this.transporter.sendMail({
        from: '"Tasker Pro" <no-reply@tasker.et>',
        to: data.email,
        subject: `You've been invited to "${invite.team.name}"`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 500px; margin: auto; padding: 20px; background: #f9f9f9; border-radius: 16px;">
            <h2 style="color: #9333EA;">You're invited!</h2>
            <p><strong>${invite.team?.name || 'Team member'}</strong> invited you to join:</p>
            <h1 style="font-size: 24px; color: #1F2937;">${invite.team.name}</h1>
            <p style="color: #666;">Role: <strong>${data.role}</strong></p>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${mobileLink}" style="background: #9333EA; color: white; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 18px; display: inline-block;">
                Join Team Now
              </a>
            </div>
            
            <p style="font-size: 14px; color: #888; text-align: center;">
              Or open this link in Tasker app:<br>
              <code style="background: #eee; padding: 8px 12px; border-radius: 8px; font-size: 13px;">${mobileLink}</code>
            </p>
            
            <hr style="border: 1px dashed #ddd; margin: 30px 0;">
            <p style="font-size: 12px; color: #999; text-align: center;">
              This invitation expires in 7 days
            </p>
          </div>
        `,
      });
    } catch (error) {
      console.error('Email failed (but invite still created):', error);
      // Don't fail invite if email fails
    }

    return {
      ...invite,
      inviteLink: mobileLink,
      webLink,
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
