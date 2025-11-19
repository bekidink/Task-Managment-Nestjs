import {
  Controller,
  Get,
  Patch,
  Param,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private noti: NotificationsService) {}

  @Get()
  getMy(@Req() req: any, @Query('unread') unread?: string) {
    return this.noti.getMyNotifications(req.user.userId, unread === 'true');
  }

  @Get('count')
  countUnread(@Req() req: any) {
    return this.noti.countUnread(req.user.userId);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @Req() req: any) {
    return this.noti.markAsRead(req.user.userId, id);
  }

  @Patch('read-all')
  markAllAsRead(@Req() req: any) {
    return this.noti.markAllAsRead(req.user.userId);
  }
}
