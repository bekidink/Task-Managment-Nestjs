import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updatePushToken(userId: string, expoPushToken: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken },
    });
  }
}
