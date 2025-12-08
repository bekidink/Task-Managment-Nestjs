// src/messages/messages.controller.ts
import {
  Controller,
  Post,
  Get,
  Query,
  Param,
  Body,
  Req,
  UseGuards,
  Delete,
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

  @Post()
  @ApiOperation({ summary: 'Send message (team or DM)' })
  send(@Req() req: any, @Body() body: any) {
    return this.messagesService.sendMessage(req.user.userId, body);
  }

  @Get('conversation')
  @ApiOperation({ summary: 'Get conversation' })
  getConversation(@Req() req: any, @Query() query: any) {
    return this.messagesService.getConversation(req.user.userId, query);
  }
  @Get('my-chats')
  async getMyChats(@Req() req: any) {
    return this.messagesService.getMyChats(req.user.userId);
  }

  @Get('channel/:channelId')
  async getChannel(
    @Param('channelId') channelId: string,
    @Query() q: any,
    @Req() req: any,
  ) {
    return this.messagesService.getChannelMessages(
      req.user.userId,
      channelId,
      q,
    );
  }

  @Get('dm/:otherUserId')
  async getDM(
    @Param('otherUserId') otherUserId: string,
    @Query() q: any,
    @Req() req: any,
  ) {
    return this.messagesService.getDMMessages(req.user.userId, otherUserId, q);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Get message by ID' })
  getById(@Param('id') id: string, @Req() req: any) {
    return this.messagesService.getMessageById(id, req.user.userId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search messages' })
  search(@Req() req: any, @Query('q') q: string) {
    return this.messagesService.searchMessages(req.user.userId, q);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread count' })
  getUnreadCount(@Req() req: any) {
    return this.messagesService.getUnreadCount(req.user.userId);
  }
  // ADD THESE TO YOUR EXISTING MessagesController

  @Delete(':id')
  @ApiOperation({ summary: 'Delete your own message' })
  async deleteMessage(@Param('id') id: string, @Req() req: any) {
    return this.messagesService.deleteMessage(id, req.user.userId);
  }

  @Delete('dm/:otherUserId')
  @ApiOperation({ summary: 'Clear entire DM conversation' })
  async deleteDM(@Param('otherUserId') otherUserId: string, @Req() req: any) {
    return this.messagesService.deleteDMConversation(
      req.user.userId,
      otherUserId,
    );
  }

  @Delete('team/:teamId')
  @ApiOperation({ summary: 'Clear team chat (admin/manager only)' })
  async clearTeamChat(@Param('teamId') teamId: string, @Req() req: any) {
    return this.messagesService.clearTeamChat(teamId, req.user.userId);
  }
}
