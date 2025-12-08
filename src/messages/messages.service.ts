// src/messages/messages.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  // SEND MESSAGE (Team or DM)
  async sendMessage(
    senderId: string,
    payload: {
      type: 'team' | 'dm';
      teamId?: string;
      receiverId?: string;
      content: string;
      files?: Array<{
        url: string;
        name: string;
        size: number;
        mimeType: string;
      }>;
      replyToId?: string;
    },
  ) {
    const { type, teamId, receiverId, content, files, replyToId } = payload;

    if (!content?.trim() && (!files || files.length === 0))
      throw new BadRequestException('Message cannot be empty');

    if (type === 'team' && !teamId)
      throw new BadRequestException('teamId required');
    if (type === 'dm' && !receiverId)
      throw new BadRequestException('receiverId required');
    if (type === 'dm' && receiverId === senderId)
      throw new BadRequestException('Cannot send message to yourself');

    // Access control
    if (type === 'team') {
      const member = await this.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: teamId!, userId: senderId } },
      });
      if (!member) throw new ForbiddenException('You are not in this team');
    }

    // Get chat room
    let chatRoomId: string | null = null;
    let finalReceiverId: string | null = null;

    if (type === 'team') {
      const room = await this.prisma.chatRoom.findUnique({ where: { teamId } });
      if (!room) throw new NotFoundException('Team chat room not found');
      console.log(room)
      chatRoomId = room.id;
    } 
