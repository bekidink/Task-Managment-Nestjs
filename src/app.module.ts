import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule'; // optional: for recurring tasks

// Prisma
import { PrismaModule } from './prisma/prisma.module';

// Auth & Security
import { AuthModule } from './auth/auth.module';

// Core Modules
import { UsersModule } from './users/users.module';
import { TeamsModule } from './teams/teams.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { MessagesModule } from './messages/messages.module';
import { FilesModule } from './files/files.module';
import { InvitesModule } from './invites/invites.module';
import { NotificationsModule } from './notifications/notifications.module';

// Real-time
import { ChatGateway } from './gateways/chat.gateway';

@Module({
  imports: [
    // Global config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Optional: for cron jobs (recurring tasks, cleanup)
    ScheduleModule.forRoot(),

    // Database
    PrismaModule,

    // Features
    AuthModule,
    UsersModule,
    TeamsModule,
    ProjectsModule,
    TasksModule,
    MessagesModule,
    FilesModule,
    InvitesModule,
    NotificationsModule,
  ],
  controllers: [],
  providers: [
    // Register WebSocket Gateway globally
    ChatGateway,
  ],
})
export class AppModule {}
