// src/socket/chat.gateway.ts → FINAL 2025 ETHIOPIA STANDARD
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';

interface AuthenticatedSocket extends Socket {
  user: { id: string; name: string; email: string; avatar?: string | null };
}

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: 'chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('ChatGateway');

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private messagesService: MessagesService,
  ) {}

  // CONNECT: Authenticate + Join all rooms
  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        client.emit('error', { message: 'Token required' });
        client.disconnect();
        return;
      }

      const payload = this.jwt.verify(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true, email: true, avatar: true },
      });

      if (!user) {
        client.disconnect();
        return;
      }

      client.user = user;
      client.join(`user_${user.id}`);

      // Join all team rooms
      const teams = await this.prisma.teamMember.findMany({
        where: { userId: user.id },
        select: { teamId: true },
      });
      teams.forEach((t) => client.join(t.teamId));

      this.logger.log(`User ${user.name} connected → ${client.id}`);
      this.server.to(`user_${user.id}`).emit('status', { online: true });
    } catch (err) {
      client.emit('error', { message: 'Invalid token' });
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.user) {
      this.server
        .to(`user_${client.user.id}`)
        .emit('status', { online: false });
      this.logger.log(`User ${client.user.name} disconnected`);
    }
  }

  // JOIN A TEAM CHAT ROOM
  @SubscribeMessage('joinTeam')
  handleJoinTeam(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() teamId: string,
  ) {
    client.join(teamId);
    client.emit('joinedTeam', { teamId });
  }

  // SEND MESSAGE (UNIFIED — uses your new sendMessage)
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
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
    const message = await this.messagesService.sendMessage(
      client.user.id,
      payload,
    );

    if (payload.type === 'team' && payload.teamId) {
      // Broadcast to team
      this.server.to(payload.teamId).emit('newMessage', {
        ...message,
        sender: {
          id: client.user.id,
          name: client.user.name,
          avatar: client.user.avatar,
        },
      });
    } else if (payload.type === 'dm' && payload.receiverId) {
      // Send to sender
      client.emit('newMessage', message);

      // Send to receiver if online
      this.server.to(`user_${payload.receiverId}`).emit('newMessage', message);
    }
  }

  // TYPING INDICATOR (Team)
  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      type: 'team' | 'dm';
      teamId?: string;
      receiverId?: string;
      isTyping: boolean;
    },
  ) {
    const event = data.type === 'team' ? 'userTypingTeam' : 'userTypingDM';
    const room = data.type === 'team' ? data.teamId : `user_${data.receiverId}`;

    if (room) {
      client.to(room).emit(event, {
        userId: client.user.id,
        name: client.user.name,
        avatar: client.user.avatar,
        isTyping: data.isTyping,
      });
    }
  }

  // MARK MESSAGE AS READ
  @SubscribeMessage('markRead')
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() messageId: string,
  ) {
    try {
      await this.messagesService.markAsRead(messageId, client.user.id);
      this.server.emit('messageRead', { messageId, readBy: client.user.id });
    } catch (err) {
      client.emit('error', { message: 'Failed to mark as read' });
    }
  }

  // DELETE MESSAGE (Broadcast delete)
  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() messageId: string,
  ) {
    await this.messagesService.deleteMessage(messageId, client.user.id);

    // Broadcast to all relevant rooms
    this.server.emit('messageDeleted', { messageId });
  }

  // CLEAR CHAT (DM or Team)
  @SubscribeMessage('clearChat')
  async handleClearChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: { type: 'team' | 'dm'; teamId?: string; otherUserId?: string },
  ) {
    if (data.type === 'team' && data.teamId) {
      await this.messagesService.clearTeamChat(data.teamId, client.user.id);
      this.server.to(data.teamId).emit('chatCleared', { teamId: data.teamId });
    } else if (data.type === 'dm' && data.otherUserId) {
      await this.messagesService.deleteDMConversation(
        client.user.id,
        data.otherUserId,
      );
      const room1 = `user_${client.user.id}`;
      const room2 = `user_${data.otherUserId}`;
      this.server
        .to([room1, room2])
        .emit('chatCleared', { otherUserId: data.otherUserId });
    }
  }
}
