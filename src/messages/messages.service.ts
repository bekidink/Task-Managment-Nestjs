import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  // SEND GROUP MESSAGE (Team Chat)
  async sendGroup(
    teamId: string,
    senderId: string,
    content: string,
    files?: Array<{
      url: string;
      name: string;
      size: number;
      mimeType: string;
    }>,
  ) {
    // Verify user is in team
    const membership = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: senderId } },
    });

    if (!membership) throw new ForbiddenException('You are not in this team');

    const chatRoom = await this.prisma.chatRoom.findUnique({
      where: { teamId },
    });

    if (!chatRoom) throw new NotFoundException('Chat room not found');

    const message = await this.prisma.message.create({
      data: {
        content,
        senderId,
        chatRoomId: chatRoom.id,
        files: files
          ? {
              create: files.map((f) => ({
                url: f.url,
                name: f.name,
                size: f.size,
                mimeType: f.mimeType,
                uploadedBy: senderId,
              })),
            }
          : undefined,
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        files: true,
      },
    });

    return message;
  }

  // SEND DIRECT MESSAGE (DM)
  async sendDM(
    senderId: string,
    receiverId: string,
    content: string,
    files?: Array<{
      url: string;
      name: string;
      size: number;
      mimeType: string;
    }>,
  ) {
    if (senderId === receiverId)
      throw new ForbiddenException('Cannot send message to yourself');

    const message = await this.prisma.message.create({
      data: {
        content,
        senderId,
        receiverId,
        files: files
          ? {
              create: files.map((f) => ({
                url: f.url,
                name: f.name,
                size: f.size,
                mimeType: f.mimeType,
                uploadedBy: senderId,
              })),
            }
          : undefined,
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        receiver: { select: { id: true, name: true, avatar: true } },
        files: true,
      },
    });

    return message;
  }

  // GET TEAM CHAT HISTORY
  async getTeamMessages(
    teamId: string,
    userId: string,
    limit = 50,
    before?: string,
  ) {
    const membership = await this.prisma.teamMember.count({
      where: { teamId, userId },
    });

    if (!membership) throw new ForbiddenException('Access denied');

    const chatRoom = await this.prisma.chatRoom.findUnique({
      where: { teamId },
    });
    if (!chatRoom) throw new NotFoundException('Chat room not found');

    return this.prisma.message.findMany({
      where: {
        chatRoomId: chatRoom.id,
        id: before ? { lt: before } : undefined,
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        files: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // GET DM HISTORY
  async getDMs(
    userId: string,
    otherUserId: string,
    limit = 50,
    before?: string,
  ) {
    return this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId },
        ],
        id: before ? { lt: before } : undefined,
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        files: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // MARK MESSAGE AS READ
  async markAsRead(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { receiver: true },
    });

    if (!message || message.receiverId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: { readAt: new Date() },
    });
  }

  // DELETE MESSAGE (soft or hard – optional)
  async deleteMessage(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.senderId !== userId) {
      throw new ForbiddenException('Cannot delete this message');
    }

    return this.prisma.message.delete({ where: { id: messageId } });
  }
}
