import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, PrismaService, NotificationsService],
  exports: [TasksService],
})
export class TasksModule {}