console.log("body",payload)
    const message = await this.prisma.message.create({
      data: {
        content: content.trim(),
        senderId,
        chatRoomId,
        // receiverId: finalReceiverId!,
        replyToId,
        messageFiles: files
          ? { create: files.map((f) => ({ ...f, uploadedBy: senderId })) }
          : undefined,
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        receiver: { select: { id: true, name: true, avatar: true } },
        replyTo: {
          include: {
            sender: { select: { name: true } },
            messageFiles: { take: 1 },
          },
        },
        messageFiles: true,
      },
    });

    return {
      ...message,
      type,
      isMine: true,
      isRead: type === 'team',
    };
  }

  // GET CONVERSATION
  async getConversation(
    userId: string,
    params: {
      type: 'team' | 'dm';
      teamId?: string;
      otherUserId?: string;
      limit?: number;
      before?: string;
    },
  ) {
    const { type, teamId, otherUserId, limit = 30, before } = params;

    if (type === 'team' && !teamId)
      throw new BadRequestException('teamId required');
    if (type === 'dm' && !otherUserId)
      throw new BadRequestException('otherUserId required');

    // Access check
    if (type === 'team') {
      const member = await this.prisma.teamMember.count({
        where: { teamId: teamId!, userId },
      });
      if (!member) throw new ForbiddenException('Not in team');
    }

    const where: any = before ? { id: { lt: before } } : {};

    if (type === 'team') {
      const room = await this.prisma.chatRoom.findUnique({ where: { teamId } });
      if (!room) throw new NotFoundException('Chat room not found');
      where.chatRoomId = room.id;
    } else {
      where.OR = [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId },
      ];
    }

    const messages = await this.prisma.message.findMany({
      where,
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        receiver: { select: { id: true, name: true, avatar: true } },
        replyTo: { include: { sender: { select: { name: true } } } },
        messageFiles: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Auto mark DMs as read
    const toMarkRead = messages
      .filter(
        (m) => m.receiverId === userId && !m.readAt && m.chatRoomId === null,
      )
      .map((m) => m.id);

    if (toMarkRead.length > 0) {
      await this.prisma.message.updateMany({
        where: { id: { in: toMarkRead } },
        data: { readAt: new Date() },
      });
    }

    return messages.reverse().map((m) => ({
      ...m,
      isMine: m.senderId === userId,
      isRead: !!m.readAt || type === 'team',
      type,
    }));
  }

  // GET SINGLE MESSAGE BY ID
  async getMessageById(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        receiver: { select: { id: true, name: true, avatar: true } },
        chatRoom: { include: { team: { select: { name: true } } } },
        messageFiles: true,
        replyTo: { include: { sender: { select: { name: true } } } },
      },
    });

    if (!message) throw new NotFoundException('Message not found');

    const allowed =
      message.senderId === userId ||
      message.receiverId === userId ||
      (message.chatRoomId &&
        (await this.prisma.teamMember.count({
          where: { teamId: message.chatRoom!.teamId, userId },
        })));

    if (!allowed) throw new ForbiddenException();

    if (message.receiverId === userId && !message.readAt) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { readAt: new Date() },
      });
    }

    return {
      ...message,
      isMine: message.senderId === userId,
      type: message.chatRoomId ? 'team' : 'dm',
    };
  }

  // SEARCH MESSAGES
  async searchMessages(userId: string, q: string, limit = 30, offset = 0) {
    if (!q || q.trim().length < 2)
      throw new BadRequestException('Query too short');

    const results = await this.prisma.message.findMany({
      where: {
        content: { contains: q.trim(), mode: 'insensitive' },
        OR: [
          { senderId: userId },
          { receiverId: userId },
          { chatRoom: { team: { members: { some: { userId } } } } },
        ],
      },
      include: {
        sender: { select: { name: true, avatar: true } },
        chatRoom: { include: { team: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return results.map((m) => ({
      ...m,
      type: m.chatRoomId ? 'team' : 'dm',
      context: m.chatRoomId ? m.chatRoom!.team!.name : m.sender.name,
    }));
  }
  async markAsRead(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) throw new NotFoundException('Message not found');
    if (message.receiverId !== userId)
      throw new ForbiddenException('Not your message');

    return this.prisma.message.update({
      where: { id: messageId },
      data: { readAt: new Date() },
    });
  }
  // UNREAD COUNT
  async getUnreadCount(userId: string) {
    return {
      total: await this.prisma.message.count({
        where: { receiverId: userId, readAt: null, chatRoomId: null },
      }),
    };
  }

  // ADD THESE METHODS TO YOUR EXISTING MessagesService

  // DELETE SINGLE MESSAGE (only sender can delete)
  async deleteMessage(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { chatRoom: true },
    });

    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId)
      throw new ForbiddenException('Only sender can delete');

    // Soft delete: replace content + mark deleted
    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: 'This message was deleted',
        messageFiles: { deleteMany: {} }, // remove files
      },
    });

    return { success: true, message: 'Message deleted' };
  }

  // DELETE ENTIRE DM CONVERSATION (both sides)
  async deleteDMConversation(userId: string, otherUserId: string) {
    if (userId === otherUserId) throw new BadRequestException('Invalid user');

    await this.prisma.message.updateMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId },
        ],
      },
      data: {
        content: 'This conversation was cleared',
      },
    });

    return { success: true, message: 'DM conversation cleared' };
  }

  // CLEAR TEAM CHAT (Admin/Manager only)
  async clearTeamChat(teamId: string, userId: string) {
    const membership = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });

    if (!membership || !['admin', 'manager'].includes(membership.role))
      throw new ForbiddenException('Only admin/manager can clear team chat');

    const room = await this.prisma.chatRoom.findUnique({ where: { teamId } });
    if (!room) throw new NotFoundException('Team chat not found');

    await this.prisma.message.updateMany({
      where: { chatRoomId: room.id },
      data: {
        content: 'Chat was cleared by admin',
      },
    });

    return { success: true, message: 'Team chat cleared' };
  }
  // FETCH ALL CHATS (Sidebar: Teams + DMs) — LIKE TEAMS LEFT PANEL
  async getMyChats(userId: string) {
    // 1. Get all teams user is in (with last message)
    const teamChats = await this.prisma.chatRoom.findMany({
      where: {
        team: { members: { some: { userId } } },
      },
      include: {
        team: {
          select: { id: true, name: true, avatar: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { name: true } },
          },
        },
      },
      orderBy: { messages: { _count: 'desc' } }, // active first
    });

    // 2. Get recent DMs (unique conversations)
    const dmConversations = await this.prisma.message.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
        chatRoomId: null,
      },
      distinct: ['senderId', 'receiverId'],
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        receiver: { select: { id: true, name: true, avatar: true } },
      },
    });

    // Group DMs by partner
    const dmMap = new Map();
    dmConversations.forEach((msg) => {
      const partner = msg.senderId === userId ? msg.receiver! : msg.sender;
      if (!dmMap.has(partner.id)) {
        dmMap.set(partner.id, {
          type: 'dm',
          partner,
          lastMessage: msg,
          unreadCount: 0,
        });
      }
    });

    // Count unread for each DM
    for (const [partnerId, chat] of dmMap.entries()) {
      const unread = await this.prisma.message.count({
        where: {
          receiverId: userId,
          senderId: partnerId,
          readAt: null,
          chatRoomId: null,
        },
      });
      (chat as any).unreadCount = unread;
    }

    return {
      teams: teamChats.map((c) => ({
        type: 'team',
        teamId: c.team.id,
        teamName: c.team.name,
        teamAvatar: c.team.avatar,
        lastMessage: c.messages[0] || null,
        unreadCount: 0, // you can add team unread later
      })),
      dms: Array.from(dmMap.values()),
    };
  }

  // FETCH MESSAGES IN A CHANNEL OR DM — WITH THREADS
  async getChannelMessages(
    userId: string,
    channelId: string,
    options: { limit?: number; before?: string } = {},
  ) {
    const { limit = 30, before } = options;

    const where: any = { chatRoomId: channelId };
    if (before) where.id = { lt: before };

    const messages = await this.prisma.message.findMany({
      where,
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        messageFiles: true,
        
        replyTo: { include: { sender: { select: { name: true } } } },
        replies: {
          take: 2, // preview
          orderBy: { createdAt: 'desc' },
          include: { sender: { select: { name: true } } },
        },
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Mark as read
    const toMark = messages
      .filter((m) => m.receiverId === userId && !m.readAt)
      .map((m) => m.id);

    if (toMark.length > 0) {
      await this.prisma.message.updateMany({
        where: { id: { in: toMark } },
        data: { readAt: new Date() },
      });
    }

    return messages.reverse();
  }

  // FETCH DM MESSAGES
  async getDMMessages(
    userId: string,
    otherUserId: string,
    options: { limit?: number; before?: string } = {},
  ) {
    const { limit = 30, before } = options;

    const where: any = {
      OR: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId },
      ],
      chatRoomId: null,
    };
    if (before) where.id = { lt: before };

    const messages = await this.prisma.message.findMany({
      where,
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        messageFiles: true,
        
        replyTo: { include: { sender: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Mark as read
    await this.prisma.message.updateMany({
      where: { receiverId: userId, readAt: null },
      data: { readAt: new Date() },
    });

    return messages.reverse();
  }
}
