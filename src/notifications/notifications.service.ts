import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo();

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  // MAIN: Send Push + Save In-App Notification
  async send(
    userId: string,
    title: string,
    body: string,
    data: any = {},
    type: 'TASK_ASSIGNED' | 'MENTION' | 'COMMENT' | 'INVITE' | 'MESSAGE'|"DONE",
  ) {
    // Save in-app notification
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title,
        message: body,
        type,
        data,
      },
    });

    // Send Expo Push (if user has token)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { expoPushToken: true },
    });

    if (user?.expoPushToken && Expo.isExpoPushToken(user.expoPushToken)) {
      const message: ExpoPushMessage = {
        to: user.expoPushToken,
        sound: 'default',
        title,
        body,
        data: { ...data, notificationId: notification.id },
      };

      try {
        const receipts = await expo.sendPushNotificationsAsync([message]);
        console.log('Push sent:', receipts);
      } catch (error) {
        console.error('Push failed:', error);
      }
    }

    return notification;
  }

  // Get user's notifications
  async getMyNotifications(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, read: unreadOnly ? false : undefined },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // Mark as read
  async markAsRead(userId: string, notificationId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }

  // Mark all as read
  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  // Count unread
  async countUnread(userId: string) {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  // Helper: Send to multiple users
  async sendToMany(userIds: string[], title: string, body: string, data = {}) {
    for (const userId of userIds) {
      await this.send(userId, title, body, data, 'MESSAGE');
    }
  }
}
