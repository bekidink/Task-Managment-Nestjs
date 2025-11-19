import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';

interface AuthenticatedSocket extends Socket {
  user: { id: string; email: string; name: string; avatar?: string | null };
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

  // CONNECT: Authenticate + Join user's teams
  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.split(' ')[1];
      if (!token) {
        client.emit('error', { message: 'No token provided' });
        client.disconnect();
        return;
      }

      const payload = this.jwt.verify(token, {
        secret: process.env.JWT_SECRET,
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true, email: true, avatar: true },
      });

      if (!user) {
        client.disconnect();
        return;
      }

      client.user = user;
      client.join(`user_${user.id}`); // For DMs & notifications

      // Join all team rooms user belongs to
      const teams = await this.prisma.teamMember.findMany({
        where: { userId: user.id },
        select: { teamId: true },
      });

      teams.forEach((t) => client.join(t.teamId));

      this.logger.log(`User ${user.name} connected → ${client.id}`);
      this.server.to(`user_${user.id}`).emit('status', { online: true });
    } catch (error) {
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

  // JOIN TEAM CHAT
  @SubscribeMessage('joinTeam')
  handleJoinTeam(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() teamId: string,
  ) {
    client.join(teamId);
    client.emit('joinedTeam', { teamId });
  }

  // SEND TEAM MESSAGE
  @SubscribeMessage('sendTeamMessage')
  async handleTeamMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { teamId: string; content: string; files?: any[] },
  ) {
    const message = await this.messagesService.sendGroup(
      data.teamId,
      client.user.id,
      data.content,
      data.files,
    );

    this.server.to(data.teamId).emit('newMessage', {
      ...message,
      sender: {
        id: client.user.id,
        name: client.user.name,
        avatar: client.user.avatar,
      },
    });
  }

  // SEND DIRECT MESSAGE
  @SubscribeMessage('sendDM')
  async handleDM(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { receiverId: string; content: string; files?: any[] },
  ) {
    const message = await this.messagesService.sendDM(
      client.user.id,
      data.receiverId,
      data.content,
      data.files,
    );

    // Send to sender
    client.emit('newDM', message);

    // Send to receiver if online
    this.server.to(`user_${data.receiverId}`).emit('newDM', message);
  }

  // TYPING INDICATOR (Team)
  @SubscribeMessage('typingTeam')
  handleTypingTeam(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { teamId: string; isTyping: boolean },
  ) {
    client.to(data.teamId).emit('userTyping', {
      userId: client.user.id,
      name: client.user.name,
      isTyping: data.isTyping,
    });
  }

  // TYPING INDICATOR (DM)
  @SubscribeMessage('typingDM')
  handleTypingDM(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { receiverId: string; isTyping: boolean },
  ) {
    this.server.to(`user_${data.receiverId}`).emit('userTypingDM', {
      senderId: client.user.id,
      name: client.user.name,
      isTyping: data.isTyping,
    });
  }

  // MARK MESSAGE AS READ
  @SubscribeMessage('markRead')
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() messageId: string,
  ) {
    await this.messagesService.markAsRead(messageId, client.user.id);
    this.server.to(`user_${client.user.id}`).emit('messageRead', { messageId });
  }
}
