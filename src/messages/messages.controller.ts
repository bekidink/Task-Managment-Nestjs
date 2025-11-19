import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('messages')
@ApiBearerAuth()
@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  // Send Group Message
  @Post('team/:teamId')
  @ApiOperation({ summary: 'Send message to team chat' })
  sendGroup(
    @Param('teamId') teamId: string,
    @Req() req: any,
    @Body() body: { content: string; files?: any[] },
  ) {
    return this.messagesService.sendGroup(
      teamId,
      req.user.userId,
      body.content,
      body.files,
    );
  }

  // Send Direct Message
  @Post('dm/:receiverId')
  @ApiOperation({ summary: 'Send direct message' })
  sendDM(
    @Param('receiverId') receiverId: string,
    @Req() req: any,
    @Body() body: { content: string; files?: any[] },
  ) {
    return this.messagesService.sendDM(
      req.user.userId,
      receiverId,
      body.content,
      body.files,
    );
  }

  // Get Team Chat
  @Get('team/:teamId')
  @ApiOperation({ summary: 'Get team chat history' })
  getTeamMessages(
    @Param('teamId') teamId: string,
    @Req() req: any,
    @Query('limit') limit?: number,
    @Query('before') before?: string,
  ) {
    return this.messagesService.getTeamMessages(
      teamId,
      req.user.userId,
      limit,
      before,
    );
  }

  // Get DMs
  @Get('dm/:otherUserId')
  @ApiOperation({ summary: 'Get direct messages with user' })
  getDMs(
    @Param('otherUserId') otherUserId: string,
    @Req() req: any,
    @Query('limit') limit?: number,
    @Query('before') before?: string,
  ) {
    return this.messagesService.getDMs(
      req.user.userId,
      otherUserId,
      limit,
      before,
    );
  }

  // Mark as Read
  @Post(':id/read')
  @ApiOperation({ summary: 'Mark message as read' })
  markAsRead(@Param('id') id: string, @Req() req: any) {
    return this.messagesService.markAsRead(id, req.user.userId);
  }

  // Delete Message
  @Delete(':id')
  @ApiOperation({ summary: 'Delete your own message' })
  deleteMessage(@Param('id') id: string, @Req() req: any) {
    return this.messagesService.deleteMessage(id, req.user.userId);
  }
}
