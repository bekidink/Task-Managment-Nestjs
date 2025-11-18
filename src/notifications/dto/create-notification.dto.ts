import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { NotificationType } from '@prisma/client';

export class CreateNotificationDto {
  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  data?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  sendPush?: boolean = true;
}
