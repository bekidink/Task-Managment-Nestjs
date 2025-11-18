import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateNotificationDto) {
    const { userId, taskId, sendPush = true, data, ...rest } = dto;

    const notification = await this.prisma.notification.create({
      data: {
        ...rest,
        userId, // ← scalar field (MongoDB style)
        taskId: taskId || null, // ← scalar field, not relation object
        data: data || undefined,
      },
      include: { task: true, user: true },
    });

    if (sendPush) {
      await this.sendPush(userId, dto.title, dto.message, data);
    }

    return notification;
  }

  async findByUser(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly && { read: false }) },
      orderBy: { createdAt: 'desc' },
      include: { task: true },
    });
  }

  async markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  private async sendPush(
    userId: string,
    title: string,
    message: string,
    data?: Record<string, any>,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { expoPushToken: true },
    });

    if (!user?.expoPushToken) return;

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: user.expoPushToken,
          title,
          body: message,
          data: data || {},
          sound: 'default',
          priority: 'high',
        }),
      });
    } catch (error) {
      console.error('Push notification failed', error);
    }
  }
}
